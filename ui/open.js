"use strict";
// The Open Stream window (#50). Global parses the input and answers only when it is invalid.
// B6c (#32): for a channel a player found offline, global prefills the field and sends its recent broadcasts.
(function(){
 const form=document.getElementById('open-form');
 const field=document.getElementById('open-input');

 function focusField(){
  field.focus();
 }

 function submit(event){
  event.preventDefault();
  const input=field.value;
  if(!input.trim())return;
  iina.postMessage('open-stream',{input});
 }

 // The rejected text stays in the field for correction.
 function markInvalid(){
  field.setAttribute('aria-invalid','true');
  focusField();
 }

 // B6c: the broadcast list. Its elements are looked up when used, so a page without them still works.
 const OFFLINE_ROWS=10;
 const EMPTY_TEXT={none:'No recent broadcasts',error:'Recent broadcasts unavailable'};

 function prefill(data){
  if(data&&typeof data.input==='string')field.value=data.input;
 }

 function onOfflineVods(data){
  let value=null;
  try{
   value=JSON.parse(decodeURIComponent(data.encoded));
  }catch(_){
   return;
  }
  if(value&&typeof value==='object')renderOfflineVods(value);
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
  button.addEventListener('click',()=>iina.postMessage('open-stream',{input:String(item.url||'')}));
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

 function onInput(){
  field.removeAttribute('aria-invalid');
  clearOfflineVods();
 }

 function onKeyDown(event){
  if(event.key!=='Escape')return;
  event.preventDefault();
  iina.postMessage('open-cancel',{});
 }

 form.addEventListener('submit',submit);
 field.addEventListener('input',onInput);
 document.addEventListener('keydown',onKeyDown);
 window.addEventListener('focus',focusField);
 iina.onMessage('open-error',markInvalid);
 iina.onMessage('prefill',prefill);
 iina.onMessage('offline-vods',onOfflineVods);
 focusField();
 // Global holds page messages until the listeners above exist (loadFile clears them in IINA 1.5.1).
 iina.postMessage('open-ready',{});
})();
