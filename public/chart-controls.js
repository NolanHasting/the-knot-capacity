'use strict';

// Keep the selected reading visible when the chart refreshes.
function bindChartPoints(chart, detail){
 let selected=null;
 const instructions=detail.textContent;
 function show(point){
  selected={time:point.dataset.time,kind:point.dataset.kind};
  if(detail.textContent!==point.dataset.info)detail.textContent=point.dataset.info;
 }
 chart.addEventListener('click',event=>{
  const point=event.target.closest?.('.chart-point');
  if(point)show(point);
 });
 return (markup,{reset=false}={})=>{
  if(reset)selected=null;
  chart.innerHTML=markup;
  if(selected){
   const points=[...chart.querySelectorAll('.chart-point')];
   const point=points.find(p=>p.dataset.time===selected.time&&p.dataset.kind===selected.kind);
   if(point){show(point);return;}
  }
  selected=null;
  if(detail.textContent!==instructions)detail.textContent=instructions;
 };
}
