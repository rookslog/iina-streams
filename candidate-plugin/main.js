"use strict";
const config=require('./config.js');
const services=require('./src/io.js').create(iina);
if(config.qa){
 const events=[];
 services.trace=(phase,data)=>{events.push(Object.assign({phase,time:new Date().toISOString()},data||{}));if(events.length>300)events.shift();iina.file.write('@data/qa-events.json',JSON.stringify(events));};
}
const controller=require('./src/player.js').start(iina,config,services);
if(config.qa&&controller)require('./qa-harness.js').run(iina,controller,config.qa,services);
