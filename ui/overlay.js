"use strict";
(function(){
 const panel=document.getElementById('panel');
 const messages=document.getElementById('messages');
 const resizeHandle=document.getElementById('resize-handle');
 const columnHandle=document.getElementById('column-handle');
 const columnTools=document.getElementById('column-tools');
 const goLiveButton=document.getElementById('go-live');
 const hideChatButton=document.getElementById('hide-chat');
 let state=null,drag=null,resize=null,following=true,signature='';
 // A drag of the docked column's left edge: {x, width} at mousedown. The width posts on mouseup.
 let columnDrag=null;
 // The player clamps columnWidth to the same range (viewSettings in src/player.js).
 const COLUMN_MIN=240,COLUMN_MAX=480,COLUMN_DEFAULT=320,COLUMN_KEY_STEP=20;
 const SNAP_THRESHOLD=14,MIN_W=220,MIN_H=100;
 const FALLBACK_COLORS=['#8ab9ff','#ff9e80','#80cbc4','#ce93d8','#ffd54f','#a5d6a7','#f48fb1','#90caf9'];
 const post=(n,d)=>iina.postMessage(n,d||{});
 // Provider-neutral entry point: the views never name a provider.
 function segmentsFor(m){
  return StreamsChatContent.twitch.segments(m.text,m.emotes);
 }
 // Text of a rendered node, using an emote image's alt text so QA sees emote names.
 function nodeText(node){
  if(node.nodeType===3)return node.nodeValue||'';
  if(node.nodeName==='IMG')return node.alt||'';
  if(!node.childNodes)return node.textContent||'';
  return Array.from(node.childNodes).map(nodeText).join('');
 }
 const on=(name,fn)=>iina.onMessage(name,data=>{
  try{
   fn(JSON.parse(decodeURIComponent(data.encoded)));
  }catch(_){}
 });
 on('hello',()=>post('overlay-ready',{ready:true}));

 function markClickable(){
  panel.setAttribute('data-clickable','');
  for(const el of panel.querySelectorAll('*'))el.setAttribute('data-clickable','');
 }

 function authorColor(name,supplied){
  if(supplied&&/^#[0-9a-f]{6}$/i.test(supplied))return supplied;
  let h=0;
  const s=String(name||'');
  for(let i=0;i<s.length;i++)h=((h<<5)-h+s.charCodeAt(i))|0;
  return FALLBACK_COLORS[Math.abs(h)%FALLBACK_COLORS.length];
 }

 function formatTime(value,replay,seconds){
  if(replay){
   const s=Math.max(0,Math.floor(value||0));
   return(s>=3600?Math.floor(s/3600)+':':'')+String(Math.floor(s/60)%60).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
  }
  const d=value?new Date(value):new Date();
  return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+
   (seconds?':'+String(d.getSeconds()).padStart(2,'0'):'');
 }

 function clampedSize(){
  const w=Math.max(MIN_W,Math.min(innerWidth,Number(state&&state.view&&state.view.width)||340));
  const h=Math.max(MIN_H,Math.min(innerHeight,Number(state&&state.view&&state.view.height)||260));
  return{w,h};
 }

 function geometry(w,h){
  return{maxX:Math.max(0,innerWidth-w),maxY:Math.max(0,innerHeight-h)};
 }

 // layout 'column' is Beside Video: chat docked at the right edge, full height (#47).
 function columnLayout(s){
  return!!s&&s.layout==='column';
 }

 function columnWidth(){
  const width=Number(state&&state.view&&state.view.columnWidth)||COLUMN_DEFAULT;
  return Math.max(COLUMN_MIN,Math.min(COLUMN_MAX,innerWidth,width));
 }

 function positionColumn(){
  const width=columnWidth();
  panel.style.width=width+'px';
  panel.style.height=innerHeight+'px';
  panel.style.left=Math.max(0,innerWidth-width)+'px';
  panel.style.top='0px';
 }

 function position(){
  if(!state)return;
  if(columnLayout(state)){
   positionColumn();
   if(following)messages.scrollTop=messages.scrollHeight;
   return;
  }
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

 function keepLocalGeometry(s){
  if(columnDrag&&state)s.view.columnWidth=state.view.columnWidth;
  if(!(drag||resize)||!state)return;
  s.view.x=state.view.x;
  s.view.y=state.view.y;
  s.view.width=state.view.width;
  s.view.height=state.view.height;
 }

 function messageRow(m,s,replay){
  const row=document.createElement('div');
  row.className='message';
  if(s.view.timestamps){
   const ts=document.createElement('span');
   ts.className='msg-time';
   ts.textContent=formatTime(replay?m.time:(m.sentAt||m.time),replay,s.view.timestampSeconds);
   row.appendChild(ts);
  }
  const author=document.createElement('span');
  author.className='author';
  author.style.color=authorColor(m.author,m.color);
  author.textContent=m.author;
  const text=document.createElement('span');
  text.replaceChildren(...StreamsChatContent.renderSegments(segmentsFor(m),{document}));
  row.append(author,text);
  return row;
 }

 // Loading is shown, not narrated (#9): a quiet indicator while chat connects or loads; nothing once idle.
 function appendLoadingIndicator(s){
  if(s.view.presentation!=='overlay'&&!columnLayout(s)||messages.children.length||!s.chat||s.chat.mode==='off')return;
  if(!['authorizing','waiting','connecting','authenticating','joining','reconnecting','fetching','importing'].includes(s.chat.state))return;
  const spinner=document.createElement('div');
  spinner.className='loading';
  spinner.setAttribute('role','status');
  spinner.setAttribute('aria-label','Loading chat');
  for(let i=0;i<3;i++)spinner.appendChild(document.createElement('span'));
  messages.appendChild(spinner);
 }

 function renderMessages(s){
  const list=chatOnVideo(s)?(s.messages||[]):[];
  const replay=s.chat&&s.chat.mode==='replay';
  const sig=list.map(m=>m.id+':'+m.time+':'+m.text).join('|')+'|ts='+!!s.view.timestamps+!!s.view.timestampSeconds+
   '|r='+!!replay+'|st='+(s.chat&&s.chat.state);
  if(sig===signature)return;
  signature=sig;
  const prevTop=messages.scrollTop;
  messages.replaceChildren();
  for(const m of list)messages.appendChild(messageRow(m,s,replay));
  appendLoadingIndicator(s);
  if(following)messages.scrollTop=messages.scrollHeight;
  else messages.scrollTop=prevTop;
 }

 function chatOnVideo(s){
  return s.view.presentation==='overlay'||columnLayout(s);
 }

 function renderColumn(s){
  const column=columnLayout(s);
  document.body.setAttribute('data-layout',column?'column':'float');
  columnHandle.hidden=!column;
  columnTools.hidden=!column;
  goLiveButton.hidden=!s.canGoLive;
  columnHandle.setAttribute('aria-valuenow',String(columnWidth()));
  columnHandle.setAttribute('aria-valuemin',String(COLUMN_MIN));
  columnHandle.setAttribute('aria-valuemax',String(COLUMN_MAX));
 }

 function render(s){
  keepLocalGeometry(s);
  state=s;
  renderColumn(s);
  panel.style.setProperty('--opacity',s.view.opacity);
  panel.style.setProperty('--size',s.view.fontSize+'px');
  panel.style.setProperty('--msg-gap',(s.view.spacing||4)+'px');
  renderMessages(s);
  markClickable();
  panel.hidden=!chatOnVideo(s)||(!messages.children.length&&(!s.chat||s.chat.mode==='off'));
  position();
 }

 on('state',render);

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
  // The docked column does not move. Keep focus with the player, so Space still pauses after a click here.
  if(columnLayout(state)){
   e.preventDefault();
   return;
  }
  if(e.target===resizeHandle)return;
  e.preventDefault();
  drag={x:e.clientX,y:e.clientY,left:panel.offsetLeft,top:panel.offsetTop};
  panel.classList.add('dragging');
 });

 // The column's left edge widens the column as it moves left.
 columnHandle.addEventListener('mousedown',e=>{
  if(!state||e.button!==0||!columnLayout(state))return;
  e.preventDefault();
  e.stopPropagation();
  columnDrag={x:e.clientX,width:columnWidth()};
  panel.classList.add('column-resizing');
 });

 function dragColumn(e){
  const width=columnDrag.width+columnDrag.x-e.clientX;
  state.view.columnWidth=Math.round(Math.max(COLUMN_MIN,Math.min(COLUMN_MAX,innerWidth,width)));
  positionColumn();
 }

 function postColumnWidth(width){
  post('view',{columnWidth:width});
 }

 columnHandle.addEventListener('keydown',e=>{
  if(!state||!columnLayout(state))return;
  const step=e.key==='ArrowLeft'?COLUMN_KEY_STEP:e.key==='ArrowRight'?-COLUMN_KEY_STEP:0;
  if(!step)return;
  e.preventDefault();
  e.stopPropagation();
  postColumnWidth(Math.max(COLUMN_MIN,Math.min(COLUMN_MAX,columnWidth()+step)));
 });

 goLiveButton.addEventListener('click',()=>post('go-live',{}));
 hideChatButton.addEventListener('click',()=>post('chat-off',{}));

 window.addEventListener('mousemove',e=>{
  if(columnDrag&&state){
   dragColumn(e);
  }else if(drag&&state){
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
  if(columnDrag){
   columnDrag=null;
   panel.classList.remove('column-resizing');
   if(state)postColumnWidth(columnWidth());
  }
  if(drag){
   drag=null;
   panel.classList.remove('dragging','snapped');
   if(panel.blur)panel.blur();
   if(state)postGeometry();
  }
  if(resize){
   resize=null;
   panel.classList.remove('resizing');
   if(panel.blur)panel.blur();
   if(state)postGeometry();
  }
 }

 function postGeometry(){
  post('geometry',{x:state.view.x,y:state.view.y,width:state.view.width,height:state.view.height});
 }
 window.addEventListener('mouseup',finishMouse);
 window.addEventListener('blur',finishMouse);

 const RESIZE_KEYS={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]};
 const MOVE_KEYS={ArrowLeft:[-.05,0],ArrowRight:[.05,0],ArrowUp:[0,-.05],ArrowDown:[0,.05]};

 function onPanelKey(e){
  if(!state||columnLayout(state))return;
  if(e.shiftKey){
   resizeByKey(e);
   return;
  }
  const delta=MOVE_KEYS[e.key];
  if(delta){
   e.preventDefault();
   const x=Math.max(0,Math.min(1,state.view.x+delta[0]));
   const y=Math.max(0,Math.min(1,state.view.y+delta[1]));
   post('geometry',{x,y,width:state.view.width,height:state.view.height});
  }else if(e.key==='0'||e.key==='r'||e.key==='R'){
   e.preventDefault();
   post('geometry',{x:1,y:0,width:340,height:260});
  }
 }

 function resizeByKey(e){
  const rDelta=RESIZE_KEYS[e.key];
  if(!rDelta)return;
  e.preventDefault();
  const w=Math.max(MIN_W,Math.min(innerWidth,(state.view.width||340)+rDelta[0]));
  const h=Math.max(MIN_H,Math.min(innerHeight,(state.view.height||260)+rDelta[1]));
  post('geometry',{x:state.view.x,y:state.view.y,width:w,height:h});
 }

 panel.addEventListener('keydown',onPanelKey);

 window.addEventListener('resize',position);
 on('qa-action',a=>{
  if(!state||!state.qa)return;
  post('qa-result',{
   action:a.name,
   messageIds:(state.messages||[]).map(m=>m.id),
   renderedMessages:Array.from(messages.children).map(e=>nodeText(e).slice(0,2100)),
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
