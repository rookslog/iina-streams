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
//   - wait(promise, abandon): code after an await, which then starts with continues(value, abandon);
//   - signal: the activation's loss signal, {lost()}, for work that runs outside the controller (src/resolve.js).
// L4: authority.onLoad(body) is the controller's on_load hook. It owns IINA's `next` and runs it exactly once (see
// holdLoad), so no path through the body has to remember to continue the load.
// L1: each of these checks the activation itself, so no call site has to remember a combination of flags.
// L2: end() is one-way. An activation that ended never becomes current again. Since D-033 (v0.5.5) the controller
// begins only one (src/player.js); its state lives on the activation record (L3).
//
// end() makes no main-thread host call, so a loss can be recorded on mpv's hook queue. Its only host call is
// IINA's `next` for a load bound to the ended activation (holdLoad), which the hook queue already calls. dispose()
// clears the activation's timers and listeners, so it runs on a main-thread turn. hostEvent is IINA's `event` API
// (on, off).
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
  // Lost once the activation is no longer current. One-way (L2): an ended activation never becomes current again.
  activation.signal={lost:()=>!activation.isCurrent()};
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
  // L5 after an await: the code after `await activation.wait(...)` runs a promise job after the wait settled, so
  // the activation can have ended in between. Every such continuation, and every catch block it can resume in,
  // starts with `if(!act.continues(value,abandon))return;` (the scan in tests/class-l-scan.test.js enforces it).
  // True while the activation is current; otherwise false, after handing `value` to `abandon` as wait does for a
  // late outcome, so the continuation can still release what it holds.
  activation.continues=(value,abandon)=>{
   if(activation.isCurrent())return true;
   if(abandon){
    try{
     abandon(value,null);
    }catch(_){}
   }
   return false;
  };
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

 // Held on_load hooks that have not continued yet.
 const holds=new Set();

 // L4: one held load. `next` runs exactly once, on the first of:
 //   - release(): the body says the load may continue;
 //   - the end of the activation it is bound to (bind), or binding to an activation that is not current;
 //   - the window closing.
 // `done` settles when it has run.
 function holdLoad(next){
  let markDone;
  const load={released:false,activation:null,done:new Promise(resolve=>{
   markDone=resolve;
  })};
  load.release=()=>{
   if(load.released)return;
   load.released=true;
   holds.delete(load);
   markDone();
   // A throwing host continuation must not stop end() or close() from releasing the other holds.
   try{
    if(typeof next==='function')next();
   }catch(_){}
  };
  load.bind=activation=>{
   load.activation=activation;
   if(!activation.isCurrent())load.release();
  };
  holds.add(load);
  return load;
 }

 function releaseHolds(matches){
  for(const load of Array.from(holds)){
   if(matches(load))load.release();
  }
 }

 const authority={
  current:()=>closed?null:current,
  isClosed:()=>closed,
  // Whether a loss is recorded and not yet cleaned up, with no activation since: the window acts for nothing.
  releasing:()=>current===null&&undisposed.size>0,
  begin(){
   if(closed)return null;
   authority.end();
   current=createActivation(++serial);
   return current;
  },
  // No main-thread host call (see above). Returns the activation that ended, or null if none was current. Loads
  // bound to it continue.
  end(){
   const ended=current;
   current=null;
   if(!ended)return null;
   ended.ended=true;
   undisposed.add(ended);
   releaseHolds(load=>load.activation===ended);
   return ended;
  },
  // Every held load continues.
  close(){
   const ended=authority.end();
   closed=true;
   releaseHolds(()=>true);
   return ended;
  },
  // The on_load hook for body(load): body runs at once, on the hook, and the load continues exactly once (see
  // holdLoad): at the latest when body's promise settles, fulfilled or rejected. The hook is an async function
  // because IINA v1.5.1 holds a load only for one (MPVHookValue.call); it settles when the load has continued.
  onLoad(body){
   return async function onLoad(next){
    const load=holdLoad(next);
    let settled;
    try{
     settled=Promise.resolve(body(load));
    }catch(error){
     settled=Promise.reject(error);
    }
    settled.then(()=>load.release(),()=>load.release());
    await load.done;
   };
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
