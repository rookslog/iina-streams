"use strict";
const config=require('./config.js');
const Sources=require('./src/source.js');
const {TwitchAuth}=require('./src/auth.js');
const {create:createTimers}=require('./src/timers.js');
const {global:app,menu,utils,file,http}=iina;
const timers=createTimers(setTimeout,clearTimeout);
const audience=new Set(),managed=new Set(),sessions=new Map();let credentials=null;
const qaEvents=[];
function qaTrace(phase,data){if(!config.qa)return;qaEvents.push(Object.assign({phase,time:new Date().toISOString()},data||{}));if(qaEvents.length>60)qaEvents.shift();file.write('@data/qa-global.json',JSON.stringify(qaEvents));}
function targetID(label){if(typeof label!=='string')return null;const match=/^([1-9][0-9]*)-/.exec(label);if(!match)return null;const id=Number(match[1]);return managed.has(id)&&label===id+'-'+config.identifier?id:null;}
function createPlayer(options){const id=app.createPlayerInstance(options);if(typeof id==='number'){managed.add(id);sessions.set(id,0);}qaTrace('created',{id,type:typeof id});return id;}
function nextSession(id){sessions.set(id,(sessions.get(id)||0)+1);}
function postChild(id,name,data){
 if(!managed.has(id))return;
 let wire;try{wire=JSON.stringify(data);}catch(_){return;}
 if(typeof wire!=='string'||wire.length>8192)return;
 const token=name==='auth-ready'&&data.token,session=sessions.get(id);
 // Match the successful native probe: use a primitive payload after the
 // originating child call has returned. Never enqueue native objects.
 timers.setTimeout(()=>{
  if(!managed.has(id)||session!==sessions.get(id))return;
  if((name==='auth-state'||name==='auth-ready')&&!audience.has(id))return;
  if(name==='auth-ready'&&(!credentials||credentials.token!==token))return;
  app.postMessage(id,name,wire);
 },0);
}
function sendAll(name,data){if(name==='auth-state')qaTrace('auth-state',{state:data.phase,targets:Array.from(audience)});for(const id of audience)postChild(id,name,data);}
function normalizeHttpResponse(response){
 const status=Number(response&&response.statusCode);
 let data=response&&response.data;
 if(!data||typeof data!=='object'||Array.isArray(data)){
  try{data=JSON.parse(response&&typeof response.text==='string'?response.text:'{}');}catch(_){data={};}
 }
 return{status:Number.isInteger(status)&&status>=100&&status<=599?status:0,data:data&&typeof data==='object'&&!Array.isArray(data)?data:{}};
}
const globalDiag=[];
function gLog(step,extra){
 if(!config.beta&&!config.qa)return;
 try{
  globalDiag.push(Object.assign({step,t:Date.now()},extra||{}));
  if(globalDiag.length>60)globalDiag.shift();
  file.write('@data/beta-global.json',JSON.stringify(globalDiag));
 }catch(_){}
}
async function request(path,method,form,headers){
 gLog('http-start',{path,method});
 try{
  const options={headers:headers||{}};
  if(form)options.data=form;
  const r=await http[method==='POST'?'post':'get']('https://id.twitch.tv/oauth2'+path,options);
  const res=normalizeHttpResponse(r);
  gLog('http-done',{path,status:res.status});
  return res;
 }catch(response){
  const res=normalizeHttpResponse(response);
  gLog('http-catch',{path,status:res.status});
  return res;
 }
}
const auth=new TwitchAuth({request,read:()=>typeof utils.keychainRead==='function'?utils.keychainRead('twitch-readonly','oauth'):utils.keyChainRead('twitch-readonly','oauth'),write:value=>typeof utils.keychainWrite==='function'?utils.keychainWrite('twitch-readonly','oauth',value):utils.keyChainWrite('twitch-readonly','oauth',value),setTimer:timers.setTimeout,clearTimer:timers.clearTimeout,now:()=>Date.now(),onState:s=>sendAll('auth-state',s),onReady:c=>{credentials=c;sendAll('auth-ready',c);},onStop:()=>{credentials=null;sendAll('auth-stop',{});}});
function openStream(input){
 if(input===undefined)input=utils.prompt('Twitch channel, Twitch recording, or YouTube URL');
 if(!input)return;
 const source=Sources.parse(input);
 if(!source){utils.ask('Enter a Twitch channel or recording URL, or a YouTube video or livestream URL.');return;}
 createPlayer({url:source.url,enablePlugins:false,disableWindowAnimation:true,label:Sources.label(source,config.variant)});
}
menu.addItem(menu.item('Open Stream…',()=>openStream(),{keyBinding:'Meta+Shift+S'}));
app.onMessage('open',()=>openStream());
app.onMessage('auth-connect',async(data,label)=>{
 const id=targetID(label);qaTrace('auth-connect',{sender:label,id,managed:Array.from(managed)});gLog('auth-connect',{id,phase:auth.snapshot().phase,hasCred:!!credentials});if(id===null)return;nextSession(id);audience.add(id);
 if(credentials){postChild(id,'auth-state',auth.snapshot());postChild(id,'auth-ready',credentials);return;}
 if(['waiting','authorizing'].includes(auth.snapshot().phase)){postChild(id,'auth-state',auth.snapshot());return;}
 let clientID=String(data&&data.clientID||'').trim();
 try{if(!clientID&&file.exists('@data/twitch-client.json'))clientID=JSON.parse(file.read('@data/twitch-client.json')).clientID||'';}catch(_){}
 if(!clientID){
  try{
   const raw=typeof utils.keychainRead==='function'?utils.keychainRead('twitch-readonly','oauth'):utils.keyChainRead('twitch-readonly','oauth');
   const saved=typeof raw==='string'&&raw?JSON.parse(raw):null;
   if(saved&&/^[A-Za-z0-9]{10,64}$/.test(saved.clientID||''))clientID=saved.clientID;
  }catch(_){}
 }
 if(/^[A-Za-z0-9]{10,64}$/.test(clientID))file.write('@data/twitch-client.json',JSON.stringify({clientID}));
 gLog('auth-connect-run',{hasClient:/^[A-Za-z0-9]{10,64}$/.test(clientID)});
 await auth.connect(clientID);
});
app.onMessage('auth-probe',(_,label)=>{
 const id=targetID(label);gLog('auth-probe',{id,hasCred:!!credentials});if(id===null)return;
 if(credentials){postChild(id,'auth-status',{saved:true,login:credentials.login});return;}
 let saved=false;
 try{
  const raw=typeof utils.keychainRead==='function'?utils.keychainRead('twitch-readonly','oauth'):utils.keyChainRead('twitch-readonly','oauth');
  const parsed=typeof raw==='string'&&raw?JSON.parse(raw):null;
  saved=!!(parsed&&typeof parsed.access_token==='string'&&parsed.access_token&&typeof parsed.clientID==='string'&&parsed.clientID);
 }catch(_){}
 gLog('auth-probe-reply',{id,saved});
 postChild(id,'auth-status',{saved});
});
app.onMessage('auth-disconnect',(_,label)=>{const id=targetID(label);if(id===null)return;nextSession(id);audience.delete(id);if(!audience.size)auth.stop();});
app.onMessage('player-closed',(_,label)=>{const id=targetID(label);if(id===null)return;audience.delete(id);managed.delete(id);sessions.delete(id);if(!audience.size)auth.stop();});
app.onMessage('auth-forget',async(_,label)=>{const id=targetID(label);if(id===null)return;nextSession(id);const pending=auth.forget();audience.clear();const result=await pending;if(result&&!result.stale&&managed.has(id))postChild(id,'auth-forgotten',result);});
if(config.qa){
 app.onMessage('qa-ping',(_,label)=>{const id=targetID(label);qaTrace('ping',{id,sender:label});setTimeout(()=>{if(id!==null)app.postMessage(id,'qa-pong','number-string-deferred');},0);});
 app.onMessage('qa-open',data=>openStream(data&&data.url));
 const q=config.qa;
 const source=q.source;
 createPlayer({url:source.url,enablePlugins:false,disableWindowAnimation:true,label:source.kind==='local-test'?'streams-candidate:qa-local':Sources.label(source,q.variant||config.variant)});
}
