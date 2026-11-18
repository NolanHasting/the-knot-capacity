import {firebaseConfig} from './admin-config.js';
const el=id=>document.getElementById(id),status=s=>el('adminStatus').textContent=s;
const node=(t,v)=>{const n=document.createElement(t);n.textContent=v;return n;};
function table(target,headers,rows){const t=node('table',''),head=node('tr','');headers.forEach(v=>head.append(node('th',v)));t.append(head);rows.forEach(row=>{const tr=node('tr','');row.forEach(v=>tr.append(node('td',String(v??'—'))));t.append(tr);});target.replaceChildren(t);}
async function start(){
 if(location.origin!=='https://climbtheknot.live'){status('Administrator access is disabled in previews.');el('login').hidden=true;return;}
 if(!firebaseConfig){status('Administrator access is not configured yet. See README.');el('login').hidden=true;return;}
 const {initializeApp}=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js');
 const {getAuth,signInWithEmailAndPassword,signOut,onAuthStateChanged,setPersistence,inMemoryPersistence}=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js');
 const auth=getAuth(initializeApp(firebaseConfig));await setPersistence(auth,inMemoryPersistence);
 el('login').onsubmit=async e=>{e.preventDefault();try{await signInWithEmailAndPassword(auth,el('email').value,el('password').value);}catch{status('Sign-in failed.');}finally{el('password').value='';}};
 el('logout').onclick=()=>signOut(auth);
 onAuthStateChanged(auth,async user=>{el('adminData').hidden=true;el('login').hidden=!!user;el('logout').hidden=!user; if(!user){status('Sign in to continue.');return;}try{
  const token=await user.getIdToken(),r=await fetch('/api/admin',{headers:{Authorization:'Bearer '+token},cache:'no-store'}),d=await r.json();if(auth.currentUser!==user)return;if(!r.ok||!d.ok)throw Error(d.error||'Access denied');
  const totals={},events={},channels={};for(const row of d.daily){for(const k of ['visitors','newVisitors','returningVisitors','sessions'])totals[k]=(totals[k]||0)+(row[k]||0);for(const [k,v] of Object.entries(row.events||{}))events[k]=(events[k]||0)+v;for(const [k,v] of Object.entries(row.channels||{}))channels[k]=(channels[k]||0)+v;}
  el('totals').textContent='Visitor-days: '+(totals.visitors||0)+' · New browsers: '+(totals.newVisitors||0)+' · Returning visitor-days: '+(totals.returningVisitors||0)+' · Sessions: '+(totals.sessions||0);
  table(el('daily'),['Date','Visitors','New','Returning','Sessions'],d.daily.map(r=>[r.date,r.visitors||0,r.newVisitors||0,r.returningVisitors||0,r.sessions||0]));
  el('events').textContent=JSON.stringify({channels,events},null,2);
  el('reports').replaceChildren(...d.feedback.map(r=>node('p',[r.createdAt,r.kind,r.crowd,r.accuracy,r.observedCount,r.message].filter(x=>x!=null).join(' · '))));
  el('health').textContent=JSON.stringify(d.health,null,2);
  table(el('scores'),['Date','Model','15m MAE','30m MAE','60m MAE'],d.scores.map(s=>[s.date,s.model,...[15,30,60].map(h=>s.horizons?.[h]?.sourceMAE)]));
  el('adminData').hidden=false;status('Signed in.');
 }catch(e){if(auth.currentUser===user)status(e.message);}});
}
start().catch(()=>status('Unable to initialize administrator access.'));
