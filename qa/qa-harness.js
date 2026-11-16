"use strict";
// Isolated QA-only package. Never bundled in the selectable candidates.
function run(host,controller,config,services){
 let lastID='',closed=false,timer=null,armedInput=false;const {file,mpv,core,event}=host;
 controller.qaPongListener=data=>services.trace('qa-pong',{route:typeof data==='string'?data:data&&data.route,type:typeof data});controller.qaInputListeners=[];const messageSetup=setTimeout(()=>{clearTimeout(messageSetup);if(closed)return;host.global.onMessage('qa-pong',controller.qaPongListener);if(host.input){for(const name of ['onMouseDown','onMouseUp']){const fn=data=>{if(armedInput&&!closed)services.trace('native-input',{kind:name,x:data.x,y:data.y,clickCount:data.clickCount});return false;};controller.qaInputListeners.push(fn);host.input[name](host.input.MOUSE,fn,host.input.PRIORITY_HIGH);}}},0);
 function state(){return{controller:controller.snapshot(),native:{position:mpv.getNumber('time-pos'),duration:mpv.getNumber('duration'),paused:mpv.getFlag('pause'),speed:mpv.getNumber('speed'),width:mpv.getNumber('video-params/w'),height:mpv.getNumber('video-params/h'),videoCodec:mpv.getString('video-codec'),videoFps:mpv.getNumber('container-fps'),droppedFrames:mpv.getNumber('frame-drop-count'),audioCodec:mpv.getString('audio-codec-name'),audioRate:mpv.getNumber('audio-params/samplerate'),playlistCount:mpv.getNumber('playlist-count'),idle:mpv.getFlag('idle-active'),seeking:mpv.getFlag('seeking'),pausedForCache:mpv.getFlag('paused-for-cache'),cacheBuffering:mpv.getNumber('cache-buffering-state'),fullscreen:core.window.fullscreen,frame:core.window.frame,hwdec:mpv.getString('hwdec-current'),activeHelpers:services.activeHelpers?services.activeHelpers():[]}};}
 function report(id,result){if(!closed)file.write('@data/qa-response.json',JSON.stringify({id,time:new Date().toISOString(),result:result===undefined?true:result,state:state()}));}
 async function execute(request){
  const data=request.data||{};let result=true;
  switch(request.command){
   case 'snapshot':break;
   case 'keychain-probe':{const service='native-qa-probe',name='noncredential',sample='streams-native-probe-'+Date.now();const wrote=host.utils.keychainWrite(service,name,sample)===true;const matched=wrote&&host.utils.keychainRead(service,name)===sample;const cleared=host.utils.keychainWrite(service,name,'')===true&&host.utils.keychainRead(service,name)==='';result={wrote,matched,cleared};break;}
   case 'ping':host.global.postMessage('qa-ping',{});break;
   case 'arm-input':armedInput=!!data.enabled;break;
   case 'open':host.global.postMessage('qa-open',{url:String(data.url||'')});break;
   case 'ui':controller.qaCommand(data.name,data.data);break;
   case 'overlay':controller.overlayCommand(data.name,data.data);break;
   case 'overlay-simple-probe':host.overlay.simpleMode();host.overlay.setStyle('body { background:transparent; color:white; font:40px -apple-system; } #content { position:absolute; left:80px; top:100px; background:#d80000; padding:30px; }');host.overlay.setContent('<div>Native overlay diagnostic</div>');host.overlay.setOpacity(1);host.overlay.show();break;
   case 'show':controller.showSidebar();break;
   case 'hide':controller.hideSidebar();break;
   case 'import':result=await controller.importArchive(String(data.path));break;
   case 'import-start':controller.importArchive(String(data.path)).then(ok=>services.trace('qa-import-finished',{ok}));break;
   case 'off':controller.chatOff();break;
   case 'view':controller.setView(data);break;
   case 'seek':mpv.command('seek',[String(Number(data.seconds)||0),'absolute+exact']);break;
   case 'pause':mpv.set('pause',!!data.value);break;
   case 'speed':mpv.set('speed',Math.max(.25,Math.min(3,Number(data.value)||1)));break;
   case 'fullscreen':Reflect.set(core.window,'fullscreen',!!data.value);break;
   case 'frame':Reflect.set(core.window,'frame',{x:Number(data.x),y:Number(data.y),width:Math.max(600,Number(data.width)),height:Math.max(400,Number(data.height))});break;
   case 'quality':result=await controller.changeQuality(String(data.value));break;
   case 'stop':core.stop();break;
   default:result={error:'Unknown QA command'};
  }
  report(request.id,result);
 }
 async function poll(){
  if(timer!==null){clearTimeout(timer);timer=null;}
  if(closed)return;
  try{if(file.exists('@data/qa-request.json')){const raw=file.read('@data/qa-request.json');if(raw.length<8192){const request=JSON.parse(raw);if((!request.targetSource||request.targetSource===controller.snapshot().source.id)&&typeof request.id==='string'&&request.id!==lastID){lastID=request.id;await execute(request);}}}}catch(_){report(lastID,{error:'QA command failed'});}
  if(!closed)timer=setTimeout(poll,400);
 }
 event.on('iina.window-will-close',()=>{closed=true;clearTimeout(messageSetup);if(timer!==null)clearTimeout(timer);});
 services.trace('qa-started',{variant:config.variant,keychainRead:typeof host.utils.keychainRead,keyChainRead:typeof host.utils.keyChainRead});poll();
}
module.exports={run};
