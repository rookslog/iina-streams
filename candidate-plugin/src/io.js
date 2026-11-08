"use strict";
function create(host){
 const embedded=require('./embedded-helpers.js');
 const python=host.utils.fileInPath('/opt/homebrew/bin/python3')?'/opt/homebrew/bin/python3':'/usr/bin/python3';
 function dataPath(name){return host.utils.resolvePath('@data/'+name);}
 async function runHelper(name,args){
  const helper=embedded[name];if(!helper)throw Error('This helper is unavailable in the package.');
  const path='@data/'+name+'-'+helper.digest+'.py';
  if(!host.file.exists(path)||host.file.read(path)!==helper.source)host.file.write(path,helper.source);
  const result=await host.utils.exec(python,[host.utils.resolvePath(path)].concat(args));
  const text=String(result.stdout||'');if(text.length>8*1024*1024)throw Error('The helper response was too large.');
  let parsed;try{parsed=JSON.parse(text);}catch(_){throw Error('The source helper could not complete.');}
  if(!parsed||typeof parsed.ok!=='boolean')throw Error('The source helper returned an invalid response.');
  return parsed;
 }
 function readSettings(){try{if(host.file.exists('@data/settings.json'))return JSON.parse(host.file.read('@data/settings.json'));}catch(_){}return{};}
 function saveSettings(value){host.file.write('@data/settings.json',JSON.stringify(value));}
 return{runHelper,dataPath,readSettings,saveSettings,readFile:path=>host.file.read(path),resolve:(source,quality)=>runHelper('media',['resolve','--url',source.url,'--quality',quality])};
}
module.exports={create};
