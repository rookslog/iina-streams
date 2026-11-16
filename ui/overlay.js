"use strict";
(function(){
 const panel=document.getElementById('panel');
 const messages=document.getElementById('messages');
 const resizeHandle=document.getElementById('resize-handle');
 let state=null,drag=null,resize=null,following=true,signature='';
 const SNAP_THRESHOLD=14,MIN_W=220,MIN_H=100;
 const FALLBACK_COLORS=['#8ab9ff','#ff9e80','#80cbc4','#ce93d8','#ffd54f','#a5d6a7','#f48fb1','#90caf9'];
 const post=(n,d)=>iina.postMessage(n,d||{});
 const on=(name,fn)=>iina.onMessage(name,data=>{try{fn(JSON.parse(decodeURIComponent(data.encoded)));}catch(_){}});
 on('hello',()=>post('overlay-ready',{ready:true}));

 function markClickable(){
  panel.setAttribute('data-clickable','');
  for(const el of panel.querySelectorAll('*'))el.setAttribute('data-clickable','');
 }

 function authorColor(name,supplied){
  if(supplied&&/^#[0-9a-f]{6}$/i.test(supplied))return supplied;
  let h=0;const s=String(name||'');
  for(let i=0;i<s.length;i++)h=((h<<5)-h+s.charCodeAt(i))|0;
  return FALLBACK_COLORS[Math.abs(h)%FALLBACK_COLORS.length];
 }

 function formatTime(value,replay){
  if(replay){
   const s=Math.max(0,Math.floor(value||0));
   return(s>=3600?Math.floor(s/3600)+':':'')+String(Math.floor(s/60)%60).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
  }
  const d=value?new Date(value):new Date();
  return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
 }

 function clampedSize(){
  const w=Math.max(MIN_W,Math.min(innerWidth,Number(state&&state.view&&state.view.width)||340));
  const h=Math.max(MIN_H,Math.min(innerHeight,Number(state&&state.view&&state.view.height)||260));
  return{w,h};
 }

 function geometry(w,h){
  return{maxX:Math.max(0,innerWidth-w),maxY:Math.max(0,innerHeight-h)};
 }

 function position(){
  if(!state)return;
  const sz=clampedSize();
  panel.style.width=sz.w+'px';
  panel.style.height=sz.h+'px';
  const g=geometry(sz.w,sz.h);
  panel.style.left=Math.round((Number(state.view.x)||0)*g.maxX)+'px';
  panel.style.top=Math.round((Number(state.view.y)||0)*g.maxY)+'px';
  if(following)messages.scrollTop=messages.scrollHeight;
 }

 function snapValue(val,max){
  if(val<=SNAP_THRESHOLD)return{val:0,snapped:true};
  if(max-val<=SNAP_THRESHOLD)return{val:max,snapped:true};
  return{val,snapped:false};
 }

 on('state',s=>{
  if((drag||resize)&&state){
   s.view.x=state.view.x;s.view.y=state.view.y;
   s.view.width=state.view.width;s.view.height=state.view.height;
  }
  state=s;
  panel.style.setProperty('--opacity',s.view.opacity);
  panel.style.setProperty('--size',s.view.fontSize+'px');
  panel.style.setProperty('--msg-gap',(s.view.spacing||4)+'px');
  const list=s.view.presentation==='overlay'?(s.messages||[]):[];
  const replay=s.chat&&s.chat.mode==='replay';
  const sig=list.map(m=>m.id+':'+m.time+':'+m.text).join('|')+'|ts='+!!s.view.timestamps+'|r='+!!replay;
  if(sig!==signature){
   signature=sig;
   const prevTop=messages.scrollTop;
   messages.replaceChildren();
   for(const m of list){
    const row=document.createElement('div');
    row.className='message';
    if(s.view.timestamps){
     const ts=document.createElement('span');
     ts.className='msg-time';
     ts.textContent=formatTime(m.time,replay);
     row.appendChild(ts);
    }
    const author=document.createElement('span');
    author.className='author';
    author.style.color=authorColor(m.author,m.color);
    author.textContent=m.author;
    const text=document.createElement('span');
    text.textContent=m.text;
    row.append(author,text);
    messages.appendChild(row);
   }
   if(s.view.presentation==='overlay'&&!messages.children.length&&s.chat&&s.chat.mode!=='off'){
    const note=document.createElement('div');
    note.className='message';
    note.style.opacity='0.7';
    note.textContent='Chat will appear here.';
    messages.appendChild(note);
   }
   if(following)messages.scrollTop=messages.scrollHeight;
   else messages.scrollTop=prevTop;
  }
  markClickable();
  panel.hidden=s.view.presentation!=='overlay'||(!messages.children.length&&(!s.chat||s.chat.mode==='off'));
  position();
 });

 messages.addEventListener('scroll',()=>{
  const max=Math.max(0,messages.scrollHeight-messages.clientHeight);
  following=max-messages.scrollTop<24;
 });

 resizeHandle.addEventListener('mousedown',e=>{
  if(!state||e.button!==0)return;
  e.preventDefault();
  e.stopPropagation();
  resize={x:e.clientX,y:e.clientY,w:panel.offsetWidth,h:panel.offsetHeight,left:panel.offsetLeft,top:panel.offsetTop};
  panel.classList.add('resizing');
 });

 panel.addEventListener('mousedown',e=>{
  if(!state||e.button!==0)return;
  if(e.target===resizeHandle)return;
  e.preventDefault();
  drag={x:e.clientX,y:e.clientY,left:panel.offsetLeft,top:panel.offsetTop};
  panel.classList.add('dragging');
 });

 window.addEventListener('mousemove',e=>{
  if(drag&&state){
   const sz=clampedSize();
   const g=geometry(sz.w,sz.h);
   const rawX=Math.max(0,Math.min(g.maxX,drag.left+e.clientX-drag.x));
   const rawY=Math.max(0,Math.min(g.maxY,drag.top+e.clientY-drag.y));
   const sx=snapValue(rawX,g.maxX);
   const sy=snapValue(rawY,g.maxY);
   panel.classList.toggle('snapped',sx.snapped||sy.snapped);
   state.view.x=g.maxX?sx.val/g.maxX:0;
   state.view.y=g.maxY?sy.val/g.maxY:0;
   position();
  }else if(resize&&state){
   const maxW=Math.max(MIN_W,innerWidth-resize.left);
   const maxH=Math.max(MIN_H,innerHeight-resize.top);
   let w=Math.max(MIN_W,Math.min(maxW,resize.w+e.clientX-resize.x));
   let h=Math.max(MIN_H,Math.min(maxH,resize.h+e.clientY-resize.y));
   if(maxW-w<=SNAP_THRESHOLD)w=maxW;
   if(maxH-h<=SNAP_THRESHOLD)h=maxH;
   state.view.width=Math.round(w);
   state.view.height=Math.round(h);
   const g=geometry(state.view.width,state.view.height);
   state.view.x=g.maxX?Math.min(1,resize.left/g.maxX):0;
   state.view.y=g.maxY?Math.min(1,resize.top/g.maxY):0;
   position();
  }
 });

 function finishMouse(){
  if(drag){
   drag=null;
   panel.classList.remove('dragging','snapped');
   if(panel.blur)panel.blur();
   if(state)post('geometry',{x:state.view.x,y:state.view.y,width:state.view.width,height:state.view.height});
  }
  if(resize){
   resize=null;
   panel.classList.remove('resizing');
   if(panel.blur)panel.blur();
   if(state)post('geometry',{x:state.view.x,y:state.view.y,width:state.view.width,height:state.view.height});
  }
 }
 window.addEventListener('mouseup',finishMouse);
 window.addEventListener('blur',finishMouse);

 panel.addEventListener('keydown',e=>{
  if(!state)return;
  if(e.shiftKey){
   const rDelta={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]}[e.key];
   if(rDelta){
    e.preventDefault();
    const w=Math.max(MIN_W,Math.min(innerWidth,(state.view.width||340)+rDelta[0]));
    const h=Math.max(MIN_H,Math.min(innerHeight,(state.view.height||260)+rDelta[1]));
    post('geometry',{x:state.view.x,y:state.view.y,width:w,height:h});
   }
   return;
  }
  const delta={ArrowLeft:[-.05,0],ArrowRight:[.05,0],ArrowUp:[0,-.05],ArrowDown:[0,.05]}[e.key];
  if(delta){
   e.preventDefault();
   post('geometry',{x:Math.max(0,Math.min(1,state.view.x+delta[0])),y:Math.max(0,Math.min(1,state.view.y+delta[1])),width:state.view.width,height:state.view.height});
  }else if(e.key==='0'||e.key==='r'||e.key==='R'){
   e.preventDefault();
   post('geometry',{x:1,y:0,width:340,height:260});
  }
 });

 window.addEventListener('resize',position);
 on('qa-action',a=>{
  if(!state||!state.qa)return;
  post('qa-result',{
   action:a.name,
   messageIds:(state.messages||[]).map(m=>m.id),
   renderedMessages:Array.from(messages.children).map(e=>e.textContent.slice(0,2100)),
   visible:!panel.hidden,
   messages:messages.children.length,
   x:panel.offsetLeft,y:panel.offsetTop,
   width:panel.offsetWidth,height:panel.offsetHeight,
   viewportWidth:innerWidth,viewportHeight:innerHeight,
   clickable:panel.hasAttribute('data-clickable'),
   documentHidden:document.hidden,
   display:getComputedStyle(panel).display,
   visibility:getComputedStyle(panel).visibility,
   opacity:getComputedStyle(panel).opacity,
   background:getComputedStyle(panel).backgroundColor
  });
 });
 post('overlay-ready',{ready:true});
})();
