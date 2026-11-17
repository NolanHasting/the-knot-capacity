'use strict';
(()=>{
 const el=id=>document.getElementById(id),M=window.KnotExperience;
 const time=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'});
 const clock=m=>{const h=Math.floor(m/60);return (h%12||12)+(m%60?':'+String(m%60).padStart(2,'0'):'')+' '+(h<12?'AM':'PM');};
 const range=w=>clock(w.start)+' – '+clock(w.end);
 const day=w=>new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric'}).format(new Date(w.date+'T12:00:00Z'));
 const node=(tag,s)=>{const n=document.createElement(tag);n.textContent=s;return n;};
 function windows(d){
  const today=M.todayWindow(d),out=el('visitResult');
  out.replaceChildren();
  if(today){out.append(node('strong',range(today)),node('p','About '+today.average+' people on average'));el('bestQuick').textContent=clock(today.start);el('bestQuickNote').textContent='About '+today.average+' people';}
  else {out.append(node('p',d?.dataState==='live'?'No full two-hour window remaining today.':'Live forecast unavailable.'));el('bestQuick').textContent='—';el('bestQuickNote').textContent='See best times this week';}
  const list=el('besttimes');list.replaceChildren();
  const rows=M.historyWindows(d?.heatmap);
  if(!rows.length){list.append(node('p','Not enough historical data yet.'));return;}
  for(const w of rows){const item=node('div','');item.className='window-row';const desc=node('div','');desc.append(node('strong',day(w)),node('small',range(w)));const value=node('div','');value.className='window-count';value.append(node('strong',String(w.average)),node('small',w.days<2?'Limited history':'people on average'));item.append(desc,value);list.append(item);}
 }
 window.updateMemberExperience=d=>{
  const ctx=M.liveContext(d),r=ctx.recount,e=ctx.estimate;
  el('recountNow').textContent=r?r.count+' · '+time.format(new Date(r.timestamp)):'—';
  el('recountNote').textContent=r?'Inferred from a downward correction':ctx.live?'No recount detected today':'Live data unavailable';
  el('estimateNow').textContent=e?(e.basis==='reported'?'':'~')+e.count:'—';
  el('estimateNote').textContent=!e?'Live data unavailable':e.basis==='reported'?'Reported count · no adjustment':e.basis==='recount'?'Based on the last recount':e.basis==='limited'?'Adjusted · older recount':'Adjusted for possible departures';
  el('comparison').textContent=ctx.live&&Number.isFinite(d.typicalNow)?(d.count===d.typicalNow?'Typical for this hour':Math.abs(d.count-d.typicalNow)+' '+(d.count>d.typicalNow?'above':'below')+' average'):'';
  el('hoursNow').textContent=d?.open?'Closes at '+clock(M.close(M.parts(Date.now()).dow)):d?'Closed · regular hours':'';
  windows(d);
 };
 el('moreWindows').addEventListener('click',()=>document.querySelector('[data-tab="best"]').click());
 const form=el('feedbackForm'),crowd=el('crowdFields'),msg=el('message'),consent=el('contactConsent'),contact=el('contact');
 const selected=name=>form.querySelector('input[name="'+name+'"]:checked')?.value;
 function fields(){const isCrowd=selected('feedbackKind')==='crowd';crowd.hidden=!isCrowd;for(const x of crowd.querySelectorAll('input'))x.disabled=!isCrowd;el('messageWrap').hidden=isCrowd;msg.disabled=isCrowd;msg.required=!isCrowd;}
 form.querySelectorAll('[name="feedbackKind"]').forEach(x=>x.addEventListener('change',fields));fields();
 let clientId;try{clientId=localStorage.getItem('knot-feedback-token');if(!clientId){clientId=crypto.randomUUID();localStorage.setItem('knot-feedback-token',clientId);}}catch{clientId=crypto.randomUUID();}
 form.addEventListener('submit',async e=>{
  e.preventDefault();const button=el('submitFeedback'),notice=el('feedbackStatus'),kind=selected('feedbackKind');
  if(contact.value.trim()&&!consent.checked){notice.textContent='Please agree to be contacted or remove your contact details.';return;}
  button.disabled=true;notice.textContent='Sending…';
  const body={kind,clientId,message:kind==='suggestion'?msg.value:'',contactConsent:consent.checked,contact:contact.value};
  if(kind==='crowd')Object.assign(body,{onSite:el('onSite').checked,crowd:selected('crowdRating'),accuracy:selected('accuracyRating')||'unsure',count:el('observedCount').value});
  try{const r=await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok||!data.ok)throw Error(data.error||'Unable to send feedback.');form.reset();fields();el('contactDetails').open=false;notice.textContent='Feedback sent. Thank you.';}catch(err){notice.textContent=err instanceof SyntaxError?'Feedback is temporarily unavailable. Please try again later.':err.message||'Unable to send feedback.';}finally{button.disabled=false;}
 });
})();
