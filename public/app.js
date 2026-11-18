'use strict';
const $=id=>document.getElementById(id);
let busy=false,lastData=null;
function time(s){return s?new Date(s).toLocaleTimeString([],{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'}):'—';}
function hourLabel(h){return (h%12||12)+':00 '+(h<12?'AM':'PM');}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const setDayChart=bindChartPoints($('dayChart'),$('daySelection'));
const svg=(name,attr)=>`<${name} ${attr}/>`;
function clearChart(text){setDayChart('<text x="45" y="125" fill="#bfbfbf" font-size="13">'+esc(text)+'</text>',{reset:true});}
function dayChart(d){
 const history=(d.todayHistory||[]).filter(p=>Number.isFinite(p.count)&&Number.isFinite(Date.parse(p.timestamp))).sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
 const forecast=d.dataState==='live'?d.forecast:null;
 const points=(forecast?.points||[]).filter(p=>Number.isFinite(p?.minutes)&&Number.isFinite(p.count));
 if(!history.length){clearChart('No counts yet today');$('dayNote').textContent='';$('forecastType').textContent='';return;}
 // The first recorded point determines the graph's left edge; all time spacing is real.
 const start=Date.parse(history[0].timestamp),nowTs=Date.parse(d.sourceUpdated||d.updated);
 const lastTs=Date.parse(history[history.length-1].timestamp);
 const projected=Number.isFinite(nowTs)?points.map(p=>({...p,ts:nowTs+p.minutes*60000})):[];
 const maxTs=projected.length?Math.max(lastTs,projected[projected.length-1].ts):lastTs;
 const span=Math.max(60000,maxTs-start);
 const all=[...history.map(p=>p.count),...projected.map(p=>Number.isFinite(p.high)?p.high:p.count)];
 const mobile=window.matchMedia('(max-width: 600px)').matches;
 const width=mobile?360:600,height=mobile?234:250;
 $('dayChart').setAttribute('viewBox','0 0 '+width+' '+height);
 const yMax=Math.max(25,Math.ceil(Math.max(100,...all)/10)*10),left=mobile?38:44,right=mobile?352:588,top=19,bottom=mobile?192:206;
 const x=t=>left+(t-start)/span*(right-left),y=n=>bottom-n/yMax*(bottom-top);
 let marks='';for(let i=0;i<=4;i++){
  const v=Math.round(yMax*i/4),yy=y(v);
  marks+=svg('line',`x1="${left}" y1="${yy.toFixed(1)}" x2="${right}" y2="${yy.toFixed(1)}" stroke="#333"`);
  marks+=`<text x="${left-7}" y="${(yy+4).toFixed(1)}" text-anchor="end" fill="#bfbfbf" font-size="${mobile?11:10}">${v}</text>`;
 }
 const historyLine=history.map((p,i)=>((i&&Date.parse(p.timestamp)-Date.parse(history[i-1].timestamp)<=10*60000)?'L':'M')+x(Date.parse(p.timestamp)).toFixed(2)+' '+y(p.count).toFixed(2)).join(' ');
 let shapes=`<path d="${historyLine}" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
 for(const event of (d.recounts||[])){
  const ts=Date.parse(event.timestamp);
  if(!Number.isFinite(ts)||!Number.isFinite(event.count))continue;
  const cx=x(ts).toFixed(2),cy=y(event.count).toFixed(2);
  const info='Inferred recount · '+time(event.timestamp)+' · '+event.count+' reported · down '+event.drop;
  shapes+=`<path d="M${cx} ${(Number(cy)-6).toFixed(2)} l6 6 -6 6 -6 -6 Z" fill="#9FD39B" stroke="#111" stroke-width="1.5"><title>${esc(info)}</title></path>`;
 }
 if(projected.length>1){
  const line=projected.map((p,i)=>(i?'L':'M')+x(p.ts).toFixed(2)+' '+y(p.count).toFixed(2)).join(' ');
  const band=projected.every(p=>Number.isFinite(p.low)&&Number.isFinite(p.high));
  if(band){
  const upper=projected.map((p,i)=>(i?'L':'M')+x(p.ts).toFixed(2)+' '+y(p.high).toFixed(2)).join(' ');
  const lower=projected.slice().reverse().map(p=>'L'+x(p.ts).toFixed(2)+' '+y(p.low).toFixed(2)).join(' ');
  shapes+=`<defs><linearGradient id="forecastBand" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stop-color="#f0c468" stop-opacity=".08"/><stop offset="55%" stop-color="#f0c468" stop-opacity=".21"/><stop offset="100%" stop-color="#f0c468" stop-opacity=".3"/></linearGradient></defs>`;
  shapes+=`<path d="${upper} ${lower} Z" fill="url(#forecastBand)" stroke="none"/>`;
  shapes+=`<path d="${upper}" fill="none" stroke="#f0c468" stroke-opacity=".36" stroke-width="1" stroke-dasharray="3 5"/>`;
  }
  shapes+=`<path d="${line}" fill="none" stroke="#f0c468" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="7 5"/>`;
  const divider=x(nowTs);shapes+=svg('line',`x1="${divider.toFixed(2)}" y1="${top}" x2="${divider.toFixed(2)}" y2="${bottom}" stroke="#999" stroke-dasharray="3 6"`);
  shapes+=`<text x="${Math.min(right-7,divider+6).toFixed(2)}" y="13" fill="#fff" font-size="10" text-anchor="${divider>right-65?'end':'start'}">NOW</text>`;
 }
 const ticks=[],tickCount=mobile?3:5;for(let i=0;i<tickCount;i++){
  const ts=start+span*i/(tickCount-1);
  ticks.push(`<text x="${(left+(right-left)*i/(tickCount-1)).toFixed(1)}" y="${mobile?216:232}" fill="#bfbfbf" font-size="${mobile?11:10}" text-anchor="${i===0?'start':i===tickCount-1?'end':'middle'}">${esc(time(new Date(ts).toISOString()))}</text>`);
 }
 // Invisible touch targets keep the chart visually clean, but accessible.
 const markers=[];
 for(let i=0;i<history.length;i+=Math.max(1,Math.ceil(history.length/110))){
  const p=history[i],ts=Date.parse(p.timestamp),label=time(p.timestamp)+': '+p.count+' reported';
  markers.push('<circle class="chart-point" cx="'+x(ts).toFixed(2)+'" cy="'+y(p.count).toFixed(2)+'" r="'+(mobile?11:5)+'" fill="transparent" tabindex="-1" data-time="'+ts+'" data-kind="reported" role="button" aria-label="'+esc(label)+'" data-info="'+esc(label)+'"/>');
 }
 for(const p of projected){
  if(!Number.isFinite(p.count))continue;
  const label=time(new Date(p.ts).toISOString())+': '+p.count+' forecast'+(Number.isFinite(p.low)&&Number.isFinite(p.high)?' · range '+p.low+'–'+p.high:'');
  markers.push('<circle class="chart-point" cx="'+x(p.ts).toFixed(2)+'" cy="'+y(p.count).toFixed(2)+'" r="'+(mobile?11:5.5)+'" fill="transparent" tabindex="-1" data-time="'+p.ts+'" data-kind="forecast" role="button" aria-label="'+esc(label)+'" data-info="'+esc(label)+'"/>');
 }
 for(const event of (d.recounts||[])){
  if(!Number.isFinite(Date.parse(event.timestamp))||!Number.isFinite(event.count))continue;
  const label='Inferred recount · '+time(event.timestamp)+' · '+event.count+' reported · down '+event.drop;
  markers.push('<circle class="chart-point" cx="'+x(Date.parse(event.timestamp)).toFixed(2)+'" cy="'+y(event.count).toFixed(2)+'" r="'+(mobile?12:9)+'" fill="transparent" tabindex="-1" data-time="'+Date.parse(event.timestamp)+'" data-kind="recount" role="button" aria-label="'+esc(label)+'" data-info="'+esc(label)+'"/>');
 }
 setDayChart(marks+shapes+markers.join('')+ticks.join(''));
 $('forecastType').textContent=projected.length?'Reported + forecast':'Reported counts';
 $('dayNote').textContent=projected.length?'The forecast ends at scheduled closing.':'';
}
const HEAT_COLORS=[
 '#123f32','#196047','#257b4d','#40945b',
 '#65a45b','#96ac52','#c1a248','#d88c36',
 '#dd7130','#d9582e','#c83b34','#a51f3d'
];
function heatColor(value){
 if(!Number.isFinite(value))return '#202020';
 // 12 equally spaced capacity bands; >100 stays in the hottest band.
 return HEAT_COLORS[Math.min(HEAT_COLORS.length-1,Math.max(0,Math.floor(Math.max(0,value)/100*HEAT_COLORS.length)))];
}
function renderHeat(cells){
 const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
 const indexed=new Map((cells||[]).map(x=>[x.dayIndex+'-'+x.hour,x]));
 const heatmap=$('heatmap');
 const selected=heatmap.querySelector('.heat-cell[aria-pressed="true"]')?.dataset.key;
 const focused=heatmap.contains(document.activeElement);
 const tabStop=heatmap.querySelector('[tabindex="0"]')?.dataset.key||'0-7';
 let markup='<div class="heat-heading heat-corner" aria-hidden="true"></div>'+
  days.map(d=>'<div class="heat-heading">'+d+'</div>').join('');
 for(let h=7;h<23;h++){
  markup+='<div class="heat-hour">'+esc(hourLabel(h).replace(':00 ',' '))+'</div>';
  for(let d=0;d<7;d++){
   const closed=h>=(d===0||d===6?22:23);
   const v=closed?null:indexed.get(d+'-'+h),recorded=v&&Number.isFinite(v.average);
   const color=recorded?heatColor(v.average):'#202020';
   const label=closed?days[d]+' '+hourLabel(h)+': Closed':recorded?days[d]+' '+hourLabel(h)+': '+v.average+' people on average, '+(v.days||0)+' day'+(v.days===1?'':'s'):'No data for '+days[d]+' '+hourLabel(h);
   const key=d+'-'+h;
   markup+='<button type="button" class="heat-cell'+(closed?' heat-closed':!recorded?' heat-missing':'')+(selected===key?' is-selected':'')+'" style="--heat-color:'+color+
    '" data-key="'+key+'" data-info="'+esc(label)+'" aria-label="'+esc(label)+
    '" tabindex="'+(tabStop===key?0:-1)+'" aria-pressed="'+(selected===key?'true':'false')+'"></button>';
  }
 }
 heatmap.innerHTML=markup;
 const active=heatmap.querySelector('[tabindex="0"]');
 if(focused)(active||heatmap).focus({preventScroll:true});
 else if(selected){
  const chosen=heatmap.querySelector('[aria-pressed="true"]');
  showHeatDetail(chosen);
 }
}
function showHeatDetail(cell){
 if(cell&&$('heatDetail').textContent!==cell.dataset.info)$('heatDetail').textContent=cell.dataset.info;
}
function setHeatTabStop(cell){
 const previous=$('heatmap').querySelector('[tabindex="0"]');
 if(previous!==cell){
  if(previous)previous.tabIndex=-1;
  cell.tabIndex=0;
 }
}
$('heatmap').addEventListener('click',event=>{
 const cell=event.target.closest('.heat-cell');
 if(!cell)return;
 const selected=$('heatmap').querySelector('[aria-pressed="true"]');
 selected?.classList.remove('is-selected');
 selected?.setAttribute('aria-pressed','false');
 cell.classList.add('is-selected');
 cell.setAttribute('aria-pressed','true');
 setHeatTabStop(cell);
 showHeatDetail(cell);
});
$('heatmap').addEventListener('focusin',event=>{
 const cell=event.target.closest('.heat-cell');
 if(cell){setHeatTabStop(cell);showHeatDetail(cell);}
});
$('heatmap').addEventListener('pointerover',event=>{
 if(event.pointerType==='mouse'||event.pointerType==='pen')showHeatDetail(event.target.closest('.heat-cell'));
});
$('heatmap').addEventListener('keydown',event=>{
 const cell=event.target.closest('.heat-cell');
 const move={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
 if(!cell||!move)return;
 event.preventDefault();
 const [day,hour]=cell.dataset.key.split('-').map(Number);
 $('heatmap').querySelector('[data-key="'+(day+move[0])+'-'+(hour+move[1])+'"]')?.focus();
});
function renderQuieterLater(d){
 const result=window.KnotExperience?.quieterLater(d);
 const clock=m=>{const h=Math.floor(m/60);return (h%12||12)+(m%60?':'+String(m%60).padStart(2,'0'):'')+' '+(h<12?'AM':'PM');};
 const closed=result?.state==='closed',recommended=result?.state==='recommended',now=result?.state==='not_quieter';
 $('bestQuick').textContent=recommended?clock(result.start):now?'Now':closed?'Closed':result?.state==='no_window'?'No later slot':'Unavailable';
 $('bestQuickNote').textContent=recommended?result.average+' people on average':now?'No quieter hour forecast':closed?'Check tomorrow’s forecast':result?.state==='no_window'?'Not enough time before closing':'Waiting for a fresh forecast';
}
function render(d){
 lastData=d;window.dispatchEvent(new CustomEvent('knot:status',{detail:d}));

 const state=d.dataState||'offline',live=state==='live',delayed=state==='delayed',closed=state==='closed';
 const color=d.color||'#70e6a2';
 const connection=({live:'Live',delayed:'Delayed',closed:'Closed',offline:'Offline'}[state]||'Offline');
 if($('connection').textContent!==connection)$('connection').textContent=connection;$('liveDot').style.background=live?'#70e6a2':delayed?'#ffc65c':closed?'#a0a0a0':'#ff6767';
 $('count').textContent=closed||state==='offline'||!Number.isFinite(d.count)?'—':d.count;
 $('status').textContent=live?({GREAT:'Quiet',GOOD:'Moderate',BAD:'Very busy',QUIET:'Quiet',MODERATE:'Moderate',BUSY:'Busy','VERY BUSY':'Very busy','AT CAPACITY':'At capacity'}[d.label]||''):'';
 $('status').style.color=live?color:delayed?'#ffc65c':'#ff6767';
 $('open').textContent=closed?'Outside regular hours':live?'People reported':delayed?'Last reported count':'Count unavailable';
 const movement=live?(d.trend==='rising'?['↑','Getting busier']:d.trend==='falling'?['↓','Getting quieter']:['→','Steady']):null;
 $('trend').textContent=movement?movement[0]+' '+movement[1]:'No live trend';
 $('trend').style.color=live?'#fff':'#aaa';
 $('fill').style.width=closed||state==='offline'||!Number.isFinite(d.percent)?'0%':Math.min(100,d.percent)+'%';$('fill').style.background=color;
 $('capacity').textContent=closed?'Outside gym hours':state!=='offline'&&Number.isFinite(d.percent)?d.percent+'% of reference capacity':'—';
 $('updated').textContent=d.sourceUpdated?'Updated '+time(d.sourceUpdated)+' ET':'No reading received';
 const change=live?d.reportedChange30:null;
 $('rate').textContent=change&&Number.isFinite(change.change)?(change.change>0?'+':'')+change.change:'—';
 $('rateNote').textContent=change?'Reported count change':'Not enough recent data';
 $('usual').textContent=d.typicalNow==null?'—':d.typicalNow;
 $('usualNote').textContent=Number.isFinite(d.typicalNow)?'Average of past reports':'Unavailable';
 const horizon=d.forecast?.horizonMinutes;
 const hour=live&&horizon>60&&d.forecast.points?.find(p=>p.minutes===60);
 $('next').textContent=Number.isFinite(hour?.count)?hour.count:'—';
 $('nextNote').textContent=Number.isFinite(hour?.count)?'Expected crowd':
  live&&Number.isFinite(horizon)&&horizon<=60?'Closing within an hour':'Forecast unavailable';
 
 renderQuieterLater(d);
 dayChart(d);renderHeat(d.heatmap);window.updateMemberExperience?.(d);
}
function errorState(message){
 lastData=null;window.dispatchEvent(new CustomEvent('knot:status',{detail:null}));
 window.updateMemberExperience?.(null);
 $('connection').textContent='Offline';$('liveDot').style.background='#ff6767';
 $('status').textContent='';$('status').style.color='#ff6767';$('count').textContent='—';
 $('open').textContent='Count unavailable';$('trend').textContent='No live trend';$('fill').style.width='0%';
 $('rate').textContent='—';$('rateNote').textContent='Unavailable';$('next').textContent='—';$('usual').textContent='—';$('bestQuick').textContent='Unavailable';$('bestQuickNote').textContent='Unavailable';$('usualNote').textContent='—';$('nextNote').textContent='Unavailable';
 $('updated').textContent='—';$('capacity').textContent='—';
 $('dayNote').textContent='';$('forecastType').textContent='';clearChart('Unable to load counts.');
 if(!$('heatmap').children.length)renderHeat([]);
}
async function refresh(){
 if(busy)return;
 busy=true;$('refresh').setAttribute('aria-disabled','true');
 try{
  const res=await fetch('/api/status',{cache:'default',headers:{Accept:'application/json'}});
  let data;try{data=await res.json();}catch{throw Error('Firebase /api/status did not return JSON (HTTP '+res.status+'). Confirm the getOccupancy function was deployed.');}
  if(!res.ok||!data||data.ok!==true)throw Error((data&&data.error)||('API HTTP '+res.status));
  render(data);
 }catch(err){errorState(err.message||String(err));}
 finally{busy=false;$('refresh').removeAttribute('aria-disabled');}
}
$('refresh').onclick=refresh;
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
refresh();setInterval(()=>{if(!document.hidden)refresh();},30000);
const dayLayout=window.matchMedia('(max-width: 600px)');
dayLayout.addEventListener('change',()=>{if(lastData)dayChart(lastData);});
