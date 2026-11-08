"use strict";
// Isolated QA-only package. Never bundled in the selectable candidates.
function run(host,controller,config,services){
 let lastID='',closed=false,timer=null;const {file,mpv,core,event}=host;
 function state(){return{controller:controller.snapshot(),native:{position:mpv.getNumber('time-pos'),duration:mpv.getNumber('duration'),paused:mpv.getFlag('pause'),speed:mpv.getNumber('speed'),width:mpv.getNumber('video-params/w'),height:mpv.getNumber('video-params/h'),audioCodec:mpv.getString('audio-codec-name'),audioRate:mpv.getNumber('audio-params/samplerate'),playlistCount:mpv.getNumber('playlist-count'),idle:mpv.getFlag('idle-active'),fullscreen:core.window.fullscreen,frame:core.window.frame}};}
 function report(id,result){if(!closed)file.write('@data/qa-response.json',JSON.stringify({id,time:new Date().toISOString(),result:result===undefined?true:result,state:state()}));}
 async function execute(request){
  const data=request.data||{};let result=true;
  switch(request.command){
   case 'snapshot':break;
   case 'ui':controller.qaCommand(data.name,data.data);break;
   case 'overlay':controller.overlayCommand(data.name,data.data);break;
   case 'show':controller.showSidebar();break;
   case 'hide':controller.hideSidebar();break;
   case 'import':result=await controller.importArchive(String(data.path));break;
   case 'off':controller.chatOff();break;
   case 'view':controller.setView(data);break;
   case 'seek':mpv.command('seek',[String(Number(data.seconds)||0),'absolute+exact']);break;
   case 'pause':mpv.set('pause',!!data.value);break;
   case 'speed':mpv.set('speed',Math.max(.25,Math.min(3,Number(data.value)||1)));break;
   case 'fullscreen':core.window.fullscreen=!!data.value;break;
   case 'frame':core.window.frame={x:Number(data.x),y:Number(data.y),width:Math.max(600,Number(data.width)),height:Math.max(400,Number(data.height))};break;
   case 'quality':result=await controller.changeQuality(String(data.value));break;
   case 'stop':core.stop();break;
   default:result={error:'Unknown QA command'};
  }
  report(request.id,result);
 }
 async function poll(){
  if(closed)return;
  try{if(file.exists('@data/qa-request.json')){const raw=file.read('@data/qa-request.json');if(raw.length<8192){const request=JSON.parse(raw);if(typeof request.id==='string'&&request.id!==lastID){lastID=request.id;await execute(request);}}}}catch(_){report(lastID,{error:'QA command failed'});}
  if(!closed)timer=setTimeout(poll,400);
 }
 event.on('iina.window-will-close',()=>{closed=true;if(timer!==null)clearTimeout(timer);});
 services.trace('qa-started',{variant:config.variant,keychainRead:typeof host.utils.keychainRead,keyChainRead:typeof host.utils.keyChainRead});poll();
}
module.exports={run};
