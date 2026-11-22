'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Sources=require('../src/source.js');
const {start}=require('../src/player.js');

function fixture(settings={}) {
 const source=Sources.parse('https://www.twitch.tv/videos/2922164492');
 const hooks={},events={},side={},menus=[],deleted=[],cancelled=[],calls=[];
 const host={
  global:{getLabel:()=>Sources.label(source,'unified'),onMessage(){},postMessage(){}},
  mpv:{addHook:(name,priority,fn)=>hooks[name]=fn,
   getString:key=>key==='path'?source.url:'',getNumber:()=>0,getFlag:()=>false,
   set(){},command(){}},
  core:{window:{loaded:true,frame:{width:640,height:360}}},
  sidebar:{loadFile(){},onMessage:(name,fn)=>side[name]=fn,postMessage(){},show(){},hide(){}},
  overlay:{loadFile(){},onMessage(){},postMessage(){},show(){},hide(){},setClickable(){},setOpacity(){}},
  event:{on:(name,fn)=>{events[name]=fn;return name;},off(){}},
  menu:{addItem:x=>menus.push(x),item:(name,fn)=>({name,fn})},
  utils:{chooseFile:async()=>false,ask:()=>false},
  file:{write(){},exists(){return false;}}
 };
 let acquire,finishImport;
 const data=new Map();
 const services={
  readSettings:()=>settings,dataPath:name=>'/auto/'+name,
  readFile:path=>data.get(path),
  cancelHelpers:which=>cancelled.push(which),deleteDataPath:path=>deleted.push(path),
  resolve:async()=>({ok:true,title:'Public recording',live:false,duration:120,
   quality:'720p',formats:[],mediaURL:'https://media.example/stream.m3u8'}),
  runHelper:(name,args)=>{
   calls.push({name,args});
   if(name==='acquire')return new Promise(resolve=>acquire=resolve);
   if(name==='replay')return new Promise(resolve=>finishImport=()=>resolve({ok:true,indexPath:args.at(-1)+'/index.json'}));
   throw Error('Unexpected helper');
  }
 };
 const controller=start(host,{variant:'unified'},services);
 return{source,hooks,events,side,menus,deleted,cancelled,calls,data,services,controller,
  resolveAcquisition:response=>acquire(response),resolveImport:()=>finishImport()};
}

const wait=()=>new Promise(resolve=>setTimeout(resolve,10));

test('opening a public Twitch VOD automatically acquires its original chat and displays replay',async()=>{
 const f=fixture();
 await f.hooks.on_load(()=>{});
 f.events['iina.file-loaded'](f.source.url);
 assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].name,'acquire');
 assert.deepEqual(f.calls[0].args.slice(0,3),['--url',f.source.url,'--output']);
 const download=f.calls[0].args[3];
 assert.equal(f.controller.snapshot().chat.state,'fetching');
 const index={version:1,provider:'twitch',sourceId:f.source.id,title:'Public VOD chat',count:1,
  timeline:{unit:'seconds',availableStart:0,availableEnd:0},chunks:[{file:'chunk-000000.json',start:0,end:0,count:1}]};
 // A test helper can derive the normalized output from the import call.
 f.resolveAcquisition({ok:true,path:download+'/replay.jsonl',window:{requested:0,start:0,end:80,hasMore:true}});
 await wait();
 assert.equal(f.calls[1].name,'replay');
 const normalized=f.calls[1].args.at(-1);
 f.data.set(normalized+'/index.json',JSON.stringify(index));
 f.data.set(normalized+'/chunk-000000.json',JSON.stringify([{id:'x',time:0,author:'Viewer',text:'Hi from replay',color:'#ff0000',badges:[],kind:'message'}]));
 f.resolveImport();
 await wait();
 assert.equal(f.controller.snapshot().chat.mode,'replay');
 assert.equal(f.controller.snapshot().chat.count,1);
 assert.equal(f.controller.snapshot().messages[0].text,'Hi from replay');
 assert.ok(f.deleted.includes(download));
 f.events['iina.file-loaded'](f.source.url);
 assert.equal(f.calls.filter(c=>c.name==='acquire').length,1,'quality reload never redownloads');
 f.events['iina.window-will-close']();
});

test('explicit Off during automatic acquisition cancels and fences late result',async()=>{
 const f=fixture();
 await f.hooks.on_load(()=>{});
 f.events['iina.file-loaded'](f.source.url);
 const path=f.calls[0].args[3];
 f.controller.chatOff();
 f.resolveAcquisition({ok:true,path:path+'/replay.jsonl'});
 await wait();
 assert.equal(f.controller.snapshot().chat.mode,'off');
 assert.equal(f.calls.length,1,'no archive is imported after Off');
 assert.ok(f.deleted.includes(path));
 assert.ok(f.cancelled.some(x=>x.includes('acquire')));
 f.events['iina.window-will-close']();
});

test('persisted Off disables automatic retrieval, but manual Fetch remains possible',async()=>{
 const f=fixture({chatEnabled:false});
 await f.hooks.on_load(()=>{});
 f.events['iina.file-loaded'](f.source.url);
 assert.equal(f.calls.length,0);
 assert.ok(f.menus.some(m=>m.name==='Import Chat Archive…'));
 f.side['fetch-replay']();
 assert.equal(f.calls.length,1);
 assert.equal(f.controller.snapshot().chat.state,'fetching');
 const path=f.calls[0].args[3];
 f.resolveAcquisition({ok:false,error:{message:'No VOD chat available'}});
 await wait();
 assert.equal(f.controller.snapshot().chat.state,'unavailable');
 assert.match(f.controller.snapshot().chat.error,/No VOD chat/);
 f.events['iina.window-will-close']();
});
