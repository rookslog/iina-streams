"use strict";
const Sources=require('./source.js');
const {Playback}=require('./playback.js');
const {envelope}=require('./bridge.js');
const DEFAULT_VIEW={presentation:'sidebar',fontSize:14,opacity:0.64,lines:6,x:1,y:0,density:'comfortable',editing:false};
function clamp(n,low,high,fallback){n=Number(n);return Number.isFinite(n)?Math.max(low,Math.min(high,n)):fallback;}
function viewSettings(value,variant){const v=value||{};return{presentation:['sidebar','overlay'].includes(v.presentation)?v.presentation:(variant==='focus'?'overlay':'sidebar'),fontSize:clamp(v.fontSize,12,24,14),opacity:clamp(v.opacity,0.2,0.9,0.64),lines:Math.round(clamp(v.lines,2,12,6)),x:clamp(v.x,0,1,1),y:clamp(v.y,0,1,0),density:v.density==='compact'?'compact':'comfortable',editing:false};}
function start(host,config,services){
 const identity=Sources.fromLabel(host.global.getLabel()||'');
 const qaIdentity=config.qa&&config.qa.source?{source:config.qa.source,variant:config.qa.variant||config.variant}:null;
 if(!identity&&!qaIdentity)return null;
 const source=(identity||qaIdentity).source,variant=(identity||qaIdentity).variant;
 const {mpv,core,sidebar,overlay,event,menu,global:app}=host;
 const persisted=services.readSettings?services.readSettings():{};
 let view=viewSettings(persisted.view,variant),auth={phase:'off',message:''};
 let closed=false,windowLoaded=!!core.window.loaded,sidebarLoaded=false,sidebarReady=false,sidebarVisible=false,controlsDesired=true,overlayLoaded=false,overlayReady=false;
 let generation=0,activeGeneration=0,staged=null,loadError='',initialResolved=false,chatGeneration=0;
 let replay=null,replayPath='',replayMetadata=null,messages=[],timeObserver=null,updateTimer=null,lastTick=0,lastSignature='';
 let chat={mode:'off',state:'off',error:'',count:0,sourceName:'',offset:0,available:false};
 const listeners=[];
 const postSidebar=(name,data)=>sidebar.postMessage(name,envelope(data));
 const postOverlay=(name,data)=>overlay.postMessage(name,envelope(data));
 function on(name,fn){const id=event.on(name,fn);listeners.push([name,id]);}
 const player=new Playback({source,resolve:q=>services.resolve(source,q),readPlayer:()=>({position:mpv.getNumber('time-pos'),paused:mpv.getFlag('pause'),speed:mpv.getNumber('speed')}),replace:(result,context)=>{staged={result,context};mpv.command('loadfile',[source.url+'#streams-generation='+context.generation,'replace']);},onState:()=>send(),setTimer:(fn,ms)=>setTimeout(fn,ms),clearTimer:t=>clearTimeout(t)});
 function snapshot(){const p=player.snapshot();return Object.assign(p,{variant,source:{kind:source.kind,provider:source.provider,id:source.id},title:p.title||source.id||'Streams',error:loadError||p.error,chat:Object.assign({},chat),auth:Object.assign({},auth),view:Object.assign({},view),messages:messages.slice(-150),position:Number(mpv.getNumber('time-pos'))||0,paused:!!mpv.getFlag('pause'),qa:!!config.qa});}
 function trace(name,extra){if(services.trace)services.trace(name,Object.assign({variant,sourceId:source.id},extra||{}));}
 function send(){if(closed)return;const s=snapshot();if(sidebarReady)postSidebar('state',s);if(overlayReady)postOverlay('state',{view:s.view,messages:s.messages,chat:s.chat,qa:s.qa});}
 function connectMessages(){
  sidebar.onMessage('ready',()=>{if(closed)return;sidebarReady=true;send();trace('sidebar-ready');});
  sidebar.onMessage('change-quality',q=>player.change(String(q)));
  sidebar.onMessage('refresh',()=>refresh());
  sidebar.onMessage('hide',hideSidebar);
  sidebar.onMessage('open',()=>app.postMessage('open',{}));
  sidebar.onMessage('import',()=>importArchive());
  sidebar.onMessage('replay-resume',resumeReplay);
  sidebar.onMessage('chat-off',chatOff);
  sidebar.onMessage('fetch-replay',fetchReplay);
  sidebar.onMessage('view',setView);
  sidebar.onMessage('offset',value=>{chat.offset=clamp(value,-2592000,2592000,0);lastSignature='';tick(true);send();});
  sidebar.onMessage('seek-chat',value=>{const t=Number(value)-chat.offset;if(chat.mode==='replay'&&Number.isFinite(t)&&t>=0)mpv.command('seek',[String(t),'absolute+exact']);});
  sidebar.onMessage('first-message',()=>{if(replayMetadata){const t=Math.max(0,replayMetadata.timeline.availableStart-chat.offset);mpv.command('seek',[String(t),'absolute+exact']);}});
  sidebar.onMessage('connect',data=>{
   if(source.kind!=='twitch-live'){chat.error='Live chat is available for Twitch channels.';send();return;}
   stopReplay();messages=[];chat={mode:'live',state:'authorizing',error:'',count:0,sourceName:source.id,offset:0,available:false};
   app.postMessage('auth-connect',{clientID:String(data&&data.clientID||'')});send();
  });
  sidebar.onMessage('authorize-open',()=>{if(auth.phase==='waiting'&&/^https:\/\/(?:www\.)?twitch\.tv\/activate(?:\?|$)/.test(auth.verificationURI||''))host.utils.open(auth.verificationURI);});
  sidebar.onMessage('forget-auth',()=>{chatOff();app.postMessage('auth-forget',{});});
  sidebar.onMessage('live-state',data=>{if(chat.mode!=='live'||closed)return;chat.state=String(data&&data.state||'connecting');chat.error=String(data&&data.message||'').slice(0,160);send();});
  sidebar.onMessage('live-messages',data=>{if(chat.mode!=='live'||closed||!Array.isArray(data))return;messages=data.slice(-150).map(safeMessage);chat.count=messages.length;send();});
  if(config.qa)sidebar.onMessage('qa-result',data=>trace('ui-result',data));
 }
 function safeMessage(m){return{id:String(m.id||'').slice(0,160),time:Number(m.time||m.t)||0,author:String(m.author||'').slice(0,80),text:String(m.text||'').slice(0,2000),color:/^#[0-9a-f]{6}$/i.test(m.color||'')?m.color:'',kind:String(m.kind||'message')};}
 function showSidebar(){
  controlsDesired=true;
  if(closed||!windowLoaded)return;
  if(!sidebarLoaded){sidebar.loadFile('ui/sidebar.html');connectMessages();sidebarLoaded=true;sidebarReady=false;}
  sidebarVisible=true;sidebar.show();send();
 }
 function hideSidebar(){controlsDesired=false;sidebarVisible=false;sidebar.hide();if(view.presentation==='sidebar')chatOff();}
 function ensureOverlay(){
  if(closed||!windowLoaded)return;
  if(!overlayLoaded){overlayLoaded=true;overlay.loadFile('ui/overlay.html');return;}
  overlay.setClickable(!!view.editing);overlay.show();send();
 }
 on('iina.plugin-overlay-loaded',()=>{
  if(closed||!overlayLoaded)return;
  overlay.onMessage('overlay-ready',()=>{if(closed)return;overlayReady=true;if(view.presentation==='overlay'&&(chat.mode!=='off'||view.editing))ensureOverlay();send();trace('overlay-ready');});
  overlay.onMessage('position',p=>setView({x:p&&p.x,y:p&&p.y}));overlay.onMessage('position-done',()=>setView({editing:false}));if(config.qa)overlay.onMessage('qa-result',d=>trace('overlay-ui-result',d));
  postOverlay('hello',{});
 });
 function setView(change){
  if(!change||typeof change!=='object')return;
  const editing=change.editing===undefined?view.editing:!!change.editing;
  view=viewSettings(change.reset?{}:Object.assign({},view,change),variant);view.editing=editing;
  if(services.saveSettings)services.saveSettings({view:Object.assign({},view,{editing:false})});
  if(view.presentation==='overlay'&&(chat.mode!=='off'||view.editing))ensureOverlay();else{if(overlayLoaded){overlay.setClickable(false);overlay.hide();}view.editing=false;}
  send();
 }
 function stopReplay(){if(timeObserver!==null){event.off('mpv.time-pos.changed',timeObserver);timeObserver=null;}if(updateTimer!==null){clearTimeout(updateTimer);updateTimer=null;}if(replay)replay.clear();lastSignature='';}
 function chatOff(){
  chatGeneration++;stopReplay();if(sidebarReady)postSidebar('live-stop',{});app.postMessage('auth-disconnect',{});messages=[];chat.mode='off';chat.state='off';chat.error='';view.editing=false;if(overlayLoaded){overlay.setClickable(false);overlay.hide();}send();trace('chat-off');
 }
 function resumeReplay(){if(!replay||closed)return;chatOff();chat.mode='replay';chat.state='ready';timeObserver=event.on('mpv.time-pos.changed',()=>tick(false));if(view.presentation==='overlay')ensureOverlay();tick(true);send();}
 function tick(force){
  if(closed||chat.mode!=='replay'||!replay)return;
  const elapsed=Date.now()-lastTick;
  if(!force&&elapsed<200){if(updateTimer===null)updateTimer=setTimeout(()=>{updateTimer=null;tick(true);},200-elapsed);return;}
  lastTick=Date.now();
  try{
   const t=Number(mpv.getNumber('time-pos'))||0;const result=replay.windowAt(t,{offsetSeconds:chat.offset,limit:150,windowSeconds:120});
   const signature=result.map(m=>m.id+':'+m.time).join('|');if(signature!==lastSignature){lastSignature=signature;messages=result.map(safeMessage);send();}
  }catch(_){chat.error='The chat archive could not be read. Import it again.';chat.state='error';stopReplay();messages=[];send();}
 }
 async function importArchive(path){
  if(closed)return false;
  const selectionGeneration=chatGeneration;
  if(!path)path=await host.utils.chooseFile('Import chat archive',{allowedFileTypes:['json','jsonl','ndjson']});
  if(!path||closed||selectionGeneration!==chatGeneration)return false;
  chatOff();const myGeneration=chatGeneration;chat.state='importing';chat.error='';send();
  try{
   const output=services.dataPath('replay-'+Date.now()+'-'+Math.random().toString(36).slice(2,9));
   const result=await services.runHelper('replay',['import','--input',path,'--output',output]);
   if(closed||chatGeneration!==myGeneration)return false;
   if(!result||!result.ok)throw Error(result&&result.error&&result.error.message||'The archive could not be imported.');
   const index=JSON.parse(services.readFile(result.indexPath));
   if(index.sourceId&&source.kind!=='local-test'&&String(index.sourceId)!==String(source.id)){
    if(!host.utils.ask('This chat archive belongs to '+index.sourceId+', while this video is '+source.id+'. Use this archive and align it manually?')){chat.state='off';send();return false;}
   }
   const {Replay}=require('./replay.js');replayPath=result.indexPath.slice(0,result.indexPath.lastIndexOf('/'));replay=new Replay(index,file=>JSON.parse(services.readFile(replayPath+'/'+file)));replayMetadata=index;
   chat.count=index.count;chat.sourceName=index.title||'Imported chat';chat.available=true;chat.offset=0;resumeReplay();trace('replay-imported',{count:index.count,format:index.provenance&&index.provenance.format});return true;
  }catch(error){if(closed||chatGeneration!==myGeneration)return false;chat.state='error';chat.error=String(error&&error.message||'Could not import chat.').replace(/https?:\/\/\S+/g,'[address omitted]').slice(0,180);send();return false;}
 }
 async function fetchReplay(){
  if(source.kind!=='youtube'){chat.error='Import a TwitchDownloader JSON archive for this recording.';send();return;}
  chatOff();const myGeneration=chatGeneration;chat.state='fetching';send();
  try{
   const result=await services.runHelper('acquire',['--url',source.url,'--output',services.dataPath('download-'+Date.now())]);
   if(closed||chatGeneration!==myGeneration)return;
   if(!result.ok)throw Error(result.error&&result.error.message||'Replay is unavailable for this video.');
   await importArchive(result.path);
  }catch(error){if(closed||chatGeneration!==myGeneration)return;chat.state='unavailable';chat.error=String(error&&error.message||'Replay is unavailable.').slice(0,180);send();}
 }
 async function refresh(){if(closed||player.snapshot().busy)return;try{const result=await services.resolve(source,player.snapshot().quality);if(closed)return;if(!result.ok)throw Error('Unavailable');player.data.formats=result.formats;loadError='';send();}catch(_){loadError='Qualities unavailable. Try again.';send();}}
 function applyResolution(result,context){
  if(result.headers)mpv.set('file-local-options/http-header-fields',Object.keys(result.headers).map(k=>k+': '+result.headers[k]));
  if(result.audioURL)mpv.command('audio-add',[result.audioURL,'auto','Audio']);
  mpv.set('stream-open-filename',result.mediaURL);
  mpv.set('file-local-options/force-media-title',String(result.title||source.id)+' — '+source.provider);
  if(context.position>0&&!result.live)mpv.set('file-local-options/start',context.position);
  mpv.set('pause',!!context.paused);mpv.set('speed',context.speed||1);
 }
 mpv.addHook('on_load',20,async function(next){
  const mine=++generation;let completed=false;const finish=()=>{if(!completed){completed=true;if(typeof next==='function')next();}};
  try{
   if(closed){finish();return;}
   const current=mpv.getString('path')||mpv.getString('stream-open-filename')||'';
   const parsed=Sources.parse(current);
   if(source.kind!=='local-test'&&(!parsed||parsed.url!==source.url)){chatOff();loadError='Streams controls are inactive for this file.';finish();return;}
   let result,context;
   if(staged){result=staged.result;context=staged.context;staged=null;}
   else if(source.kind==='local-test'){result={ok:true,title:config.qa.title||'Native replay test',live:false,duration:600,quality:'local',formats:[],mediaURL:source.url};context={generation:0,position:source.startSeconds||0,paused:false,speed:1};}
   else{result=await services.resolve(source,'auto720');context={generation:0,position:source.startSeconds||0,paused:false,speed:1};}
   if(closed||mine!==generation){finish();return;}
   if(!result||!result.ok)throw Error(result&&result.error&&result.error.message||'This source could not be opened.');
   activeGeneration=context.generation;applyResolution(result,context);
   if(!initialResolved){player.adopt(result);initialResolved=true;}
   loadError='';trace('resolved',{quality:result.quality,live:result.live});
  }catch(error){if(!closed){loadError=String(error&&error.message||'Unable to open source.').replace(/https?:\/\/\S+/g,'[address omitted]').slice(0,180);send();trace('load-error',{error:loadError});}}
  finally{finish();}
 });
 on('iina.window-loaded',()=>{windowLoaded=true;if(controlsDesired)showSidebar();trace('window-loaded');});
 on('iina.file-loaded',()=>{if(closed)return;player.loaded(activeGeneration);if(controlsDesired)showSidebar();tick(true);trace('file-loaded',{generation:activeGeneration,quality:player.snapshot().quality,width:mpv.getNumber('video-params/w'),height:mpv.getNumber('video-params/h')});});
 on('mpv.end-file',()=>{player.ended();trace('end-file');});
 on('mpv.seek',()=>tick(true));on('mpv.pause.changed',()=>{tick(true);send();});
 on('iina.window-fs.changed',()=>{send();trace('fullscreen',{fullscreen:core.window.fullscreen});});
 on('iina.window-will-close',()=>{if(closed)return;chatOff();app.postMessage('player-closed',{});closed=true;generation++;player.close();for(const [name,id] of listeners)try{event.off(name,id);}catch(_){};trace('window-closed');});
 app.onMessage('auth-state',data=>{if(chat.mode!=='live'||closed)return;auth=data;chat.state=data.phase;chat.error=data.message||'';send();});
 app.onMessage('auth-ready',data=>{if(chat.mode!=='live'||closed||!sidebarReady)return;postSidebar('live-config',{token:data.token,login:data.login,channel:source.id});if(view.presentation==='overlay')ensureOverlay();});
 app.onMessage('auth-stop',()=>{if(sidebarReady)postSidebar('live-stop',{});if(chat.mode==='live'){chat.state='disconnected';messages=[];send();}});
 menu.addItem(menu.item('Show Streams '+(variant==='focus'?'Focus':'Unified'),showSidebar));
 menu.addItem(menu.item('Import Chat Archive…',()=>importArchive()));
 menu.addItem(menu.item('Turn Chat Off',chatOff));
 menu.addItem(menu.item('Chat in Sidebar',()=>setView({presentation:'sidebar'})));
 menu.addItem(menu.item('Chat over Video',()=>setView({presentation:'overlay'})));
 if(windowLoaded)showSidebar();
 return{snapshot,showSidebar,hideSidebar,chatOff,setView,importArchive,resumeReplay,tick,changeQuality:q=>player.change(q),qaCommand:(name,data)=>{if(config.qa&&sidebarReady)postSidebar('qa-action',{name,data});},overlayCommand:(name,data)=>{if(config.qa&&overlayReady)postOverlay('qa-action',{name,data});},trace};
}
module.exports={start,viewSettings};
