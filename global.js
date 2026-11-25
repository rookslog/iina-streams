"use strict";
const config=require('./config.js');
const Sources=require('./src/source.js');
const {TwitchAuth}=require('./src/auth.js');
const BuiltInApp=require('./src/twitch-app.js');
const {create:createTimers}=require('./src/timers.js');
const {recentBroadcasts,channelStatus,channelsStatus,lastBroadcasts,followedSuggestions,searchText,searchChannels}=require('./src/twitch-vods.js');
const {envelope}=require('./src/bridge.js');
const {listen}=require('./src/listeners.js');
const {createHistory,matchRank}=require('./src/history.js');
const {global:app,menu,utils,file,http,standaloneWindow:openWindow}=iina;
const timers=createTimers(setTimeout,clearTimeout);
// Players that requested auth state, players this entry created, and each player's message session.
// A managed player is keyed by its numeric id. A window IINA opened itself ("adopted", #35) is keyed by
// IINA's own label, a string of digits, so the two kinds never share a key.
const audience=new Set(),managed=new Set(),adopted=new Set(),sessions=new Map();
// Sessions come from one counter, so a label IINA reuses for an idle core never repeats an old session.
let lastSession=0;
let credentials=null;
const qaEvents=[];
// The user's own Twitch app Client ID, when they entered one.
const CLIENT_FILE='@data/twitch-client.json';
const SETTINGS_FILE='@data/settings.json';
const globalDiag=[];
const windowDiagnostics=new Map();

function qaTrace(phase,data){
 if(!config.qa)return;
 qaEvents.push(Object.assign({phase,time:new Date().toISOString()},data||{}));
 if(qaEvents.length>60)qaEvents.shift();
 file.write('@data/qa-global.json',JSON.stringify(qaEvents));
}

// A sender label is "<player id>-<plugin identifier>"; accept only players this entry created.
function targetID(label){
 if(typeof label!=='string')return null;
 const match=/^([1-9][0-9]*)-/.exec(label);
 if(!match)return null;
 const id=Number(match[1]);
 return managed.has(id)&&label===id+'-'+config.identifier?id:null;
}

// IINA labels the cores it creates itself with a bare number (PlayerCore.swift, IINA v1.5.1).
function adoptedLabel(label){
 return typeof label==='string'&&/^[0-9]{1,9}$/.test(label)?label:null;
}

// The reply key for a sender: a managed player's numeric id, an adopted window's string label, or null.
// An adopted label is recorded here so replies can reach it until it reports player-closed.
function acceptSender(label){
 const id=targetID(label);
 if(id!==null)return id;
 const adoptedKey=adoptedLabel(label);
 if(adoptedKey===null)return null;
 if(!adopted.has(adoptedKey)){
  adopted.add(adoptedKey);
  // A fresh session: replies queued for this label before an earlier player-closed are dropped.
  nextSession(adoptedKey);
 }
 return adoptedKey;
}

// Whether a reply key still names an open player: numbers are managed ids, strings are adopted labels.
function isOpen(key){
 return typeof key==='number'?managed.has(key):adopted.has(key);
}

function createPlayer(options){
 const id=app.createPlayerInstance(options);
 if(typeof id==='number'){
  managed.add(id);
  nextSession(id);
 }
 qaTrace('created',{id,type:typeof id});
 return id;
}

function nextSession(key){
 lastSession+=1;
 sessions.set(key,lastSession);
}

// `id` is a reply key from acceptSender. IINA's global.postMessage takes a player id or a label string
// (JavascriptAPIGlobal.swift L105-111, IINA v1.5.1).
function postChild(id,name,data){
 if(!isOpen(id))return;
 let wire;
 try{
  wire=JSON.stringify(data);
 // Unserializable data cannot reach the child; dropping the message is safe.
 }catch(_){
  return;
 }
 if(typeof wire!=='string'||wire.length>8192)return;
 const token=name==='auth-ready'&&data.token,session=sessions.get(id);
 // Match the successful native probe: use a primitive payload after the
 // originating child call has returned. Never enqueue native objects.
 timers.setTimeout(()=>{
  if(!isOpen(id)||session!==sessions.get(id))return;
  if((name==='auth-state'||name==='auth-ready')&&!audience.has(id))return;
  if(name==='auth-ready'&&(!credentials||credentials.token!==token))return;
  app.postMessage(id,name,wire);
 },0);
}

function sendAll(name,data){
 if(name==='auth-state')qaTrace('auth-state',{state:data.phase,targets:Array.from(audience)});
 for(const id of audience)postChild(id,name,data);
}

function normalizeHttpResponse(response){
 const status=Number(response&&response.statusCode);
 let data=response&&response.data;
 if(!data||typeof data!=='object'||Array.isArray(data)){
  try{
   data=JSON.parse(response&&typeof response.text==='string'?response.text:'{}');
  }catch(_){
   data={};
  }
 }
 return{
  status:Number.isInteger(status)&&status>=100&&status<=599?status:0,
  data:data&&typeof data==='object'&&!Array.isArray(data)?data:{}
 };
}

function gLog(step,extra){
 if(!config.beta&&!config.qa)return;
 try{
  globalDiag.push(Object.assign({step,t:Date.now()},extra||{}));
  if(globalDiag.length>60)globalDiag.shift();
  file.write('@data/beta-global.json',JSON.stringify(globalDiag));
 }catch(_){/* diagnostics are best effort; a failed write must never break the caller */}
}

// #65: IINA supplies the core's label as the sender, not the player's stream label.
// Keep insertion order by last write, even when two writes have the same timestamp.
function onDiagnostics(data,label){
 if(typeof label!=='string'||!label||!data||typeof data!=='object'||Array.isArray(data))return;
 if(typeof data.instanceId!=='string'||data.instanceId.length>32||!Array.isArray(data.steps))return;
 try{
  windowDiagnostics.delete(label);
  windowDiagnostics.set(label,{
   instanceId:data.instanceId,
   instanceStartedAt:data.instanceStartedAt,
   writtenAt:new Date().toISOString(),
   steps:data.steps.slice(-40)
  });
  if(windowDiagnostics.size>8)windowDiagnostics.delete(windowDiagnostics.keys().next().value);
  file.write('@data/last-session.json',JSON.stringify({version:2,windows:Object.fromEntries(windowDiagnostics)}));
 }catch(_){/* diagnostics are best effort */}
}

// The saved Twitch login (a JSON string). Prefer the keychainRead spelling; fall back to keyChainRead.
function readSavedLogin(){
 if(typeof utils.keychainRead==='function')return utils.keychainRead('twitch-readonly','oauth');
 return utils.keyChainRead('twitch-readonly','oauth');
}

async function request(path,method,form,headers){
 gLog('http-start',{path,method});
 try{
  const options={headers:headers||{}};
  if(form)options.data=form;
  const r=await http[method==='POST'?'post':'get']('https://id.twitch.tv/oauth2'+path,options);
  const res=normalizeHttpResponse(r);
  gLog('http-done',{path,status:res.status});
  return res;
 }catch(response){
  const res=normalizeHttpResponse(response);
  gLog('http-catch',{path,status:res.status});
  return res;
 }
}

const auth=new TwitchAuth({
 request,
 diagnostic:code=>gLog('auth-diagnostic',{code}),
 read:readSavedLogin,
 write:value=>typeof utils.keychainWrite==='function'?
  utils.keychainWrite('twitch-readonly','oauth',value):utils.keyChainWrite('twitch-readonly','oauth',value),
 setTimer:timers.setTimeout,
 clearTimer:timers.clearTimeout,
 now:()=>Date.now(),
 onState:s=>sendAll('auth-state',s),
 onReady:c=>{
  const restored=!!passiveRestore;
  const changed=!credentials||accountKey(credentials)!==accountKey(c);
  credentials=c;
  passiveRestore=null;
  if(cacheAccount!==accountKey(c))resetSuggestionCaches(c);
  if(changed||restored){
   const form=formInstance;
   if(form)onMainThread(()=>{
    if(credentials!==c||formInstance!==form)return;
    refreshShowingAccount(false,false,restored);
    keepOpenFormLease(form);
   });
  }
  sendAll('auth-ready',playerCredentials(c));
 },
 onStop:()=>{
  const hadCredentials=!!credentials;
  credentials=null;
  if(hadCredentials&&!idleAuthStop){
   resetSuggestionCaches();
   const form=formInstance;
   if(form)onMainThread(()=>{
    if(!credentials&&formInstance===form)refreshShowingAccount(true);
   });
  }
  sendAll('auth-stop',{});
 }
});

// ---- Open Stream (#50): no blocking dialog. Input comes from the standalone window or a sidebar field. ----

const OPEN_PAGE='ui/open.html';
const OPEN_WIDTH=380,OPEN_HEIGHT=84;
// The window shows eight 28 px rows and keeps that height in every state (W-12, "a fixed height that scrolls");
// Global sends up to 50 people; the history status batch still covers 20.
const SUGGESTION_ROWS=8,SUGGESTION_ROW_HEIGHT=28,SUGGESTION_LIMIT=50;
const SUGGESTION_HEIGHT=OPEN_HEIGHT+SUGGESTION_ROWS*SUGGESTION_ROW_HEIGHT;
const STATUS_BATCH_SIZE=20,STATUS_INTERVAL_MS=60000,FIRST_SUGGESTION_WAIT_MS=450;
const SEARCH_PAUSE_MS=250,SEARCH_CACHE_MS=60000,SEARCH_LIMIT=10;
const searchCache=new Map();
// Separate caches: followed channels are account data, not watch history.
// A pending cache remains current across a close/reopen, but never across
// account changes. All results are applied on the main thread.
function emptyHistoryStatus(){return {at:-Infinity,pending:false,status:{},details:{}};}
function emptyFollows(){return {at:-Infinity,pending:false,rows:[],status:{},details:{}};}
let historyStatus=emptyHistoryStatus(),follows=emptyFollows(),suggestionText='';
let passiveRestore=null,idleAuthStop=false,cacheAccount=null;
function canReadFollows(c){
 return !!c&&typeof c.userID==='string'&&/^\d+$/.test(c.userID)&&Array.isArray(c.scopes)&&c.scopes.includes('user:read:follows');
}
function playerCredentials({token,login,clientID}){return {token,login,clientID};}
// Cache ownership is non-secret and independent of the active credential.
// A retained private cache is quarantined until a fresh validation confirms
// the same account and permission. Never use it while signed out or pending.
function accountKey(c){
 return c?JSON.stringify([c.clientID,c.login,typeof c.userID==='string'?c.userID:'',canReadFollows(c)]):null;
}
function cacheVisible(){return cacheAccount===accountKey(credentials);}
function resetSuggestionCaches(account=null){
 historyStatus=emptyHistoryStatus();
 follows=emptyFollows();
 cacheAccount=accountKey(account);
}
function stopIdleAuth(){
 idleAuthStop=true;
 try{auth.stop();}finally{idleAuthStop=false;}
}
// openRun fences updates to the current draft (F-session, #67). Submits, edits, newer offline lookups,
// fresh pages and closes advance it. Every form-started check instead needs its own form instance
// to still be showing (class C), while sidebar checks have no form instance.
// The page receives nothing until it posts open-ready; until then messages wait in openQueue.
let openRun=0,formInstance=null,openPageReady=false,openQueue=[];

// Opens the input. Returns 'opened', 'checking' (a Twitch channel whose live check is pending), 'invalid', or
// 'blank' when there is nothing to open. `form` is the instance that submitted it, if any.
function openInput(input,form=null){
 if(typeof input!=='string'||!input.trim())return'blank';
 const source=Sources.parse(input);
 if(!source)return'invalid';
 if(source.kind!=='twitch-live'){
  openPlayer(source);
  return'opened';
 }
 openWhenLive(source,openRun,form);
 return'checking';
}

function openPlayer(source){
 const label=Sources.label(source,config.variant);
 createPlayer({url:source.url,enablePlugins:false,disableWindowAnimation:true,label});
}

// #67: a Twitch channel is checked before any player exists, because a player whose channel is offline can
// only hand IINA the channel's page URL, which IINA fails to open with its own error and HTTP Authentication
// panel (review docs/reviews/2026-11-22-issue-67-review.md). Offline: the recent broadcasts appear in the Open
// Stream window and no player is created. Live, or a check that could not decide: the player opens as before.
// Residual race: a channel that goes offline between this check and the player's own load keeps the in-player
// path (src/player.js posts source-offline, onSourceOffline below).
async function openWhenLive(source,run,form){
 const deps={http,setTimeout:timers.setTimeout,clearTimeout:timers.clearTimeout};
 const status=await channelStatus({login:source.id},deps);
 onMainThread(()=>finishLiveCheck(source,status,run,form));
}

// H-main (#67): iina.http settles its promise from Just's completion handler, off the main thread
// (JavascriptAPIHttp.swift request, IINA v1.5.1), and createPlayerInstance and standaloneWindow need the main
// thread. A plugin timer's callback runs on the main thread: setTimeout schedules a Timer on the main run loop
// (JavascriptPolyfill.swift createTimer, DispatchQueue.main.async + Timer.scheduledTimer; callJSCallback). So the
// interface work runs inside that callback, not in a promise job after it.
function onMainThread(fn){
 timers.setTimeout(fn,0);
}

function isFormShowing(form){
 return form===formInstance&&openWindow.isOpen();
}

// Closing the form revokes every unanswered check from that instance, regardless of status.
// Independently, only the current draft may update or close the window.
function finishLiveCheck(source,status,run,form){
 qaTrace('live-check',{status});
 if(form&&!isFormShowing(form))return;
 const current=run===openRun;
 if(status!=='offline'){
  openPlayer(source);
  if(form&&current)closeOpenWindow();
  return;
 }
 if(current)showOfflineVods(source.id);
}

// With no input, show the Open Stream window; otherwise open the input directly.
function openStream(input){
 if(input===undefined){
  showOpenWindow();
  return;
 }
 openInput(input);
}

// Brings the window forward if it is open. Otherwise loads a fresh page, which clears every
// onMessage listener in IINA 1.5.1, so the listeners are registered after loadFile.
function showOpenWindow(){
 if(openWindow.isOpen()){
  openWindow.open();
  return;
 }
 openRun++;
 if(formInstance)releaseOpenForm();
 formInstance={posted:false,rows:[],text:null,deadline:null,lease:null,followsState:null,search:null};
 openPageReady=false;
 openQueue=[];
 openWindow.loadFile(OPEN_PAGE);
 listen(openWindow,'standaloneWindow','open-stream',onOpenWindowSubmit);
 listen(openWindow,'standaloneWindow','open-cancel',closeOpenWindow);
 listen(openWindow,'standaloneWindow','open-ready',onOpenPageReady);
 listen(openWindow,'standaloneWindow','open-edit',onOpenEdit);
 listen(openWindow,'standaloneWindow','open-query',onOpenQuery);
 listen(openWindow,'standaloneWindow','open-vods',onOpenVods);
 openWindow.setProperty({title:'Open Stream',resizable:false});
 openWindow.setFrame(OPEN_WIDTH,SUGGESTION_HEIGHT);
 openWindow.open();
 keepOpenFormLease(formInstance);
}

function releaseOpenForm(){
 const form=formInstance;
 formInstance=null;
 openPageReady=false;
 if(form){
  if(form.deadline!==null)timers.clearTimeout(form.deadline);
  if(form.lease!==null)timers.clearTimeout(form.lease);
  cancelSearch(form);
 }
 if(!audience.size){
  passiveRestore=null;
  if(credentials||['waiting','authorizing'].includes(auth.snapshot().phase))stopIdleAuth();
 }
}

function closeOpenWindow(){
 openRun++;
 releaseOpenForm();
 openWindow.close();
}

// IINA exposes isOpen, but not a standalone-window close callback. While the
// form owns a grant or pending saved-grant restoration, check its lease so a native
// title-bar close has the same lifetime semantics as open-cancel.
function keepOpenFormLease(form){
 if(!form||form.lease!==null||(!credentials&&!passiveRestore))return;
 form.lease=timers.setTimeout(()=>{
  form.lease=null;
  if(form!==formInstance)return;
  if(!isFormShowing(form)){
   openRun++;
   releaseOpenForm();
   return;
  }
  keepOpenFormLease(form);
 },1000);
}

// F-session (#67): an edit of the field is a new draft, so a check started for the old text cannot overwrite it.
function onOpenEdit(){
 openRun++;
}

// A submit advances the draft revision, so a check from an earlier submit cannot update the form (F-session).
// U-feedback: while a channel is checked the form stays open and shows the list's loading indicator.
function onOpenWindowSubmit(data){
 openRun++;
 const result=openInput(data&&data.input,formInstance);
 if(result==='opened')closeOpenWindow();
 if(result==='checking')postOfflineVods({state:'loading'});
 if(result==='invalid')openWindow.postMessage('open-error',{});
}

function showingReadyForm(){
 return formInstance&&openPageReady&&isFormShowing(formInstance)?formInstance:null;
}

function onOpenPageReady(){
 if(!formInstance||!isFormShowing(formInstance)||openPageReady)return;
 openPageReady=true;
 const queued=openQueue;
 openQueue=[];
 for(const message of queued)openWindow.postMessage(message.name,message.data);
 suggestionText='';
 const form=formInstance;
 // Passive restoration only: the window never starts a device flow unasked.
 if(!credentials&&!passiveRestore&&!['waiting','authorizing'].includes(auth.snapshot().phase)){
  const saved=savedGrantClient();
  if(saved)restoreForOpen(saved);
 }
 if(!passiveRestore){
  if(!credentials&&cacheAccount!==null)resetSuggestionCaches();
  publishFollowsState(form);
 }
 beginSuggestionCycle(form);
 keepOpenFormLease(form);
}

function publishFollowsState(form,force=false){
 if(form!==showingReadyForm())return;
 const state=canReadFollows(credentials)?'ready':'needs-sign-in';
 // An already-authorized account needs no initial note.
 if(form.followsState===null&&state==='ready'&&!force){form.followsState=state;return;}
 if(form.followsState===state&&!force)return;
 form.followsState=state;
 postOpenPage('suggestions-follows',envelope({state}));
}

function refreshShowingAccount(signedOut=false,forceNote=false,restored=false){
 const form=showingReadyForm();
 if(!form)return;
 publishFollowsState(form,forceNote);
 // Explicit account changes may replace the list. A passive restoration
 // is just a late answer: preserve the order and append new follows only.
 if(form.posted&&!restored){
  form.posted=false;
  form.rows=[];
  form.text=null;
 }
 beginSuggestionCycle(form,signedOut);
 keepOpenFormLease(form);
}

function restoreForOpen(clientID){
 const restore={};
 passiveRestore=restore;
 auth.connect(clientID,{savedOnly:true}).then(ok=>{
  if(ok||passiveRestore!==restore)return;
  passiveRestore=null;
  onMainThread(()=>{
   if(!credentials&&!passiveRestore){
    if(cacheAccount!==null)resetSuggestionCaches();
    refreshShowingAccount(false,false,true);
   }
  });
 });
}

function beginSuggestionCycle(form,force=false){
 if(form!==showingReadyForm())return;
 const now=Date.now();
 if(now-follows.at>=STATUS_INTERVAL_MS)follows=emptyFollows();
 if(now-historyStatus.at>=STATUS_INTERVAL_MS)historyStatus=emptyHistoryStatus();
 if(!passiveRestore){
  refreshSuggestionsStatus();
  if(canReadFollows(credentials))refreshFollows();
 }
 if(form.posted){
  publishSuggestionUpdate();
  return;
 }
 if(force||(!passiveRestore&&!historyStatus.pending&&!follows.pending)){
  settleSuggestions(form);
 }else if(form.deadline===null){
  form.deadline=timers.setTimeout(()=>{
   form.deadline=null;
   if(form===showingReadyForm()&&!form.posted)settleSuggestions(form);
  },FIRST_SUGGESTION_WAIT_MS);
 }
}

function settleSuggestions(form){
 if(form!==showingReadyForm()||form.posted)return;
 if(form.deadline!==null){timers.clearTimeout(form.deadline);form.deadline=null;}
 form.posted=true;
 postSuggestions(suggestionText);
}

function postOpenPage(name,data){
 if(openPageReady)openWindow.postMessage(name,data);
 else openQueue.push({name,data});
}

// #74: match ranks use the same prefix/word-start rules as history.query.
// The followed-live list is authoritative for followed people, including those
// also present in history; history supplies the rank for watched people.
function suggestionSnapshot(){
 if(!cacheVisible())return {status:{},details:{}};
 const status={...historyStatus.status,...follows.status};
 const details={...historyStatus.details,...follows.details};
 // An offline follow may reuse history broadcast details, but never a conflicting live detail.
 for(const login of Object.keys(follows.status)){
  if(follows.status[login]===false&&details[login]&&!details[login].lastAt&&!details[login].lastTitle)delete details[login];
 }
 return {status,details};
}

function rankedSuggestions(text,limit=SUGGESTION_LIMIT){
 const {status,details}=suggestionSnapshot();
 const needle=text.trim().toLowerCase();
 const people=new Map();
 for(const {provider,login,displayName} of history.query('')){
  people.set(provider+'\n'+login,{provider,login,displayName,historyRank:people.size});
 }
 for(const row of cacheVisible()?follows.rows:[]){
  const key=row.provider+'\n'+row.login;
  const existing=people.get(key);
  people.set(key,{...row,historyRank:existing?existing.historyRank:Infinity});
 }
 const candidates=[];
 for(const person of people.values()){
  const rank=needle===''?0:matchRank(person,needle);
  if(rank===null)continue;
  const live=person.provider==='twitch'&&Object.hasOwn(status,person.login)?status[person.login]:null;
  const detail=person.provider==='twitch'?details[person.login]:null;
  const lastAt=Date.parse(detail?.lastAt);
  candidates.push({...person,rank,live,viewers:detail?.viewers||0,lastAt:Number.isFinite(lastAt)?lastAt:-Infinity});
 }
 candidates.sort((a,b)=>{
  if(a.rank!==b.rank)return a.rank-b.rank;
  if((a.live===true)!==(b.live===true))return a.live===true?-1:1;
  if(a.historyRank!==b.historyRank)return a.historyRank-b.historyRank;
  if(a.historyRank!==Infinity)return 0;
  if(a.live===true&&a.viewers!==b.viewers)return b.viewers-a.viewers;
  if(a.live!==true&&a.lastAt!==b.lastAt)return b.lastAt-a.lastAt;
  return a.displayName.localeCompare(b.displayName)||a.login.localeCompare(b.login);
 });
 const rows=candidates.slice(0,limit).map(({provider,login,displayName,live})=>({provider,login,displayName,live}));
 return rows;
}

// The current text owns one order. A duplicate query is answered (the page
// can be waiting for it), without moving any already-posted rows.
function postSuggestions(text){
 const form=showingReadyForm();
 if(!form||!form.posted)return;
 const {status}=suggestionSnapshot();
 if(form.text!==text){
  form.rows=rankedSuggestions(text);
  form.text=text;
 }else{
  form.rows=form.rows.map(row=>({...row,live:row.provider==='twitch'&&Object.hasOwn(status,row.login)?status[row.login]:null}));
 }
 postOpenPage('suggestions',envelope({text,rows:form.rows}));
 postVisibleSuggestionStatus(form);
 publishSearchAnswer(form);
}

function postVisibleSuggestionStatus(form){
 if(form!==showingReadyForm()||!form.posted)return;
 const snapshot=suggestionSnapshot();
 const logins=form.rows.filter(row=>row.provider==='twitch').map(row=>row.login);
 const status=Object.fromEntries(logins.filter(login=>Object.hasOwn(snapshot.status,login)).map(login=>[login,snapshot.status[login]]));
 const details=Object.fromEntries(logins.filter(login=>Object.hasOwn(snapshot.details,login)).map(login=>[login,snapshot.details[login]]));
 if(Object.keys(status).length||Object.keys(details).length)postOpenPage('suggestions-status',envelope({status,details}));
}

function onOpenQuery(data){
 const form=showingReadyForm();
 if(!form||!data||typeof data.text!=='string')return;
 onOpenEdit();
 suggestionText=data.text;
 scheduleSearch(form,suggestionText);
 if(form.posted)postSuggestions(suggestionText);
}

// A query owns one debounce and one answer. The form identity and query
// identity fence both timer callbacks and late HTTP completions.
function cancelSearch(form){
 if(form.search?.timer!==null&&form.search?.timer!==undefined)timers.clearTimeout(form.search.timer);
 form.search=null;
}

function scheduleSearch(form,value){
 cancelSearch(form);
 const text=searchText(value);
 if(text===null)return;
 const search={text,timer:null,answer:null,published:false,othersDrawn:false,known:new Set()};
 form.search=search;
 search.timer=timers.setTimeout(()=>{
  search.timer=null;
  if(isCurrentSearch(form,search))runSearch(form,search);
 },SEARCH_PAUSE_MS);
}

function isCurrentSearch(form,search){
 return form===showingReadyForm()&&form.search===search;
}

async function runSearch(form,search){
 const account=credentials;
 const key=JSON.stringify([accountKey(account),search.text.toLowerCase()]);
 const now=Date.now();
 for(const [cachedKey,cached] of searchCache){
  if(now-cached.at>=SEARCH_CACHE_MS)searchCache.delete(cachedKey);
 }
 const cached=searchCache.get(key);
 if(cached){
  search.answer=cached.rows;
  publishSearchAnswer(form);
  return;
 }
 postOpenPage('suggestions-search-pending',envelope({text:search.text,pending:true}));
 const rows=await searchChannels(search.text,account,suggestionDeps);
 onMainThread(()=>{
  if(rows!==null){
   searchCache.set(key,{at:Date.now(),rows});
   // Keep the memory-only cache bounded even during rapid typing.
   if(searchCache.size>100)searchCache.delete(searchCache.keys().next().value);
  }
  if(!isCurrentSearch(form,search))return;
  search.answer=rows;
  publishSearchAnswer(form);
  postOpenPage('suggestions-search-pending',envelope({text:search.text,pending:false}));
 });
}

function publishSearchAnswer(form){
 const search=form.search;
 if(!search||!isCurrentSearch(form,search)||!form.posted||search.published||search.answer===null)return;
 const displayed=new Set(form.rows.filter(row=>row.provider==='twitch').map(row=>row.login));
 const knownLogins=new Set(history.query('',{provider:'twitch'}).map(row=>row.login));
 if(cacheVisible())for(const row of follows.rows)knownLogins.add(row.login);
 const known=[],others=[],seen=new Set(displayed);
 for(const row of search.answer){
  if(seen.has(row.login))continue;
  seen.add(row.login);
  if(knownLogins.has(row.login))known.push(row);
  else others.push(row);
 }
 const exact=search.text.toLowerCase();
 others.sort((a,b)=>{
  if((a.login===exact)!==(b.login===exact))return a.login===exact?-1:1;
  if((a.live===true)!==(b.live===true))return a.live===true?-1:1;
  return a.live===true?(b.details.viewers??0)-(a.details.viewers??0):0;
 });
 const appended=known.slice(0,SEARCH_LIMIT),otherRows=others.slice(0,SEARCH_LIMIT);
 search.published=true;
 search.othersDrawn=otherRows.length>0;
 search.known=new Set(appended.map(row=>row.login));
 postOpenPage('suggestions-search',envelope({text:search.text,known:appended,others:otherRows}));
}

function publishSuggestionUpdate(){
 const form=showingReadyForm();
 if(!form)return;
 if(form.posted){
  if(!appendLateFollows(form))postVisibleSuggestionStatus(form);
 }else if(!passiveRestore&&!historyStatus.pending&&!follows.pending)settleSuggestions(form);
}

// Once the followed list and its offline sort keys have answered, append
// only follow-only matches, in G4/G5 order, without shifting any existing row.
function appendLateFollows(form){
 if(form.search?.othersDrawn)return false;
 if(!cacheVisible()||follows.pending||!follows.rows.length||form.rows.length>=SUGGESTION_LIMIT)return false;
 const key=row=>row.provider+'\n'+row.login;
 const displayed=new Set(form.rows.map(key));
 for(const login of form.search?.known??[])displayed.add('twitch\n'+login);
 const watched=new Set(history.query('').map(key));
 const followed=new Set(follows.rows.map(key));
 const extra=rankedSuggestions(form.text,Infinity).filter(row=>followed.has(key(row))&&!watched.has(key(row))&&!displayed.has(key(row)))
  .slice(0,SUGGESTION_LIMIT-form.rows.length);
 if(!extra.length)return false;
 form.rows.push(...extra);
 postSuggestions(form.text);
 return true;
}

const suggestionDeps={http,setTimeout:timers.setTimeout,clearTimeout:timers.clearTimeout};

async function refreshSuggestionsStatus(){
 const now=Date.now();
 if(now-historyStatus.at<STATUS_INTERVAL_MS)return;
 const logins=history.query('',{provider:'twitch'}).slice(0,STATUS_BATCH_SIZE).map(person=>person.login);
 if(!logins.length)return;
 const cache=historyStatus;
 const account=credentials;
 cache.at=now;
 cache.pending=true;
 const result=await channelsStatus(logins,account,suggestionDeps);
 onMainThread(()=>{
  if(historyStatus!==cache)return;
  cache.status=result.status;
  cache.details=result.details;
  cache.pending=false;
  publishSuggestionUpdate();
 });
 // Helix supplies live marks; a separate optional broadcast lookup must
 // neither delay those marks nor take them away on failure.
 if(!account||historyStatus!==cache)return;
 const broadcasts=await lastBroadcasts(logins.filter(login=>result.status[login]===false),suggestionDeps);
 if(!Object.keys(broadcasts).length)return;
 onMainThread(()=>{
  if(historyStatus!==cache)return;
  cache.details={...cache.details,...broadcasts};
  publishSuggestionUpdate();
 });
}

async function refreshFollows(){
 const now=Date.now();
 if(now-follows.at<STATUS_INTERVAL_MS)return;
 const cache=follows;
 const account=credentials;
 cache.at=now;
 cache.pending=true;
 const result=await followedSuggestions(account,suggestionDeps);
 if(follows!==cache)return;
 onMainThread(()=>{
  if(follows!==cache)return;
  if(result)Object.assign(cache,result);
  else cache.pending=false;
  publishSuggestionUpdate();
 });
 if(!result)return;
 // Offline ages determine the initial sort too. Wait for them only within
 // the form's 450 ms deadline; live rows are already cached meanwhile.
 const broadcasts=await lastBroadcasts(result.rows.filter(row=>result.status[row.login]===false).map(row=>row.login),suggestionDeps);
 onMainThread(()=>{
  if(follows!==cache)return;
  cache.details={...cache.details,...broadcasts};
  cache.pending=false;
  publishSuggestionUpdate();
 });
}

function onOpenVods(data){
 if(!isFormShowing(formInstance))return;
 const login=offlineLogin(data);
 if(login!==null)showOfflineVods(login,true);
}

// ---- B6c (#32): an offline channel's recent broadcasts, in the Open Stream window. An input is checked
// before a player is created (#67, openWhenLive); a player whose channel went offline after that check only
// reports the login, and this window lists the broadcasts. ----

const OFFLINE_REPEAT_MS=10000;
const OFFLINE_ROWS=10;
// Logins reported in the last OFFLINE_REPEAT_MS, each with the timer that forgets it.
const recentOffline=new Map();

// A managed player or an adopted window may report; neither lookup registers the label.
// H-main (#67): a player's message reaches this handler through IINA's synchronous message bridge, off the main
// thread, so the window, the list and the repeat bookkeeping run on a main-thread turn (onMainThread).
function onSourceOffline(data,label){
 const managedID=targetID(label);
 const sender=managedID!==null?managedID:adoptedLabel(label);
 if(sender===null)return;
 const login=offlineLogin(data);
 if(login===null)return;
 onMainThread(()=>showReportedOffline(login));
}

function showReportedOffline(login){
 if(recentOffline.has(login))return;
 recentOffline.set(login,timers.setTimeout(()=>recentOffline.delete(login),OFFLINE_REPEAT_MS));
 showOfflineVods(login);
}

// The login as a player reports it: a channel name that parses to the same Twitch live id.
function offlineLogin(data){
 const login=data&&data.login;
 if(typeof login!=='string')return null;
 const source=Sources.parse(login);
 if(!source||source.kind!=='twitch-live'||source.id!==login)return null;
 return login;
}

async function showOfflineVods(login,fromSuggestion=false){
 showOpenWindow();
 const run=++openRun;
 const form=formInstance;
 if(!fromSuggestion)postOpenPage('prefill',{input:login});
 postOfflineVods({state:'loading'});
 // Signed in: Helix first, then one GQL fallback (#75); neither rejects, and each gives up after 5 s.
 const result=await recentBroadcasts({login},{http,credentials,setTimeout:timers.setTimeout,clearTimeout:timers.clearTimeout});
 // H-main: the list is shown from a main-thread turn, as after the live check (onMainThread).
 onMainThread(()=>{
  showArchives(run,result,login,form,fromSuggestion);
 });
}

function showArchives(run,result,login,form,fromSuggestion){
 if(run!==openRun||!isFormShowing(form))return;
 if(result.ok&&!fromSuggestion)recordOfflineHistory(login);
 if(!result.ok){
  postOfflineVods({state:'error'});
  return;
 }
 if(!result.vods.length){
  postOfflineVods({state:'none'});
  return;
 }
 const items=result.vods.slice(0,OFFLINE_ROWS).map(vodItem);
 postOfflineVods({state:'ready',items});
}

function vodItem(vod){
 return{title:vod.title,createdAt:vod.createdAt,lengthSeconds:vod.lengthSeconds,url:vod.url};
}

// Titles are untrusted, and IINA 1.5.1 interpolates messages into a template literal, so the list travels
// as an envelope (src/bridge.js). #74: the window keeps its fixed height (set in showOpenWindow); the page
// scrolls the list instead of global growing or shrinking the window around it.
function postOfflineVods(value){
 postOpenPage('offline-vods',envelope(value));
}

// A player's sidebar field submits {input}; an older sidebar sends no input and gets the window.
function onPlayerOpen(data,label){
 const input=data&&data.input;
 // #56: record which label reached global and whether it is a managed player. No user text is traced.
 qaTrace('player-open',{sender:label,id:targetID(label),hasInput:input!==undefined});
 if(input===undefined){
  showOpenWindow();
  return;
 }
 if(openInput(input)==='invalid')postOpenError(label);
}

// The error carries no user text. A player this entry created gets it through postChild, which fences
// closed players. A window IINA opened itself and Streams adopted (#35) sends IINA's own label, a bare
// number (PlayerCore.swift in IINA 1.5.1); global.postMessage reaches it by that label.
function postOpenError(label){
 const key=acceptSender(label);
 if(key===null){
  qaTrace('open-error',{route:'dropped',sender:label});
  return;
 }
 if(typeof key==='number')qaTrace('open-error',{route:'managed',id:key});
 else qaTrace('open-error',{route:'label',sender:label});
 postChild(key,'open-error',{});
}

async function onAuthConnect(data,label){
 const id=acceptSender(label);
 qaTrace('auth-connect',{sender:label,id,managed:Array.from(managed)});
 gLog('auth-connect',{id,phase:auth.snapshot().phase,hasCred:!!credentials});
 if(id===null)return;
 nextSession(id);
 audience.add(id);
 if(credentials){
  postChild(id,'auth-state',auth.snapshot());
  postChild(id,'auth-ready',playerCredentials(credentials));
  return;
 }
 if(['waiting','authorizing'].includes(auth.snapshot().phase)){
  postChild(id,'auth-state',auth.snapshot());
  return;
 }
 const clientID=chooseClientID(data&&data.clientID);
 const builtIn=String(BuiltInApp&&BuiltInApp.clientID||'');
 if(/^[A-Za-z0-9]{10,64}$/.test(clientID)&&clientID!==builtIn)file.write(CLIENT_FILE,JSON.stringify({clientID}));
 gLog('auth-connect-run',{hasClient:/^[A-Za-z0-9]{10,64}$/.test(clientID)});
 await auth.connect(clientID);
}

function savedGrantClient(){
 try{
  const raw=readSavedLogin();
  const saved=typeof raw==='string'&&raw?JSON.parse(raw):raw;
  if(saved&&typeof saved.access_token==='string'&&saved.access_token&&/^[A-Za-z0-9]{10,64}$/.test(saved.clientID||''))return saved.clientID;
 }catch(_){gLog('auth-diagnostic',{code:'saved-login-unreadable'});}
 return '';
}

function chooseClientID(explicit){
 let clientID=String(explicit||'').trim();
 try{
  if(!clientID&&file.exists(CLIENT_FILE))clientID=JSON.parse(file.read(CLIENT_FILE)).clientID||'';
 }catch(_){gLog('auth-diagnostic',{code:'client-file-unreadable'});}
 if(!clientID)clientID=savedGrantClient();
 const builtIn=String(BuiltInApp&&BuiltInApp.clientID||'');
 if(!clientID&&/^[A-Za-z0-9]{10,64}$/.test(builtIn))clientID=builtIn;
 return clientID;
}

function onAuthProbe(_,label){
 const id=acceptSender(label);
 gLog('auth-probe',{id,hasCred:!!credentials});
 if(id===null)return;
 if(credentials){
  postChild(id,'auth-status',{saved:true,login:credentials.login});
  return;
 }
 let saved=false;
 try{
  const raw=readSavedLogin();
  const parsed=typeof raw==='string'&&raw?JSON.parse(raw):null;
  const hasToken=parsed&&typeof parsed.access_token==='string'&&parsed.access_token;
  saved=!!(hasToken&&typeof parsed.clientID==='string'&&parsed.clientID);
 }catch(_){gLog('auth-diagnostic',{code:'saved-login-unreadable'});}
 gLog('auth-probe-reply',{id,saved});
 postChild(id,'auth-status',{saved});
}

function onAuthDisconnect(data,label){
 // A label that was never in the audience is neither registered nor allowed to stop the broker (r2 #4).
 const managedID=targetID(label);
 const id=managedID!==null?managedID:adoptedLabel(label);
 if(id===null)return;
 // A retiring controller ends its own lifetime on a label that stays open. Forget clears the audience before
 // its revoke returns, so retirement must advance the session itself (r3 #3). Only a known label advances.
 const retiring=!!data&&data.retire===true&&sessions.has(id);
 const wasMember=audience.delete(id);
 if(retiring||wasMember)nextSession(id);
 if(wasMember&&!audience.size&&!formInstance)stopIdleAuth();
}

function onPlayerClosed(_,label){
 const managedID=targetID(label);
 const id=managedID!==null?managedID:adoptedLabel(label);
 if(id===null)return;
 finishWindowVisit(id);
 // Only a departing audience member can warrant stopping the broker; an unrelated close must not (r3 #3).
 const wasMember=audience.delete(id);
 if(typeof id==='number')managed.delete(id);
 else adopted.delete(id);
 sessions.delete(id);
 if(wasMember&&!audience.size&&!formInstance)stopIdleAuth();
}

async function onAuthForget(_,label){
 const id=acceptSender(label);
 if(id===null)return;
 nextSession(id);
 // The requester's session now. If that label retires or reconnects during the revoke, the reply is dropped
 // rather than landing on a successor controller (r2 #4).
 const session=sessions.get(id);
 const interrupted=!!passiveRestore;
 const form=formInstance;
 passiveRestore=null;
 const hadCredentials=!!credentials;
 if(!hadCredentials&&cacheAccount!==null)resetSuggestionCaches();
 const pending=auth.forget();
 if(interrupted&&!hadCredentials&&form)onMainThread(()=>{
  if(!credentials&&form===showingReadyForm())refreshShowingAccount(true,true);
 });
 audience.clear();
 const result=await pending;
 if(result&&!result.stale&&isOpen(id)&&sessions.get(id)===session)postChild(id,'auth-forgotten',result);
}

// ---- Watch history (#73): local-only, never HTTP, never URLs or tokens ----

const historyStorage={
 read(path){
  if(!file.exists(path))return null;
  return file.read(path);
 },
 write(path,text){
  file.write(path,text);
 },
 backup(from,to){
  const text=file.read(from);
  if(typeof text!=='string')throw Error('Unreadable history backup source');
  file.write(to,text);
 }
};

function historyNow(){
 return Math.floor(Date.now()/1000);
}

const history=createHistory({storage:historyStorage,now:historyNow});
// Open visits keyed by managed numeric id or adopted bare-number string label: {provider, login, handle}.
const windowVisits=new Map();
let menuRebuildTimer=null;

function adoptionEnabled(){
 if(config.qa)return true;
 try{
  if(!file.exists(SETTINGS_FILE))return false;
  const settings=JSON.parse(file.read(SETTINGS_FILE));
  return!!settings&&settings.adoptNativeWindows===true;
 // Unreadable settings keep native window adoption off by default (D-033).
 }catch(_){
  return false;
 }
}

// History accepts managed players and, only when opted in, adopted bare-number windows.
function historySender(label){
 const id=targetID(label);
 if(id!==null)return id;
 const adoptedKey=adoptedLabel(label);
 if(adoptedKey===null||!adoptionEnabled())return null;
 return acceptSender(label);
}

function sameHistoryChannel(a,b){
 if(!a||!b||a.provider!==b.provider)return false;
 if(typeof a.login!=='string'||typeof b.login!=='string')return false;
 if(a.provider==='twitch')return a.login.toLowerCase()===b.login.toLowerCase();
 return a.login===b.login;
}

function finishWindowVisit(key){
 const visit=windowVisits.get(key);
 if(!visit)return;
 windowVisits.delete(key);
 if(visit.handle)history.finish(visit.handle,historyNow());
}

function recordOfflineHistory(login){
 // Precheck only resolves the login, so use it as displayName until a stream plays.
 history.record({provider:'twitch',login,displayName:login,at:historyNow(),offline:true});
}

function onHistoryStart(data,label){
 const key=historySender(label);
 if(key===null||!data||typeof data!=='object'||Array.isArray(data))return;
 const existing=windowVisits.get(key);
 if(existing&&sameHistoryChannel(existing,data))return;
 if(existing)finishWindowVisit(key);
 // Pass only identity fields so no playback metadata can ever reach history.
 const handle=history.record({
  provider:data.provider,
  login:data.login,
  displayName:data.displayName,
  at:historyNow()
 });
 if(handle!==null){
  windowVisits.set(key,{provider:handle.provider,login:handle.login,handle});
 }
}

function onHistoryEnd(data,label){
 const managedID=targetID(label);
 const key=managedID!==null?managedID:adoptedLabel(label);
 if(key===null||!data||typeof data!=='object'||Array.isArray(data))return;
 const visit=windowVisits.get(key);
 if(!visit||!sameHistoryChannel(visit,data))return;
 finishWindowVisit(key);
}

function toggleHistoryPause(){
 history.setPaused(!history.paused);
 scheduleMenuRebuild();
}

function clearHistory(){
 history.clear();
 historyStatus=emptyHistoryStatus();
 // Clearing history is an explicit removal, not a late network update.
 const form=showingReadyForm();
 if(form&&form.posted){
  form.text=null;
  postSuggestions(suggestionText);
 }else publishSuggestionUpdate();
 windowVisits.clear();
 scheduleMenuRebuild();
}

function historyMenu(){
 const parent=menu.item('Watch History',null);
 const children=[
  menu.item('Pause Watch History',toggleHistoryPause,{selected:history.paused}),
  menu.item('Clear Watch History',clearHistory)
 ];
 for(const child of children)parent.addSubMenuItem(child);
 return parent;
}

function addGlobalMenuItems(){
 menu.addItem(menu.item('Open Stream…',()=>openStream(),{keyBinding:'Ctrl+Meta+o'}));
 menu.addItem(historyMenu());
}

// Rebuild definitions on a main-thread turn only when Pause or Clear changes displayed state; never write to
// added menu items, because IINA 1.5.1 setters dereference an unowned NSMenuItem (JavascriptPluginMenuItem.swift).
function scheduleMenuRebuild(){
 if(menuRebuildTimer!==null)return;
 menuRebuildTimer=timers.setTimeout(rebuildMenu,0);
}

function rebuildMenu(){
 menuRebuildTimer=null;
 menu.removeAllItems();
 addGlobalMenuItems();
 if(typeof menu.forceUpdate==='function')menu.forceUpdate();
}

addGlobalMenuItems();
// Refresh the menu on the next turn, not while this initializer runs. In IINA v1.5.1 a synchronous
// forceUpdate runs updatePluginMenu -> PlayerCore.active -> PlayerCore.first, which creates core "0"
// before this global instance is registered, so that core gets a nil parentAPI and can never message
// global (MenuController.swift L619, PlayerCore.swift L40-46, JavascriptPlugin.swift L166-168,
// JavascriptPluginInstance.swift L175-182). v0.5.5 review r1 #5.
if(typeof menu.forceUpdate==='function')timers.setTimeout(()=>menu.forceUpdate(),0);
listen(app,'global','open',onPlayerOpen);
listen(app,'global','auth-connect',onAuthConnect);
listen(app,'global','auth-probe',onAuthProbe);
listen(app,'global','auth-disconnect',onAuthDisconnect);
listen(app,'global','player-closed',onPlayerClosed);
listen(app,'global','auth-forget',onAuthForget);
listen(app,'global','source-offline',onSourceOffline);
listen(app,'global','history-start',onHistoryStart);
listen(app,'global','history-end',onHistoryEnd);
listen(app,'global','diag',onDiagnostics);

if(config.qa){
 // #56 probe, QA builds only: does global reach a window IINA opened itself by its bare-number label
 // (JavascriptAPIGlobal.swift L105-111 in IINA 1.5.1)? QA restarts IINA, so every core loaded this plugin
 // at creation (PlayerCore.swift L74-81) and L108's force-unwrap is safe here. Not for release builds.
 let probes=0;
 function sendLabelProbe(){
  probes+=1;
  for(let n=0;n<6;n+=1)app.postMessage(String(n),'qa-label-probe',JSON.stringify({label:String(n),probe:probes}));
  qaTrace('label-probe-sent',{probe:probes});
  if(probes<12)timers.setTimeout(sendLabelProbe,5000);
 }
 timers.setTimeout(sendLabelProbe,5000);
}

if(config.qa){
 listen(app,'global','qa-ping',(_,label)=>{
  const id=targetID(label);
  qaTrace('ping',{id,sender:label});
  setTimeout(()=>{
   if(id!==null)app.postMessage(id,'qa-pong','number-string-deferred');
  },0);
 });
 listen(app,'global','qa-open',data=>openStream(data&&data.url));
 // QA builds from `npm run qa:deploy` set config.qa to true (no startup source): only open a
 // startup player when a source is configured (#33).
 const q=config.qa;
 if(q&&q.source)openQaStartupPlayer(q);
}

function openQaStartupPlayer(q){
 const source=q.source;
 const label=source.kind==='local-test'?'streams-candidate:qa-local':Sources.label(source,q.variant||config.variant);
 createPlayer({url:source.url,enablePlugins:false,disableWindowAnimation:true,label});
}
