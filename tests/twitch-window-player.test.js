'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Sources=require('../src/source.js');
const {start}=require('../src/player.js');
const pause=()=>new Promise(done=>setTimeout(done,12));
function harness(settings={}) {
 const src=Sources.parse('https://www.twitch.tv/videos/2930971003');
 const hooks={},events={},side={},calls=[],deleted=[],cancelled=[],saved=[];
 const pending={acquire:[],replay:[]};
 const files=new Map();
 let position=0,asked=0;
 const host={
  global:{getLabel:()=>Sources.label(src,'unified'),onMessage(){},postMessage(){}},
  mpv:{addHook:(n,p,f)=>hooks[n]=f,getString:n=>n==='path'?src.url:'',getNumber:n=>n==='time-pos'?position:n==='speed'?1:0,getFlag:()=>false,set(){},command(){}},
  core:{window:{loaded:true,frame:{width:640,height:360}}},
  sidebar:{loadFile(){},onMessage:(n,fn)=>side[n]=fn,postMessage(){},show(){},hide(){}},
  overlay:{loadFile(){},onMessage(){},postMessage(){},show(){},hide(){},setClickable(){},setOpacity(){}},
  event:{on:(n,fn)=>{events[n]=fn;return n;},off:n=>delete events[n]},
  menu:{addItem(){},item:(name,fn)=>({name,fn})},
  utils:{chooseFile:async()=>false,ask:()=>{asked++;return false;}},
  file:{write(){},exists:()=>false}
 };
 const services={
  readSettings:()=>settings,saveSettings:x=>saved.push(x),dataPath:x=>'/data/'+x,
  readFile:x=>files.get(x),cancelHelpers:x=>cancelled.push(x),deleteDataPath:x=>deleted.push(x),
  resolve:async()=>({ok:true,title:'9-hour Twitch recording',live:false,duration:32980,quality:'720p60',formats:[],mediaURL:'https://media.example/vod.m3u8'}),
  runHelper:(name,args)=>{calls.push({name,args});return new Promise(resolve=>pending[name].push({resolve,args}));}
 };
 const player=start(host,{variant:'unified'},services);
 return{src,hooks,events,side,calls,deleted,cancelled,saved,pending,files,player,askCount:()=>asked,
  position:()=>position,
  async open(){await hooks.on_load(()=>{});events['iina.file-loaded'](src.url);},
  seek:t=>{position=t;if(events['mpv.seek'])events['mpv.seek']();},
  advance:t=>{position=t;if(events['mpv.time-pos.changed'])events['mpv.time-pos.changed']();},
  close(){events['iina.window-will-close']();}
 };
}
function resolveAcquisition(f,o={}){
 const call=f.pending.acquire.shift();
 assert.ok(call,'Expected pending acquisition');
 const path=call.args[call.args.indexOf('--output')+1];
 const requested=Number(call.args[call.args.indexOf('--at')+1]);
 const window={requested,start:o.start??Math.max(0,requested-8),end:o.end??requested+65,hasMore:o.hasMore!==false,pages:3,count:1,bounded:false};
 call.resolve({ok:true,path:path+'/replay.jsonl',window});
 return{path,window};
}
async function resolveImport(f,o={}){
 await pause();
 const call=f.pending.replay.shift();assert.ok(call,'Expected pending import');
 const dest=call.args[call.args.indexOf('--output')+1];
 const time=o.time??f.position(),sourceId=o.sourceId??f.src.id;
 const index={version:1,provider:'twitch',sourceId,count:1,title:'Twitch window',
   timeline:{unit:'seconds',availableStart:time,availableEnd:time},chunks:[{file:'chunk-000000.json',start:time,end:time,count:1}]};
 f.files.set(dest+'/index.json',JSON.stringify(index));
 f.files.set(dest+'/chunk-000000.json',JSON.stringify([{id:'m'+time,time,author:'Viewer',text:o.message||'Chat message',color:'#AABBCC',badges:[],kind:'message'}]));
 call.resolve({ok:true,indexPath:dest+'/index.json'});
 await pause();
 return dest;
}
async function finish(f,o={}) {const acquired=resolveAcquisition(f,o);const imported=await resolveImport(f,o);return{...acquired,imported};}
test('opening the 9-hour VOD fetches a playback window without a full chat download',async()=>{
 const f=harness();await f.open();
 assert.equal(f.calls.length,1);
 assert.deepEqual(f.calls[0].args,['--url',f.src.url,'--output',f.calls[0].args[3],'--at','0']);
 f.player.hideSidebar();
 assert.equal(f.player.snapshot().chat.state,'fetching');
 const x=await finish(f,{time:0,end:70});
 assert.equal(f.player.snapshot().chat.mode,'replay');
 assert.equal(f.player.snapshot().messages[0].text,'Chat message');
 assert.ok(f.deleted.includes(x.path));
 f.events['iina.file-loaded'](f.src.url);
 assert.equal(f.calls.filter(c=>c.name==='acquire').length,1,'quality reload must not refetch');
 f.close();
});
test('playing near the end prefetches the next window and preserves chat during refresh',async()=>{
 const f=harness();await f.open();const a=await finish(f,{end:70,time:0});
 f.advance(57);await new Promise(done=>setTimeout(done,250));
 assert.equal(f.pending.acquire.length,1);
 assert.equal(Number(f.pending.acquire[0].args.at(-1)),57);
 assert.equal(f.player.snapshot().chat.mode,'replay');
 assert.equal(f.player.snapshot().messages[0].text,'Chat message');
 await finish(f,{start:50,end:135,time:56,message:'New messages'});
 assert.equal(f.player.snapshot().chat.mode,'replay');
 assert.equal(f.player.snapshot().messages[0].text,'New messages');
 assert.ok(f.deleted.includes(a.imported),'old normalized window was cleaned');
 f.close();
});
test('seeking to five hours loads the new time directly',async()=>{
 const f=harness();await f.open();await finish(f,{end:75,time:0});
 f.seek(20000);await pause();
 assert.equal(f.pending.acquire.length,1);
 assert.equal(Number(f.pending.acquire[0].args.at(-1)),20000);
 assert.ok(['playing','loading'].includes(f.player.snapshot().phase));
 await finish(f,{start:19992,end:20070,time:19999,message:'After seek'});
 assert.equal(f.player.snapshot().messages[0].text,'After seek');
 f.close();
});
test('seeking while the first window is loading skips stale import and queues the latest request',async()=>{
 const f=harness();await f.open();f.seek(20000);f.seek(32000);
 const old=resolveAcquisition(f,{start:0,end:65});await pause();
 assert.ok(f.deleted.includes(old.path));
 assert.equal(f.pending.replay.length,0);
 assert.equal(f.pending.acquire.length,1);
 assert.equal(Number(f.pending.acquire[0].args.at(-1)),32000);
 await finish(f,{start:31992,end:32070,time:31999,message:'Eight hours in'});
 assert.equal(f.player.snapshot().messages[0].text,'Eight hours in');
 f.close();
});
test('Chat Off cancels active download, fences late callbacks, and disables further fetching',async()=>{
 const f=harness();await f.open();
 const item=f.pending.acquire.shift(),path=item.args[item.args.indexOf('--output')+1];
 f.side['chat-off']();f.seek(500);
 item.resolve({ok:true,path:path+'/replay.jsonl',window:{requested:0,start:0,end:70,hasMore:true}});
 await pause();
 assert.equal(f.player.snapshot().chat.mode,'off');
 assert.ok(f.deleted.includes(path));
 assert.equal(f.pending.replay.length,0);
 assert.equal(f.pending.acquire.length,0);
 assert.ok(f.cancelled.some(x=>x.includes('acquire')));
 assert.equal(f.saved.at(-1).chatEnabled,false);
 f.close();
});
test('Chat Off during an import cleans the late normalized output',async()=>{
 const f=harness();await f.open();resolveAcquisition(f);await pause();
 const item=f.pending.replay.shift(),path=item.args[item.args.indexOf('--output')+1];
 f.side['chat-off']();item.resolve({ok:true,indexPath:path+'/index.json'});
 await pause();
 assert.ok(f.deleted.includes(path));
 assert.equal(f.player.snapshot().chat.mode,'off');
 f.close();
});
test('persisted Off prevents automatic fetching; manual retry still works and keeps video playing',async()=>{
 const f=harness({chatEnabled:false});await f.open();
 assert.equal(f.pending.acquire.length,0);
 f.side['fetch-replay']();assert.equal(f.pending.acquire.length,1);
 assert.equal(f.saved.at(-1).chatEnabled,true);
 f.pending.acquire.shift().resolve({ok:false,error:{message:'Chat restricted or unavailable'}});
 await pause();
 assert.equal(f.player.snapshot().chat.state,'unavailable');
 assert.match(f.player.snapshot().chat.error,/restricted/);
 assert.ok(['playing','loading'].includes(f.player.snapshot().phase));
 f.side['fetch-replay']();assert.equal(f.pending.acquire.length,1);
 f.pending.acquire.shift().resolve({ok:false,error:{message:'still unavailable'}});
 await pause();f.close();
});
test('refresh failures keep the current valid replay and never stop video',async()=>{
 const f=harness();await f.open();await finish(f,{end:70,time:0});
 f.advance(56);await new Promise(done=>setTimeout(done,250));
 f.pending.acquire.shift().resolve({ok:false,error:{message:'Twitch rate limited requests'}});
 await pause();
 assert.equal(f.player.snapshot().chat.mode,'replay');
 assert.ok(['playing','loading'].includes(f.player.snapshot().phase));
 assert.equal(f.player.snapshot().messages.length,1);
 assert.match(f.player.snapshot().chat.error,/rate limited/);
 f.close();
});
test('malformed helper metadata is rejected before importing and its owned data is removed',async()=>{
 const f=harness();await f.open();
 const item=f.pending.acquire.shift(),path=item.args[item.args.indexOf('--output')+1];
 item.resolve({ok:true,path:path+'/replay.jsonl',window:{requested:0,start:100,end:10,hasMore:true}});
 await pause();
 assert.equal(f.pending.replay.length,0);
 assert.ok(f.deleted.includes(path));
 assert.equal(f.player.snapshot().chat.state,'unavailable');
 f.close();
});
test('network-downloaded replay must match this VOD; no identity override dialog',async()=>{
 const f=harness();await f.open();resolveAcquisition(f);
 await resolveImport(f,{time:0,sourceId:'123456789'});
 assert.equal(f.player.snapshot().chat.mode,'off');
 assert.match(f.player.snapshot().chat.error,/does not belong/);
 assert.equal(f.askCount(),0);
 f.close();
});
test('manual imported archive is never silently replaced by network windows',async()=>{
 const f=harness({chatEnabled:false});await f.open();
 const promise=f.player.importArchive('/authorized/archive.json');
 await resolveImport(f,{time:0});assert.equal(await promise,true);
 f.seek(500);await pause();
 assert.equal(f.pending.acquire.length,0);
 f.close();
});
test('chat offset changes load a window at the shifted video time',async()=>{
 const f=harness();await f.open();await finish(f,{end:90,time:0});
 f.side.offset(20000);await pause();
 assert.equal(f.pending.acquire.length,1);
 assert.equal(Number(f.pending.acquire[0].args.at(-1)),20000);
 await finish(f,{start:19992,end:20080,time:20000});
 assert.equal(f.player.snapshot().chat.mode,'replay');
 f.close();
});
test('when Twitch chat has ended, normal playback does not refetch endlessly',async()=>{
 const f=harness();await f.open();await finish(f,{start:0,end:60,hasMore:false,time:0});
 f.advance(60);f.advance(600);await pause();
 assert.equal(f.pending.acquire.length,0);
 f.close();
});
