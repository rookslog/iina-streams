"use strict";
const {create:createTimers}=require('./timers.js');

// Controller authority (docs/design/V055-CLASS-REPAIR-2026-11-22.md, class L).
//
// A window has at most one current activation: the period in which one load of the window's source speaks for
// it. Everything asynchronous that an activation starts is created through the activation, so it runs only
// while that activation is current and the window is open:
//   - setTimeout(fn, ms): a timer;
//   - listen(name, fn): a host listener, removed by dispose;
//   - guard(fn): a callback that a host or page calls later;
//   - wait(promise, abandon): code after an await.
// L1: each of these checks the activation itself, so no call site has to remember a combination of flags.
// L2: end() is one-way. An activation that ended never becomes current again; the next load of the source
// begins a new one, with its own state (L3: the controller keeps that state on the activation record).
//
// end() is pure JS, so a loss can be recorded on mpv's hook queue. dispose() clears the activation's timers and
// listeners, so it runs on a main-thread turn. hostEvent is IINA's `event` API (on, off).
function createAuthority(nativeSetTimeout,nativeClearTimeout,hostEvent){
 const nativeOn=(name,fn)=>hostEvent.on(name,fn);
 const nativeOff=(name,id)=>hostEvent.off(name,id);
 let current=null;
 let closed=false;
 let serial=0;
 // Activations that ended and have not been disposed yet.
 const undisposed=new Set();
 const windowTimers=createTimers(nativeSetTimeout,nativeClearTimeout);

 function createActivation(id){
  const timers=createTimers(nativeSetTimeout,nativeClearTimeout);
  const listeners=[];
  const activation={id,ended:false,disposed:false};
  activation.isCurrent=()=>current===activation&&!closed;
  activation.setTimeout=(fn,ms)=>timers.setTimeout(()=>{
   if(activation.isCurrent())fn();
  },ms);
  activation.clearTimeout=id=>timers.clearTimeout(id);
  activation.guard=fn=>(...args)=>{
   if(!activation.isCurrent())return undefined;
   return fn(...args);
  };
  // A host listener (event.on) whose callback runs only while the activation is current. Returns its id.
  activation.listen=(name,fn)=>{
   const id=nativeOn(name,activation.guard(fn));
   listeners.push([name,id]);
   return id;
  };
  activation.unlisten=(name,id)=>{
   const index=listeners.findIndex(entry=>entry[0]===name&&entry[1]===id);
   if(index>=0)listeners.splice(index,1);
   nativeOff(name,id);
  };
  // Settles with `promise` only while the activation is current; otherwise it never settles, and `abandon`
  // (if given) receives the late outcome: abandon(value, null) or abandon(undefined, error). An abandoned
  // continuation can then still release what it holds (an on_load hook's next, a helper's output).
  activation.wait=(promise,abandon)=>new Promise((resolve,reject)=>{
   const late=(value,error)=>{
    if(!abandon)return;
    try{
     abandon(value,error);
    }catch(_){}
   };
   Promise.resolve(promise).then(value=>{
    if(activation.isCurrent())resolve(value);
    else late(value,null);
   },error=>{
    if(activation.isCurrent())reject(error);
    else late(undefined,error);
   });
  });
  activation.dispose=()=>{
   if(activation.disposed)return;
   activation.disposed=true;
   undisposed.delete(activation);
   timers.clearAll();
   for(const [name,id] of listeners.splice(0)){
    try{
     nativeOff(name,id);
    }catch(_){}
   }
  };
  return activation;
 }

 const authority={
  current:()=>closed?null:current,
  isClosed:()=>closed,
  // Activations that ended and have not been disposed, oldest first.
  undisposed:()=>Array.from(undisposed),
  // Whether a loss is recorded and not yet cleaned up, with no activation since: the window acts for nothing.
  releasing:()=>current===null&&undisposed.size>0,
  begin(){
   if(closed)return null;
   authority.end();
   current=createActivation(++serial);
   return current;
  },
  // Pure JS. Returns the activation that ended, or null if none was current.
  end(){
   const ended=current;
   current=null;
   if(!ended)return null;
   ended.ended=true;
   undisposed.add(ended);
   return ended;
  },
  close(){
   const ended=authority.end();
   closed=true;
   return ended;
  },
  // A window-scoped turn: runs on a later main-thread turn unless the window has closed by then.
  windowTurn(fn){
   return windowTimers.setTimeout(()=>{
    if(!closed)fn();
   },0);
  },
  clearWindowTimers(){
   windowTimers.clearAll();
  }
 };
 return authority;
}

module.exports={createAuthority};
