"use strict";
const test=require('node:test');const assert=require('node:assert/strict');
const {TwitchAuth,SIGNED_OUT}=require('../src/auth.js');
const noGrant=v=>{if(v===null||v==='')return true;const o=JSON.parse(v);return !o.access_token&&!o.refresh_token;};
function make(responses=[],initialSaved=null){const calls=[],timers=[],states=[],ready=[],writes=[];let saved=initialSaved,reads=0;const auth=new TwitchAuth({request:async(path,method,form,headers)=>{calls.push({path,method,form,headers});return responses.shift();},read:()=>{reads++;return saved;},write:v=>{writes.push(v);if(v===''&&saved)return true;/* macOS SecItemUpdate keeps old data on an empty write */saved=v;return true;},setTimer:(fn,ms)=>{const t={fn,ms,cancelled:false};timers.push(t);return t;},clearTimer:t=>{t.cancelled=true;},now:()=>0,onState:s=>states.push(s),onReady:c=>ready.push(c),onStop:()=>ready.push(null)});return{auth,calls,timers,states,ready,writes,saved:()=>saved,readCount:()=>reads};}
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};}
test('loading and stopping auth does not read secrets, contact Twitch, or schedule work',()=>{const r=make();r.auth.stop();assert.equal(r.calls.length,0);assert.equal(r.readCount(),0);assert.equal(r.timers.length,0);assert.equal(r.auth.snapshot().phase,'off');});
test('missing client ID is a concrete setup state with no network request',async()=>{const r=make();await r.auth.connect('');assert.equal(r.calls.length,0);assert.equal(r.auth.snapshot().phase,'needs-client');});
test('device authorization asks only chat:read and does not expose device token in state',async()=>{const r=make([{status:200,data:{device_code:'private-device',user_code:'ABCD',verification_uri:'https://www.twitch.tv/activate?public=true',interval:5,expires_in:1800}}]);await r.auth.connect('a'.repeat(30));assert.deepEqual(r.calls[0].form,{client_id:'a'.repeat(30),scopes:'chat:read'});assert.equal(r.auth.snapshot().userCode,'ABCD');assert.equal(JSON.stringify(r.states).includes('private-device'),false);assert.equal(r.timers[0].ms,5000);r.auth.stop();assert.equal(r.timers[0].cancelled,true);});
test('a pending device code keeps polling and connects after approval',async()=>{
 const client='a'.repeat(30);
 const r=make([
  {status:200,data:{device_code:'pending-device-code',user_code:'ABCD',verification_uri:'https://www.twitch.tv/activate',expires_in:1800,interval:5}},
  {status:400,data:{status:400,message:'authorization_pending'}},
  {status:400,data:{status:400,message:'authorization_pending'}},
  {status:200,data:{access_token:'x'.repeat(30),refresh_token:'r'.repeat(30),expires_in:14400}},
  {status:200,data:{client_id:client,login:'reader',scopes:['chat:read'],expires_in:14400}}
 ]);
 await r.auth.connect(client);
 for(let i=0;i<2;i++){
  const prior=r.timers.at(-1);
  await prior.fn();
  assert.equal(r.auth.snapshot().phase,'waiting');
  assert.equal(prior.cancelled,false);
  assert.equal(r.timers.at(-1).ms,5000);
 }
 await r.timers.at(-1).fn();
 assert.equal(r.auth.snapshot().phase,'ready');
 assert.equal(r.ready.at(-1).login,'reader');
 assert.equal(r.writes.length,1);
 assert.deepEqual(r.calls.map(x=>x.path),['/device','/token','/token','/token','/validate']);
});
test('token becomes usable only after correct client and read scope validation',async()=>{const r=make([{status:200,data:{device_code:'code',user_code:'ABCD',verification_uri:'https://www.twitch.tv/activate',interval:5,expires_in:1800}},{status:200,data:{access_token:'x'.repeat(30),refresh_token:'r'.repeat(30),expires_in:14400}},{status:200,data:{client_id:'a'.repeat(30),login:'reader',user_id:'12',scopes:['chat:read'],expires_in:14400}}]);await r.auth.connect('a'.repeat(30));await r.timers[0].fn();assert.equal(r.auth.snapshot().phase,'ready');assert.equal(r.ready.at(-1).login,'reader');assert.equal(r.writes.length,1);assert.equal(JSON.stringify(r.states).includes('x'.repeat(30)),false);assert.equal(r.timers.at(-1).ms,3600000);});
test('mismatched or broad token validation never starts chat',async()=>{const r=make([{status:200,data:{device_code:'code',user_code:'ABCD',verification_uri:'https://www.twitch.tv/activate',interval:5,expires_in:1800}},{status:200,data:{access_token:'x'.repeat(30),refresh_token:'r'.repeat(30)}},{status:200,data:{client_id:'a'.repeat(30),login:'reader',scopes:['chat:read','chat:edit'],expires_in:100}}]);await r.auth.connect('a'.repeat(30));await r.timers[0].fn();assert.equal(r.auth.snapshot().phase,'error');assert.equal(r.ready.filter(Boolean).length,0);assert.equal(r.writes.length,0);});
test('a nearly expired token refreshes once instead of validating every second',async()=>{
 const client='a'.repeat(30);const r=make([{status:200,data:{device_code:'code',user_code:'ABCD',verification_uri:'https://www.twitch.tv/activate'}},{status:200,data:{access_token:'x'.repeat(30),refresh_token:'r'.repeat(30)}},{status:200,data:{client_id:client,login:'reader',scopes:['chat:read'],expires_in:30}},{status:200,data:{access_token:'y'.repeat(30),refresh_token:'s'.repeat(30)}},{status:200,data:{client_id:client,login:'reader',scopes:['chat:read'],expires_in:14400}}]);
 await r.auth.connect(client);await r.timers[0].fn();await r.timers.at(-1).fn();assert.equal(r.calls[3].path,'/token');assert.equal(r.calls[3].form.grant_type,'refresh_token');assert.equal(r.timers.at(-1).ms,3600000);
});
test('explicit Forget after Off clears the saved grant before revoking its access token',async()=>{
 const client='a'.repeat(30),token='x'.repeat(30);const pending=deferred();
 const r=make([pending.promise],JSON.stringify({clientID:client,access_token:token,refresh_token:'r'.repeat(30)}));
 r.auth.stop();assert.equal(r.readCount(),0);
 const forgetting=r.auth.forget();
 assert.equal(r.readCount(),1,'only explicit Forget may recover the saved grant after Off');
 assert.ok(noGrant(r.saved()),'Keychain must be cleared before the revoke request settles');
 assert.deepEqual(r.calls,[{path:'/revoke',method:'POST',form:{client_id:client,token},headers:{}}]);
 pending.resolve({status:200,data:{}});const result=await forgetting;
 assert.deepEqual(result,{removed:true,revoked:true,stale:false});
 assert.equal(r.auth.snapshot().phase,'off');assert.equal(r.auth.snapshot().message,'');
 assert.equal(JSON.stringify(r.states).includes(token),false);
});
test('late Forget success or failure cannot erase or stop a newly authorized connection',async()=>{
 for(const status of [200,503]){
  const client='a'.repeat(30),oldToken='x'.repeat(30),newToken='y'.repeat(30),pending=deferred();
  const validation={status:200,data:{client_id:client,login:'reader',scopes:['chat:read'],expires_in:14400}};
  const r=make([validation,pending.promise,
   {status:200,data:{device_code:'new-device',user_code:'ABCD',verification_uri:'https://www.twitch.tv/activate'}},
   {status:200,data:{access_token:newToken,refresh_token:'s'.repeat(30)}},validation],
   JSON.stringify({clientID:client,access_token:oldToken,refresh_token:'r'.repeat(30)}));
  await r.auth.connect(client);assert.equal(r.auth.snapshot().phase,'ready');
  const forgetting=r.auth.forget();assert.ok(noGrant(r.saved()));
  await r.auth.connect(client);await r.timers.at(-1).fn();
  assert.equal(r.auth.snapshot().phase,'ready');assert.equal(JSON.parse(r.saved()).access_token,newToken);
  const stateCount=r.states.length,writeCount=r.writes.length,stopCount=r.ready.filter(x=>x===null).length;
  pending.resolve({status,data:{}});const result=await forgetting;
  assert.deepEqual(result,{removed:true,revoked:status===200,stale:true});
  assert.equal(JSON.parse(r.saved()).access_token,newToken);assert.equal(r.auth.snapshot().phase,'ready');
  assert.equal(r.states.length,stateCount);assert.equal(r.writes.length,writeCount);assert.equal(r.ready.filter(x=>x===null).length,stopCount);
  r.auth.stop();
 }
});
test('Forget invalidates an outstanding cached-token validation',async()=>{
 const client='a'.repeat(30),pending=deferred();
 const r=make([pending.promise,{status:200,data:{}}],JSON.stringify({clientID:client,access_token:'x'.repeat(30)}));
 const connecting=r.auth.connect(client);const result=await r.auth.forget();
 pending.resolve({status:200,data:{client_id:client,login:'reader',scopes:['chat:read'],expires_in:14400}});
 assert.equal(await connecting,false);assert.equal(r.ready.filter(Boolean).length,0);assert.ok(noGrant(r.saved()));
 assert.deepEqual(result,{removed:true,revoked:true,stale:false});assert.equal(r.auth.snapshot().phase,'off');
});
test('Forget reports storage and revocation uncertainty without exposing saved data',async()=>{
 const client='a'.repeat(30),token='x'.repeat(30);
 const denied=make([{status:200,data:{}}],JSON.stringify({clientID:client,access_token:token}));
 denied.auth.o.write=()=>false;
 const failedClear=await denied.auth.forget();
 assert.deepEqual(failedClear,{removed:false,revoked:true,stale:false});assert.equal(denied.auth.snapshot().phase,'error');
 assert.match(denied.auth.snapshot().message,/Keychain/);assert.equal(JSON.stringify(denied.states).includes(token),false);
 const unreadable=make();unreadable.auth.o.read=()=>{throw Error('private-value');};
 const unknown=await unreadable.auth.forget();
 assert.deepEqual(unknown,{removed:true,revoked:false,stale:false});assert.equal(unreadable.calls.length,0);
 assert.match(unreadable.auth.snapshot().message,/revocation.*confirmed/i);assert.equal(JSON.stringify(unreadable.states).includes('private-value'),false);
});
test('Sign out then Sign in asks Twitch again instead of silently reusing the old login',async()=>{
 const client='a'.repeat(30);
 const r=make([{status:200,data:{}},{status:200,data:{device_code:'dev',user_code:'WXYZ',verification_uri:'https://www.twitch.tv/activate'}}],
  JSON.stringify({clientID:client,access_token:'x'.repeat(30),refresh_token:'r'.repeat(30)}));
 assert.deepEqual(await r.auth.forget(),{removed:true,revoked:true,stale:false});
 assert.equal(r.saved(),SIGNED_OUT);
 await r.auth.connect(client);
 assert.deepEqual(r.calls.map(c=>c.path),['/revoke','/device'],'no /validate or /token refresh with the signed-out grant');
 assert.equal(r.auth.snapshot().phase,'waiting');r.auth.stop();
});
test('a second Sign out finds nothing to revoke and reports no uncertainty',async()=>{
 const r=make([],SIGNED_OUT);
 assert.deepEqual(await r.auth.forget(),{removed:true,revoked:true,stale:false});
 assert.equal(r.calls.length,0);assert.equal(r.auth.snapshot().message,'');
});
