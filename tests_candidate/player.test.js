"use strict";
const test=require('node:test');const assert=require('node:assert/strict');
const source=require('../src/source.js');
const {start}=require('../src/player.js');
function host(label){const hooks={},events={},messages={},posts=[],sets=[],commands=[];let path='https://www.twitch.tv/videos/123456';const h={global:{getLabel:()=>label,onMessage(){},postMessage:(...a)=>posts.push(['global',...a])},mpv:{addHook:(n,p,fn)=>hooks[n]=fn,getString:n=>n==='path'||n==='stream-open-filename'?path:'',getNumber:()=>0,getFlag:()=>false,set:(...a)=>sets.push(a),command:(...a)=>commands.push(a)},core:{window:{loaded:true},osd(){}},sidebar:{loadFile(){for(const k of Object.keys(messages))delete messages[k];},onMessage:(n,fn)=>messages[n]=fn,postMessage:(...a)=>posts.push(['sidebar',...a]),show(){},hide(){}},overlay:{loadFile(){},onMessage(){},postMessage(){},show(){},hide(){},setClickable(){},setOpacity(){}},event:{on:(n,fn)=>{events[n]=fn;return n;},off(){}},menu:{addItem(){},item:(name,fn)=>({name,fn})},utils:{chooseFile:()=>false},console:{log(){},error(){}}};return{h,hooks,events,messages,posts,sets,commands,setPath:p=>path=p};}
async function finishLoad(r,url){r.events['iina.file-loaded'](url);r.events['iina.window-size-adjusted']();await new Promise(resolve=>setTimeout(resolve,650));}
const resolution={ok:true,title:'Recording',live:false,duration:100,quality:'360p30',formats:[{id:'360p30',label:'360p'}],mediaURL:'https://vod-secure.twitch.tv/transport'};
test('unrelated IINA windows acquire no candidate hooks, network, timers or controls',()=>{const r=host('');const c=start(r.h,{variant:'unified'},{resolve(){throw Error('unexpected');}});assert.equal(c,null);assert.equal(Object.keys(r.hooks).length,0);assert.equal(Object.keys(r.events).length,0);});
test('native hook resolves public source, continues once and sidebar ready receives real state',async()=>{const r=host(source.label(source.parse('https://twitch.tv/videos/123456'),'unified'));const service={resolve:async()=>resolution,readSettings:()=>({}),saveSettings(){},runHelper(){},readFile(){},dataPath:x=>'/private/data/'+x};const c=start(r.h,{variant:'unified'},service);let next=0;await r.hooks.on_load(()=>next++);assert.equal(next,1);assert.ok(r.sets.some(x=>x[0]==='stream-open-filename'&&x[1]===resolution.mediaURL));await finishLoad(r,'https://www.twitch.tv/videos/123456');r.messages.ready({});const state=JSON.parse(decodeURIComponent(r.posts.filter(p=>p[0]==='sidebar'&&p[1]==='state').at(-1)[2].encoded));assert.equal(state.title,'Recording');assert.equal(state.phase,'playing');assert.equal(state.chat.mode,'off');assert.equal(JSON.stringify(state).includes('vod-secure'),false);r.events['iina.window-will-close']();assert.equal(c.snapshot().phase,'closed');});
test('quality reload does not reopen a deliberately hidden sidebar',async()=>{
 const r=host(source.label(source.parse('https://twitch.tv/videos/123456'),'unified'));let shown=0;r.h.sidebar.show=()=>shown++;
 const c=start(r.h,{variant:'unified'},{resolve:async()=>resolution,readSettings:()=>({})});await r.hooks.on_load(()=>{});await finishLoad(r,'https://www.twitch.tv/videos/123456');c.hideSidebar();const before=shown;await finishLoad(r,'https://www.twitch.tv/videos/123456');assert.equal(shown,before);c.showSidebar();assert.equal(shown,before+1);
});
test('QA configuration cannot attach to an unrelated blank player',()=>{
 const r=host('');const c=start(r.h,{variant:'unified',qa:{source:source.parse('https://twitch.tv/videos/123456')}},{resolve(){throw Error('unexpected');}});assert.equal(c,null);assert.equal(Object.keys(r.hooks).length,0);
});
test('an unrelated file deactivates all quality work and fences an outstanding resolution',async()=>{
 const r=host(source.label(source.parse('https://twitch.tv/videos/123456'),'unified'));let count=0;
 const c=start(r.h,{variant:'unified'},{resolve:async()=>{count++;return resolution;},readSettings:()=>({})});await r.hooks.on_load(()=>{});await finishLoad(r,'https://www.twitch.tv/videos/123456');r.setPath('/Users/example/movie.mp4');await r.hooks.on_load(()=>{});assert.equal(await c.changeQuality('auto720'),false);assert.equal(count,1);assert.equal(r.commands.length,0);
});
test('old native file-loaded events cannot confirm a newer quality generation',async()=>{
 const r=host(source.label(source.parse('https://twitch.tv/videos/123456'),'unified'));const c=start(r.h,{variant:'unified'},{resolve:async(s,q)=>({...resolution,quality:q==='auto720'?'720p60':resolution.quality}),readSettings:()=>({})});await r.hooks.on_load(()=>{});await finishLoad(r,'https://www.twitch.tv/videos/123456');
 await c.changeQuality('360p30');r.setPath('https://www.twitch.tv/videos/123456#streams-generation=1');await r.hooks.on_load(()=>{});r.events['iina.file-loaded']('https://www.twitch.tv/videos/123456');assert.equal(c.snapshot().busy,true);assert.equal(c.snapshot().quality,'720p60');assert.equal(c.snapshot().busy,true);await finishLoad(r,'https://www.twitch.tv/videos/123456#streams-generation=1');assert.equal(c.snapshot().busy,false);assert.equal(c.snapshot().quality,'360p30');
});
test('after native load and sizing, quality restores pause, speed, position and window frame',async()=>{
 const r=host(source.label(source.parse('https://twitch.tv/videos/123456'),'unified'));r.h.core.window.frame={x:11,y:22,width:1000,height:620};
 const c=start(r.h,{variant:'unified'},{resolve:async(s,q)=>({...resolution,quality:q==='auto720'?'720p60':resolution.quality}),readSettings:()=>({})});await r.hooks.on_load(()=>{});await finishLoad(r,'https://www.twitch.tv/videos/123456');r.events['iina.window-size-adjusted']();await new Promise(resolve=>setTimeout(resolve,45));
 r.h.mpv.getNumber=n=>n==='time-pos'?83.25:n==='speed'?1.5:0;r.h.mpv.getFlag=()=>true;
 await c.changeQuality('360p30');r.setPath('https://www.twitch.tv/videos/123456#streams-generation=1');await r.hooks.on_load(()=>{});r.sets.length=0;r.commands.length=0;r.h.core.window.frame={x:100,y:100,width:640,height:360};
 r.events['iina.file-loaded']('https://www.twitch.tv/videos/123456#streams-generation=1');r.events['iina.window-size-adjusted']();await new Promise(resolve=>setTimeout(resolve,650));
 assert.ok(r.sets.some(x=>x[0]==='pause'&&x[1]===true));assert.ok(r.sets.some(x=>x[0]==='speed'&&x[1]===1.5));assert.deepEqual(r.commands.find(x=>x[0]==='seek'),['seek',['83.25','absolute+exact']]);assert.deepEqual(r.h.core.window.frame,{x:11,y:22,width:1000,height:620});c.chatOff();r.events['iina.window-will-close']();
});
test('the native asynchronous file picker is awaited and Off fences a pending selection',async()=>{
 const r=host(source.label(source.parse('https://twitch.tv/videos/123456'),'unified'));let select;const paths=[];r.h.utils.chooseFile=()=>new Promise(resolve=>select=resolve);
 const c=start(r.h,{variant:'unified'},{resolve:async()=>resolution,readSettings:()=>({}),dataPath:n=>'/data/'+n,runHelper:async(name,args)=>{paths.push(args[2]);return{ok:false,error:{message:'Fixture complete'}};}});
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
 r.events['iina.window-will-close']();
});
test('YouTube VOD triggers automatic replay fetch silently on file-loaded',async()=>{
 const yt=source.parse('https://www.youtube.com/watch?v=92h_kU8O58M');
 const r=host(source.label(yt,'unified'));r.setPath(yt.url);
 const helpers=[];
 const c=start(r.h,{variant:'unified'},{resolve:async()=>({ok:true,title:'YT VOD',live:false,duration:100,quality:'720p',formats:[{id:'720p',label:'720p'}],mediaURL:'https://example.invalid/yt.mp4'}),readSettings:()=>({}),dataPath:n=>'/data/'+n,runHelper:async(name,args)=>{helpers.push([name,args]);return{ok:false,error:{message:'No archived live-chat replay is available for this video.'}};}});
 await r.hooks.on_load(()=>{});
 await finishLoad(r,yt.url);
 assert.equal(helpers.length,1);assert.equal(helpers[0][0],'acquire');
 assert.equal(c.snapshot().chat.state,'off');assert.equal(c.snapshot().chat.error,'');
 r.events['iina.window-will-close']();
});
