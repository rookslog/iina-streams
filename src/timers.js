"use strict";

// IINA 1.5.1 keeps fired one-shot timers in its native registry until cleared.
// Inject the owning JS context's timer functions; never capture another VM's.
function create(nativeSetTimeout,nativeClearTimeout){
 const pending=new Map();
 function setTimeout(callback,delay){
  const entry={id:null,active:true};
  entry.id=nativeSetTimeout(()=>{
   pending.delete(entry.id);
   // Also clears a late native registration after cancellation.
   nativeClearTimeout(entry.id);
   if(!entry.active)return;
   entry.active=false;
   return callback();
  },delay);
  pending.set(entry.id,entry);
  return entry.id;
 }
 function clearTimeout(id){
  const entry=pending.get(id);
  if(!entry)return;
  entry.active=false;pending.delete(id);nativeClearTimeout(id);
 }
 function clearAll(){for(const id of Array.from(pending.keys()))clearTimeout(id);}
 return{setTimeout,clearTimeout,clearAll};
}
module.exports={create};
