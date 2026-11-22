"use strict";
const test=require('node:test');const assert=require('node:assert/strict');
const source=require('../src/source.js');
const {start}=require('../src/player.js');
const {createIina}=require('./support/iina-shim.js');
const URL1='https://www.twitch.tv/videos/123456';
function host(label){
 const shim=createIina({label,mpv:{path:URL1,'stream-open-filename':URL1}});
 return{h:shim.iina,shim,setPath:p=>shim.mpv.set('path',p).set('stream-open-filename',p)};
}
async function finishLoad(r,url){r.shim.emit('iina.file-loaded',url);r.shim.emit('iina.window-size-adjusted');await new Promise(resolve=>setTimeout(resolve,650));}
const resolution={ok:true,title:'Recording',live:false,duration:100,quality:'360p30',formats:[{id:'360p30',label:'360p'}],mediaURL:'https://vod-secure.twitch.tv/transport'};
// #35 changed this: an unlabeled window now gets one on_load hook so a stream opened in IINA can be adopted
// (tests/a1-open-stream-player.test.js). Until a stream loads it still has no events, timers, network or controls.
test('unrelated IINA windows acquire only the adoption hook, and no network, timers or controls',async()=>{
 const r=host('');
 const c=start(r.h,{identifier:'local.iina.streams',variant:'unified'},{resolve(){throw Error('unexpected');}});
 assert.equal(c,null);
 assert.deepEqual([...r.shim.mpv.hooks.keys()],['on_load']);
 assert.equal(r.shim.event.names().length,0);
 assert.equal(r.shim.timers.all.length,0);
 r.setPath('/Users/x/movie.mkv');
 let next=0;
 await r.shim.mpv.runHook('on_load',()=>next++);
 assert.equal(next,1);
 assert.equal(r.shim.event.names().length,0);
 assert.equal(r.shim.timers.all.length,0);
 assert.equal(r.shim.sidebar.loads.length,0);
 assert.equal(r.shim.menu.items.length,0);
});
test('native hook resolves public source, continues once and sidebar ready receives real state',async()=>{const r=host(source.label(source.parse('https://twitch.tv/videos/123456'),'unified'));const service={resolve:async()=>resolution,readSettings:()=>({chatEnabled:false}),saveSettings(){},runHelper(){},readFile(){},dataPath:x=>'/private/data/'+x};const c=start(r.h,{variant:'unified'},service);let next=0;await r.shim.mpv.runHook('on_load',()=>next++);assert.equal(next,1);assert.ok(r.shim.mpv.sets.some(x=>x[0]==='stream-open-filename'&&x[1]===resolution.mediaURL));await finishLoad(r,'https://www.twitch.tv/videos/123456');r.shim.sidebar.send('ready',{});const state=JSON.parse(decodeURIComponent(r.shim.sidebar.messages('state').at(-1).data.encoded));assert.equal(state.title,'Recording');assert.equal(state.phase,'playing');assert.equal(state.chat.mode,'off');assert.equal(JSON.stringify(state).includes('vod-secure'),false);r.shim.emit('iina.window-will-close');assert.equal(c.snapshot().phase,'closed');});
test('quality reload does not reopen a deliberately hidden sidebar',async()=>{
 const r=host(source.label(source.parse('https://twitch.tv/videos/123456'),'unified'));let shown=0;r.h.sidebar.show=()=>shown++;
 const c=start(r.h,{variant:'unified'},{resolve:async()=>resolution,readSettings:()=>({chatEnabled:false})});await r.shim.mpv.runHook('on_load',()=>{});await finishLoad(r,'https://www.twitch.tv/videos/123456');c.hideSidebar();const before=shown;await finishLoad(r,'https://www.twitch.tv/videos/123456');assert.equal(shown,before);c.showSidebar();assert.equal(shown,before+1);
});
test('QA configuration cannot attach to an unrelated blank player',()=>{
 const r=host('');const c=start(r.h,{variant:'unified',qa:{source:source.parse('https://twitch.tv/videos/123456')}},{resolve(){throw Error('unexpected');}});assert.equal(c,null);
 // Only the #35 adoption hook; QA configuration adds nothing to an unlabeled window.
 assert.deepEqual([...r.shim.mpv.hooks.keys()],['on_load']);
 assert.equal(r.shim.event.names().length,0);
 assert.equal(r.shim.timers.all.length,0);
});
test('an unrelated file deactivates all quality work and fences an outstanding resolution',async()=>{
 const r=host(source.label(source.parse('https://twitch.tv/videos/123456'),'unified'));let count=0;
 const c=start(r.h,{variant:'unified'},{resolve:async()=>{count++;return resolution;},readSettings:()=>({chatEnabled:false})});await r.shim.mpv.runHook('on_load',()=>{});await finishLoad(r,'https://www.twitch.tv/videos/123456');r.setPath('/Users/example/movie.mp4');await r.shim.mpv.runHook('on_load',()=>{});
 await new Promise(resolve=>setTimeout(resolve,0)); // Review r3 #5: deactivation runs on a later turn.
 assert.equal(await c.changeQuality('auto720'),false);assert.equal(count,1);assert.equal(r.shim.mpv.commands.length,0);
});
test('old native file-loaded events cannot confirm a newer quality generation',async()=>{
 const r=host(source.label(source.parse('https://twitch.tv/videos/123456'),'unified'));const c=start(r.h,{variant:'unified'},{resolve:async(s,q)=>({...resolution,quality:q==='auto720'?'720p60':resolution.quality}),readSettings:()=>({chatEnabled:false})});await r.shim.mpv.runHook('on_load',()=>{});await finishLoad(r,'https://www.twitch.tv/videos/123456');
 await c.changeQuality('360p30');r.setPath('https://www.twitch.tv/videos/123456#streams-generation=1');await r.shim.mpv.runHook('on_load',()=>{});r.shim.emit('iina.file-loaded','https://www.twitch.tv/videos/123456');assert.equal(c.snapshot().busy,true);assert.equal(c.snapshot().quality,'720p60');assert.equal(c.snapshot().busy,true);await finishLoad(r,'https://www.twitch.tv/videos/123456#streams-generation=1');assert.equal(c.snapshot().busy,false);assert.equal(c.snapshot().quality,'360p30');
});
test('after native load and sizing, quality restores pause, speed, position and window frame',async()=>{
 const r=host(source.label(source.parse('https://twitch.tv/videos/123456'),'unified'));r.shim.core.native.frame={x:11,y:22,width:1000,height:620};
 const c=start(r.h,{variant:'unified'},{resolve:async(s,q)=>({...resolution,quality:q==='auto720'?'720p60':resolution.quality}),readSettings:()=>({chatEnabled:false})});await r.shim.mpv.runHook('on_load',()=>{});await finishLoad(r,'https://www.twitch.tv/videos/123456');r.shim.emit('iina.window-size-adjusted');await new Promise(resolve=>setTimeout(resolve,45));
 r.h.mpv.getNumber=n=>n==='time-pos'?83.25:n==='speed'?1.5:0;r.h.mpv.getFlag=()=>true;
 await c.changeQuality('360p30');r.setPath('https://www.twitch.tv/videos/123456#streams-generation=1');await r.shim.mpv.runHook('on_load',()=>{});r.shim.mpv.sets.length=0;r.shim.mpv.commands.length=0;r.shim.core.native.frame={x:100,y:100,width:640,height:360};
 r.shim.emit('iina.file-loaded','https://www.twitch.tv/videos/123456#streams-generation=1');r.shim.emit('iina.window-size-adjusted');await new Promise(resolve=>setTimeout(resolve,650));
 assert.ok(r.shim.mpv.sets.some(x=>x[0]==='pause'&&x[1]===true));assert.ok(r.shim.mpv.sets.some(x=>x[0]==='speed'&&x[1]===1.5));assert.deepEqual(r.shim.mpv.commands.find(x=>x[0]==='seek'),['seek',['83.25','absolute+exact']]);assert.deepEqual(r.h.core.window.frame,{x:11,y:22,width:1000,height:620});c.chatOff();r.shim.emit('iina.window-will-close');
});
test('the native asynchronous file picker is awaited and Off fences a pending selection',async()=>{
 const r=host(source.label(source.parse('https://twitch.tv/videos/123456'),'unified'));let select;const paths=[];r.h.utils.chooseFile=()=>new Promise(resolve=>select=resolve);
 const c=start(r.h,{variant:'unified'},{resolve:async()=>resolution,readSettings:()=>({chatEnabled:false}),dataPath:n=>'/data/'+n,runHelper:async(name,args)=>{paths.push(args[2]);return{ok:false,error:{message:'Fixture complete'}};}});
 const first=c.importArchive();assert.equal(paths.length,0);select('/archives/first.json');await first;assert.deepEqual(paths,['/archives/first.json']);
 const second=c.importArchive();c.chatOff();select('/archives/second.json');assert.equal(await second,false);assert.deepEqual(paths,['/archives/first.json']);
});
test('overlay viewSettings preserves width and height and geometry updates persist',()=>{
 const r=host(source.label(source.parse('https://twitch.tv/videos/123456'),'unified'));
 const saved=[];
 const c=start(r.h,{variant:'unified'},{resolve:async()=>resolution,readSettings:()=>({view:{presentation:'overlay',width:420,height:310,x:0,y:1}}),saveSettings:v=>saved.push(v)});
 assert.equal(c.snapshot().view.width,420);assert.equal(c.snapshot().view.height,310);
 c.setView({width:500,height:360,x:0.5,y:0.5});
 assert.equal(c.snapshot().view.width,500);assert.equal(c.snapshot().view.height,360);
 assert.equal(saved.at(-1).view.width,500);assert.equal(saved.at(-1).view.height,360);
 r.shim.emit('iina.window-will-close');
});
test('YouTube VOD triggers automatic replay fetch silently on file-loaded',async()=>{
 const yt=source.parse('https://www.youtube.com/watch?v=92h_kU8O58M');
 const r=host(source.label(yt,'unified'));r.setPath(yt.url);
 const helpers=[];
 const c=start(r.h,{variant:'unified'},{resolve:async()=>({ok:true,title:'YT VOD',live:false,duration:100,quality:'720p',formats:[{id:'720p',label:'720p'}],mediaURL:'https://example.invalid/yt.mp4'}),readSettings:()=>({}),dataPath:n=>'/data/'+n,runHelper:async(name,args)=>{helpers.push([name,args]);return{ok:false,error:{message:'No archived live-chat replay is available for this video.'}};}});
 await r.shim.mpv.runHook('on_load',()=>{});
 await finishLoad(r,yt.url);
 assert.equal(helpers.length,1);assert.equal(helpers[0][0],'acquire');
 assert.equal(c.snapshot().chat.state,'off');assert.equal(c.snapshot().chat.error,'');
 r.shim.emit('iina.window-will-close');
});
