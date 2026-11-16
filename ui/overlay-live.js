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
 function ensureClient(){
  if(!client&&root.StreamsLive&&root.StreamsLiveHistory){
   client=root.StreamsLive.create({
    onStatus:state=>{
     if(session)post('live-state',{session,state:state.phase,message:errors[state.reason]||''});
    },
    onBatch:events=>{
     if(!session)return;
     history=root.StreamsLiveHistory.reduce(history,events,150);
     post('live-messages',{session,messages:history});
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
