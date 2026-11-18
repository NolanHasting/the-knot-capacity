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
function occupancyEstimate(status,last,state,now){
 if(state!=='live'||!last||status.recountModel?.lastResetAt!==last.timestamp||
  (status.recountModel.rateSamples||0)<5||!Number.isFinite(status.estimatedNow)||status.estimatedNow<0)return null;
 const age=(now.getTime()-Date.parse(last.timestamp))/60000;
 if(!Number.isFinite(age)||age<0||age>60)return null;
 return {count:status.estimatedNow,ageMinutes:Math.round(age),experimental:true};
}
module.exports={health,statusCacheSeconds,occupancyEstimate};
