"use strict";
const config=require('./config.js');
const Sources=require('./src/source.js');
const {TwitchAuth}=require('./src/auth.js');
const BuiltInApp=require('./src/twitch-app.js');
const {create:createTimers}=require('./src/timers.js');
const {global:app,menu,utils,file,http,standaloneWindow:openWindow}=iina;
const timers=createTimers(setTimeout,clearTimeout);
// Players that requested auth state, players this entry created, and each player's message session.
const audience=new Set(),managed=new Set(),sessions=new Map();
let credentials=null;
const qaEvents=[];
// The user's own Twitch app Client ID, when they entered one.
const CLIENT_FILE='@data/twitch-client.json';
const globalDiag=[];

function qaTrace(phase,data){
 if(!config.qa)return;
 qaEvents.push(Object.assign({phase,time:new Date().toISOString()},data||{}));
 if(qaEvents.length>60)qaEvents.shift();
 file.write('@data/qa-global.json',JSON.stringify(qaEvents));
}

// A sender label is "<player id>-<plugin identifier>"; accept only players this entry created.
function targetID(label){
 if(typeof label!=='string')return null;
 const match=/^([1-9][0-9]*)-/.exec(label);
 if(!match)return null;
 const id=Number(match[1]);
 return managed.has(id)&&label===id+'-'+config.identifier?id:null;
}

function createPlayer(options){
 const id=app.createPlayerInstance(options);
 if(typeof id==='number'){
  managed.add(id);
  sessions.set(id,0);
 }
 qaTrace('created',{id,type:typeof id});
 return id;
}

function nextSession(id){
 sessions.set(id,(sessions.get(id)||0)+1);
}

function postChild(id,name,data){
 if(!managed.has(id))return;
 let wire;
 try{
  wire=JSON.stringify(data);
 }catch(_){
  return;
 }
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

function sendAll(name,data){
 if(name==='auth-state')qaTrace('auth-state',{state:data.phase,targets:Array.from(audience)});
 for(const id of audience)postChild(id,name,data);
}

function normalizeHttpResponse(response){
 const status=Number(response&&response.statusCode);
 let data=response&&response.data;
 if(!data||typeof data!=='object'||Array.isArray(data)){
  try{
   data=JSON.parse(response&&typeof response.text==='string'?response.text:'{}');
  }catch(_){
   data={};
  }
 }
 return{
  status:Number.isInteger(status)&&status>=100&&status<=599?status:0,
  data:data&&typeof data==='object'&&!Array.isArray(data)?data:{}
 };
}

function gLog(step,extra){
 if(!config.beta&&!config.qa)return;
 try{
  globalDiag.push(Object.assign({step,t:Date.now()},extra||{}));
  if(globalDiag.length>60)globalDiag.shift();
  file.write('@data/beta-global.json',JSON.stringify(globalDiag));
 }catch(_){}
}

// The saved Twitch login (a JSON string). Prefer the keychainRead spelling; fall back to keyChainRead.
function readSavedLogin(){
 if(typeof utils.keychainRead==='function')return utils.keychainRead('twitch-readonly','oauth');
 return utils.keyChainRead('twitch-readonly','oauth');
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

const auth=new TwitchAuth({
 request,
 read:readSavedLogin,
 write:value=>typeof utils.keychainWrite==='function'?
  utils.keychainWrite('twitch-readonly','oauth',value):utils.keyChainWrite('twitch-readonly','oauth',value),
 setTimer:timers.setTimeout,
 clearTimer:timers.clearTimeout,
 now:()=>Date.now(),
 onState:s=>sendAll('auth-state',s),
 onReady:c=>{
  credentials=c;
  sendAll('auth-ready',c);
 },
 onStop:()=>{
  credentials=null;
  sendAll('auth-stop',{});
 }
});

// ---- Open Stream (#50): no blocking dialog. Input comes from the standalone window or a sidebar field. ----

const OPEN_PAGE='ui/open.html';

// Opens a player for the input. Returns 'opened', 'invalid', or 'blank' when there is nothing to open.
function openInput(input){
 if(typeof input!=='string'||!input.trim())return'blank';
 const source=Sources.parse(input);
 if(!source)return'invalid';
 const label=Sources.label(source,config.variant);
 createPlayer({url:source.url,enablePlugins:false,disableWindowAnimation:true,label});
 return'opened';
}

// With no input, show the Open Stream window; otherwise open the input directly.
function openStream(input){
 if(input===undefined){
  showOpenWindow();
  return;
 }
 openInput(input);
}

// Brings the window forward if it is open. Otherwise loads a fresh page, which clears every
// onMessage listener in IINA 1.5.1, so the listeners are registered after loadFile.
function showOpenWindow(){
 if(openWindow.isOpen()){
  openWindow.open();
  return;
 }
 openWindow.loadFile(OPEN_PAGE);
 openWindow.onMessage('open-stream',onOpenWindowSubmit);
 openWindow.onMessage('open-cancel',()=>openWindow.close());
 openWindow.setProperty({title:'Open Stream',resizable:false});
 openWindow.setFrame(380,84);
 openWindow.open();
}

function onOpenWindowSubmit(data){
 const result=openInput(data&&data.input);
 if(result==='opened')openWindow.close();
 if(result==='invalid')openWindow.postMessage('open-error',{});
}

// A player's sidebar field submits {input}; an older sidebar sends no input and gets the window.
function onPlayerOpen(data,label){
 const input=data&&data.input;
 if(input===undefined){
  showOpenWindow();
  return;
 }
 if(openInput(input)==='invalid')postOpenError(label);
}

// The error carries no user text. A player this entry created gets it through postChild, which fences
// closed players. A window IINA opened itself and Streams adopted (#35) sends IINA's own label, a bare
// number (PlayerCore.swift in IINA 1.5.1); global.postMessage reaches it by that label.
function postOpenError(label){
 const id=targetID(label);
 if(id!==null){
  postChild(id,'open-error',{});
  return;
 }
 if(typeof label!=='string'||!/^[0-9]{1,9}$/.test(label))return;
 timers.setTimeout(()=>app.postMessage(label,'open-error','{}'),0);
}

async function onAuthConnect(data,label){
 const id=targetID(label);
 qaTrace('auth-connect',{sender:label,id,managed:Array.from(managed)});
 gLog('auth-connect',{id,phase:auth.snapshot().phase,hasCred:!!credentials});
 if(id===null)return;
 nextSession(id);
 audience.add(id);
 if(credentials){
  postChild(id,'auth-state',auth.snapshot());
  postChild(id,'auth-ready',credentials);
  return;
 }
 if(['waiting','authorizing'].includes(auth.snapshot().phase)){
  postChild(id,'auth-state',auth.snapshot());
  return;
 }
 let clientID=String(data&&data.clientID||'').trim();
 try{
  if(!clientID&&file.exists(CLIENT_FILE))clientID=JSON.parse(file.read(CLIENT_FILE)).clientID||'';
 }catch(_){}
 if(!clientID){
  try{
   const raw=readSavedLogin();
   const saved=typeof raw==='string'&&raw?JSON.parse(raw):null;
   if(saved&&/^[A-Za-z0-9]{10,64}$/.test(saved.clientID||''))clientID=saved.clientID;
  }catch(_){}
 }
 // Order: the ID just entered, the user's own saved app, the saved login's app, then the built-in app (#8).
 // Only a user's own ID is saved, so a later change to the built-in ID reaches everyone who never chose one.
 const builtIn=String(BuiltInApp&&BuiltInApp.clientID||'');
 if(!clientID&&/^[A-Za-z0-9]{10,64}$/.test(builtIn))clientID=builtIn;
 if(/^[A-Za-z0-9]{10,64}$/.test(clientID)&&clientID!==builtIn)file.write(CLIENT_FILE,JSON.stringify({clientID}));
 gLog('auth-connect-run',{hasClient:/^[A-Za-z0-9]{10,64}$/.test(clientID)});
 await auth.connect(clientID);
}

function onAuthProbe(_,label){
 const id=targetID(label);
 gLog('auth-probe',{id,hasCred:!!credentials});
 if(id===null)return;
 if(credentials){
  postChild(id,'auth-status',{saved:true,login:credentials.login});
  return;
 }
 let saved=false;
 try{
  const raw=readSavedLogin();
  const parsed=typeof raw==='string'&&raw?JSON.parse(raw):null;
  const hasToken=parsed&&typeof parsed.access_token==='string'&&parsed.access_token;
  saved=!!(hasToken&&typeof parsed.clientID==='string'&&parsed.clientID);
 }catch(_){}
 gLog('auth-probe-reply',{id,saved});
 postChild(id,'auth-status',{saved});
}

function onAuthDisconnect(_,label){
 const id=targetID(label);
 if(id===null)return;
 nextSession(id);
 audience.delete(id);
 if(!audience.size)auth.stop();
}

function onPlayerClosed(_,label){
 const id=targetID(label);
 if(id===null)return;
 audience.delete(id);
 managed.delete(id);
 sessions.delete(id);
 if(!audience.size)auth.stop();
}

async function onAuthForget(_,label){
 const id=targetID(label);
 if(id===null)return;
 nextSession(id);
 const pending=auth.forget();
 audience.clear();
 const result=await pending;
 if(result&&!result.stale&&managed.has(id))postChild(id,'auth-forgotten',result);
}

menu.addItem(menu.item('Open Stream…',()=>openStream(),{keyBinding:'Ctrl+Meta+o'}));
if(typeof menu.forceUpdate==='function')menu.forceUpdate();
app.onMessage('open',onPlayerOpen);
app.onMessage('auth-connect',onAuthConnect);
app.onMessage('auth-probe',onAuthProbe);
app.onMessage('auth-disconnect',onAuthDisconnect);
app.onMessage('player-closed',onPlayerClosed);
app.onMessage('auth-forget',onAuthForget);

if(config.qa){
 app.onMessage('qa-ping',(_,label)=>{
  const id=targetID(label);
  qaTrace('ping',{id,sender:label});
  setTimeout(()=>{
   if(id!==null)app.postMessage(id,'qa-pong','number-string-deferred');
  },0);
 });
 app.onMessage('qa-open',data=>openStream(data&&data.url));
 // QA builds from `npm run qa:deploy` set config.qa to true (no startup source): only open a
 // startup player when a source is configured (#33).
 const q=config.qa;
 if(q&&q.source)openQaStartupPlayer(q);
}

function openQaStartupPlayer(q){
 const source=q.source;
 const label=source.kind==='local-test'?'streams-candidate:qa-local':Sources.label(source,q.variant||config.variant);
 createPlayer({url:source.url,enablePlugins:false,disableWindowAnimation:true,label});
}
