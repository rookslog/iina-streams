"use strict";
// The Open Stream window (#50). Global parses the input and answers only when it is invalid.
// B6c (#32): for a channel a player found offline, global prefills the field and sends its recent broadcasts.
// #74: the quick list. The field is a combobox driving a listbox of people from watch history; it keeps focus,
// and the selected row is shown with aria-activedescendant. Whenever the list has people the top one is
// selected, so Return opens the top match. → (or Return on someone known to be offline) opens a person's
// broadcasts under their row. The window keeps one height (global); the list scrolls.
(function(){
 const form=document.getElementById('open-form');
 const field=document.getElementById('open-input');
 // Looked up once; a page without them (the A1 and #67 doubles) still works.
 const listbox=document.getElementById('suggestions');
 const area=document.getElementById('suggestions-area');
 const emptyGlyph=document.getElementById('suggestions-empty');
 const announcer=document.getElementById('announce');

 const OFFLINE_ROWS=10;
 const EMPTY_TEXT={none:'No recent broadcasts',error:'Recent broadcasts unavailable'};
 const LOADING_TEXT='Loading recent broadcasts';
 // A Return pressed before global has answered the latest text waits this long for the answer.
 const RETURN_WAIT_MS=400;
 // A click within this many pixels of the chevron click that opened a list, after the list scrolled, is a
 // repeat aimed at the chevron, not at whatever scrolled under the pointer.
 const POINTER_SLOP=4;

 // People as global last sent them, in its order. Live status never reorders them.
 let people=[];
 let heardSuggestions=false;
 // The selected row: {login, vod}, where vod is -1 for the person row or a broadcast index under them.
 let selection=null;
 // ↑ from the top match while typing: the person chose the typed text, so nothing is reselected until the
 // next edit and Return opens the text.
 let textChosen=false;
 // The person whose broadcasts are open under their row: {login, state, items, byPointer}.
 let expanded=null;
 // Who an offline-vods message is for:
 // 'inline'     the expanded person (after open-vods);
 // 'checking'   a person opened from the list, while global's live check runs; an offline answer shows their
 //              broadcasts under their row, so there is one broadcast list, with one set of keys;
 // 'standalone' the #32 list, after a typed submit or a prefill, and by default;
 // 'ignore'     an answer outdated by typing or by closing the list.
 let vodsTarget='standalone';
 let checkingLogin=null;
 // A submit or prefill is pending: Escape then cancels, as it always has, instead of clearing the field.
 let submitted=false;
 // What the pending submit opens. A double click or a held Return on the same row posts it once, since
 // every post may start a player.
 let pendingInput=null;
 // The #32 list is showing in place of the suggestions, and its state.
 let standalone=false,standaloneState='idle';
 // The text of the latest open-query that global has not answered yet, and a Return waiting for that answer.
 let awaitingText=null,returnPending=false,returnTimer=null;
 let optionNodes=new Map(),groupNode=null;
 // The selected row last scrolled into view, so a status update never scrolls the list under the pointer.
 let revealedKey=null;
 let guard=null;

 function focusField(){
  field.focus();
 }

 function post(name,data){
  iina.postMessage(name,data);
 }

 // Global sends untrusted text as an envelope (src/bridge.js); a plain payload is read as a fallback.
 function unwrap(data){
  if(data&&typeof data.encoded==='string'){
   try{
    return JSON.parse(decodeURIComponent(data.encoded));
   }catch(_){
    return null;
   }
  }
  return data&&typeof data==='object'?data:null;
 }

 function announce(text){
  if(announcer)announcer.textContent=text;
 }

 function submit(event){
  event.preventDefault();
  const input=field.value;
  if(!input.trim())return;
  openInput(input);
 }

 function openInput(input,target='standalone'){
  if(submitted&&input===pendingInput)return;
  pendingInput=input;
  submitted=true;
  vodsTarget=target;
  post('open-stream',{input});
 }

 // The rejected text stays in the field for correction.
 function markInvalid(){
  field.setAttribute('aria-invalid','true');
  submitted=false;
  pendingInput=null;
  focusField();
 }

 function prefill(data){
  const value=unwrap(data);
  if(!value||typeof value.input!=='string')return;
  // The person opened from the list was offline: their broadcasts come under their row, and the field stays.
  if(vodsTarget==='checking'&&value.input===checkingLogin)return;
  field.value=value.input;
  submitted=true;
  vodsTarget='standalone';
  selection=null;
  expanded=null;
  render();
 }

 // ---- Suggestions ----

 function onSuggestions(data){
  const value=unwrap(data);
  if(!value||!Array.isArray(value.rows))return;
  const text=typeof value.text==='string'?value.text:'';
  people=value.rows.filter(row=>row&&typeof row.login==='string'&&row.login).map(row=>({
   login:row.login,
   provider:typeof row.provider==='string'?row.provider:'',
   displayName:typeof row.displayName==='string'&&row.displayName?row.displayName:row.login,
   live:row.live===true||row.live===false?row.live:null
  }));
  heardSuggestions=true;
  if(awaitingText!==null&&text===awaitingText)awaitingText=null;
  const has=login=>people.some(person=>person.login===login);
  if(expanded&&!has(expanded.login)){
   expanded=null;
   if(vodsTarget==='inline')vodsTarget='ignore';
  }
  if(selection&&!has(selection.login))selection=null;
  if(!selection&&!textChosen&&people.length)selection={login:people[0].login,vod:-1};
  render();
  if(returnPending&&awaitingText===null)finishReturn();
 }

 // Status changes only the marks and the spoken names, in place: the rows, the selection and the scroll
 // stay, and VoiceOver keeps its place on the selected option.
 function onSuggestionsStatus(data){
  const value=unwrap(data);
  const status=value&&value.status;
  if(!status||typeof status!=='object')return;
  for(const person of people){
   if(!Object.prototype.hasOwnProperty.call(status,person.login))continue;
   const live=status[person.login];
   person.live=live===true||live===false?live:null;
   const row=optionNodes.get(key(person.login,-1));
   if(!row)continue;
   row.setAttribute('aria-label',spokenName(person));
   const mark=row.children&&row.children[0];
   if(mark)mark.setAttribute('class',markClass(person));
  }
 }

 function spokenName(person){
  if(person.live===true)return person.displayName+', live';
  if(person.live===false)return person.displayName+', offline';
  return person.displayName;
 }

 function markClass(person){
  if(person.live===true)return'mark live';
  if(person.live===false)return'mark';
  return'mark unknown';
 }

 function canBrowse(person){
  return!!person&&person.provider==='twitch';
 }

 function isSelected(login,vod){
  return!!selection&&selection.login===login&&selection.vod===vod;
 }

 function el(tag,className,text){
  const node=document.createElement(tag);
  if(className)node.setAttribute('class',className);
  if(text!==undefined)node.textContent=text;
  return node;
 }

 function render(){
  const showList=!standalone;
  if(area)area.hidden=!showList;
  field.setAttribute('aria-expanded',String(showList&&people.length>0));
  if(emptyGlyph)emptyGlyph.hidden=!(showList&&heardSuggestions&&!people.length&&field.value==='');
  optionNodes=new Map();
  groupNode=null;
  if(listbox){
   const children=[];
   people.forEach((person,index)=>{
    children.push(personRow(person,index));
    if(expanded&&expanded.login===person.login){
     groupNode=broadcastGroup(person);
     children.push(groupNode);
    }
   });
   listbox.replaceChildren(...children);
  }
  const active=selection&&optionNodes.get(key(selection.login,selection.vod));
  if(active&&showList){
   field.setAttribute('aria-activedescendant',active.id);
   const shown=key(selection.login,selection.vod);
   if(shown!==revealedKey)reveal(active,active);
   revealedKey=shown;
  }else{
   revealedKey=null;
   field.removeAttribute('aria-activedescendant');
  }
 }

 function key(login,vod){
  return login+'\n'+vod;
 }

 function personRow(person,index){
  const selected=isSelected(person.login,-1);
  const open=!!expanded&&expanded.login===person.login;
  const row=el('div','person'+(open?' expanded':''));
  row.setAttribute('role','option');
  row.setAttribute('id','person-'+index);
  row.setAttribute('aria-selected',String(selected));
  row.setAttribute('aria-label',spokenName(person));
  row.setAttribute('aria-posinset',String(index+1));
  row.setAttribute('aria-setsize',String(people.length));
  const mark=el('span',markClass(person));
  mark.setAttribute('aria-hidden','true');
  const name=el('span','name',person.displayName);
  row.append(mark,name);
  let disclose=null;
  if(canBrowse(person)){
   // VoiceOver hears how to reach the broadcasts; the chevron says it to the eye.
   row.setAttribute('aria-describedby',open?'hint-close':'hint-open');
   disclose=el('span','disclose');
   disclose.setAttribute('aria-hidden','true');
   disclose.setAttribute('title','Recent broadcasts');
   row.append(disclose);
  }else{
   row.append(el('span'));
  }
  row.addEventListener('click',event=>{
   if(guarded(event))return;
   if(disclose&&event&&event.target===disclose){
    if(open)closeBroadcasts(true);
    else openBroadcasts(person.login,event);
    return;
   }
   activatePerson(person.login);
  });
  optionNodes.set(key(person.login,-1),row);
  return row;
 }

 function broadcastGroup(person){
  const group=el('div','vod-group');
  group.setAttribute('role','group');
  group.setAttribute('aria-label','Recent broadcasts, '+person.displayName);
  if(expanded.state==='loading'){
   const row=el('div','vod-status');
   row.setAttribute('aria-hidden','true');
   row.append(el('span','busy-indicator'));
   group.append(row);
  }else if(expanded.state==='ready'){
   expanded.items.forEach((item,index)=>group.append(broadcastOption(person,item,index)));
  }else{
   // The words are spoken by the page's status region (announce), not from inside the listbox.
   const row=el('div','vod-status',EMPTY_TEXT[expanded.state]||EMPTY_TEXT.error);
   row.setAttribute('aria-hidden','true');
   group.append(row);
  }
  return group;
 }

 function broadcastOption(person,item,index){
  const selected=isSelected(person.login,index);
  const row=el('div','vod-option');
  row.setAttribute('role','option');
  row.setAttribute('id','broadcast-'+index);
  row.setAttribute('aria-selected',String(selected));
  row.setAttribute('aria-posinset',String(index+1));
  row.setAttribute('aria-setsize',String(expanded.items.length));
  const title=String(item.title||'');
  const date=vodDate(item.createdAt);
  const length=vodLength(item.lengthSeconds);
  row.setAttribute('aria-label',[title,date,length].filter(Boolean).join(', '));
  row.setAttribute('title',title);
  row.append(el('span','vod-title',title),el('span','vod-meta',date),el('span','vod-meta',length));
  row.addEventListener('click',event=>{
   if(guarded(event))return;
   openInput(String(item.url||''));
  });
  optionNodes.set(key(person.login,index),row);
  return row;
 }

 // Scrolls the list as little as needed to show `first` through `last`; if they don't all fit, `first`
 // goes to the top. Returns whether the list moved.
 function reveal(first,last){
  if(!listbox||!first||!last||typeof first.offsetTop!=='number'||typeof listbox.scrollTop!=='number')return false;
  const height=listbox.clientHeight||0;
  const start=first.offsetTop,end=last.offsetTop+(last.offsetHeight||0);
  const before=listbox.scrollTop;
  if(start<before)listbox.scrollTop=start;
  else if(end>before+height)listbox.scrollTop=Math.min(start,end-height);
  return listbox.scrollTop!==before;
 }

 // A person and their broadcast list, as much of it as fits.
 function revealExpanded(){
  if(!expanded)return false;
  return reveal(optionNodes.get(key(expanded.login,-1)),groupNode);
 }

 // ---- The pointer guard (review finding 4) ----
 // Opening broadcasts with the pointer never scrolls at the click. When they arrive and the list has to scroll
 // to show them, a click at the same spot, before the pointer moves, is ignored instead of playing whatever
 // broadcast now sits under it.

 function pointOf(event){
  return event&&typeof event.clientX==='number'&&typeof event.clientY==='number'?{x:event.clientX,y:event.clientY}:null;
 }

 function near(a,b){
  return Math.abs(a.x-b.x)<=POINTER_SLOP&&Math.abs(a.y-b.y)<=POINTER_SLOP;
 }

 function guarded(event){
  if(!guard||!guard.armed)return false;
  const point=pointOf(event);
  if(point&&near(point,guard.point)){
   guard=null;
   return true;
  }
  guard=null;
  return false;
 }

 function onPointerMove(event){
  const point=pointOf(event);
  if(guard&&point&&!near(point,guard.point))guard=null;
 }

 // ---- Keys and actions ----

 // The rows the arrow keys walk: every person, and the open person's broadcasts under them.
 function stops(){
  const list=[];
  for(const person of people){
   list.push({login:person.login,vod:-1});
   if(expanded&&expanded.login===person.login&&expanded.state==='ready'){
    expanded.items.forEach((_,index)=>list.push({login:person.login,vod:index}));
   }
  }
  return list;
 }

 function moveSelection(step){
  const list=stops();
  if(!list.length)return false;
  guard=null;
  if(!selection){
   // With nothing selected (the typed text was chosen), ↓ comes back to the top match; ↑ is the field's.
   if(step<0)return false;
   textChosen=false;
   selection={...list[0]};
  }else{
   const at=list.findIndex(stop=>stop.login===selection.login&&stop.vod===selection.vod);
   const next=at+step;
   if(next<0&&field.value!==''){
    // ↑ from the top match: Return now opens the typed text, as in Safari's address field.
    selection=null;
    textChosen=true;
   }else{
    selection={...list[Math.max(0,Math.min(list.length-1,next))]};
   }
  }
  render();
  return true;
 }

 function personFor(login){
  return people.find(person=>person.login===login)||null;
 }

 // Return or a click on a person. Someone known to be offline shows their broadcasts here (no live check);
 // anyone else is opened, and if the check finds them offline their broadcasts come under their row.
 function activatePerson(login){
  const person=personFor(login);
  selection={login,vod:-1};
  if(person&&person.live===false&&canBrowse(person)){
   if(!expanded||expanded.login!==login)openBroadcasts(login,null);
   else render();
   return;
  }
  if(expanded&&expanded.login!==login){
   expanded=null;
  }
  checkingLogin=canBrowse(person)?login:null;
  render();
  openInput(login,checkingLogin?'checking':'standalone');
 }

 function openSelection(){
  if(selection.vod<0){
   activatePerson(selection.login);
   return;
  }
  const item=expanded&&expanded.login===selection.login&&expanded.items[selection.vod];
  if(item)openInput(String(item.url||''));
 }

 // → on a person: their broadcasts open under the row, whether or not they are live (#74).
 function openBroadcasts(login,pointerEvent){
  const person=personFor(login);
  if(!canBrowse(person))return;
  const point=pointOf(pointerEvent);
  expanded={login,state:'loading',items:[],byPointer:!!point};
  guard=point?{point,armed:false}:null;
  vodsTarget='inline';
  selection={login,vod:-1};
  render();
  // The keyboard brings the list into view at once; the pointer leaves the clicked row where it is.
  if(!point)revealExpanded();
  announce(LOADING_TEXT);
  post('open-vods',{login});
 }

 // Closing the list outdates a lookup still under way, as an edit does (#67 F-session).
 function closeBroadcasts(keepPerson){
  if(!expanded)return;
  const login=expanded.login;
  expanded=null;
  guard=null;
  vodsTarget='ignore';
  announce('');
  if(keepPerson){
   selection={login,vod:-1};
   post('open-edit',{});
   render();
  }
 }

 // Review finding 5: when the broadcasts arrive, the person and as many of them as fit come into view.
 function showInlineVods(value){
  const items=value.state==='ready'&&Array.isArray(value.items)?value.items.slice(0,OFFLINE_ROWS):[];
  let state=value.state;
  if(state==='ready'&&!items.length)state='none';
  if(!['loading','ready','none','error'].includes(state))return;
  expanded={...expanded,state,items};
  if(selection&&selection.login===expanded.login&&selection.vod>=items.length){
   selection={login:expanded.login,vod:-1};
  }
  render();
  const moved=revealExpanded();
  if(guard)guard.armed=moved&&expanded.byPointer;
  if(guard&&!guard.armed)guard=null;
  if(state==='loading')announce(LOADING_TEXT);
  else if(state==='ready')announce(items.length===1?'1 recent broadcast':items.length+' recent broadcasts');
  else announce(EMPTY_TEXT[state]||EMPTY_TEXT.error);
 }

 // ---- offline-vods: under a person, or the #32 list in place of the suggestions ----

 function onOfflineVods(data){
  const value=unwrap(data);
  if(!value||typeof value!=='object')return;
  if(vodsTarget==='ignore')return;
  if(vodsTarget==='checking'){
   const person=personFor(checkingLogin);
   if(!person)return;
   if(value.state!=='loading'){
    // The check found them offline: what follows is an ordinary open list.
    submitted=false;
    pendingInput=null;
    vodsTarget='inline';
   }
   if(!expanded||expanded.login!==person.login)expanded={login:person.login,state:'loading',items:[],byPointer:false};
   showInlineVods(value);
   return;
  }
  if(vodsTarget==='inline'){
   if(expanded)showInlineVods(value);
   return;
  }
  renderOfflineVods(value);
  // The check has answered: the same channel may be opened again.
  if(value.state!=='loading')pendingInput=null;
 }

 function renderOfflineVods(value){
  const box=document.getElementById('offline-vods');
  const busy=document.getElementById('offline-busy');
  const empty=document.getElementById('offline-empty');
  const list=document.getElementById('offline-list');
  if(!box||!busy||!empty||!list)return;
  const items=value.state==='ready'&&Array.isArray(value.items)?value.items.slice(0,OFFLINE_ROWS):[];
  const message=EMPTY_TEXT[value.state]||'';
  busy.hidden=value.state!=='loading';
  empty.textContent=message;
  empty.hidden=!message;
  list.replaceChildren(...items.map(vodRow));
  list.hidden=!items.length;
  box.hidden=busy.hidden&&empty.hidden&&list.hidden;
  standaloneState=box.hidden?'idle':String(value.state);
  const showing=!box.hidden;
  if(showing!==standalone){
   standalone=showing;
   render();
  }
 }

 function clearOfflineVods(){
  renderOfflineVods({state:'idle'});
 }

 // Titles are untrusted: each row is built from text, never from markup.
 function vodRow(item){
  const row=document.createElement('li');
  const button=document.createElement('button');
  button.setAttribute('type','button');
  button.setAttribute('class','vod-row');
  button.setAttribute('title',String(item.title||''));
  const title=document.createElement('span');
  title.setAttribute('class','vod-title');
  title.textContent=String(item.title||'');
  const date=document.createElement('span');
  date.setAttribute('class','vod-meta');
  date.textContent=vodDate(item.createdAt);
  const length=document.createElement('span');
  length.setAttribute('class','vod-meta');
  length.textContent=vodLength(item.lengthSeconds);
  button.append(title,date,length);
  button.addEventListener('click',()=>openInput(String(item.url||'')));
  row.append(button);
  return row;
 }

 function vodDate(createdAt){
  const date=new Date(createdAt);
  if(!createdAt||Number.isNaN(date.getTime()))return'';
  return date.toLocaleDateString(undefined,{month:'short',day:'numeric'});
 }

 // h:mm:ss, with hours unbounded so a 47-hour broadcast does not wrap at 24.
 function vodLength(seconds){
  const total=Math.max(0,Math.floor(Number(seconds)||0));
  const two=n=>String(n).padStart(2,'0');
  return Math.floor(total/3600)+':'+two(Math.floor(total%3600/60))+':'+two(total%60);
 }

 // ---- Editing ----

 // Every edit is a new draft: the top match is reselected when global answers, no broadcasts are open, and
 // any pending answer is outdated.
 function onInput(){
  field.removeAttribute('aria-invalid');
  submitted=false;
  pendingInput=null;
  selection=null;
  textChosen=false;
  expanded=null;
  checkingLogin=null;
  guard=null;
  vodsTarget='ignore';
  awaitingText=field.value;
  announce('');
  clearOfflineVods();
  render();
  // #67 F-session: a new draft outdates any pending answer for the old text.
  post('open-edit',{});
  post('open-query',{text:field.value});
 }

 // Arrow keys that leave the text alone: with no caret position known, or with the caret at the end.
 function caretAtEnd(){
  const start=field.selectionStart,end=field.selectionEnd;
  if(typeof start!=='number'||typeof end!=='number')return true;
  return start===end&&end===field.value.length;
 }

 // Return acts on the list global has answered for the text now in the field. Pressed sooner (fast typing),
 // it waits for that answer, briefly, so it never opens the top match of an older text.
 function onReturn(event){
  if(standalone)return;
  if(awaitingText!==null&&typeof setTimeout==='function'){
   event.preventDefault();
   returnPending=true;
   if(returnTimer===null)returnTimer=setTimeout(finishReturn,RETURN_WAIT_MS);
   return;
  }
  if(!selection)return;
  event.preventDefault();
  openSelection();
 }

 function finishReturn(){
  if(returnTimer!==null&&typeof clearTimeout==='function')clearTimeout(returnTimer);
  returnTimer=null;
  if(!returnPending)return;
  returnPending=false;
  if(selection)openSelection();
  else if(field.value.trim())openInput(field.value);
 }

 // Escape steps back one level at a time: a pending live check is cancelled (closing, as before); open
 // broadcasts close; a finished #32 list goes back to the quick list; a draft is cleared; then the window closes.
 function onEscape(){
  if(vodsTarget==='checking'&&submitted){
   post('open-cancel',{});
  }else if(expanded){
   closeBroadcasts(true);
  }else if(standalone&&standaloneState!=='loading'){
   field.value='';
   onInput();
  }else if(!submitted&&field.value!==''){
   field.value='';
   onInput();
  }else{
   post('open-cancel',{});
  }
 }

 function onKeyDown(event){
  if(event.isComposing)return;
  switch(event.key){
  case'ArrowDown':
  case'ArrowUp':
   if(!standalone&&moveSelection(event.key==='ArrowDown'?1:-1))event.preventDefault();
   return;
  case'ArrowRight':
   if(standalone||!selection||selection.vod>=0||!caretAtEnd())return;
   if(expanded&&expanded.login===selection.login){
    event.preventDefault();
    if(expanded.state==='ready'&&expanded.items.length){
     selection={login:selection.login,vod:0};
     render();
    }
    return;
   }
   if(canBrowse(personFor(selection.login))){
    event.preventDefault();
    openBroadcasts(selection.login,null);
   }
   return;
  case'ArrowLeft':
   if(!expanded||!selection||selection.login!==expanded.login||!caretAtEnd())return;
   event.preventDefault();
   closeBroadcasts(true);
   return;
  case'Enter':
   onReturn(event);
   return;
  case'Escape':
   event.preventDefault();
   onEscape();
  }
 }

 form.addEventListener('submit',submit);
 field.addEventListener('input',onInput);
 document.addEventListener('keydown',onKeyDown);
 window.addEventListener('focus',focusField);
 if(listbox){
  // A click in the list leaves focus, and the caret, in the field.
  listbox.addEventListener('mousedown',event=>event.preventDefault());
  listbox.addEventListener('mousemove',onPointerMove);
 }
 iina.onMessage('open-error',markInvalid);
 iina.onMessage('prefill',prefill);
 iina.onMessage('offline-vods',onOfflineVods);
 iina.onMessage('suggestions',onSuggestions);
 iina.onMessage('suggestions-status',onSuggestionsStatus);
 focusField();
 // Global holds page messages until the listeners above exist (loadFile clears them in IINA 1.5.1).
 post('open-ready',{});
})();
