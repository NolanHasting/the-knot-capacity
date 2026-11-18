'use strict';
(()=>{
 const el=id=>document.getElementById(id),origin='https://climbtheknot.live/',production=location.origin===origin.slice(0,-1);
 const store={get(k){try{return localStorage.getItem(k);}catch{return null;}},set(k,v){try{localStorage.setItem(k,v);}catch{}},remove(k){try{localStorage.removeItem(k);}catch{}}};
 const msg=s=>el('toolStatus').textContent=s;
 let data=null,install=null,registration=null,session=null,visitor=null,ga=false,alerted=false;
 const consent=el('analyticsConsent');consent.checked=store.get('knot-analytics-consent')==='yes';
 const today=()=>window.KnotExperience.parts(Date.now()).date;
 const gaId=window.KNOT_CONFIG?.ga4;
 function analyticsStart(){
  if(!production||!consent.checked)return;
  visitor=store.get('knot-visitor')||crypto.randomUUID();store.set('knot-visitor',visitor);
  const last=store.get('knot-last-visit');try{const previous=JSON.parse(sessionStorage.getItem('knot-session')||'null');session=previous&&Date.now()-previous.at<1800000?previous.id:crypto.randomUUID();sessionStorage.setItem('knot-session',JSON.stringify({id:session,at:Date.now()}));}catch{session=crypto.randomUUID();}
  const returning=!!last;store.set('knot-last-visit',today());
  el('visitWelcome').textContent=returning?'Welcome back. Make your next session count.':'Make checking the crowd part of your climbing routine.';
  if(!ga&&/^G-[A-Z0-9]+$/.test(gaId||'')){
   ga=true;window.dataLayer=window.dataLayer||[];window.gtag=function(){window.dataLayer.push(arguments);};window.gtag('js',new Date());window.gtag('config',gaId,{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false});
   const s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(gaId);document.head.append(s);
  }
  window.knotEvent('page_view');if(returning&&last!==today())window.knotEvent('return_visit');
 }
 window.knotEvent=(event)=>{
  if(!production||!consent.checked||!visitor||!session)return;
  try{sessionStorage.setItem('knot-session',JSON.stringify({id:session,at:Date.now()}));}catch{}
  const source=new URLSearchParams(location.search).get('utm_source');
  const channel=source==='share'?'share':source==='print'?'print':source==='installed'?'installed':document.referrer&&new URL(document.referrer).origin!==location.origin?'referral':'direct';
  fetch('/api/event',{method:'POST',headers:{'Content-Type':'application/json'},keepalive:true,body:JSON.stringify({event,visitor,session,channel})}).catch(()=>{});
  if(ga)window.gtag('event',event,{channel,page_location:origin,page_referrer:''});
 };
 consent.onchange=()=>{store.set('knot-analytics-consent',consent.checked?'yes':'no');if(consent.checked){if(gaId)window['ga-disable-'+gaId]=false;analyticsStart();}else{if(gaId)window['ga-disable-'+gaId]=true;visitor=session=null;store.remove('knot-visitor');store.remove('knot-last-visit');msg('Analytics disabled.');}};
 analyticsStart();
 el('resetLocal').onclick=()=>{for(const k of ['knot-climb-preferences','knot-analytics-consent','knot-visitor','knot-last-visit','knot-alert','knot-feedback-token'])store.remove(k);store.remove('knot-alert-at');try{sessionStorage.removeItem('knot-session');}catch{}location.reload();};
 if('serviceWorker'in navigator&&production)navigator.serviceWorker.register('/sw.js').then(r=>registration=r).catch(()=>{});
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();install=e;el('installApp').hidden=false;});
 el('installApp').onclick=async()=>{if(install){await install.prompt();install=null;el('installApp').hidden=true;window.knotEvent('install_prompt');}};
 function live(){return data?.dataState==='live'&&Number.isFinite(data.count)&&Date.now()-Date.parse(data.sourceUpdated)<=240000&&Date.now()>=Date.parse(data.sourceUpdated);}
 const timestamp=()=>new Date(data.sourceUpdated).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' ET';
 async function copy(s){if(navigator.clipboard)await navigator.clipboard.writeText(s);else throw Error('Clipboard not supported');}
 function image(overlay){
  const c=document.createElement('canvas');c.width=1080;c.height=overlay?480:1080;const x=c.getContext('2d');
  x.fillStyle='#121914';if(overlay){x.beginPath();x.roundRect(20,20,1040,440,48);x.fill();}else x.fillRect(0,0,c.width,c.height);
  const label=(s,y,size=42,color='#d9e9dc',weight=500)=>{x.fillStyle=color;x.font=weight+' '+size+'px system-ui';x.fillText(s,70,y);};
  label('KNOT CAPACITY',100,42,'#ffffff',700);label('REPORTED CROWD',165,32);
  label(String(data.count),overlay?310:520,overlay?140:300,'#fff',750);
  if(overlay){x.fillStyle='#9fd39b';x.font='600 42px system-ui';x.fillText(String(data.label||''),440,255);x.fillText(timestamp(),440,310);label('climbtheknot.live',405,38);}
  else{label(String(data.label||''),610,56,'#9fd39b',650);label(data.trendLabel||'Reported count',680,38);const pts=(data.forecast?.points||[]).filter(p=>Number.isFinite(p.count));if(pts.length>1){const max=Math.max(100,...pts.map(p=>p.count));x.strokeStyle='#9fd39b';x.lineWidth=6;x.beginPath();pts.forEach((p,i)=>{const px=70+940*i/(pts.length-1),py=870-p.count/max*130;i?x.lineTo(px,py):x.moveTo(px,py);});x.stroke();}label(timestamp()+' • snapshot',960,35);label('climbtheknot.live',1020,42,'#fff',700);}
  return new Promise(resolve=>c.toBlob(resolve,'image/png'));
 }
 function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async function share(overlay){if(!live()){msg('Live data is unavailable. Try again when the tracker is live.');return;}try{const blob=await image(overlay);if(!blob)throw Error('Image unavailable');const file=new File([blob],overlay?'knot-overlay.png':'knot-conditions.png',{type:'image/png'});if(!overlay&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'Knot Capacity',text:'Reported '+data.count+' people · '+timestamp(),url:origin+'?utm_source=share'});}else download(blob,file.name);window.knotEvent(overlay?'overlay_saved':'share_initiated');msg(overlay?'Overlay saved.':'Snapshot ready.');}catch(e){if(e.name!=='AbortError')msg('Could not share. Try copying the link.');}}
 el('shareConditions').onclick=()=>share(false);el('saveOverlay').onclick=()=>share(true);
 el('copyLink').onclick=async()=>{try{await copy(origin+'?utm_source=share');msg('Link copied.');window.knotEvent('share_initiated');}catch{msg('Copy this link: '+origin);}};
 el('widgetGuide').onclick=()=>window.knotEvent('widget_guide_opened');
 el('crowdAlert').onclick=async()=>{if(store.get('knot-alert')==='yes'){store.remove('knot-alert');el('crowdAlert').textContent='Enable crowd alerts';msg('Crowd alerts disabled.');return;}if(!('Notification'in window)){msg('Notifications are not supported here. Try the installed app.');return;}const p=await Notification.requestPermission();if(p!=='granted'){msg('Notification permission not granted.');return;}store.set('knot-alert','yes');el('crowdAlert').textContent='Disable crowd alerts';msg('Alerts enabled while the tracker is open.');};
 if(store.get('knot-alert')==='yes')el('crowdAlert').textContent='Disable crowd alerts';
 window.addEventListener('knot:status',async e=>{data=e.detail;if(!live()||store.get('knot-alert')!=='yes')return;const limit=Number(el('climbLimit').value);if(data.count>limit+5)alerted=false;if(data.count>limit||alerted||Date.now()-Number(store.get('knot-alert-at')||0)<3600000)return;if(!('Notification'in window)||Notification.permission!=='granted')return;try{const title='Your time to climb',options={body:'Reported '+data.count+' people — within your preference.',tag:'knot-crowd'};if(registration)await registration.showNotification(title,options);else new Notification(title,options);alerted=true;store.set('knot-alert-at',String(Date.now()));}catch{}});
 el('calendarReminder').onclick=()=>{const d=new Date();d.setDate(d.getDate()+1);d.setHours(17,0,0,0);const stamp=d.toISOString().replace(/[-:]/g,'').split('.')[0]+'Z';const now=new Date().toISOString().replace(/[-:]/g,'').split('.')[0]+'Z';const value=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Knot Capacity//EN','BEGIN:VEVENT','UID:'+crypto.randomUUID()+'@climbtheknot.live','DTSTAMP:'+now,'DTSTART:'+stamp,'DURATION:PT15M','RRULE:FREQ=WEEKLY','SUMMARY:Check climbing conditions','URL:'+origin,'BEGIN:VALARM','TRIGGER:-PT15M','ACTION:DISPLAY','DESCRIPTION:Check Knot Capacity','END:VALARM','END:VEVENT','END:VCALENDAR'].join('\r\n')+'\r\n';download(new Blob([value],{type:'text/calendar'}),'climbing-reminder.ics');msg('Weekly reminder downloaded for tomorrow at 5 PM. Adjust in your calendar.');window.knotEvent('reminder_saved');};
 document.querySelectorAll('.launch-nav a').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('.launch-nav a').forEach(n=>n.removeAttribute('aria-current'));a.setAttribute('aria-current','location');if(a.hasAttribute('data-trends'))document.querySelector('[data-tab="patterns"]').click();if(a.hasAttribute('data-plan'))document.querySelector('[data-tab="best"]').click();window.knotEvent(a.hasAttribute('data-plan')?'plan_view':a.hasAttribute('data-trends')?'trends_view':'navigation');}));
 el('historyDate').addEventListener('change',()=>window.knotEvent('history_date_selected'));el('heatmap').addEventListener('click',()=>window.knotEvent('heatmap_interaction'));
})();
