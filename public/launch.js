'use strict';
(()=>{
 const el=id=>document.getElementById(id),origin='https://climbtheknot.live/',production=location.origin===origin.slice(0,-1);
 const store={get(k){try{return localStorage.getItem(k);}catch{return null;}},set(k,v){try{localStorage.setItem(k,v);}catch{}},remove(k){try{localStorage.removeItem(k);}catch{}}};
 let messageTimer;
 function msg(text,url){
  const notice=el('toolStatus');
  notice.textContent=text;
  if(url){
   const anchor=document.createElement('a');anchor.href=url;anchor.textContent=url;
   notice.append(' ',anchor);
  }
  notice.hidden=false;clearTimeout(messageTimer);
  if(!url)messageTimer=setTimeout(()=>notice.hidden=true,6000);
 }
 let snapshot=null,session=null,visitor=null,ga=false;
 const consent=el('analyticsConsent'),consentKey='knot-analytics-consent',sessionKey='knot-session';
 const gaId=window.KNOT_CONFIG?.ga4;
 consent.checked=production&&store.get(consentKey)==='yes';
 consent.disabled=!production;
 const params=new URLSearchParams(location.search);
 const source=params.get('utm_source')||params.get('source');
 const channel=['share','print','installed'].includes(source)?source:
  document.referrer&&new URL(document.referrer).origin!==location.origin?'referral':'direct';
 function clearSession(){
  session=null;
  try{sessionStorage.removeItem(sessionKey);}catch{}
 }
 function analyticsStart(){
  if(!production||!consent.checked||visitor)return;
  visitor=store.get('knot-visitor')||crypto.randomUUID();store.set('knot-visitor',visitor);
  try{session=JSON.parse(sessionStorage.getItem(sessionKey)||'null');}catch{}
  if(gaId)window['ga-disable-'+gaId]=false;
  if(!ga&&/^G-[A-Z0-9]+$/.test(gaId||'')){
   ga=true;window.dataLayer=window.dataLayer||[];
   window.gtag=function(){window.dataLayer.push(arguments);};
   window.gtag('js',new Date());
   window.gtag('config',gaId,{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false});
   const script=document.createElement('script');script.async=true;
   script.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(gaId);document.head.append(script);
  }
  window.knotEvent('page_view');
 }
 function sendEvent(event){
  fetch('/api/event',{method:'POST',headers:{'Content-Type':'application/json'},keepalive:true,
   body:JSON.stringify({event,visitor,session:session.id,channel})}).catch(()=>{});
  if(ga)window.gtag('event',event,{channel,page_location:origin,page_referrer:''});
 }
 window.knotEvent=event=>{
  if(!production||!consent.checked||!visitor)return;
  const now=Date.now();
  if(session?.visitor!==visitor||typeof session.id!=='string'||!Number.isFinite(session.at)||now-session.at<0||now-session.at>=1800000){
   session={id:crypto.randomUUID(),visitor,at:now};
  }
  session.at=now;
  try{sessionStorage.setItem(sessionKey,JSON.stringify(session));}catch{}
  const last=store.get('knot-last-visit'),today=window.KnotExperience.parts(now).date;
  store.set('knot-last-visit',today);
  sendEvent(event);
  if(last&&last!==today)sendEvent('return_visit');
 };
 function analyticsStop(){
  if(gaId)window['ga-disable-'+gaId]=true;
  visitor=null;clearSession();store.remove('knot-visitor');store.remove('knot-last-visit');
 }
 consent.onchange=()=>{
  store.set(consentKey,consent.checked?'yes':'no');
  if(consent.checked)analyticsStart();
  else{analyticsStop();msg('Analytics disabled.');}
 };
 window.addEventListener('storage',event=>{
  if(!production||event.key!==consentKey)return;
  consent.checked=event.newValue==='yes';
  if(consent.checked)analyticsStart();
  else analyticsStop();
 });
 analyticsStart();
 el('resetLocal').onclick=()=>{
  analyticsStop();
  for(const key of ['knot-climb-preferences',consentKey,'knot-alert','knot-feedback-token','knot-alert-at'])store.remove(key);
  location.reload();
 };
 if('serviceWorker'in navigator&&production)navigator.serviceWorker.register('/sw.js').catch(()=>{});

 const link=origin+'?utm_source=share';
 const timestamp=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
 function usable(d){return d&&['live','delayed'].includes(d.dataState)&&Number.isFinite(d.count)&&Number.isFinite(Date.parse(d.sourceUpdated));}
 function buildImage(d){
  const c=document.createElement('canvas');c.width=900;c.height=720;const x=c.getContext('2d');
  x.fillStyle='#111613';x.fillRect(0,0,900,720);
  const write=(s,y,size,color='#e9eee9',weight=500)=>{x.fillStyle=color;x.font=weight+' '+size+'px system-ui';x.fillText(s,56,y);};
  const stamp=timestamp.format(new Date(d.sourceUpdated));
  write('THE KNOT',88,40,'#fff',750);write('REPORTED COUNT',156,30,'#afbdb1');
  write(String(d.count),388,230,'#fff',750);
  write(d.dataState==='live'?String(d.label||''): 'LAST KNOWN COUNT',470,40,d.dataState==='live'?(d.color||'#9fd39b'):'#f0c468',650);
  write('Recorded '+stamp,540,28,'#bfc9bf');x.fillStyle='#353e36';x.fillRect(56,578,788,2);
  write('climbtheknot.live',640,36,'#fff',650);write('Independent tracker · snapshot',684,24,'#bfc9bf');
  return new Promise(resolve=>c.toBlob(resolve,'image/png'));
 }
 let snapshotVersion=0;
 window.addEventListener('knot:status',e=>{
  const reading=e.detail,version=++snapshotVersion;
  snapshot=null;
  if(!usable(reading))return;
  buildImage(reading).then(blob=>{
   if(blob&&version===snapshotVersion)snapshot={blob,reading};
  }).catch(()=>{});
 });
 function download(blob){
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='knot-conditions.png';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 async function share(){
  // Use a finished image so the first share or clipboard call runs directly
  // in the tap handler, including on Safari. Share the link if it isn't ready.
  const img=snapshot,reading=img?.reading;
  const text=reading?'The Knot: '+reading.count+' reported people · '+timestamp.format(new Date(reading.sourceUpdated)):
   'Check the crowd at The Knot';
  const payload={title:'Knot Capacity',text,url:link};
  window.knotEvent('share_initiated');
  try{
   if(img&&navigator.share&&navigator.canShare&&typeof File==='function'){
    const files=[new File([img.blob],'knot-conditions.png',{type:'image/png'})];
    if(navigator.canShare({...payload,files})){
     await navigator.share({...payload,files});
     msg('Conditions shared.');
     return;
    }
   }
   if(img&&navigator.clipboard?.write&&typeof ClipboardItem!=='undefined'){
    await navigator.clipboard.write([new ClipboardItem({
     'image/png':img.blob,'text/plain':new Blob([text+' · '+link],{type:'text/plain'})
    })]);
    msg('Image and link copied.');
    return;
   }
   if(navigator.share){
    await navigator.share(payload);
    if(img)download(img.blob);
    msg(img?'Link shared and image downloaded.':'Link shared.');
    return;
   }
   if(navigator.clipboard?.writeText){
    await navigator.clipboard.writeText(link);
    if(img)download(img.blob);
    msg(img?'Link copied and image downloaded.':'Link copied.');
    return;
   }
  }catch(error){if(error.name==='AbortError')return;}
  if(img)download(img.blob);
  msg(img?'Image downloaded. Share this link.':'Share this link.',link);
 }
 el('shareConditions').onclick=share;
 el('widgetGuide').addEventListener('click',()=>window.knotEvent('widget_guide_opened'));
 const navigation=[...document.querySelectorAll('.launch-nav a[href^="#"]')];
 function selectSection(hash){
  if(hash==='#patterns')hash='#weekly';
  for(const anchor of navigation){
   if(anchor.hash===hash)anchor.setAttribute('aria-current','location');
   else anchor.removeAttribute('aria-current');
  }
 }
 for(const anchor of navigation)anchor.addEventListener('click',()=>{
  selectSection(anchor.hash);
  window.knotEvent(anchor.hasAttribute('data-plan')?'plan_view':anchor.hasAttribute('data-trends')?'trends_view':'navigation');
 });
 window.addEventListener('hashchange',()=>selectSection(location.hash||'#now'));
 selectSection(location.hash||'#now');
 el('historyDate').addEventListener('change',()=>window.knotEvent('history_date_selected'));el('heatmap').addEventListener('click',()=>window.knotEvent('heatmap_interaction'));
})();
