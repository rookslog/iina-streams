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
   postMessage:(name,data)=>{posts.push([name,data]);if(name==='auth-connect')global.setTimeout(()=>{callbacks['auth-state'](JSON.stringify({phase:'off'}));callbacks['auth-state'](JSON.stringify({phase:'needs-client',message:'Synthetic client required'}));},0);}},
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

test('after binding, a deferred JSON primitive reply updates the child controller',()=>{
 const f=setup();try{
  f.flush();f.sidebar.connect({clientID:''});
  assert.equal(f.controller.snapshot().chat.state,'authorizing');f.flush();
  assert.equal(f.controller.snapshot().auth.phase,'needs-client');
  assert.equal(f.controller.snapshot().chat.state,'needs-client');
  assert.equal(f.controller.snapshot().chat.error,'Synthetic client required');
  assert.equal(f.posts.filter(([name])=>name==='auth-connect').length,1);
 }finally{f.restore();}
});

test('explicit Connect before setup waits for listeners and receives a later primitive reply',()=>{
 const f=setup();try{
  f.sidebar.connect({clientID:''});
  assert.equal(f.posts.filter(([name])=>name==='auth-connect').length,0);
  assert.equal(f.controller.snapshot().chat.mode,'live');
  f.flush();
  assert.equal(f.posts.filter(([name])=>name==='auth-connect').length,1);
  assert.equal(f.controller.snapshot().chat.state,'authorizing');f.flush();
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
  f.callbacks['auth-state'](JSON.stringify({phase:'ready'}));
  f.callbacks['auth-ready'](JSON.stringify({token:'synthetic-only-token',login:'synthetic'}));
  f.callbacks['auth-stop']('{}');
  f.callbacks['auth-forgotten'](JSON.stringify({removed:true,revoked:true}));
  assert.equal(f.posts.length,count);
  assert.equal(f.controller.snapshot().chat.mode,'off');
 }finally{f.restore();}
});

test('malformed, non-object, oversized and wrong-shaped auth wire is ignored without echoing it',()=>{
 const f=setup();try{
  f.flush();f.sidebar.ready({});f.sidebar.connect({clientID:''});f.flush();
  const before=f.controller.snapshot(),count=f.posts.length;
  for(const wire of [undefined,null,{phase:'ready'},'broken','null','[]','42','"text"','{}','{"phase":12}',JSON.stringify({phase:'error',message:'x'.repeat(8192)})]){
   assert.doesNotThrow(()=>f.callbacks['auth-state'](wire));
  }
  for(const wire of ['null','[]','{}','{"token":17,"login":"reader"}',JSON.stringify({token:'x'.repeat(8193),login:'reader'})])assert.doesNotThrow(()=>f.callbacks['auth-ready'](wire));
  for(const wire of ['null','[]','{}','{"removed":"yes","revoked":true}'])assert.doesNotThrow(()=>f.callbacks['auth-forgotten'](wire));
  assert.equal(f.posts.length,count);assert.deepEqual(f.controller.snapshot(),before);
 }finally{f.restore();}
});

test('valid credential strings reach only a live ready sidebar, and Off fences late delivery',()=>{
 const f=setup();try{
  f.flush();f.sidebar.ready({});f.sidebar.connect({clientID:''});f.flush();
  const wire=JSON.stringify({token:'synthetic-only-token',login:'synthetic'});
  f.callbacks['auth-ready'](wire);
  const delivered=f.posts.filter(([kind,name])=>kind==='sidebar'&&name==='live-config');
  assert.equal(delivered.length,1);
  assert.ok(JSON.stringify(delivered[0]).includes('synthetic-only-token'));
  f.controller.chatOff();const count=f.posts.length;
  f.callbacks['auth-ready'](wire);f.callbacks['auth-state'](JSON.stringify({phase:'ready'}));
  assert.equal(f.posts.length,count);assert.equal(f.controller.snapshot().chat.mode,'off');
 }finally{f.restore();}
});

test('session-only storage warning survives live progress, yields to transport errors, and clears at Off',()=>{
 const f=setup();try{
  f.flush();f.sidebar.ready({});f.sidebar.connect({clientID:''});f.flush();
  const warning='Connected for this session; Keychain storage failed.';
  f.callbacks['auth-state'](JSON.stringify({phase:'ready',message:warning}));
  for(const phase of ['connecting','authenticating','joining','connected']){
   f.sidebar['live-state']({state:phase,message:''});
   assert.equal(f.controller.snapshot().chat.error,warning,'ordinary '+phase+' progress must retain the storage limitation');
  }
  const sent=f.posts.filter(([kind,name])=>kind==='sidebar'&&name==='state').at(-1);
  assert.equal(JSON.parse(decodeURIComponent(sent[2].encoded)).chat.error,warning);
  f.sidebar['live-state']({state:'error',message:'Authorization was rejected. Reconnect to chat.'});
  assert.equal(f.controller.snapshot().chat.error,'Authorization was rejected. Reconnect to chat.');
  f.sidebar['live-state']({state:'connected',message:''});
  assert.equal(f.controller.snapshot().chat.error,warning,'recovery must restore the still-relevant storage warning');
  f.callbacks['auth-state'](JSON.stringify({phase:'ready',message:''}));
  f.sidebar['live-state']({state:'connected',message:''});
  assert.equal(f.controller.snapshot().chat.error,'','a later successful storage state must clear the old warning');
  f.callbacks['auth-state'](JSON.stringify({phase:'ready',message:warning}));
  f.controller.chatOff();f.sidebar['live-state']({state:'connected',message:''});
  assert.equal(f.controller.snapshot().chat.mode,'off');assert.equal(f.controller.snapshot().chat.error,'');
 }finally{f.restore();}
});
