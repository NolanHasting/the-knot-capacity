'use strict';
(()=>{
 const el=id=>document.getElementById(id);
 let current=null;
 const fmt=t=>new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'}).format(t);
 const cat=n=>n<=25?'Quiet':n<=50?'Moderate':n<=75?'Busy':n<100?'Very busy':'At reported capacity';
 const zone=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'numeric',hourCycle:'h23'});
 function plan(){
  const d=current,output=el('visitResult'),length=Number(el('sessionLength').value),delay=Number(el('arrivalDelay').value);
  const points=d?.dataState==='live'?d.forecast?.points:null,origin=Date.parse(d?.sourceUpdated||'');
  if(!points?.length||!Number.isFinite(origin)){output.textContent='Live forecast unavailable. Explore Weekly Trends or another date below.';return;}
  const earliest=Date.now()+delay*60000;
  const options=[];
  for(let i=0;i<points.length;i++){
   const p=points[i],start=origin+p.minutes*60000,end=start+length*60000;
   if(start<earliest-60000||end>origin+points.at(-1).minutes*60000-30*60000)continue;
   const group=points.filter(q=>q.minutes>=p.minutes&&q.minutes<=p.minutes+length);
   if(group.length<Math.floor(length/15)+1)continue;
   const avg=group.reduce((s,q)=>s+q.count,0)/group.length;
   const peak=Math.max(...group.map(q=>Number.isFinite(q.high)?q.high:q.count));
   options.push({start,end,avg,peak,score:avg+.2*peak});
  }
  if(!options.length){output.textContent='Not enough time for this session before closing. Try a shorter session or another day.';return;}
  options.sort((a,b)=>a.score-b.score||a.start-b.start);
  const top=options[0],alt=options.find(x=>Math.abs(x.start-top.start)>=length*60000);
  output.replaceChildren();
  const title=document.createElement('strong');title.textContent=fmt(top.start)+' – '+fmt(top.end);
  const note=document.createElement('p');note.textContent='Estimated average '+Math.round(top.avg)+' people · '+cat(top.avg)+'. Forecasts are provisional.';
  output.append(title,note);
  if(alt){const other=document.createElement('p');other.textContent='Alternative: '+fmt(alt.start)+' – '+fmt(alt.end)+' · about '+Math.round(alt.avg)+' people';output.append(other);}
  const soon=options.reduce((a,b)=>a.start<b.start?a:b);
  if(soon.start!==top.start){const now=document.createElement('p');now.textContent='Earliest available: '+fmt(soon.start)+' · about '+Math.round(soon.avg)+' people';output.append(now);}
 }
 window.updateMemberExperience=d=>{
  current=d;
  const live=d?.dataState==='live',r=d?.lastInferredRecount,e=d?.occupancyEstimate;
  el('recountNow').textContent=live&&r?String(r.count)+' at '+fmt(new Date(r.timestamp)):'—';
  el('estimateNow').textContent=live&&e?'~'+e.count:'—';
  el('estimateNote').textContent=live&&e?'Experimental estimate · '+e.ageMinutes+' min since inferred recount':'Not enough recent recount evidence';
  el('comparison').textContent=live&&Number.isFinite(d.typicalNow)?(d.count-d.typicalNow===0?'Matches typical reported count':Math.abs(d.count-d.typicalNow)+' '+(d.count>d.typicalNow?'above':'below')+' typical reported count'):'Historical comparison unavailable';
  el('hoursNow').textContent=d?.open?'Regular closing: '+([0,6].includes(new Date().toLocaleString('en-US',{timeZone:'America/New_York',weekday:'short'})==='Sun'?0:new Date().toLocaleString('en-US',{timeZone:'America/New_York',weekday:'short'})==='Sat'?6:1)?'10 PM':'11 PM'):'Outside regular hours';
  plan();
 };
 for(const id of ['sessionLength','arrivalDelay'])el(id).addEventListener('change',plan);
 const form=el('feedbackForm'),kind=el('feedbackKind'),crowd=el('crowdFields'),consent=el('contactConsent'),contact=el('contact');
 function fields(){crowd.hidden=kind.value!=='crowd';for(const x of crowd.querySelectorAll('input,select'))x.disabled=crowd.hidden;el('onSite').required=!crowd.hidden;el('message').required=crowd.hidden;}
 kind.addEventListener('change',fields);fields();
 consent.addEventListener('change',()=>{contact.disabled=!consent.checked;if(contact.disabled)contact.value='';});
 let clientId;try{clientId=localStorage.getItem('knot-feedback-token');if(!clientId){clientId=crypto.randomUUID();localStorage.setItem('knot-feedback-token',clientId);}}catch{clientId=crypto.randomUUID();}
 form.addEventListener('submit',async e=>{
  e.preventDefault();const button=el('submitFeedback'),notice=el('feedbackStatus');button.disabled=true;notice.textContent='Submitting…';
  const body={kind:kind.value,clientId,message:el('message').value,contactConsent:consent.checked,contact:contact.disabled?'':contact.value};
  if(kind.value==='crowd')Object.assign(body,{onSite:el('onSite').checked,crowd:el('crowdRating').value,accuracy:el('accuracyRating').value,count:el('observedCount').value});
  try{const res=await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await res.json();if(!res.ok||!data.ok)throw Error(data.error||'Submission failed');form.reset();fields();contact.disabled=true;notice.textContent='Thanks! Your feedback was submitted.';}catch(err){notice.textContent=err.message||'Submission failed. Try again.';}finally{button.disabled=false;}
 });
})();
