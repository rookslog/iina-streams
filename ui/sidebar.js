"use strict";
(function(){
 const $=id=>document.getElementById(id);let state=null,activeTab='playback',following=true,signature='';
 const post=(name,data)=>iina.postMessage(name,data===undefined?{}:data);
 const messages=$('messages');
 const FALLBACK_COLORS=['#1661c8','#b84b39','#1d7a6e','#7d49a6','#9a6700','#2e7d32','#ad1457','#0277bd'];
 let scrollFrame=null,positionedTop=null,historyTop=0,pageClosed=false,scrollIntentUntil=0,pointerHeld=false;
 const messagesVisible=()=>!messages.hidden&&!$('chat-panel').hidden&&messages.clientHeight>0;
 function authorColor(name,supplied){if(supplied&&/^#[0-9a-f]{6}$/i.test(supplied))return supplied;let h=0;const s=String(name||'');for(let i=0;i<s.length;i++)h=((h<<5)-h+s.charCodeAt(i))|0;return FALLBACK_COLORS[Math.abs(h)%FALLBACK_COLORS.length];}
 function cancelScrollCorrection(){if(scrollFrame!==null){cancelAnimationFrame(scrollFrame);scrollFrame=null;}positionedTop=null;}
 function clearScrollIntent(){pointerHeld=false;scrollIntentUntil=0;}
 function scrollIntent(){if(pageClosed||!messagesVisible())return;cancelScrollCorrection();scrollIntentUntil=Date.now()+750;}
 function holdPointer(){if(pageClosed||!messagesVisible())return;pointerHeld=true;scrollIntent();}
 function releasePointer(){if(!pointerHeld)return;pointerHeld=false;scrollIntentUntil=Date.now()+750;}
 function applyScrollPosition(){if(messagesVisible()){messages.scrollTop=following?messages.scrollHeight:historyTop;positionedTop=messages.scrollTop;}}
 function positionMessages(){
  if(pageClosed)return;
  applyScrollPosition();
  $('follow').hidden=following;
  if(scrollFrame===null)scrollFrame=requestAnimationFrame(()=>{
   scrollFrame=null;if(pageClosed)return;
   applyScrollPosition();
  });
 }
 const on=(name,fn)=>iina.onMessage(name,data=>{try{fn(JSON.parse(decodeURIComponent(data.encoded)));}catch(_){}});
 function clock(value){const s=Math.max(0,Math.floor(value||0));return(s>=3600?Math.floor(s/3600)+':':'')+String(Math.floor(s/60)%60).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
 function liveClock(value){const d=value?new Date(value):new Date();return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
 function setPopoverOpen(open){$('appearance').hidden=!open;$('appearance-toggle').setAttribute('aria-expanded',String(open));}
 function tab(value){const wasHidden=$('chat-panel').hidden;activeTab=value;const focus=state&&state.variant==='focus';$('playback').hidden=focus&&value!=='playback';$('chat-panel').hidden=focus&&value!=='chat';for(const name of ['playback','chat']){const e=$(name+'-tab');e.setAttribute('aria-selected',String(name===value));e.tabIndex=name===value?0:-1;}if(wasHidden&&!$('chat-panel').hidden)positionMessages();}
 function render(s){
  state=s;document.body.classList.toggle('focus',s.variant==='focus');document.documentElement.style.setProperty('--chat-size',s.view.fontSize+'px');document.documentElement.style.setProperty('--msg-gap',(s.view.spacing||4)+'px');$('tabs').hidden=s.variant!=='focus';tab(activeTab);
  $('title').textContent=s.title;const kind=s.live?'Live':s.source.kind==='twitch-live'?'Live':s.source.kind==='youtube'?'Video':'Recording';$('source').textContent=s.source.provider+' · '+kind;
  const options=s.formats||[];const optionKey=options.map(x=>x.id+':'+x.label).join('|');
  if($('quality').dataset.options!==optionKey){$('quality').replaceChildren();for(const f of options){const opt=document.createElement('option');opt.value=f.id;opt.textContent=f.label;$('quality').appendChild(opt);}$('quality').dataset.options=optionKey;}
  $('quality').value=s.quality;$('quality').disabled=s.busy||s.phase==='inactive'||!options.length;$('refresh').disabled=s.busy;
  const transitions={loading:'Opening…',resolving:'Finding quality…',buffering:'Changing quality…',stopped:'Playback stopped',unconfirmed:'Quality change unconfirmed'};$('transition').textContent=transitions[s.phase]||'';$('transition').hidden=!transitions[s.phase];$('playback-error').textContent=s.error||'';$('playback-error').hidden=!s.error;
  const replay=s.chat.mode==='replay',on=s.chat.mode!=='off',twitch=s.source.kind==='twitch-live',busy=['importing','fetching','authorizing','waiting'].includes(s.chat.state);
  const canToggle=twitch||s.chat.available||on||busy;
  $('chat-kind').textContent=replay?'Replay':on?'Live':'';
  $('chat-toggle').checked=on||busy;$('chat-toggle').disabled=!canToggle;
  $('connect').hidden=!twitch||on||!!s.auth.login||!!s.auth.saved;
  $('import').hidden=on||s.live||twitch;
  $('fetch').hidden=s.source.kind!=='youtube'||s.live||on;
  $('resume').hidden=!s.chat.available||on;
  $('auth-panel').hidden=!['needs-client','error'].includes(s.auth.phase)||!on;$('auth-code-panel').hidden=s.auth.phase!=='waiting'||!on;$('auth-code').textContent=s.auth.userCode||'';
  const showAccount=twitch&&(s.auth.phase==='ready'||s.auth.login);$('account-row').hidden=!showAccount;$('account-label').textContent=s.auth.login?'Signed in as '+s.auth.login:'';
  let status='';
  if(s.chat.state==='importing')status='Indexing chat archive…';else if(s.chat.state==='fetching')status='Loading archived chat…';else if(s.chat.state==='waiting')status='Approve read-only access in Twitch.';else if(['authorizing','connecting','authenticating','joining'].includes(s.chat.state))status='Connecting…';else if(s.chat.state==='reconnecting')status='Reconnecting…';else if(replay)status=s.chat.sourceName+' · '+s.chat.count.toLocaleString()+' messages';else if(!on&&s.live&&s.source.kind==='youtube')status='YouTube live chat is unavailable; VOD replay loads automatically after streams end.';
  $('chat-status').textContent=status;$('chat-status').hidden=!status;$('chat-error').textContent=s.chat.error||'';$('chat-error').hidden=!s.chat.error;
  $('replay-controls').hidden=!replay;if(document.activeElement!==$('offset'))$('offset').value=s.chat.offset;
  $('presentation').value=s.view.presentation;$('font-size').value=s.view.fontSize;$('opacity').value=s.view.opacity;$('spacing').value=s.view.spacing||4;$('timestamps').checked=!!s.view.timestamps;
  $('font-size-val').textContent=s.view.fontSize+'px';$('opacity-val').textContent=Math.round(s.view.opacity*100)+'%';$('spacing-val').textContent=(s.view.spacing||4)+'px';
  $('overlay-settings').hidden=s.view.presentation!=='overlay';const x=s.view.x,y=s.view.y;$('placement').value=x===1&&y===0?'tr':x===0&&y===0?'tl':x===1&&y===1?'br':x===0&&y===1?'bl':'custom';
  $('overlay-note').hidden=!on||s.view.presentation!=='overlay';messages.hidden=s.view.presentation==='overlay';
  const visibleMessages=s.view.presentation==='sidebar'?(s.messages||[]):[];
  const sig=visibleMessages.map(m=>m.id+':'+m.time+':'+m.text).join('|')+'|ts='+!!s.view.timestamps;
  if(sig!==signature){signature=sig;if(!following&&messagesVisible())historyTop=messages.scrollTop;messages.replaceChildren();for(const m of visibleMessages){const row=document.createElement('div');row.className='message'+(m.kind==='notice'?' notice':'');if(replay){const time=document.createElement('button');time.className='time';time.textContent=clock(m.time);time.setAttribute('aria-label','Seek to chat message at '+clock(m.time));time.addEventListener('click',()=>post('seek-chat',m.time));row.appendChild(time);}else if(s.view.timestamps){const ts=document.createElement('span');ts.className='msg-time';ts.textContent=liveClock(m.time);row.appendChild(ts);}const author=document.createElement('span');author.className='author';author.style.color=authorColor(m.author,m.color);author.textContent=m.author;const text=document.createElement('span');text.textContent=m.text;row.append(author,text);messages.appendChild(row);}}
  positionMessages();
 }
 for(const [id,event] of [['open','open'],['hide','hide'],['hide-for-overlay','hide'],['refresh','refresh'],['import','import'],['fetch','fetch-replay'],['resume','replay-resume'],['first','first-message'],['forget','forget-auth']])$(id).addEventListener('click',()=>post(event));
 $('chat-toggle').addEventListener('change',()=>{if($('chat-toggle').checked){if(state&&state.chat&&state.chat.available)post('replay-resume');else if(state&&state.source&&state.source.kind==='twitch-live')post('connect',{clientID:''});}else{post('chat-off');}});
 $('authorize-open').addEventListener('click',()=>{if(state&&state.auth&&state.auth.userCode&&navigator.clipboard&&navigator.clipboard.writeText)try{navigator.clipboard.writeText(state.auth.userCode);}catch(_){}post('authorize-open');});
 $('quality').addEventListener('change',()=>post('change-quality',$('quality').value));$('offset').addEventListener('change',()=>post('offset',Number($('offset').value)));
 $('connect').addEventListener('click',()=>post('connect',{clientID:''}));$('authorize').addEventListener('click',()=>post('connect',{clientID:$('client-id').value.trim()}));
 $('appearance-toggle').addEventListener('click',e=>{e.stopPropagation();setPopoverOpen($('appearance').hidden);});
 document.addEventListener('click',e=>{if(!$('appearance').hidden&&!$('appearance').contains(e.target)&&e.target!==$('appearance-toggle'))setPopoverOpen(false);});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('appearance').hidden)setPopoverOpen(false);});
 for(const [id,key] of [['presentation','presentation'],['font-size','fontSize'],['opacity','opacity'],['spacing','spacing']])$(id).addEventListener('change',()=>post('view',{[key]:$(id).value}));
 $('timestamps').addEventListener('change',()=>post('view',{timestamps:$('timestamps').checked}));
 $('placement').addEventListener('change',()=>{const p={tr:[1,0],tl:[0,0],br:[1,1],bl:[0,1]}[$('placement').value];if(p)post('view',{x:p[0],y:p[1],editing:false});});$('reset').addEventListener('click',()=>post('view',{reset:true,editing:false}));
 for(const name of ['playback','chat'])$(name+'-tab').addEventListener('click',()=>tab(name));$('tabs').addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();tab(e.key==='Home'?'playback':e.key==='End'?'chat':activeTab==='chat'?'playback':'chat');$(activeTab+'-tab').focus();}});
 messages.addEventListener('scroll',()=>{
  if(pageClosed||!messagesVisible())return;
  const top=messages.scrollTop,max=Math.max(0,messages.scrollHeight-messages.clientHeight);
  if(positionedTop!==null&&Math.abs(top-positionedTop)<1)return;
  positionedTop=null;
  if(pointerHeld||Date.now()<scrollIntentUntil){following=max-top<35;if(!following)historyTop=top;$('follow').hidden=following;}
  else if(Math.abs(top-(following?max:Math.min(historyTop,max)))>=1)positionMessages();
 });
 messages.addEventListener('wheel',event=>{if(event.deltaY)scrollIntent();},{passive:true});
 for(const name of ['pointerdown','touchstart'])messages.addEventListener(name,holdPointer,{passive:true});
 for(const name of ['pointerup','touchend'])window.addEventListener(name,releasePointer,{passive:true});
 for(const name of ['pointercancel','touchcancel','blur'])window.addEventListener(name,clearScrollIntent);
 messages.addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))scrollIntent();});
 window.addEventListener('resize',()=>{clearScrollIntent();positionMessages();});
 $('follow').addEventListener('click',()=>{clearScrollIntent();following=true;positionMessages();});
 on('state',render);
 on('qa-action',action=>{if(!state||!state.qa)return;try{if(action.name==='click')$(action.data.id).click();else if(action.name==='change'){const e=$(action.data.id);e.value=String(action.data.value);e.dispatchEvent(new Event('change',{bubbles:true}));}else if(action.name==='tab')tab(action.data);post('qa-result',{action:action.name,id:action.data&&action.data.id||'',title:$('title').textContent,quality:$('quality').value,messageCount:messages.children.length,following,scrollTop:messages.scrollTop,scrollHeight:messages.scrollHeight,clientHeight:messages.clientHeight,renderedMessages:action.name==='inspect'?Array.from(messages.children).slice(-12).map(e=>e.textContent.slice(0,2120)):[],tab:activeTab,bodyWidth:document.body.clientWidth,scrollWidth:document.body.scrollWidth,focused:document.activeElement&&document.activeElement.id,documentHidden:document.hidden,authPanelVisible:!$('auth-panel').hidden,authCodeVisible:!$('auth-code-panel').hidden,qualityDisabled:$('quality').disabled});}catch(_){post('qa-result',{action:action.name,error:'UI action failed'});}});
 window.addEventListener('pagehide',()=>{pageClosed=true;clearScrollIntent();cancelScrollCorrection();});
 document.addEventListener('visibilitychange',()=>post('surface-visibility',{visible:!document.hidden}));
 post('ready',{ready:true});
})();
