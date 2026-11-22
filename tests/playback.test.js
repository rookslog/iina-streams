"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const {Playback}=require('../src/playback.js');
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function make(){
  const jobs=[],replacements=[],states=[],timers=[];
  const p=new Playback({source:{kind:'twitch-vod',url:'https://www.twitch.tv/videos/123'},resolve:q=>{const d=deferred();jobs.push({q,...d});return d.promise;},replace:(r,context)=>replacements.push({r,context}),readPlayer:()=>({position:83.25,paused:true,speed:1.5}),onState:s=>states.push(s),setTimer:fn=>{timers.push(fn);return fn;},clearTimer:()=>{}});
  return {p,jobs,replacements,states,timers};
}
const resolved={ok:true,quality:'360p30',mediaURL:'https://vod-secure.twitch.tv/example',formats:[{id:'360p30',label:'360p'},{id:'720p60',label:'720p60'}],live:false,title:'A recording'};
test('quality commits only for the matching loaded generation and preserves VOD state',async()=>{
 const r=make();r.p.adopt(resolved);r.p.loaded(0);const operation=r.p.change('720p60');
 r.jobs[0].resolve({...resolved,quality:'720p60'});await operation;
 assert.equal(r.p.snapshot().quality,'360p30');assert.equal(r.p.snapshot().busy,true);
 assert.deepEqual(r.replacements[0].context,{generation:1,position:83.25,paused:true,speed:1.5});
 r.p.loaded(0);assert.equal(r.p.snapshot().quality,'360p30');
 r.p.loaded(1);assert.equal(r.p.snapshot().quality,'720p60');assert.equal(r.p.snapshot().busy,false);
});
test('close fences an outstanding resolution and prevents resurrection',async()=>{
 const r=make();r.p.adopt(resolved);r.p.loaded(0);const op=r.p.change('720p60');r.p.close();r.jobs[0].resolve({...resolved,quality:'720p60'});await op;
 assert.equal(r.replacements.length,0);assert.equal(r.p.snapshot().phase,'closed');
});
test('invalid or rapid quality requests cannot spawn concurrent replacements',async()=>{
 const r=make();r.p.adopt(resolved);r.p.loaded(0);
 assert.equal(await r.p.change('720p60;attack'),false);assert.equal(r.jobs.length,0);
 const op=r.p.change('720p60');assert.equal(await r.p.change('360p30'),false);assert.equal(r.jobs.length,1);
 r.jobs[0].resolve({ok:false,error:{message:'Channel unavailable'}});await op;
 assert.equal(r.replacements.length,0);assert.equal(r.p.snapshot().quality,'360p30');assert.equal(r.p.snapshot().busy,false);
});
test('timeout does not falsely commit quality; a late load remains explicitly unconfirmed',async()=>{
 const r=make();r.p.adopt(resolved);r.p.loaded(0);const op=r.p.change('720p60');r.jobs[0].resolve({...resolved,quality:'720p60'});await op;r.timers.at(-1)();r.p.loaded(1);
 assert.equal(r.p.snapshot().quality,'360p30');assert.equal(r.p.snapshot().busy,false);assert.match(r.p.snapshot().error,/finish|confirm/i);
});
test('an unconfirmed change can retry the last reported quality and fences the previous load',async()=>{
 const r=make();r.p.adopt(resolved);r.p.loaded(0);const first=r.p.change('720p60');r.jobs[0].resolve({...resolved,quality:'720p60'});await first;r.timers.at(-1)();
 const retry=r.p.change('360p30');assert.equal(r.jobs.length,2);r.jobs[1].resolve(resolved);await retry;
 assert.equal(r.p.loaded(1),false);assert.equal(r.p.loaded(2),true);assert.equal(r.p.snapshot().phase,'playing');
});
