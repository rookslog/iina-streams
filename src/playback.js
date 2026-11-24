"use strict";
class Playback {
 // One Playback per controller activation (src/authority.js). Its resolve, timers and replace are the
 // activation's, so a change from an activation that has ended never continues. options.firstGeneration
 // continues the previous activation's generations, so a load marker is never reused. `fresh` is the generation
 // of the latest unstaged load (not a change's replacement), which loaded() confirms (set by the controller).
 constructor(options){
  this.o=options;this.pending=null;this.deadline=null;this.closed=false;this.disabled=false;
  this.generation=options.firstGeneration||0;this.fresh=0;
  this.data={phase:'loading',quality:'auto720',formats:[],busy:false,error:'',title:'',live:false,duration:0};
 }
 snapshot(){return Object.assign({},this.data,{formats:this.data.formats.map(f=>({id:f.id,label:f.label}))});}
 emit(){if(this.o.onState)this.o.onState(this.snapshot());}
 adopt(result){
  this.data.quality=result.quality||'auto720';this.data.formats=(result.formats||[]).slice(0,100);
  this.data.title=String(result.title||'').slice(0,300);this.data.live=!!result.live;this.data.duration=Number(result.duration)||0;this.data.phase='loading';this.emit();
 }
 cancelDeadline(){if(this.deadline!==null){this.o.clearTimer(this.deadline);this.deadline=null;}}
 async change(quality){
  if(this.closed||this.disabled||this.data.busy||!['playing','unconfirmed','stopped'].includes(this.data.phase))return false;
  if(quality!=='auto720'&&!this.data.formats.some(f=>f.id===quality)){this.data.error='That quality is unavailable. Refresh the list.';this.emit();return false;}
  if(quality===this.data.quality&&this.data.phase==='playing')return true;
  const generation=++this.generation;this.data.busy=true;this.data.phase='resolving';this.data.error='';this.emit();
  try{
   const result=await this.o.resolve(quality);
   if(this.closed||generation!==this.generation)return false;
   if(!result||!result.ok)throw Error(result&&result.error&&result.error.message||'Could not retrieve that quality.');
   const player=this.o.readPlayer();
   const context={generation,position:result.live?0:Math.max(0,Number(player.position)||0),paused:!!player.paused,speed:Number(player.speed)||1};
   this.pending={generation,result};this.data.phase='buffering';
   this.deadline=this.o.setTimer(()=>{
    this.deadline=null;if(this.closed||!this.pending||this.pending.generation!==generation)return;
    this.pending=null;this.data.busy=false;this.data.phase='unconfirmed';this.data.error='Quality change did not finish. Reload the source or choose another quality.';this.emit();
   },25000);
   this.o.replace(result,context);this.emit();return true;
  }catch(error){
   if(this.closed||generation!==this.generation)return false;
   this.pending=null;this.cancelDeadline();this.data.busy=false;this.data.phase='playing';
   this.data.error=String(error&&error.message||'Could not retrieve that quality.').replace(/https?:\/\/\S+/g,'[address omitted]').slice(0,180);this.emit();return false;
  }
 }
 loaded(generation,freshResult){
  if(this.closed||this.disabled)return false;
  if(this.pending){
   if(generation!==this.pending.generation)return false;
   const result=this.pending.result;this.pending=null;this.cancelDeadline();this.adopt(result);this.data.busy=false;this.data.phase='playing';this.data.error='';this.emit();return true;
  }
  // An unstaged load of the source, with no change pending.
  if(generation===this.fresh){
   if(freshResult)this.adopt(freshResult);
   this.data.phase='playing';this.data.error='';this.emit();return true;
  }
  return false;
 }
 ended(){if(this.closed||this.disabled)return;if(!this.pending&&!this.data.busy){this.data.phase='stopped';this.emit();}}
 deactivate(){this.disabled=true;this.generation++;this.pending=null;this.cancelDeadline();this.data.busy=false;this.data.phase='inactive';this.emit();}
 close(){this.closed=true;this.generation++;this.pending=null;this.cancelDeadline();this.data.busy=false;this.data.phase='closed';this.emit();}
}
module.exports={Playback};
