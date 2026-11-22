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
 let client=null,history=[],session=0,closed=false,channelName='';
 const clip=(value,length)=>typeof value==='string'?value.slice(0,length):'';
 const room=value=>clip(value,26).replace(/^#/,'').toLowerCase();

 // Moderation in one batch, as intents plus effects. The player may still hold a message that rolled out of this
 // 150-message window, so every clear-message id and every clear-user identity of this channel is reported, whether
 // or not the window held the target. The ids that left the window by those events are added too (duplicates are fine).
 function moderationOf(before,events){
  const removed=[];
  const removedUsers=[];
  let clearedAll=false;
  let state=before;
  for(const event of Array.isArray(events)?events:[]){
   const next=root.StreamsLiveHistory.reduce(state,[event],150);
   const ours=!!event&&room(event.channel)===channelName;
   if(ours&&event.type==='clear-all')clearedAll=true;
   else if(ours&&event.type==='clear-message'){
    const id=clip(event.id,128);
    if(id)removed.push(id);
   }else if(ours&&event.type==='clear-user'){
    removedUsers.push({userId:clip(event.userId,128),login:clip(event.login,25).toLowerCase()});
   }
   if(ours&&(event.type==='clear-message'||event.type==='clear-user')){
    const kept=new Set(next.map(row=>row.id));
    for(const row of state)if(row.kind==='message'&&row.id&&!kept.has(row.id))removed.push(row.id);
   }
   state=next;
  }
  return{removed:Array.from(new Set(removed)),removedUsers,clearedAll};
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
     post('live-messages',{session,messages:history,removed:moderation.removed,removedUsers:moderation.removedUsers,clearedAll:moderation.clearedAll});
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
  channelName=room(data.channel);
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
