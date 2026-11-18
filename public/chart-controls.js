'use strict';

// Give each chart one Tab stop and keep its position when a new reading arrives.
function bindChartPoints(chart, detail, previousButton, nextButton){
 let points=[],active=null,inspected=false;
 const instructions=detail.textContent;
 function updateButtons(){
  const index=points.indexOf(active);
  previousButton.setAttribute('aria-disabled',String(index<=0));
  nextButton.setAttribute('aria-disabled',String(index<0||index===points.length-1));
 }
 function move(step){
  const index=points.indexOf(active)+step;
  if(index>=0&&index<points.length){inspected=true;show(points[index]);}
 }
 previousButton.addEventListener('click',()=>move(-1));
 nextButton.addEventListener('click',()=>move(1));
 function show(point){
  if(active!==point){
   active?.setAttribute('tabindex','-1');
   point.setAttribute('tabindex','0');
   active=point;
  }
  if(detail.textContent!==point.dataset.info)detail.textContent=point.dataset.info;
  updateButtons();
 }
 function inspect(event){
  const point=event.target.closest?.('.chart-point');
  if(point){inspected=true;show(point);}
 }
 chart.addEventListener('focusin',inspect);
 chart.addEventListener('click',inspect);
 chart.addEventListener('keydown',event=>{
  const i=points.indexOf(event.target);
  if(i<0)return;
  const next={ArrowLeft:i-1,ArrowRight:i+1,Home:0,End:points.length-1}[event.key];
  if(Number.isInteger(next)){
   event.preventDefault();
   points[Math.max(0,Math.min(next,points.length-1))].focus();
  }else if(event.key==='Enter'||event.key===' '){
   event.preventDefault();
   show(event.target);
  }
 });
 return (markup,{reset=false}={})=>{
  const focused=chart.contains(document.activeElement);
  if(reset)inspected=false;
  const previous=inspected?active?.dataset:null;
  chart.innerHTML=markup;
  points=[...chart.querySelectorAll('.chart-point')].sort((a,b)=>Number(a.dataset.time)-Number(b.dataset.time));
  active=previous&&points.find(p=>p.dataset.time===previous.time&&p.dataset.kind===previous.kind);
  if(!active&&previous&&points.length){
   active=points.reduce((best,point)=>Math.abs(point.dataset.time-previous.time)<Math.abs(best.dataset.time-previous.time)?point:best);
  }
  active??=points[0];
  active?.setAttribute('tabindex','0');
  updateButtons();
  if(previous&&active)show(active);
  else if(detail.textContent!==instructions)detail.textContent=instructions;
  if(focused)(active||chart).focus({preventScroll:true});
 };
}
