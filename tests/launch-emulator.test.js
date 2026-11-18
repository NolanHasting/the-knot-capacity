'use strict';
const assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const {resolve}=require('node:path');
const {randomUUID}=require('node:crypto');
const fromFunctions=createRequire(resolve(__dirname,'../functions/package.json'));
const {initializeApp}=fromFunctions('firebase-admin/app');
const {getAuth}=fromFunctions('firebase-admin/auth');
const {getFirestore}=fromFunctions('firebase-admin/firestore');
const L=require('../functions/logic');
const projectId='demo-knot-launch';
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9099');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8080');
initializeApp({projectId});
const db=getFirestore(),auth=getAuth();
const hosting='http://127.0.0.1:5000';
const signing='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo';
const origin='https://climbtheknot.live';
const preview='https://theknotcapacity--test.web.app';
const json={'Content-Type':'application/json'};
const call=(route,options)=>fetch(hosting+'/api/'+route,options);
const post=(route,body,source=origin)=>call(route,{method:'POST',headers:{...json,Origin:source},body:JSON.stringify(body)});
async function token(account,password){
 const response=await fetch(signing,{method:'POST',headers:json,body:JSON.stringify({email:account.email,password,returnSecureToken:true})});
 const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));
 return data.idToken;
}
(async()=>{
 const config=await fetch(hosting+'/__/firebase/init.json');
 assert.equal((await config.json()).projectId,projectId,'Start Hosting with the demo project.');
 const reading=27,now=new Date(),stamp=now.toISOString(),day=L.parts(now).day;
 const oldDay='2000-01-01';
 const initialPrint=(await db.doc('productDaily/'+day).get()).data()?.channels?.print||0;
 await Promise.all([
  db.doc('system/current').set({...L.crowd(reading,true),open:true,sourceUpdated:stamp,updated:stamp,count:reading}),
  db.doc('days/'+day).set({points:[{timestamp:stamp,count:reading}]}),
  db.doc('productDaily/'+oldDay).set({sessions:1}),
  db.doc('forecastScores/'+oldDay).set({model:'v3-recount-provisional'}),
  db.doc('forecastScores/'+day).set({model:'recount-seasonal-v4'})
 ]);
 const status=await call('status');
 assert.equal(status.status,200);assert.equal((await status.json()).count,L.openNow(L.parts(now))?reading:null);
 assert(status.headers.get('cache-control'));
 const report={kind:'suggestion',clientId:randomUUID(),message:'Local launch test '+randomUUID(),contact:randomUUID()+'@example.invalid',contactConsent:true};
 assert.equal((await post('feedback',report,preview)).status,403);
 assert.equal((await post('feedback',report)).status,201);
 const event={event:'page_view',channel:'print',visitor:randomUUID(),session:randomUUID()};
 assert.equal((await post('event',event,preview)).status,403);
 assert.equal((await post('event',event)).status,201);
 assert.equal((await post('event',event)).status,429);
 assert.equal((await call('admin')).status,401);
 const password=randomUUID();
 const [admin,viewer]=await Promise.all([
  auth.createUser({email:randomUUID()+'@example.invalid',password}),
  auth.createUser({email:randomUUID()+'@example.invalid',password})
 ]);
 await auth.setCustomUserClaims(admin.uid,{admin:true});
 const [adminToken,viewerToken]=await Promise.all([token(admin,password),token(viewer,password)]);
 const withToken=token=>({headers:{Authorization:'Bearer '+token}});
 assert.equal((await call('admin',withToken(viewerToken))).status,403);
 const result=await call('admin',withToken(adminToken));
 const dash=await result.json();
 assert.equal(result.status,200,JSON.stringify(dash));
 assert.equal(dash.daily[0].date,day);
 assert.equal(dash.daily[0].channels.print,initialPrint+1);
 assert(!dash.daily.some(row=>row.date===oldDay));
 assert.equal(dash.scores[0].date,day);
 assert(!dash.scores.some(row=>row.date===oldDay));
 const feedback=dash.feedback.find(row=>row.message===report.message);
 assert(feedback);
 assert(!('contact' in feedback));
 assert.equal((await db.collection('feedbackContacts').where('contact','==',report.contact).get()).size,1);
 console.log('Isolated Firebase emulators passed: Hosting rewrites, status reads, origin checks, feedback contact separation, event deduplication, and administrator-only access.');
})().catch(error=>{console.error(error);process.exitCode=1;});
