'use strict';
const L=require('./logic');
function health(status={},now=new Date()){
 const p=L.parts(now),scheduledOpen=L.openNow(p);
 const stamp=Date.parse(status.sourceUpdated||'');
 const age=(now.getTime()-stamp)/60000;
 // An old stored open/closed flag is not proof of current opening hours.
 const live=scheduledOpen&&status.open===true&&
  Number.isFinite(age)&&age>=0&&age<=3&&!status.error;
 const state=!scheduledOpen?'closed':live?'live':
  status.open===true&&Number.isFinite(age)&&age>=0&&age<=30?'delayed':'offline';
 return {scheduledOpen,state,sourceAgeMinutes:Number.isFinite(age)&&age>=0?Math.round(age):null};
}
function statusCacheSeconds(status,state,now){
 const time=now.getTime();
 // Opening and closing are minute boundaries. A live response must also
 // expire by the exact freshness cutoff for its source reading.
 const untilMinute=60000-time%60000;
 const untilStale=state==='live'?Date.parse(status.sourceUpdated)+3*60000-time:Infinity;
 return Math.max(0,Math.floor(Math.min(15000,untilMinute,untilStale)/1000));
}
function occupancyEstimate(status,last,state,now,typicalNow){
 const estimate=(count,basis)=>({count:Math.max(0,Math.round(count)),basis,experimental:true});
 if(state==='closed')return estimate(0,'closed');
 const count=status.count;
 if(state==='live'&&Number.isFinite(count)){
  const model=status.recountModel||{};
  const minutes=(Date.parse(status.sourceUpdated)-Date.parse(last?.timestamp))/60000;
  if(last&&model.lastResetAt===last.timestamp&&minutes>=0&&model.rateSamples>=2&&
   Number.isFinite(model.departuresPerMinute)&&model.departuresPerMinute>=0){
   // Limit extrapolation across long gaps. Each new source reading still updates the base.
   const correction=model.departuresPerMinute*Math.min(minutes,60);
   return estimate(count-correction,'recount_adjusted');
  }
  return estimate(count,'reported');
 }
 if(Number.isFinite(typicalNow))return estimate(typicalNow,'historical');
 return Number.isFinite(count)?estimate(count,'last_reported'):null;
}
module.exports={health,statusCacheSeconds,occupancyEstimate};
