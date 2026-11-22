"use strict";
const SCOPE='chat:read';
// Sign out overwrites the saved grant with this marker. Writing '' does not erase it: macOS
// SecItemUpdate with empty data reports success but keeps the old contents (probed 2026-11-22),
// so an empty write left the refresh token behind and the next Sign in silently reused it.
const SIGNED_OUT='{"signedOut":true}';
const holdsTokens=v=>!!v&&typeof v==='object'&&(typeof v.access_token==='string'&&!!v.access_token||typeof v.refresh_token==='string'&&!!v.refresh_token);
class TwitchAuth {
 constructor(options){this.o=options;this.generation=0;this.timer=null;this.secret=null;this.sessionOnly=false;this.lostSessionGrant=false;this.client='';this.state={phase:'off',message:'',userCode:'',verificationURI:''};}
 snapshot(){return Object.assign({},this.state);}
 publish(phase,message,extra){this.state=Object.assign({phase,message:message||'',userCode:'',verificationURI:''},extra||{});this.o.onState(this.snapshot());}
 clearTimer(){if(this.timer!==null){this.o.clearTimer(this.timer);this.timer=null;}}
 // A grant whose Keychain save failed lives only in memory. If stop() drops it, Twitch still holds that
 // unrevoked grant and nothing here can send the revocation; forget() reports that instead of success.
 stop(){this.generation++;this.clearTimer();if(this.secret&&this.sessionOnly)this.lostSessionGrant=true;this.secret=null;this.publish('off');if(this.o.onStop)this.o.onStop();}
 fail(message){this.clearTimer();this.secret=null;this.publish('error',message);if(this.o.onStop)this.o.onStop();}
 schedule(fn,ms,generation){this.clearTimer();this.timer=this.o.setTimer(async()=>{this.timer=null;if(generation===this.generation)await fn();},ms);}
 // Parses a stored grant. On bad JSON it reports a fixed code (never the text) and rethrows, so callers keep their behaviour.
 parseGrant(text){try{return JSON.parse(text);}catch(error){try{if(this.o.diagnostic)this.o.diagnostic('keychain-unreadable');}catch(_){/* a failing diagnostic must not change sign-in or Forget */}throw error;}}
 async connect(clientID){
  this.stop();const generation=this.generation;this.client=String(clientID||'').trim();
  if(!/^[a-zA-Z0-9]{10,64}$/.test(this.client)){this.publish('needs-client','Enter a registered Twitch Public Client ID to connect.');return false;}
  this.publish('authorizing','Checking Twitch authorization…');
  try{
   let stored=null;try{stored=this.o.read();if(typeof stored==='string'&&stored)stored=this.parseGrant(stored);}catch(_){/* unreadable item: treated as no saved grant, so a fresh sign-in starts */}
   if(stored&&stored.clientID===this.client&&typeof stored.access_token==='string'){
    this.secret=stored;this.sessionOnly=false;
    if(await this.validate(generation,false))return true;
    if(generation!==this.generation)return false;
    if(stored.refresh_token&&await this.refresh(generation))return true;
    this.secret=null;
   }
   const res=await this.o.request('/device','POST',{client_id:this.client,scopes:SCOPE},{});
   if(generation!==this.generation)return false;
   const data=res&&res.data||{};
   if(!res||res.status!==200||typeof data.device_code!=='string'||!/^https:\/\/(?:www\.)?twitch\.tv\/activate(?:\?|$)/.test(data.verification_uri||'')||!/^[A-Za-z0-9-]{4,32}$/.test(data.user_code||''))throw Error('device');
   const expires=this.o.now()+Math.min(1800,Number(data.expires_in)||600)*1000;
   const interval=Math.max(5,Math.min(60,Number(data.interval)||5))*1000;
   this.publish('waiting','',{userCode:data.user_code,verificationURI:data.verification_uri});
   this.schedule(()=>this.poll(data.device_code,expires,interval,generation),interval,generation);return true;
  }catch(_){if(generation===this.generation)this.fail('Twitch authorization is unavailable. Check the Public Client ID and try again.');return false;}
 }
 async poll(deviceCode,expires,interval,generation){
  if(generation!==this.generation)return;
  if(this.o.now()>=expires){this.fail('Authorization expired. Connect again.');return;}
  try{
   const res=await this.o.request('/token','POST',{client_id:this.client,scopes:SCOPE,device_code:deviceCode,grant_type:'urn:ietf:params:oauth:grant-type:device_code'},{});
   if(generation!==this.generation)return;
   const data=res&&res.data||{};
   if(res&&res.status===200&&/^[A-Za-z0-9_-]{16,512}$/.test(data.access_token||'')){
    this.secret={clientID:this.client,access_token:data.access_token,refresh_token:data.refresh_token||''};
    if(!await this.validate(generation,true)&&generation===this.generation)this.fail('The token does not grant only read-only chat for this application.');return;
   }
   if(['authorization_pending','slow_down'].includes(data.message)||['authorization_pending','slow_down'].includes(data.error)){
    const delay=(data.message==='slow_down'||data.error==='slow_down')?Math.min(60000,interval+5000):interval;
    this.schedule(()=>this.poll(deviceCode,expires,delay,generation),delay,generation);return;
   }
   this.fail('Twitch authorization was declined or expired.');
  }catch(_){if(generation===this.generation)this.fail('Twitch authorization could not complete. Connect again.');}
 }
 async validate(generation,persist){
  const token=this.secret&&this.secret.access_token;if(!token)return false;
  const res=await this.o.request('/validate','GET',null,{Authorization:'OAuth '+token});
  if(generation!==this.generation)return false;
  const data=res&&res.data||{};
  if(!res||res.status!==200||data.client_id!==this.client||!/^[a-z0-9_]{3,25}$/.test(data.login||'')||!Array.isArray(data.scopes)||data.scopes.length!==1||data.scopes[0]!==SCOPE||!(data.expires_in>0))return false;
  let saved=true;if(persist)try{saved=this.o.write(JSON.stringify(this.secret))!==false;}catch(_){saved=false;}
  if(persist)this.sessionOnly=!saved;
  this.publish('ready',saved?'':'Connected for this session; Keychain storage failed.',{login:data.login});
  this.o.onReady({token,login:data.login,clientID:this.client});
  const refreshBeforeExpiry=!!this.secret.refresh_token&&data.expires_in<=3660;
  const delay=Math.max(1000,Math.min(3600000,(data.expires_in-(refreshBeforeExpiry?60:0))*1000));
  this.schedule(async()=>{
   try{
    if(refreshBeforeExpiry){if(!await this.refresh(generation)&&generation===this.generation)this.fail('Twitch authorization expired. Connect again.');return;}
    if(!await this.validate(generation,false)&&generation===this.generation){
     if(!await this.refresh(generation)&&generation===this.generation)this.fail('Twitch authorization expired. Connect again.');
    }
   }catch(_){if(generation===this.generation)this.fail('Twitch authorization could not be verified. Reconnect to resume chat.');}
  },delay,generation);return true;
 }
 async refresh(generation){
  if(!this.secret||!this.secret.refresh_token)return false;
  const res=await this.o.request('/token','POST',{client_id:this.client,grant_type:'refresh_token',refresh_token:this.secret.refresh_token},{});
  if(generation!==this.generation)return false;
  const data=res&&res.data||{};
  if(!res||res.status!==200||!/^[A-Za-z0-9_-]{16,512}$/.test(data.access_token||''))return false;
  this.secret={clientID:this.client,access_token:data.access_token,refresh_token:data.refresh_token||''};
  return this.validate(generation,true);
 }
 async forget(){
  // Off deliberately releases the in-memory token. Explicit Forget may recover
  // this plugin's own saved grant so revocation still works after disconnecting.
  let saved=this.secret,known=true;
  if(!saved)try{saved=this.o.read();if(typeof saved==='string'&&saved)saved=this.parseGrant(saved);}catch(_){saved=null;known=false;}
  const grant=saved&&typeof saved.clientID==='string'&&/^[A-Za-z0-9]{10,64}$/.test(saved.clientID)&&typeof saved.access_token==='string'&&/^[A-Za-z0-9_-]{16,512}$/.test(saved.access_token)?{clientID:saved.clientID,token:saved.access_token}:null;
  if(saved&&!grant&&holdsTokens(saved))known=false;
  // Read before stop(): stop() also sets the flag for the grant held right now, which this call revokes itself.
  const droppedSessionGrant=this.lostSessionGrant;
  this.stop();this.lostSessionGrant=false;const generation=this.generation;
  // Clear before awaiting the network; an older Forget must never erase a new
  // connection's persisted token when its revocation response arrives later.
  let removed=true;try{removed=this.o.write(SIGNED_OUT)!==false;}catch(_){removed=false;}
  let revoked=known&&!grant;
  if(grant)try{const r=await this.o.request('/revoke','POST',{client_id:grant.clientID,token:grant.token},{});revoked=!!r&&r.status===200;}catch(_){revoked=false;}
  // Revoking whatever grant we could find says nothing about a session-only grant that was dropped earlier
  // (stop() sets lostSessionGrant): Twitch still holds that one, so the result stays unconfirmed (#53).
  if(droppedSessionGrant)revoked=false;
  const stale=generation!==this.generation;
  if(!stale){
   if(!removed)this.publish('error','Keychain could not clear the saved authorization.');
   else if(!revoked)this.publish('off','Saved authorization cleared. Twitch revocation could not be confirmed.');
  }
  return{removed,revoked,stale};
 }
}
module.exports={TwitchAuth,SIGNED_OUT};
