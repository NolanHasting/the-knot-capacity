'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.KnotExperience=api;})(globalThis,function(){
 const MIN=60000,TZ='America/New_York',DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
 const fmt=new Intl.DateTimeFormat('en-US',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const parts=ms=>{const o=Object.fromEntries(fmt.formatToParts(new Date(ms)).map(x=>[x.type,x.value]));return {date:o.year+'-'+o.month+'-'+o.day,dow:DAYS.indexOf(o.weekday),minute:Number(o.hour)*60+Number(o.minute)};};
 const close=d=>d===0||d===6?1320:1380,finite=Number.isFinite;
 function liveContext(d,now=Date.now()){
  const stamp=Date.parse(d?.sourceUpdated||''),age=now-stamp;
  const live=d?.dataState==='live'&&finite(d.count)&&finite(stamp)&&age>=-MIN&&age<=4*MIN;
  if(!live)return {live:false,recount:null,estimate:null};
  const last=d.lastInferredRecount,t=Date.parse(last?.timestamp||'');
  const recount=finite(last?.count)&&finite(t)&&t<=stamp&&parts(t).date===parts(stamp).date?last:null;
  const estimate=d.occupancyEstimate;
  return {live,recount,estimate:finite(estimate?.count)&&estimate.experimental===true?estimate:null};
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
    const support=Math.min(...supports),limit=Number(options.threshold),result=Number.isFinite(limit)?{average:Math.round(values.reduce((a,b)=>a+b,0)/values.length),score:Math.max(0,Math.max(...values)-limit)*100+values.reduce((a,b)=>a+b,0)/values.length}:rank(values,s.preference);
    const row={date:iso,dow,start,end:start+s.duration,average:result.average,peak:Math.max(...values),days:support,score:result.score+(support<2?5:0),source:'history'};
    if(!best||row.score<best.score)best=row;
   }if(best)out.push(best);
  }
  return out.sort((a,b)=>a.score-b.score||a.date.localeCompare(b.date));
 }
 function forecastRows(d,now){
  if(!liveContext(d,now).live||!Array.isArray(d.forecast?.points))return [];
  const origin=Date.parse(d.sourceUpdated);
  return d.forecast.points.filter(p=>finite(p?.count)&&p.count>=0&&finite(p.minutes)&&p.minutes>=0)
   .map(p=>({time:origin+p.minutes*MIN,count:p.count})).sort((a,b)=>a.time-b.time);
 }
 function windowStats(rows,start,end){
  function countAt(time){
   const right=rows.findIndex(p=>p.time>=time);
   if(right<0)return null;
   const b=rows[right];
   if(b.time===time)return b.count;
   const a=rows[right-1];
   if(!a||b.time-a.time>30*MIN)return null;
   return a.count+(b.count-a.count)*(time-a.time)/(b.time-a.time);
  }
  const first=countAt(start),last=countAt(end);
  if(first===null||last===null)return null;
  const points=[{time:start,count:first},...rows.filter(p=>p.time>start&&p.time<end),{time:end,count:last}];
  let area=0,peak=first;
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],gap=b.time-a.time;
   if(gap>30*MIN)return null;
   area+=(a.count+b.count)/2*gap;
   peak=Math.max(peak,b.count);
  }
  return {average:area/(end-start),peak};
 }
 function untaperedEnd(d,dow){
  // The provisional forecast tapers over 75 minutes. V4 tapers over 45.
  // Keep a full hour away from close even when V4 is active.
  return close(dow)-(d.forecast?.modelVersion==='recount-seasonal-v4'?60:75);
 }
 function quieterLater(d,now=Date.now()){
  if(d?.dataState==='closed')return {state:'closed'};
  const rows=forecastRows(d,now);
  if(rows.length<2)return {state:'unavailable'};
  const p=parts(now),minuteStart=now-now%MIN;
  const first=Math.max(420,Math.ceil((p.minute+15+(now%MIN?1:0))/30)*30);
  const end=untaperedEnd(d,p.dow);
  if(first+60>end)return {state:'no_window'};
  const candidates=[];
  for(let start=first;start+60<=end;start+=30){
   const time=minuteStart+(start-p.minute)*MIN;
   const stats=windowStats(rows,time,time+60*MIN);
   if(!stats)continue;
   candidates.push({start,end:start+60,average:Math.round(stats.average),rawAverage:stats.average,score:stats.average+.12*stats.peak});
  }
  if(!candidates.length)return {state:'unavailable'};
  const sorted=candidates.sort((a,b)=>a.score-b.score||a.start-b.start);
  const quieter=sorted.filter(w=>w.rawAverage<=d.count-3);
  if(!quieter.length)return {state:'not_quieter'};
  const best=quieter[0],selected=quieter.filter(w=>w.score<=best.score+2).sort((a,b)=>a.start-b.start)[0];
  return {state:'recommended',start:selected.start,end:selected.end,average:selected.average};
 }
 function thresholdWindows(d,now=Date.now(),options={}){
  const rows=forecastRows(d,now);
  if(rows.length<2)return [];
  const p=parts(now),s=settings(options),minuteStart=now-now%MIN;
  const first=Math.max(420,s.period[0],Math.ceil((p.minute+(now%MIN?1:0))/30)*30);
  const end=Math.min(untaperedEnd(d,p.dow),s.period[1]);
  const windows=[];
  for(let start=first;start+s.duration<=end;start+=30){
   const time=minuteStart+(start-p.minute)*MIN;
   const stats=windowStats(rows,time,time+s.duration*MIN);
   if(stats)windows.push({start,end:start+s.duration,average:Math.round(stats.average),peak:Math.ceil(stats.peak),source:'forecast'});
  }
  return windows;
 }
 // Limit the planner to distinct, non-overlapping sessions. If none meet
 // the peak threshold, show one closest alternative rather than a long list.
 function pickWindows(windows,limit,max=3){
  const rows=(windows||[]).filter(w=>finite(w.average)&&finite(w.peak)&&finite(w.start)&&finite(w.end));
  const ranked=rows.slice().sort((a,b)=>a.average-b.average||a.peak-b.peak||a.start-b.start);
  const matches=ranked.filter(w=>w.peak<=limit);
  if(!matches.length)return rows.sort((a,b)=>a.peak-b.peak||a.average-b.average||a.start-b.start).slice(0,1);
  const selected=[];
  for(const w of matches){if(selected.every(p=>w.end<=p.start||w.start>=p.end))selected.push(w);if(selected.length>=max)break;}
  return selected.sort((a,b)=>a.start-b.start);
 }
 return {parts,close,liveContext,historyWindows,quieterLater,thresholdWindows,pickWindows};
});
