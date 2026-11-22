'use strict';

// v0.5.5 release review r2 #4, player side (docs/reviews/2026-11-22-v0.5.5-release-review.md, "Reviewer
// output, round 2"). On a native core, a later load retires the controller, but its sidebar and overlay stay
// rendered and keep their message listeners until something loads them again. A retired controller's
// actions are inert: nothing it receives reaches global, mpv, settings or its views. Retiring is not
// closing: a real window close still tells global once, even while a passed-through local file plays.
// Global's own handling (audience, revoke) is out of scope here.

const test = require('node:test');
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {createRequire} = require('node:module');
const {createIina} = require('./support/iina-shim.js');

const playerPath = join(__dirname, '../src/player.js');
const requireFromPlayer = createRequire(playerPath);
const STABLE = 'local.iina.streams';
const liveA = 'https://www.twitch.tv/fixture_r2_retire';
const localFile = '/Users/fixture/movie.mkv';
const settle = () => new Promise(resolve => setImmediate(resolve));

function nativeCore() {
  const shim = createIina({label: '', identifier: STABLE});
  shim.http.setResponse({statusCode: 200, text: '#EXTM3U'});
  const module = {exports: {}};
  shim.runScript(playerPath, {globals: {module, Date: shim.timers.Date}, require: requireFromPlayer});
  const saves = [];
  const control = {failSettings: false};
  const services = {
    readSettings() {
      if (control.failSettings) throw new Error('Synthetic settings failure');
      return {chatEnabled: false, adoptNativeWindows: true};
    },
    saveSettings: value => saves.push(value),
    async resolve(source) {
      return {
        ok: true, title: 'Live ' + source.id, live: true, quality: '720p60',
        formats: [{id: '720p60', label: '720p60'}], mediaURL: 'https://media.invalid/' + source.id + '.m3u8'
      };
    }
  };
  assert.equal(module.exports.start(shim.iina, {identifier: STABLE, variant: 'unified'}, services), null);

  async function load(path) {
    shim.mpv.set('path', path);
    shim.mpv.set('stream-open-filename', path);
    const state = {continued: 0, done: false};
    shim.mpv.runHook('on_load', () => state.continued++).then(() => { state.done = true; });
    for (let i = 0; i < 20 && !state.done; i++) {
      shim.timers.advance(0);
      await settle();
    }
    assert.equal(state.continued, 1, 'the load continues once');
  }
  async function playLive(url) {
    await load(url);
    shim.emit('iina.file-loaded', url);
    shim.timers.advance(0);
    shim.sidebar.send('ready', {});
  }
  function connectChat() {
    shim.sidebar.send('connect', {});
    shim.global.send('auth-ready', JSON.stringify({login: 'fixture_reader', token: 'fake_r2_retire_credential'}));
    shim.emit('iina.plugin-overlay-loaded');
    shim.overlay.send('overlay-ready', {});
    assert.ok(shim.overlay.messages('live-config').length > 0, 'precondition: live chat started');
  }
  const count = () => ({
    global: shim.global.posts.length, sidebar: shim.sidebar.posts.length, overlay: shim.overlay.posts.length,
    mpv: shim.mpv.commands.length + shim.mpv.sets.length, saves: saves.length, opened: shim.utils.opened.length
  });
  return {shim, saves, control, load, playLive, connectChat, count};
}

test('r2 #4: live, then a local file, then a delayed Sign Out from the old sidebar sends nothing', async () => {
  const core = nativeCore();
  const {shim} = core;
  await core.playLive(liveA);
  core.connectChat();
  await core.load(localFile);
  assert.equal(shim.mpv.props.get('stream-open-filename'), localFile, 'precondition: the file passed through');
  assert.ok(shim.sidebar.listeners.has('forget-auth'), 'precondition: the old sidebar still has its listeners');
  const before = core.count();

  shim.sidebar.send('forget-auth', {});
  assert.deepEqual(shim.global.messages('auth-forget'), [], 'no auth-forget from a retired controller');
  assert.deepEqual(core.count(), before, 'Sign Out from the retired sidebar sends nothing at all');
});

test('r2 #4: every sidebar and overlay action of a retired controller is inert', async () => {
  const core = nativeCore();
  const {shim} = core;
  await core.playLive(liveA);
  core.connectChat();
  await core.load(localFile);
  const before = core.count();

  const sidebarActions = [
    ['connect', {clientID: 'fixture-client'}], ['forget-auth', {}], ['chat-off', {}], ['replay-resume', {}],
    ['open', {input: 'fixture_r2_other'}], ['open-twitch-console', {}], ['hide', {}], ['refresh', {}],
    ['change-quality', '360p30'], ['go-live', {}], ['view', {presentation: 'overlay'}], ['offset', 5],
    ['seek-chat', 30], ['first-message', {}], ['fetch-replay', {}], ['import', {}],
    ['chat-timing', {mode: 'manual', manualDelay: 4}], ['chat-calibrate', {id: 'x'}], ['authorize-open', {}],
    ['ready', {}], ['surface-visibility', {visible: true}]
  ];
  for (const [name, data] of sidebarActions) await shim.sidebar.send(name, data);
  for (const [name, data] of [['geometry', {x: 0.2, y: 0.2, width: 300, height: 200}], ['position', {x: 0, y: 0}],
    ['position-done', {}], ['overlay-ready', {}], ['live-state', {session: 1, state: 'connected'}],
    ['live-messages', {session: 1, messages: []}]]) shim.overlay.send(name, data);
  for (let i = 0; i < 3; i++) await settle();
  shim.timers.advance(0);
  assert.deepEqual(core.count(), before, 'no message, command, setting, or URL open from a retired controller');
});

test('r2 #4: closing a window that plays a passed-through file tells global once, last', async () => {
  const core = nativeCore();
  const {shim} = core;
  await core.playLive(liveA);
  core.connectChat();
  await core.load(localFile);
  assert.deepEqual(shim.global.messages('player-closed'), [], 'retiring is not closing');
  shim.sidebar.send('forget-auth', {}); // A delayed Sign Out, then the close.
  shim.emit('iina.window-will-close');
  assert.equal(shim.global.messages('player-closed').length, 1, 'the close tells global once');
  assert.equal(shim.global.posts.at(-1).name, 'player-closed', 'and after everything else');
  shim.emit('iina.window-will-close');
  assert.equal(shim.global.messages('player-closed').length, 1, 'a repeated close event is not a second close');
});

test('r2 #4: a close while a stream is current is told once, by that controller', async () => {
  const core = nativeCore();
  const {shim} = core;
  await core.playLive(liveA);
  await core.load(localFile);
  await core.playLive('https://www.twitch.tv/fixture_r2_next');
  shim.emit('iina.window-will-close');
  assert.equal(shim.global.messages('player-closed').length, 1);
});

test('r2 #4: a reused core tells global of each close once, and nothing for a never-adopted window', async () => {
  const core = nativeCore();
  const {shim} = core;
  await core.load(localFile);
  shim.emit('iina.window-will-close');
  assert.equal(shim.global.messages('player-closed').length, 0, 'no stream was ever adopted');
  assert.deepEqual(shim.event.names(), [], 'a window with no adopted stream has no listeners');

  await core.playLive(liveA);
  await core.load(localFile);
  shim.emit('iina.window-will-close');
  assert.equal(shim.global.messages('player-closed').length, 1);

  await core.load(localFile); // The reused core opens a local file: no stream since the close.
  shim.emit('iina.window-will-close');
  assert.equal(shim.global.messages('player-closed').length, 1, 'no adoption since the last close');
  assert.deepEqual(shim.event.names(), [], 'nothing stays registered after the close');
});

test('r2 #4: a stream whose controller fails to start still leaves the close to the core', async () => {
  const core = nativeCore();
  const {shim} = core;
  await core.playLive(liveA);
  await core.load(localFile);
  core.control.failSettings = true; // The next controller throws while it starts.
  await core.load('https://www.twitch.tv/fixture_r2_broken');
  shim.emit('iina.window-will-close');
  assert.equal(shim.global.messages('player-closed').length, 1);
});
