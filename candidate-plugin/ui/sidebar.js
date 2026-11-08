"use strict";
(function(){
 const $=id=>document.getElementById(id);let state=null,activeTab='playback',following=true,signature='';
 const post=(name,data)=>iina.postMessage(name,data===undefined?{}:data);
 const messages=$('messages');
 let live=null,liveHistory=[];
 let scrollFrame=null,programmaticScroll=false,historyTop=0,pageClosed=false;
 const messagesVisible=()=>!messages.hidden&&!$('chat-panel').hidden&&messages.clientHeight>0;
 function cancelScrollCorrection(){if(scrollFrame!==null){cancelAnimationFrame(scrollFrame);scrollFrame=null;}programmaticScroll=false;}
 function positionMessages(){
  if(pageClosed)return;
  programmaticScroll=true;
  if(messagesVisible())messages.scrollTop=following?messages.scrollHeight:historyTop;
  $('follow').hidden=following;
  if(scrollFrame===null)scrollFrame=requestAnimationFrame(()=>{
   scrollFrame=null;if(pageClosed)return;
   if(messagesVisible())messages.scrollTop=following?messages.scrollHeight:historyTop;
   programmaticScroll=false;
  });
 }
 const on=(name,fn)=>iina.onMessage(name,data=>{try{fn(JSON.parse(decodeURIComponent(data.encoded)));}catch(_){}});
 function getLive(){if(!live&&window.StreamsLive&&window.StreamsLiveHistory){live=window.StreamsLive.create({onStatus:s=>post('live-state',{state:s.phase,message:({'authentication-failed':'Authorization was rejected. Reconnect to chat.','capability-rejected':'Twitch could not initialize chat. Turn it off and connect again.','invalid-configuration':'Chat could not start. Turn it off and connect again.','retry-exhausted':'Chat could not reconnect. Turn it off and connect again.','protocol-limit':'The chat server response exceeded its limits.','transport-unavailable':'Chat transport is unavailable.'})[s.reason]||''}),onBatch:events=>{liveHistory=window.StreamsLiveHistory.reduce(liveHistory,events,150);post('live-messages',liveHistory);}});}return live;}
 function clock(value){const s=Math.max(0,Math.floor(value||0));return(s>=3600?Math.floor(s/3600)+':':'')+String(Math.floor(s/60)%60).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
 function tab(value){const wasHidden=$('chat-panel').hidden;activeTab=value;const focus=state&&state.variant==='focus';$('playback').hidden=focus&&value!=='playback';$('chat-panel').hidden=focus&&value!=='chat';for(const name of ['playback','chat']){const e=$(name+'-tab');e.setAttribute('aria-selected',String(name===value));e.tabIndex=name===value?0:-1;}if(wasHidden&&!$('chat-panel').hidden)positionMessages();}
 function render(s){
  state=s;document.body.classList.toggle('focus',s.variant==='focus');document.body.classList.toggle('compact',s.view.density==='compact');document.documentElement.style.setProperty('--chat-size',s.view.fontSize+'px');$('tabs').hidden=s.variant!=='focus';tab(activeTab);
  $('title').textContent=s.title;const kind=s.live?'Live':s.source.kind==='twitch-live'?'Live':s.source.kind==='youtube'?'Video':'Recording';$('source').textContent=s.source.provider+' · '+kind;
  const options=s.formats||[];const optionKey=options.map(x=>x.id+':'+x.label).join('|');
  if($('quality').dataset.options!==optionKey){$('quality').replaceChildren();for(const f of options){const opt=document.createElement('option');opt.value=f.id;opt.textContent=f.label;$('quality').appendChild(opt);}$('quality').dataset.options=optionKey;}
  $('quality').value=s.quality;$('quality').disabled=s.busy||s.phase==='inactive'||!options.length;$('refresh').disabled=s.busy;
  const transitions={loading:'Opening…',resolving:'Finding quality…',buffering:'Changing quality…',stopped:'Playback stopped',unconfirmed:'Quality change unconfirmed'};$('transition').textContent=transitions[s.phase]||'';$('transition').hidden=!transitions[s.phase];$('playback-error').textContent=s.error||'';$('playback-error').hidden=!s.error;
  const replay=s.chat.mode==='replay',on=s.chat.mode!=='off',twitch=s.source.kind==='twitch-live';
  $('chat-kind').textContent=replay?'Replay':on?'Live':'';$('off').hidden=!on&&!['importing','fetching','authorizing','waiting'].includes(s.chat.state);$('connect').hidden=!twitch||on;$('import').hidden=on;$('fetch').hidden=s.source.kind!=='youtube'||s.live||on;$('resume').hidden=!s.chat.available||on;
  $('auth-panel').hidden=!['needs-client','error'].includes(s.auth.phase)||!on;$('auth-code-panel').hidden=s.auth.phase!=='waiting'||!on;$('auth-code').textContent=s.auth.userCode||'';
  let status='';
  if(s.chat.state==='importing')status='Indexing chat archive…';else if(s.chat.state==='fetching')status='Retrieving archived chat…';else if(s.chat.state==='waiting')status='Approve read-only access in Twitch.';else if(['authorizing','connecting','authenticating','joining'].includes(s.chat.state))status='Connecting…';else if(s.chat.state==='reconnecting')status='Reconnecting…';else if(replay)status=s.chat.sourceName+' · '+s.chat.count.toLocaleString()+' messages';else if(!on)status=twitch?'Chat connects only when you choose.':s.live?'YouTube live chat is not connected.':'Import a chat archive to follow the recording.';
  $('chat-status').textContent=status;$('chat-status').hidden=!status;$('chat-error').textContent=s.chat.error||'';$('chat-error').hidden=!s.chat.error;
  $('replay-controls').hidden=!replay;if(document.activeElement!==$('offset'))$('offset').value=s.chat.offset;
  $('presentation').value=s.view.presentation;$('font-size').value=s.view.fontSize;$('opacity').value=s.view.opacity;$('lines').value=s.view.lines;$('density').value=s.view.density;
  $('overlay-settings').hidden=s.view.presentation!=='overlay';const x=s.view.x,y=s.view.y;$('placement').value=x===1&&y===0?'tr':x===0&&y===0?'tl':x===1&&y===1?'br':x===0&&y===1?'bl':'custom';$('position').textContent=s.view.editing?'Done positioning':'Move overlay…';
  $('overlay-note').hidden=!on||s.view.presentation!=='overlay';messages.hidden=s.view.presentation==='overlay';
  const visibleMessages=s.view.presentation==='sidebar'?(s.messages||[]):[];
  const sig=visibleMessages.map(m=>m.id+':'+m.time+':'+m.text).join('|');
  if(sig!==signature){signature=sig;if(!following&&messagesVisible())historyTop=messages.scrollTop;programmaticScroll=true;messages.replaceChildren();for(const m of visibleMessages){const row=document.createElement('div');row.className='message'+(m.kind==='notice'?' notice':'');if(replay){const time=document.createElement('button');time.className='time';time.textContent=clock(m.time);time.setAttribute('aria-label','Seek to chat message at '+clock(m.time));time.addEventListener('click',()=>post('seek-chat',m.time));row.appendChild(time);}const author=document.createElement('span');author.className='author';author.textContent=m.author;const text=document.createElement('span');text.textContent=m.text;row.append(author,text);messages.appendChild(row);}}
  positionMessages();
 }
 for(const [id,event] of [['open','open'],['hide','hide'],['hide-for-overlay','hide'],['refresh','refresh'],['import','import'],['off','chat-off'],['fetch','fetch-replay'],['resume','replay-resume'],['first','first-message'],['authorize-open','authorize-open'],['forget','forget-auth']])$(id).addEventListener('click',()=>post(event));
 $('quality').addEventListener('change',()=>post('change-quality',$('quality').value));$('offset').addEventListener('change',()=>post('offset',Number($('offset').value)));
 $('connect').addEventListener('click',()=>post('connect',{clientID:''}));$('authorize').addEventListener('click',()=>post('connect',{clientID:$('client-id').value.trim()}));
 $('appearance-toggle').addEventListener('click',()=>{$('appearance').hidden=!$('appearance').hidden;$('appearance-toggle').setAttribute('aria-expanded',String(!$('appearance').hidden));});
 for(const [id,key] of [['presentation','presentation'],['font-size','fontSize'],['opacity','opacity'],['lines','lines'],['density','density']])$(id).addEventListener('change',()=>post('view',{[key]:$(id).value}));
 $('placement').addEventListener('change',()=>{const p={tr:[1,0],tl:[0,0],br:[1,1],bl:[0,1]}[$('placement').value];if(p)post('view',{x:p[0],y:p[1],editing:false});});$('position').addEventListener('click',()=>post('view',{presentation:'overlay',editing:!state.view.editing}));$('reset').addEventListener('click',()=>post('view',{reset:true,editing:false}));
 for(const name of ['playback','chat'])$(name+'-tab').addEventListener('click',()=>tab(name));$('tabs').addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();tab(e.key==='Home'?'playback':e.key==='End'?'chat':activeTab==='chat'?'playback':'chat');$(activeTab+'-tab').focus();}});
 messages.addEventListener('scroll',()=>{if(pageClosed||programmaticScroll||!messagesVisible())return;following=messages.scrollHeight-messages.clientHeight-messages.scrollTop<35;if(!following)historyTop=messages.scrollTop;$('follow').hidden=following;});
 for(const name of ['wheel','pointerdown','touchstart'])messages.addEventListener(name,cancelScrollCorrection,{passive:true});
 messages.addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))cancelScrollCorrection();});
 $('follow').addEventListener('click',()=>{following=true;positionMessages();});
 on('state',render);
 on('live-config',data=>{liveHistory=[];const client=getLive();if(client)client.start(data);else post('live-state',{state:'error',message:'Live chat client is unavailable.'});});
 on('live-stop',()=>{if(live)live.stop();liveHistory=[];});
 on('qa-action',action=>{if(!state||!state.qa)return;try{if(action.name==='click')$(action.data.id).click();else if(action.name==='change'){const e=$(action.data.id);e.value=String(action.data.value);e.dispatchEvent(new Event('change',{bubbles:true}));}else if(action.name==='tab')tab(action.data);post('qa-result',{action:action.name,id:action.data&&action.data.id||'',title:$('title').textContent,quality:$('quality').value,messageCount:messages.children.length,following,scrollTop:messages.scrollTop,scrollHeight:messages.scrollHeight,clientHeight:messages.clientHeight,renderedMessages:action.name==='inspect'?Array.from(messages.children).slice(-12).map(e=>e.textContent.slice(0,2120)):[],tab:activeTab,bodyWidth:document.body.clientWidth,scrollWidth:document.body.scrollWidth,focused:document.activeElement&&document.activeElement.id,documentHidden:document.hidden,authPanelVisible:!$('auth-panel').hidden,authCodeVisible:!$('auth-code-panel').hidden,qualityDisabled:$('quality').disabled});}catch(_){post('qa-result',{action:action.name,error:'UI action failed'});}});
 window.addEventListener('pagehide',()=>{pageClosed=true;cancelScrollCorrection();if(live)live.stop();});
 document.addEventListener('visibilitychange',()=>post('surface-visibility',{visible:!document.hidden}));
 post('ready',{ready:true});
})();
