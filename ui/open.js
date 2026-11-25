"use strict";
// The Open Stream window (#50). Global parses the input and answers only when it is invalid.
// B6c (#32): for a channel a player found offline, global prefills the field and sends its recent broadcasts.
// #74: the quick list. The field is a combobox driving a listbox of people from watch history; it keeps focus,
// and the highlighted row is shown with aria-activedescendant. → opens a person's broadcasts under their row.
(function(){
 const form=document.getElementById('open-form');
 const field=document.getElementById('open-input');
 // Looked up once; a page without them (the A1 and #67 doubles) still works.
 const listbox=document.getElementById('suggestions');
 const area=document.getElementById('suggestions-area');
 const emptyGlyph=document.getElementById('suggestions-empty');

 const OFFLINE_ROWS=10;
 const EMPTY_TEXT={none:'No recent broadcasts',error:'Recent broadcasts unavailable'};

 // People as global last sent them, in its order. Live status never reorders them.
 let people=[];
 let heardSuggestions=false;
 // The highlighted row: {login, vod} where vod is -1 for the person row or a broadcast index under them.
 // `taken` is false for the row highlighted by default at rest (Return opens it); the first arrow key takes
 // that highlight over in place, and it then shows in the accent colour.
 let selection=null;
 // The person whose broadcasts are open under their row: {login, state, items}.
 let expanded=null;
 // Who an offline-vods message is for: 'inline' (the expanded person), 'standalone' (the #32 list after a
 // submit or a prefill, and by default), or 'ignore' (an answer outdated by typing or by closing the list).
 let vodsTarget='standalone';
 // A submit or prefill is pending: Escape then cancels, as it always has, instead of clearing the field.
 let submitted=false;
 // What the pending submit opens. A double click or a held Return on the same row posts it once, since
 // every post may start a player.
 let pendingInput=null;
 // The #32 list is showing in place of the suggestions.
 let standalone=false;
 let optionNodes=new Map();
 // The highlighted row last scrolled into view, so a status update never scrolls the list under the pointer.
 let revealedKey=null;

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

 function submit(event){
  event.preventDefault();
  const input=field.value;
  if(!input.trim())return;
  openInput(input);
 }

 function openInput(input){
  if(submitted&&input===pendingInput)return;
  pendingInput=input;
  submitted=true;
  vodsTarget='standalone';
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
  const has=login=>people.some(person=>person.login===login);
  if(expanded&&!has(expanded.login))closeBroadcasts(false);
  if(selection&&!has(selection.login)){
   selection=selection.taken&&people.length?{login:people[0].login,vod:-1,taken:true}:null;
  }
  if(!selection&&text===''&&field.value===''&&people.length){
   selection={login:people[0].login,vod:-1,taken:false};
  }
  render();
 }

 // Status changes only the marks: the order, the highlight and the scroll stay.
 function onSuggestionsStatus(data){
  const value=unwrap(data);
  const status=value&&value.status;
  if(!status||typeof status!=='object')return;
  for(const person of people){
   if(!Object.prototype.hasOwnProperty.call(status,person.login))continue;
   const live=status[person.login];
   person.live=live===true||live===false?live:null;
  }
  render();
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
  return person.provider==='twitch';
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
  if(listbox){
   const children=[];
   people.forEach((person,index)=>{
    children.push(personRow(person,index));
    if(expanded&&expanded.login===person.login)children.push(broadcastGroup(person));
   });
   listbox.replaceChildren(...children);
  }
  const active=selection&&optionNodes.get(key(selection.login,selection.vod));
  if(active&&showList){
   field.setAttribute('aria-activedescendant',active.id);
   const shown=key(selection.login,selection.vod);
   if(shown!==revealedKey)reveal(active);
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
  const row=el('div','person'+(selected&&selection.taken?' active':'')+(open?' expanded':''));
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
   disclose=el('span','disclose');
   disclose.setAttribute('aria-hidden','true');
   disclose.setAttribute('title','Recent broadcasts');
   row.append(disclose);
  }else{
   row.append(el('span'));
  }
  row.addEventListener('click',event=>{
   if(disclose&&event&&event.target===disclose){
    if(open)closeBroadcasts(true);
    else openBroadcasts(person.login);
    return;
   }
   openPerson(person.login);
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
   row.setAttribute('role','status');
   row.setAttribute('aria-label','Loading recent broadcasts');
   row.append(el('span','busy-indicator'));
   group.append(row);
  }else if(expanded.state==='ready'){
   expanded.items.forEach((item,index)=>group.append(broadcastOption(person,item,index)));
  }else{
   const row=el('div','vod-status',EMPTY_TEXT[expanded.state]||EMPTY_TEXT.error);
   row.setAttribute('role','status');
   group.append(row);
  }
  return group;
 }

 function broadcastOption(person,item,index){
  const selected=isSelected(person.login,index);
  const row=el('div','vod-option'+(selected&&selection.taken?' active':''));
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
  row.addEventListener('click',()=>openInput(String(item.url||'')));
  optionNodes.set(key(person.login,index),row);
  return row;
 }

 // Keeps the highlighted row inside the list's scroll area; a person whose broadcasts open goes to the top.
 function reveal(node,top=false){
  if(!listbox||typeof node.offsetTop!=='number'||typeof listbox.scrollTop!=='number')return;
  const height=listbox.clientHeight||0;
  const start=node.offsetTop,end=start+(node.offsetHeight||0);
  if(top||start<listbox.scrollTop)listbox.scrollTop=start;
  else if(end>listbox.scrollTop+height)listbox.scrollTop=end-height;
 }

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
  // With nothing highlighted, ↑ leaves the caret to the field as usual; the list doesn't wrap.
  if(!selection&&step<0)return false;
  if(!selection){
   selection={...list[0],taken:true};
  }else if(!selection.taken){
   selection={...selection,taken:true};
  }else{
   const at=list.findIndex(stop=>stop.login===selection.login&&stop.vod===selection.vod);
   const next=at+step;
   if(next<0&&field.value!==''){
    selection=null;
   }else{
    selection={...list[Math.max(0,Math.min(list.length-1,next))],taken:true};
   }
  }
  render();
  return true;
 }

 function personFor(login){
  return people.find(person=>person.login===login)||null;
 }

 function openPerson(login){
  field.value=login;
  closeBroadcasts(false);
  selection={login,vod:-1,taken:true};
  render();
  openInput(login);
 }

 function openSelection(){
  if(selection.vod<0){
   openPerson(selection.login);
   return;
  }
  const item=expanded&&expanded.login===selection.login&&expanded.items[selection.vod];
  if(item)openInput(String(item.url||''));
 }

 // → on a person: their broadcasts open under the row, whether or not they are live (#74).
 function openBroadcasts(login){
  const person=personFor(login);
  if(!person||!canBrowse(person))return;
  expanded={login,state:'loading',items:[]};
  vodsTarget='inline';
  selection={login,vod:-1,taken:true};
  render();
  const row=optionNodes.get(key(login,-1));
  if(row)reveal(row,true);
  post('open-vods',{login});
 }

 // Closing the list outdates a lookup still under way, as an edit does (#67 F-session).
 function closeBroadcasts(keepPerson){
  if(!expanded)return;
  const login=expanded.login;
  expanded=null;
  vodsTarget='ignore';
  if(keepPerson){
   selection={login,vod:-1,taken:true};
   post('open-edit',{});
   render();
  }
 }

 function showInlineVods(value){
  const items=value.state==='ready'&&Array.isArray(value.items)?value.items.slice(0,OFFLINE_ROWS):[];
  let state=value.state;
  if(state==='ready'&&!items.length)state='none';
  if(!['loading','ready','none','error'].includes(state))return;
  expanded={login:expanded.login,state,items};
  if(selection&&selection.login===expanded.login&&selection.vod>=items.length){
   selection={login:expanded.login,vod:-1,taken:true};
  }
  render();
 }

 // ---- B6c: a typed channel's broadcast list, in place of the suggestions ----

 function onOfflineVods(data){
  const value=unwrap(data);
  if(!value||typeof value!=='object')return;
  if(vodsTarget==='ignore')return;
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

 // ---- Editing and keys ----

 // Every edit is a new draft: no highlight, no open broadcasts, and any pending answer is outdated.
 function onInput(){
  field.removeAttribute('aria-invalid');
  submitted=false;
  pendingInput=null;
  selection=null;
  expanded=null;
  vodsTarget='ignore';
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
     selection={login:selection.login,vod:0,taken:true};
     render();
    }
    return;
   }
   if(personFor(selection.login)&&canBrowse(personFor(selection.login))){
    event.preventDefault();
    openBroadcasts(selection.login);
   }
   return;
  case'ArrowLeft':
   if(!expanded||!selection||selection.login!==expanded.login||!caretAtEnd())return;
   event.preventDefault();
   closeBroadcasts(true);
   return;
  case'Enter':
   if(standalone||!selection)return;
   event.preventDefault();
   openSelection();
   return;
  case'Escape':
   event.preventDefault();
   if(expanded){
    closeBroadcasts(true);
   }else if(!submitted&&field.value!==''){
    field.value='';
    onInput();
   }else{
    post('open-cancel',{});
   }
  }
 }

 form.addEventListener('submit',submit);
 field.addEventListener('input',onInput);
 document.addEventListener('keydown',onKeyDown);
 window.addEventListener('focus',focusField);
 // A click in the list leaves focus, and the caret, in the field.
 if(listbox)listbox.addEventListener('mousedown',event=>event.preventDefault());
 iina.onMessage('open-error',markInvalid);
 iina.onMessage('prefill',prefill);
 iina.onMessage('offline-vods',onOfflineVods);
 iina.onMessage('suggestions',onSuggestions);
 iina.onMessage('suggestions-status',onSuggestionsStatus);
 focusField();
 // Global holds page messages until the listeners above exist (loadFile clears them in IINA 1.5.1).
 post('open-ready',{});
})();
