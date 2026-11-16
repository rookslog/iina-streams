'use strict';
// All records and archives in this file are synthetic; tests do not use network or IINA.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const modulePath=path.join(__dirname,'../src/replay.js');
const Replay=fs.existsSync(modulePath)?require(modulePath).Replay:undefined;
function row(id,time,extra={}){return Object.assign({id:String(id),time,author:'Synthetic',text:String(id),color:'',badges:[],kind:'message'},extra);}
function setup(groups){
 assert.equal(typeof Replay,'function','Replay must implement the bounded playback window contract');
 const chunks=groups.map((g,i)=>({file:'chunk-'+String(i).padStart(6,'0')+'.json',start:g[0].time,end:g[g.length-1].time,count:g.length}));
 const index={version:1,provider:'generic',sourceId:'synthetic',title:'Synthetic archive',count:groups.reduce((n,g)=>n+g.length,0),chunks};
 const calls=[];const replay=new Replay(index,name=>{calls.push(name);return groups[chunks.findIndex(x=>x.file===name)];});
 return {replay,index,calls,groups};
}
test('actual player position and positive offsets choose an inclusive window with no future messages',()=>{
 const {replay}=setup([[row('a',0),row('b',1),row('c',120),row('d',120.1)]]);
 assert.deepEqual(replay.windowAt(120).map(x=>x.id),['a','b','c']);
 assert.deepEqual(replay.windowAt(119,{offsetSeconds:1,windowSeconds:1}).map(x=>x.id),['c']);
 assert.deepEqual(replay.windowAt(1,{offsetSeconds:-2}),[]);
 assert.deepEqual(replay.windowAt(NaN),[]);
});
test('backward seek and repeated paused position recompute history without replaying elapsed time',()=>{
 const {replay}=setup([[row('a',0),row('b',10)],[row('c',20),row('d',30)]]);
 assert.deepEqual(replay.windowAt(30,{windowSeconds:10}).map(x=>x.id),['c','d']);
 assert.deepEqual(replay.windowAt(10,{windowSeconds:10}).map(x=>x.id),['a','b']);
 assert.deepEqual(replay.windowAt(10,{windowSeconds:10}).map(x=>x.id),['a','b']);
 assert.deepEqual(replay.windowAt(25,{windowSeconds:10}).map(x=>x.id),['c']);
});
test('a burst spanning chunk boundaries returns the newest limit in stable order',()=>{
 const {replay}=setup([Array.from({length:100},(_,i)=>row(i,5)),Array.from({length:100},(_,i)=>row(i+100,5)),Array.from({length:50},(_,i)=>row(i+200,5))]);
 const actual=replay.windowAt(5,{limit:200});
 assert.equal(actual.length,200);assert.equal(actual[0].id,'50');assert.equal(actual.at(-1).id,'249');
 assert.deepEqual(replay.windowAt(4),[]);
});
test('historical removal is effective at its time and a backward seek restores earlier visibility',()=>{
 const {replay}=setup([[row('a',1,{deletedAt:5}),row('b',2)]]);
 assert.deepEqual(replay.windowAt(4).map(x=>x.id),['a','b']);
 assert.deepEqual(replay.windowAt(5).map(x=>x.id),['b']);
 assert.deepEqual(replay.windowAt(3).map(x=>x.id),['a','b']);
});
test('only two chunks remain cached and clear releases retained data',()=>{
 const {replay,calls}=setup([[row('a',0)],[row('b',10)],[row('c',20)]]);
 for(const t of [0,10,20,10,0])replay.windowAt(t,{windowSeconds:0});
 assert.equal(calls.length,4,'first chunk must be re-read after two newer distinct chunks');
 replay.clear();replay.windowAt(0,{windowSeconds:0});assert.equal(calls.length,5);
});
test('unsafe chunk paths and malformed chunk order fail before they can render',()=>{
 const s=setup([[row('a',0),row('b',1)]]);let reads=0;
 assert.throws(()=>new Replay({...s.index,chunks:[{file:'../secret',start:0,end:1,count:2}]},()=>{reads++;return[];}),/index|path/i);
 assert.equal(reads,0);
 const bad=new Replay(s.index,()=>[row('b',1),row('a',0)]);
 assert.throws(()=>bad.windowAt(1),/chunk/i);
});
test('oversized and inconsistent chunks never enter the render model',()=>{
 const s=setup([[row('a',0)]]);
 for(const data of [Array.from({length:1001},(_,i)=>row(i,0)),[row('a',0,{text:'x'.repeat(1048577)})],'{"not":"array"}',[row('a',Infinity)]]){
  const bad=new Replay(s.index,()=>data);assert.throws(()=>bad.windowAt(1),/chunk/i);
 }
});
test('returned text remains literal and caller mutations cannot poison cached history',()=>{
 const {replay}=setup([[row('a',0,{text:'<img src=x onerror=attack()>',badges:['moderator']})]]);
 const first=replay.windowAt(0);assert.equal(first[0].text,'<img src=x onerror=attack()>');
 first[0].text='mutated';first[0].badges.push('bad');
 const second=replay.windowAt(0);assert.equal(second[0].text,'<img src=x onerror=attack()>');assert.deepEqual(second[0].badges,['moderator']);
});
