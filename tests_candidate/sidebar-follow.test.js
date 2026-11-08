'use strict';
// Synthetic DOM geometry reproduces hidden-panel layout and queued scroll events.
// Native WKWebView paint remains a separate acceptance check.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'../candidate-plugin/ui');

function setup(){
 const callbacks={},posts=[],frames=new Map(),allFrames=new Map(),scrollEvents=[];
 const windowEvents={},documentEvents={},elements={};let nextFrame=0,top=0;
 function element(id=''){
  return{id,hidden:false,disabled:false,value:'',children:[],dataset:{},events:{},attributes:{},_text:'',
   classList:{toggle(){}},style:{setProperty(){}},scrollTop:0,clientHeight:200,scrollHeight:0,
   addEventListener(name,fn){this.events[name]=fn;},setAttribute(name,value){this.attributes[name]=value;},
   appendChild(child){this.children.push(child);},append(...children){this.children.push(...children);},
   replaceChildren(){this.children=[];},focus(){document.activeElement=this;},click(){this.events.click?.({target:this});},
   get textContent(){return this._text+this.children.map(child=>child.textContent).join('');},
   set textContent(value){this._text=String(value);this.children=[];}};
 }
 for(const match of fs.readFileSync(path.join(root,'sidebar.html'),'utf8').matchAll(/\bid="([^"]+)"/g))elements[match[1]]=element(match[1]);
 const document={body:element('body'),documentElement:element('html'),activeElement:null,hidden:false,
  getElementById:id=>elements[id],createElement:()=>element(),addEventListener:(name,fn)=>documentEvents[name]=fn};
 const visible=()=>!elements.messages.hidden&&!elements['chat-panel'].hidden;
 Object.defineProperties(elements.messages,{
  clientHeight:{get:()=>visible()?200:0},
  scrollHeight:{get:()=>visible()?elements.messages.children.length*40:0},
  scrollTop:{get:()=>top,set:value=>{top=Math.max(0,Math.min(Number(value)||0,Math.max(0,elements.messages.scrollHeight-elements.messages.clientHeight)));scrollEvents.push(()=>elements.messages.events.scroll?.({target:elements.messages}));}}
 });
 const requestAnimationFrame=fn=>{const id=++nextFrame;frames.set(id,fn);allFrames.set(id,fn);return id;};
 const cancelAnimationFrame=id=>frames.delete(id);
 const window={addEventListener:(name,fn)=>windowEvents[name]=fn,requestAnimationFrame,cancelAnimationFrame};
 const iina={onMessage:(name,fn)=>callbacks[name]=fn,postMessage:(name,data)=>posts.push({name,data})};
 vm.runInNewContext(fs.readFileSync(path.join(root,'sidebar.js'),'utf8'),
  {document,window,iina,requestAnimationFrame,cancelAnimationFrame},{filename:'candidate-sidebar.js'});
 return{elements,frames,allFrames,posts,windowEvents,documentEvents,
  state(value){callbacks.state({encoded:encodeURIComponent(JSON.stringify(value))});},
  inspect(){callbacks['qa-action']({encoded:encodeURIComponent(JSON.stringify({name:'inspect'}))});return posts.at(-1).data;},
  scroll(){elements.messages.events.scroll?.({target:elements.messages});},
  flushScroll(){for(const fn of scrollEvents.splice(0))fn();},
  flushFrames(){for(const [id,fn] of [...frames]){frames.delete(id);fn();}},
  userScrollTo(value,kind='wheel'){
   elements.messages.events[kind]?.(kind==='keydown'?{key:'PageUp',target:elements.messages}:{deltaY:-100,target:elements.messages});
   top=value;elements.messages.events.scroll?.({target:elements.messages});
  },
  click:id=>elements[id].click(),
  maxTop:()=>Math.max(0,elements.messages.scrollHeight-elements.messages.clientHeight)
 };
}

function state(extra={}){
 return{variant:'focus',source:{kind:'youtube',provider:'youtube',id:'synthetic'},title:'Synthetic archive',
  live:false,formats:[],quality:'auto720',phase:'playing',busy:false,error:'',
  auth:{phase:'off'},chat:{mode:'replay',state:'ready',available:true,count:40,sourceName:'Synthetic',offset:0,error:''},
  view:{presentation:'sidebar',fontSize:14,opacity:.64,lines:6,x:1,y:0,density:'comfortable',editing:false},
  messages:Array.from({length:40},(_,i)=>({id:String(i),time:i*3,author:'Synthetic',text:'message '+i})),qa:true,...extra};
}

test('Focus reveal follows latest after hidden import, seek and programmatic scroll events',()=>{
 const f=setup();
 f.state(state({view:{...state().view,presentation:'overlay'}}));
 f.state(state()); // Sidebar selected while Playback tab still hides the message list.
 assert.equal(f.elements['chat-panel'].hidden,true);
 f.scroll();f.flushScroll(); // Hidden layout must not become a user scroll-up decision.
 f.click('chat-tab');
 assert.equal(f.elements.messages.scrollTop,f.maxTop(),'repair the viewport on reveal without waiting for an animation frame');
 f.flushScroll();f.flushFrames();f.flushScroll();
 assert.equal(f.elements.messages.scrollTop,f.maxTop());
 assert.equal(f.elements.follow.hidden,true);
 assert.equal(f.frames.size,0);
});

test('hidden or queued layout scroll cannot opt out of following',()=>{
 const f=setup();f.state(state());f.scroll();f.click('chat-tab');
 f.scroll();f.flushScroll();f.flushFrames();f.flushScroll();
 const next=state();next.messages.push({id:'new',time:120,author:'Synthetic',text:'new message'});
 f.state(next);f.flushScroll();f.flushFrames();f.flushScroll();
 assert.equal(f.elements.messages.scrollTop,f.maxTop());assert.equal(f.elements.follow.hidden,true);
});

test('explicit scroll-up remains at its position across hidden updates and reveal',()=>{
 const f=setup();f.state(state());f.click('chat-tab');f.flushFrames();f.flushScroll();
 f.userScrollTo(400);assert.equal(f.elements.follow.hidden,false);
 f.click('playback-tab');f.scroll();
 const next=state();next.messages.push({id:'new',time:120,author:'Synthetic',text:'new message'});
 f.state(next);f.flushFrames();f.flushScroll();f.click('chat-tab');f.flushFrames();f.flushScroll();
 assert.equal(f.elements.messages.scrollTop,400);assert.equal(f.elements.follow.hidden,false);
 f.click('follow');f.flushFrames();f.flushScroll();
 assert.equal(f.elements.messages.scrollTop,f.maxTop());assert.equal(f.elements.follow.hidden,true);
});

test('a keyboard scroll-up cancels a pending automatic correction',()=>{
 const f=setup();f.state(state());f.click('chat-tab');
 f.userScrollTo(300,'keydown');f.flushScroll();f.flushFrames();f.flushScroll();
 assert.equal(f.elements.messages.scrollTop,300);assert.equal(f.elements.follow.hidden,false);
});

test('layout work coalesces and pagehide cancels a late correction',()=>{
 const f=setup();f.state(state());f.click('chat-tab');
 for(let i=0;i<10;i++)f.state(state());
 assert.equal(f.frames.size,1,'at most one bounded layout callback');
 const late=[...f.frames.values()][0];
 f.windowEvents.pagehide();assert.equal(f.frames.size,0);
 f.userScrollTo(250);late();
 assert.equal(f.elements.messages.scrollTop,250);
});

test('bounded QA rendered-message inspection remains available',()=>{
 const f=setup();f.state(state());f.click('chat-tab');
 const result=f.inspect();
 assert.equal(result.messageCount,40);assert.equal(result.renderedMessages.length,12);
 assert.ok(result.renderedMessages.at(-1).endsWith('Syntheticmessage 39'));
});
