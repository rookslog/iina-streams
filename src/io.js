"use strict";
let embedded=null;
try{embedded=require('./embedded-helpers.js');}catch(_){/* the embedded helpers are optional; without them the on-disk helpers are used */}
function create(host){
 const python=host.utils.fileInPath('/opt/homebrew/bin/python3')?'/opt/homebrew/bin/python3':'/usr/bin/python3';
 const active=new Map();
 function dataPath(name){return host.utils.resolvePath('@data/'+name);}
 function materialize(name){
  const helper=embedded&&embedded[name];
  if(helper){
   const path='@data/'+name+'-'+helper.digest+'.py';
   if(!host.file.exists(path)||host.file.read(path)!==helper.source)host.file.write(path,helper.source);
   return host.utils.resolvePath(path);
  }
  const devSourcePath='helpers/'+name+'.py';
  if(host.file.exists(devSourcePath)){
   const source=host.file.read(devSourcePath);
   const path='@data/'+name+'-dev.py';
   if(!host.file.exists(path)||host.file.read(path)!==source)host.file.write(path,source);
   return host.utils.resolvePath(path);
  }
  throw Error('This helper is unavailable in the package.');
 }
 async function runHelper(name,args){
  if(!['media','replay','acquire'].includes(name))throw Error('Unsupported helper.');
  const path=materialize(name),runner=materialize('runner');
  const token='cancel-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'.flag';
  const marker='@data/'+token;active.set(token,{name,marker});
  try{
   const result=await host.utils.exec(python,[runner,'--cancel-file',dataPath(token),'--script',path,'--'].concat(args));
   const text=String(result.stdout||'');if(text.length>8*1024*1024)throw Error('The helper response was too large.');
   let parsed;try{parsed=JSON.parse(text);}catch(_){throw Error('The source helper could not complete.');}
   if(!parsed||typeof parsed.ok!=='boolean')throw Error('The source helper returned an invalid response.');
   return parsed;
  }finally{active.delete(token);try{if(host.file.exists(marker))host.file.delete(marker);}catch(_){/* a stale cancel marker is harmless; the helper is already finished */}}
 }
 function cancelHelpers(kinds){let count=0;for(const item of active.values())if(!kinds||kinds.includes(item.name)){try{host.file.write(item.marker,'cancel');count++;}catch(_){/* a helper whose marker cannot be written is simply not counted as cancelled */}}return count;}
 // Any failure means the path was not deleted; false tells the caller so.
 function deleteDataPath(path){try{const base=dataPath('').replace(/\/+$/,'')+'/';if(typeof path!=='string'||!path.startsWith(base)||!/^(?:replay|download)-[A-Za-z0-9_-]+$/.test(path.slice(base.length)))return false;if(host.file.exists(path))host.file.delete(path);return true;}catch(_){return false;}}
 // Settings kept in memory for this session, or null. They are held when settings.json was unreadable and
 // no copy of it could be kept: settings.json is then the only copy, so it is never overwritten
 // (v0.5.5 review r1 #11).
 let heldSettings=null;
 // Keeps a copy of unreadable settings text. True only when the copy reads back with the exact text.
 function keepCorruptSettings(text){
  const path='@data/settings.json.corrupt-'+Date.now();
  let kept=false;
  try{
   host.file.write(path,text);
   kept=host.file.exists(path)&&host.file.read(path)===text;
  }catch(_){/* kept stays false, so the caller holds settings in memory and leaves settings.json alone */}
  if(kept)host.console.log('Streams: settings.json was unreadable; kept a copy and used defaults');
  else host.console.log('Streams: settings-backup-failed; settings.json was unreadable and is left as is');
  return kept;
 }
 function readSettings(){
  if(heldSettings!==null)return Object.assign({},heldSettings);
  if(!host.file.exists('@data/settings.json'))return{};
  let text=null;
  try{text=host.file.read('@data/settings.json');}catch(_){/* text stays null and is handled as unreadable below */}
  // The file exists but gave no text, so no copy can be kept: hold settings rather than overwrite it.
  if(typeof text!=='string'){
   heldSettings={};
   host.console.log('Streams: settings-backup-failed; settings.json could not be read and is left as is');
   return{};
  }
  try{
   return JSON.parse(text);
  }catch(_){
   if(!keepCorruptSettings(text))heldSettings={};
   return{};
  }
 }
 function saveSettings(value){
  if(heldSettings!==null){
   heldSettings=Object.assign({},value);
   return;
  }
  host.file.write('@data/settings.json',JSON.stringify(value));
 }
 return{runHelper,cancelHelpers,deleteDataPath,activeHelpers:()=>Array.from(active.values()).map(x=>x.name),dataPath,readSettings,saveSettings,readFile:path=>host.file.read(path),resolve:(source,quality)=>runHelper('media',['resolve','--url',source.url,'--quality',quality])};
}
module.exports={create};
