'use strict';
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {onRequest}=require('firebase-functions/v2/https');
const {initializeApp}=require('firebase-admin/app');
const {getFirestore,FieldPath}=require('firebase-admin/firestore');
const {logger}=require('firebase-functions');
const L=require('./logic');
const H=require('./history');
const R=require('./recounts');
const A=require('./analytics');
const S=require('./seasonal');
const {health,statusCacheSeconds,occupancyEstimate}=require('./health');
const F=require('./feedback');
const P=require('./product');
const {getAuth}=require('firebase-admin/auth');
const {createHash}=require('node:crypto');
initializeApp();
const db=getFirestore();
const REGION='us-east1';
const TRACKER_ORIGIN='https://climbtheknot.live';
// Explicitly use the runtime identity already authorized for GitHub deployments.
// Gen 2 otherwise defaults to the Compute Engine account, which caused 403 ActAs errors.
const RUNTIME_SERVICE_ACCOUNT='theknotcapacity@appspot.gserviceaccount.com';
const ENDPOINT='https://climbtheknot.com/api/capacity.json';
const STATUS=db.collection('system').doc('current');
const WEEKLY=db.collection('system').doc('weekly');
const SEASONAL=db.collection('system').doc('seasonalModel');

// One scheduled check per minute. Closed hours do not contact the gym endpoint.
exports.collectOccupancy=onSchedule({schedule:'* * * * *',timeZone:L.TZ,region:REGION,
 memory:'256MiB',timeoutSeconds:45,maxInstances:1,serviceAccount:RUNTIME_SERVICE_ACCOUNT},async()=>{
 const now=new Date(),p=L.parts(now),open=L.openNow(p);
 if(!open){
  await STATUS.set({...L.crowd(null,false),open:false,count:null,trend:'closed',trendLabel:'CLOSED HOURS',
   trendPer30:null,forecast:null,updated:now.toISOString(),sourceUpdated:null},{merge:true});
  return;
 }
 const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),8000);
 let count;
 try{
  const res=await fetch(ENDPOINT,{headers:{Accept:'application/json'},signal:ctrl.signal});
  if(!res.ok)throw Error(`Source HTTP ${res.status}`);
  const body=await res.json();
  if(body.ok!==true||typeof body.currentCapacity!=='number'||!Number.isFinite(body.currentCapacity))throw Error('Invalid source payload');
  if(body.currentCapacity<0)throw Error('Negative source occupancy');
  count=Math.round(body.currentCapacity); // counts >100 are valid observations; 100 is a policy reference
 }catch(e){logger.error('Source unavailable; retaining prior reading rather than claiming a new live count',e);
  await STATUS.set({error:String(e.message||e),sourceErrorAt:now.toISOString()},{merge:true});return;
 }finally{clearTimeout(timer);}
 const minuteId=`${p.day}_${String(p.hour).padStart(2,'0')}${String(p.minute).padStart(2,'0')}`;
 const dayRef=db.collection('days').doc(p.day);
 await db.runTransaction(async tx=>{
  const [prevSnap,daySnap,weeklySnap,modelSnap]=await Promise.all([
   tx.get(STATUS),tx.get(dayRef),tx.get(WEEKLY),tx.get(SEASONAL)]);
  if(prevSnap.exists&&prevSnap.data().lastMinuteId===minuteId)return; // retry-safe once per minute
  const old=prevSnap.exists?prevSnap.data():{},day=daySnap.exists?daySnap.data():{points:[]};
  const weekly=weeklySnap.exists?weeklySnap.data():{total:0,started:now.toISOString()};
  const oldRecent=(old.recent||[]).filter(x=>now-Date.parse(x.timestamp)<50*60000);
  const rate=L.slope(oldRecent,now,count),direction=L.trend(rate,true);
  const priorPoint=oldRecent.length?oldRecent[oldRecent.length-1]:null;
  const correction=R.update(old.recountModel||{},priorPoint,count,now);
  const nextWeekly=L.addWeekly(weekly,p,count);
  const model=modelSnap.exists?modelSnap.data():null;
  // Staff recounts provide calibration labels; raw drop sizes are NOT departures.
  // Keep current source count as the visible, continuous anchor of the chart.
  const projection=model?.seasonal?.days>=3&&model.seasonal.recounts>=6?
   S.project(count,rate,model.seasonal,now,model.calibration):
   L.forecast(count,rate,nextWeekly,now,null);
  const sample={timestamp:now.toISOString(),count};
  const status={...L.crowd(count,true),open:true,count,trend:direction.key,trendLabel:direction.label,trendArrow:direction.arrow,
   trendPer30:rate,forecast:projection,updated:now.toISOString(),sourceUpdated:now.toISOString(),
   lastLogged:now.toISOString(),lastMinuteId:minuteId,recent:[...oldRecent,sample].slice(-50),
   recountModel:correction.state,estimatedNow:correction.estimatedNow,
   estimateBasis:correction.estimateBasis,estimateAgeMinutes:correction.estimateAgeMinutes,
   isPossibleRecount:correction.isReset,lastRecountCandidateAt:correction.event?now.toISOString():old.lastRecountCandidateAt||null,error:null};
  const updatedPoints=[...(day.points||[]),sample];
  tx.set(dayRef,{date:p.day,points:updatedPoints,updated:now.toISOString()});
  // Store compact summaries and frozen predictions once per quarter-hour.
  if(p.minute%15===0){
   const summary=A.compactDay(p.day,updatedPoints);
   tx.set(db.collection('dailySummaries').doc(p.day),summary);
   const frozen=A.snapshot(p.day,now,count,projection);
   if(frozen)tx.set(db.collection('forecastSnapshots').doc(minuteId),frozen);
  }
  if(correction.event){
   // Stable episode ID: subsequent downward steps replace the same event.
   const id=p.day+'_'+Date.parse(correction.event.startTimestamp);
   tx.set(db.collection('recountEvents').doc(id),correction.event);
  }
  tx.set(WEEKLY,{...nextWeekly,total:(weekly.total||0)+1});
  tx.set(STATUS,status);
 });
});

// The only public API. Firestore itself is not client-readable.
// Firebase Hosting rewrites /api/status to this function on the same domain.
exports.getOccupancy=onRequest({region:REGION,memory:'256MiB',timeoutSeconds:20,
 maxInstances:3,invoker:'public',serviceAccount:RUNTIME_SERVICE_ACCOUNT},async(req,res)=>{
 res.set('Cache-Control','no-store').set('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.status(405).json({ok:false,error:'GET only'});return;}
 try{
  const now=new Date(),p=L.parts(now);
  const [s,d,w,a]=await Promise.all([STATUS.get(),db.collection('days').doc(p.day).get(),WEEKLY.get(),db.collection('system').doc('forecastAccuracy').get()]);
  if(!s.exists){res.status(503).set('Cache-Control','no-store').json({ok:false,error:'No reading exists yet. Check that collectOccupancy is deployed, enabled, and running in Firebase Scheduler.'});return;}
  const status=s.data(),weekly=w.exists?w.data():{};
  const response=L.summarize(status,d.exists?d.data():{},weekly,now);
  // Schedule and collection health are independent. A failed opening/closing
  // collector must never make yesterday's CLOSED/OPEN state look current.
  const runtime=health(status,now);
  response.open=runtime.scheduledOpen;
  if(!runtime.scheduledOpen){
   response.count=null;response.level='closed';response.label='CLOSED';
   response.forecast=null;response.trend='closed';
  }
  const scored=a.exists?a.data():null;
  const activeVersion=response.forecast?.modelVersion||'v3-recount-provisional';
  response.forecastAccuracy=scored?.model===activeVersion?scored:null;
  response.recounts=R.groupDrops(response.todayHistory||[]);
  // Only expose a same-day inferred recount, never treat it as a verified staff count.
  const last=response.recounts.at(-1);
  response.lastInferredRecount=last?{count:last.count,timestamp:last.timestamp,verified:false}:null;
  response.occupancyEstimate=occupancyEstimate(status,last,runtime.state,now,response.typicalNow);
  // Preserve legacy fields for existing widgets; new UI uses the explicit estimate.
  if(runtime.state==='live'&&Number.isFinite(response.count))Object.assign(response,L.crowd(response.count,true));
  // Display a warning if source readings are old. Never silently claim LIVE.
  response.sourceAgeMinutes=runtime.sourceAgeMinutes;
  response.dataState=runtime.state;
  response.fresh=response.dataState==='live';
  response.lastSourceErrorAt=status.sourceErrorAt||null;
  response.sourceHealth=status.error?'fetch_failed':'ok';
  // Do not expose collector internals or raw upstream error strings.
  delete response.recountModel;delete response.error;delete response.lastMinuteId;
  response.ok=true; // A delayed response is valid JSON: render its warning, not an API error.
  // Normalize older persisted LEARNING states for widgets and the web client.
  if(response.dataState==='live'){
   const direction=L.trend(Number.isFinite(status.trendPer30)?status.trendPer30:null,true);
   response.trend=direction.key;response.trendLabel=direction.label;response.trendArrow=direction.arrow;
  }
  response.bestTimes=L.best(weekly,now,response.dataState==='live'?status.forecast:null,status.sourceUpdated);
  if(response.dataState!=='live'){response.forecast=null;response.trendPer30=null;response.trendLabel='DATA NOT LIVE';response.trendArrow=null;}
  if(response.dataState==='delayed')response.warning='Source reading delayed; last known count only.';
  if(runtime.scheduledOpen&&!status.open)response.warning='Collector has not reported an open-hours reading. Displaying stale data status.';
  if(response.dataState==='offline')response.warning='Source unavailable; last known count is not reliable.';
  if(status.error&&response.dataState!=='closed')response.warning=(response.warning||'')+' Source fetch failed.';
  const servedAt=new Date();
  const sameMinute=Math.floor(now.getTime()/60000)===Math.floor(servedAt.getTime()/60000);
  const cacheSeconds=sameMinute?statusCacheSeconds(status,runtime.state,servedAt):0;
  if(cacheSeconds>0)res.set('Cache-Control','public, max-age=0, s-maxage='+cacheSeconds);
  res.json(response);
 }catch(e){logger.error('GET status failed',e);res.status(503).set('Cache-Control','no-store').json({ok:false,error:'Backend could not read occupancy from Firestore. Check function logs and Firestore permissions.'});}
});

// Public read-only, occupancy-only date selection API.
// Never expose Firestore document metadata, credentials, or unbounded scans.
exports.getHistory=onRequest({region:REGION,memory:'256MiB',timeoutSeconds:20,
 maxInstances:3,invoker:'public',serviceAccount:RUNTIME_SERVICE_ACCOUNT},async(req,res)=>{
 res.set('Cache-Control','no-store');
 res.set('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.status(405).json({ok:false,error:'GET only'});return;}
 const date=req.query.date,today=L.parts(new Date()).day;
 if(!H.dateOnly(date)){res.status(400).json({ok:false,error:'Use a valid date in YYYY-MM-DD format.'});return;}
 const days=(Date.parse(date+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000;
 if(days< -120||days>30){res.status(400).json({ok:false,error:'Choose a date within the past 120 days or next 30 days.'});return;}
 try{
  let response;
  if(days<=0){
   const doc=await db.collection('days').doc(date).get();
   response=H.historical(doc.exists?doc.data():{points:[]},date);
  }else{
   const model=await SEASONAL.get();
   const trained=model.exists?model.data():null;
   const season=trained?.seasonal;
   if(season?.days>=3&&season.recounts>=6)response=S.futureDay(date,season);
   // A trained model can have no supported observations for a particular
   // weekday/hour; in that case preserve the historical source-based fallback.
   if(!response?.points?.length||response.points.some(p=>p.count===null)){
    const lower=new Date(Date.parse(today+'T12:00:00Z')-60*86400000).toISOString().slice(0,10);
    const summaries=await db.collection('dailySummaries').orderBy(FieldPath.documentId()).startAt(lower).endBefore(today).limit(60).get();
    let records=summaries.docs.map(d=>({...d.data(),date:d.id}));
    if(records.length<3){
     const old=await db.collection('days').orderBy(FieldPath.documentId()).startAt(lower).endBefore(today).limit(60).get();
     records=old.docs.map(d=>({...d.data(),date:d.id}));
    }
    const fallback=H.future(date,records);
    response=H.fillForecastGaps(response,fallback);
   }
  }
  res.json({ok:true,...response});
 }catch(err){
  logger.error('getHistory failed',err);
  res.status(503).json({ok:false,error:'Unable to read historical observations right now.'});
 }
});

// Runs after midnight. Save out-of-sample scores without altering earlier forecasts.
exports.scoreOccupancyForecasts=onSchedule({schedule:'15 2 * * *',timeZone:L.TZ,
 region:REGION,memory:'256MiB',timeoutSeconds:90,maxInstances:1,serviceAccount:RUNTIME_SERVICE_ACCOUNT},async()=>{
 const today=L.parts(new Date()).day;
 const yesterday=new Date(today+'T12:00:00Z');
 yesterday.setUTCDate(yesterday.getUTCDate()-1);
 const date=yesterday.toISOString().slice(0,10);
 const [raw,snaps,events]=await Promise.all([
  db.collection('days').doc(date).get(),
  db.collection('forecastSnapshots').where('date','==',date).get(),
  db.collection('recountEvents').orderBy(FieldPath.documentId()).startAt(date+'_').endAt(date+'_\uf8ff').get()
 ]);
 // The event range above is UTC-based. A dated document prefix is more robust
 // around DST and local-day boundaries; filter by local date as a safeguard.
 const snapshots=snaps.docs.map(x=>x.data()).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
 const recounts=events.docs.map(x=>x.data()).filter(x=>L.parts(new Date(x.timestamp)).day===date);
 const points=raw.exists?raw.data().points||[]:[];
 const versions=[...new Set(snapshots.map(s=>s.modelVersion||'v3-recount-provisional'))];
 const scores=Object.fromEntries(versions.map(v=>[v,A.scoreDay(points,snapshots,recounts,v)]));
 const active=versions.at(-1)||'v3-recount-provisional';
 const scored=scores[active]||A.scoreDay(points,[],recounts,active);
 const updated=new Date().toISOString();
 const batch=db.batch();
 batch.set(db.collection('forecastScores').doc(date),{...scored,byModel:scores,date,updated});
 batch.set(db.collection('system').doc('forecastAccuracy'),{...scored,date,updated});
 await batch.commit();
 logger.info('Scored daily forecasts',{date,snapshots:snapshots.length,observations:points.length});
});

/**
 * Retrains once per day using previously completed days. The 60-day horizon
 * is bounded; no partial current day or future date can leak into training.
 * Backtests walk forward by full day and score later recount endings.
 */
exports.trainSeasonalForecast=onSchedule({schedule:'20 4 * * *',timeZone:L.TZ,
 region:REGION,memory:'512MiB',timeoutSeconds:240,maxInstances:1,serviceAccount:RUNTIME_SERVICE_ACCOUNT},async()=>{
 const now=new Date(),today=L.parts(now).day;
 const lower=new Date(Date.parse(today+'T12:00:00Z')-65*86400000).toISOString().slice(0,10);
 const dayDocs=await db.collection('days').orderBy(FieldPath.documentId()).startAt(lower).endBefore(today).limit(65).get();
 const records=dayDocs.docs.map(d=>({...d.data(),date:d.id})).filter(d=>Array.isArray(d.points)&&d.points.length);
 const seasonal=S.train(records,now);
 const calibration=S.backtest(records,now);
 await SEASONAL.set({seasonal,calibration,updatedAt:now.toISOString(),recordDays:records.length});
 logger.info('Seasonal model trained',{recordDays:records.length,recounts:seasonal.recounts,
  calibratedHorizons:Object.values(calibration.horizons).filter(x=>x.p80!==null).length});
});

 // Anonymous, write-only feedback. Global and browser quotas bound Firestore spend.
exports.submitFeedback=onRequest({region:REGION,memory:'256MiB',timeoutSeconds:15,
 maxInstances:2,invoker:'public',serviceAccount:RUNTIME_SERVICE_ACCOUNT},async(req,res)=>{
 res.set('Cache-Control','no-store').set('X-Content-Type-Options','nosniff');
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'POST only'});
 if(req.get('origin')!==TRACKER_ORIGIN)return res.status(403).json({ok:false,error:'Use the tracker website.'});
 if(!req.is('application/json')||(req.rawBody?.length||0)>8192)return res.status(400).json({ok:false,error:'Invalid submission.'});
 let input;try{input=F.validateFeedback(req.body);}catch(e){return res.status(400).json({ok:false,error:e.message});}
 const now=new Date(),day=L.parts(now).day,global=db.collection('feedbackLimits').doc(day);
 const token=createHash('sha256').update(day+':'+input.clientId).digest('hex');
 const record=db.collection('memberFeedback').doc();
 try{
  const status=(await STATUS.get()).data()||{};
  if(input.report.kind==='crowd'&&!L.openNow(L.parts(now)))return res.status(400).json({ok:false,error:'Crowd reports are accepted during regular gym hours.'});
  const accepted=await db.runTransaction(async tx=>{
   const snap=await tx.get(global),q=snap.data()||{},clients=q.clients||{};
   const prev=clients[token]||0;
   if((q.total||0)>=200||now.getTime()-prev<10*60000)return false;
   tx.set(global,{total:(q.total||0)+1,clients:{...clients,[token]:now.getTime()}});
   tx.set(record,{...input.report,createdAt:now.toISOString(),context:F.context(status,now),reviewState:'unreviewed'});
   if(input.contact)tx.set(db.collection('feedbackContacts').doc(record.id),{contact:input.contact,consentAt:now.toISOString()});
   return true;
  });
  if(!accepted)return res.status(429).json({ok:false,error:'Please wait before submitting again.'});
  return res.status(201).json({ok:true});
 }catch(e){logger.error('Feedback write failed');return res.status(503).json({ok:false,error:'Feedback unavailable. Try again later.'});}
});

// Optional first-party analytics. Accept only known event names, UUIDs and broad channels.
// No IP address, exact URL, contact data or user preferences are stored.
exports.recordProductEvent=onRequest({region:REGION,memory:'256MiB',timeoutSeconds:15,maxInstances:2,invoker:'public',serviceAccount:RUNTIME_SERVICE_ACCOUNT},async(req,res)=>{
 res.set('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({ok:false});
 if(req.get('origin')!==TRACKER_ORIGIN)return res.status(403).json({ok:false});
 if(!req.is('application/json')||(req.rawBody?.length||0)>1024)return res.status(400).json({ok:false});
 let event;try{event=P.validateEvent(req.body);}catch{return res.status(400).json({ok:false});}
 const now=new Date(),day=L.parts(now).day,visitor=createHash('sha256').update(event.visitor).digest('hex'),session=createHash('sha256').update(event.session).digest('hex');
 const daily=db.collection('productDaily').doc(day),visitorRef=db.collection('productVisitors').doc(visitor),sessionRef=db.collection('productSessions').doc(session);
 const quota=db.collection('productEventLimits').doc(day+'_'+visitor);
 try{
  const result=await db.runTransaction(async tx=>{
   const [q,v,s,d]=await Promise.all([tx.get(quota),tx.get(visitorRef),tx.get(sessionRef),tx.get(daily)]);
   const limits=q.data()||{},current=d.data()||{},previous=v.data()||{};
   if((limits.total||0)>=100||(current.accepted||0)>=20000)return false;
   // Count a session only once. Deduplicate page_view for the same session.
   if(s.exists&&s.data().visitor!==visitor)return false;
   if(s.exists&&event.event==='page_view'&&s.data().pageView)return false;
   const isNew=!v.exists,newDay=previous.lastDay!==day,newSession=!s.exists;
   const next=P.aggregate(current,event,{isNew,newDay,newSession,returning:!isNew&&newDay&&previous.firstDay!==day});
   tx.set(daily,next);
   tx.set(visitorRef,{firstDay:previous.firstDay||day,lastDay:day,activeDays:(previous.activeDays||0)+(newDay?1:0),expiresAt:new Date(now.getTime()+90*86400000)});
   tx.set(sessionRef,{visitor,day,pageView:event.event==='page_view'||!!s.data()?.pageView,expiresAt:new Date(now.getTime()+7*86400000)});
   tx.set(quota,{total:(limits.total||0)+1,expiresAt:new Date(now.getTime()+2*86400000)});
   return true;
  });return res.status(result?201:429).json({ok:result});
 }catch(e){logger.error('Product analytics write failed');return res.status(503).json({ok:false});}
});
exports.getAdminDashboard=onRequest({region:REGION,memory:'256MiB',timeoutSeconds:20,maxInstances:2,invoker:'public',serviceAccount:RUNTIME_SERVICE_ACCOUNT},async(req,res)=>{
 res.set('Cache-Control','no-store').set('X-Content-Type-Options','nosniff');
 if(req.method!=='GET')return res.status(405).json({ok:false});
 const token=(req.get('Authorization')||'').match(/^Bearer (.+)$/)?.[1];
 if(!token)return res.status(401).json({ok:false,error:'Sign in first.'});
 try{const decoded=await getAuth().verifyIdToken(token,true);if(decoded.admin!==true)return res.status(403).json({ok:false,error:'Administrator access required.'});}
 catch{return res.status(401).json({ok:false,error:'Invalid or expired session.'});}
 try{
  const today=L.parts(new Date()).day;
  const recent=(collection,days)=>{
   const first=new Date(Date.parse(today+'T12:00:00Z')-(days-1)*86400000).toISOString().slice(0,10);
   return db.collection(collection).orderBy(FieldPath.documentId()).startAt(first).endAt(today).get();
  };
  const [daily,feedback,scores,current]=await Promise.all([
   recent('productDaily',30),
   db.collection('memberFeedback').orderBy('createdAt','desc').limit(50).get(),
   recent('forecastScores',14),
   STATUS.get()
  ]);
  const newestFirst=snapshot=>snapshot.docs.slice().reverse().map(doc=>({...doc.data(),date:doc.id}));
  return res.json({ok:true,daily:newestFirst(daily),feedback:feedback.docs.map(d=>P.feedbackView(d.data())),
   scores:newestFirst(scores),health:health(current.data()||{})});
 }catch(e){logger.error('Admin dashboard read failed');return res.status(503).json({ok:false,error:'Unable to load dashboard.'});}
});
