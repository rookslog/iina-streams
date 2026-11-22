"use strict";
var setupOpen=false;

function validClientID(v){
 return /^[A-Za-z0-9]{10,64}$/.test(String(v||'').trim());
}

(function(){
 const $=id=>document.getElementById(id);
 let state=null,following=true,signature='';
 const post=(name,data)=>iina.postMessage(name,data===undefined?{}:data);
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
 const messages=$('messages');
 const FALLBACK_COLORS=['#1661c8','#b84b39','#1d7a6e','#7d49a6','#9a6700','#2e7d32','#ad1457','#0277bd'];
 const TRANSITIONS={
  loading:'Opening…',
  resolving:'Finding quality…',
  buffering:'Changing quality…',
  stopped:'Playback stopped',
  unconfirmed:'Quality change unconfirmed'
 };
 const BUSY={
  importing:'Indexing chat archive',
  fetching:'Loading archived chat',
  waiting:'Waiting for Twitch',
  authorizing:'Signing in',
  connecting:'Connecting to Twitch chat',
  authenticating:'Signing into chat',
  joining:'Joining channel',
  reconnecting:'Reconnecting'
 };
 const PLACEMENTS={tr:[1,0],tl:[0,0],br:[1,1],bl:[0,1]};
 let scrollFrame=null,positionedTop=null,historyTop=0,pageClosed=false,scrollIntentUntil=0,pointerHeld=false;
 const messagesVisible=()=>!messages.hidden&&messages.clientHeight>0;

 function authorColor(name,supplied){
  if(supplied&&/^#[0-9a-f]{6}$/i.test(supplied))return supplied;
  let h=0;
  const s=String(name||'');
  for(let i=0;i<s.length;i++)h=((h<<5)-h+s.charCodeAt(i))|0;
  return FALLBACK_COLORS[Math.abs(h)%FALLBACK_COLORS.length];
 }

 // ---- Scroll follow ----
 // `following` keeps the list at the latest message. Only user input (wheel, keys, a held pointer) may change
 // it; layout and programmatic scroll events are repaired back to the intended position.

 function cancelScrollCorrection(){
  if(scrollFrame!==null){
   cancelAnimationFrame(scrollFrame);
   scrollFrame=null;
  }
  positionedTop=null;
 }

 function clearScrollIntent(){
  pointerHeld=false;
  scrollIntentUntil=0;
 }

 function scrollIntent(){
  if(pageClosed||!messagesVisible())return;
  cancelScrollCorrection();
  scrollIntentUntil=Date.now()+750;
 }

 function holdPointer(){
  if(pageClosed||!messagesVisible())return;
  pointerHeld=true;
  scrollIntent();
 }

 function releasePointer(){
  if(!pointerHeld)return;
  pointerHeld=false;
  scrollIntentUntil=Date.now()+750;
 }

 function applyScrollPosition(){
  if(messagesVisible()){
   messages.scrollTop=following?messages.scrollHeight:historyTop;
   positionedTop=messages.scrollTop;
  }
 }

 function positionMessages(){
  if(pageClosed)return;
  applyScrollPosition();
  $('follow').hidden=following;
  if(scrollFrame===null)scrollFrame=requestAnimationFrame(onScrollFrame);
 }

 function onScrollFrame(){
  scrollFrame=null;
  if(pageClosed)return;
  applyScrollPosition();
 }

 function onMessagesScroll(){
  if(pageClosed||!messagesVisible())return;
  const top=messages.scrollTop,max=Math.max(0,messages.scrollHeight-messages.clientHeight);
  if(positionedTop!==null&&Math.abs(top-positionedTop)<1)return;
  positionedTop=null;
  if(pointerHeld||Date.now()<scrollIntentUntil){
   following=max-top<35;
   if(!following)historyTop=top;
   $('follow').hidden=following;
  }else if(Math.abs(top-(following?max:Math.min(historyTop,max)))>=1){
   positionMessages();
  }
 }

 const on=(name,fn)=>iina.onMessage(name,data=>{
  try{
   fn(JSON.parse(decodeURIComponent(data.encoded)));
  }catch(_){}
 });

 function clock(value){
  const s=Math.max(0,Math.floor(value||0));
  return(s>=3600?Math.floor(s/3600)+':':'')+String(Math.floor(s/60)%60).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
 }

 function liveClock(value,seconds){
  const d=value?new Date(value):new Date();
  return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+
   (seconds?':'+String(d.getSeconds()).padStart(2,'0'):'');
 }

 function setPopoverOpen(open){
  $('appearance').hidden=!open;
  $('appearance-toggle').setAttribute('aria-expanded',String(open));
 }

 // ---- Rendering ----

 function render(s){
  state=s;
  renderLayout(s);
  renderHeader(s);
  renderQuality(s);
  renderPlaybackStatus(s);
  const chatOn=s.chat.mode!=='off';
  renderChatControls(s,chatOn);
  renderCollapseToggle(s,chatOn);
  renderAuth(s,chatOn);
  renderChatStatus(s,chatOn);
  renderReplayControls(s);
  renderAppearance(s);
  renderChatTiming(s);
  renderMessages(s);
  positionMessages();
 }

 function renderLayout(s){
  document.documentElement.style.setProperty('--chat-size',s.view.fontSize+'px');
  document.documentElement.style.setProperty('--msg-gap',(s.view.spacing||4)+'px');
 }

 function renderHeader(s){
  $('title').textContent=s.title;
  const kind=s.live?'Live':s.source.kind==='twitch-live'?'Live':s.source.kind==='youtube'?'Video':'Recording';
  $('source').textContent=s.source.provider+' · '+kind;
  renderLivePill(s);
 }

 // #51: Live (red) when the player says Go Live can gain nothing (atLiveEdge), otherwise grey "−N s",
 // which goes live on click. No pill while the estimate is uncertain, and none outside Twitch live.

 function livePillState(s){
  const behind=s.behindLive;
  if(s.source.kind!=='twitch-live'||typeof behind!=='number'||!isFinite(behind))return null;
  return s.atLiveEdge===true?'live':'behind';
 }

 function renderLivePill(s){
  const pill=$('live-pill');
  const pillState=livePillState(s);
  pill.hidden=pillState===null;
  if(pillState===null)return;
  pill.setAttribute('data-state',pillState);
  if(pillState==='live'){
   pill.textContent='Live';
   pill.title='';
   pill.setAttribute('aria-label','Live');
   pill.setAttribute('aria-disabled','true');
  }else{
   const seconds=Math.round(s.behindLive);
   pill.textContent='\u2212'+seconds+'\u00a0s';
   pill.title='Go Live';
   pill.setAttribute('aria-label','Go Live, '+seconds+' seconds behind');
   pill.setAttribute('aria-disabled','false');
  }
 }

 function renderQuality(s){
  const options=s.formats||[];
  const optionKey=options.map(x=>x.id+':'+x.label).join('|');
  if($('quality').dataset.options!==optionKey){
   $('quality').replaceChildren();
   for(const f of options){
    const opt=document.createElement('option');
    opt.value=f.id;
    opt.textContent=f.label;
    $('quality').appendChild(opt);
   }
   $('quality').dataset.options=optionKey;
  }
  $('quality').value=s.quality;
  $('quality').disabled=s.busy||s.phase==='inactive'||!options.length;
  $('refresh').disabled=s.busy;
 }

 function renderPlaybackStatus(s){
  $('transition').textContent=TRANSITIONS[s.phase]||'';
  $('transition').hidden=!TRANSITIONS[s.phase];
  $('playback-error').textContent=s.error||'';
  $('playback-error').hidden=!s.error;
 }

 function renderChatControls(s,chatOn){
  const replay=s.chat.mode==='replay';
  const twitch=s.source.kind==='twitch-live';
  const busy=['importing','fetching','authorizing','waiting'].includes(s.chat.state);
  const canToggle=twitch||s.chat.available||chatOn||busy;
  $('chat-kind').textContent=replay?'Replay':chatOn?'Live':'';
  $('chat-toggle').checked=chatOn||busy;
  $('chat-toggle').disabled=!canToggle;
  $('connect').hidden=!twitch||chatOn||!!s.auth.login||!!s.auth.saved;
  $('import').hidden=chatOn||s.live;
  $('fetch').hidden=!['youtube','twitch-vod'].includes(s.source.kind)||s.live||chatOn;
  $('resume').hidden=!s.chat.available||chatOn;
 }

 // D1c: hiding chat over or beside the video is a view state the player owns; a missing field means shown.
 function collapsedOf(s){
  return!!s&&s.collapsed===true;
 }

 function renderCollapseToggle(s,chatOn){
  const onVideo=s.view.presentation==='overlay'||s.view.presentation==='beside';
  const collapsed=collapsedOf(s);
  const label=collapsed?'Show Chat':'Hide Chat';
  $('chat-collapse').hidden=!chatOn||!onVideo;
  $('chat-collapse').setAttribute('aria-label',label);
  $('chat-collapse').setAttribute('title',label);
  $('chat-collapse-hide-icon').hidden=collapsed;
  $('chat-collapse-show-icon').hidden=!collapsed;
  $('chat-collapse-unread').hidden=s.unread!==true;
 }

 function renderAuth(s,chatOn){
  const twitch=s.source.kind==='twitch-live';
  const ap=s.auth.phase;
  if(ap==='ready')setupOpen=false;
  const needsSetup=ap==='needs-client'||(setupOpen&&ap==='error');
  $('auth-panel').hidden=!chatOn||!(needsSetup||ap==='error');
  $('auth-setup').hidden=!needsSetup;
  $('auth-retry').hidden=needsSetup||ap!=='error';
  $('auth-code-panel').hidden=s.auth.phase!=='waiting'||!chatOn;
  $('auth-code').textContent=s.auth.userCode||'';
  const showAccount=twitch&&(s.auth.phase==='ready'||s.auth.login);
  $('account-row').hidden=!showAccount;
  $('account-label').textContent=s.auth.login?'Signed in as '+s.auth.login:'';
 }

 // State is shown by signifiers, with no prose status line (D1c text cleanup). Errors go to #chat-error.
 function renderChatStatus(s,chatOn){
  const busyStep=chatOn?BUSY[s.chat.state]||'':'';
  $('chat-busy').hidden=!busyStep;
  $('chat-busy').title=busyStep;
  $('chat-busy').setAttribute('aria-label',busyStep||'');
  const ytNote=!chatOn&&s.live&&s.source.kind==='youtube'?
   'YouTube live chat isn’t available yet. Replay loads after the stream ends.':'';
  $('chat-switch').title=ytNote||'Toggle chat on or off';
  $('chat-error').textContent=s.chat.error||'';
  $('chat-error').hidden=!s.chat.error;
 }

 function renderReplayControls(s){
  $('replay-controls').hidden=s.chat.mode!=='replay';
  if(document.activeElement!==$('offset'))$('offset').value=s.chat.offset;
 }

 function renderAppearance(s){
  $('presentation').value=s.view.presentation;
  $('font-size').value=s.view.fontSize;
  $('opacity').value=s.view.opacity;
  $('spacing').value=s.view.spacing||4;
  $('timestamps').value=!s.view.timestamps?'off':s.view.timestampSeconds?'sec':'min';
  $('font-size-val').textContent=s.view.fontSize+'px';
  $('opacity-val').textContent=Math.round(s.view.opacity*100)+'%';
  $('spacing-val').textContent=(s.view.spacing||4)+'px';
  $('overlay-settings').hidden=s.view.presentation!=='overlay';
  $('placement').value=placementOf(s.view.x,s.view.y);
 }

 // #2: the chat timing row. In Manual the stepper sets the delay; in Auto it fine-tunes the estimate.
 // An uncertain Auto shows a hollow dot (manual delay in use), a confident one a filled dot.
 // Rendering uses attributes and dataset only, which every sidebar test double provides.
 const TIMING_MODES=['auto','manual','live'];
 const TIMING_STEP=0.5;

 function timingOf(s){
  return s.chatTiming||{mode:'auto',manualDelay:0,fineTune:0,delay:0,state:'auto-uncertain'};
 }

 function formatSeconds(value,signed){
  const rounded=Math.round(value*2)/2;
  const sign=rounded<0?'\u2212':signed&&rounded>0?'+':'';
  return sign+Math.abs(rounded)+'\u00a0s';
 }

 function renderChatTiming(s){
  const timing=timingOf(s);
  $('timing-settings').hidden=s.source.kind!=='twitch-live';
  for(const mode of TIMING_MODES){
   const button=$('timing-'+mode);
   button.setAttribute('aria-checked',String(timing.mode===mode));
  }
  const auto=timing.mode==='auto';
  const dot=$('timing-dot');
  dot.hidden=!auto;
  dot.setAttribute('data-state',timing.state==='auto-uncertain'?'uncertain':'synced');
  dot.title=timing.state==='auto-uncertain'?'Not synced yet. Using the Manual delay':'Synced to the video';
  $('timing-stepper').hidden=timing.mode==='live';
  $('timing-value').textContent=auto?formatSeconds(timing.fineTune,true):formatSeconds(timing.manualDelay,false);
  messages.dataset.calibrating=String(timing.mode==='manual'&&s.chat.mode==='live');
 }

 function stepTiming(direction){
  const timing=timingOf(state||{});
  if(timing.mode==='manual')post('chat-timing',{manualDelay:timing.manualDelay+direction*TIMING_STEP});
  else if(timing.mode==='auto')post('chat-timing',{fineTune:timing.fineTune+direction*TIMING_STEP});
 }

 // #28: in Manual, ⌥-click the message that matches the video now. The row flashes; nothing is written.
 function messageRowOf(target){
  let node=target;
  while(node&&node!==messages){
   if(node.dataset&&node.dataset.id!==undefined)return node;
   node=node.parentNode;
  }
  return null;
 }

 function onMessageClick(event){
  if(!event.altKey||!state||state.chat.mode!=='live'||timingOf(state).mode!=='manual')return;
  const row=messageRowOf(event.target);
  if(!row||!row.dataset.id)return;
  event.preventDefault();
  post('chat-calibrate',{id:row.dataset.id});
  row.dataset.calibrated='true';
  setTimeout(()=>{
   row.dataset.calibrated='false';
  },700);
 }

 function placementOf(x,y){
  if(x===1&&y===0)return 'tr';
  if(x===0&&y===0)return 'tl';
  if(x===1&&y===1)return 'br';
  if(x===0&&y===1)return 'bl';
  return 'custom';
 }

 function renderMessages(s){
  // A list that was hidden reads scrollTop 0, so its position is only re-read while it stays visible (#23).
  const wasVisible=messagesVisible();
  messages.hidden=s.view.presentation==='overlay';
  const visibleMessages=s.view.presentation==='sidebar'?(s.messages||[]):[];
  const sig=visibleMessages.map(m=>m.id+':'+m.time+':'+m.text).join('|')+'|ts='+!!s.view.timestamps+!!s.view.timestampSeconds;
  if(sig===signature)return;
  signature=sig;
  if(!following&&wasVisible&&messagesVisible())historyTop=messages.scrollTop;
  messages.replaceChildren();
  const replay=s.chat.mode==='replay';
  for(const m of visibleMessages)messages.appendChild(messageRow(m,replay,s.view));
 }

 function messageRow(m,replay,view){
  const row=document.createElement('div');
  row.className='message'+(m.kind==='notice'?' notice':'');
  if(!replay&&m.sentAt)row.dataset.id=m.id;
  if(replay){
   const time=document.createElement('button');
   time.className='time';
   time.textContent=clock(m.time);
   time.setAttribute('aria-label','Seek to chat message at '+clock(m.time));
   time.addEventListener('click',()=>post('seek-chat',m.time));
   row.appendChild(time);
  }else if(view.timestamps){
   const ts=document.createElement('span');
   ts.className='msg-time';
   ts.textContent=liveClock(m.sentAt||m.time,view.timestampSeconds);
   row.appendChild(ts);
  }
  const author=document.createElement('span');
  author.className='author';
  author.style.color=authorColor(m.author,m.color);
  author.textContent=m.author;
  const text=document.createElement('span');
  // The follow tests run this script alone, without chat-content.js; the page always loads it.
  // If chat-content.js failed to load, chat still shows as plain text (also what tests/sidebar-follow's bare harness hits).
  if(typeof StreamsChatContent==='undefined')text.textContent=m.text;
  else text.replaceChildren(...StreamsChatContent.renderSegments(segmentsFor(m),{document}));
  row.append(author,text);
  return row;
 }

 // ---- QA inspection (config.qa builds only) ----

 function onQaAction(action){
  if(!state||!state.qa)return;
  try{
   if(action.name==='click'){
    $(action.data.id).click();
   }else if(action.name==='change'){
    const e=$(action.data.id);
    e.value=String(action.data.value);
    e.dispatchEvent(new Event('change',{bubbles:true}));
   }
   post('qa-result',qaResult(action));
  }catch(_){
   post('qa-result',{action:action.name,error:'UI action failed'});
  }
 }

 function qaResult(action){
  return{
   action:action.name,
   id:action.data&&action.data.id||'',
   title:$('title').textContent,
   quality:$('quality').value,
   messageCount:messages.children.length,
   following,
   scrollTop:messages.scrollTop,
   scrollHeight:messages.scrollHeight,
   clientHeight:messages.clientHeight,
   renderedMessages:action.name==='inspect'?Array.from(messages.children).slice(-12).map(e=>nodeText(e).slice(0,2120)):[],
   bodyWidth:document.body.clientWidth,
   scrollWidth:document.body.scrollWidth,
   focused:document.activeElement&&document.activeElement.id,
   documentHidden:document.hidden,
   authPanelVisible:!$('auth-panel').hidden,
   authCodeVisible:!$('auth-code-panel').hidden,
   qualityDisabled:$('quality').disabled
  };
 }

 // ---- Controls ----

 const CLICK_MESSAGES=[
  ['hide','hide'],['refresh','refresh'],['import','import'],
  ['fetch','fetch-replay'],['resume','replay-resume'],['first','first-message'],['forget','forget-auth']
 ];
 for(const [id,event] of CLICK_MESSAGES)$(id).addEventListener('click',()=>post(event));
 $('chat-collapse').addEventListener('click',()=>post('chat-collapse',{collapsed:!collapsedOf(state)}));

 // ---- Open another stream (#50): an inline field, never a modal prompt ----

 const openForm=$('open-form');
 const openInput=$('open-input');

 function showOpenField(){
  openForm.hidden=false;
  $('open').setAttribute('aria-expanded','true');
  openInput.focus();
 }

 function hideOpenField(){
  openForm.hidden=true;
  $('open').setAttribute('aria-expanded','false');
 }

 // + opens an empty field, or hides an open one.
 function toggleOpenField(){
  if(!openForm.hidden){
   hideOpenField();
   return;
  }
  openInput.value='';
  openInput.removeAttribute('aria-invalid');
  showOpenField();
 }

 // Global parses the input. It answers only when the input is invalid (open-error).
 function submitOpenField(event){
  event.preventDefault();
  const input=openInput.value;
  if(!input.trim())return;
  hideOpenField();
  post('open',{input});
 }

 // The rejected text is still in the field: show it again, marked invalid, for correction.
 function onOpenError(){
  openInput.setAttribute('aria-invalid','true');
  showOpenField();
 }

 // Escape hides the field wherever focus is. After Return hides the field, focus leaves it, and showing it
 // again for an error may not bring focus back, so a handler on the field alone can miss the key.
 function onOpenFieldEscape(event){
  if(event.key!=='Escape'||openForm.hidden)return false;
  event.preventDefault();
  hideOpenField();
  $('open').focus();
  return true;
 }

 // Focus moving elsewhere in the sidebar hides the field. Focus leaving the page (another app, the video)
 // keeps it, so a URL can be copied from elsewhere and pasted; + (shown as ×) still closes it.
 function onOpenFieldFocusOut(event){
  if(openForm.hidden||openForm.contains(event.relatedTarget))return;
  if(!event.relatedTarget&&!document.hasFocus())return;
  hideOpenField();
 }

 $('open').addEventListener('click',toggleOpenField);
 // Pressing + while the field has focus must not blur it first: blur would hide it and the click reopen it.
 $('open').addEventListener('mousedown',event=>{
  if(!openForm.hidden)event.preventDefault();
 });
 openForm.addEventListener('submit',submitOpenField);
 openForm.addEventListener('focusout',onOpenFieldFocusOut);
 openInput.addEventListener('input',()=>openInput.removeAttribute('aria-invalid'));

 const chatAvailable=()=>!!(state&&state.chat&&state.chat.available);
 const twitchLive=()=>!!(state&&state.source&&state.source.kind==='twitch-live');
 // Nothing here opens Twitch by itself: only the "Approve on Twitch" button does (authorize-open).
 $('chat-toggle').addEventListener('change',()=>{if(!$('chat-toggle').checked)post('chat-off');else if(chatAvailable())post('replay-resume');else if(twitchLive())post('connect',{clientID:''});});

 $('authorize-open').addEventListener('click',copyCodeAndOpen);
 $('quality').addEventListener('change',()=>post('change-quality',$('quality').value));
 $('offset').addEventListener('change',()=>post('offset',Number($('offset').value)));
 $('connect').addEventListener('click',()=>post('connect',{clientID:''}));
 $('authorize').addEventListener('click',()=>{
  if(validClientID($('client-id').value))post('connect',{clientID:$('client-id').value.trim()});
 });
 $('client-id').addEventListener('input',()=>{
  $('authorize').disabled=!validClientID($('client-id').value);
 });
 $('client-id').addEventListener('keydown',e=>{
  if(e.key==='Enter'&&validClientID($('client-id').value))post('connect',{clientID:$('client-id').value.trim()});
 });
 $('open-console').addEventListener('click',()=>post('open-twitch-console'));
 $('retry').addEventListener('click',()=>post('connect',{clientID:''}));
 $('use-other-id').addEventListener('click',()=>{
  setupOpen=true;
  if(state)render(state);
 });

 // "Approve on Twitch": open the activation page. The code is also copied, silently, in case autofill fails.
 function copyCodeAndOpen(){
  const code=state&&state.auth&&state.auth.userCode;
  if(code&&navigator.clipboard&&navigator.clipboard.writeText){
   try{
    navigator.clipboard.writeText(state.auth.userCode);
   }catch(_){}
  }
  post('authorize-open');
 }

 $('appearance-toggle').addEventListener('click',e=>{
  e.stopPropagation();
  setPopoverOpen($('appearance').hidden);
 });
 document.addEventListener('click',e=>{
  const popover=$('appearance');
  if(!popover.hidden&&!popover.contains(e.target)&&e.target!==$('appearance-toggle'))setPopoverOpen(false);
 });
 document.addEventListener('keydown',e=>{
  if(onOpenFieldEscape(e))return;
  if(e.key==='Escape'&&!$('appearance').hidden)setPopoverOpen(false);
 });

 const VIEW_INPUTS=[['presentation','presentation'],['font-size','fontSize'],['opacity','opacity'],['spacing','spacing']];
 for(const [id,key] of VIEW_INPUTS)$(id).addEventListener('change',()=>post('view',{[key]:$(id).value}));
 $('timestamps').addEventListener('change',()=>{
  const v=$('timestamps').value;
  post('view',{timestamps:v!=='off',timestampSeconds:v==='sec'});
 });
 $('placement').addEventListener('change',()=>{
  const p=PLACEMENTS[$('placement').value];
  if(p)post('view',{x:p[0],y:p[1],editing:false});
 });
 $('reset').addEventListener('click',()=>post('view',{reset:true,editing:false}));
 for(const mode of TIMING_MODES)$('timing-'+mode).addEventListener('click',()=>post('chat-timing',{mode}));
 $('timing-less').addEventListener('click',()=>stepTiming(-1));
 $('timing-more').addEventListener('click',()=>stepTiming(1));
 $('live-pill').addEventListener('click',()=>{
  if($('live-pill').dataset.state==='behind')post('go-live',{});
 });
 messages.addEventListener('click',onMessageClick);

 // ---- Scroll input ----

 const SCROLL_KEYS=['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '];
 messages.addEventListener('scroll',onMessagesScroll);
 messages.addEventListener('wheel',event=>{
  if(event.deltaY)scrollIntent();
 },{passive:true});
 for(const name of ['pointerdown','touchstart'])messages.addEventListener(name,holdPointer,{passive:true});
 for(const name of ['pointerup','touchend'])window.addEventListener(name,releasePointer,{passive:true});
 for(const name of ['pointercancel','touchcancel','blur'])window.addEventListener(name,clearScrollIntent);
 messages.addEventListener('keydown',event=>{
  if(SCROLL_KEYS.includes(event.key))scrollIntent();
 });
 window.addEventListener('resize',()=>{
  clearScrollIntent();
  positionMessages();
 });
 $('follow').addEventListener('click',()=>{
  clearScrollIntent();
  following=true;
  positionMessages();
 });

 on('state',render);
 on('open-error',onOpenError);
 on('qa-action',onQaAction);
 window.addEventListener('pagehide',()=>{
  pageClosed=true;
  clearScrollIntent();
  cancelScrollCorrection();
 });
 document.addEventListener('visibilitychange',()=>post('surface-visibility',{visible:!document.hidden}));
 post('ready',{ready:true});
})();
