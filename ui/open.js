"use strict";
// The Open Stream window (#50). Global parses the input and answers only when it is invalid.
// B6c (#32): for a channel a player found offline, global prefills the field and sends its recent broadcasts.
// #74: the quick list. The field is a combobox driving a listbox of people from watch history; it keeps focus,
// and the selected row is shown with aria-activedescendant. Whenever the list has people the top one is
// selected, so Return opens the top match through global's live check. → opens a person's broadcasts under
// their row, as does an offline answer to that check. The window keeps one height (global); the list scrolls.
// Phase 3 (W-21): each row is mock A's (docs/design/finding-2026-11-22/open-stream/direction-a): an initial
// avatar carrying the live mark, the name, the Twitch mark, "category · title" and viewers when live, and the
// last broadcast's title, an age and the broadcasts chevron when offline. Details arrive with status
// (suggestions-status {status, details}).
// Phase 2 rev 2 (TESTS-74 R1-R14; look: mock-74-search variant 1): global also sends Twitch search for the typed
// text (suggestions-search {text, known, others}). Known people it found are appended to the end of "your
// channels"; other channels follow below a hairline. They are only ever appended, so no row moves under the person,
// and they go at the next keystroke. A spinner in the field shows while a search is out (suggestions-search-pending).
(function(){
 const form=document.getElementById('open-form');
 const field=document.getElementById('open-input');
 // Looked up once; a page without them (the A1 and #67 doubles) still works.
 const listbox=document.getElementById('suggestions');
 const area=document.getElementById('suggestions-area');
 const emptyGlyph=document.getElementById('suggestions-empty');
 const announcer=document.getElementById('announce');
 const clearButton=document.getElementById('open-clear');
 const searchSpinner=document.getElementById('search-pending');
 const SVG_NS='http://www.w3.org/2000/svg';
 // Mock A's Twitch mark (direction-a/a.js ICON.twitch).
 const TWITCH_PATH='M3.2 1 1.8 3.8V13h3.3v2h1.8l2-2h2.7L15 9.6V1H3.2Zm10.3 7.9-1.9 1.9H8.8l-1.9 1.9v-1.9H3.6V2.5h9.9v6.4ZM10.2 4.6h1.4v3.6h-1.4V4.6Zm-3.5 0h1.4v3.6H6.7V4.6Z';
 const DAY_MS=86400000;

 const OFFLINE_ROWS=10;
 const EMPTY_TEXT={none:'No recent broadcasts',error:'Recent broadcasts unavailable'};
 const LOADING_TEXT='Loading recent broadcasts';
 // A Return pressed before global has answered the latest text waits this long for the answer.
 const RETURN_WAIT_MS=400;
 // R3: at most 10 other channels, and at most 10 known people appended to your channels.
 const SEARCH_ROWS=10;
 // R10: the two groups' names, heard by VoiceOver and never drawn.
 const YOUR_CHANNELS='Your channels';
 const OTHER_CHANNELS='Other channels';
 // P-D: the search spinner shows only once a request has been out this long, so a quick answer never flickers it.
 const SPINNER_DELAY_MS=150;
 // R3 (src/twitch-vods.js searchText): text global may search, once trimmed. Anything else gets no other channels.
 const SEARCHABLE=/^[\p{L}\p{M}\p{Nd}_ ]{2,40}$/u;
 // A Twitch login (src/history.js): only such a typed name gets the Twitch mark and the broadcasts chevron (P-A).
 const TWITCH_LOGIN=/^[A-Za-z0-9_]{1,25}$/;
 // A word starts after a character that is not part of a word (src/history.js matchRank).
 const WORD_CHARACTER=/[\p{L}\p{N}\p{M}]/u;

 // People as global last sent them, in its order. Live status never reorders them.
 let people=[];
 // Search rows for the text in the field (R1), each carrying its own details (R12): known people appended to
 // your channels, and other channels. searchText is that text, trimmed and lower-cased; null when there are none.
 let known=[],others=[],searchText=null;
 // Your channels that a list for the same text added after known people were drawn (late follows, D2): they go
 // below the known rows, so those never move.
 let late=[];
 // P-B: the other channels of the last search answer. Each keystroke shows those that still match the new text, until
 // the new answer replaces them. Emptied when the field is, on a prefill and on an account change.
 let answered=[];
 // A search request for the text in the field is out (R9).
 let searchPending=false;
 // The field's text at the last edit or prefill, to tell an edit that changes the text from one that doesn't (F2).
 let draftText='';
 // P-D: the spinner's delay, and whether it is showing.
 let spinnerTimer=null,spinnerShown=false;
 let heardSuggestions=false;
 // The selected row: {login, vod}, where vod is -1 for the person row or a broadcast index under them.
 let selection=null;
 // ↑ from the top match while typing: the person chose the typed text, so nothing is reselected until the
 // next edit and Return opens the text.
 let textChosen=false;
 // The person moved the selection (an arrow key, or opening someone): new lists then keep that person
 // selected wherever they move. Until then the top row stays selected, so Return opens the new top (P2).
 // Typing resets it.
 let moved=false;
 // What global last said about each login: {title, category, viewers} when live, {lastAt} when offline.
 // Kept across lists, so a row keeps its details while the person types (P5b).
 const details=new Map();
 // The person whose broadcasts are open under their row: {login, state, items, byPointer}.
 let expanded=null;
 // Who an offline-vods message is for:
 // 'inline'     the expanded person (after open-vods);
 // 'checking'   a person opened from the list, while global's live check runs; an offline answer shows their
 //              broadcasts under their row, so there is one broadcast list, with one set of keys;
 // 'standalone' the #32 list, after a typed submit or a prefill, and by default;
 // 'ignore'     an answer outdated by typing or by closing the list.
 let vodsTarget='standalone';
 let checkingLogin=null,checkingByPointer=false;
 // A submit or prefill is pending: Escape then cancels, as it always has, instead of clearing the field.
 let submitted=false;
 // What the pending submit opens. A double click or a held Return on the same row posts it once, since
 // every post may start a player.
 let pendingInput=null;
 // The #32 list is showing in place of the suggestions, and its state.
 let standalone=false,standaloneState='idle';
 // The text of the latest open-query that global has not answered yet, and a Return waiting for that answer.
 let awaitingText=null,returnPending=false,returnTimer=null,earlyReturn=false;
 let optionNodes=new Map(),groupNode=null;
 // The selected row last scrolled into view, so a status update never scrolls the list under the pointer.
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
  draftText=value.input;
  submitted=true;
  vodsTarget='standalone';
  selection=null;
  expanded=null;
  dropSearch();
  answered=[];
  endPending();
  render();
 }

 // ---- Suggestions ----

 // A row as global sends it (provider, login, displayName, live), keeping only fields of the right types.
 function cleanRows(rows){
  return rows.filter(row=>row&&typeof row.login==='string'&&row.login).map(row=>({
   login:row.login,
   provider:typeof row.provider==='string'?row.provider:'',
   displayName:typeof row.displayName==='string'&&row.displayName?row.displayName:row.login,
   live:row.live===true||row.live===false?row.live:null
  }));
 }

 // Every row on the list, in order: your channels (global's list, then known people the search found), then
 // other channels. A login appears once.
 function yourRows(){
  return people.concat(known,late);
 }

 // Every row drawn: your channels, or the typed-name row in their place, then other channels (kept ones included).
 function allRows(){
  const typed=typedRow();
  return yourRows().concat(typed?[typed]:[],others);
 }

 // I1 / P-B′: the rows the person can select, with the arrows, the pointer or Return. Other channels kept from the
 // text before are shown but are not among them until the answer for this text replaces them.
 function selectableRows(){
  return allRows().filter(person=>!person.kept);
 }

 // P-A′: when your channels are empty for the text and no selectable other channel is drawn (none yet, a search
 // still out, an answer with nothing, a failed search, or text never searched, R4), the typed text is a row, as a
 // channel: what Return opens. It is a placeholder, not a choice, so results that land replace it (I1's exception).
 function typedRow(){
  const text=field.value.trim();
  if(!text||standalone||!heardSuggestions||awaitingText!==null)return null;
  if(yourRows().length||others.some(person=>!person.kept))return null;
  return{login:text,provider:TWITCH_LOGIN.test(text)?'twitch':'',displayName:text,live:null,typed:true};
 }

 // The page's own match rule, as global's (src/history.js matchRank): the login or display name starts with the
 // text, or a word of the display name does.
 function matchesText(person,needle){
  const login=person.login.toLowerCase();
  const name=person.displayName.toLowerCase();
  if(login.startsWith(needle)||name.startsWith(needle))return true;
  let previous=null,offset=0;
  for(const character of name){
   if(previous!==null&&!WORD_CHARACTER.test(previous)&&name.startsWith(needle,offset))return true;
   previous=character;
   offset+=character.length;
  }
  return false;
 }

 // P-B: the other channels shown on a keystroke: the last answer's that still match the new text, if it may be
 // searched, and that are not on your channels.
 function othersStillMatching(text){
  const trimmed=text.trim();
  if(!SEARCHABLE.test(trimmed))return[];
  const needle=trimmed.toLowerCase();
  const yours=new Set(people.map(person=>person.login));
  return answered.filter(person=>!yours.has(person.login)&&matchesText(person,needle));
 }

 // I1's exception: when nothing is selected, the first selectable row becomes selected (R5(c), P-A′), unless the
 // person chose the typed text, a typed open is under way (a held or second Return would open a row drawn after the
 // first), or the #32 list shows.
 function selectFirstIfNone(){
  const rows=selectableRows();
  if(selection||textChosen||submitted||standalone||awaitingText!==null||!rows.length)return null;
  selection={login:rows[0].login,vod:-1};
  return rows[0];
 }

 function sameText(a,b){
  return String(a).trim().toLowerCase()===String(b).trim().toLowerCase();
 }

 function dropSearch(){
  people=people.concat(late);
  late=[];
  known=[];
  others=[];
  searchText=null;
 }

 function onSuggestions(data){
  const value=unwrap(data);
  if(!value||!Array.isArray(value.rows))return;
  const text=typeof value.text==='string'?value.text:'';
  let rows=cleanRows(value.rows);
  // F4: after an account change global re-sends the list with reset:true. The drawn search rows were the old
  // account's, so they go and the fresh list is drawn; the next search answer for this text draws afresh.
  if(value.reset===true){
   dropSearch();
   answered=[];
  }
  if(searchText!==null&&sameText(text,searchText)){
   // R8: a person already drawn from the search stays where they are until the next text.
   const drawn=new Set(known.concat(others).map(row=>row.login));
   rows=rows.filter(person=>!drawn.has(person.login));
   const before=new Set(people.map(person=>person.login));
   const inList=new Set(rows.map(person=>person.login));
   people=rows.filter(person=>before.has(person.login));
   if(others.length){
    // R8/F5: with other channels drawn, anyone this list adds would push them down: held until the next text.
    late=late.filter(person=>inList.has(person.login));
   }else{
    // D2: with only known people drawn, those it adds go below them, so no row already shown moves.
    late=rows.filter(person=>!before.has(person.login));
   }
  }else{
   people=rows;
   late=[];
   // Other channels kept from the text before (P-B) give way to anyone on your channels: one person once.
   others=others.filter(row=>!rows.some(person=>person.login===row.login));
  }
  heardSuggestions=true;
  if(awaitingText!==null&&text===awaitingText)awaitingText=null;
  const shown=selectableRows();
  const has=login=>shown.some(person=>person.login===login);
  if(expanded&&!has(expanded.login)){
   expanded=null;
   if(vodsTarget==='inline')vodsTarget='ignore';
  }
  // A selection the person did not move follows the top (P2); one they moved stays while its row does.
  if(selection&&(!moved||!has(selection.login)))selection=null;
  if(!selection&&!textChosen&&shown.length)selection={login:shown[0].login,vod:-1};
  render();
  if(earlyReturn){
   earlyReturn=false;
   if(selection&&field.value==='')openSelection();
  }
  if(returnPending&&awaitingText===null)finishReturn();
 }

 // Status and details change the rows in place: the same elements, so the selection, the scroll and
 // VoiceOver's place on the selected option all stay (P5).
 function onSuggestionsStatus(data){
  const value=unwrap(data);
  if(!value||typeof value!=='object')return;
  const status=value.status&&typeof value.status==='object'?value.status:{};
  const more=value.details&&typeof value.details==='object'?value.details:{};
  for(const login of Object.keys(more)){
   const detail=cleanDetail(more[login]);
   if(detail)details.set(login,detail);
   else details.delete(login);
  }
  for(const person of people.concat(late)){
   if(Object.prototype.hasOwnProperty.call(status,person.login)){
    const live=status[person.login];
    person.live=live===true||live===false?live:null;
   }
   const row=optionNodes.get(key(person.login,-1));
   if(row)fillRow(row,person);
  }
 }

 // R1, R5, R7, P-B: the search answer for the text in the field; an answer for any other text is dropped. The first
 // answer for a text replaces the other channels kept from the text before, in its order; a later one for the same
 // text only appends, so rows already shown keep their places. The selection stays on the same person if they are
 // still there; otherwise the first row is selected, and only then is it announced (R10).
 function onSuggestionsSearch(data){
  const value=unwrap(data);
  if(!value||typeof value.text!=='string')return;
  if(!field.value.trim()||!sameText(value.text,field.value))return;
  const textKey=value.text.trim().toLowerCase();
  if(searchText!==textKey){
   known=[];
   others=[];
  }
  const shown=new Set(yourRows().concat(others).map(row=>row.login));
  // Rows not yet on the list, each with the details it carries (search rows are not updated later, R12).
  const fresh=list=>{
   const rows=[];
   for(const row of Array.isArray(list)?list:[]){
    const [clean]=cleanRows([row]);
    if(!clean||shown.has(clean.login))continue;
    shown.add(clean.login);
    const detail=cleanDetail(row.details);
    if(detail)clean.detail=detail;
    rows.push(clean);
   }
   return rows;
  };
  // Known people go above the hairline, so once other channels are drawn they would push those down: they wait for
  // the next text, as late follows do (R8).
  const newKnown=others.length?[]:fresh(value.known);
  const newOthers=fresh(value.others);
  known=known.concat(newKnown).slice(0,SEARCH_ROWS);
  others=others.concat(newOthers).slice(0,SEARCH_ROWS);
  answered=others.slice();
  searchText=textKey;
  const rows=allRows();
  const has=login=>rows.some(person=>person.login===login);
  if(expanded&&!has(expanded.login)){
   expanded=null;
   if(vodsTarget==='inline')vodsTarget='ignore';
  }
  if(selection&&!has(selection.login))selection=null;
  const picked=selectFirstIfNone();
  render();
  if(picked)announce(spokenName(picked));
 }

 // R9: a search request for the field's text started or ended. Messages for any other text are ignored.
 function onSearchPending(data){
  const value=unwrap(data);
  if(!value||typeof value.text!=='string')return;
  if(!sameText(value.text,field.value))return;
  if(value.pending===true){
   searchPending=true;
   waitForSpinner();
  }else{
   endPending();
  }
  showSearchPending();
 }

 function waitForSpinner(){
  if(spinnerShown||spinnerTimer!==null)return;
  if(typeof setTimeout!=='function'){
   spinnerShown=true;
   showSearchPending();
   return;
  }
  spinnerTimer=setTimeout(()=>{
   spinnerTimer=null;
   spinnerShown=searchPending;
   showSearchPending();
  },SPINNER_DELAY_MS);
 }

 function endPending(){
  searchPending=false;
  if(spinnerTimer!==null&&typeof clearTimeout==='function')clearTimeout(spinnerTimer);
  spinnerTimer=null;
  spinnerShown=false;
 }

 // The spinner and the listbox's busy state go together, after the delay (R9, P-D).
 function showSearchPending(){
  if(searchSpinner)searchSpinner.hidden=!spinnerShown;
  if(!listbox)return;
  if(spinnerShown)listbox.setAttribute('aria-busy','true');
  else listbox.removeAttribute('aria-busy');
 }

 // A row's details: those its search row carried, or what suggestions-status last said about the login.
 function detailOf(person){
  return person.detail||details.get(person.login)||{};
 }

 // Only the fields a row shows, and only of the right types: the details are Twitch's text.
 function cleanDetail(detail){
  if(!detail||typeof detail!=='object')return null;
  const clean={};
  if(typeof detail.title==='string')clean.title=detail.title;
  if(typeof detail.category==='string')clean.category=detail.category;
  if(Number.isFinite(detail.viewers))clean.viewers=Math.max(0,Math.floor(detail.viewers));
  if(typeof detail.lastAt==='string'&&!Number.isNaN(Date.parse(detail.lastAt)))clean.lastAt=detail.lastAt;
  if(typeof detail.lastTitle==='string'&&detail.lastTitle.trim())clean.lastTitle=detail.lastTitle;
  return Object.keys(clean).length?clean:null;
 }

 // 950, 1.5K, 12.3K, 312K (mock A's sample-data.js compact).
 function compact(count){
  if(count>=10000)return(count/1000).toFixed(count>=100000?0:1).replace(/\.0$/,'')+'K';
  if(count>=1000)return(count/1000).toFixed(1).replace(/\.0$/,'')+'K';
  return String(count);
 }

 // Days up to two weeks, then weeks: "today", "2d", "3w" (mock A's ago).
 function daysSince(lastAt){
  return Math.round((Date.now()-Date.parse(lastAt))/DAY_MS);
 }

 function age(lastAt){
  const days=daysSince(lastAt);
  if(days<1)return'today';
  if(days<14)return days+'d';
  return Math.round(days/7)+'w';
 }

 function ageSpoken(lastAt){
  const days=daysSince(lastAt);
  if(days<1)return'today';
  if(days===1)return'yesterday';
  if(days<14)return days+' days ago';
  return Math.round(days/7)+' weeks ago';
 }

 // The VoiceOver name: name and live state, then what the row shows (mock A's spoken).
 function spokenName(person){
  const detail=detailOf(person);
  if(person.live===true){
   const parts=[person.displayName+', live'];
   if(Number.isFinite(detail.viewers))parts.push(detail.viewers.toLocaleString()+' viewers');
   if(detail.category)parts.push(detail.category);
   return parts.join(', ');
  }
  if(person.live===false){
   return person.displayName+', offline'+(detail.lastAt?', last live '+ageSpoken(detail.lastAt):'');
  }
  return person.displayName;
 }

 function markClass(person){
  if(person.live===true)return'mark live';
  return'mark unknown';
 }

 // The typed-name row opens as typed text does (the #32 list if offline), so it has no broadcasts of its own.
 function canBrowse(person){
  return!!person&&person.provider==='twitch'&&!person.typed&&!person.kept;
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
  if(clearButton)clearButton.hidden=field.value==='';
  const yours=yourRows();
  const typed=typedRow();
  const count=yours.length+others.length+(typed?1:0);
  field.setAttribute('aria-expanded',String(showList&&count>0));
  if(emptyGlyph)emptyGlyph.hidden=!(showList&&heardSuggestions&&!count&&field.value==='');
  optionNodes=new Map();
  groupNode=null;
  if(listbox){
   if(yours.length&&others.length){
    // Both groups (R10, R13): each a named group counted on its own, with the hairline between them. The hairline
    // is drawn only; VoiceOver hears the two group names instead.
    const hair=el('div','hair');
    hair.setAttribute('aria-hidden','true');
    listbox.replaceChildren(
     section(YOUR_CHANNELS,rowNodes(yours,0)),
     hair,
     section(OTHER_CHANNELS,rowNodes(others,yours.length)));
   }else{
    listbox.replaceChildren(...rowNodes(yours.concat(typed?[typed]:[],others),0));
   }
  }
  showSearchPending();
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

 // One set of rows, numbered within the set; ids count on from firstId so they stay unique across both groups.
 // The open person's broadcasts follow their row.
 function rowNodes(rows,firstId){
  const nodes=[];
  rows.forEach((person,index)=>{
   nodes.push(personRow(person,firstId+index,index+1,rows.length));
   if(expanded&&expanded.login===person.login){
    groupNode=broadcastGroup(person);
    nodes.push(groupNode);
   }
  });
  return nodes;
 }

 function section(name,nodes){
  const group=el('div','section');
  group.setAttribute('role','group');
  group.setAttribute('aria-label',name);
  group.append(...nodes);
  return group;
 }

 function personRow(person,id,position,size){
  const row=el('div','person');
  row.setAttribute('role','option');
  row.setAttribute('id','person-'+id);
  row.setAttribute('aria-selected',String(isSelected(person.login,-1)));
  row.setAttribute('aria-posinset',String(position));
  row.setAttribute('aria-setsize',String(size));
  // P-B′: a kept row is drawn but cannot be chosen until the answer for this text lands.
  if(person.kept)row.setAttribute('aria-disabled','true');
  fillRow(row,person);
  row.addEventListener('click',event=>{
   if(person.kept)return;
   const target=event&&event.target;
   const onChevron=!!target&&typeof target.getAttribute==='function'&&/\bdisclose\b/.test(target.getAttribute('class')||'');
   if(onChevron&&canBrowse(person)){
    if(expanded&&expanded.login===person.login)closeBroadcasts(true);
    else openBroadcasts(person.login,true);
    return;
   }
   activatePerson(person.login,true);
  });
  optionNodes.set(key(person.login,-1),row);
  return row;
 }

 // A row's content, mock A's: avatar (initial, with the live mark on it), name, Twitch mark, then either
 // "category · title" and viewers (live) or an age and the chevron (offline). Built from text, never markup.
 function fillRow(row,person){
  const open=!!expanded&&expanded.login===person.login;
  const detail=detailOf(person);
  // R13: an offline row is dimmed (name and avatar); live rows and rows of unknown status are not.
  row.setAttribute('class','person'+(open?' expanded':'')+(person.live===false?' dim':'')+(person.kept?' kept':''));
  row.setAttribute('aria-label',spokenName(person));
  // P-A: the typed name is nobody yet: no avatar letter and no live mark, only the place an avatar would take.
  const avatar=person.typed?el('span','avatar typed'):el('span','avatar',initial(person.displayName));
  avatar.setAttribute('aria-hidden','true');
  if(!person.typed&&avatar.style&&typeof avatar.style.setProperty==='function'){
   avatar.style.setProperty('--av',avatarColour(person.login));
  }
  if(!person.typed&&person.live!==false){
   const mark=el('span',markClass(person));
   if(person.live===null)mark.setAttribute('title','Status unavailable');
   avatar.append(mark);
  }
  const name=el('span','name',person.displayName);
  const platform=el('span','platform');
  platform.setAttribute('aria-hidden','true');
  if(person.provider==='twitch')platform.append(...twitchMark());
  let sub='',meta='';
  if(person.live===true){
   sub=[detail.category,detail.title].filter(Boolean).join(' · ');
   if(Number.isFinite(detail.viewers))meta=compact(detail.viewers);
  }else if(person.live===false){
   // Mock A's offline row: the last broadcast's title as the second line, when known, and its age.
   if(detail.lastTitle)sub=detail.lastTitle;
   if(detail.lastAt)meta=age(detail.lastAt);
  }
  const subNode=el('span','sub',sub);
  if(sub)subNode.setAttribute('title',sub);
  const metaNode=el('span','meta',meta);
  let tail;
  if(canBrowse(person)){
   // VoiceOver hears how to reach the broadcasts; the chevron says it to the eye. Offline rows always show it
   // (mock A's "2d ›"); live rows show it on hover, so the selected live row isn't a bar ending in "›".
   row.setAttribute('aria-describedby',open?'hint-close':'hint-open');
   tail=el('span',person.live===false?'disclose shown':'disclose');
   tail.setAttribute('aria-hidden','true');
   tail.setAttribute('title','Recent broadcasts');
  }else{
   row.removeAttribute('aria-describedby');
   tail=el('span');
  }
  row.replaceChildren(avatar,name,platform,subNode,metaNode,tail);
 }

 function initial(name){
  const first=Array.from(String(name).trim())[0]||'?';
  return first.toLocaleUpperCase();
 }

 // A steady hue per login (mock A's hue), dark enough for a white initial.
 function avatarColour(login){
  const hue=Array.from(login).reduce((sum,char)=>(sum*31+char.charCodeAt(0))%360,7);
  return'hsl('+hue+' 34% 34%)';
 }

 function twitchMark(){
  if(typeof document.createElementNS!=='function')return[];
  const svg=document.createElementNS(SVG_NS,'svg');
  svg.setAttribute('viewBox','0 0 16 16');
  svg.setAttribute('focusable','false');
  const path=document.createElementNS(SVG_NS,'path');
  path.setAttribute('fill','currentColor');
  path.setAttribute('fill-rule','evenodd');
  path.setAttribute('d',TWITCH_PATH);
  svg.append(path);
  return[svg];
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
  row.addEventListener('click',()=>openInput(String(item.url||'')));
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

 // ---- Keys and actions ----

 // The rows the arrow keys walk: every selectable person, and the open person's broadcasts under them.
 function stops(){
  const list=[];
  for(const person of selectableRows()){
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
  if(!selection){
   // With nothing selected (the typed text was chosen), ↓ comes back to the top match; ↑ is the field's.
   if(step<0)return false;
   textChosen=false;
   moved=true;
   selection={...list[0]};
  }else{
   const at=list.findIndex(stop=>stop.login===selection.login&&stop.vod===selection.vod);
   const next=at+step;
   moved=true;
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
  return selectableRows().find(person=>person.login===login)||null;
 }

 // Return or a click on a person always opens them through global's live check, whatever their mark says: a
 // mark can be a minute old, and someone who just went live must open live (review R2-1). If the check finds
 // them offline, their broadcasts come under their row ('checking').
 function activatePerson(login,byPointer){
  const person=personFor(login);
  selection={login,vod:-1};
  moved=true;
  if(expanded&&expanded.login!==login){
   expanded=null;
  }
  checkingLogin=canBrowse(person)?login:null;
  checkingByPointer=!!byPointer;
  render();
  // The typed-name row opens the text in the field, exactly as typing it and pressing Return always has.
  openInput(person&&person.typed?field.value:login,checkingLogin?'checking':'standalone');
 }

 function openSelection(){
  if(selection.vod<0){
   activatePerson(selection.login,false);
   return;
  }
  const item=expanded&&expanded.login===selection.login&&expanded.items[selection.vod];
  if(item)openInput(String(item.url||''));
 }

 // → or the chevron on a person: their broadcasts open under the row, whether or not they are live (#74).
 // A pointer open never scrolls the list, at the click or when the broadcasts arrive, as Finder's disclosure
 // triangles don't (review R2-2, the lead's working choice): nothing moves under a pointer that may have moved
 // on. Broadcasts that land below the visible rows are reached by scrolling. Keyboard opens scroll to them.
 function openBroadcasts(login,byPointer){
  const person=personFor(login);
  if(!canBrowse(person))return;
  expanded={login,state:'loading',items:[],byPointer:!!byPointer};
  vodsTarget='inline';
  selection={login,vod:-1};
  moved=true;
  render();
  if(!byPointer)revealExpanded();
  announce(LOADING_TEXT);
  post('open-vods',{login});
 }

 // Closing the list outdates a lookup still under way, as an edit does (#67 F-session).
 function closeBroadcasts(keepPerson){
  if(!expanded)return;
  const login=expanded.login;
  expanded=null;
  vodsTarget='ignore';
  announce('');
  if(keepPerson){
   selection={login,vod:-1};
   post('open-edit',{});
   render();
  }
 }

 // Review finding 5: when broadcasts opened from the keyboard arrive, the person and as many of them as fit
 // come into view. Pointer opens stay put (see openBroadcasts).
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
  if(!expanded.byPointer)revealExpanded();
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
   if(!expanded||expanded.login!==person.login)expanded={login:person.login,state:'loading',items:[],byPointer:checkingByPointer};
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
  // F2: an edit that leaves the trimmed, lower-cased text as it was ("ri" to "ri ", or "RI") changes nothing on
  // the list: the search rows, the hairline, the selection and a search still out all stay.
  const unchanged=sameText(field.value,draftText);
  draftText=field.value;
  field.removeAttribute('aria-invalid');
  submitted=false;
  pendingInput=null;
  earlyReturn=false;
  if(unchanged){
   // Broadcasts still close, as on any edit; a selection inside them goes back to their person.
   if(selection&&selection.vod>=0)selection={login:selection.login,vod:-1};
  }else{
   selection=null;
   textChosen=false;
   moved=false;
  }
  expanded=null;
  checkingLogin=null;
  vodsTarget='ignore';
  awaitingText=field.value;
  // R6 and P-B: at the keystroke, known people the search found go, and so do other channels that no longer match,
  // so no stale result is ever selectable; those that still match stay until the new answer replaces them. Your
  // channels' own rows stay until the new list. A search still out is for the old text, so the spinner goes too.
  if(!unchanged){
   // P-B′: shown, not selectable, until the answer for the new text replaces them.
   const kept=othersStillMatching(field.value).map(person=>({...person,kept:true}));
   dropSearch();
   others=kept;
   if(!field.value.trim())answered=[];
   endPending();
  }
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
  // D4: Return on an empty field before global's first list (up to 450 ms after opening, C1) waits for that
  // list and opens its top row once; an empty list opens nothing. With text, the text is submitted as before.
  if(!heardSuggestions&&field.value===''){
   event.preventDefault();
   earlyReturn=true;
   return;
  }
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
    openBroadcasts(selection.login,false);
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

 // The field's clear button (mock A): the same as clearing with Escape, and focus stays in the field.
 function onClear(){
  if(field.value==='')return;
  field.value='';
  onInput();
  focusField();
 }

 form.addEventListener('submit',submit);
 if(clearButton){
  clearButton.addEventListener('mousedown',event=>event.preventDefault());
  clearButton.addEventListener('click',onClear);
 }
 field.addEventListener('input',onInput);
 document.addEventListener('keydown',onKeyDown);
 window.addEventListener('focus',focusField);
 if(listbox){
  // A click in the list leaves focus, and the caret, in the field.
  listbox.addEventListener('mousedown',event=>event.preventDefault());
 }
 iina.onMessage('open-error',markInvalid);
 iina.onMessage('prefill',prefill);
 iina.onMessage('offline-vods',onOfflineVods);
 iina.onMessage('suggestions',onSuggestions);
 iina.onMessage('suggestions-status',onSuggestionsStatus);
 iina.onMessage('suggestions-search',onSuggestionsSearch);
 iina.onMessage('suggestions-search-pending',onSearchPending);
 focusField();
 // Global holds page messages until the listeners above exist (loadFile clears them in IINA 1.5.1).
 post('open-ready',{});
})();
