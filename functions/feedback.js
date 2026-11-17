'use strict';
// No public read API. Contact is stored separately; never included in model inputs.
function validateFeedback(body){
 if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Invalid submission.');
 const {kind,clientId}=body;
 if(!/^[a-f0-9-]{36}$/i.test(clientId||''))throw Error('Invalid browser token.');
 if(!['crowd','suggestion'].includes(kind))throw Error('Choose a feedback type.');
 const clean=(v,max)=>{if(v==null)return '';if(typeof v!=='string'||v.length>max)throw Error('Text is too long.');return v.trim();};
 const message=clean(body.message,1500);
 const contact=clean(body.contact,150);
 if(contact&&(!body.contactConsent||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)||/^\+?[0-9 ()-]{7,25}$/.test(contact))))throw Error('Enter a valid email or phone and agree to follow-up.');
 if(kind==='suggestion'&&!message)throw Error('Enter a suggestion.');
 const report={kind,message};
 if(kind==='crowd'){
  if(body.onSite!==true)throw Error('Only submit a crowd report while at the gym.');
  if(!['quiet','moderate','busy','very_busy'].includes(body.crowd))throw Error('Choose how crowded it feels.');
  if(!['accurate','lower','higher','unsure'].includes(body.accuracy))throw Error('Choose how accurate the count seems.');
  const count=body.count==null||body.count===''?null:Number(body.count);
  if(count!==null&&(!Number.isInteger(count)||count<0||count>300))throw Error('Enter a count from 0 to 300.');
  Object.assign(report,{crowd:body.crowd,accuracy:body.accuracy,observedCount:count,onSite:true});
 }
 return {clientId,report,contact:body.contactConsent===true?contact:''};
}
function context(status,now){
 const stamp=Date.parse(status?.sourceUpdated||'');
 const age=(now.getTime()-stamp)/60000;
 const fresh=Number.isFinite(age)&&age>=0&&age<=4&&status?.open===true;
 return {sourceUpdated:fresh?status.sourceUpdated:null,reportedCount:fresh&&Number.isFinite(status.count)?status.count:null,
  estimatedNow:fresh&&Number.isFinite(status.estimatedNow)?status.estimatedNow:null,
  modelVersion:fresh?status.forecast?.modelVersion||'legacy':null};
}
module.exports={validateFeedback,context};
