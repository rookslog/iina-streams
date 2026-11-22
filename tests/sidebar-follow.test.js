'use strict';
// Synthetic DOM geometry reproduces hidden-list layout and queued scroll events.
// The list is hidden on the unified path when chat is presented over the video (presentation 'overlay').
// scrollTop follows CSSOM View: 0 while the element has no layout box, clamped to the scroll range otherwise.
// Native WKWebView paint remains a separate acceptance check.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createWebViewIina}=require('./support/iina-shim.js');
const root=path.join(__dirname,'../ui');

function setup(){
 const page=createWebViewIina(),posts=page.posts,frames=new Map(),allFrames=new Map(),scrollEvents=[];
 const windowEvents={},documentEvents={},elements={};let nextFrame=0,top=0,now=1000,viewportHeight=200;
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
 const visible=()=>!elements.messages.hidden;
 const maxTop=()=>Math.max(0,elements.messages.scrollHeight-elements.messages.clientHeight);
 Object.defineProperties(elements.messages,{
  clientHeight:{get:()=>visible()?viewportHeight:0},
  scrollHeight:{get:()=>visible()?elements.messages.children.length*40:0},
  scrollTop:{get:()=>visible()?Math.min(top,maxTop()):0,set:value=>{top=Math.max(0,Math.min(Number(value)||0,Math.max(0,elements.messages.scrollHeight-elements.messages.clientHeight)));scrollEvents.push(()=>elements.messages.events.scroll?.({target:elements.messages}));}}
 });
 const requestAnimationFrame=fn=>{const id=++nextFrame;frames.set(id,fn);allFrames.set(id,fn);return id;};
 const cancelAnimationFrame=id=>frames.delete(id);
 const window={addEventListener:(name,fn)=>windowEvents[name]=fn,requestAnimationFrame,cancelAnimationFrame};
 const iina=page.iina;
 vm.runInNewContext(fs.readFileSync(path.join(root,'sidebar.js'),'utf8'),
  {document,window,iina,requestAnimationFrame,cancelAnimationFrame,Date:{now:()=>now}},{filename:'candidate-sidebar.js'});
 return{elements,frames,allFrames,posts,windowEvents,documentEvents,
  state(value){page.receiveEnvelope('state',value);},
  inspect(){page.receiveEnvelope('qa-action',{name:'inspect'});return posts.at(-1).data;},
  scroll(){elements.messages.events.scroll?.({target:elements.messages});},
  flushScroll(){for(const fn of scrollEvents.splice(0))fn();},
  flushFrames(){for(const [id,fn] of [...frames]){frames.delete(id);fn();}},
  userScrollTo(value,kind='wheel'){
   elements.messages.events[kind]?.(kind==='keydown'?{key:value<top?'PageUp':'PageDown',target:elements.messages}:{deltaY:value<top?-100:100,target:elements.messages});
   top=value;elements.messages.events.scroll?.({target:elements.messages});
  },
  nativeScrollTo(value){top=value;elements.messages.events.scroll?.({target:elements.messages});},
  input(name,event={}){elements.messages.events[name]?.({target:elements.messages,...event});},
  advance(ms){now+=ms;},
  resize(height){viewportHeight=height;top=Math.min(top,Math.max(0,elements.messages.scrollHeight-height));windowEvents.resize?.({});},
  click:id=>elements[id].click(),
  maxTop
 };
}

function state(extra={}){
 return{variant:'unified',source:{kind:'youtube',provider:'youtube',id:'synthetic'},title:'Synthetic archive',
  live:false,formats:[],quality:'auto720',phase:'playing',busy:false,error:'',
  auth:{phase:'off'},chat:{mode:'replay',state:'ready',available:true,count:40,sourceName:'Synthetic',offset:0,error:''},
  view:{presentation:'sidebar',fontSize:14,opacity:.64,lines:6,x:1,y:0,density:'comfortable',editing:false},
  messages:Array.from({length:40},(_,i)=>({id:String(i),time:i*3,author:'Synthetic',text:'message '+i})),qa:true,...extra};
}

const overlayView=()=>({...state().view,presentation:'overlay'});
const withNewMessage=(extra={})=>{
 const next=state(extra);
 next.messages.push({id:'new',time:120,author:'Synthetic',text:'new message'});
 return next;
};

// Ported from the Focus Playback/Chat tab cases (#23): the list is now hidden by presenting chat over the video.
test('reveal from overlay presentation lands on the latest message after hidden updates and programmatic scrolls',()=>{
 const f=setup();
 f.state(state({view:overlayView()}));
 assert.equal(f.elements.messages.hidden,true);
 f.scroll();f.flushScroll(); // Hidden layout must not become a user scroll-up decision.
 f.state(withNewMessage({view:overlayView()})); // An update arrives while the list is hidden.
 f.flushFrames();f.flushScroll();
 f.state(withNewMessage());
 assert.equal(f.elements.messages.hidden,false);
 assert.equal(f.elements.messages.scrollTop,f.maxTop(),'repair the viewport on reveal without waiting for an animation frame');
 f.flushScroll();f.flushFrames();f.flushScroll();
 assert.equal(f.elements.messages.scrollTop,f.maxTop());
 assert.ok(f.inspect().renderedMessages.at(-1).endsWith('Syntheticnew message'));
 assert.equal(f.elements.follow.hidden,true);
 assert.equal(f.frames.size,0);
});

test('hidden or queued layout scroll cannot opt out of following',()=>{
 const f=setup();f.state(state({view:overlayView()}));f.scroll();f.state(state());
 f.scroll();f.flushScroll();f.flushFrames();f.flushScroll();
 f.state(withNewMessage());f.flushScroll();f.flushFrames();f.flushScroll();
 assert.equal(f.elements.messages.scrollTop,f.maxTop());assert.equal(f.elements.follow.hidden,true);
});

test('explicit scroll-up remains at its position across hidden updates and reveal',()=>{
 const f=setup();f.state(state());f.flushFrames();f.flushScroll();
 f.userScrollTo(400);assert.equal(f.elements.follow.hidden,false);
 f.state(state({view:overlayView()}));assert.equal(f.elements.messages.hidden,true);f.scroll();
 f.state(withNewMessage({view:overlayView()}));f.flushFrames();f.flushScroll();
 f.state(withNewMessage());f.flushFrames();f.flushScroll();
 assert.equal(f.elements.messages.scrollTop,400);assert.equal(f.elements.follow.hidden,false);
 f.click('follow');f.flushFrames();f.flushScroll();
 assert.equal(f.elements.messages.scrollTop,f.maxTop());assert.equal(f.elements.follow.hidden,true);
});

test('a keyboard scroll-up cancels a pending automatic correction',()=>{
 const f=setup();f.state(state());
 f.userScrollTo(300,'keydown');f.flushScroll();f.flushFrames();f.flushScroll();
 assert.equal(f.elements.messages.scrollTop,300);assert.equal(f.elements.follow.hidden,false);
});

test('layout work coalesces and pagehide cancels a late correction',()=>{
 const f=setup();f.state(state());
 for(let i=0;i<10;i++)f.state(state());
 assert.equal(f.frames.size,1,'at most one bounded layout callback');
 const late=[...f.frames.values()][0];
 f.windowEvents.pagehide();assert.equal(f.frames.size,0);
 f.userScrollTo(250);late();
 assert.equal(f.elements.messages.scrollTop,250);
});

test('bounded QA rendered-message inspection remains available',()=>{
 const f=setup();f.state(state());
 const result=f.inspect();
 assert.equal(result.messageCount,40);assert.equal(result.renderedMessages.length,12);
 assert.ok(result.renderedMessages.at(-1).endsWith('Syntheticmessage 39'));
});

test('a late native layout or focus scroll without user input cannot disable default following',()=>{
 const f=setup();f.state(state({variant:'unified'}));f.flushFrames();f.flushScroll();
 f.advance(2000);f.nativeScrollTo(0);
 assert.equal(f.inspect().following,true,'scroll geometry alone is not a user opt-out');
 assert.equal(f.elements.follow.hidden,true);assert.equal(f.elements.messages.scrollTop,f.maxTop());
 f.flushFrames();f.flushScroll();assert.equal(f.frames.size,0);
});

test('an expired input gesture does not authorize a later automatic scroll to change intent',()=>{
 const f=setup();f.state(state({variant:'unified'}));f.flushFrames();f.flushScroll();
 f.input('wheel',{deltaY:100});f.advance(2000);f.nativeScrollTo(0);
 f.flushFrames();f.flushScroll();
 assert.equal(f.inspect().following,true);assert.equal(f.elements.messages.scrollTop,f.maxTop());
});

test('manual history survives later automatic scrolling, while deliberate downward scrolling resumes follow',()=>{
 const f=setup();f.state(state({variant:'unified'}));f.flushFrames();f.flushScroll();
 f.userScrollTo(400);assert.equal(f.inspect().following,false);
 f.advance(2000);f.nativeScrollTo(f.maxTop());f.flushFrames();f.flushScroll();
 assert.equal(f.inspect().following,false);assert.equal(f.elements.messages.scrollTop,400);
 f.userScrollTo(f.maxTop());assert.equal(f.inspect().following,true);assert.equal(f.elements.follow.hidden,true);
});

test('held pointer scrolling stays manual and release or blur ends its authority',()=>{
 const f=setup();f.state(state({variant:'unified'}));f.flushFrames();f.flushScroll();
 f.input('pointerdown');f.advance(2000);f.nativeScrollTo(400);
 assert.equal(f.inspect().following,false);assert.equal(f.elements.messages.scrollTop,400);
 f.windowEvents.pointerup?.({});f.advance(2000);f.nativeScrollTo(f.maxTop());f.flushFrames();f.flushScroll();
 assert.equal(f.inspect().following,false);assert.equal(f.elements.messages.scrollTop,400);
 f.click('follow');f.flushFrames();f.flushScroll();
 f.input('pointerdown');f.windowEvents.blur?.({});f.nativeScrollTo(0);f.flushFrames();f.flushScroll();
 assert.equal(f.inspect().following,true);assert.equal(f.elements.messages.scrollTop,f.maxTop());
});

test('resize and replacement batches do not reinterpret a recent manual scroll as resumed following',()=>{
 const f=setup();f.state(state({variant:'unified'}));f.flushFrames();f.flushScroll();
 f.userScrollTo(400);f.resize(1400);f.flushFrames();f.flushScroll();
 assert.equal(f.inspect().following,false);assert.equal(f.elements.follow.hidden,false);
 f.resize(200);f.flushFrames();f.flushScroll();assert.equal(f.elements.messages.scrollTop,400);
 f.userScrollTo(300);
 const next=state({variant:'unified'});next.messages=next.messages.slice(0,10);
 f.state(next);f.flushFrames();f.flushScroll();
 assert.equal(f.elements.messages.scrollTop,f.maxTop());
 assert.equal(f.inspect().following,false,'a batch clamping the position to the bottom preserves explicit history intent');
});

test('an unarmed scroll is repaired even before a throttled animation callback runs',()=>{
 const f=setup();f.state(state({variant:'unified'}));
 f.nativeScrollTo(0);
 assert.equal(f.inspect().following,true);assert.equal(f.elements.messages.scrollTop,f.maxTop());
 assert.equal(f.frames.size,1);f.flushFrames();f.flushScroll();assert.equal(f.frames.size,0);
});
