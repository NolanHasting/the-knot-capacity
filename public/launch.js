'use strict';
(()=>{
 const el=id=>document.getElementById(id),origin='https://climbtheknot.live/',production=location.origin===origin.slice(0,-1);
 const store={get(k){try{return localStorage.getItem(k);}catch{return null;}},set(k,v){try{localStorage.setItem(k,v);}catch{}},remove(k){try{localStorage.removeItem(k);}catch{}}};
 let messageTimer;const msg=s=>{const n=el('toolStatus');n.textContent=s;n.hidden=false;clearTimeout(messageTimer);messageTimer=setTimeout(()=>n.hidden=true,6000);};
 let data=null,snapshot=null,session=null,visitor=null,ga=false;
 const consent=el('analyticsConsent');consent.checked=store.get('knot-analytics-consent')==='yes';
 const today=()=>window.KnotExperience.parts(Date.now()).date;
 const gaId=window.KNOT_CONFIG?.ga4;
 function analyticsStart(){
  if(!production||!consent.checked)return;
  visitor=store.get('knot-visitor')||crypto.randomUUID();store.set('knot-visitor',visitor);
  const last=store.get('knot-last-visit');try{const previous=JSON.parse(sessionStorage.getItem('knot-session')||'null');session=previous&&Date.now()-previous.at<1800000?previous.id:crypto.randomUUID();sessionStorage.setItem('knot-session',JSON.stringify({id:session,at:Date.now()}));}catch{session=crypto.randomUUID();}
  const returning=!!last;store.set('knot-last-visit',today());
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
 if('serviceWorker'in navigator&&production)navigator.serviceWorker.register('/sw.js').catch(()=>{});
 // Only one share action. Pre-render the image when status changes so native
 // sharing and Clipboard writes can run directly inside the click gesture.
 const link=origin+'?utm_source=share';
 function usable(d){return d&&['live','delayed'].includes(d.dataState)&&Number.isFinite(d.count)&&Number.isFinite(Date.parse(d.sourceUpdated));}
 function buildImage(d){
  const c=document.createElement('canvas');c.width=900;c.height=720;const x=c.getContext('2d');
  x.fillStyle='#111613';x.fillRect(0,0,900,720);
  const write=(s,y,size,color='#e9eee9',weight=500)=>{x.fillStyle=color;x.font=weight+' '+size+'px system-ui';x.fillText(s,56,y);};
  const stamp=new Date(d.sourceUpdated).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' ET';
  write('THE KNOT',88,40,'#fff',750);write('REPORTED COUNT',156,30,'#afbdb1');
  write(String(d.count),388,230,'#fff',750);
  write(d.dataState==='live'?String(d.label||''): 'LAST KNOWN COUNT',470,40,d.dataState==='live'?(d.color||'#9fd39b'):'#f0c468',650);
  write('Recorded '+stamp,540,28,'#bfc9bf');x.fillStyle='#353e36';x.fillRect(56,578,788,2);
  write('climbtheknot.live',640,36,'#fff',650);write('Independent tracker · snapshot',684,24,'#bfc9bf');
  return new Promise(resolve=>c.toBlob(resolve,'image/png'));
 }
 window.addEventListener('knot:status',e=>{data=e.detail;snapshot=null;if(usable(data)){const current=data;snapshot=buildImage(current).then(blob=>blob?{blob,reading:current}:null).catch(()=>null);}});
 function download(blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='knot-conditions.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async function share(){
  const current=data,prepared=snapshot;let img=null;
  if(prepared&&usable(current))img=await prepared;
  const reading=img?.reading,stamp=reading?new Date(reading.sourceUpdated).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' ET':'';
  const text=reading?'The Knot: '+reading.count+' reported people · '+stamp:'Check the crowd at The Knot';
  const payload={title:'Knot Capacity',text,url:link},file=img?new File([img.blob],'knot-conditions.png',{type:'image/png'}):null;
  try{
   if(file&&navigator.canShare?.({...payload,files:[file]})){await navigator.share({...payload,files:[file]});msg('Conditions shared.');}
   else if(file&&navigator.clipboard?.write&&typeof ClipboardItem!=='undefined'){
    try{await navigator.clipboard.write([new ClipboardItem({'image/png':img.blob,'text/plain':new Blob([text+' · '+link],{type:'text/plain'})})]);msg('Image and link copied. Paste into your chat.');}
    catch{try{await navigator.clipboard.write([new ClipboardItem({'image/png':img.blob})]);msg('Image copied. The tracker link is printed on it.');}catch{download(img.blob);msg('Image saved. Link: '+link);}}
   }else if(navigator.share){if(file)download(img.blob);await navigator.share(payload);msg(file?'Image saved and link shared.':'Link shared.');}
   else if(navigator.clipboard?.writeText){if(file)download(img.blob);await navigator.clipboard.writeText(link);msg(file?'Image saved and link copied.':'Link copied.');}
   else{if(file)download(img.blob);msg('Share this link: '+link);}
   window.knotEvent('share_initiated');
  }catch(e){if(e.name!=='AbortError'){if(file)download(img.blob);msg('Share this link: '+link);}}
 }
 el('shareConditions').onclick=share;
 el('widgetGuide').addEventListener('click',()=>window.knotEvent('widget_guide_opened'));
 document.querySelectorAll('.launch-nav a').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('.launch-nav a').forEach(n=>n.removeAttribute('aria-current'));a.setAttribute('aria-current','location');if(a.hasAttribute('data-trends'))document.querySelector('[data-tab="patterns"]').click();if(a.hasAttribute('data-plan'))document.querySelector('[data-tab="best"]').click();window.knotEvent(a.hasAttribute('data-plan')?'plan_view':a.hasAttribute('data-trends')?'trends_view':'navigation');}));
 el('historyDate').addEventListener('change',()=>window.knotEvent('history_date_selected'));el('heatmap').addEventListener('click',()=>window.knotEvent('heatmap_interaction'));
})();
