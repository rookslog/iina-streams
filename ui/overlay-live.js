"use strict";
(function(root){
 const post=(name,data)=>iina.postMessage(name,data);
 const on=(name,fn)=>iina.onMessage(name,payload=>{
  try{fn(JSON.parse(decodeURIComponent(payload.encoded)));}catch(_){}
 });
 const errors={
  'authentication-failed':'Authorization was rejected. Reconnect to chat.',
  'capability-rejected':'Twitch could not initialize chat. Turn it off and connect again.',
  'invalid-configuration':'Chat could not start. Turn it off and connect again.',
  'retry-exhausted':'Chat could not reconnect. Turn it off and connect again.',
  'protocol-limit':'The chat server response exceeded its limits.',
  'transport-unavailable':'Chat transport is unavailable.'
 };
 let client=null,history=[],session=0,closed=false;
 // Moderation in one batch. Replays the batch one event at a time and records the message ids each
 // clear-message or clear-user removed. Rollover past the 150 window is not moderation, so it is not reported.
 function moderationOf(before,events){
  const removed=[];
  let clearedAll=false;
  let state=before;
  for(const event of Array.isArray(events)?events:[]){
   const next=root.StreamsLiveHistory.reduce(state,[event],150);
   if(event&&event.type==='clear-all')clearedAll=true;
   else if(event&&(event.type==='clear-message'||event.type==='clear-user')){
    const kept=new Set(next.map(row=>row.id));
    for(const row of state)if(row.kind==='message'&&row.id&&!kept.has(row.id))removed.push(row.id);
   }
   state=next;
  }
  return{removed,clearedAll};
 }
 function ensureClient(){
  if(!client&&root.StreamsLive&&root.StreamsLiveHistory){
   client=root.StreamsLive.create({
    onStatus:state=>{
     if(session)post('live-state',{session,state:state.phase,message:errors[state.reason]||''});
    },
    onBatch:events=>{
     if(!session)return;
     const previous=history;
     history=root.StreamsLiveHistory.reduce(history,events,150);
     const moderation=moderationOf(previous,events);
     post('live-messages',{session,messages:history,removed:moderation.removed,clearedAll:moderation.clearedAll});
    }
   });
  }
  return client;
 }
 function stop(){
  session=0;history=[];
  if(client)client.stop();
 }
 on('live-config',data=>{
  if(closed||!data||!Number.isSafeInteger(data.session)||data.session<1)return;
  stop();
  session=data.session;
  const active=ensureClient();
  if(active)active.start({token:data.token,login:data.login,channel:data.channel});
  else post('live-state',{session,state:'error',message:'Live chat client is unavailable.'});
 });
 on('live-stop',stop);
 root.addEventListener('pagehide',()=>{
  closed=true;session=0;history=[];
  if(client){client.destroy();client=null;}
 });
})(window);
