'use strict';

// v0.5.5 release review r2 #3 (docs/reviews/2026-11-22-v0.5.5-release-review.md, "Reviewer output, round 2"):
// IINA v1.5.1 runs the on_load hook on mpv's event queue but delivers the plugin's mpv.end-file callback on
// the main thread with no file id or reason (MPVController.swift L1112-1125 and L1241-1247, as cited by the
// review). So the replaced file's end can reach JS before or after the replacement's hook, and an end-file
// cannot say which file ended. An unattributed end-file never ends a pending Go Live replacement: only that
// generation's file-loaded or the 15 s timeout does.

const test = require('node:test');
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {createRequire} = require('node:module');
const Sources = require('../src/source.js');
const {createIina} = require('./support/iina-shim.js');

const playerPath = join(__dirname, '../src/player.js');
const requireFromPlayer = createRequire(playerPath);
const liveSource = Sources.parse('fixture_r2_golive');
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
    await shim.sidebar.send('go-live', {});
    for (let i = 0; i < 3; i++) await settle();
  }
  async function changeQuality() {
    await shim.sidebar.send('change-quality', '360p30');
    for (let i = 0; i < 3; i++) await settle();
  }
  const reloads = () => shim.mpv.commands.filter(([name]) => name === 'loadfile').map(([, args]) => args[0]);
  const state = () => JSON.parse(decodeURIComponent(shim.sidebar.messages('state').at(-1).data.encoded));
  return {shim, controller, resolves, hook, fileLoaded, goLive, changeQuality, reloads, state};
}

async function playing(t) {
  const w = liveWindow(t);
  await w.hook(liveSource.url);
  await w.fileLoaded(liveSource.url);
  assert.equal(w.controller.snapshot().phase, 'playing', 'precondition: the first file plays');
  return w;
}

for (const order of ['before', 'after']) {
  for (const second of ['Go Live', 'a quality change']) {
    test(`r2 #3: old-file end-file ${order} the hook, then ${second}: one replacement and no false stop`,
      async t => {
        const w = await playing(t);
        await w.goLive();
        assert.equal(w.reloads().length, 1, 'precondition: Go Live reloads');
        const [replacement] = w.reloads();
        if (order === 'before') w.shim.emit('mpv.end-file');
        await w.hook(replacement);
        if (order === 'after') w.shim.emit('mpv.end-file');

        assert.notEqual(w.controller.snapshot().phase, 'stopped', 'the replaced file ending is not a stop');
        assert.notEqual(w.state().phase, 'stopped', 'the sidebar does not show a stop');
        assert.equal(w.controller.snapshot().error, '', 'no reload failure is reported');

        if (second === 'Go Live') await w.goLive();
        else await w.changeQuality();
        w.shim.menu.items[1].action(); // Go Live from the menu as well.
        for (let i = 0; i < 3; i++) await settle();
        assert.equal(w.reloads().length, 1, 'no second replacement before file-loaded');
        assert.deepEqual(w.resolves, ['auto720', '720p60'], 'nothing else resolves during the transaction');

        await w.fileLoaded(replacement);
        assert.equal(w.controller.snapshot().phase, 'playing');
        assert.equal(w.controller.snapshot().error, '');
        await w.goLive();
        assert.equal(w.reloads().length, 2, 'Go Live is available again after file-loaded');
      });
  }
}

test('r2 #3: an end-file during a replacement that never loads: the timeout ends it as a stop', async t => {
  const w = await playing(t);
  await w.goLive();
  const [replacement] = w.reloads();
  w.shim.emit('mpv.end-file');
  await w.hook(replacement);
  w.shim.emit('mpv.end-file'); // Either file: it cannot be told apart.
  w.shim.timers.advance(14000);
  await settle();
  assert.notEqual(w.controller.snapshot().phase, 'stopped', 'still pending before the timeout');
  await w.goLive();
  assert.equal(w.reloads().length, 1, 'still busy before the timeout');
  w.shim.timers.advance(1000);
  await settle();
  const snapshot = w.controller.snapshot();
  assert.equal(snapshot.phase, 'stopped', 'a replacement that never loaded after an end-file is a stop');
  assert.equal(snapshot.error, 'The stream could not be reloaded.');
  await w.goLive();
  assert.equal(w.reloads().length, 2, 'Go Live is available after the timeout');
});

test('r2 #3: a real end of the loaded replacement is a stop', async t => {
  const w = await playing(t);
  await w.goLive();
  const [replacement] = w.reloads();
  w.shim.emit('mpv.end-file');
  await w.hook(replacement);
  await w.fileLoaded(replacement);
  w.shim.emit('mpv.end-file');
  assert.equal(w.controller.snapshot().phase, 'stopped');
});
