'use strict';
const assert=require('node:assert/strict');
const {health,statusCacheSeconds,occupancyEstimate}=require('../functions/health');
const A=require('../functions/analytics');
const S=require('../functions/seasonal');
// All schedule checks use America/New_York independently of host timezone.
const at=s=>new Date(s);
const staleClosed={open:false,sourceUpdated:null};
assert.equal(health(staleClosed,at('2026-11-16T14:00:00Z')).state,'offline',
 'Monday morning must not inherit an overnight CLOSED status');
assert.equal(health({open:true,sourceUpdated:'2026-11-16T14:00:00Z'},
 at('2026-11-17T04:10:00Z')).state,'closed','After closing, a prior OPEN flag is stale');
assert.equal(health({open:true,sourceUpdated:'2026-11-16T13:59:00Z'},
 at('2026-11-16T14:00:00Z')).state,'live');
assert.equal(health({open:true,sourceUpdated:'2026-11-16T13:50:00Z'},
 at('2026-11-16T14:00:00Z')).state,'delayed');
assert.equal(health({open:true,sourceUpdated:'2026-11-16T12:00:00Z'},
 at('2026-11-16T14:00:00Z')).state,'offline');
assert.equal(health({open:true,sourceUpdated:'2026-11-16T13:59:00Z',error:'fetch failed'},
 at('2026-11-16T14:00:00Z')).state,'delayed');
assert.equal(health({open:true,sourceUpdated:null},
 at('2026-11-16T14:00:00Z')).state,'offline');
assert.equal(health({open:true,sourceUpdated:'2026-11-16T14:01:00Z'},
 at('2026-11-16T14:00:00Z')).state,'offline','Future source timestamps cannot count as live');
// Midnight DST changes must not break open/closed evaluation.
assert.equal(health({open:true,sourceUpdated:'2026-11-01T12:00:00Z'},
 at('2026-11-01T12:01:00Z')).state,'live');
assert.equal(health({open:true,sourceUpdated:'2026-11-01T03:00:00Z'},
 at('2026-11-01T06:30:00Z')).state,'closed');
const source={open:true,sourceUpdated:'2026-11-16T13:59:15.000Z'};
assert.equal(statusCacheSeconds(source,'live',at('2026-11-16T14:01:04Z')),15);
assert.equal(statusCacheSeconds(source,'live',at('2026-11-16T14:02:10Z')),5);
assert.equal(statusCacheSeconds(source,'live',at('2026-11-16T14:02:15Z')),0);
assert.equal(statusCacheSeconds(source,'closed',at('2026-11-16T11:59:56Z')),4);
const last={count:30,timestamp:'2026-11-16T13:30:00Z'};
const status={...source,count:50,recountModel:{lastResetAt:last.timestamp,rateSamples:5,departuresPerMinute:0.5}};
const estimate=(changes={},recount=last,state='live',typical=null)=>
 occupancyEstimate({...status,...changes},recount,state,at(source.sourceUpdated),typical);
assert.equal(estimate().count,35);
assert.equal(estimate({sourceUpdated:'2026-11-16T16:00:00Z'}).count,20);
assert.equal(estimate({},null).count,50);
assert.equal(estimate({count:0},null).count,0);
assert.equal(estimate({},last,'delayed',28).count,28);
assert.equal(estimate({},last,'offline').basis,'last_reported');
assert.equal(estimate({},last,'closed').count,0);
// The frozen forecast identifies its implementation, not a hard-coded legacy model.
const t=at('2026-11-16T14:00:00Z'),day='2026-11-16';
const observed=[{timestamp:at('2026-11-16T14:15:00Z').toISOString(),count:45}];
const current=A.snapshot(day,t,35,{modelVersion:'recount-seasonal-v4',
 points:[{minutes:15,count:45,low:35,high:55}]});
const legacy=A.snapshot(day,t,35,{modelVersion:'v3-recount-provisional',
 points:[{minutes:15,count:55,low:45,high:65}]});
assert.equal(current.modelVersion,'recount-seasonal-v4');
const v4=A.scoreDay(observed,[legacy,current],[],'recount-seasonal-v4');
const v3=A.scoreDay(observed,[legacy,current],[],'v3-recount-provisional');
assert.equal(v4.model,'recount-seasonal-v4');
assert.equal(v4.horizons[15].samples,1);
assert.equal(v4.horizons[15].sourceMAE,0);
assert.equal(v3.horizons[15].sourceMAE,10);
// A true gap is not magically filled by wide interpolation in the trained curve.
const synthetic={version:'recount-seasonal-v4',profiles:{1:[
 {minute:540,count:20,days:4,spread:5},
 {minute:660,count:80,days:4,spread:9}
]}};
assert.equal(S.profile(synthetic,{dow:1,hour:10,minute:0}),null);
console.log('Source freshness and model-version regression tests passed.');
