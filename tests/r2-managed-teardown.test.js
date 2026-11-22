'use strict';

// v0.5.5 release review r2 #6 (docs/reviews/2026-11-22-v0.5.5-release-review.md, "Reviewer output, round 2"):
// IINA v1.5.1 calls the on_load hook on mpv's event queue, and event.on/off change listener state the main
// thread reads (MPVController.swift L1241-1247, as cited by the review). When a window Streams created
// loads a foreign file, its controller deactivates on a main-thread turn, as the adopted path does, never
// on the hook's stack.
//
// "The hook's stack" here is everything before the first timer turn: the synchronous call and every
// continuation of an already-resolved await, which JavaScriptCore runs before returning to mpv's queue.
// The shim does not record event.off on a hook stack (offMainCalls covers sidebar/menu calls only), so the
// test counts shim.event.offs before and after the 0 ms turn.

const test = require('node:test');
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {createRequire} = require('node:module');
const Sources = require('../src/source.js');
const {createIina} = require('./support/iina-shim.js');

const playerPath = join(__dirname, '../src/player.js');
const requireFromPlayer = createRequire(playerPath);
const vod = Sources.parse('https://www.twitch.tv/videos/200000002');
const localFile = '/Users/fixture/movie.mkv';
const settle = () => new Promise(resolve => setImmediate(resolve));

function replayWindow(t) {
  const shim = createIina({label: Sources.label(vod, 'unified'), mpv: {path: vod.url, 'time-pos': 40, duration: 600}});
  const module = {exports: {}};
  shim.runScript(playerPath, {globals: {module, Date: shim.timers.Date}, require: requireFromPlayer});
  const index = {
    version: 1, sourceId: vod.id, title: 'Synthetic archive', count: 1, timeline: {availableStart: 40},
    chunks: [{file: 'chunk-000000.json', start: 40, end: 40, count: 1}]
  };
  const services = {
    readSettings: () => ({chatEnabled: false}),
    saveSettings() {},
    cancelHelpers() {},
    dataPath: name => '/private/r2-managed/' + name,
    runHelper: async (_name, args) => ({ok: true, indexPath: args[4] + '/index.json'}),
    readFile: file => JSON.stringify(file.endsWith('/index.json') ? index : [{id: 'synthetic-1', time: 40,
      author: 'Synthetic', text: 'Synthetic fixture message', color: '', badges: [], kind: 'message'}]),
    deleteDataPath: () => true,
    async resolve() {
      return {ok: true, title: 'VOD', live: false, duration: 600, quality: '720p60', formats: [],
        mediaURL: 'https://media.invalid/vod.m3u8'};
    }
  };
  const controller = module.exports.start(shim.iina, {variant: 'unified'}, services);
  t.after(() => shim.emit('iina.window-will-close'));
  return {shim, controller};
}

test('r2 #6: a managed replay window replaced by local media runs no event.off on the hook stack', async t => {
  const {shim, controller} = replayWindow(t);
  await shim.mpv.runHook('on_load', () => {});
  shim.emit('iina.file-loaded', vod.url);
  assert.equal(await controller.importArchive('/archives/synthetic.json'), true, 'precondition: replay imported');
  assert.equal(controller.snapshot().chat.mode, 'replay');
  assert.equal(shim.event.listeners.get('mpv.time-pos.changed')?.size, 1,
    'precondition: replay observes the playhead, so deactivation has a listener to remove');

  shim.mpv.set('path', localFile);
  const offsBefore = shim.event.offs.length;
  let continued = 0;
  const hook = shim.mpv.runHook('on_load', () => continued++);
  await settle(); // Microtasks only: no timer has run.
  assert.equal(shim.event.offs.length, offsBefore, 'no event.off on the hook stack');
  assert.equal(controller.snapshot().chat.mode, 'replay', 'deactivation waits for the main-thread turn');
  assert.equal(continued, 0, 'the load is held until then, as in the adopted path');

  shim.timers.advance(0);
  await hook;
  assert.equal(continued, 1, 'the load continues once');
  assert.ok(shim.event.offs.some(off => off.name === 'mpv.time-pos.changed'), 'the replay observer is removed');
  assert.equal(shim.event.listeners.get('mpv.time-pos.changed')?.size || 0, 0);
  assert.equal(controller.snapshot().phase, 'inactive');
});

test('r2 #6: a close during the turn leaves the deactivation to the close', async t => {
  const {shim, controller} = replayWindow(t);
  await shim.mpv.runHook('on_load', () => {});
  shim.emit('iina.file-loaded', vod.url);
  shim.mpv.set('path', localFile);
  let continued = 0;
  const hook = shim.mpv.runHook('on_load', () => continued++);
  await settle();
  shim.emit('iina.window-will-close');
  shim.timers.advance(0);
  await hook;
  assert.equal(continued, 1);
  assert.equal(controller.snapshot().phase, 'closed', 'the close is not overwritten by a late deactivation');
});
