'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.KnotExperience=api;})(globalThis,function(){
 const MIN=60000,TZ='America/New_York',DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
 const fmt=new Intl.DateTimeFormat('en-US',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const parts=ms=>{const o=Object.fromEntries(fmt.formatToParts(new Date(ms)).map(x=>[x.type,x.value]));return {date:o.year+'-'+o.month+'-'+o.day,dow:DAYS.indexOf(o.weekday),minute:Number(o.hour)*60+Number(o.minute)};};
 const close=d=>d===0||d===6?1320:1380,finite=Number.isFinite;
 const valid=e=>e&&finite(e.count)&&finite(Date.parse(e.timestamp));
 function recounts(history){
  const rows=(history||[]).filter(valid).slice().sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
  const events=[];let prev=null,active=null;
  for(const row of rows){
   const t=Date.parse(row.timestamp),gap=prev?(t-Date.parse(prev.timestamp))/MIN:Infinity;
   if(prev&&gap>0&&gap<=10&&parts(t).date===parts(Date.parse(prev.timestamp)).date&&row.count<prev.count){
    if(active&&t-Date.parse(active.timestamp)<=6*MIN&&prev.count<=active.count){active.timestamp=row.timestamp;active.count=row.count;active.drop=active.previousCount-row.count;}
    else{active={timestamp:row.timestamp,count:row.count,previousCount:prev.count,drop:prev.count-row.count};events.push(active);}
   }else if(!prev||gap>10||row.count>prev.count||active&&t-Date.parse(active.timestamp)>6*MIN)active=null;
   prev=row;
  }return events;
 }
 function liveContext(d,now=Date.now()){
  const source=Date.parse(d?.sourceUpdated||''),age=(now-source)/MIN;
  if(d?.dataState!=='live'||!finite(source)||age< -1||age>4||!finite(d.count))return {live:false,recount:null,estimate:null};
  const date=parts(source).date,events=recounts(d.todayHistory||[]);
  const supplied=[...(d.recounts||[]),d.lastInferredRecount,d.recountModel?.lastResetAt?{timestamp:d.recountModel.lastResetAt,count:d.recountModel.lastResetCount}:null];
  const candidates=[...events,...supplied].filter(valid).filter(e=>Date.parse(e.timestamp)<=source&&parts(Date.parse(e.timestamp)).date===date).sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
  const last=candidates.at(-1)||null;
  if(!last)return {live:true,recount:null,estimate:{count:d.count,basis:'reported',ageMinutes:null}};
  const elapsed=Math.max(0,(source-Date.parse(last.timestamp))/MIN);
  if(elapsed<1)return {live:true,recount:last,estimate:{count:last.count,basis:'recount',ageMinutes:Math.floor(elapsed)}};
  const rates=[];
  for(let i=1;i<events.length;i++){
   const interval=(Date.parse(events[i].timestamp)-Date.parse(events[i-1].timestamp))/MIN;
   if(interval>=15&&interval<=180&&events[i].drop>=1)rates.push(events[i].drop/interval);
  }
  rates.sort((a,b)=>a-b);
  const local=rates.length>=2?(rates[Math.floor((rates.length-1)/2)]+rates[Math.ceil((rates.length-1)/2)])/2:null;
  const state=d.recountModel||{},learned=finite(state.departuresPerMinute)&&(state.rateSamples||0)>=2?state.departuresPerMinute:null;
  const rate=local!==null&&learned!==null?.6*local+.4*learned:local??learned;
  if(rate===null||elapsed>120)return {live:true,recount:last,estimate:{count:d.count,basis:'reported',ageMinutes:Math.floor(elapsed)}};
  return {live:true,recount:last,estimate:{count:Math.max(0,Math.round(d.count-Math.max(0,Math.min(2,rate))*elapsed)),basis:elapsed>90?'limited':'adjusted',ageMinutes:Math.floor(elapsed)}};
 }
 function historyWindows(cells,now=Date.now(),days=7){
  const p=parts(now),lookup=new Map((cells||[]).map(c=>[c.dayIndex+'-'+c.hour,c]));
  const out=[];
  for(let offset=1;offset<=days;offset++){
   const date=new Date(p.date+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+offset);
   const dow=date.getUTCDay(),iso=date.toISOString().slice(0,10);let best=null;
   for(let hour=7;hour+2<=close(dow)/60-1;hour++){
    const a=lookup.get(dow+'-'+hour),b=lookup.get(dow+'-'+(hour+1));
    if(!finite(a?.average)||!finite(b?.average)||(a.samples||0)<10||(b.samples||0)<10)continue;
    const support=Math.min(a.days||0,b.days||0),avg=(a.average+b.average)/2;
    const score=avg+.1*Math.max(a.average,b.average)+(support<2?5:0);
    const row={date:iso,dow,start:hour*60,end:(hour+2)*60,average:Math.round(avg),days:support,score,source:'history'};
    if(!best||score<best.score)best=row;
   }if(best)out.push(best);
  }
  return out.sort((a,b)=>a.score-b.score||a.date.localeCompare(b.date));
 }
 function todayWindow(d,now=Date.now()){
  const origin=Date.parse(d?.sourceUpdated||''),p=parts(now),points=d?.forecast?.points;
  if(d?.dataState!=='live'||!finite(origin)||now-origin>4*MIN||origin-now>MIN||!Array.isArray(points))return null;
  const rows=points.filter(x=>finite(x.count)&&finite(x.minutes)).map(x=>({...x,t:origin+x.minutes*MIN}));
  const options=[];
  for(let start=Math.ceil(p.minute/30)*30;start+120<=close(p.dow)-30;start+=30){
   const t=now+(start-p.minute)*MIN-(now%MIN),end=t+120*MIN;
   if(t<now-MIN||rows[0]?.t>t+MIN||rows.at(-1)?.t<end)continue;
   const values=[];for(let k=0;k<120;k+=15){const at=t+k*MIN;const a=rows.findLast(x=>x.t<=at),b=rows.find(x=>x.t>=at);if(!a||!b)break;const f=b.t===a.t?0:(at-a.t)/(b.t-a.t);values.push(a.count+(b.count-a.count)*f);}
   if(values.length!==8)continue;
   const avg=values.reduce((s,v)=>s+v,0)/8;options.push({date:p.date,dow:p.dow,start,end:start+120,average:Math.round(avg),score:avg+.1*Math.max(...values),source:'forecast'});
  }
  return options.sort((a,b)=>a.score-b.score||a.start-b.start)[0]||null;
 }
 return {parts,close,recounts,liveContext,historyWindows,todayWindow};
});
