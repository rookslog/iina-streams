"use strict";
const Sources=require('./source.js');
const {Playback}=require('./playback.js');
const {envelope}=require('./bridge.js');
const {Replay}=require('./replay.js');
const {create:createTimers}=require('./timers.js');
const {createEstimator}=require('./live-latency.js');
const {createChatTiming}=require('./chat-timing.js');
const {createLiveClock}=require('./live-clock.js');

// Live latency (#2, #16, #51). The spike's 30 s window held with 18 samples when mpv was read every 1 s; the
// live clock samples once per 2 s playlist poll, so a 30 s window holds at most 16 samples. 10 samples cover
// the same 18 s of history (docs/design/SPIKE-16-31-LIVE-LATENCY-2026-11-22.md section 6).
const LIVE_WINDOW_SECONDS=30;
const LIVE_MIN_SAMPLES=10;
// How often the player re-reads the estimate to refresh the pill and the Auto chat delay.
const LIVE_STATUS_MS=1000;
// Go Live seeks only when the target is more than this far ahead; otherwise it reloads (spike section 4).
const GO_LIVE_MIN_LEAD_SECONDS=1;
// Collides with the main menu's Log Viewer key equivalent in IINA 1.5.1 (tests/fixtures/iina-1.5.1).
// Ctrl+Meta+l is IINA 1.5.1's Log Viewer (MainMenu.xib; tests/fixtures/iina-1.5.1/mainmenu-keys.txt),
// and IINA doesn't reject that clash for plugin items, so Go Live uses G.
const GO_LIVE_KEY='Ctrl+Meta+g';
// A Go Live seek must leave the player at most this far behind live, else Go Live reloads. Twitch's
// floor on this path is 6-8 s (spike #16), so 12 s allows one segment of slack above it.
const GO_LIVE_REACH_SECONDS=12;
// A Go Live reload that has not loaded by then is over: busy clears and Go Live can be used again.
const GO_LIVE_TIMEOUT_MS=15000;
// Review r2 #5: the live transport session fences every overlay status and batch. A native core runs one
// controller per adopted source in this one JS context, so sessions come from this counter, never from
// zero per controller: a later controller can never reuse an earlier controller's session.
let liveSessions=0;

function nextLiveSession(){
 liveSessions++;
 return liveSessions;
}

const INACTIVE_MESSAGE='Streams controls are inactive for this file. Open a new stream from the Plugins menu.';

const DEFAULT_VIEW={
 presentation:'sidebar',fontSize:14,opacity:0.58,lines:6,spacing:4,timestamps:false,timestampSeconds:false,
 x:1,y:0,width:340,height:260,density:'comfortable',editing:false
};

function clamp(n,low,high,fallback){
 n=Number(n);
 return Number.isFinite(n)?Math.max(low,Math.min(high,n)):fallback;
}

function plainObject(value){
 return !!value&&typeof value==='object'&&!Array.isArray(value);
}

function viewSettings(value){
 const v=value||{};
 const spacing=Math.round(clamp(v.spacing,2,10,v.density==='compact'?2:4));
 return{
  presentation:['sidebar','overlay'].includes(v.presentation)?v.presentation:'sidebar',
  fontSize:clamp(v.fontSize,12,24,14),
  opacity:clamp(v.opacity,0,0.9,0.58),
  lines:Math.round(clamp(v.lines,2,12,6)),
  spacing,
  timestamps:!!v.timestamps,
  timestampSeconds:!!v.timestampSeconds,
  x:clamp(v.x,0,1,1),
  y:clamp(v.y,0,1,0),
  width:Math.round(clamp(v.width,220,1200,340)),
  height:Math.round(clamp(v.height,100,1200,260)),
  density:spacing<=2?'compact':'comfortable',
  editing:false
 };
}

const ACTIVATION_URL=/^https:\/\/(?:www\.)?twitch\.tv\/activate(?:\?|$)/;

// A user-facing error message with any address removed, since media and chat URLs can be signed.
function publicError(error,fallback){
 return String(error&&error.message||fallback).replace(/https?:\/\/\S+/g,'[address omitted]').slice(0,180);
}

// Normalized chat message. `time` is media time (replay); `sentAt` is the provider's send time in epoch ms
// (live, from tmi-sent-ts).
function safeMessage(m){
 const out={
  id:String(m.id||'').slice(0,160),
  time:Number(m.time||m.t)||0,
  sentAt:Number(m.timestampMs||m.sentAt)||0,
  author:String(m.author||'').slice(0,80),
  text:String(m.text||'').slice(0,2000),
  color:/^#[0-9a-f]{6}$/i.test(m.color||'')?m.color:'',
  kind:String(m.kind||'message')
 };
 if(typeof m.emotes==='string'&&m.emotes)out.emotes=m.emotes.slice(0,2048);
 if(typeof m.badges==='string'&&m.badges)out.badges=m.badges.slice(0,1024);
 return out;
}

// The QA build's local media window, which has no stream label.
function qaLocalIdentity(config,label){
 const qa=config.qa;
 if(!(qa&&qa.source&&qa.source.kind==='local-test'&&label==='streams-candidate:qa-local'))return null;
 return{source:qa.source,variant:qa.variant||config.variant};
}

function loadingPath(mpv){
 return mpv.getString('path')||mpv.getString('stream-open-filename')||'';
}

// A window Streams created has a stream label and runs at once. Any other IINA window returns null, with at
// most an on_load hook: no controls, timers or network until a stream loads (see waitForNativeStream).
function start(host,config,services){
 const label=host.global.getLabel()||'';
 const identity=Sources.fromLabel(label)||qaLocalIdentity(config,label);
 if(identity)return run(host,config,services,identity,onLoad=>host.mpv.addHook('on_load',20,onLoad));
 waitForNativeStream(host,config,services);
 return null;
}

// #35: a Twitch or YouTube URL opened in IINA itself (Open URL, the browser extension, `open -a IINA`)
// arrives in a window Streams did not create. Streams adopts it as the window's source and handles it
// through the normal pipeline. Only an http(s) URL is adopted: Sources.parse reads a bare word as a Twitch
// channel, and a local path can be a bare word. Any other file passes through untouched.
const ADOPTABLE_KINDS=['twitch-live','twitch-vod','youtube'];

function adoptableSource(path){
 if(!/^https?:\/\//i.test(path))return null;
 const source=Sources.parse(path);
 return source&&ADOPTABLE_KINDS.includes(source.kind)?source:null;
}

// Review r1 #12: IINA loads every enabled plugin on a native core, so stable and an isolated beta or dev
// build would both claim the same load. Stable adopts; another identifier adopts only in a QA build or when
// its settings say adoptNativeWindows: true. Read once, when the core starts.
const STABLE_IDENTIFIER='local.iina.streams';

function nativeAdoptionEnabled(config,services){
 if(config.identifier===STABLE_IDENTIFIER||config.qa)return true;
 try{
  const settings=services.readSettings?services.readSettings():null;
  return !!settings&&settings.adoptNativeWindows===true;
 }catch(_){
  return false;
 }
}

// How IINA v1.5.1 runs this hook (MPVController.swift, MPVHookValue.call; JavascriptAPISidebarView.swift):
// - It is called on mpv's event queue, not the main thread. sidebar.loadFile there is DispatchQueue.main.sync,
//   sidebar.show touches the window, and event.on/off change a dictionary the main thread reads. So every
//   load that touches a controller first yields a main-thread turn (setTimeout).
// - IINA calls next itself as soon as the hook returns, unless the hook is an async function. So onLoad below
//   is async, and it alone continues the load: once, from the pipeline or from the watchdog.
const ADOPTION_WATCHDOG_MS=10000;

// Review r1 #6 and #8: IINA reuses idle cores and keeps every hook it is given, so this core has exactly one
// permanent hook, and each adopted source gets its own controller. A load is delegated to the current
// controller only when it is that controller's own staged reload (quality change, Go Live). Any other load
// retires the controller and is classified again: a new stream is adopted, anything else passes through.
function waitForNativeStream(host,config,services){
 if(!nativeAdoptionEnabled(config,services))return;
 const qaTrace=adoptedTracer(host,config);
 // The wrapper clears a native timer that IINA registers after it was cancelled (src/timers.js). Timer
 // functions are looked up per call, so a replaced global setTimeout is the one used.
 const hookTimers=createTimers((fn,ms)=>setTimeout(fn,ms),id=>clearTimeout(id));
 let current=null;
 // The core's load epoch. Every load and every window close advances it, so a load waiting for its
 // main-thread turn sees that it was superseded or that its window closed (review r3 #4).
 let loadSequence=0;
 // Review r2 #4: retiring a controller is not closing the window. While a stream adopted since the last
 // close has been retired and no controller is current (a passed-through file plays), this listener tells
 // global when the window closes. It exists only then, and is added and removed on main-thread turns.
 let closeNotice=null;
 function watchClose(){
  if(closeNotice===null)closeNotice=host.event.on('iina.window-will-close',onRetiredWindowClose);
 }
 function unwatchClose(){
  if(closeNotice===null)return;
  const id=closeNotice;
  closeNotice=null;
  host.event.off('iina.window-will-close',id);
 }
 function onRetiredWindowClose(){
  loadSequence++;
  unwatchClose();
  if(current)return;
  host.global.postMessage('player-closed',{});
 }
 // The current controller's own close listener reports a close while a stream is current.
 function onControllerWindowClose(){
  loadSequence++;
 }
 function dropCurrentLoad(){
  if(current)current.controller.passThrough();
 }
 // This hook runs for every file in this window, and an async hook is never continued by IINA: any throw
 // passes the file through.
 async function onLoad(next){
  const load=holdLoad(next,qaTrace,dropCurrentLoad,hookTimers);
  try{
   await dispatchLoad(load);
  }catch(error){
   qaTrace('error',{error:publicError(error,'Adoption failed.')});
   load.release('pass-through');
  }
 }
 async function dispatchLoad(load){
  const mine=++loadSequence;
  qaTrace('hook-entered',{adopted:current!==null});
  const path=loadingPath(host.mpv);
  const source=adoptableSource(path);
  qaTrace('source',source?{kind:source.kind,sourceId:source.id}:{kind:null});
  if(!source){
   passThroughNow(load,mine);
   return;
  }
  load.arm();
  // Accepted residual (review r3 #4): a window closed during the turn of its first load is not fenced, since
  // no close watcher or open controller exists to see that close.
  await mainThreadTurn();
  if(load.released)return;
  if(mine!==loadSequence){
   load.release('superseded');
   return;
  }
  if(current&&current.controller.ownsLoad(path)){
   await current.loadHook(load.continueFromHook);
   return;
  }
  retireCurrent();
  current=adopt(source);
  await current.loadHook(load.continueFromHook);
 }
 // Review r3 #5: a file that is not adopted continues at once, on the hook: IINA invalidates plugin timers
 // on unload, so a continuation that waits for a turn may never come. Only retiring the old controller
 // needs the main thread; it runs on a later turn unless another load or a close came first, which then
 // owns the controller.
 // Review r4 #3: the old controller loses its authority before the hook continues, in pure JS.
 function passThroughNow(load,mine){
  if(current)current.controller.beginRetiring();
  load.release('pass-through');
  if(!current)return;
  hookTimers.setTimeout(()=>{
   if(mine===loadSequence)retireCurrent();
  },0);
 }
 function adopt(source){
  const adopted={controller:null,loadHook:null};
  const lifecycle={phase:qaTrace,windowClosed:onControllerWindowClose};
  const identity={source,variant:config.variant};
  adopted.controller=run(host,config,services,identity,hook=>{
   adopted.loadHook=hook;
  },lifecycle);
  // Only once the new controller exists: if run throws, the core still reports the close.
  unwatchClose();
  return adopted;
 }
 // Closes the old controller's timers, listeners, helpers and chat, and removes its menu items; the next
 // controller adds its own.
 function retireCurrent(){
  const old=current;
  current=null;
  if(old){
   // A closed controller already told global; a retired one leaves the close to the core.
   const open=!old.controller.isClosed();
   try{
    old.controller.retire();
   }catch(_){}
   if(open)watchClose();
  }
  try{
   if(host.menu&&typeof host.menu.removeAllItems==='function')host.menu.removeAllItems();
  }catch(_){}
 }
 host.mpv.addHook('on_load',20,onLoad);
}

// IINA's setTimeout schedules its callback on the main thread (JavascriptPolyfill.swift createTimer), and
// keeps a fired timer registered until it is cleared.
function mainThreadTurn(){
 return new Promise(resolve=>{
  const id=setTimeout(()=>{
   clearTimeout(id);
   resolve();
  },0);
 });
}

// One load: `next` runs exactly once, from the pipeline or, for a held load (arm), after
// ADOPTION_WATCHDOG_MS from the watchdog, which first tells the controller to drop the load (onWatchdog) so
// IINA's own loader plays it. A file that is not adopted never arms a timer. The watchdog needs the main
// thread and the JS context to be free; nothing in JS can fire while either is blocked.
function holdLoad(next,qaTrace,onWatchdog,timers){
 const load={released:false};
 let watchdog=null;
 load.arm=()=>{
  if(!load.released&&watchdog===null)watchdog=timers.setTimeout(fireWatchdog,ADOPTION_WATCHDOG_MS);
 };
 function fireWatchdog(){
  watchdog=null;
  if(load.released)return;
  qaTrace('watchdog-fired',{ms:ADOPTION_WATCHDOG_MS});
  try{
   onWatchdog();
  }catch(_){}
  load.release('watchdog');
 }
 load.release=by=>{
  if(load.released)return;
  load.released=true;
  if(watchdog!==null)timers.clearTimeout(watchdog);
  watchdog=null;
  qaTrace('next-called',{by});
  if(typeof next==='function')next();
 };
 load.continueFromHook=()=>load.release('hook');
 return load;
}

// QA builds only: the phases of adopted windows, in the shape main.js's services.trace writes. Adopted
// windows have no stream label, so main.js has no per-source trace file for them. Never media URLs.
function adoptedTracer(host,config){
 if(!config.qa)return()=>{};
 const events=[];
 return(phase,data)=>{
  try{
   events.push(Object.assign({phase,time:new Date().toISOString()},data||{}));
   if(events.length>300)events.shift();
   host.file.write('@data/qa-events-adopted.json',JSON.stringify(events));
  }catch(_){}
 };
}

// The Streams controller for one window and one source. registerLoadHook receives the on_load handler.
// lifecycle.phase, when given, observes the load's resolve phases (adopted windows' QA trace).
function run(host,config,services,identity,registerLoadHook,lifecycle){
 const phase=lifecycle&&lifecycle.phase||(()=>{});
 const windowClosed=lifecycle&&lifecycle.windowClosed||(()=>{});
 const source=identity.source;
 const variant=identity.variant;
 const {mpv,core,sidebar,overlay,event,menu,global:app}=host;
 const timers=createTimers(setTimeout,clearTimeout);
 const persisted=services.readSettings?services.readSettings():{};
 let view=viewSettings(persisted.view);
 let auth={phase:'off',message:'',saved:false};
 let chatPreferred=persisted.chatEnabled!==false;
 // Surface lifecycle.
 let closed=false,windowLoaded=!!core.window.loaded;
 // Review r4 #3: true from a pass-through's `next` until its deferred cleanup turn (or, in a managed window, a
 // later load of this source). Set in pure JS on the hook. Every action guard, clock completion, overlay batch
 // and pending completion treats it as closed (inert); only physical teardown and deactivation still run.
 let retiring=false;
 let sidebarLoaded=false,sidebarReady=false,sidebarVisible=false,controlsDesired=true;
 let overlayLoaded=false,overlayReady=false;
 // Load generations and source ownership.
 let generation=0,activeGeneration=0,staged=null,loadError='',initialResolved=false;
 let chatGeneration=0,sourceActive=true,autoReplayAttempted=false;
 // Auth listener binding (see bindAuthListeners). authBindSkipped: a bind turn ran while retiring (review r5 #1).
 let authBindTimer=null,authBound=false,pendingAuth=null,authBindSkipped=false;
 // Playback-state restoration after a quality reload.
 let restoration=null,restoreTimer=null,refreshing=false;
 // Replay chat.
 let replay=null,replayPath='',replayMetadata=null,messages=[],timeObserver=null,updateTimer=null;
 let lastTick=0,lastSignature='';
 // Twitch VOD chat windows.
 let twitchWindow=null,twitchFetchBusy=false,twitchFetchAt=0,twitchQueuedAt=null,twitchNextAttempt=0;
 // Review r1 #10: after an automatic fetch made no progress past the playhead, no automatic fetch until the
 // playhead passes `after`. A seek or a user retry clears it.
 let twitchStall=null;
 // Live chat transport, which runs in the overlay page.
 let liveCredential=null,liveStarted=false,liveRun=0;
 let chat={mode:'off',state:'off',error:'',count:0,sourceName:'',offset:0,available:false};
 // Live timing (twitch-live only). The clock has its own timer registry, so only stopLiveClock ends it.
 const chatTiming=createChatTiming(plainObject(persisted.chatTiming)?persisted.chatTiming:{});
 const estimator=createEstimator({windowSeconds:LIVE_WINDOW_SECONDS,minSamples:LIVE_MIN_SAMPLES});
 const clockTimers=createTimers(setTimeout,clearTimeout);
 // Review r4 #3: a retiring controller's clock neither polls nor samples. The clock's own timer stays armed
 // until stopLiveClock, so nothing native runs on the hook.
 const liveClock=createLiveClock({
  http:host.http,
  readPlayer:()=>inert()?{timePos:null,cacheEnd:null}:readLivePlayer(),
  estimator,
  setTimer:(fn,ms)=>clockTimers.setTimeout(()=>{
   if(!inert())fn();
  },ms),
  clearTimer:clockTimers.clearTimeout,
  now:()=>Date.now(),
  log:onLiveClockLog
 });
 // liveClockURL is the resolved playlist for the load in progress; file-loaded consumes it.
 let liveClockURL=null,liveClockRunning=false,liveStatusTimer=null,liveStatusKey='',lastClockCode='';
 // Live chat buffer (C3b): an id-keyed union, in arrival order, of the chat received this session. Pending
 // messages (not yet due) are capped at LIVE_PENDING_CAP and revealed ones at LIVE_REVEALED_CAP. The timer
 // is for the next held message.
 let liveInbox=[],revealTimer=null,revealDueMs=null,goLiveBusy=false;
 // Review r1 #9 and r2 #3: a Go Live reload is one replacement transaction, {generation, timer, endSeen}.
 // goLiveBusy holds from the click until file-loaded of that generation or GO_LIVE_TIMEOUT_MS. An end-file
 // never ends it: IINA v1.5.1 delivers end-file on the main thread with no file id or reason, after mpv's
 // queue may already have run the replacement's on_load hook (MPVController.swift L1112-1125, L1241-1247),
 // so the replaced file's end cannot be told from the replacement's. endSeen records that one arrived; a
 // timeout after one is a stop.
 let replacement=null;
 // The last Go Live generation issued. Its file-loaded is authoritative even after the transaction ended,
 // because the timeout may have closed it first.
 let goLiveGeneration=null;
 const listeners=[];
 const postSidebar=(name,data)=>sidebar.postMessage(name,envelope(data));
 const postOverlay=(name,data)=>overlay.postMessage(name,envelope(data));
 const player=new Playback({
  source,
  resolve:q=>services.resolve(source,q),
  readPlayer:()=>({position:mpv.getNumber('time-pos'),paused:mpv.getFlag('pause'),speed:mpv.getNumber('speed')}),
  replace:replaceFile,
  onState:()=>send(),
  fenced:()=>retiring,
  setTimer:timers.setTimeout,
  clearTimer:timers.clearTimeout
 });
 const diag=[];

 function on(name,fn){
  const id=event.on(name,fn);
  listeners.push([name,id]);
 }

 // Review r4 #3: a quality change that resolves while retiring must not replace the file that passed through.
 function replaceFile(result,context){
  if(inert())return;
  context.frame=Object.assign({},core.window.frame);
  context.fullscreen=!!core.window.fullscreen;
  staged={result,context};
  mpv.command('loadfile',[source.url+'#streams-generation='+context.generation,'replace']);
 }

 function snapshot(){
  const p=player.snapshot();
  return Object.assign(p,{
   variant,
   source:{kind:source.kind,provider:source.provider,id:source.id},
   title:p.title||source.id||'Streams',
   error:loadError||p.error,
   chat:Object.assign({},chat),
   auth:Object.assign({},auth),
   view:Object.assign({},view),
   messages:messages.slice(-150),
   position:Number(mpv.getNumber('time-pos'))||0,
   paused:!!mpv.getFlag('pause'),
   behindLive:behindLive(),
   atLiveEdge:atLiveEdge(),
   chatTiming:Object.assign(chatTiming.settings(),currentTiming()),
   qa:!!config.qa
  });
 }

 function trace(name,extra){
  if(services.trace)services.trace(name,Object.assign({variant,sourceId:source.id},extra||{}));
 }

 function diagLog(step,extra){
  try{
   diag.push(Object.assign({step,t:Date.now()},extra||{}));
   if(diag.length>40)diag.shift();
   if(host.file&&host.file.write)host.file.write('@data/last-session.json',JSON.stringify(diag));
  }catch(_){}
 }

 // Review r5 #2: a retiring controller publishes nothing, except its final inactive snapshot (publishFinal).
 function send(){
  if(inert())return;
  publish();
 }

 // The intentional final inactive snapshot: retire()'s teardown and the foreign-file deactivation.
 function publishFinal(){
  publish();
 }

 function publish(){
  if(closed)return;
  const s=snapshot();
  liveStatusKey=liveStatusKeyOf(s.behindLive,s.chatTiming,s.atLiveEdge);
  if(overlayReady)postOverlay('state',{view:s.view,messages:s.messages,chat:s.chat,qa:s.qa});
  if(sidebarReady&&sidebarVisible){
   try{
    postSidebar('state',s);
   }catch(_){}
  }
 }

 // ---- Sidebar messages ----

 // Whether this controller has lost its authority: closed, or retiring (review r4 #3).
 function inert(){
  return closed||retiring;
 }

 // Review r2 #4 and r4 #3: a retiring, retired or closed controller's sidebar and overlay can stay rendered,
 // with their listeners, until something loads those views again. Every action they send is dropped from then
 // on, so a retired sidebar's Sign Out or Connect cannot act on the login another window shares. Menu actions
 // use the same guard.
 function whileOpen(handler){
  return data=>{
   if(inert())return undefined;
   return handler(data);
  };
 }

 function onSidebar(name,handler){
  sidebar.onMessage(name,whileOpen(handler));
 }

 function onOverlay(name,handler){
  overlay.onMessage(name,whileOpen(handler));
 }

 function connectMessages(){
  onSidebar('ready',onSidebarReady);
  onSidebar('change-quality',q=>changeQuality(String(q)));
  onSidebar('refresh',()=>refresh());
  onSidebar('hide',hideSidebar);
  onSidebar('surface-visibility',onSurfaceVisibility);
  onSidebar('open',onSidebarOpen);
  onSidebar('import',()=>importArchive());
  onSidebar('replay-resume',onReplayResume);
  onSidebar('chat-off',onChatOffRequest);
  onSidebar('fetch-replay',fetchReplay);
  onSidebar('view',setView);
  onSidebar('offset',setOffset);
  onSidebar('seek-chat',seekChat);
  onSidebar('first-message',seekFirstMessage);
  onSidebar('connect',connectLive);
  onSidebar('open-twitch-console',()=>host.utils.open('https://dev.twitch.tv/console/apps/create'));
  onSidebar('authorize-open',openActivation);
  onSidebar('forget-auth',forgetAuth);
  onSidebar('chat-timing',setChatTiming);
  onSidebar('chat-calibrate',calibrateChat);
  onSidebar('go-live',goLive);
  if(config.qa)onSidebar('qa-result',data=>trace('ui-result',data));
 }

 // The sidebar's inline field sends {input}; global parses it and opens the stream (#50).
 function onSidebarOpen(data){
  const input=data&&typeof data.input==='string'?data.input:undefined;
  app.postMessage('open',input===undefined?{}:{input});
 }

 // Global rejected the sidebar's input. This holds even after deactivation: the field stays usable.
 function onOpenError(){
  if(inert())return;
  postSidebar('open-error',{});
 }

 function onSidebarReady(){
  if(inert())return;
  sidebarReady=true;
  send();
  trace('sidebar-ready');
 }

 function onSurfaceVisibility(data){
  if(inert()||!data||typeof data.visible!=='boolean')return;
  trace('sidebar-document-visibility',{visible:data.visible});
 }

 // Saves one change into the latest persisted settings. Other fields, and anything another window saved
 // since this one started, survive; the whole file is replaced on every save.
 function saveSetting(change){
  if(!services.saveSettings)return;
  const latest=services.readSettings?services.readSettings():{};
  services.saveSettings(Object.assign({},latest,change));
 }

 // Remember whether the user wants chat, so the next player opens with it on or off.
 function setChatPreferred(enabled){
  chatPreferred=enabled;
  saveSetting({chatEnabled:enabled});
 }

 function onReplayResume(){
  setChatPreferred(true);
  resumeReplay();
 }

 function onChatOffRequest(){
  setChatPreferred(false);
  chatOff();
 }

 function setOffset(value){
  if(inert()||!sourceActive)return;
  chat.offset=clamp(value,-2592000,2592000,0);
  lastSignature='';
  tick(true);
  maybeRefreshTwitch(true);
  send();
 }

 function seekChat(value){
  const t=Number(value)-chat.offset;
  if(chat.mode==='replay'&&Number.isFinite(t)&&t>=0)mpv.command('seek',[String(t),'absolute+exact']);
 }

 function seekFirstMessage(){
  if(inert()||!sourceActive||chat.mode!=='replay'||!replayMetadata)return;
  const t=Math.max(0,replayMetadata.timeline.availableStart-chat.offset);
  mpv.command('seek',[String(t),'absolute+exact']);
 }

 function connectLive(data){
  if(inert()||!sourceActive)return;
  if(source.kind!=='twitch-live'){
   chat.error='Live chat is available for Twitch channels.';
   send();
   return;
  }
  setChatPreferred(true);
  chatOff();
  chat=authorizingLiveChat();
  requestAuth(String(data&&data.clientID||''));
  send();
 }

 function authorizingLiveChat(){
  return{mode:'live',state:'authorizing',error:'',count:0,sourceName:source.id,offset:0,available:!!replay};
 }

 // Twitch opens only from the user's click on "Approve on Twitch"; the activation page fills in the code.
 function openActivation(){
  if(auth.phase!=='waiting')return;
  if(ACTIVATION_URL.test(auth.verificationURI||''))host.utils.open(auth.verificationURI);
 }

 // Sign out. The broker revokes the grant it holds, so this window must not post auth-disconnect first:
 // with one window connected that would make the broker discard the grant before revoking it.
 function forgetAuth(){
  chatOff({releaseAuth:false});
  app.postMessage('auth-forget',{});
 }

 // ---- Sidebar and overlay surfaces ----

 function showSidebar(){
  controlsDesired=true;
  if(inert()||!windowLoaded)return;
  if(!sidebarLoaded){
   sidebar.loadFile('ui/sidebar.html');
   connectMessages();
   sidebarLoaded=true;
   sidebarReady=false;
  }
  sidebarVisible=true;
  sidebar.show();
  if(chat.mode==='replay')tick(true);
  send();
 }

 function hideSidebar(){
  controlsDesired=false;
  sidebarVisible=false;
  sidebar.hide();
  if(view.presentation==='sidebar'&&chat.mode==='live')chatOff();
 }

 function overlayNeeded(){
  return chat.mode==='live'||view.presentation==='overlay'&&chat.mode!=='off';
 }

 function stopLiveTransport(){
  liveRun=nextLiveSession();
  liveCredential=null;
  liveStarted=false;
  if(overlayReady)postOverlay('live-stop',{});
 }

 function startLiveTransport(){
  if(inert()||!sourceActive||chat.mode!=='live'||!overlayReady||!liveCredential||liveStarted)return;
  const credential=liveCredential;
  liveCredential=null;
  liveStarted=true;
  liveRun=nextLiveSession();
  resetLiveBuffer();
  send();
  postOverlay('live-config',{token:credential.token,login:credential.login,channel:source.id,session:liveRun});
 }

 function ensureOverlay(){
  diagLog('ensureOverlay',{windowLoaded,overlayLoaded,overlayReady,mode:chat.mode,pres:view.presentation});
  if(inert()||!windowLoaded)return;
  if(!overlayLoaded){
   overlayLoaded=true;
   overlay.loadFile('ui/overlay.html');
   return;
  }
  overlay.setClickable(view.presentation==='overlay');
  overlay.setOpacity(1);
  overlay.show();
  send();
 }

 function hideOverlay(){
  if(!overlayLoaded)return;
  overlay.setClickable(false);
  overlay.hide();
 }

 function onOverlayLoaded(){
  diagLog('plugin-overlay-loaded',{overlayLoaded});
  if(inert()||!overlayLoaded)return;
  onOverlay('overlay-ready',onOverlayReady);
  onOverlay('live-state',onLiveState);
  onOverlay('live-messages',onLiveMessages);
  onOverlay('geometry',g=>setView({x:g&&g.x,y:g&&g.y,width:g&&g.width,height:g&&g.height}));
  onOverlay('position',p=>setView({x:p&&p.x,y:p&&p.y}));
  onOverlay('position-done',()=>setView({editing:false}));
  if(config.qa)onOverlay('qa-result',d=>trace('overlay-ui-result',d));
  postOverlay('hello',{});
 }

 function onOverlayReady(){
  if(inert())return;
  overlayReady=true;
  diagLog('overlay-ready',{needed:overlayNeeded(),hasCred:!!liveCredential});
  // overlayLoaded is always true here: this listener is only registered once the overlay has loaded.
  if(overlayNeeded())ensureOverlay();
  else hideOverlay();
  startLiveTransport();
  send();
  trace('overlay-ready');
 }

 function onLiveState(data){
  diagLog('live-state',{state:data&&data.state,session:data&&data.session,liveRun,liveStarted});
  if(inert()||chat.mode!=='live'||!liveStarted||!data||data.session!==liveRun)return;
  chat.state=String(data.state||'connecting');
  chat.error=String(data.message||(auth.phase==='ready'?auth.message:'')||'').slice(0,160);
  send();
 }

 const LIVE_PENDING_CAP=3000;
 const LIVE_REVEALED_CAP=150;

 // The overlay posts its newest 150 messages plus the ids that moderation removed in that batch. Messages that
 // only fell out of the overlay's window are kept. Accepted limit: a burst of more than 150 messages between two
 // posts can lose the oldest of them, because the overlay never sent them.
 function onLiveMessages(data){
  if(inert()||chat.mode!=='live'||!liveStarted||!data||data.session!==liveRun||!Array.isArray(data.messages))return;
  applyLiveRemovals(data.removed,data.clearedAll===true,data.removedUsers);
  mergeLiveMessages(data.messages.slice(-150));
  revealLive();
  send();
 }

 function applyLiveRemovals(removed,clearedAll,removedUsers){
  if(clearedAll){
   liveInbox=[];
   messages=[];
   return;
  }
  const gone=new Set(Array.isArray(removed)?removed.filter(id=>typeof id==='string'&&id):[]);
  for(const entry of liveInbox){
   if(entry.id&&matchesRemovedUser(entry,removedUsers))gone.add(entry.id);
  }
  if(gone.size===0)return;
  liveInbox=liveInbox.filter(entry=>!gone.has(entry.id));
  messages=messages.filter(message=>!gone.has(message.id));
 }

 // A clear-user names a userId, a login, or both. An empty string never matches.
 function matchesRemovedUser(entry,removedUsers){
  if(!Array.isArray(removedUsers))return false;
  return removedUsers.some(user=>{
   if(!user||typeof user!=='object')return false;
   const byId=!!user.userId&&user.userId===entry.userId;
   const byLogin=!!user.login&&user.login===entry.login;
   return byId||byLogin;
  });
 }

 // A message with no id (a notice) is keyed by its kind and text, so the overlay re-posting it does not repeat it.
 // Two identical notices therefore collapse into one.
 function inboxKey(entry){
  return entry.id||entry.message.kind+'|'+entry.message.text;
 }

 function mergeLiveMessages(rows){
  const known=new Set(liveInbox.map(inboxKey));
  for(const raw of rows){
   const entry=inboxEntry(raw);
   const key=inboxKey(entry);
   if(known.has(key))continue;
   known.add(key);
   liveInbox.push(entry);
  }
  capPending();
 }

 // Drops the oldest pending entries past the cap. Pending means not shown yet.
 function capPending(){
  const shown=new Set(messages);
  const pending=liveInbox.filter(entry=>!shown.has(entry.message));
  const excess=pending.length-LIVE_PENDING_CAP;
  if(excess<=0)return;
  const dropped=new Set(pending.slice(0,excess));
  liveInbox=liveInbox.filter(entry=>!dropped.has(entry));
 }

 // Keeps only the newest LIVE_REVEALED_CAP revealed entries in the buffer.
 function trimRevealed(visible){
  const excess=visible.length-LIVE_REVEALED_CAP;
  if(excess<=0)return visible;
  const dropped=new Set(visible.slice(0,excess));
  liveInbox=liveInbox.filter(entry=>!dropped.has(entry));
  return visible.slice(excess);
 }

 function resetLiveBuffer(){
  clearRevealTimer();
  liveInbox=[];
  messages=[];
 }

 // ---- Live chat timing (#2, #28) ----

 // chatTiming.reveal reads {id, timestampMs}; safeMessage keeps the send time as sentAt. A message without
 // a send time (a notice) has no timestampMs, so it shows at once.
 function inboxEntry(raw){
  const message=safeMessage(raw);
  const entry={id:message.id,message};
  if(message.sentAt>0)entry.timestampMs=message.sentAt;
  // Kept on the entry only, so clear-user can match a pending message. It never reaches sidebar or overlay state.
  entry.userId=typeof raw.userId==='string'?raw.userId:'';
  entry.login=typeof raw.login==='string'?raw.login.toLowerCase():'';
  return entry;
 }

 function behindLive(){
  if(source.kind!=='twitch-live'||!liveClockRunning)return null;
  const value=liveClock.behindLive();
  return typeof value==='number'&&Number.isFinite(value)?value:null;
 }

 // At the live edge means Go Live cannot gain anything: the cache end is within LIVE_EDGE_GAP_SECONDS of
 // the playhead. Twitch's floor on this path is 6-8 s behind live, so behindLive alone never reads as live.
 // 8 s, not 4: mpv's steady buffer ahead on this path is 5.2-5.7 s (spike #16 section 1, plain URL), plus one
 // 2 s segment of jitter. After a 20 s pause the gap is about 25 s, so that still reads as behind (lead review).
 const LIVE_EDGE_GAP_SECONDS=8;

 function atLiveEdge(){
  if(behindLive()===null)return false;
  const read=readLivePlayer();
  if(typeof read.cacheEnd!=='number'||typeof read.timePos!=='number')return false;
  if(!Number.isFinite(read.cacheEnd)||!Number.isFinite(read.timePos))return false;
  return read.cacheEnd-read.timePos<=LIVE_EDGE_GAP_SECONDS;
 }

 function currentTiming(){
  return chatTiming.effective(behindLive());
 }

 // The estimator's offset from the raw mpv timeline to wall-clock time, while the clock is confident (its
 // behindLive is null when the estimate is unsure or the last sample is stale); otherwise null.
 function confidentOffset(){
  if(behindLive()===null)return null;
  const value=estimator.offset();
  return typeof value==='number'&&Number.isFinite(value)?value:null;
 }

 function livePlayhead(){
  const value=mpv.getNumber('time-pos');
  return typeof value==='number'&&Number.isFinite(value)?value:null;
 }

 // Review r2 #2 and r3 #2: the reveal cutoff is the chat send time up to which rows show
 // (chatTiming.revealCutoffMs). In Auto it follows the playhead, mapped to wall-clock time when the estimate
 // allows, and is held while the playhead does not advance, so held chat waits while the video is paused or
 // stalled. Manual and Live reveal by wall clock less their delay. Sampled for twitch-live whether or not
 // chat is on (onLiveStatusTick), so chat enabled after a pause starts from the held cutoff.
 function sampleCutoff(now){
  return chatTiming.revealCutoffMs({
   nowMs:now,
   timePos:livePlayhead(),
   paused:!!mpv.getFlag('pause'),
   offset:confidentOffset(),
   behindLive:behindLive(),
   // Review r4 #2: status ticks between polls reread one estimate; only distinct updates corroborate.
   estimateId:estimator.updates()
  });
 }

 // Review r3 #2 and r4 #2: a reload (Go Live's included), a new file or a mode change starts a new mapping,
 // so Auto's cutoff awaits two agreeing confident samples before it adopts one. A seek is not one of these.
 function resyncCutoff(){
  chatTiming.resyncCutoff();
 }

 // Wall-clock ms until the cutoff reaches dueMs, or null to wait for the next status tick, seek or pause
 // change. Auto's cutoff does not move while paused, and moves with the playhead otherwise; the floor keeps a
 // stalled playhead from re-arming a 0 ms timer.
 const MAPPED_REVEAL_MIN_WAIT_MS=100;

 function revealWait(cutoffMs,dueMs){
  const gap=Math.max(0,dueMs-cutoffMs);
  if(chatTiming.settings().mode!=='auto')return gap;
  if(mpv.getFlag('pause'))return null;
  const speed=Number(mpv.getNumber('speed'))||1;
  return Math.max(MAPPED_REVEAL_MIN_WAIT_MS,gap/speed);
 }

 // What the sidebar shows of live timing, at the precision it shows it.
 function liveStatusKeyOf(behind,timing,edge){
  const shown=behind===null?'none':String(Math.round(behind));
  return shown+'|'+(edge?'edge':'gap')+'|'+timing.mode+'|'+timing.state+'|'+Math.round(timing.delay*2)/2;
 }

 function clearRevealTimer(){
  if(revealTimer!==null)timers.clearTimeout(revealTimer);
  revealTimer=null;
  revealDueMs=null;
 }

 // Recomputes the visible live chat with the current delay and arms a timer for the next held message.
 // Returns whether the visible messages changed.
 function revealLive(){
  if(inert()){
   clearRevealTimer();
   return false;
  }
  const cutoffMs=source.kind==='twitch-live'?sampleCutoff(Date.now()):null;
  if(chat.mode!=='live'||cutoffMs===null){
   clearRevealTimer();
   return false;
  }
  const result=chatTiming.reveal(liveInbox,cutoffMs,0);
  const next=trimRevealed(result.visible).map(entry=>entry.message);
  const changed=next.length!==messages.length||next.some((message,i)=>message!==messages[i]);
  messages=next;
  chat.count=messages.length;
  if(result.nextDueMs!==revealDueMs){
   clearRevealTimer();
   const wait=result.nextDueMs===null?null:revealWait(cutoffMs,result.nextDueMs);
   if(wait!==null){
    revealDueMs=result.nextDueMs;
    revealTimer=timers.setTimeout(onRevealDue,wait);
   }
  }
  return changed;
 }

 function onRevealDue(){
  revealTimer=null;
  revealDueMs=null;
  if(revealLive())send();
 }

 function saveChatTiming(){
  saveSetting({chatTiming:chatTiming.settings()});
 }

 // Sidebar 'chat-timing': a partial {mode, manualDelay, fineTune}; chatTiming clamps and rounds it.
 function setChatTiming(data){
  if(inert()||!sourceActive||!plainObject(data))return;
  const partial={};
  for(const key of ['mode','manualDelay','fineTune']){
   if(key in data)partial[key]=data[key];
  }
  const modeBefore=chatTiming.settings().mode;
  chatTiming.update(partial);
  if(chatTiming.settings().mode!==modeBefore)resyncCutoff();
  saveChatTiming();
  revealLive();
  send();
 }

 // #28 sidebar 'chat-calibrate' {id}: in Manual, the clicked message is what the video shows now.
 function calibrateChat(data){
  if(inert()||!sourceActive||chat.mode!=='live'||chatTiming.settings().mode!=='manual')return;
  const id=plainObject(data)&&typeof data.id==='string'?data.id:'';
  const entry=id?liveInbox.find(item=>item.id===id&&typeof item.timestampMs==='number'):null;
  if(!entry)return;
  chatTiming.calibrate(entry,Date.now());
  // Calibrating already requires Manual, so the mode does not change and Auto's cutoff is not resynced.
  saveChatTiming();
  revealLive();
  send();
 }

 // ---- Live clock ----

 // IINA 1.5.1 JavascriptAPIMpv.getNative returns the demuxer-cache-state node as an object.
 function readLivePlayer(){
  let cacheEnd=null;
  try{
   const state=typeof mpv.getNative==='function'?mpv.getNative('demuxer-cache-state'):null;
   if(state&&typeof state['cache-end']==='number')cacheEnd=state['cache-end'];
  }catch(_){}
  return{timePos:mpv.getNumber('time-pos'),cacheEnd};
 }

 // The clock passes a code only. The playlist URL is signed and never reaches a log.
 function onLiveClockLog(code){
  if(code===lastClockCode)return;
  lastClockCode=code;
  trace('live-clock',{code:String(code)});
 }

 function startLiveClock(){
  const url=liveClockURL;
  liveClockURL=null;
  stopLiveClock();
  estimator.reset();
  lastClockCode='';
  liveClock.start(url);
  liveClockRunning=true;
  liveStatusTimer=timers.setTimeout(onLiveStatusTick,LIVE_STATUS_MS);
 }

 // Every stop ends the file timeline the estimator's offset maps (a reload, a new file, or the end).
 function stopLiveClock(){
  liveClock.stop();
  liveClockRunning=false;
  chatTiming.forgetMapping();
  resyncCutoff();
  if(liveStatusTimer!==null)timers.clearTimeout(liveStatusTimer);
  liveStatusTimer=null;
 }

 // The clock has no callback, so the player re-reads it: the pill and the Auto delay follow the estimate.
 function onLiveStatusTick(){
  liveStatusTimer=null;
  if(inert()||!liveClockRunning)return;
  const changed=revealLive();
  if(changed||liveStatusKeyOf(behindLive(),currentTiming(),atLiveEdge())!==liveStatusKey)send();
  liveStatusTimer=timers.setTimeout(onLiveStatusTick,LIVE_STATUS_MS);
 }

 // ---- Go Live (#51) ----

 async function goLive(){
  if(inert()||!sourceActive||source.kind!=='twitch-live'||goLiveBusy)return;
  const target=liveClockRunning?liveClock.goLiveTarget():null;
  const position=mpv.getNumber('time-pos');
  // Seek only when it reaches the edge. Observed in IINA 1.5.1 (2026-11-22): after a pause, mpv's cache
  // stops short of live, so cache-end - 2 landed 13 s short (-28 s to -15 s). A reload joins at the edge.
  const behind=behindLive();
  const reachesEdge=behind!==null&&behind-(target-position)<=GO_LIVE_REACH_SECONDS;
  if(Number.isFinite(target)&&Number.isFinite(position)&&target-position>GO_LIVE_MIN_LEAD_SECONDS&&reachesEdge){
   // A seek is not a resync (review r4 #2): Auto's cutoff follows the playhead's jump at up to 1.5x.
   mpv.command('seek',[String(target),'absolute']);
   mpv.set('pause',false);
   trace('go-live',{action:'seek'});
   return;
  }
  await reloadCurrentQuality();
 }

 // A seek at or past the cache end is a no-op, so the fallback reloads the playing quality at the live edge.
 // player.change() returns early for the current quality, so this stages the reload itself, taking the next
 // Playback generation so its load marker cannot repeat one a quality change will use.
 async function reloadCurrentQuality(){
  const quality=player.snapshot().quality;
  if(player.snapshot().busy)return;
  goLiveBusy=true;
  let issued=false;
  try{
   const result=await services.resolve(source,quality);
   if(inert()||!sourceActive||player.snapshot().busy)return;
   if(!result||!result.ok)throw Error(result&&result.error&&result.error.message||'The stream could not be reloaded.');
   const context={
    generation:++player.generation,
    position:0,
    paused:false,
    speed:Number(mpv.getNumber('speed'))||1
   };
   beginReplacement(context.generation);
   issued=true;
   replaceFile(result,context);
   trace('go-live',{action:'reload',quality:result.quality});
  }catch(error){
   if(!inert()&&sourceActive){
    loadError=publicError(error,'The stream could not be reloaded.');
    send();
   }
  }finally{
   if(!issued&&replacement===null)goLiveBusy=false;
  }
 }

 function beginReplacement(generation){
  endReplacement();
  goLiveBusy=true;
  goLiveGeneration=generation;
  replacement={generation,timer:timers.setTimeout(onReplacementTimeout,GO_LIVE_TIMEOUT_MS),endSeen:false};
 }

 function endReplacement(){
  if(replacement&&replacement.timer!==null)timers.clearTimeout(replacement.timer);
  replacement=null;
  goLiveBusy=false;
 }

 function onReplacementTimeout(){
  if(!replacement)return;
  const endSeen=replacement.endSeen;
  replacement.timer=null;
  endReplacement();
  trace('go-live',{action:'timeout'});
  if(!inert()&&sourceActive){
   loadError='The stream could not be reloaded.';
   // No replacement loaded, and a file ended: whichever it was, nothing is playing now.
   if(endSeen)player.ended();
   send();
  }
 }

 // Playback (src/playback.js) tracks only its own quality changes, so the player sets the phase for the file
 // a Go Live reload actually loaded.
 function replacementLoaded(generation){
  if(goLiveGeneration===null||generation!==goLiveGeneration)return;
  goLiveGeneration=null;
  if(replacement&&replacement.generation===generation)endReplacement();
  loadError='';
  player.data.phase='playing';
  player.data.error='';
  player.emit();
 }

 // A quality change while Go Live is reloading would issue a second replacement in parallel: ignored.
 function changeQuality(quality){
  if(goLiveBusy)return Promise.resolve(false);
  return player.change(quality);
 }

 function setView(change){
  if(!sourceActive||!change||typeof change!=='object')return;
  const editing=change.editing===undefined?view.editing:!!change.editing;
  view=viewSettings(change.reset?{}:Object.assign({},view,change));
  view.editing=editing&&view.presentation==='overlay';
  saveSetting({view:Object.assign({},view,{editing:false})});
  if(overlayNeeded()){
   ensureOverlay();
  }else{
   hideOverlay();
   view.editing=false;
  }
  send();
 }

 // ---- Chat modes ----

 function stopReplay(){
  if(timeObserver!==null){
   event.off('mpv.time-pos.changed',timeObserver);
   timeObserver=null;
  }
  if(updateTimer!==null){
   timers.clearTimeout(updateTimer);
   updateTimer=null;
  }
  if(replay)replay.clear();
  lastSignature='';
 }

 function requestAuth(clientID){
  const data={clientID};
  if(authBound)app.postMessage('auth-connect',data);
  else pendingAuth={data,generation:chatGeneration};
 }

 function cancelAuthBinding(){
  if(authBindTimer!==null){
   timers.clearTimeout(authBindTimer);
   authBindTimer=null;
  }
  authBindSkipped=false;
  pendingAuth=null;
 }

 // Review r5 #1: a bind turn that ran while retiring registered nothing. When this controller's own source
 // supersedes the cleanup, bind again on a later turn, as at startup.
 function rearmSkippedAuthBinding(){
  if(!authBindSkipped||authBindTimer!==null||authBound||closed)return;
  authBindSkipped=false;
  const bindingTimer=timers.setTimeout(()=>{
   if(authBindTimer!==bindingTimer)return;
   authBindTimer=null;
   bindAuthListeners();
  },0);
  authBindTimer=bindingTimer;
 }

 // Turns chat off. Unless told otherwise it also tells the broker this window no longer needs the login,
 // which releases the in-memory grant but never revokes or clears a saved one. options.retire marks the
 // controller's retirement on a reused core (review r3 #3): global then ends that label's auth session.
 function chatOff(options){
  chatGeneration++;
  pendingAuth=null;
  stopReplay();
  stopLiveTransport();
  if(services.cancelHelpers){
   try{
    services.cancelHelpers(['replay','acquire']);
   }catch(_){}
  }
  if(!options||options.releaseAuth!==false){
   app.postMessage('auth-disconnect',options&&options.retire?{retire:true}:{});
  }
  resetLiveBuffer();
  chat.mode='off';
  chat.state='off';
  chat.error='';
  view.editing=false;
  hideOverlay();
  if(options&&options.retire)publishFinal();
  else send();
  trace('chat-off');
 }

 function resumeReplay(){
  if(!replay||inert()||!sourceActive)return;
  chatOff();
  chat.mode='replay';
  chat.state='ready';
  timeObserver=event.on('mpv.time-pos.changed',()=>tick(false));
  if(view.presentation==='overlay')ensureOverlay();
  tick(true);
  send();
 }

 // ---- Replay chat ----

 function twitchTime(){
  return Math.max(0,(Number(mpv.getNumber('time-pos'))||0)+chat.offset);
 }

 function maybeRefreshTwitch(seeking){
  if(source.kind!=='twitch-vod'||!chatPreferred||inert()||!sourceActive)return;
  const t=twitchTime();
  if(seeking)twitchStall=null;
  if(twitchStall){
   if(t<=twitchStall.after)return;
   twitchStall=null;
  }
  if(twitchFetchBusy){
   if(seeking&&Math.abs(t-twitchFetchAt)>25)twitchQueuedAt=t;
   return;
  }
  if(chat.mode!=='replay'||!twitchWindow||(!seeking&&Date.now()<twitchNextAttempt))return;
  if(t<twitchWindow.start-2||(twitchWindow.hasMore&&t>=twitchWindow.end-15)){
   twitchNextAttempt=Date.now()+2500;
   fetchTwitchWindow({auto:true,at:t});
  }
 }

 function tick(force){
  if(inert()||chat.mode!=='replay'||!replay)return;
  const elapsed=Date.now()-lastTick;
  if(!force&&elapsed<200){
   if(updateTimer===null)updateTimer=timers.setTimeout(onThrottledTick,200-elapsed);
   return;
  }
  lastTick=Date.now();
  try{
   const t=Number(mpv.getNumber('time-pos'))||0;
   const result=replay.windowAt(t,{offsetSeconds:chat.offset,limit:150,windowSeconds:120});
   const signature=result.map(m=>m.id+':'+m.time).join('|');
   if(signature!==lastSignature){
    lastSignature=signature;
    messages=result.map(safeMessage);
    send();
   }
  }catch(_){
   chat.error='The chat archive could not be read. Import it again.';
   chat.state='error';
   stopReplay();
   messages=[];
   send();
   return;
  }
  maybeRefreshTwitch(false);
 }

 function onThrottledTick(){
  updateTimer=null;
  tick(true);
 }

 async function importArchive(path,options){
  if(inert()||!sourceActive)return false;
  const preserve=!!(options&&options.preserve&&chat.mode==='replay');
  const selectionGeneration=chatGeneration;
  if(!path)path=await host.utils.chooseFile('Import chat archive',{allowedFileTypes:['json','jsonl','ndjson']});
  if(!path||inert()||selectionGeneration!==chatGeneration)return false;
  if(!preserve){
   chatOff();
   chat.state='importing';
   chat.error='';
   send();
  }
  const myGeneration=chatGeneration;
  let output='',outputOwned=false;
  try{
   output=uniqueDataPath('replay');
   const result=await services.runHelper('replay',['import','--input',path,'--output',output]);
   outputOwned=!!result&&result.ok&&result.indexPath===output+'/index.json';
   if(inert()||chatGeneration!==myGeneration)return false;
   if(!result||!result.ok)throw Error(result&&result.error&&result.error.message||'The archive could not be imported.');
   if(result.indexPath!==output+'/index.json')throw Error('The imported archive location is invalid.');
   const index=JSON.parse(services.readFile(result.indexPath));
   if(options&&options.twitch&&String(index.sourceId||'')!==String(source.id)){
    throw Error('The downloaded chat does not belong to this recording.');
   }
    const nextReplay=new Replay(index,file=>JSON.parse(services.readFile(output+'/'+file)));
   const oldPath=replayPath;
   replay=nextReplay;
   replayPath=output;
   replayMetadata=index;
   if(oldPath&&services.deleteDataPath)services.deleteDataPath(oldPath);
   chat.count=index.count;
   chat.sourceName=options&&options.twitch?'Twitch chat near playback':index.title||'Imported chat';
   chat.available=true;
   chat.error='';
   if(!preserve)chat.offset=0;
   twitchWindow=options&&options.twitch?options.window:null;
   if(preserve){
    lastSignature='';
    tick(true);
    send();
   }else{
    resumeReplay();
   }
   trace('replay-imported',{
    count:index.count,
    format:index.provenance&&index.provenance.format,
    windowed:!!(options&&options.twitch)
   });
   return true;
  }catch(error){
   if(inert()||chatGeneration!==myGeneration)return false;
   if(!preserve)chat.state='error';
   chat.error=publicError(error,'Could not import chat.');
   send();
   return false;
  }finally{
   if(outputOwned&&output!==replayPath&&services.deleteDataPath)services.deleteDataPath(output);
  }
 }

 function uniqueDataPath(prefix){
  return services.dataPath(prefix+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,9));
 }

 function validTwitchWindow(w,at){
  if(!w||![w.start,w.end,w.requested].every(Number.isFinite))return false;
  if(w.start<0||w.end<w.start||w.end>2592000)return false;
  if(w.requested<0||w.requested>2592000)return false;
  return typeof w.hasMore==='boolean'&&w.requested===at;
 }

 async function fetchTwitchWindow(options){
  const auto=!!(options&&options.auto);
  if(inert()||!sourceActive||source.kind!=='twitch-vod'||(auto&&!chatPreferred))return false;
  const at=Number.isFinite(Number(options&&options.at))?Math.max(0,Number(options.at)):twitchTime();
  if(twitchFetchBusy){
   if(Math.abs(at-twitchFetchAt)>25)twitchQueuedAt=at;
   return false;
  }
  if(!auto){
   setChatPreferred(true);
   twitchStall=null;
  }
  const preserve=chat.mode==='replay'&&!!replay;
  if(!preserve){
   chatOff();
   chat.state='fetching';
   chat.error='';
   send();
  }
  const generation=chatGeneration;
  const downloadPath=uniqueDataPath('download');
  let owned=false,seekWasQueued=false;
  twitchFetchBusy=true;
  twitchFetchAt=at;
  twitchNextAttempt=Date.now()+2500;
  try{
   const result=await services.runHelper('acquire',['--url',source.url,'--output',downloadPath,'--at',String(at)]);
   owned=!!result&&result.ok&&result.path===downloadPath+'/replay.jsonl';
   if(inert()||!sourceActive||generation!==chatGeneration)return false;
   if(!result||!result.ok)throw Error(result&&result.error&&result.error.message||'Twitch chat could not be fetched.');
   if(!owned)throw Error('The downloaded chat location is invalid.');
   const w=result.window;
   if(!validTwitchWindow(w,at))throw Error('The chat window metadata is invalid.');
   const now=twitchTime();
   if(Math.abs(now-at)>25&&(now<w.start-10||now>w.end+10)){
    twitchQueuedAt=now;
    return false;
   }
   const imported=await importArchive(result.path,{
    preserve,
    twitch:true,
    window:{start:w.start,end:w.end,hasMore:w.hasMore}
   });
   if(imported){
    // No progress past the playhead: the same request would return the same window.
    const partial=w.hasMore&&w.end<=at+15;
    twitchNextAttempt=partial?Date.now()+2500:0;
    twitchStall=auto&&partial?{after:Math.max(at,w.end)}:null;
    return true;
   }
   return false;
  }catch(error){
   if(!inert()&&sourceActive&&generation===chatGeneration){
    twitchNextAttempt=Date.now()+30000;
    // A seek that arrived while this request ran asks for a different position. Stay in "fetching" so the
    // finally block below requests it; this failed position is not retried. Off, close and a source change
    // end up in the generation and sourceActive checks above, so they never reach this branch.
    seekWasQueued=!preserve&&twitchQueuedAt!==null&&chatPreferred;
    if(!preserve&&!seekWasQueued){
     chat.state='unavailable';
     chat.available=false;
    }
    chat.error=String(error&&error.message||'Twitch replay is unavailable.').slice(0,180);
    send();
   }
   return false;
  }finally{
   if(owned&&services.deleteDataPath)services.deleteDataPath(downloadPath);
   twitchFetchBusy=false;
   const pending=twitchQueuedAt;
   twitchQueuedAt=null;
   if(pending!==null&&!inert()&&sourceActive&&chatPreferred&&(chat.mode==='replay'||chat.state==='fetching')){
    // With no chat on screen, a failed first fetch has no window to cover the queued position.
    const outside=seekWasQueued||!twitchWindow||pending<twitchWindow.start-2||pending>twitchWindow.end-10;
    if(outside)fetchTwitchWindow({auto:true,at:pending});
   }
  }
 }

 async function fetchReplay(options){
  const auto=!!(options&&options.auto);
  if(inert()||!sourceActive)return;
  if(source.kind==='twitch-vod')return fetchTwitchWindow(options||{});
  if(source.kind!=='youtube')return;
  chatOff();
  const myGeneration=chatGeneration;
  chat.state='fetching';
  send();
  const downloadPath=uniqueDataPath('download');
  let downloadOwned=false;
  try{
   const result=await services.runHelper('acquire',['--url',source.url,'--output',downloadPath]);
   downloadOwned=!!result&&result.ok&&result.path===downloadPath+'/replay.jsonl';
   if(inert()||chatGeneration!==myGeneration)return;
   if(!result.ok)throw Error(result.error&&result.error.message||'Replay is unavailable for this video.');
   if(!downloadOwned)throw Error('The downloaded replay location is invalid.');
   await importArchive(result.path);
  }catch(error){
   if(inert()||chatGeneration!==myGeneration)return;
   if(auto&&source.kind==='youtube'){
    chat.state='off';
    chat.error='';
    chat.available=false;
    send();
    return;
   }
   chat.state='unavailable';
   chat.error=String(error&&error.message||'Replay is unavailable.').slice(0,180);
   send();
  }finally{
   if(downloadOwned&&services.deleteDataPath)services.deleteDataPath(downloadPath);
  }
 }

 // ---- Quality reloads ----

 async function refresh(){
  if(inert()||!sourceActive||refreshing||player.snapshot().busy)return;
  refreshing=true;
  try{
   const result=await services.resolve(source,player.snapshot().quality);
   if(inert()||!sourceActive)return;
   if(!result.ok)throw Error('Unavailable');
   player.data.formats=result.formats;
   loadError='';
   send();
  }catch(_){
   if(!inert()&&sourceActive){
    loadError='Qualities unavailable. Try again.';
    send();
   }
  }finally{
   refreshing=false;
  }
 }

 function applyResolution(result,context){
  if(restoreTimer!==null){
   timers.clearTimeout(restoreTimer);
   restoreTimer=null;
  }
  restoration={context,live:result.live,loaded:false,sized:false,loadedAt:null,lastSizeAt:null};
  if(result.headers){
   mpv.set('file-local-options/http-header-fields',Object.keys(result.headers).map(k=>k+': '+result.headers[k]));
  }
  if(result.audioURL)mpv.command('audio-add',[result.audioURL,'auto','Audio']);
  mpv.set('stream-open-filename',result.mediaURL);
  liveClockURL=source.kind==='twitch-live'&&typeof result.mediaURL==='string'?result.mediaURL:null;
  mpv.set('file-local-options/force-media-title',String(result.title||source.id)+' — '+source.provider);
  if(context.position>0&&!result.live)mpv.set('file-local-options/start',context.position);
  mpv.set('pause',!!context.paused);
  mpv.set('speed',context.speed||1);
 }

 function restoreAfterNativeLoad(){
  if(!restoration||!restoration.loaded)return;
  if(restoreTimer!==null)timers.clearTimeout(restoreTimer);
  const expected=restoration;
  const now=Date.now();
  const sinceLoad=Math.max(0,now-expected.loadedAt);
  const quietRemaining=Math.max(0,600-Math.max(0,now-expected.lastSizeAt));
  const delay=expected.sized?Math.min(quietRemaining,Math.max(0,2500-sinceLoad)):Math.max(0,1600-sinceLoad);
  restoreTimer=timers.setTimeout(()=>restorePlaybackState(expected),delay);
 }

 function restorePlaybackState(expected){
  restoreTimer=null;
  if(inert()||!sourceActive||restoration!==expected)return;
  restoration=null;
  const c=expected.context;
  if(c.generation!==activeGeneration)return;
  if(!expected.live&&c.position>0)mpv.command('seek',[String(c.position),'absolute+exact']);
  mpv.set('speed',c.speed||1);
  mpv.set('pause',!!c.paused);
  const restoreFrame=c.generation>0&&!c.fullscreen&&!core.window.fullscreen&&usableFrame(c.frame);
  if(restoreFrame)Reflect.set(core.window,'frame',c.frame);
  tick(true);
  send();
  trace('state-restored',{
   generation:c.generation,
   paused:!!c.paused,
   speed:c.speed||1,
   requestedPosition:expected.live?0:c.position
  });
  player.loaded(c.generation);
  send();
 }

 function usableFrame(frame){
  return frame&&Number.isFinite(frame.width)&&Number.isFinite(frame.height);
 }

 function onWindowSizeAdjusted(){
  trace('native-size-adjusted',{frame:core.window.frame});
  if(restoration&&restoration.loaded){
   restoration.sized=true;
   restoration.lastSizeAt=Date.now();
   restoreAfterNativeLoad();
  }
 }

 // ---- Native file lifecycle ----

 function deactivateForForeignFile(){
  sourceActive=false;
  endReplacement();
  cancelAuthBinding();
  chatOff();
  if(services.cancelHelpers)services.cancelHelpers();
  player.deactivate();
  stopLiveClock();
  timers.clearAll();
  staged=null;
  loadError=INACTIVE_MESSAGE;
  publishFinal();
 }

 // The adopted hook's watchdog gave up on this load (see holdLoad): drop any late result, and leave this and
 // later files to IINA's own loader.
 function passThrough(){
  if(closed)return;
  generation++;
  deactivateForForeignFile();
 }

 function initialContext(){
  return{generation:0,position:source.startSeconds||0,paused:false,speed:1};
 }

 async function onLoadHook(next){
  const mine=++generation;
  let completed=false;
  const finish=()=>{
   if(completed)return;
   completed=true;
   if(typeof next==='function')next();
  };
  try{
   if(closed){
    finish();
    return;
   }
   const current=loadingPath(mpv);
   const parsed=Sources.parse(current);
   if(source.kind!=='local-test'&&(!parsed||parsed.url!==source.url)){
    // Adopted windows never reach this: their core hook retires the controller (waitForNativeStream).
    // Review r3 #5: the foreign file continues at once, on the hook, because a plugin timer may never run.
    // Review r2 #6: deactivation runs on a later main-thread turn, never on mpv's hook queue. A close or a
    // later load before that turn owns what happens next.
    // Review r4 #3: the controller loses its authority before the hook continues, in pure JS.
    retiring=true;
    finish();
    timers.setTimeout(()=>{
     if(closed||mine!==generation)return;
     retiring=false;
     deactivateForForeignFile();
    },0);
    return;
   }
   // This source loads again: a pending foreign cleanup is superseded, and the controller's authority returns,
   // active or already deactivated.
   retiring=false;
   if(!sourceActive){
    finish();
    return;
   }
   rearmSkippedAuthBinding();
   // A new file is loading: the old playlist no longer describes what plays. file-loaded starts the next.
   stopLiveClock();
   liveClockURL=null;
   let result,context;
   if(staged){
    result=staged.result;
    context=staged.context;
    staged=null;
   }else if(source.kind==='local-test'){
    result={
     ok:true,title:config.qa.title||'Native replay test',live:false,duration:600,quality:'local',formats:[],
     mediaURL:source.url
    };
    context=initialContext();
   }else{
    phase('resolve-start',{quality:'auto720'});
    result=await services.resolve(source,'auto720');
    // A failed result is traced as 'error' by the catch below.
    if(result&&result.ok)phase('resolve-done',{quality:result.quality,live:!!result.live});
    context=initialContext();
   }
   // inert, not closed: an adopted controller retiring during this resolve must not touch the next file.
   if(inert()||mine!==generation){
    finish();
    return;
   }
   if(!result||!result.ok)throw Error(result&&result.error&&result.error.message||'This source could not be opened.');
   activeGeneration=context.generation;
   applyResolution(result,context);
   if(!initialResolved){
    player.adopt(result);
    initialResolved=true;
   }
   loadError='';
   trace('resolved',{quality:result.quality,live:result.live});
  }catch(error){
   phase('error',{error:publicError(error,'Unable to open source.')});
   if(!closed){
    loadError=publicError(error,'Unable to open source.');
    send();
    trace('load-error',{error:loadError});
   }
  }finally{
   finish();
  }
 }

 function onWindowLoaded(){
  windowLoaded=true;
  if(controlsDesired)showSidebar();
  if(overlayNeeded())ensureOverlay();
  trace('window-loaded');
 }

 // A quality reload must preserve IINA's native sidebar choice, including a collapse with no plugin event.
 function onFileLoaded(url){
  if(inert()||!sourceActive)return;
  let decoded=String(url||'');
  try{
   decoded=decodeURIComponent(decoded);
  }catch(_){}
  const parsed=Sources.parse(decoded);
  if(source.kind!=='local-test'&&(!parsed||parsed.url!==source.url))return;
  const marker=/#streams-generation=(\d+)$/.exec(decoded);
  const loadedGeneration=marker?Number(marker[1]):0;
  if(loadedGeneration!==activeGeneration)return;
  replacementLoaded(loadedGeneration);
  if(restoration){
   if(!restoration.loaded){
    restoration.loaded=true;
    restoration.loadedAt=Date.now();
   }
   restoreAfterNativeLoad();
  }
  if(controlsDesired&&loadedGeneration===0)showSidebar();
  if(overlayNeeded())ensureOverlay();
  if(loadedGeneration===0)maybeAutoFetchReplay();
  if(liveClockURL)startLiveClock();
  tick(true);
  trace('file-loaded',{
   generation:loadedGeneration,
   reportedQuality:player.snapshot().quality,
   width:mpv.getNumber('video-params/w'),
   height:mpv.getNumber('video-params/h')
  });
 }

 function maybeAutoFetchReplay(){
  if(source.kind!=='youtube'&&source.kind!=='twitch-vod')return;
  if(player.snapshot().live||chat.mode!=='off'||!chatPreferred||autoReplayAttempted)return;
  autoReplayAttempted=true;
  fetchReplay({auto:true});
 }

 // During a Go Live replacement an end-file is unattributed (see `replacement`): it is not a stop and does
 // not end the transaction.
 function onEndFile(){
  if(replacement){
   replacement.endSeen=true;
   trace('end-file',{replaced:true});
   return;
  }
  player.ended();
  trace('end-file');
 }

 // A seek moves the playhead within one file timeline, so it is not a resync (review r4 #2): Auto's cutoff
 // follows the jump through its 1.5x cap. A pause change stops or restarts it.
 function onSeek(){
  tick(true);
  maybeRefreshTwitch(true);
  if(revealLive())send();
 }

 function onPauseChanged(){
  tick(true);
  revealLive();
  send();
 }

 function onFullscreenChanged(){
  send();
  trace('fullscreen',{fullscreen:core.window.fullscreen});
 }

 function onWindowWillClose(){
  if(closed)return;
  teardown({notifyGlobal:true});
  windowClosed();
 }

 // Review r1 #6: a later load on this core retires this controller. Its sidebar shows that Streams is
 // inactive, then everything is closed as for a window close, except that global is not told the window
 // closed: the window stays, and a stream adopted next takes over the same player.
 function retire(){
  if(closed)return;
  generation++;
  sourceActive=false;
  staged=null;
  player.deactivate();
  loadError=INACTIVE_MESSAGE;
  // teardown's chatOff posts this final state before the controller closes, and tells global this
  // controller's auth use is over (review r3 #3).
  teardown({notifyGlobal:false,retire:true});
 }

 // Review r4 #3: the core marks the controller before a pass-through continues; retire() tears it down later.
 function beginRetiring(){
  retiring=true;
 }

 // A load is this controller's own only when it is the staged reload it issued, by generation marker.
 function ownsLoad(path){
  if(inert()||!sourceActive||!staged)return false;
  let decoded=String(path||'');
  try{
   decoded=decodeURIComponent(decoded);
  }catch(_){}
  const parsed=Sources.parse(decoded);
  const marker=/#streams-generation=(\d+)$/.exec(decoded);
  return !!parsed&&parsed.url===source.url&&!!marker&&Number(marker[1])===staged.context.generation;
 }

 function teardown(options){
  if(closed)return;
  endReplacement();
  cancelAuthBinding();
  chatOff({retire:!!options.retire});
  if(services.cancelHelpers)services.cancelHelpers();
  if(replayPath&&services.deleteDataPath)services.deleteDataPath(replayPath);
  replay=null;
  replayPath='';
  if(options.notifyGlobal)app.postMessage('player-closed',{});
  closed=true;
  generation++;
  player.close();
  stopLiveClock();
  timers.clearAll();
  restoreTimer=null;
  restoration=null;
  for(const [name,id] of listeners){
   try{
    event.off(name,id);
   }catch(_){}
  }
  trace('window-closed');
 }

 // ---- Auth messages from the global entry ----

 function authReceiver(accept,handler){
  return wire=>{
   if(inert()||!sourceActive||typeof wire!=='string'||wire.length>8192)return;
   let data;
   try{
    data=JSON.parse(wire);
   }catch(_){
    return;
   }
   if(!data||typeof data!=='object'||Array.isArray(data)||!accept(data))return;
   handler(data);
  };
 }

 function onAuthStatus(data){
  if(data.login)auth=Object.assign({},auth,{login:data.login});
  if(data.saved){
   auth=Object.assign({},auth,{saved:true});
   if(chatPreferred&&chat.mode==='off'&&source.kind==='twitch-live'){
    chat=authorizingLiveChat();
    const myGen=chatGeneration;
    timers.setTimeout(()=>{
     if(!inert()&&sourceActive&&chat.mode==='live'&&chatGeneration===myGen)requestAuth('');
    },0);
   }
  }
  send();
 }

 function onAuthState(data){
  trace('auth-state-received',{authPhase:data.phase,chatMode:chat.mode});
  if(chat.mode!=='live')return;
  auth=Object.assign({},data,{saved:data.phase==='ready'||auth.saved});
  chat.state=data.phase;
  chat.error=data.message||'';
  send();
 }

 function onAuthReady(data){
  if(chat.mode!=='live')return;
  if(liveStarted)stopLiveTransport();
  liveCredential={token:data.token,login:data.login};
  ensureOverlay();
  startLiveTransport();
 }

 function onAuthStop(){
  trace('auth-stop-received',{chatMode:chat.mode});
  stopLiveTransport();
  if(chat.mode==='live'){
   chat.state='disconnected';
   clearRevealTimer();
   liveInbox=[];
   messages=[];
   send();
  }
 }

 function onAuthForgotten(result){
  auth={phase:'off',message:'',saved:false};
  if(!result.removed)chat.error='The saved authorization could not be cleared from Keychain.';
  else if(!result.revoked)chat.error='Saved login cleared. Twitch revocation could not be confirmed.';
  else chat.error='';
  send();
 }

 const AUTH_PHASES=['off','error','needs-client','authorizing','waiting','ready'];
 const authCallbacks={
  'auth-status':authReceiver(data=>typeof data.saved==='boolean',onAuthStatus),
  'auth-state':authReceiver(data=>AUTH_PHASES.includes(data.phase),onAuthState),
  'auth-ready':authReceiver(validCredential,onAuthReady),
  'auth-stop':authReceiver(()=>true,onAuthStop),
  'auth-forgotten':authReceiver(validForgetResult,onAuthForgotten)
 };

 function validCredential(data){
  if(typeof data.token!=='string'||!/^[A-Za-z0-9_-]{16,512}$/.test(data.token))return false;
  return typeof data.login==='string'&&/^[a-z0-9_]{3,25}$/.test(data.login);
 }

 function validForgetResult(data){
  return typeof data.removed==='boolean'&&typeof data.revoked==='boolean'&&data.stale!==true;
 }

 // ---- Registration ----

 on('iina.plugin-overlay-loaded',onOverlayLoaded);
 on('iina.window-size-adjusted',onWindowSizeAdjusted);
 registerLoadHook(onLoadHook);
 on('iina.window-loaded',onWindowLoaded);
 on('iina.file-loaded',onFileLoaded);
 on('mpv.end-file',onEndFile);
 on('mpv.seek',onSeek);
 on('mpv.pause.changed',onPauseChanged);
 on('iina.window-fs.changed',onFullscreenChanged);
 on('iina.window-will-close',onWindowWillClose);

 // IINA creates the child while the parent's createPlayerInstance call is on
 // stack. Bind from a later child turn and retain callbacks in the controller.
 // The wrapped timer clears IINA's retained native entry when it fires.
 const bindingTimer=timers.setTimeout(()=>{
  if(authBindTimer!==bindingTimer)return;
  authBindTimer=null;
  if(!closed)app.onMessage('open-error',onOpenError);
  bindAuthListeners();
 },0);
 authBindTimer=bindingTimer;

 function bindAuthListeners(){
  if(closed||authBound)return;
  if(retiring){
   authBindSkipped=true;
   return;
  }
  if(!sourceActive)return;
  for(const name of Object.keys(authCallbacks))app.onMessage(name,authCallbacks[name]);
  authBound=true;
  const pending=pendingAuth;
  pendingAuth=null;
  if(pending&&pending.generation===chatGeneration&&chat.mode==='live')app.postMessage('auth-connect',pending.data);
  else if(source.kind==='twitch-live'&&chat.mode==='off')app.postMessage('auth-probe',{});
 }

 // Beside Video is D1's presentation (D-028), not built yet: listed and inert until D1 adds it. Its action is
 // a no-op because a submenu's NSMenu keeps AppKit auto-enabling (IINA turns that off only for the top-level
 // plugin menu, MenuController.swift), so enabled:false alone may not grey it out.
 function chatMenu(){
  const parent=menu.item('Chat',null);
  const children=[
   menu.item('Import Chat Archive…',whileOpen(()=>importArchive())),
   menu.item('Turn Chat Off',whileOpen(onChatOffRequest)),
   menu.item('In Sidebar',whileOpen(()=>setView({presentation:'sidebar'}))),
   menu.item('Over Video',whileOpen(()=>setView({presentation:'overlay'}))),
   menu.item('Beside Video',()=>{},{enabled:false})
  ];
  for(const child of children)parent.addSubMenuItem(child);
  return parent;
 }

 // IINA 1.5.1 shows five top-level plugin items, counting global's Open Stream (MenuController.updatePluginMenu).
 // A parent with a null action only opens its submenu (JavascriptAPIMenu.item, JavascriptPluginMenuItem).
 menu.addItem(menu.item('Show Streams',whileOpen(showSidebar)));
 menu.addItem(menu.item('Go Live',whileOpen(()=>{
  goLive();
 }),{keyBinding:GO_LIVE_KEY,enabled:source.kind==='twitch-live'}));
 menu.addItem(chatMenu());
 if(windowLoaded)showSidebar();

 return{
  snapshot,showSidebar,hideSidebar,chatOff,setView,importArchive,resumeReplay,tick,
  changeQuality:q=>changeQuality(q),
  qaCommand:(name,data)=>{
   if(config.qa&&sidebarReady)postSidebar('qa-action',{name,data});
  },
  overlayCommand:(name,data)=>{
   if(config.qa&&overlayReady)postOverlay('qa-action',{name,data});
  },
  trace,
  passThrough,
  ownsLoad,
  beginRetiring,
  retire,
  isClosed:()=>closed,
  _authCallbacks:authCallbacks
 };
}

module.exports={start,viewSettings,safeMessage};
