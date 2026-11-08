"use strict";
const config=require('./config.js');
const services=require('./src/io.js').create(iina);
if(config.qa){
 const events=[];
 const identity=require('./src/source.js').fromLabel(iina.global.getLabel()||'');
 const traceName=identity?'qa-events-'+identity.source.id+'.json':'qa-events-local.json';
 services.trace=(phase,data)=>{events.push(Object.assign({phase,time:new Date().toISOString()},data||{}));if(events.length>300)events.shift();const text=JSON.stringify(events);iina.file.write('@data/'+traceName,text);iina.file.write('@data/qa-events.json',text);};
}
const controller=require('./src/player.js').start(iina,config,services);
if(config.qa&&controller)require('./qa-harness.js').run(iina,controller,config.qa,services);
