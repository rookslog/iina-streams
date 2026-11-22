'use strict';
// Synthetic host only: these tests do not authorize or connect to Twitch.
const test=require('node:test');
const assert=require('node:assert/strict');
const Sources=require('../src/source.js');
const {start}=require('../src/player.js');
const {createIina}=require('./support/iina-shim.js');
function setup(){
 const cancelled=[],deleted=[];
 const source=Sources.parse('https://www.twitch.tv/hutchmf');
 const shim=createIina({label:Sources.label(source,'unified')});
 const host=shim.iina;
 const services={readSettings:()=>({}),dataPath:name=>'/private/data/'+name,
  cancelHelpers:kinds=>cancelled.push(kinds),deleteDataPath:path=>deleted.push(path),
  readFile:()=>JSON.stringify({version:1,count:0,chunks:[],sourceId:'',title:'Synthetic archive',timeline:{availableStart:0}})};
 return{shim,host,services,cancelled,deleted};
}
test('Connect fences pending archive import and cleans an owned late result',async()=>{
 const f=setup();let finish,output;
 f.services.runHelper=(name,args)=>{output=args[args.indexOf('--output')+1];return new Promise(resolve=>finish=resolve);};
 const controller=start(f.host,{variant:'unified'},f.services);
 await new Promise(resolve=>setTimeout(resolve,0)); // native auth binding runs after child creation
 const pending=controller.importArchive('/synthetic/archive.json');
 const cancellationsBefore=f.cancelled.length;
 f.shim.sidebar.send('connect',{clientID:'synthetic-public-client-id'});
 assert.equal(controller.snapshot().chat.mode,'live');
 finish({ok:true,indexPath:output+'/index.json'});
 assert.equal(await pending,false,'older import must not replace deliberate Connect');
 assert.equal(controller.snapshot().chat.mode,'live');
 assert.ok(f.cancelled.length>cancellationsBefore);
 assert.deepEqual(f.deleted,[output]);
 assert.ok(f.shim.global.messages('auth-connect').length);
 f.shim.emit('iina.window-will-close');
});
test('Connect fences a pending file picker before import starts',async()=>{
 const f=setup();let choose,calls=0;
 f.host.utils.chooseFile=()=>new Promise(resolve=>choose=resolve);
 f.services.runHelper=async()=>{calls++;return{ok:false,error:{message:'Synthetic'}};};
 const controller=start(f.host,{variant:'unified'},f.services);
 const pending=controller.importArchive();
 f.shim.sidebar.send('connect',{clientID:'synthetic-public-client-id'});
 choose('/synthetic/selected-late.json');
 assert.equal(await pending,false);
 assert.equal(calls,0,'late picker must not start work after Connect');
 assert.equal(controller.snapshot().chat.mode,'live');
 f.shim.emit('iina.window-will-close');
});
test('Connect keeps an already imported archive available for deliberate Resume',async()=>{
 const f=setup();f.services.runHelper=async(name,args)=>({ok:true,indexPath:args[args.indexOf('--output')+1]+'/index.json'});
 const controller=start(f.host,{variant:'unified'},f.services);
 assert.equal(await controller.importArchive('/synthetic/archive.json'),true);
 f.shim.sidebar.send('connect',{clientID:'synthetic-public-client-id'});
 assert.equal(controller.snapshot().chat.mode,'live');
 assert.equal(controller.snapshot().chat.available,true);
 controller.resumeReplay();
 assert.equal(controller.snapshot().chat.mode,'replay');
 f.shim.emit('iina.window-will-close');
});
