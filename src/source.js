"use strict";
const RESERVED=/^(videos|directory|search|settings|subscriptions|following|downloads|login|signup|products|p|popout|clips)$/i;
function seconds(value){
 if(!value)return 0;
 if(/^\d+(?:\.\d+)?$/.test(value))return Math.min(2592000,Number(value));
 const m=value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
 return m?Math.min(2592000,Number(m[1]||0)*3600+Number(m[2]||0)*60+Number(m[3]||0)):0;
}
function queryValue(query,key){const m=query.match(new RegExp('(?:^|[?&#])'+key+'=([^&#]*)'));try{return m?decodeURIComponent(m[1]):'';}catch(_){return '';}}
function parse(input){
 if(typeof input!=='string')return null;
 const value=input.trim();
 if(!value||value.length>2048||/[\x00-\x20\x7f]/.test(value))return null;
 if(/^[A-Za-z0-9_]{3,25}$/.test(value)&&!RESERVED.test(value)){const id=value.toLowerCase();return{kind:'twitch-live',provider:'Twitch',id,url:'https://www.twitch.tv/'+id,startSeconds:0};}
 const t=value.match(/^(?:https?:\/\/)?(?:(?:www|m)\.)?twitch\.tv\/([^?#]*)([?#].*)?$/i);
 if(t){
  const path=t[1].replace(/\/$/,'');
  const vod=path.match(/^videos\/(\d{1,20})$/);
  if(vod)return{kind:'twitch-vod',provider:'Twitch',id:vod[1],url:'https://www.twitch.tv/videos/'+vod[1],startSeconds:seconds(queryValue(t[2]||'','t'))};
  if(/^[A-Za-z0-9_]{3,25}$/.test(path)&&!RESERVED.test(path)){const id=path.toLowerCase();return{kind:'twitch-live',provider:'Twitch',id,url:'https://www.twitch.tv/'+id,startSeconds:0};}
  return null;
 }
 const y=value.match(/^https?:\/\/(?:(?:www|m|music)\.)?(youtube\.com|youtu\.be)\/([^?#]*)([?#].*)?$/i);
 if(!y)return null;
 let id='';const path=y[2].replace(/\/$/,'');
 if(y[1].toLowerCase()==='youtu.be')id=path;
 else if(path==='watch')id=queryValue(y[3]||'','v');
 else {const m=path.match(/^(?:live|shorts|embed)\/([-A-Za-z0-9_]{11})$/);if(m)id=m[1];}
 if(!/^[-A-Za-z0-9_]{11}$/.test(id))return null;
 return{kind:'youtube',provider:'YouTube',id,url:'https://www.youtube.com/watch?v='+id,startSeconds:seconds(queryValue(y[3]||'','t')||queryValue(y[3]||'','start'))};
}
function label(source,variant){
 const canonical=source&&parse(source.url);
 if(!canonical||!['unified','focus'].includes(variant))throw Error('Invalid player identity');
 canonical.startSeconds=Number.isFinite(source.startSeconds)?Math.max(0,Math.min(2592000,source.startSeconds)):canonical.startSeconds;
 return 'streams-candidate:'+encodeURIComponent(JSON.stringify({source:canonical,variant}));
}
function fromLabel(value){
 try{
  if(typeof value!=='string'||value.length>4096||!value.startsWith('streams-candidate:'))return null;
  const parsed=JSON.parse(decodeURIComponent(value.slice(18)));
  const encoded=label(parsed.source,parsed.variant);
  return JSON.parse(decodeURIComponent(encoded.slice(18)));
 }catch(_){return null;}
}
module.exports={parse,seconds,label,fromLabel};
