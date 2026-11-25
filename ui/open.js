"use strict";
// Open Stream (#50), recent broadcasts (#32), and local typing suggestions (#74).
(function(){
 const form=document.getElementById('open-form');
 const field=document.getElementById('open-input');
 const suggestions=document.getElementById('suggestions');
 const clearInput=document.getElementById('clear-input');
 const offlineBox=document.getElementById('offline-vods');
 const broadcastHeader=document.getElementById('broadcast-header');
 const broadcastName=document.getElementById('broadcast-name');
 const broadcastBack=document.getElementById('broadcast-back');
 let rows=[],options=[],selectedLogin=null;
 let requestedText=null,queryPending=false,submitting=false,browsing=false;

 function focusField(){
  field.focus();
 }

 function selectedIndex(){
  return rows.findIndex(row=>row.login===selectedLogin);
 }

 function submit(event){
  event.preventDefault();
  const index=selectedIndex();
  const input=!queryPending&&suggestions&&!suggestions.hidden&&index>=0?rows[index].login:field.value;
  openStream(input);
 }

 function openStream(input){
  if(!input.trim())return;
  submitting=true;
  iina.postMessage('open-stream',{input});
 }

 // The rejected text stays in the field for correction.
 function markInvalid(){
  submitting=false;
  field.setAttribute('aria-invalid','true');
  focusField();
 }

 function decode(data){
  try{
   return typeof data?.encoded==='string'?JSON.parse(decodeURIComponent(data.encoded)):data;
  }catch(_){
   return null;
  }
 }

 function syncCombobox(){
  if(!suggestions)return;
  const index=selectedIndex();
  const visible=!suggestions.hidden&&!queryPending&&rows.length>0;
  suggestions.setAttribute('aria-busy',String(queryPending));
  field.setAttribute('aria-expanded',String(visible));
  options.forEach((option,i)=>option.setAttribute('aria-selected',String(i===index)));
  if(visible&&index>=0)field.setAttribute('aria-activedescendant',options[index].id);
  else field.removeAttribute('aria-activedescendant');
 }

 function select(index,scroll=true){
  selectedLogin=rows[index]?.login??null;
  syncCombobox();
  if(scroll&&index>=0)options[index]?.scrollIntoView?.({block:'nearest'});
 }

 function markStatus(option,mark,row){
  const name=row.displayName||row.login;
  const status=row.live===true?'live':row.live===false?'offline':'unknown';
  mark.setAttribute('class','live-mark '+status);
  option.setAttribute('aria-label',status==='unknown'?name:name+', '+status);
  option.setAttribute('aria-description',(status==='unknown'?'Live status unavailable. ':'')+'Right Arrow for recent broadcasts');
  mark.setAttribute('title',status==='live'?'Live':status==='offline'?'Offline':'Live status unavailable');
 }

 function suggestionRow(row,index){
  const option=document.createElement('div');
  option.setAttribute('class','suggestion-row');
  option.setAttribute('id','suggestion-'+encodeURIComponent(row.login));
  option.setAttribute('role','option');
  option.setAttribute('aria-posinset',String(index+1));
  option.setAttribute('aria-setsize',String(rows.length));
  const name=document.createElement('span');
  name.setAttribute('class','suggestion-name');
  name.textContent=row.displayName||row.login;
  const mark=document.createElement('span');
  mark.setAttribute('aria-hidden','true');
  markStatus(option,mark,row);
  const disclosure=document.createElement('span');
  disclosure.setAttribute('class','suggestion-disclosure');
  disclosure.setAttribute('aria-hidden','true');
  disclosure.setAttribute('title','Recent broadcasts');
  option.append(mark,name,disclosure);
  // A pointer activation opens the channel; the trailing disclosure is the separate broadcast action.
  option.addEventListener('mousedown',event=>event.preventDefault());
  option.addEventListener('click',event=>{
   if(queryPending)return;
   select(index,false);
   if(event.target===disclosure)openBroadcasts();
   else openStream(row.login);
  });
  return option;
 }

 function onSuggestions(data){
  const value=decode(data);
  if(!suggestions||!Array.isArray(value?.rows))return;
  // A queued reply to an older keystroke must not become actionable.
  if(requestedText!==null&&value.text!==requestedText)return;
  queryPending=false;
  rows=value.rows;
  if(selectedLogin!==null&&selectedIndex()<0)selectedLogin=rows[0]?.login??null;
  options=rows.map(suggestionRow);
  suggestions.replaceChildren(...options);
  syncCombobox();
  if(!suggestions.hidden&&selectedIndex()>=0)options[selectedIndex()].scrollIntoView?.({block:'nearest'});
 }

 function onStatus(data){
  const status=decode(data)?.status;
  if(!status)return;
  rows.forEach((row,index)=>{
   if(Object.hasOwn(status,row.login)){
    row.live=status[row.login];
    markStatus(options[index],options[index].children[0],row);
   }
  });
 }

 // B6c: preserve the existing broadcast row limit and typed-channel error states.
 const OFFLINE_ROWS=10;
 const EMPTY_TEXT={none:'No recent broadcasts',error:'Recent broadcasts unavailable'};

 function prefill(data){
  if(data&&typeof data.input==='string'){
   field.value=data.input;
   if(clearInput)clearInput.hidden=!field.value;
   submitting=false;
  }
 }

 function onOfflineVods(data){
  const value=decode(data);
  if(value&&typeof value==='object'){
   if(value.state!=='loading')submitting=false;
   renderOfflineVods(value);
  }
 }

 function renderOfflineVods(value){
  const busy=document.getElementById('offline-busy');
  const empty=document.getElementById('offline-empty');
  const list=document.getElementById('offline-list');
  if(!offlineBox||!busy||!empty||!list)return;
  const items=value.state==='ready'&&Array.isArray(value.items)?value.items.slice(0,OFFLINE_ROWS):[];
  const message=EMPTY_TEXT[value.state]||'';
  busy.hidden=value.state!=='loading';
  empty.textContent=message;
  empty.hidden=!message;
  list.replaceChildren(...items.map(vodRow));
  list.hidden=!items.length;
  offlineBox.hidden=busy.hidden&&empty.hidden&&list.hidden;
  if(broadcastHeader)broadcastHeader.hidden=!browsing||offlineBox.hidden;
  if(suggestions)suggestions.hidden=!offlineBox.hidden;
  syncCombobox();
 }

 function clearOfflineVods(){
  browsing=false;
  renderOfflineVods({state:'idle'});
 }

 function openBroadcasts(){
  const row=rows[selectedIndex()];
  if(!row||queryPending)return;
  browsing=true;
  broadcastName.textContent=row.displayName||row.login;
  renderOfflineVods({state:'loading'});
  iina.postMessage('open-vods',{login:row.login});
 }

 function returnToSuggestions(){
  const wasBrowsing=browsing;
  clearOfflineVods();
  focusField();
  // Revoke the archive lookup. Only the typed-channel path needs its frame restored.
  if(wasBrowsing)iina.postMessage('open-edit',{});
  else requestSuggestions();
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
  button.addEventListener('click',()=>openStream(String(item.url||'')));
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

 function requestSuggestions(){
  // #67 F-session: a new draft outdates any pending answer for the old text.
  iina.postMessage('open-edit',{});
  if(suggestions){
   requestedText=field.value;
   queryPending=true;
   syncCombobox();
   iina.postMessage('open-query',{text:requestedText});
  }
 }

 function clearField(){
  field.value='';
  select(-1);
  onInput();
  focusField();
 }

 function onInput(){
  submitting=false;
  if(clearInput)clearInput.hidden=!field.value;
  field.removeAttribute('aria-invalid');
  clearOfflineVods();
  requestSuggestions();
 }

 function onFieldKeyDown(event){
  if(event.isComposing||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
  if(!suggestions||suggestions.hidden||!rows.length||queryPending)return;
  const index=selectedIndex();
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();
   const next=index<0?(event.key==='ArrowDown'?0:rows.length-1):index+(event.key==='ArrowDown'?1:-1);
   select(Math.max(0,Math.min(rows.length-1,next)));
  }else if(index>=0&&(event.key==='Tab'||event.key==='ArrowRight'&&
    (field.selectionEnd===undefined||field.selectionStart===field.value.length))){
   event.preventDefault();
   openBroadcasts();
   // Tab enters the broadcast controls; subsequent Tabs keep their normal focus behavior.
   if(event.key==='Tab')broadcastBack?.focus();
  }
 }

 function onKeyDown(event){
  if(event.key!=='Escape'||event.isComposing)return;
  event.preventDefault();
  // While the original live check is in flight, closing is what revokes its player open.
  if(submitting){
   iina.postMessage('open-cancel',{});
  }else if(browsing||offlineBox&&!offlineBox.hidden){
   returnToSuggestions();
  }else if(field.value){
   clearField();
  }else{
   iina.postMessage('open-cancel',{});
  }
 }

 form.addEventListener('submit',submit);
 field.addEventListener('input',onInput);
 field.addEventListener('keydown',onFieldKeyDown);
 clearInput?.addEventListener('click',clearField);
 broadcastBack?.addEventListener('click',returnToSuggestions);
 document.addEventListener('keydown',onKeyDown);
 window.addEventListener('focus',()=>{
  if(!document.activeElement||document.activeElement===document.body)focusField();
 });
 iina.onMessage('open-error',markInvalid);
 iina.onMessage('prefill',prefill);
 iina.onMessage('offline-vods',onOfflineVods);
 iina.onMessage('suggestions',onSuggestions);
 iina.onMessage('suggestions-status',onStatus);
 focusField();
 // Global holds page messages until the listeners above exist (loadFile clears them in IINA 1.5.1).
 iina.postMessage('open-ready',{});
})();
