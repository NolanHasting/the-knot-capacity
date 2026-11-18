'use strict';
(()=>{
 const el=id=>document.getElementById(id);
 const input=el('historyDate'),summary=el('historySummary'),legend=el('forecastType'),svg=el('dayChart'),note=el('dayNote');
 let lastGraph=null,request=null,latest=lastData,statusReceived=Boolean(latest);
 const setGraph=setDayChart;
 const motionButton=el('chartMotion');
 function updateMotionButton(){
  const hidden=reduceMotion.matches||!svg.querySelector('.now-dot');
  if(hidden&&document.activeElement===motionButton)el('historyToday').focus({preventScroll:true});
  motionButton.hidden=hidden;
 }
 motionButton.addEventListener('click',()=>{
  const paused=svg.classList.toggle('pulse-paused');
  motionButton.textContent=paused?'Resume pulse':'Pause pulse';
 });
 reduceMotion.addEventListener('change',updateMotionButton);
 const series=[...document.querySelectorAll('.legend [data-series]')];
 function showSeries(...visible){
  for(const item of series)item.hidden=!visible.includes(item.dataset.series);
 }
 const mobileLayout=window.matchMedia('(max-width: 600px)');
 const zone='America/New_York',parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const dayFmt=new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'long',month:'long',day:'numeric',year:'numeric'});
 const localDay=(d)=>{
  const p=Object.fromEntries(parts.formatToParts(d).map(x=>[x.type,x.value]));
  return p.year+'-'+p.month+'-'+p.day;
 };
 const localMinute=s=>{
  const p=Object.fromEntries(parts.formatToParts(new Date(s)).map(x=>[x.type,x.value]));
  return Number(p.hour)*60+Number(p.minute);
 };
 const tick=m=>{let h=Math.floor(m/60);return (h%12||12)+(m%60?':'+String(m%60).padStart(2,'0'):'')+(h<12?' AM':' PM');};
 const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function graph(data){
  lastGraph=data;
  const mobile=mobileLayout.matches;
  svg.setAttribute('viewBox',mobile?'0 0 360 245':'0 0 760 285');
  const isFuture=data.mode==='future',source=isFuture?data.points:data.points.map(p=>({...p,minute:localMinute(p.timestamp)}));
  if(!source.length){setGraph('<text x="40" y="155" fill="#aaa">No data for this date.</text>',{reset:true});return;}
  const minX=7*60,maxX=23*60;
  const observed=source.filter(p=>Number.isFinite(p.count));
  if(!observed.length){setGraph('<text x="40" y="155" fill="#aaa">No data for this date.</text>',{reset:true});return;}
  const peak=Math.max(100,...observed.map(p=>Math.max(p.count,p.high||0))),ceiling=Math.ceil(peak/25)*25;
  const left=mobile?37:45,right=mobile?350:743,top=20,bottom=mobile?204:246;
  const x=m=>left+(m-minX)/(maxX-minX)*(right-left);
  const y=v=>bottom-v/ceiling*(bottom-top);
  let html='';
  for(let i=0;i<=5;i++){
   const n=ceiling*i/5,yy=y(n);
   html+='<line x1="'+left+'" x2="'+right+'" y1="'+yy+'" y2="'+yy+'" stroke="#292929"/><text x="'+(left-7)+'" y="'+(yy+4)+'" text-anchor="end" fill="#aaa" font-size="11">'+Math.round(n)+'</text>';
  }
for (let h = 7; h <= 23; h += mobile ? 4 : 2) {
  const anchor = mobile && h === 23
    ? 'end'
    : mobile && h === 7
      ? 'start'
      : 'middle';

  html += '<text x="' + x(h * 60) +
    '" y="' + (mobile ? 230 : 268) +
    '" text-anchor="' + anchor +
    '" fill="#aaa" font-size="' +
    (mobile ? 11 : 10) + '">' +
    safe(tick(h * 60)) + '</text>';
}
  let path='',prev=null;
  for(const p of source){
   if(!Number.isFinite(p.count)){prev=null;continue;}
   const curX=x(p.minute),curY=y(p.count);
   const contiguous=prev&&p.minute-prev.minute<=(isFuture?16:10)&&p.minute>=prev.minute;
   path+=(contiguous?'L':'M')+curX.toFixed(1)+' '+curY.toFixed(1)+' ';
   prev=p;
  }
  if(isFuture){
   // Draw separate ribbons; missing data must remain empty instead of being interpolated.
   const runs=[];let run=[];
   for(const p of source){
    if(!Number.isFinite(p.count)||!Number.isFinite(p.low)||!Number.isFinite(p.high)){
     if(run.length>1)runs.push(run);run=[];continue;
    }
    if(run.length&&p.minute-run[run.length-1].minute>16){
     if(run.length>1)runs.push(run);run=[];
    }
    run.push(p);
   }
   if(run.length>1)runs.push(run);
   for(const points of runs){
    const upper=points.map((p,i)=>(i?'L':'M')+x(p.minute).toFixed(1)+' '+y(p.high).toFixed(1)).join(' ');
    const lower=points.slice().reverse().map(p=>'L'+x(p.minute).toFixed(1)+' '+y(p.low).toFixed(1)).join(' ');
    html+='<path d="'+upper+' '+lower+' Z" fill="#f0c468" opacity=".12"/>';
   }
  }
  html+='<line x1="'+left+'" x2="'+right+'" y1="'+y(100)+'" y2="'+y(100)+'" stroke="#cc7676" stroke-dasharray="5 5" opacity=".8"/>';
  html+='<path d="'+path+'" stroke="'+(isFuture?'#f0c468':'#fff')+'" stroke-width="2.4" fill="none" stroke-linejoin="round" stroke-linecap="round"'+(isFuture?' stroke-dasharray="6 4"':'')+'/>';
  if(!isFuture){
   for(let i=0;i<source.length;i+=Math.max(1,Math.ceil(source.length/130))){
    const p=source[i];
    if(!Number.isFinite(p.count)||!Number.isFinite(p.minute))continue;
    html+='<circle class="chart-point" cx="'+x(p.minute)+'" cy="'+y(p.count)+'" r="'+(mobile?10:5)+'" fill="transparent" stroke="none" tabindex="-1" data-time="'+p.minute+'" data-kind="reported" role="button" aria-label="'+safe(tick(p.minute)+': '+p.count+' reported')+'" data-info="'+safe(tick(p.minute)+': '+p.count+' reported')+'"/>';
   }
  }
  if(!isFuture){
   for(const event of (data.recounts||[])){
    if(!Number.isFinite(event.count)||!Number.isFinite(Date.parse(event.timestamp)))continue;
    const mx=x(localMinute(event.timestamp)),my=y(event.count);
    const info='Inferred recount · '+tick(localMinute(event.timestamp))+' · '+event.count+' reported · down '+event.drop;
    html+='<path d="M'+mx+' '+(my-6)+' l6 6 -6 6 -6 -6 Z" class="recount-mark" stroke="#111" stroke-width="1.5"><title>'+safe(info)+'</title></path>';
    html+='<circle class="chart-point" cx="'+mx+'" cy="'+my+'" r="'+(mobile?12:10)+'" fill="transparent" tabindex="-1" data-time="'+localMinute(event.timestamp)+'" data-kind="recount" role="button" aria-label="'+safe(info)+'" data-info="'+safe(info)+'"/>';
   }
  }
  if(isFuture){
   for(const p of observed){
    const info=tick(p.minute)+': '+p.count+(p.assumedClose?' at closing':' forecast');
    html+='<circle class="chart-point" cx="'+x(p.minute)+'" cy="'+y(p.count)+'" r="'+(mobile?5.5:4.2)+'" fill="#f0c468" tabindex="-1" data-time="'+p.minute+'" data-kind="forecast" role="button" aria-label="'+safe(info)+'" data-info="'+safe(info)+'"><title>'+safe(info)+'</title></circle>';
   }
  }
  setGraph(html);
 }
 function showToday(){
  if(summary.textContent!=='Today')summary.textContent='Today';
  if(latest){
   dayChart(latest);
   const forecast=latest.dataState==='live'&&Array.isArray(latest.forecast?.points)?latest.forecast.points:[];
   const series=['reported'];
   if(forecast.length>1)series.push('forecast');
   if(forecast.length>1&&forecast.every(p=>Number.isFinite(p.low)&&Number.isFinite(p.high)))series.push('range');
   if(latest.recounts?.length)series.push('recounts');
   showSeries(...(latest.todayHistory?.length?series:[]));
  }else{
   legend.textContent='';note.textContent='';showSeries();
   clearChart(statusReceived?'Unable to load today’s counts.':'Waiting for today’s counts…');
  }
  updateMotionButton();
 }
 async function load(){
  updateDateBounds();
  const date=input.value;if(!date||!input.validity.valid)return;
  request?.abort();request=null;lastGraph=null;
  setGraph('',{reset:true});
  updateMotionButton();
  if(date===today){showToday();return;}
  const controller=new AbortController();request=controller;
  summary.textContent='Loading…';note.textContent='';legend.textContent='';showSeries();
  setGraph('<text x="40" y="155" fill="#aaa">Loading…</text>');
  try{
   const res=await fetch('/api/history?date='+encodeURIComponent(date),{cache:'no-store',signal:controller.signal});
   const d=await res.json();
   if(controller.signal.aborted)return;
   if(!res.ok||!d.ok)throw Error(d.error||'Unable to load date');
   const label=dayFmt.format(new Date(date+'T12:00:00Z'));
   if(d.mode==='historical'){
    summary.textContent=label+(d.summary.readings?' · avg. '+d.summary.average+' · peak '+d.summary.max:' · No counts recorded');
    legend.textContent='Reported';
    showSeries(...(d.points.length?['reported',...(d.recounts?.length?['recounts']:[])]:[]));
   }else{
    summary.textContent=label;
    legend.textContent='Forecast';
    if(d.points.some(p=>Number.isFinite(p.count)))showSeries('forecast',...(d.points.some(p=>Number.isFinite(p.low)&&Number.isFinite(p.high))?['range']:[]));
   }
   note.textContent=d.mode==='future'?(d.points.length?'The shaded area shows the forecast range.':'Forecast unavailable for this date.'):'Reported counts and inferred recounts.';
   graph(d);
  }catch(e){
   if(controller.signal.aborted)return;
   summary.textContent='Could not load this date';note.textContent='Please try again.';setGraph('',{reset:true});
  }
 }
 let today;
 function updateDateBounds(){
  const day=localDay(new Date());
  if(day===today)return;
  if(!today||input.value===today)input.value=day;
  today=day;input.min=addFrom(day,-120);input.max=addFrom(day,30);
 }
 input.addEventListener('change',load);
 window.addEventListener('knot:status',event=>{
  latest=event.detail;statusReceived=true;
  updateDateBounds();
  if(input.value===today)showToday();
 });
 mobileLayout.addEventListener('change',()=>{
  if(input.value===today)showToday();
  else if(lastGraph)graph(lastGraph);
 });
 el('historyToday').onclick=()=>{input.value=localDay(new Date());load();};
 el('historyTomorrow').onclick=()=>{input.value=addFrom(localDay(new Date()),1);load();};
 el('historyPrevious').onclick=()=>{if(input.value>input.min){input.value=addFrom(input.value,-1);load();}};
 el('historyNext').onclick=()=>{if(input.value<input.max){input.value=addFrom(input.value,1);load();}};
 function addFrom(value,n){const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
 load();
})();
