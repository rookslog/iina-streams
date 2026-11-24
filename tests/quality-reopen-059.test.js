"use strict";
// #59 (0.5.6, lead, 2026-11-24): an unmarked reopen of the same source after a confirmed quality change.
// Review record: docs/reviews/2026-11-22-v0.5.5-release-review.md, round 6, finding 4 (pre-existing in 0.5.4).
// Mutation check: reverting the fix (keeping only the first result's metadata) fails both assertions.
const test=require('node:test');const assert=require('node:assert/strict');
const source=require('../src/source.js');
const {start}=require('../src/player.js');
const {createIina}=require('./support/iina-shim.js');
const URL1='https://www.twitch.tv/videos/123456';
const FORMATS=[{id:'360p30',label:'360p'},{id:'720p60',label:'720p'}];
function host(label){
 const shim=createIina({label,mpv:{path:URL1,'stream-open-filename':URL1}});
 return{h:shim.iina,shim,setPath:p=>shim.mpv.set('path',p).set('stream-open-filename',p)};
}
async function finishLoad(r,url){r.shim.emit('iina.file-loaded',url);r.shim.emit('iina.window-size-adjusted');await new Promise(resolve=>setTimeout(resolve,650));}

test('#59 an unmarked reopen after a confirmed 360p change reports 720p, and 360p can be chosen again', async () => {
  const r = host(source.label(source.parse(URL1), 'unified'));
  const calls = [];
  const resolve = async (s, q) => {
    calls.push(q);
    const quality = q === 'auto720' ? '720p60' : q;
    return {ok: true, title: 'Recording', live: false, duration: 100, quality, formats: FORMATS, mediaURL: 'https://vod-secure.twitch.tv/' + quality};
  };
  const c = start(r.h, {variant: 'unified'}, {resolve, readSettings: () => ({chatEnabled: false})});
  await r.shim.mpv.runHook('on_load', () => {});
  await finishLoad(r, URL1);
  assert.equal(c.snapshot().quality, '720p60', 'fixture: the first load is 720p');

  await c.changeQuality('360p30');
  r.setPath(URL1 + '#streams-generation=1');
  await r.shim.mpv.runHook('on_load', () => {});
  await finishLoad(r, URL1 + '#streams-generation=1');
  assert.equal(c.snapshot().quality, '360p30', 'fixture: the change to 360p is confirmed');

  // The same source reopened without a generation marker; the resolver returns 720p.
  r.setPath(URL1);
  await r.shim.mpv.runHook('on_load', () => {});
  await finishLoad(r, URL1);
  assert.equal(c.snapshot().quality, '720p60', 'the selector reports the quality that is playing');

  const before = calls.length;
  await c.changeQuality('360p30');
  assert.equal(calls.length - before, 1, 'choosing 360p again makes one new resolver call');
});
