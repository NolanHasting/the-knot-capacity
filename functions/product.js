'use strict';
const events=new Set(['page_view','return_visit','preference_saved','feedback_submitted','overlay_saved','share_initiated','widget_guide_opened','install_prompt','reminder_saved','plan_view','trends_view','navigation','history_date_selected','heatmap_interaction']);
const channels=new Set(['share','print','installed','referral','direct']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateEvent(b){if(!b||typeof b!=='object'||Array.isArray(b)||!events.has(b.event)||!channels.has(b.channel)||typeof b.visitor!=='string'||typeof b.session!=='string'||!uuid.test(b.visitor)||!uuid.test(b.session))throw Error('Invalid event');return {event:b.event,channel:b.channel,visitor:b.visitor.toLowerCase(),session:b.session.toLowerCase()};}
function aggregate(d,e,flags){const out={...d,accepted:(d.accepted||0)+1,events:{...d.events,[e.event]:(d.events?.[e.event]||0)+1},channels:{...d.channels}};
 if(flags.newDay){out.visitors=(d.visitors||0)+1;if(flags.isNew)out.newVisitors=(d.newVisitors||0)+1;if(flags.returning)out.returningVisitors=(d.returningVisitors||0)+1;}
 if(flags.newSession){out.sessions=(d.sessions||0)+1;out.channels[e.channel]=(out.channels[e.channel]||0)+1;}
 return out;
}
function feedbackView(d){return {kind:d.kind,message:d.message,crowd:d.crowd,accuracy:d.accuracy,observedCount:d.observedCount,createdAt:d.createdAt,context:d.context,reviewState:d.reviewState};}
module.exports={validateEvent,aggregate,feedbackView};
