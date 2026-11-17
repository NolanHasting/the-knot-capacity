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
 const preferences={quiet:[0,25],balanced:[26,50],social:[51,75]};
 function settings(options={}){
  const preference=Object.hasOwn(preferences,options.preference)?options.preference:'quiet';
  const duration=[60,90,120].includes(Number(options.duration))?Number(options.duration):120;
  const periods={any:[420,1440],morning:[420,720],afternoon:[720,1020],evening:[1020,1440]};
  const period=Object.hasOwn(periods,options.period)?periods[options.period]:periods.any;
  return {preference,duration,period};
 }
 function rank(values,pref){
  const avg=values.reduce((a,b)=>a+b,0)/values.length,peak=Math.max(...values);
  const [lo,hi]=preferences[pref];
  const distance=x=>Math.max(lo-x,0,x-hi);
  // Reward a consistent atmosphere, not the busiest possible gym.
  const score=pref==='quiet'?avg+.12*peak:values.reduce((a,v)=>a+distance(v),0)/values.length+Math.abs(avg-(lo+hi)/2)*.2+.12*Math.max(0,peak-hi);
  return {average:Math.round(avg),score};
 }
 function historyWindows(cells,now=Date.now(),days=7,options={}){
  const p=parts(now),lookup=new Map((cells||[]).map(c=>[c.dayIndex+'-'+c.hour,c])),s=settings(options);
  const out=[];
  for(let offset=1;offset<=days;offset++){
   const date=new Date(p.date+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+offset);
   const dow=date.getUTCDay(),iso=date.toISOString().slice(0,10);let best=null;
   for(let start=Math.max(420,s.period[0]);start+s.duration<=Math.min(close(dow)-60,s.period[1]);start+=30){
    const values=[],supports=[];
    for(let t=start;t<start+s.duration;t+=15){
     const cell=lookup.get(dow+'-'+Math.floor(t/60));
     if(!finite(cell?.average)||cell.closed||(cell.samples||0)<10)break;
     values.push(cell.average);supports.push(cell.days||0);
    }
    if(values.length!==s.duration/15)continue;
    const support=Math.min(...supports),result=rank(values,s.preference);
    const row={date:iso,dow,start,end:start+s.duration,average:result.average,days:support,score:result.score+(support<2?5:0),source:'history'};
    if(!best||row.score<best.score)best=row;
   }if(best)out.push(best);
  }
  return out.sort((a,b)=>a.score-b.score||a.date.localeCompare(b.date));
 }
 function todayWindow(d,now=Date.now(),options={}){
  const origin=Date.parse(d?.sourceUpdated||''),p=parts(now),points=d?.forecast?.points,s=settings(options);
  if(d?.dataState!=='live'||!finite(origin)||now-origin>4*MIN||origin-now>MIN||!Array.isArray(points))return null;
  const rows=points.filter(x=>finite(x.count)&&finite(x.minutes)).map(x=>({...x,t:origin+x.minutes*MIN})).sort((a,b)=>a.t-b.t);
  const candidates=[];
  for(let start=Math.max(420,s.period[0],Math.ceil(p.minute/30)*30);start+s.duration<=Math.min(close(p.dow)-30,s.period[1]);start+=30){
   const t=now+(start-p.minute)*MIN-(now%MIN),end=t+s.duration*MIN;
   if(t<now-MIN||rows[0]?.t>t||rows.at(-1)?.t<end)continue;
   const values=[];for(let k=0;k<s.duration;k+=15){const at=t+k*MIN;const a=rows.findLast(x=>x.t<=at),b=rows.find(x=>x.t>=at);if(!a||!b)break;const f=b.t===a.t?0:(at-a.t)/(b.t-a.t);values.push(a.count+(b.count-a.count)*f);}
   if(values.length!==s.duration/15)continue;
   candidates.push({date:p.date,dow:p.dow,start,end:start+s.duration,...rank(values,s.preference),source:'forecast'});
  }
  return candidates.sort((a,b)=>a.score-b.score||a.start-b.start)[0]||null;
 }
 // Independent dashboard recommendation: find a quieter hour later today,
 // without applying a user's preferred atmosphere, duration or availability.
 function quieterLater(d,now=Date.now()){
  const origin=Date.parse(d?.sourceUpdated||''),p=parts(now),points=d?.forecast?.points;
  if(d?.dataState!=='live'||!finite(d.count)||!finite(origin)||now-origin>4*MIN||origin-now>MIN||!Array.isArray(points))return {state:'unavailable'};
  const rows=points.filter(x=>finite(x.count)&&finite(x.minutes)).map(x=>({t:origin+x.minutes*MIN,count:x.count})).sort((a,b)=>a.t-b.t);
  const sample=t=>{
   let a=null,b=null;
   for(const r of rows){if(r.t<=t)a=r;if(r.t>=t){b=r;break;}}
   if(!a||!b||b.t-a.t>30*MIN)return null;
   return a.t===b.t?a.count:a.count+(b.count-a.count)*(t-a.t)/(b.t-a.t);
  };
  const candidates=[];
  // Avoid the closing taper, which can otherwise make closing look attractive.
  for(let start=Math.max(420,Math.ceil((p.minute+15)/30)*30);start+60<=close(p.dow)-60;start+=30){
   const t=now+(start-p.minute)*MIN-now%MIN;
   const values=[0,15,30,45,60].map(m=>sample(t+m*MIN));
   if(values.some(v=>v===null))continue;
   const avg=(values[0]/2+values[1]+values[2]+values[3]+values[4]/2)/4;
   candidates.push({start,end:start+60,average:Math.round(avg),score:avg+.12*Math.max(...values)});
  }
  if(!candidates.length)return {state:'no_window'};
  const sorted=candidates.sort((a,b)=>a.score-b.score||a.start-b.start);
  const lower=sorted.filter(w=>w.average<=d.count-3);
  if(!lower.length)return {state:'not_quieter'};
  const best=lower[0],selected=lower.filter(x=>x.score<=best.score+2).sort((a,b)=>a.start-b.start)[0];
  return {state:'recommended',...selected};
 }
 return {parts,close,recounts,liveContext,historyWindows,todayWindow,quieterLater};
});
