"use strict";
const Sources=require('./source.js');
const {Playback}=require('./playback.js');
const {envelope}=require('./bridge.js');
const {Replay}=require('./replay.js');
const {create:createTimers}=require('./timers.js');

const DEFAULT_VIEW={
 presentation:'sidebar',fontSize:14,opacity:0.58,lines:6,spacing:4,timestamps:false,timestampSeconds:false,
 x:1,y:0,width:340,height:260,density:'comfortable',editing:false
};

function clamp(n,low,high,fallback){
 n=Number(n);
 return Number.isFinite(n)?Math.max(low,Math.min(high,n)):fallback;
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
 return{
  id:String(m.id||'').slice(0,160),
  time:Number(m.time||m.t)||0,
  sentAt:Number(m.timestampMs||m.sentAt)||0,
  author:String(m.author||'').slice(0,80),
  text:String(m.text||'').slice(0,2000),
  color:/^#[0-9a-f]{6}$/i.test(m.color||'')?m.color:'',
  kind:String(m.kind||'message')
 };
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

// A window Streams created has a stream label and runs at once. Any other IINA window gets only an on_load
// hook, and returns null: no controls, timers or network until a stream loads (see waitForNativeStream).
function start(host,config,services){
 const label=host.global.getLabel()||'';
 const identity=Sources.fromLabel(label)||qaLocalIdentity(config,label);
 if(identity)return run(host,config,services,identity,onLoad=>host.mpv.addHook('on_load',20,onLoad));
 waitForNativeStream(host,config,services);
 return null;
}

// #35: a Twitch or YouTube URL opened in IINA itself (Open URL, the browser extension, `open -a IINA`)
// arrives in a window Streams did not create. When the first such URL loads, Streams adopts it as the
// window's source and handles that load, and every later one, through the normal pipeline.
// Only an http(s) URL is adopted: Sources.parse reads a bare word as a Twitch channel, and a local path
// can be a bare word. Any other file passes through untouched. IINA keeps every hook it is given, so
// there is exactly one.
const ADOPTABLE_KINDS=['twitch-live','twitch-vod','youtube'];

function adoptableSource(path){
 if(!/^https?:\/\//i.test(path))return null;
 const source=Sources.parse(path);
 return source&&ADOPTABLE_KINDS.includes(source.kind)?source:null;
}

function waitForNativeStream(host,config,services){
 let adoptedLoadHook=null;
 function adoptLoadHook(onLoad){
  adoptedLoadHook=onLoad;
 }
 function onLoad(next){
  if(adoptedLoadHook)return adoptedLoadHook(next);
  const source=adoptableSource(loadingPath(host.mpv));
  if(!source){
   if(typeof next==='function')next();
   return undefined;
  }
  run(host,config,services,{source,variant:config.variant},adoptLoadHook);
  return adoptedLoadHook(next);
 }
 host.mpv.addHook('on_load',20,onLoad);
}

// The Streams controller for one window and one source. registerLoadHook receives the on_load handler.
function run(host,config,services,identity,registerLoadHook){
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
 let sidebarLoaded=false,sidebarReady=false,sidebarVisible=false,controlsDesired=true;
 let overlayLoaded=false,overlayReady=false;
 // Load generations and source ownership.
 let generation=0,activeGeneration=0,staged=null,loadError='',initialResolved=false;
 let chatGeneration=0,sourceActive=true,autoReplayAttempted=false;
 // Auth listener binding (see bindAuthListeners).
 let authBindTimer=null,authBound=false,pendingAuth=null;
 // Playback-state restoration after a quality reload.
 let restoration=null,restoreTimer=null,refreshing=false;
 // Replay chat.
 let replay=null,replayPath='',replayMetadata=null,messages=[],timeObserver=null,updateTimer=null;
 let lastTick=0,lastSignature='';
 // Twitch VOD chat windows.
 let twitchWindow=null,twitchFetchBusy=false,twitchFetchAt=0,twitchQueuedAt=null,twitchNextAttempt=0;
 // Live chat transport, which runs in the overlay page.
 let liveCredential=null,liveStarted=false,liveRun=0;
 let chat={mode:'off',state:'off',error:'',count:0,sourceName:'',offset:0,available:false};
 const listeners=[];
 const postSidebar=(name,data)=>sidebar.postMessage(name,envelope(data));
 const postOverlay=(name,data)=>overlay.postMessage(name,envelope(data));
 const player=new Playback({
  source,
  resolve:q=>services.resolve(source,q),
  readPlayer:()=>({position:mpv.getNumber('time-pos'),paused:mpv.getFlag('pause'),speed:mpv.getNumber('speed')}),
  replace:replaceFile,
  onState:()=>send(),
  setTimer:timers.setTimeout,
  clearTimer:timers.clearTimeout
 });
 const diag=[];

 function on(name,fn){
  const id=event.on(name,fn);
  listeners.push([name,id]);
 }

 function replaceFile(result,context){
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

 function send(){
  if(closed)return;
  const s=snapshot();
  if(overlayReady)postOverlay('state',{view:s.view,messages:s.messages,chat:s.chat,qa:s.qa});
  if(sidebarReady&&sidebarVisible){
   try{
    postSidebar('state',s);
   }catch(_){}
  }
 }

 // ---- Sidebar messages ----

 function connectMessages(){
  sidebar.onMessage('ready',onSidebarReady);
  sidebar.onMessage('change-quality',q=>player.change(String(q)));
  sidebar.onMessage('refresh',()=>refresh());
  sidebar.onMessage('hide',hideSidebar);
  sidebar.onMessage('surface-visibility',onSurfaceVisibility);
  sidebar.onMessage('open',onSidebarOpen);
  sidebar.onMessage('import',()=>importArchive());
  sidebar.onMessage('replay-resume',onReplayResume);
  sidebar.onMessage('chat-off',onChatOffRequest);
  sidebar.onMessage('fetch-replay',fetchReplay);
  sidebar.onMessage('view',setView);
  sidebar.onMessage('offset',setOffset);
  sidebar.onMessage('seek-chat',seekChat);
  sidebar.onMessage('first-message',seekFirstMessage);
  sidebar.onMessage('connect',connectLive);
  sidebar.onMessage('open-twitch-console',()=>host.utils.open('https://dev.twitch.tv/console/apps/create'));
  sidebar.onMessage('authorize-open',openActivation);
  sidebar.onMessage('forget-auth',forgetAuth);
  if(config.qa)sidebar.onMessage('qa-result',data=>trace('ui-result',data));
 }

 // The sidebar's inline field sends {input}; global parses it and opens the stream (#50).
 function onSidebarOpen(data){
  const input=data&&typeof data.input==='string'?data.input:undefined;
  app.postMessage('open',input===undefined?{}:{input});
 }

 // Global rejected the sidebar's input. This holds even after deactivation: the field stays usable.
 function onOpenError(){
  if(closed)return;
  postSidebar('open-error',{});
 }

 function onSidebarReady(){
  if(closed)return;
  sidebarReady=true;
  send();
  trace('sidebar-ready');
 }

 function onSurfaceVisibility(data){
  if(closed||!data||typeof data.visible!=='boolean')return;
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
  if(closed||!sourceActive)return;
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
  if(closed||!sourceActive||chat.mode!=='replay'||!replayMetadata)return;
  const t=Math.max(0,replayMetadata.timeline.availableStart-chat.offset);
  mpv.command('seek',[String(t),'absolute+exact']);
 }

 function connectLive(data){
  if(closed||!sourceActive)return;
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
  if(closed||!windowLoaded)return;
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
  liveRun++;
  liveCredential=null;
  liveStarted=false;
  if(overlayReady)postOverlay('live-stop',{});
 }

 function startLiveTransport(){
  if(closed||!sourceActive||chat.mode!=='live'||!overlayReady||!liveCredential||liveStarted)return;
  const credential=liveCredential;
  liveCredential=null;
  liveStarted=true;
  postOverlay('live-config',{token:credential.token,login:credential.login,channel:source.id,session:++liveRun});
 }

 function ensureOverlay(){
  diagLog('ensureOverlay',{windowLoaded,overlayLoaded,overlayReady,mode:chat.mode,pres:view.presentation});
  if(closed||!windowLoaded)return;
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
  if(closed||!overlayLoaded)return;
  overlay.onMessage('overlay-ready',onOverlayReady);
  overlay.onMessage('live-state',onLiveState);
  overlay.onMessage('live-messages',onLiveMessages);
  overlay.onMessage('geometry',g=>setView({x:g&&g.x,y:g&&g.y,width:g&&g.width,height:g&&g.height}));
  overlay.onMessage('position',p=>setView({x:p&&p.x,y:p&&p.y}));
  overlay.onMessage('position-done',()=>setView({editing:false}));
  if(config.qa)overlay.onMessage('qa-result',d=>trace('overlay-ui-result',d));
  postOverlay('hello',{});
 }

 function onOverlayReady(){
  if(closed)return;
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
  if(closed||chat.mode!=='live'||!liveStarted||!data||data.session!==liveRun)return;
  chat.state=String(data.state||'connecting');
  chat.error=String(data.message||(auth.phase==='ready'?auth.message:'')||'').slice(0,160);
  send();
 }

 function onLiveMessages(data){
  if(closed||chat.mode!=='live'||!liveStarted||!data||data.session!==liveRun||!Array.isArray(data.messages))return;
  messages=data.messages.slice(-150).map(safeMessage);
  chat.count=messages.length;
  send();
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
  pendingAuth=null;
 }

 // Turns chat off. Unless told otherwise it also tells the broker this window no longer needs the login,
 // which releases the in-memory grant but never revokes or clears a saved one.
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
  if(!options||options.releaseAuth!==false)app.postMessage('auth-disconnect',{});
  messages=[];
  chat.mode='off';
  chat.state='off';
  chat.error='';
  view.editing=false;
  hideOverlay();
  send();
  trace('chat-off');
 }

 function resumeReplay(){
  if(!replay||closed||!sourceActive)return;
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
  if(source.kind!=='twitch-vod'||!chatPreferred||closed||!sourceActive)return;
  const t=twitchTime();
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
  if(closed||chat.mode!=='replay'||!replay)return;
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
  if(closed||!sourceActive)return false;
  const preserve=!!(options&&options.preserve&&chat.mode==='replay');
  const selectionGeneration=chatGeneration;
  if(!path)path=await host.utils.chooseFile('Import chat archive',{allowedFileTypes:['json','jsonl','ndjson']});
  if(!path||closed||selectionGeneration!==chatGeneration)return false;
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
   if(closed||chatGeneration!==myGeneration)return false;
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
   if(closed||chatGeneration!==myGeneration)return false;
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
  if(closed||!sourceActive||source.kind!=='twitch-vod'||(auto&&!chatPreferred))return false;
  const at=Number.isFinite(Number(options&&options.at))?Math.max(0,Number(options.at)):twitchTime();
  if(twitchFetchBusy){
   if(Math.abs(at-twitchFetchAt)>25)twitchQueuedAt=at;
   return false;
  }
  if(!auto){
   setChatPreferred(true);
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
   if(closed||!sourceActive||generation!==chatGeneration)return false;
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
    twitchNextAttempt=w.end<=at+15?Date.now()+2500:0;
    return true;
   }
   return false;
  }catch(error){
   if(!closed&&sourceActive&&generation===chatGeneration){
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
   if(pending!==null&&!closed&&sourceActive&&chatPreferred&&(chat.mode==='replay'||chat.state==='fetching')){
    // With no chat on screen, a failed first fetch has no window to cover the queued position.
    const outside=seekWasQueued||!twitchWindow||pending<twitchWindow.start-2||pending>twitchWindow.end-10;
    if(outside)fetchTwitchWindow({auto:true,at:pending});
   }
  }
 }

 async function fetchReplay(options){
  const auto=!!(options&&options.auto);
  if(closed||!sourceActive)return;
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
   if(closed||chatGeneration!==myGeneration)return;
   if(!result.ok)throw Error(result.error&&result.error.message||'Replay is unavailable for this video.');
   if(!downloadOwned)throw Error('The downloaded replay location is invalid.');
   await importArchive(result.path);
  }catch(error){
   if(closed||chatGeneration!==myGeneration)return;
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
  if(closed||!sourceActive||refreshing||player.snapshot().busy)return;
  refreshing=true;
  try{
   const result=await services.resolve(source,player.snapshot().quality);
   if(closed||!sourceActive)return;
   if(!result.ok)throw Error('Unavailable');
   player.data.formats=result.formats;
   loadError='';
   send();
  }catch(_){
   if(!closed&&sourceActive){
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
  if(closed||!sourceActive||restoration!==expected)return;
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
  cancelAuthBinding();
  chatOff();
  if(services.cancelHelpers)services.cancelHelpers();
  player.deactivate();
  timers.clearAll();
  staged=null;
  loadError='Streams controls are inactive for this file. Open a new stream from the Plugins menu.';
  send();
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
    deactivateForForeignFile();
    finish();
    return;
   }
   if(!sourceActive){
    finish();
    return;
   }
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
    result=await services.resolve(source,'auto720');
    context=initialContext();
   }
   if(closed||mine!==generation){
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
  if(closed||!sourceActive)return;
  let decoded=String(url||'');
  try{
   decoded=decodeURIComponent(decoded);
  }catch(_){}
  const parsed=Sources.parse(decoded);
  if(source.kind!=='local-test'&&(!parsed||parsed.url!==source.url))return;
  const marker=/#streams-generation=(\d+)$/.exec(decoded);
  const loadedGeneration=marker?Number(marker[1]):0;
  if(loadedGeneration!==activeGeneration)return;
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

 function onSeek(){
  tick(true);
  maybeRefreshTwitch(true);
 }

 function onPauseChanged(){
  tick(true);
  send();
 }

 function onFullscreenChanged(){
  send();
  trace('fullscreen',{fullscreen:core.window.fullscreen});
 }

 function onWindowWillClose(){
  if(closed)return;
  cancelAuthBinding();
  chatOff();
  if(services.cancelHelpers)services.cancelHelpers();
  if(replayPath&&services.deleteDataPath)services.deleteDataPath(replayPath);
  replay=null;
  replayPath='';
  app.postMessage('player-closed',{});
  closed=true;
  generation++;
  player.close();
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
   if(closed||!sourceActive||typeof wire!=='string'||wire.length>8192)return;
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
     if(!closed&&sourceActive&&chat.mode==='live'&&chatGeneration===myGen)requestAuth('');
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
 on('mpv.end-file',()=>{
  player.ended();
  trace('end-file');
 });
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
  if(closed||!sourceActive||authBound)return;
  for(const name of Object.keys(authCallbacks))app.onMessage(name,authCallbacks[name]);
  authBound=true;
  const pending=pendingAuth;
  pendingAuth=null;
  if(pending&&pending.generation===chatGeneration&&chat.mode==='live')app.postMessage('auth-connect',pending.data);
  else if(source.kind==='twitch-live'&&chat.mode==='off')app.postMessage('auth-probe',{});
 }

 menu.addItem(menu.item('Show Streams',showSidebar));
 menu.addItem(menu.item('Import Chat Archive…',()=>importArchive()));
 menu.addItem(menu.item('Turn Chat Off',onChatOffRequest));
 menu.addItem(menu.item('Chat in Sidebar',()=>setView({presentation:'sidebar'})));
 menu.addItem(menu.item('Chat over Video',()=>setView({presentation:'overlay'})));
 if(windowLoaded)showSidebar();

 return{
  snapshot,showSidebar,hideSidebar,chatOff,setView,importArchive,resumeReplay,tick,
  changeQuality:q=>player.change(q),
  qaCommand:(name,data)=>{
   if(config.qa&&sidebarReady)postSidebar('qa-action',{name,data});
  },
  overlayCommand:(name,data)=>{
   if(config.qa&&overlayReady)postOverlay('qa-action',{name,data});
  },
  trace,
  _authCallbacks:authCallbacks
 };
}

module.exports={start,viewSettings,safeMessage};
