'use strict';

// v0.5.5 class L: window actions after a loss (docs/design/V055-CLASS-REPAIR-2026-11-22.md, L2-L5). The explorer's
// alphabet has no sidebar show or hide and its L5 oracle sees no missing teardown, so these two are pinned here.
//   - A sidebar hidden when the source was lost shows the inactive state when the user shows it again.
//   - D-033: the source reopened before the release turn passes through; the release stops the live transport,
//     hides the overlay and leaves the window inactive.

const test = require('node:test');
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {createRequire} = require('node:module');
const Sources = require('../src/source.js');
const {createIina} = require('./support/iina-shim.js');

const playerPath = join(__dirname, '../src/player.js');
const requireFromPlayer = createRequire(playerPath);
const live = Sources.parse('https://www.twitch.tv/fixture_class_l_window');
const localFile = '/Users/fixture/movie.mkv';
const settle = () => new Promise(resolve => setImmediate(resolve));
const decoded = post => JSON.parse(decodeURIComponent(post.data.encoded));

function managedWindow(t, settings) {
  const shim = createIina({label: Sources.label(live, 'unified'), mpv: {path: live.url, 'time-pos': 10}});
  shim.http.setResponse({statusCode: 200, text: '#EXTM3U'});
  const module = {exports: {}};
  shim.runScript(playerPath, {globals: {module, Date: shim.timers.Date}, require: requireFromPlayer});
  const services = {
    readSettings: () => settings, saveSettings() {},
    resolve: async () => ({
      ok: true, title: 'Live', live: true, quality: '720p60', formats: [{id: '720p60', label: '720p60'}],
      mediaURL: 'https://video-weaver.ttvnw.net/' + live.id + '.m3u8'
    })
  };
  const controller = module.exports.start(shim.iina, {variant: 'unified'}, services);
  t.after(() => shim.emit('iina.window-will-close'));
  async function load(path) {
    shim.mpv.set('path', path);
    let continued = 0;
    await shim.mpv.runHook('on_load', () => continued++);
    assert.equal(continued, 1, 'precondition: the load continues once');
  }
  async function playOwn() {
    await load(live.url);
    shim.emit('iina.file-loaded', live.url);
    shim.emit('iina.window-size-adjusted');
    shim.timers.advance(3000);
    await settle();
  }
  return {shim, controller, load, playOwn};
}

test('class L: a sidebar hidden at the loss shows the inactive state when shown again', async t => {
  const w = managedWindow(t, {chatEnabled: false});
  w.shim.timers.advance(0);
  await w.playOwn();
  w.shim.sidebar.send('ready', {});
  w.shim.sidebar.send('hide', {});
  await w.load(localFile);
  w.shim.timers.advance(0); // The release turn.
  await settle();
  const before = w.shim.sidebar.messages('state').length;
  w.shim.menu.items.find(item => item.title === 'Show Streams').action();
  const states = w.shim.sidebar.messages('state').slice(before);
  assert.equal(states.length, 1, 'Show Streams publishes one snapshot');
  assert.equal(decoded(states[0]).phase, 'inactive', 'and it shows that Streams is inactive');
});

// D-033 (v0.5.5): a loss is final. This replaces "a newer activation without its own transport does not keep the
// old live transport": the reopen no longer begins an activation, so the release turn tears everything down.
test('class L: reopening the source before the release turn passes through, and the window stays inactive',
  async t => {
    const w = managedWindow(t, {chatEnabled: true, view: {presentation: 'overlay'}});
    const {shim} = w;
    shim.timers.advance(0);
    await w.playOwn();
    shim.sidebar.send('ready', {});
    shim.sidebar.send('connect', {});
    shim.global.send('auth-ready', JSON.stringify({login: 'fixture_reader', token: 'fake_class_l_window_token'}));
    shim.emit('iina.plugin-overlay-loaded');
    shim.overlay.send('overlay-ready', {});
    assert.equal(shim.overlay.messages('live-config').length, 1, 'precondition: the live transport started');
    assert.equal(shim.overlay.visible, true, 'precondition: the overlay shows');

    const stops = shim.overlay.messages('live-stop').length;
    const disconnects = shim.global.messages('auth-disconnect').length;
    await w.load(localFile); // The loss; its release turn stays pending.
    const sets = shim.mpv.sets.length;
    await w.load(live.url); // The source reopens before that turn, and continues once (load asserts it).
    assert.equal(shim.mpv.sets.length, sets, 'the reopen sets nothing on mpv: it passes through');
    shim.timers.flush(0); // The release turn.
    await settle();
    assert.equal(shim.overlay.messages('live-stop').length, stops + 1, 'the transport is stopped once');
    assert.equal(shim.overlay.visible, false, 'the overlay is hidden');
    assert.equal(shim.global.messages('auth-disconnect').length, disconnects + 1, 'the sign-in use is released');
    assert.equal(w.controller.snapshot().phase, 'inactive', 'the window stays inactive');
  });
