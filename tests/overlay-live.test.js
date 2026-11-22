"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {createWebViewIina}=require('./support/iina-shim.js');
const root=path.join(__dirname,'../ui');

function runtime(){
 const page=createWebViewIina(),messages=page.posts,windowEvents={},sockets=[],timers=new Map();
 let clock=0,nextTimer=0;
 class Socket{
  constructor(url){this.url=url;this.readyState=0;this.sent=[];sockets.push(this);}
  open(){this.readyState=1;if(this.onopen)this.onopen();}
  receive(data){if(this.onmessage)this.onmessage({data});}
  send(data){this.sent.push(data);}
  close(){this.readyState=3;}
 }
 const ctx={
  WebSocket:Socket,
  iina:page.iina,
  addEventListener:(name,fn)=>windowEvents[name]=fn,
  setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,due:clock+ms});return id;},
  clearTimeout(id){timers.delete(id);},
  Date:class extends Date{static now(){return clock;}}
 };
 ctx.window=ctx;
 const context=vm.createContext(ctx);
 for(const name of ['live.js','live-history.js','overlay-live.js']){
  vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),context,{filename:name});
 }
 function send(name,data){
  assert.ok(page.listeners.has(name),'page registered no iina.onMessage listener for '+name);
  page.receiveEnvelope(name,data);
 }
 function advance(ms){
  const target=clock+ms;
  for(;;){
   const entry=[...timers].filter(([,value])=>value.due<=target).sort((a,b)=>a[1].due-b[1].due)[0];
   if(!entry)break;
   clock=entry[1].due;timers.delete(entry[0]);entry[1].fn();
  }
  clock=target;
 }
 function ready(socket,channel='hutchmf'){
  socket.open();
  socket.receive(':tmi.twitch.tv 001 reader :Welcome\r\n@room-id=1 :tmi.twitch.tv ROOMSTATE #'+channel+'\r\n');
 }
 function message(socket,id,text,channel='hutchmf'){
  socket.receive('@id='+id+';display-name=Tester;user-id=10;tmi-sent-ts=1234 :tester!tester@test.tmi.twitch.tv PRIVMSG #'+channel+' :'+text+'\r\n');
 }
 return{send,advance,ready,message,sockets,messages,timers,windowEvents};
}

test('overlay owns the IRC WebSocket and emits bounded, tagged messages without leaking the token',()=>{
 const r=runtime();
 assert.equal(r.sockets.length,0);
 r.send('live-config',{token:'synthetic-only-token',login:'reader',channel:'hutchmf',session:10});
 assert.equal(r.sockets.length,1);
 assert.equal(r.sockets[0].url,'wss://irc-ws.chat.twitch.tv:443');
 r.ready(r.sockets[0]);
 r.message(r.sockets[0],'one','before sidebar closes');
 r.advance(200);
 const events=r.messages.filter(x=>x.name==='live-messages');
 assert.equal(events.length,1);
 assert.equal(events[0].data.session,10);
 assert.equal(events[0].data.messages[0].id,'one');
 assert.equal(events[0].data.messages[0].text,'before sidebar closes');
 assert.equal(JSON.stringify(r.messages).includes('synthetic-only-token'),false);
 assert.ok(r.sockets[0].sent.some(x=>x.startsWith('PASS oauth:')));
});

test('Off, reconnect, and pagehide cannot deliver messages from an old socket',()=>{
 const r=runtime();
 r.send('live-config',{token:'synthetic-only-token',login:'reader',channel:'hutchmf',session:1});
 const first=r.sockets[0];r.ready(first);
 r.message(first,'pending','pending before stop');
 r.send('live-stop',{});
 assert.equal(first.readyState,3);
 assert.equal(r.timers.size,0);
 const count=r.messages.filter(x=>x.name==='live-messages').length;
 r.advance(2000);
 assert.equal(r.messages.filter(x=>x.name==='live-messages').length,count);
 r.send('live-config',{token:'new-synthetic-token',login:'reader',channel:'second',session:2});
 assert.equal(r.sockets.length,2);
 r.ready(r.sockets[1],'second');
 first.receive('@id=stale :tester!tester@test PRIVMSG #hutchmf :stale\r\n');
 r.message(r.sockets[1],'new','new session','second');
 r.advance(200);
 const batches=r.messages.filter(x=>x.name==='live-messages');
 assert.equal(batches.at(-1).data.session,2);
 assert.deepEqual(batches.at(-1).data.messages.map(x=>x.id),['new']);
 r.windowEvents.pagehide();
 assert.equal(r.sockets[1].readyState,3);
 r.send('live-config',{token:'ignore',login:'reader',channel:'second',session:3});
 assert.equal(r.sockets.length,2);
 assert.equal(r.timers.size,0);
});

test('HTML places the only chat transport in overlay and permits only Twitch WSS',()=>{
 const overlay=fs.readFileSync(path.join(root,'overlay.html'),'utf8');
 const sidebar=fs.readFileSync(path.join(root,'sidebar.html'),'utf8');
 assert.match(overlay,/connect-src wss:\/\/irc-ws.chat.twitch.tv:443/);
 for(const script of ['live.js','live-history.js','overlay-live.js'])assert.ok(overlay.includes('src="'+script+'"'));
 assert.ok(!sidebar.includes('src="live.js"'));
 assert.ok(!sidebar.includes('src="overlay-live.js"'));
 const presentation=fs.readFileSync(path.join(root,'overlay.js'),'utf8');
 assert.ok(presentation.includes("s.view.presentation!=='overlay'"));
});
