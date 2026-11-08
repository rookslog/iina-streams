"use strict";
const config=require('./config.js');
const Sources=require('./src/source.js');
const {TwitchAuth}=require('./src/auth.js');
const {global:app,menu,utils,file,http}=iina;
const audience=new Set(),managed=new Set();let credentials=null;
function targetID(label){if(typeof label!=='string')return null;const match=/^([1-9][0-9]*)-/.exec(label);if(!match)return null;const id=Number(match[1]);return managed.has(id)&&label===id+'-'+config.identifier?id:null;}
function createPlayer(options){const id=app.createPlayerInstance(options);if(typeof id==='number')managed.add(id);return id;}
function sendAll(name,data){for(const id of audience)app.postMessage(id,name,data);}
async function request(path,method,form,headers){
 try{
  const options={headers:headers||{}};
  if(form)options.data=form;
  const r=await http[method==='POST'?'post':'get']('https://id.twitch.tv/oauth2'+path,options);
  return{status:r.statusCode,data:r.data||JSON.parse(r.text||'{}')};
 }catch(error){return{status:0,data:{}};}
}
const auth=new TwitchAuth({request,read:()=>typeof utils.keychainRead==='function'?utils.keychainRead('twitch-readonly','oauth'):utils.keyChainRead('twitch-readonly','oauth'),write:value=>typeof utils.keychainWrite==='function'?utils.keychainWrite('twitch-readonly','oauth',value):utils.keyChainWrite('twitch-readonly','oauth',value),setTimer:(fn,ms)=>setTimeout(fn,ms),clearTimer:t=>clearTimeout(t),now:()=>Date.now(),onState:s=>sendAll('auth-state',s),onReady:c=>{credentials=c;sendAll('auth-ready',c);},onStop:()=>{credentials=null;sendAll('auth-stop',{});}});
function openStream(input){
 if(input===undefined)input=utils.prompt('Twitch channel, Twitch recording, or YouTube URL');
 if(!input)return;
 const source=Sources.parse(input);
 if(!source){utils.ask('Enter a Twitch channel or recording URL, or a YouTube video or livestream URL.');return;}
 createPlayer({url:source.url,enablePlugins:false,label:Sources.label(source,config.variant)});
}
menu.addItem(menu.item('Open Stream — '+(config.variant==='focus'?'Focus':'Unified')+'…',()=>openStream()));
app.onMessage('open',()=>openStream());
app.onMessage('auth-connect',async(data,label)=>{
 const id=targetID(label);if(id===null)return;audience.add(id);
 if(credentials){app.postMessage(id,'auth-state',auth.snapshot());app.postMessage(id,'auth-ready',credentials);return;}
 if(['waiting','authorizing'].includes(auth.snapshot().phase)){app.postMessage(id,'auth-state',auth.snapshot());return;}
 let clientID=String(data&&data.clientID||'');
 try{if(!clientID&&file.exists('@data/twitch-client.json'))clientID=JSON.parse(file.read('@data/twitch-client.json')).clientID||'';}catch(_){}
 if(/^[A-Za-z0-9]{10,64}$/.test(clientID))file.write('@data/twitch-client.json',JSON.stringify({clientID}));
 await auth.connect(clientID);
});
app.onMessage('auth-disconnect',(_,label)=>{const id=targetID(label);if(id===null)return;audience.delete(id);if(!audience.size)auth.stop();});
app.onMessage('player-closed',(_,label)=>{const id=targetID(label);if(id===null)return;audience.delete(id);managed.delete(id);if(!audience.size)auth.stop();});
app.onMessage('auth-forget',async()=>{await auth.forget();audience.clear();});
if(config.qa){
 const q=config.qa;
 const source=q.source;
 createPlayer({url:source.url,enablePlugins:false,label:source.kind==='local-test'?'streams-candidate:qa-local':Sources.label(source,q.variant||config.variant)});
}
