'use strict';
// A failed first VOD chat fetch must still service a newer seek queued in the same chat generation (#44).
// Release review finding 5. The harness follows tests/twitch-window-player.test.js: helper calls stay
// pending until the test settles them, so a seek can land while the first request is in flight.
const test = require('node:test');
const assert = require('node:assert/strict');
const Sources = require('../src/source.js');
const {start} = require('../src/player.js');
const {createIina} = require('./support/iina-shim.js');

const pause = () => new Promise(done => setTimeout(done, 12));
const arg = (call, flag) => call.args[call.args.indexOf(flag) + 1];

function harness() {
  const source = Sources.parse('https://www.twitch.tv/videos/2930971003');
  const files = new Map(), pending = {acquire: [], replay: []};
  const shim = createIina({label: Sources.label(source, 'unified'), mpv: {path: source.url, 'time-pos': 0, speed: 1},
    window: {frame: {width: 640, height: 360}}});
  const services = {
    readSettings: () => ({}), saveSettings() {}, dataPath: name => '/data/' + name, readFile: path => files.get(path),
    cancelHelpers() {}, deleteDataPath() {},
    resolve: async () => ({ok: true, title: 'Recording', live: false, duration: 32980, quality: '720p60', formats: [],
      mediaURL: 'https://media.example/vod.m3u8'}),
    runHelper: (name, args) => new Promise(resolve => pending[name].push({name, args, resolve}))
  };
  const player = start(shim.iina, {variant: 'unified'}, services);
  const fixture = {
    source, shim, player, pending, files,
    // Positions requested from the acquire helper, in order. Replay imports are not counted.
    requested: () => fixture.calls.filter(call => call.name === 'acquire').map(call => Number(arg(call, '--at'))),
    calls: [],
    chat: () => player.snapshot().chat
  };
  const runHelper = services.runHelper;
  services.runHelper = (name, args) => { fixture.calls.push({name, args}); return runHelper(name, args); };
  return fixture;
}

async function open(f) {
  await f.shim.mpv.runHook('on_load', () => {});
  f.shim.emit('iina.file-loaded', f.source.url);
}
const seek = (f, seconds) => { f.shim.mpv.set('time-pos', seconds); f.shim.emit('mpv.seek'); };
const failNext = f => f.pending.acquire.shift().resolve({ok: false, error: {message: 'fixture: no replay at that position'}});

function succeedNext(f) {
  const call = f.pending.acquire.shift();
  const requested = Number(arg(call, '--at'));
  call.resolve({ok: true, path: arg(call, '--output') + '/replay.jsonl',
    window: {requested, start: Math.max(0, requested - 8), end: requested + 65, hasMore: true, pages: 3, count: 1, bounded: false}});
  return requested;
}

async function importNext(f, time) {
  await pause();
  const call = f.pending.replay.shift();
  assert.ok(call, 'an archive import was expected');
  const destination = arg(call, '--output');
  f.files.set(destination + '/index.json', JSON.stringify({version: 1, provider: 'twitch', sourceId: f.source.id, count: 1,
    title: 'Twitch window', timeline: {unit: 'seconds', availableStart: time, availableEnd: time},
    chunks: [{file: 'chunk-000000.json', start: time, end: time, count: 1}]}));
  f.files.set(destination + '/chunk-000000.json', JSON.stringify([{id: 'm' + time, time, author: 'Viewer', text: 'hello',
    color: '#AABBCC', badges: [], kind: 'message'}]));
  call.resolve({ok: true, indexPath: destination + '/index.json'});
  await pause();
}

test('a seek queued during a failing first fetch is requested and its replay becomes ready', async () => {
  const f = harness();
  await open(f);
  assert.deepEqual(f.requested(), [0], 'precondition: the first request is in flight');
  seek(f, 5000);
  failNext(f);
  await pause();
  assert.deepEqual(f.requested(), [0, 5000], 'the queued position is requested; the failed one is not retried');
  assert.equal(f.chat().state, 'fetching', 'no "unavailable" flash while the newer request runs');
  succeedNext(f);
  await importNext(f, 5000);
  assert.equal(f.chat().mode, 'replay');
  assert.equal(f.chat().state, 'ready');
  assert.equal(f.player.snapshot().messages[0].text, 'hello');
  f.shim.emit('iina.window-will-close');
});

test('the queued request failing too ends unavailable without a third request', async () => {
  const f = harness();
  await open(f);
  seek(f, 5000);
  failNext(f);
  await pause();
  failNext(f);
  await pause();
  assert.deepEqual(f.requested(), [0, 5000]);
  assert.equal(f.chat().state, 'unavailable');
  assert.equal(f.chat().available, false);
  f.shim.emit('iina.window-will-close');
});

test('control: with no seek the failure ends unavailable and the failed position is not retried', async () => {
  const f = harness();
  await open(f);
  failNext(f);
  await pause();
  assert.deepEqual(f.requested(), [0]);
  assert.equal(f.chat().state, 'unavailable');
  f.shim.emit('iina.window-will-close');
});

test('control: a seek within 25 seconds of the failed position is not a newer request', async () => {
  const f = harness();
  await open(f);
  seek(f, 10);
  failNext(f);
  await pause();
  assert.deepEqual(f.requested(), [0]);
  assert.equal(f.chat().state, 'unavailable');
  f.shim.emit('iina.window-will-close');
});

test('control: Chat Off before the first request fails leaves nothing to service', async () => {
  const f = harness();
  await open(f);
  seek(f, 5000);
  f.shim.sidebar.send('chat-off');
  failNext(f);
  await pause();
  assert.deepEqual(f.requested(), [0]);
  assert.equal(f.chat().mode, 'off');
  assert.equal(f.chat().state, 'off');
  f.shim.emit('iina.window-will-close');
});

test('control: closing the window before the first request fails starts no work', async () => {
  const f = harness();
  await open(f);
  seek(f, 5000);
  f.shim.emit('iina.window-will-close');
  failNext(f);
  await pause();
  assert.deepEqual(f.requested(), [0]);
});

test('control: a source change before the first request fails starts no work', async () => {
  const f = harness();
  await open(f);
  seek(f, 5000);
  f.shim.mpv.set('path', 'file:///synthetic/other-video.mp4').set('stream-open-filename', 'file:///synthetic/other-video.mp4');
  await f.shim.mpv.runHook('on_load', () => {});
  failNext(f);
  await pause();
  assert.deepEqual(f.requested(), [0]);
  assert.notEqual(f.chat().state, 'fetching');
  f.shim.emit('iina.window-will-close');
});
