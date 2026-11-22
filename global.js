"use strict";
const config=require('./config.js');
const Sources=require('./src/source.js');
const {TwitchAuth}=require('./src/auth.js');
const BuiltInApp=require('./src/twitch-app.js');
const {create:createTimers}=require('./src/timers.js');
const {global:app,menu,utils,file,http,standaloneWindow:openWindow}=iina;
const timers=createTimers(setTimeout,clearTimeout);
// Players that requested auth state, players this entry created, and each player's message session.
// A managed player is keyed by its numeric id. A window IINA opened itself ("adopted", #35) is keyed by
// IINA's own label, a string of digits, so the two kinds never share a key.
const audience=new Set(),managed=new Set(),adopted=new Set(),sessions=new Map();
// Sessions come from one counter, so a label IINA reuses for an idle core never repeats an old session.
let lastSession=0;
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

// IINA labels the cores it creates itself with a bare number (PlayerCore.swift, IINA v1.5.1).
function adoptedLabel(label){
 return typeof label==='string'&&/^[0-9]{1,9}$/.test(label)?label:null;
}

// The reply key for a sender: a managed player's numeric id, an adopted window's string label, or null.
// An adopted label is recorded here so replies can reach it until it reports player-closed.
function acceptSender(label){
 const id=targetID(label);
 if(id!==null)return id;
 const adoptedKey=adoptedLabel(label);
 if(adoptedKey===null)return null;
 if(!adopted.has(adoptedKey)){
  adopted.add(adoptedKey);
  // A fresh session: replies queued for this label before an earlier player-closed are dropped.
  nextSession(adoptedKey);
 }
 return adoptedKey;
}

// Whether a reply key still names an open player: numbers are managed ids, strings are adopted labels.
function isOpen(key){
 return typeof key==='number'?managed.has(key):adopted.has(key);
}

function createPlayer(options){
 const id=app.createPlayerInstance(options);
 if(typeof id==='number'){
  managed.add(id);
  nextSession(id);
 }
 qaTrace('created',{id,type:typeof id});
 return id;
}

function nextSession(key){
 lastSession+=1;
 sessions.set(key,lastSession);
}

// `id` is a reply key from acceptSender. IINA's global.postMessage takes a player id or a label string
// (JavascriptAPIGlobal.swift L105-111, IINA v1.5.1).
function postChild(id,name,data){
 if(!isOpen(id))return;
 let wire;
 try{
  wire=JSON.stringify(data);
 // Unserializable data cannot reach the child; dropping the message is safe.
 }catch(_){
  return;
 }
 if(typeof wire!=='string'||wire.length>8192)return;
 const token=name==='auth-ready'&&data.token,session=sessions.get(id);
 // Match the successful native probe: use a primitive payload after the
 // originating child call has returned. Never enqueue native objects.
 timers.setTimeout(()=>{
  if(!isOpen(id)||session!==sessions.get(id))return;
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
 }catch(_){/* diagnostics are best effort; a failed write must never break the caller */}
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
 diagnostic:code=>gLog('auth-diagnostic',{code}),
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
 // #56: record which label reached global and whether it is a managed player. No user text is traced.
 qaTrace('player-open',{sender:label,id:targetID(label),hasInput:input!==undefined});
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
 const key=acceptSender(label);
 if(key===null){
  qaTrace('open-error',{route:'dropped',sender:label});
  return;
 }
 if(typeof key==='number')qaTrace('open-error',{route:'managed',id:key});
 else qaTrace('open-error',{route:'label',sender:label});
 postChild(key,'open-error',{});
}

async function onAuthConnect(data,label){
 const id=acceptSender(label);
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
 }catch(_){gLog('auth-diagnostic',{code:'client-file-unreadable'});}
 if(!clientID){
  try{
   const raw=readSavedLogin();
   const saved=typeof raw==='string'&&raw?JSON.parse(raw):null;
   if(saved&&/^[A-Za-z0-9]{10,64}$/.test(saved.clientID||''))clientID=saved.clientID;
  }catch(_){gLog('auth-diagnostic',{code:'saved-login-unreadable'});}
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
 const id=acceptSender(label);
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
 }catch(_){gLog('auth-diagnostic',{code:'saved-login-unreadable'});}
 gLog('auth-probe-reply',{id,saved});
 postChild(id,'auth-status',{saved});
}

function onAuthDisconnect(data,label){
 // A label that was never in the audience is neither registered nor allowed to stop the broker (r2 #4).
 const managedID=targetID(label);
 const id=managedID!==null?managedID:adoptedLabel(label);
 if(id===null)return;
 // A retiring controller ends its own lifetime on a label that stays open. Forget clears the audience before
 // its revoke returns, so retirement must advance the session itself (r3 #3). Only a known label advances.
 const retiring=!!data&&data.retire===true&&sessions.has(id);
 const wasMember=audience.delete(id);
 if(retiring||wasMember)nextSession(id);
 if(wasMember&&!audience.size)auth.stop();
}

function onPlayerClosed(_,label){
 const managedID=targetID(label);
 const id=managedID!==null?managedID:adoptedLabel(label);
 if(id===null)return;
 // Only a departing audience member can warrant stopping the broker; an unrelated close must not (r3 #3).
 const wasMember=audience.delete(id);
 if(typeof id==='number')managed.delete(id);
 else adopted.delete(id);
 sessions.delete(id);
 if(wasMember&&!audience.size)auth.stop();
}

async function onAuthForget(_,label){
 const id=acceptSender(label);
 if(id===null)return;
 nextSession(id);
 // The requester's session now. If that label retires or reconnects during the revoke, the reply is dropped
 // rather than landing on a successor controller (r2 #4).
 const session=sessions.get(id);
 const pending=auth.forget();
 audience.clear();
 const result=await pending;
 if(result&&!result.stale&&isOpen(id)&&sessions.get(id)===session)postChild(id,'auth-forgotten',result);
}

menu.addItem(menu.item('Open Stream…',()=>openStream(),{keyBinding:'Ctrl+Meta+o'}));
// Refresh the menu on the next turn, not while this initializer runs. In IINA v1.5.1 a synchronous
// forceUpdate runs updatePluginMenu -> PlayerCore.active -> PlayerCore.first, which creates core "0"
// before this global instance is registered, so that core gets a nil parentAPI and can never message
// global (MenuController.swift L619, PlayerCore.swift L40-46, JavascriptPlugin.swift L166-168,
// JavascriptPluginInstance.swift L175-182). v0.5.5 review r1 #5.
if(typeof menu.forceUpdate==='function')timers.setTimeout(()=>menu.forceUpdate(),0);
app.onMessage('open',onPlayerOpen);
app.onMessage('auth-connect',onAuthConnect);
app.onMessage('auth-probe',onAuthProbe);
app.onMessage('auth-disconnect',onAuthDisconnect);
app.onMessage('player-closed',onPlayerClosed);
app.onMessage('auth-forget',onAuthForget);

if(config.qa){
 // #56 probe, QA builds only: does global reach a window IINA opened itself by its bare-number label
 // (JavascriptAPIGlobal.swift L105-111 in IINA 1.5.1)? QA restarts IINA, so every core loaded this plugin
 // at creation (PlayerCore.swift L74-81) and L108's force-unwrap is safe here. Not for release builds.
 let probes=0;
 function sendLabelProbe(){
  probes+=1;
  for(let n=0;n<6;n+=1)app.postMessage(String(n),'qa-label-probe',JSON.stringify({label:String(n),probe:probes}));
  qaTrace('label-probe-sent',{probe:probes});
  if(probes<12)timers.setTimeout(sendLabelProbe,5000);
 }
 timers.setTimeout(sendLabelProbe,5000);
}

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
