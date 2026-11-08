'use strict';
// Synthetic host bridge. No OAuth request, Keychain access, or chat connection.
const test=require('node:test');
const assert=require('node:assert/strict');
const Sources=require('../candidate-plugin/src/source.js');
const {start}=require('../candidate-plugin/src/player.js');

function setup(){
 const callbacks={},events={},sidebar={},posts=[],cleared=[],scheduled=new Map(),allTimers=new Map();let timerID=0,path='https://www.twitch.tv/hutchmf';
 const originalSet=global.setTimeout,originalClear=global.clearTimeout;
 global.setTimeout=(fn,ms)=>{const id=++timerID;const value={fn,ms};scheduled.set(id,value);allTimers.set(id,value);return id;};
 global.clearTimeout=id=>{cleared.push(id);scheduled.delete(id);};
 const source=Sources.parse(path);
 const host={global:{getLabel:()=>Sources.label(source,'focus'),onMessage:(name,fn)=>callbacks[name]=fn,
   postMessage:(name,data)=>{posts.push([name,data]);if(name==='auth-connect'){callbacks['auth-state']({phase:'off'});callbacks['auth-state']({phase:'needs-client',message:'Synthetic client required'});}}},
  mpv:{addHook:(name,p,fn)=>events[name]=fn,getString:()=>path,getNumber:()=>0,getFlag:()=>false},
  core:{window:{loaded:true}},sidebar:{loadFile(){},onMessage:(name,fn)=>sidebar[name]=fn,postMessage:(...args)=>posts.push(['sidebar',...args]),show(){},hide(){}},
  overlay:{loadFile(){},onMessage(){},postMessage(){},show(){},hide(){},setClickable(){},setOpacity(){}},
  event:{on:(name,fn)=>{events[name]=fn;return name;},off(){}},menu:{addItem(){},item:()=>({})},utils:{}};
 const controller=start(host,{variant:'focus'},{readSettings:()=>({}),cancelHelpers(){}});
 return{controller,callbacks,events,sidebar,posts,cleared,scheduled,allTimers,
  flush(){for(const [id,{fn}] of [...scheduled]){scheduled.delete(id);fn();}},
  setPath:value=>path=value,
  restore(){global.setTimeout=originalSet;global.clearTimeout=originalClear;}};
}

test('child auth listeners bind once on a deferred turn with explicit retained references',()=>{
 const f=setup();try{
  assert.deepEqual(Object.keys(f.callbacks),[],'native child creation must not register global callbacks inline');
  assert.equal(f.scheduled.size,1);assert.equal([...f.scheduled.values()][0].ms,0);
  assert.deepEqual(f.posts,[],'passive setup must not request authentication');
  f.flush();
  assert.deepEqual(Object.keys(f.callbacks).sort(),['auth-forgotten','auth-ready','auth-state','auth-stop']);
  assert.equal(f.scheduled.size,0);assert.equal(f.cleared.length,1,'clear fired native timer entry');
  for(const [name,callback] of Object.entries(f.callbacks))assert.equal(f.controller._authCallbacks[name],callback);
  f.flush();assert.equal(f.cleared.length,1);assert.deepEqual(f.posts,[]);
 }finally{f.restore();}
});

test('after binding, immediate object auth replies update the child controller',()=>{
 const f=setup();try{
  f.flush();f.sidebar.connect({clientID:''});
  assert.equal(f.controller.snapshot().auth.phase,'needs-client');
  assert.equal(f.controller.snapshot().chat.state,'needs-client');
  assert.equal(f.controller.snapshot().chat.error,'Synthetic client required');
  assert.equal(f.posts.filter(([name])=>name==='auth-connect').length,1);
 }finally{f.restore();}
});

test('explicit Connect before setup waits for listeners and receives the immediate reply',()=>{
 const f=setup();try{
  f.sidebar.connect({clientID:''});
  assert.equal(f.posts.filter(([name])=>name==='auth-connect').length,0);
  assert.equal(f.controller.snapshot().chat.mode,'live');
  f.flush();
  assert.equal(f.posts.filter(([name])=>name==='auth-connect').length,1);
  assert.equal(f.controller.snapshot().auth.phase,'needs-client');
 }finally{f.restore();}
});

test('Off fences a queued Connect while passive binding remains network-inert',()=>{
 const f=setup();try{
  f.sidebar.connect({clientID:''});f.controller.chatOff();f.flush();
  assert.equal(f.posts.filter(([name])=>name==='auth-connect').length,0);
  assert.equal(f.controller.snapshot().chat.mode,'off');
  assert.equal(Object.keys(f.callbacks).length,4);
 }finally{f.restore();}
});

test('close cancels setup and guards a native timer delivered after cancellation',()=>{
 const f=setup();try{
  const late=[...f.allTimers.values()][0];f.sidebar.connect({clientID:''});f.events['iina.window-will-close']();
  assert.equal(f.scheduled.size,0);late.fn();
  assert.deepEqual(Object.keys(f.callbacks),[]);
  assert.equal(f.posts.filter(([name])=>name==='auth-connect').length,0);
 }finally{f.restore();}
});

test('source deactivation cancels setup and cannot deliver queued authentication',async()=>{
 const f=setup();try{
  const late=[...f.allTimers.values()][0];f.sidebar.connect({clientID:''});f.setPath('/synthetic/unrelated.mp4');
  await f.events.on_load(()=>{});
  assert.equal(f.scheduled.size,0);late.fn();
  assert.deepEqual(Object.keys(f.callbacks),[]);
  assert.equal(f.posts.filter(([name])=>name==='auth-connect').length,0);
 }finally{f.restore();}
});

test('retained callbacks cannot revive a closed child or post late credentials',()=>{
 const f=setup();try{
  f.flush();f.sidebar.ready({});f.sidebar.connect({clientID:''});f.events['iina.window-will-close']();const count=f.posts.length;
  f.callbacks['auth-state']({phase:'ready'});
  f.callbacks['auth-ready']({token:'synthetic-only',login:'synthetic'});
  f.callbacks['auth-stop']({});
  f.callbacks['auth-forgotten']({removed:true,revoked:true});
  assert.equal(f.posts.length,count);
  assert.equal(f.controller.snapshot().chat.mode,'off');
 }finally{f.restore();}
});
