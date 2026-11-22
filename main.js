"use strict";
const config=require('./config.js');
const {listen}=require('./src/listeners.js');
const services=require('./src/io.js').create(iina);
services.resolve=require('./src/resolve.js').createResolver({
 resolveTwitch:require('./src/twitch-playback.js').resolveTwitch,
 http:iina.http,
 helperResolve:services.resolve.bind(services),
 log:(...args)=>iina.console.log(args.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' ')),
 now:()=>Date.now()
});

if(config.qa){
 const events=[];
 const identity=require('./src/source.js').fromLabel(iina.global.getLabel()||'');
 const traceName=identity?'qa-events-'+identity.source.id+'.json':'qa-events-local.json';
 services.trace=(phase,data)=>{
  events.push(Object.assign({phase,time:new Date().toISOString()},data||{}));
  if(events.length>300)events.shift();
  const text=JSON.stringify(events);
  iina.file.write('@data/'+traceName,text);
  iina.file.write('@data/qa-events.json',text);
 };
}

if(config.qa){
 // #56 probe receiver: record which bare label global's string-target postMessage reached.
 listen(iina.global,'global','qa-label-probe',data=>{
  let parsed=data;
  try{
   if(typeof data==='string')parsed=JSON.parse(data);
  // A malformed probe is recorded as unparsed; it carries no user data.
  }catch(_){
   parsed={unparsed:true};
  }
  iina.file.write('@data/qa-label-probe.json',JSON.stringify({received:parsed,time:new Date().toISOString()}));
 });
}

const controller=require('./src/player.js').start(iina,config,services);
if(config.qa&&controller)require('./qa-harness.js').run(iina,controller,config.qa,services);
