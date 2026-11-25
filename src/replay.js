'use strict';
// Offline playback windows. The host owns file IO and calls clear() on Off/close.
const MAX_CHUNKS=10000, MAX_RECORDS=2000000, MAX_BYTES=1048576, MAX_TIME=31536000;
function finite(value){return typeof value==='number'&&Number.isFinite(value);}
function timestamp(value){return finite(value)&&value>=0&&value<=MAX_TIME;}
function integer(value,min,max){return Number.isInteger(value)&&value>=min&&value<=max;}
function bytes(value){
 let size=0;
 for(let i=0;i<value.length;i++){
  const c=value.charCodeAt(i);
  if(c<128)size++;else if(c<2048)size+=2;
  else if(c>=0xD800&&c<=0xDBFF&&i+1<value.length&&value.charCodeAt(i+1)>=0xDC00&&value.charCodeAt(i+1)<=0xDFFF){size+=4;i++;}
  else size+=3;
  if(size>MAX_BYTES)return size;
 }
 return size;
}
function upperBound(values,time,key){
 let lo=0,hi=values.length;
 while(lo<hi){const mid=Math.floor((lo+hi)/2);if(values[mid][key]<=time)lo=mid+1;else hi=mid;}
 return lo;
}
function copy(row){const result=Object.assign({},row);result.badges=row.badges.slice();return result;}
class Replay {
 constructor(index,readChunk){
  if(!index||index.version!==1||typeof readChunk!=='function'||!Array.isArray(index.chunks)||index.chunks.length>MAX_CHUNKS||!integer(index.count,0,MAX_RECORDS))throw Error('Invalid replay index.');
  this.chunks=[];this.cache=new Map();this.readChunk=readChunk;
  let total=0,lastEnd=-1;const paths=new Set();
  for(const chunk of index.chunks){
   if(!chunk||typeof chunk.file!=='string'||!/^chunk-\d{6}\.json$/.test(chunk.file)||paths.has(chunk.file)||!timestamp(chunk.start)||!timestamp(chunk.end)||chunk.start>chunk.end||chunk.start<lastEnd||!integer(chunk.count,1,1000))throw Error('Invalid replay index or chunk path.');
   total+=chunk.count;lastEnd=chunk.end;paths.add(chunk.file);
   this.chunks.push({file:chunk.file,start:chunk.start,end:chunk.end,count:chunk.count});
  }
  if(total!==index.count)throw Error('Invalid replay index count.');
 }
 clear(){this.cache.clear();}
 load(chunk){
  if(this.cache.has(chunk.file)){
   const rows=this.cache.get(chunk.file);this.cache.delete(chunk.file);this.cache.set(chunk.file,rows);return rows;
  }
  let raw;
  try{raw=this.readChunk(chunk.file);}catch(_){throw Error('Replay chunk could not be read.');}
  let rows;
  try{
   if(typeof raw==='string'){
    if(raw.length>MAX_BYTES||bytes(raw)>MAX_BYTES)throw Error();
    raw=JSON.parse(raw);
   }
   if(!Array.isArray(raw)||raw.length!==chunk.count||raw.length>1000)throw Error();
   rows=[];let previous=-1,size=2;
   for(const row of raw){
    if(!row||!timestamp(row.time)||row.time<previous||row.time<chunk.start||row.time>chunk.end||typeof row.id!=='string'||!row.id.length||row.id.length>256||typeof row.author!=='string'||row.author.length>128||typeof row.text!=='string'||!row.text.length||row.text.length>16000||typeof row.color!=='string'||(row.color!==''&&!/^#[0-9a-fA-F]{6}$/.test(row.color))||!Array.isArray(row.badges)||row.badges.length>16||row.badges.some(b=>typeof b!=='string'||b.length>40)||row.kind!=='message'||(row.deletedAt!==undefined&&(!timestamp(row.deletedAt)||row.deletedAt<row.time)))throw Error();
    const clean={id:row.id,time:row.time,author:row.author,text:row.text,color:row.color,badges:row.badges.slice(),kind:'message'};
    if(typeof row.emotes==='string'&&row.emotes.length<=2048)clean.emotes=row.emotes;
    if(row.deletedAt!==undefined)clean.deletedAt=row.deletedAt;
    size+=bytes(JSON.stringify(clean))+(rows.length?1:0);if(size>MAX_BYTES)throw Error();
    rows.push(clean);previous=row.time;
   }
   if(!rows.length||rows[0].time!==chunk.start||rows[rows.length-1].time!==chunk.end)throw Error();
  }catch(_){throw Error('Replay chunk is malformed or exceeds its size limit.');}
  this.cache.set(chunk.file,rows);
  while(this.cache.size>2)this.cache.delete(this.cache.keys().next().value);
  return rows;
 }
 windowAt(videoSeconds,options){
  options=options||{};
  if(!finite(videoSeconds)||videoSeconds<0)return[];
  const offset=options.offsetSeconds===undefined?0:options.offsetSeconds;
  if(!finite(offset)||Math.abs(offset)>MAX_TIME)throw Error('Invalid replay offset.');
  const now=videoSeconds+offset;if(now<0||now>MAX_TIME)return[];
  const limit=finite(options.limit)?Math.max(1,Math.min(500,Math.floor(options.limit))):150;
  const windowSeconds=finite(options.windowSeconds)?Math.max(0,Math.min(3600,options.windowSeconds)):120;
  const lower=Math.max(0,now-windowSeconds),result=[];
  for(let i=upperBound(this.chunks,now,'start')-1;i>=0&&result.length<limit;i--){
   const chunk=this.chunks[i];if(chunk.end<lower)break;
   const rows=this.load(chunk);
   for(let j=upperBound(rows,now,'time')-1;j>=0&&result.length<limit;j--){
    const row=rows[j];if(row.time<lower)break;
    if(row.deletedAt===undefined||row.deletedAt>now)result.push(copy(row));
   }
  }
  return result.reverse();
 }
}
module.exports={Replay};
