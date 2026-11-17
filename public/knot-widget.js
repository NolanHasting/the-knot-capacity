// Scriptable small widget. Independent project.
const endpoint='https://climbtheknot.live/api/status';
const w=new ListWidget();w.backgroundColor=new Color('#101410');w.setPadding(12,12,12,12);w.url='https://climbtheknot.live/';w.refreshAfterDate=new Date(Date.now()+5*60000);
function text(s,size,color,bold=false){const t=w.addText(String(s));t.font=bold?Font.boldSystemFont(size):Font.systemFont(size);t.textColor=new Color(color);t.lineLimit=1;t.minimumScaleFactor=.7;return t;}
let d=null;try{const r=new Request(endpoint);r.timeoutInterval=10;d=await r.loadJSON();if(!d.ok)d=null;}catch{}
const age=d?.sourceUpdated?(Date.now()-Date.parse(d.sourceUpdated))/60000:Infinity;
const state=d?.dataState==='closed'?'closed':d?.dataState==='live'&&age<=4&&age>=0?'live':d&&age>=0&&age<=30?'delayed':'offline';
text('THE KNOT  •  '+state.toUpperCase(),11,state==='live'?'#83e2a0':state==='delayed'?'#ffc65c':state==='closed'?'#aaaaaa':'#ff6767',true);w.addSpacer(2);
text(state==='closed'||state==='offline'||!Number.isFinite(d?.count)?'—':d.count,47,'#ffffff',true);
const label={GREAT:'Quiet',GOOD:'Moderate',BAD:'Very busy',QUIET:'Quiet',MODERATE:'Moderate',BUSY:'Busy','VERY BUSY':'Very busy','AT CAPACITY':'At capacity'};
text(state==='live'?(label[d.label]||d.label):state==='closed'?'Closed':state==='delayed'?'Last known count':'Unavailable',14,'#bce1c3',true);
if(state==='live')text(d.trend==='rising'?'↑ Filling up':d.trend==='falling'?'↓ Decreasing':'→ Steady',11,'#d5d5d5');
w.addSpacer();text(d?.sourceUpdated?'Updated: '+new Date(d.sourceUpdated).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'}):'No update',10,'#aaaaaa');
if(config.runsInWidget)Script.setWidget(w);else await w.presentSmall();Script.complete();
