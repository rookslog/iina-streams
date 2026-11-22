'use strict';
// Synthetic host bridge. No OAuth request, Keychain access, or chat connection.
const test=require('node:test');
const assert=require('node:assert/strict');
const Sources=require('../src/source.js');
const {start}=require('../src/player.js');
const {createIina}=require('./support/iina-shim.js');

function setup(){
 const shim=createIina({label:undefined});
 const originalSet=global.setTimeout,originalClear=global.clearTimeout;
 // The product reads the global timer functions when it starts, so install the shim's fake timers.
 global.setTimeout=shim.timers.setTimeout;
 global.clearTimeout=shim.timers.clearTimeout;
 const source=Sources.parse('https://www.twitch.tv/hutchmf');
 shim.global.label=Sources.label(source,'unified');
 const setPath=value=>shim.mpv.set('path',value).set('stream-open-filename',value);
 setPath(source.url);
 // Simulate the broker's deferred reply to an auth-connect request.
 shim.global.onPost=({name})=>{if(name==='auth-connect')shim.timers.setTimeout(()=>{shim.global.send('auth-state',JSON.stringify({phase:'off'}));shim.global.send('auth-state',JSON.stringify({phase:'needs-client',message:'Synthetic client required'}));},0);};
 const controller=start(shim.iina,{variant:'unified'},{readSettings:()=>({}),cancelHelpers(){}});
 // Legacy post tuples: global messages are [name,data]; sidebar/overlay are [surface,name,data].
 const tuples=()=>shim.posts.map(p=>p.surface==='global'?[p.name,p.data]:[p.surface,p.name,p.data]);
 return{controller,shim,get callbacks(){return Object.fromEntries(shim.global.listeners);},
  get posts(){return tuples();},cleared:shim.timers.cleared,
  failSidebar:()=>{shim.sidebar.postError=Error('Sidebar WebView unavailable');},
  flush:()=>shim.timers.flushAll(),
  setPath,
  restore(){global.setTimeout=originalSet;global.clearTimeout=originalClear;}};
}

test('child auth listeners bind once on a deferred turn with explicit retained references',()=>{
 const f=setup();try{
  assert.deepEqual(Object.keys(f.callbacks),[],'native child creation must not register global callbacks inline');
  assert.equal(f.shim.timers.pending().length,1);assert.equal(f.shim.timers.pending()[0].delay,0);
  assert.deepEqual(f.posts,[],'passive setup must not request authentication');
  f.flush();
  // #50 adds 'open-error' (global rejects the sidebar's Open Stream input), bound on the same deferred turn.
  const bound=['auth-forgotten','auth-ready','auth-state','auth-status','auth-stop','open-error'];
  assert.deepEqual(Object.keys(f.callbacks).sort(),bound);
  assert.equal(f.shim.timers.pending().length,0);assert.equal(f.cleared.length,1,'clear fired native timer entry');
  for(const [name,callback] of Object.entries(f.callbacks)){
   if(name!=='open-error')assert.equal(f.controller._authCallbacks[name],callback);
  }
  f.flush();assert.equal(f.cleared.length,1);assert.deepEqual(f.posts.filter(([n])=>n!=='auth-probe'),[]);
 }finally{f.restore();}
});

test('after binding, a deferred JSON primitive reply updates the child controller',()=>{
 const f=setup();try{
  f.flush();f.shim.sidebar.send('connect',{clientID:''});
  assert.equal(f.controller.snapshot().chat.state,'authorizing');f.flush();
  assert.equal(f.controller.snapshot().auth.phase,'needs-client');
  assert.equal(f.controller.snapshot().chat.state,'needs-client');
  assert.equal(f.controller.snapshot().chat.error,'Synthetic client required');
  assert.equal(f.posts.filter(([name])=>name==='auth-connect').length,1);
 }finally{f.restore();}
});

test('explicit Connect before setup waits for listeners and receives a later primitive reply',()=>{
 const f=setup();try{
  f.shim.sidebar.send('connect',{clientID:''});
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
  f.shim.sidebar.send('connect',{clientID:''});f.controller.chatOff();f.flush();
  assert.equal(f.posts.filter(([name])=>name==='auth-connect').length,0);
  assert.equal(f.controller.snapshot().chat.mode,'off');
  // Five auth callbacks plus the #50 'open-error' listener.
  assert.equal(Object.keys(f.callbacks).length,6);
 }finally{f.restore();}
});

test('close cancels setup and guards a native timer delivered after cancellation',()=>{
 const f=setup();try{
  const late=f.shim.timers.all[0];f.shim.sidebar.send('connect',{clientID:''});f.shim.emit('iina.window-will-close');
  assert.equal(f.shim.timers.pending().length,0);late.fn();
  assert.deepEqual(Object.keys(f.callbacks),[]);
  assert.equal(f.posts.filter(([name])=>name==='auth-connect').length,0);
 }finally{f.restore();}
});

test('source deactivation cancels setup and cannot deliver queued authentication',async()=>{
 const f=setup();try{
  const late=f.shim.timers.all[0];f.shim.sidebar.send('connect',{clientID:''});f.setPath('/synthetic/unrelated.mp4');
  const hook=f.shim.mpv.runHook('on_load',()=>{});
  // v0.5.5 review r2 #6: deactivation runs on a main-thread turn. Fire only that turn: `late`, the pending
  // binding timer, must stay undelivered until after deactivation.
  f.shim.timers.fire(f.shim.timers.all.at(-1));
  await hook;
  assert.equal(f.shim.timers.pending().length,0);late.fn();
  assert.deepEqual(Object.keys(f.callbacks),[]);
  assert.equal(f.posts.filter(([name])=>name==='auth-connect').length,0);
 }finally{f.restore();}
});

test('retained callbacks cannot revive a closed child or post late credentials',()=>{
 const f=setup();try{
  f.flush();f.shim.sidebar.send('ready',{});f.shim.sidebar.send('connect',{clientID:''});f.shim.emit('iina.window-will-close');const count=f.posts.length;
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
  f.flush();f.shim.sidebar.send('ready',{});f.shim.sidebar.send('connect',{clientID:''});f.flush();
  const before=f.controller.snapshot(),count=f.posts.length;
  for(const wire of [undefined,null,{phase:'ready'},'broken','null','[]','42','"text"','{}','{"phase":12}',JSON.stringify({phase:'error',message:'x'.repeat(8192)})]){
   assert.doesNotThrow(()=>f.callbacks['auth-state'](wire));
  }
  for(const wire of ['null','[]','{}','{"token":17,"login":"reader"}',JSON.stringify({token:'x'.repeat(8193),login:'reader'})])assert.doesNotThrow(()=>f.callbacks['auth-ready'](wire));
  for(const wire of ['null','[]','{}','{"removed":"yes","revoked":true}'])assert.doesNotThrow(()=>f.callbacks['auth-forgotten'](wire));
  assert.equal(f.posts.length,count);assert.deepEqual(f.controller.snapshot(),before);
 }finally{f.restore();}
});

test('live credentials start only in the loaded overlay and Off fences late delivery',()=>{
 const f=setup();try{
  f.flush();f.shim.sidebar.send('ready',{});f.shim.sidebar.send('connect',{clientID:''});f.flush();
  const wire=JSON.stringify({token:'synthetic-only-token',login:'synthetic'});
  f.callbacks['auth-ready'](wire);
  assert.equal(f.posts.some(([surface,name])=>surface==='sidebar'&&name==='live-config'),false);
  assert.equal(f.posts.some(([surface,name])=>surface==='overlay'&&name==='live-config'),false);
  f.shim.emit('iina.plugin-overlay-loaded');
  f.shim.overlay.send('overlay-ready',{});
  const delivered=f.posts.filter(([surface,name])=>surface==='overlay'&&name==='live-config');
  assert.equal(delivered.length,1);
  const config=JSON.parse(decodeURIComponent(delivered[0][2].encoded));
  assert.equal(config.token,'synthetic-only-token');
  assert.ok(Number.isInteger(config.session)&&config.session>0);
  assert.ok(!JSON.stringify(f.controller.snapshot()).includes('synthetic-only-token'));
  f.controller.chatOff();const count=f.posts.length;
  f.callbacks['auth-ready'](wire);f.callbacks['auth-state'](JSON.stringify({phase:'ready'}));
  assert.equal(f.posts.length,count);assert.equal(f.controller.snapshot().chat.mode,'off');
 }finally{f.restore();}
});

test('overlay live chat continues after sidebar hides, and display changes reuse one connection',()=>{
 const f=setup();try{
  f.flush();f.shim.sidebar.send('ready',{});f.shim.sidebar.send('connect',{clientID:''});f.flush();
  f.callbacks['auth-ready'](JSON.stringify({token:'synthetic-only-token',login:'synthetic'}));
  f.shim.emit('iina.plugin-overlay-loaded');f.shim.overlay.send('overlay-ready',{});
  const configs=f.posts.filter(([surface,name])=>surface==='overlay'&&name==='live-config');
  assert.equal(configs.length,1);
  const session=JSON.parse(decodeURIComponent(configs[0][2].encoded)).session;
  f.shim.overlay.send('live-state',{session,state:'connected',message:''});
  f.controller.setView({presentation:'overlay'});f.controller.hideSidebar();
  const stopped=f.posts.filter(([surface,name])=>surface==='overlay'&&name==='live-stop').length;
  f.shim.overlay.send('live-messages',{session,messages:[{id:'msg-after-hide',author:'Tester',text:'message arrived while sidebar was closed'}]});
  assert.equal(f.controller.snapshot().chat.mode,'live');
  assert.equal(f.controller.snapshot().chat.state,'connected');
  assert.equal(f.controller.snapshot().messages[0].id,'msg-after-hide');
  assert.equal(f.posts.filter(([surface,name])=>surface==='overlay'&&name==='live-stop').length,stopped);
  f.controller.setView({presentation:'sidebar'});
  f.shim.overlay.send('live-messages',{session,messages:[{id:'msg-after-switch',author:'Tester',text:'kept streaming'}]});
  assert.equal(f.controller.snapshot().messages.at(-1).id,'msg-after-switch');
  f.controller.setView({presentation:'overlay'});f.controller.showSidebar();
  assert.equal(f.posts.filter(([surface,name])=>surface==='overlay'&&name==='live-config').length,1);
  f.controller.chatOff();
  f.shim.overlay.send('live-messages',{session,messages:[{id:'stale',author:'Tester',text:'do not show'}]});
  assert.equal(f.controller.snapshot().messages.length,0);
 }finally{f.restore();}
});

test('session-only storage warning survives overlay transport progress and clears at Off',()=>{
 const f=setup();try{
  f.flush();f.shim.sidebar.send('ready',{});f.shim.sidebar.send('connect',{clientID:''});f.flush();
  const warning='Connected for this session; Keychain storage failed.';
  f.callbacks['auth-state'](JSON.stringify({phase:'ready',message:warning}));
  f.callbacks['auth-ready'](JSON.stringify({token:'synthetic-only-token',login:'synthetic'}));
  f.shim.emit('iina.plugin-overlay-loaded');f.shim.overlay.send('overlay-ready',{});
  const config=f.posts.filter(([surface,name])=>surface==='overlay'&&name==='live-config').at(-1);
  const session=JSON.parse(decodeURIComponent(config[2].encoded)).session;
  for(const phase of ['connecting','authenticating','joining','connected']){
   f.shim.overlay.send('live-state',{session,state:phase,message:''});
   assert.equal(f.controller.snapshot().chat.error,warning,'ordinary '+phase+' progress must retain the storage limitation');
  }
  const sent=f.posts.filter(([surface,name])=>surface==='sidebar'&&name==='state').at(-1);
  assert.equal(JSON.parse(decodeURIComponent(sent[2].encoded)).chat.error,warning);
  f.shim.overlay.send('live-state',{session,state:'error',message:'Authorization was rejected. Reconnect to chat.'});
  assert.equal(f.controller.snapshot().chat.error,'Authorization was rejected. Reconnect to chat.');
  f.shim.overlay.send('live-state',{session,state:'connected',message:''});
  assert.equal(f.controller.snapshot().chat.error,warning);
  f.callbacks['auth-state'](JSON.stringify({phase:'ready',message:''}));
  f.shim.overlay.send('live-state',{session,state:'connected',message:''});
  assert.equal(f.controller.snapshot().chat.error,'');
  f.callbacks['auth-state'](JSON.stringify({phase:'ready',message:warning}));
  f.controller.chatOff();f.shim.overlay.send('live-state',{session,state:'connected',message:''});
  assert.equal(f.controller.snapshot().chat.mode,'off');assert.equal(f.controller.snapshot().chat.error,'');
 }finally{f.restore();}
});

test('overlay delivery continues if an IINA-native collapsed sidebar rejects state posts',()=>{
 const f=setup();try{
  f.flush();f.shim.sidebar.send('ready',{});f.shim.sidebar.send('connect',{clientID:''});f.flush();
  f.callbacks['auth-ready'](JSON.stringify({token:'synthetic-only-token',login:'synthetic'}));
  f.shim.emit('iina.plugin-overlay-loaded');f.shim.overlay.send('overlay-ready',{});
  f.controller.setView({presentation:'overlay'});
  const config=f.posts.filter(([surface,name])=>surface==='overlay'&&name==='live-config').at(-1);
  const session=JSON.parse(decodeURIComponent(config[2].encoded)).session;
  f.failSidebar();
  const before=f.posts.filter(([surface,name])=>surface==='overlay'&&name==='state').length;
  assert.doesNotThrow(()=>f.shim.overlay.send('live-messages',{session,messages:[{id:'while-collapsed',author:'Tester',text:'arrived'}]}));
  assert.ok(f.posts.filter(([surface,name])=>surface==='overlay'&&name==='state').length>before);
  assert.equal(f.controller.snapshot().messages[0].id,'while-collapsed');
 }finally{f.restore();}
});
