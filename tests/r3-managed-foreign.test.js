'use strict';

// v0.5.5 release review r3 #5, managed path (docs/reviews/2026-11-22-v0.5.5-release-review.md, "Reviewer
// output, round 3"): when a window Streams opened loads a foreign file, the hook continues at once, on the
// hook. Only the controller's deactivation waits for a main-thread turn, fenced by the load generation.
// IINA invalidates plugin timers on unload (JavascriptPluginInstance.swift L72-78, v1.5.1, as cited by the
// review), and removing hook registrations does not continue a hook already dispatched (MPVController.swift
// L1067-1070), so a continuation that waits for a timer may never come.

const test = require('node:test');
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {createRequire} = require('node:module');
const Sources = require('../src/source.js');
const {createIina} = require('./support/iina-shim.js');

const playerPath = join(__dirname, '../src/player.js');
const requireFromPlayer = createRequire(playerPath);
const vod = Sources.parse('https://www.twitch.tv/videos/300000003');
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
  const resolves = [];
  const services = {
    readSettings: () => ({chatEnabled: false}),
    saveSettings() {},
    cancelHelpers() {},
    dataPath: name => '/private/r3-managed/' + name,
    runHelper: async (_name, args) => ({ok: true, indexPath: args[4] + '/index.json'}),
    readFile: file => JSON.stringify(file.endsWith('/index.json') ? index : [{id: 'synthetic-1', time: 40,
      author: 'Synthetic', text: 'Synthetic fixture message', color: '', badges: [], kind: 'message'}]),
    deleteDataPath: () => true,
    async resolve() {
      resolves.push(vod.url);
      return {ok: true, title: 'VOD', live: false, duration: 600, quality: '720p60', formats: [],
        mediaURL: 'https://media.invalid/vod.m3u8'};
    }
  };
  const controller = module.exports.start(shim.iina, {variant: 'unified'}, services);
  t.after(() => shim.emit('iina.window-will-close'));
  return {shim, controller, resolves};
}

async function withReplay(t) {
  const w = replayWindow(t);
  await w.shim.mpv.runHook('on_load', () => {});
  w.shim.emit('iina.file-loaded', vod.url);
  assert.equal(await w.controller.importArchive('/archives/synthetic.json'), true, 'precondition: replay imported');
  assert.equal(w.controller.snapshot().chat.mode, 'replay');
  return w;
}

// Starts the hook for a foreign file and returns its continuation count and the cleanup turn it scheduled.
function foreignLoad(shim) {
  shim.mpv.set('path', localFile);
  const before = new Set(shim.timers.all);
  const offsBefore = shim.event.offs.length;
  const state = {continued: 0};
  state.promise = shim.mpv.runHook('on_load', () => state.continued++);
  state.continuedOnHook = state.continued;
  state.offsOnHook = shim.event.offs.length - offsBefore;
  state.cleanup = shim.timers.pending().filter(timer => !before.has(timer) && timer.delay === 0);
  return state;
}

test('r3 #5: a foreign file in a managed window continues at once, with no event.off on the hook', async t => {
  const {shim, controller} = await withReplay(t);
  const offsBefore = shim.event.offs.length;
  const load = foreignLoad(shim);
  assert.equal(load.continuedOnHook, 1, 'continued synchronously, on the hook');
  await settle();
  assert.equal(shim.event.offs.length, offsBefore, 'no event.off on the hook stack');
  assert.deepEqual(shim.mpv.offMainCalls, [], 'no main-thread UI call on the hook stack');
  assert.equal(controller.snapshot().chat.mode, 'replay', 'deactivation waits for its turn');

  shim.timers.advance(0);
  await load.promise;
  assert.equal(load.continued, 1, 'still once after the turn');
  assert.equal(controller.snapshot().phase, 'inactive', 'the turn deactivates the controller');
  assert.ok(shim.event.offs.some(off => off.name === 'mpv.time-pos.changed'), 'off the hook, on the turn');
});

test('r3 #5: a cleanup turn that never runs still leaves exactly one continuation', async t => {
  const {shim} = await withReplay(t);
  const load = foreignLoad(shim);
  assert.equal(load.cleanup.length, 1, 'precondition: one cleanup turn is scheduled');
  for (const timer of load.cleanup) shim.timers.clearTimeout(timer.id); // As when IINA unloads timers.
  shim.timers.advance(60_000);
  await settle();
  assert.equal(load.continued, 1);
});

test('r3 #5: a late cleanup turn does not deactivate the controller for the load after it', async t => {
  const {shim, controller, resolves} = await withReplay(t);
  const load = foreignLoad(shim);
  assert.equal(load.cleanup.length, 1, 'precondition: one cleanup turn is scheduled');

  // The window returns to its own stream before the delayed cleanup turn runs.
  shim.mpv.set('path', vod.url);
  let continued = 0;
  await shim.mpv.runHook('on_load', () => continued++);
  assert.equal(continued, 1, 'precondition: the next load continued');
  assert.equal(resolves.length, 2, 'precondition: the next load resolved the stream again');

  shim.timers.fire(load.cleanup[0]);
  await settle();
  assert.notEqual(controller.snapshot().phase, 'inactive', 'the late turn leaves the later load alone');
  // v0.5.5 class L (L2, L3): the later load is a new activation with fresh state, so the earlier load's replay
  // chat is dropped with its activation, not resumed.
  assert.equal(controller.snapshot().chat.mode, 'off', 'the earlier activation\'s replay is not resumed');
});

test('r3 #5: a close before the cleanup turn leaves the close in charge', async t => {
  const {shim, controller} = await withReplay(t);
  const load = foreignLoad(shim);
  assert.equal(load.continuedOnHook, 1);
  shim.emit('iina.window-will-close');
  shim.timers.advance(0);
  await settle();
  assert.equal(load.continued, 1);
  assert.equal(controller.snapshot().phase, 'closed');
});
