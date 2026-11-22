'use strict';

// v0.5.5 release review r1 #9 (docs/reviews/2026-11-22-v0.5.5-release-review.md): a Go Live reload is one
// replacement transaction per generation. It stays busy until the replacement's file-loaded or a 15 s
// timeout; a second Go Live or a quality change meanwhile is ignored; and the live clock and playback phase
// follow the file that actually loaded.
//
// Review r2 #3 dropped the host-order assumption this file first made (the replaced file's end-file reaches
// JS before the replacement's hook): IINA delivers end-file without saying which file ended, so no end-file
// ends the transaction. tests/r2-golive-endfile.test.js covers both orders.

const test = require('node:test');
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {createRequire} = require('node:module');
const Sources = require('../src/source.js');
const {createIina} = require('./support/iina-shim.js');

const playerPath = join(__dirname, '../src/player.js');
const requireFromPlayer = createRequire(playerPath);
const liveSource = Sources.parse('fixture_r1_live');
// No program date-time: the clock has no Go Live target, so Go Live always reloads.
const playlist = ['#EXTM3U', '#EXTINF:2.0,', 'segment.ts'].join('\n');
const settle = () => new Promise(resolve => setImmediate(resolve));

function liveWindow(t) {
  const shim = createIina({
    label: Sources.label(liveSource, 'unified'),
    mpv: {path: liveSource.url, 'time-pos': 40, speed: 1, pause: false}
  });
  shim.timers.advance(Date.parse('2026-01-01T00:00:10Z'));
  shim.http.setResponse({statusCode: 200, text: playlist});
  shim.iina.mpv.getNative = property => shim.mpv.props.get(property) ?? null;
  shim.mpv.set('demuxer-cache-state', {'cache-end': 82});
  const module = {exports: {}};
  shim.runScript(playerPath, {globals: {module, Date: shim.timers.Date}, require: requireFromPlayer});
  const resolves = [];
  const services = {
    readSettings: () => ({chatEnabled: false}),
    saveSettings: () => {},
    async resolve(source, quality) {
      resolves.push(quality);
      const actual = quality === 'auto720' ? '720p60' : quality;
      return {
        ok: true, title: 'Live', live: true, quality: actual,
        // A distinct URL per resolve, so the polled playlist names the file that loaded.
        mediaURL: `https://media.invalid/${actual}-${resolves.length}.m3u8`,
        formats: [{id: '720p60', label: '720p60'}, {id: '360p30', label: '360p30'}]
      };
    }
  };
  const controller = module.exports.start(shim.iina, {identifier: 'local.iina.streams', variant: 'unified'}, services);
  t.after(() => shim.emit('iina.window-will-close'));
  shim.sidebar.send('ready', {});

  async function hook(path) {
    shim.mpv.set('path', path);
    let continued = 0;
    await shim.mpv.runHook('on_load', () => continued++);
    assert.equal(continued, 1, 'the load hook continues once');
  }
  async function fileLoaded(path) {
    shim.emit('iina.file-loaded', path);
    shim.emit('iina.window-size-adjusted');
    await settle();
    shim.timers.advance(600);
    await settle();
  }
  async function goLive() {
    await shim.sidebar.receive('go-live', {});
    for (let i = 0; i < 3; i++) await settle();
  }
  const reloads = () => shim.mpv.commands.filter(([name]) => name === 'loadfile').map(([, args]) => args[0]);
  const polled = () => shim.http.calls.at(-1)?.url;
  return {shim, controller, resolves, hook, fileLoaded, goLive, reloads, polled};
}

async function playing(t) {
  const w = liveWindow(t);
  await w.hook(liveSource.url);
  await w.fileLoaded(liveSource.url);
  assert.equal(w.controller.snapshot().phase, 'playing', 'precondition: the first file plays');
  return w;
}

test('r1 #9: a second Go Live and a quality change before file-loaded issue no second replacement', async t => {
  const w = await playing(t);
  await w.goLive();
  assert.equal(w.reloads().length, 1, 'Go Live reloads');
  await w.goLive();
  w.shim.menu.items[1].action();
  await settle();
  w.shim.sidebar.send('change-quality', '360p30');
  for (let i = 0; i < 3; i++) await settle();
  assert.equal(w.reloads().length, 1, 'one replacement in flight');
  assert.deepEqual(w.resolves, ['auto720', '720p60'], 'nothing else resolves during the transaction');

  const [replacement] = w.reloads();
  w.shim.emit('mpv.end-file'); // the replaced file ends
  assert.notEqual(w.controller.snapshot().phase, 'stopped', 'the replaced file ending is not a stop');
  await w.hook(replacement);
  await w.fileLoaded(replacement);
  w.shim.timers.advance(2500);
  await settle();
  assert.equal(w.polled(), 'https://media.invalid/720p60-2.m3u8', 'the clock follows the replacement');
  assert.equal(w.controller.snapshot().phase, 'playing');

  await w.goLive();
  assert.equal(w.reloads().length, 2, 'Go Live is available again after file-loaded');
});

test('r1 #9: a reload from stopped playback plays, and the clock restarts on the loaded file', async t => {
  const w = await playing(t);
  w.shim.timers.advance(2500);
  await settle();
  assert.equal(w.polled(), 'https://media.invalid/720p60-1.m3u8', 'precondition: the first playlist is polled');
  w.shim.emit('mpv.end-file');
  assert.equal(w.controller.snapshot().phase, 'stopped', 'precondition: playback stopped');

  await w.goLive();
  const [replacement] = w.reloads();
  // The stopped file already ended, so the next event is the replacement's own hook.
  await w.hook(replacement);
  await w.fileLoaded(replacement);
  assert.equal(w.controller.snapshot().phase, 'playing', 'the phase follows the file that loaded');
  w.shim.timers.advance(2500);
  await settle();
  assert.equal(w.polled(), 'https://media.invalid/720p60-2.m3u8', 'the clock restarts on the replacement');
});

// Review r2 #3: the replacement's own end-file cannot be told from the replaced file's, so a failed
// replacement ends at the timeout, not at its end-file.
test('r1 #9: a replacement that fails after its hook clears busy at the timeout, and the next Go Live reloads',
  async t => {
    const w = await playing(t);
    await w.goLive();
    const [replacement] = w.reloads();
    w.shim.emit('mpv.end-file'); // the replaced file
    await w.hook(replacement);
    w.shim.emit('mpv.end-file'); // the replacement itself
    await w.goLive();
    assert.equal(w.reloads().length, 1, 'still busy: the end-file is unattributed');
    w.shim.timers.advance(15000);
    await settle();
    assert.equal(w.controller.snapshot().phase, 'stopped', 'a failed replacement leaves playback stopped');
    await w.goLive();
    assert.equal(w.reloads().length, 2, 'busy is cleared by the timeout');
  });

test('r1 #9: a replacement that never loads clears busy after about 15 s', async t => {
  const w = await playing(t);
  await w.goLive();
  assert.equal(w.reloads().length, 1);
  w.shim.timers.advance(14000);
  await settle();
  await w.goLive();
  assert.equal(w.reloads().length, 1, 'still busy before the timeout');
  w.shim.timers.advance(1000);
  await settle();
  await w.goLive();
  assert.equal(w.reloads().length, 2, 'busy clears at the timeout');
});

test('r1 #9: an old-file end-file that arrives after the replacement\'s hook does not outlast its file-loaded',
  async t => {
    const w = await playing(t);
    await w.goLive();
    const [replacement] = w.reloads();
    await w.hook(replacement);
    w.shim.emit('mpv.end-file'); // the replaced file's end, delivered late
    await w.fileLoaded(replacement);
    const snapshot = w.controller.snapshot();
    assert.equal(snapshot.phase, 'playing', 'the file that loaded decides the phase');
    assert.equal(snapshot.error, '', 'no reload error for a file that loaded');
  });

test('r1 #9: a replacement that loads after the timeout still ends playing, with no error', async t => {
  const w = await playing(t);
  await w.goLive();
  const [replacement] = w.reloads();
  w.shim.emit('mpv.end-file');
  await w.hook(replacement);
  w.shim.timers.advance(15000);
  await settle();
  await w.fileLoaded(replacement);
  const snapshot = w.controller.snapshot();
  assert.equal(snapshot.phase, 'playing');
  assert.equal(snapshot.error, '');
  w.shim.timers.advance(2500);
  await settle();
  assert.equal(w.polled(), 'https://media.invalid/720p60-2.m3u8', 'the clock follows the late file');
});
