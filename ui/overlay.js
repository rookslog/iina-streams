"use strict";
(function(){
 const panel=document.getElementById('panel');
 const messages=document.getElementById('messages');
 let state=null,drag=null,resize=null,following=true,signature='';
 const SNAP_THRESHOLD=14,EDGE_HIT=10,MIN_W=220,MIN_H=100;
 const FALLBACK_COLORS=['#8ab9ff','#ff9e80','#80cbc4','#ce93d8','#ffd54f','#a5d6a7','#f48fb1','#90caf9'];
 const EDGE_CURSORS={n:'ns-resize',s:'ns-resize',e:'ew-resize',w:'ew-resize',nw:'nwse-resize',se:'nwse-resize',ne:'nesw-resize',sw:'nesw-resize'};
 const post=(n,d)=>iina.postMessage(n,d||{});
 const on=(name,fn)=>iina.onMessage(name,data=>{try{fn(JSON.parse(decodeURIComponent(data.encoded)));}catch(_){}});
 on('hello',()=>post('overlay-ready',{ready:true}));

 function hitEdge(e){
  const r=panel.getBoundingClientRect();
  const n=e.clientY-r.top<=EDGE_HIT,s=r.bottom-e.clientY<=EDGE_HIT;
  const w=e.clientX-r.left<=EDGE_HIT,ea=r.right-e.clientX<=EDGE_HIT;
  return(n?'n':s?'s':'')+(w?'w':ea?'e':'');
 }

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

 panel.addEventListener('pointerleave',()=>{if(!drag&&!resize)panel.style.cursor='default';});

 panel.addEventListener('pointerdown',e=>{
  if(!state||e.button!==0)return;
  e.preventDefault();
  const edge=hitEdge(e);
  if(edge){
   resize={edge,x:e.clientX,y:e.clientY,w:panel.offsetWidth,h:panel.offsetHeight,left:panel.offsetLeft,top:panel.offsetTop};
   panel.classList.add('resizing');
   panel.style.cursor=EDGE_CURSORS[edge];
   return;
  }
  drag={x:e.clientX,y:e.clientY,left:panel.offsetLeft,top:panel.offsetTop};
  panel.classList.add('dragging');
  panel.style.cursor='default';
 });

 window.addEventListener('pointermove',e=>{
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
   const dx=e.clientX-resize.x,dy=e.clientY-resize.y;
   let left=resize.left,top=resize.top,w=resize.w,h=resize.h;
   if(resize.edge.includes('e')){
    const maxW=Math.max(MIN_W,innerWidth-left);
    w=Math.max(MIN_W,Math.min(maxW,resize.w+dx));
    if(maxW-w<=SNAP_THRESHOLD)w=maxW;
   }
   if(resize.edge.includes('w')){
    const right=resize.left+resize.w;
    const minLeft=Math.max(0,right-innerWidth);
    left=Math.max(minLeft,Math.min(right-MIN_W,resize.left+dx));
    if(left<=SNAP_THRESHOLD)left=0;
    w=right-left;
   }
   if(resize.edge.includes('s')){
    const maxH=Math.max(MIN_H,innerHeight-top);
    h=Math.max(MIN_H,Math.min(maxH,resize.h+dy));
    if(maxH-h<=SNAP_THRESHOLD)h=maxH;
   }
   if(resize.edge.includes('n')){
    const bottom=resize.top+resize.h;
    const minTop=Math.max(0,bottom-innerHeight);
    top=Math.max(minTop,Math.min(bottom-MIN_H,resize.top+dy));
    if(top<=SNAP_THRESHOLD)top=0;
    h=bottom-top;
   }
   state.view.width=Math.round(w);
   state.view.height=Math.round(h);
   const g=geometry(state.view.width,state.view.height);
   state.view.x=g.maxX?Math.max(0,Math.min(1,left/g.maxX)):0;
   state.view.y=g.maxY?Math.max(0,Math.min(1,top/g.maxY)):0;
   position();
  }else if(state&&!panel.hidden){
   const edge=hitEdge(e);
   panel.style.cursor=EDGE_CURSORS[edge]||'default';
  }
 });

 function finishPointer(){
  if(drag){
   drag=null;
   panel.classList.remove('dragging','snapped');
   panel.style.cursor='default';
   if(panel.blur)panel.blur();
   if(state)post('geometry',{x:state.view.x,y:state.view.y,width:state.view.width,height:state.view.height});
  }
  if(resize){
   resize=null;
   panel.classList.remove('resizing');
   panel.style.cursor='default';
   if(panel.blur)panel.blur();
   if(state)post('geometry',{x:state.view.x,y:state.view.y,width:state.view.width,height:state.view.height});
  }
 }
 window.addEventListener('pointerup',finishPointer);
 window.addEventListener('pointercancel',finishPointer);
 window.addEventListener('blur',finishPointer);

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
