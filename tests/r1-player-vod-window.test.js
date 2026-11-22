'use strict';

// v0.5.5 release review r1 #10 (docs/reviews/2026-11-22-v0.5.5-release-review.md): helpers/acquire.py
// publishes a partial window (hasMore: true) when Twitch answers with empty pages that say more follow. Its
// `end` is the newest message gathered, so it can sit at or behind the playhead it was asked for. An
// automatic fetch that makes no progress past the playhead must not repeat at the same position: it waits
// until the playhead passes that window, or the user seeks or retries. The partial chat stays.
//
// The player runs in a vm context on the shim's fake clock, so the 2.5 s retry gate really elapses.

const test = require('node:test');
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {createRequire} = require('node:module');
const Sources = require('../src/source.js');
const {createIina} = require('./support/iina-shim.js');

const playerPath = join(__dirname, '../src/player.js');
const requireFromPlayer = createRequire(playerPath);
const vod = Sources.parse('https://www.twitch.tv/videos/100000003');
const settle = async (rounds = 6) => {
  for (let i = 0; i < rounds; i++) await new Promise(resolve => setImmediate(resolve));
};

// `windowFor(at)` gives the acquire helper's window for a request at `at`.
function vodWindow(t, windowFor) {
  const shim = createIina({label: Sources.label(vod, 'unified'), mpv: {path: vod.url, 'time-pos': 100, speed: 1}});
  shim.timers.advance(Date.parse('2026-01-01T00:00:00Z'));
  const module = {exports: {}};
  shim.runScript(playerPath, {globals: {module, Date: shim.timers.Date}, require: requireFromPlayer});
  const files = new Map();
  const acquired = [];
  const services = {
    readSettings: () => ({chatEnabled: true}),
    saveSettings: () => {},
    dataPath: name => '/data/' + name,
    readFile: path => files.get(path),
    deleteDataPath: () => true,
    cancelHelpers: () => 0,
    async resolve() {
      return {ok: true, title: 'VOD', live: false, duration: 30000, quality: '720p60', formats: [],
        mediaURL: 'https://media.invalid/vod.m3u8'};
    },
    async runHelper(name, args) {
      const output = args[args.indexOf('--output') + 1];
      if (name === 'acquire') {
        const at = Number(args[args.indexOf('--at') + 1]);
        acquired.push(at);
        return {ok: true, path: output + '/replay.jsonl', window: Object.assign({requested: at}, windowFor(at))};
      }
      const time = 93;
      const index = {version: 1, sourceId: vod.id, count: 1, title: 'Twitch window',
        timeline: {availableStart: time, availableEnd: time}, chunks: [{file: 'chunk-000000.json', start: time, end: time, count: 1}]};
      files.set(output + '/index.json', JSON.stringify(index));
      files.set(output + '/chunk-000000.json', JSON.stringify([{id: 'partial-1', time, author: 'A', text: 'partial', color: '#AABBCC', badges: [], kind: 'message'}]));
      return {ok: true, indexPath: output + '/index.json'};
    }
  };
  const controller = module.exports.start(shim.iina, {identifier: 'local.iina.streams', variant: 'unified'}, services);
  t.after(() => shim.emit('iina.window-will-close'));

  async function open() {
    await shim.mpv.runHook('on_load', () => {});
    shim.emit('iina.file-loaded', vod.url);
    await settle();
  }
  // Wall time passes while the playhead sits at `position`; time-pos ticks drive automatic fetches.
  async function play(position, seconds) {
    shim.mpv.set('time-pos', position);
    for (let i = 0; i < seconds; i++) {
      shim.timers.advance(1000);
      shim.emit('mpv.time-pos.changed');
      await settle();
    }
  }
  async function seek(position) {
    shim.mpv.set('time-pos', position);
    shim.emit('mpv.seek');
    await settle();
  }
  return {shim, controller, acquired, open, play, seek};
}

test('r1 #10: a repeated partial window behind a fixed playhead fetches once, keeps its chat, and a seek resumes',
  async t => {
    const w = vodWindow(t, at => ({start: Math.max(0, at - 8), end: at - 5, hasMore: true}));
    await w.open();
    assert.deepEqual(w.acquired, [100], 'the first window is requested at the playhead');
    assert.equal(w.controller.snapshot().chat.mode, 'replay');
    assert.equal(w.controller.snapshot().chat.state, 'ready', 'precondition: the partial window imported');
    await w.play(100, 12);
    assert.deepEqual(w.acquired, [100], 'no repeat at the same position, past the 2.5 s retry gate');
    assert.equal(w.controller.snapshot().chat.mode, 'replay', 'the partial chat stays');
    assert.equal(w.controller.snapshot().chat.available, true);

    await w.seek(500);
    assert.deepEqual(w.acquired, [100, 500], 'a seek out of the window fetches again');
  });

test('r1 #10: a partial window just ahead of the playhead waits until playback passes its end', async t => {
  const w = vodWindow(t, at => ({start: Math.max(0, at - 8), end: at + 10, hasMore: true}));
  await w.open();
  assert.deepEqual(w.acquired, [100]);
  await w.play(100, 6);
  await w.play(105, 6);
  await w.play(110, 6);
  assert.deepEqual(w.acquired, [100], 'no automatic fetch while the playhead is inside the window');
  await w.play(111, 4);
  assert.deepEqual(w.acquired, [100, 111], 'playback past the window\'s end resumes acquisition');
});

test('r1 #10: a full window still prefetches near its end as before', async t => {
  const w = vodWindow(t, at => ({start: Math.max(0, at - 8), end: at + 65, hasMore: true}));
  await w.open();
  await w.play(152, 4);
  assert.deepEqual(w.acquired, [100, 152], 'prefetch within 15 s of the end');
});

test('r1 #10: the user retrying fetches at the stalled position', async t => {
  const w = vodWindow(t, at => ({start: Math.max(0, at - 8), end: at - 5, hasMore: true}));
  await w.open();
  await w.play(100, 6);
  assert.deepEqual(w.acquired, [100]);
  w.shim.sidebar.send('fetch-replay', {});
  await settle();
  assert.deepEqual(w.acquired, [100, 100], 'a user retry is not suppressed');
});
