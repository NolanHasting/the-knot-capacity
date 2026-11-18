'use strict';
(()=>{
 const el=id=>document.getElementById(id),M=window.KnotExperience;
 const time=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'});
 const clock=m=>{const h=Math.floor(m/60);return (h%12||12)+(m%60?':'+String(m%60).padStart(2,'0'):'')+' '+(h<12?'AM':'PM');};
 const range=w=>clock(w.start)+' – '+clock(w.end);
 const day=w=>new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric'}).format(new Date(w.date+'T12:00:00Z'));
 const node=(tag,s)=>{const n=document.createElement(tag);n.textContent=s;return n;};
 let latest=null;
 const prefs=()=>({threshold:Number(el("climbLimit").value),duration:Number(el("climbDuration").value),period:el("climbPeriod").value});
 const crowdName=n=>n<=25?'Quiet':n<=50?'Moderate':n<=75?'Busy':n<100?'Very busy':'At capacity';
 function windows(d){
  const settings=prefs(),now=Date.now(),today=M.thresholdWindows(d,now,settings);
  const list=el('besttimes'),weekly=M.historyWindows(d?.heatmap,now,7,{...settings,preference:settings.threshold<=25?'quiet':settings.threshold<=50?'balanced':'social'});
  el('climbLimitValue').textContent=settings.threshold;
  el('weeklyPreference').textContent='Suggested windows today · '+settings.duration+' min';
  list.replaceChildren();
  const add=(w,title)=>{
   const item=node('div','');item.className='threshold-row '+(w.peak<=settings.threshold?'match':'');
   const desc=node('div','');desc.append(node('strong',title),node('small',range(w)));
   const bar=node('div','');bar.className='threshold-track';const fill=node('i','');fill.style.width=Math.min(100,w.average)+'%';bar.append(fill);
   const value=node('div','');value.className='window-count';value.append(node('strong',String(w.average)),node('small',Number.isFinite(w.peak)?'peak '+w.peak:'hourly avg.'));
   item.append(desc,bar,value);list.append(item);
  };
  if(today.length){for(const w of today)add(w,w.peak<=settings.threshold?'Within preference':'Above preference');
   if(!today.some(w=>w.peak<=settings.threshold))list.append(node('p','No full session meets your limit. Closest available: '+range(today.slice().sort((a,b)=>a.peak-b.peak||a.start-b.start)[0])+'.'));
  }else list.append(node('p','No usable live forecast for today.'));
  if(weekly.length){list.append(node('h3','Next seven days · historical suggestions'));for(const w of weekly)add(w,day(w));}
 }
 window.updateMemberExperience=d=>{
  latest=d;
  const ctx=M.liveContext(d),r=ctx.recount,e=ctx.live?(d.occupancyEstimate?{count:d.occupancyEstimate.count,basis:'adjusted'}:{count:d.count,basis:'reported'}):null;
  el('recountNow').textContent=r?r.count+' · '+time.format(new Date(r.timestamp)):'—';
  el('recountNote').textContent=r?'Inferred from a downward correction':ctx.live?'No recount detected today':'Live data unavailable';
  el('estimateNow').textContent=e?(e.basis==='reported'?'':'~')+e.count:'—';
  el('estimateNote').textContent=!e?'Live data unavailable':e.basis==='reported'?'Reported count · no adjustment':e.basis==='recount'?'Based on the last recount':'Adjusted for possible departures';
  el('comparison').textContent=ctx.live&&Number.isFinite(d.typicalNow)?(d.count===d.typicalNow?'Typical for this hour':Math.abs(d.count-d.typicalNow)+' '+(d.count>d.typicalNow?'above':'below')+' average'):'';
  el('hoursNow').textContent=d?.open?'Closes at '+clock(M.close(M.parts(Date.now()).dow)):d?'Closed · regular hours':'';
  windows(d);
 };
 const controls=[el('climbLimit'),el('climbDuration'),el('climbPeriod')];
 try{const saved=JSON.parse(localStorage.getItem('knot-climb-preferences')||'null');if(saved){const v=Number(saved.threshold??({quiet:25,balanced:50,social:75}[saved.preference]||40));if(Number.isFinite(v))el('climbLimit').value=Math.max(10,Math.min(100,v));for(const [id,key] of [['climbDuration','duration'],['climbPeriod','period']])if([...el(id).options].some(o=>o.value===String(saved[key])))el(id).value=String(saved[key]);}}catch{}
 controls.forEach(x=>{x.addEventListener('input',()=>windows(latest));x.addEventListener('change',()=>{try{localStorage.setItem('knot-climb-preferences',JSON.stringify(prefs()));}catch{}windows(latest);window.knotEvent?.('preference_saved');});});
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
  try{const r=await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok||!data.ok)throw Error(data.error||'Unable to send feedback.');form.reset();fields();el('contactDetails').open=false;notice.textContent='Feedback sent. Thank you.';window.knotEvent?.('feedback_submitted');}catch(err){notice.textContent=err instanceof SyntaxError?'Feedback is temporarily unavailable. Please try again later.':err.message||'Unable to send feedback.';}finally{button.disabled=false;}
 });
})();
