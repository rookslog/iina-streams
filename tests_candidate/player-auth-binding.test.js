'use strict';
// Synthetic host bridge. No OAuth request, Keychain access, or chat connection.
const test=require('node:test');
const assert=require('node:assert/strict');
const Sources=require('../candidate-plugin/src/source.js');
const {start}=require('../candidate-plugin/src/player.js');

function setup(){
 const callbacks={},events={},sidebar={},overlayCallbacks={},posts=[],cleared=[],scheduled=new Map(),allTimers=new Map();let timerID=0,path='https://www.twitch.tv/hutchmf',sidebarFails=false;
 const originalSet=global.setTimeout,originalClear=global.clearTimeout;
 global.setTimeout=(fn,ms)=>{const id=++timerID;const value={fn,ms};scheduled.set(id,value);allTimers.set(id,value);return id;};
 global.clearTimeout=id=>{cleared.push(id);scheduled.delete(id);};
 const source=Sources.parse(path);
 const host={global:{getLabel:()=>Sources.label(source,'focus'),onMessage:(name,fn)=>callbacks[name]=fn,
   postMessage:(name,data)=>{posts.push([name,data]);if(name==='auth-connect')global.setTimeout(()=>{callbacks['auth-state'](JSON.stringify({phase:'off'}));callbacks['auth-state'](JSON.stringify({phase:'needs-client',message:'Synthetic client required'}));},0);}},
  mpv:{addHook:(name,p,fn)=>events[name]=fn,getString:()=>path,getNumber:()=>0,getFlag:()=>false},
  core:{window:{loaded:true}},sidebar:{loadFile(){},onMessage:(name,fn)=>sidebar[name]=fn,postMessage:(...args)=>{if(sidebarFails)throw Error('Sidebar WebView unavailable');posts.push(['sidebar',...args]);},show(){},hide(){}},
  overlay:{loadFile(){},onMessage:(name,fn)=>overlayCallbacks[name]=fn,postMessage:(...args)=>posts.push(['overlay',...args]),show(){},hide(){},setClickable(){},setOpacity(){}},
  event:{on:(name,fn)=>{events[name]=fn;return name;},off(){}},menu:{addItem(){},item:()=>({})},utils:{}};
 const controller=start(host,{variant:'focus'},{readSettings:()=>({}),cancelHelpers(){}});
 return{controller,callbacks,events,sidebar,overlay:overlayCallbacks,posts,cleared,scheduled,allTimers,failSidebar:()=>{sidebarFails=true;},
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

test('live credentials start only in the loaded overlay and Off fences late delivery',()=>{
 const f=setup();try{
  f.flush();f.sidebar.ready({});f.sidebar.connect({clientID:''});f.flush();
  const wire=JSON.stringify({token:'synthetic-only-token',login:'synthetic'});
  f.callbacks['auth-ready'](wire);
  assert.equal(f.posts.some(([surface,name])=>surface==='sidebar'&&name==='live-config'),false);
  assert.equal(f.posts.some(([surface,name])=>surface==='overlay'&&name==='live-config'),false);
  f.events['iina.plugin-overlay-loaded']();
  f.overlay['overlay-ready']({});
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
  f.flush();f.sidebar.ready({});f.sidebar.connect({clientID:''});f.flush();
  f.callbacks['auth-ready'](JSON.stringify({token:'synthetic-only-token',login:'synthetic'}));
  f.events['iina.plugin-overlay-loaded']();f.overlay['overlay-ready']({});
  const configs=f.posts.filter(([surface,name])=>surface==='overlay'&&name==='live-config');
  assert.equal(configs.length,1);
  const session=JSON.parse(decodeURIComponent(configs[0][2].encoded)).session;
  f.overlay['live-state']({session,state:'connected',message:''});
  f.controller.setView({presentation:'overlay'});f.controller.hideSidebar();
  const stopped=f.posts.filter(([surface,name])=>surface==='overlay'&&name==='live-stop').length;
  f.overlay['live-messages']({session,messages:[{id:'msg-after-hide',author:'Tester',text:'message arrived while sidebar was closed'}]});
  assert.equal(f.controller.snapshot().chat.mode,'live');
  assert.equal(f.controller.snapshot().chat.state,'connected');
  assert.equal(f.controller.snapshot().messages[0].id,'msg-after-hide');
  assert.equal(f.posts.filter(([surface,name])=>surface==='overlay'&&name==='live-stop').length,stopped);
  f.controller.setView({presentation:'sidebar'});
  f.overlay['live-messages']({session,messages:[{id:'msg-after-switch',author:'Tester',text:'kept streaming'}]});
  assert.equal(f.controller.snapshot().messages[0].id,'msg-after-switch');
  f.controller.setView({presentation:'overlay'});f.controller.showSidebar();
  assert.equal(f.posts.filter(([surface,name])=>surface==='overlay'&&name==='live-config').length,1);
  f.controller.chatOff();
  f.overlay['live-messages']({session,messages:[{id:'stale',author:'Tester',text:'do not show'}]});
  assert.equal(f.controller.snapshot().messages.length,0);
 }finally{f.restore();}
});

test('session-only storage warning survives overlay transport progress and clears at Off',()=>{
 const f=setup();try{
  f.flush();f.sidebar.ready({});f.sidebar.connect({clientID:''});f.flush();
  const warning='Connected for this session; Keychain storage failed.';
  f.callbacks['auth-state'](JSON.stringify({phase:'ready',message:warning}));
  f.callbacks['auth-ready'](JSON.stringify({token:'synthetic-only-token',login:'synthetic'}));
  f.events['iina.plugin-overlay-loaded']();f.overlay['overlay-ready']({});
  const config=f.posts.filter(([surface,name])=>surface==='overlay'&&name==='live-config').at(-1);
  const session=JSON.parse(decodeURIComponent(config[2].encoded)).session;
  for(const phase of ['connecting','authenticating','joining','connected']){
   f.overlay['live-state']({session,state:phase,message:''});
   assert.equal(f.controller.snapshot().chat.error,warning,'ordinary '+phase+' progress must retain the storage limitation');
  }
  const sent=f.posts.filter(([surface,name])=>surface==='sidebar'&&name==='state').at(-1);
  assert.equal(JSON.parse(decodeURIComponent(sent[2].encoded)).chat.error,warning);
  f.overlay['live-state']({session,state:'error',message:'Authorization was rejected. Reconnect to chat.'});
  assert.equal(f.controller.snapshot().chat.error,'Authorization was rejected. Reconnect to chat.');
  f.overlay['live-state']({session,state:'connected',message:''});
  assert.equal(f.controller.snapshot().chat.error,warning);
  f.callbacks['auth-state'](JSON.stringify({phase:'ready',message:''}));
  f.overlay['live-state']({session,state:'connected',message:''});
  assert.equal(f.controller.snapshot().chat.error,'');
  f.callbacks['auth-state'](JSON.stringify({phase:'ready',message:warning}));
  f.controller.chatOff();f.overlay['live-state']({session,state:'connected',message:''});
  assert.equal(f.controller.snapshot().chat.mode,'off');assert.equal(f.controller.snapshot().chat.error,'');
 }finally{f.restore();}
});

test('overlay delivery continues if an IINA-native collapsed sidebar rejects state posts',()=>{
 const f=setup();try{
  f.flush();f.sidebar.ready({});f.sidebar.connect({clientID:''});f.flush();
  f.callbacks['auth-ready'](JSON.stringify({token:'synthetic-only-token',login:'synthetic'}));
  f.events['iina.plugin-overlay-loaded']();f.overlay['overlay-ready']({});
  f.controller.setView({presentation:'overlay'});
  const config=f.posts.filter(([surface,name])=>surface==='overlay'&&name==='live-config').at(-1);
  const session=JSON.parse(decodeURIComponent(config[2].encoded)).session;
  f.failSidebar();
  const before=f.posts.filter(([surface,name])=>surface==='overlay'&&name==='state').length;
  assert.doesNotThrow(()=>f.overlay['live-messages']({session,messages:[{id:'while-collapsed',author:'Tester',text:'arrived'}]}));
  assert.ok(f.posts.filter(([surface,name])=>surface==='overlay'&&name==='state').length>before);
  assert.equal(f.controller.snapshot().messages[0].id,'while-collapsed');
 }finally{f.restore();}
});
