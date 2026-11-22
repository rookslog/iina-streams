'use strict';

// v0.5.5 release review r2 #5 (docs/reviews/2026-11-22-v0.5.5-release-review.md, "Reviewer output, round 2"):
// the live transport session is the fence on every overlay status and batch. A native core runs one
// controller per adopted source, and each used to count sessions from zero, so two successive live sources
// on one core both issued the same session and the second accepted the first's late batches. Sessions are
// now drawn from one counter for the life of the core's JS context.
// Scope: proves the player's fence. Whether WebKit delivers a late batch after a reload is not checked.

const test = require('node:test');
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {createRequire} = require('node:module');
const {createIina} = require('./support/iina-shim.js');

const playerPath = join(__dirname, '../src/player.js');
const requireFromPlayer = createRequire(playerPath);
const STABLE = 'local.iina.streams';
const liveA = 'https://www.twitch.tv/fixture_r2_session_a';
const liveB = 'https://www.twitch.tv/fixture_r2_session_b';
const settle = () => new Promise(resolve => setImmediate(resolve));

function nativeCore() {
  const shim = createIina({label: '', identifier: STABLE});
  shim.http.setResponse({statusCode: 200, text: '#EXTM3U'});
  const module = {exports: {}};
  shim.runScript(playerPath, {globals: {module, Date: shim.timers.Date}, require: requireFromPlayer});
  const services = {
    readSettings: () => ({chatEnabled: false, chatTiming: {mode: 'live'}, adoptNativeWindows: true}),
    saveSettings() {},
    async resolve(source) {
      return {
        ok: true, title: 'Live ' + source.id, live: true, quality: '720p60',
        formats: [{id: '720p60', label: '720p60'}], mediaURL: 'https://media.invalid/' + source.id + '.m3u8'
      };
    }
  };
  module.exports.start(shim.iina, {identifier: STABLE, variant: 'unified'}, services);

  async function playLive(url) {
    shim.mpv.set('path', url);
    shim.mpv.set('stream-open-filename', url);
    let done = false;
    shim.mpv.runHook('on_load', () => {}).then(() => { done = true; });
    for (let i = 0; i < 20 && !done; i++) {
      shim.timers.advance(0);
      await settle();
    }
    assert.ok(done, 'precondition: the load hook settled');
    shim.emit('iina.file-loaded', url);
    shim.timers.advance(0);
    shim.sidebar.send('ready', {});
  }
  // Connects live chat with a fake grant; returns the session the overlay was configured with.
  function connectChat() {
    shim.sidebar.send('connect', {});
    shim.global.send('auth-ready', JSON.stringify({login: 'fixture_reader', token: 'fake_r2_session_credential'}));
    shim.emit('iina.plugin-overlay-loaded');
    shim.overlay.send('overlay-ready', {});
    const config = shim.overlay.messages('live-config').at(-1);
    assert.ok(config, 'precondition: the live transport starts');
    return JSON.parse(decodeURIComponent(config.data.encoded)).session;
  }
  const state = () => JSON.parse(decodeURIComponent(shim.sidebar.messages('state').at(-1).data.encoded));
  const row = id => ({id, timestampMs: shim.timers.now, author: 'viewer', text: 'Synthetic chat ' + id});
  return {shim, playLive, connectChat, state, row};
}

test('r2 #5: a second live source on the core ignores the first session\'s batches, clears and status', async () => {
  const core = nativeCore();
  const {shim} = core;
  await core.playLive(liveA);
  const sessionA = core.connectChat();
  shim.overlay.send('live-messages', {session: sessionA, messages: [core.row('a-1')]});
  assert.deepEqual(core.state().messages.map(m => m.id), ['a-1'], 'precondition: session A is accepted');

  await core.playLive(liveB);
  const sessionB = core.connectChat();
  assert.notEqual(sessionB, sessionA, 'the new controller takes a new session');
  shim.overlay.send('live-state', {session: sessionB, state: 'connected'});
  shim.overlay.send('live-messages', {session: sessionB, messages: [core.row('b-1')]});
  assert.deepEqual(core.state().messages.map(m => m.id), ['b-1'], 'precondition: session B is accepted');
  assert.equal(core.state().chat.state, 'connected');
  const posts = shim.sidebar.posts.length;

  shim.overlay.send('live-messages', {session: sessionA, messages: [core.row('a-late')]});
  shim.overlay.send('live-messages', {session: sessionA, messages: [], clearedAll: true});
  shim.overlay.send('live-messages', {session: sessionA, messages: [], removed: ['b-1']});
  shim.overlay.send('live-state', {session: sessionA, state: 'error', message: 'Synthetic old failure'});
  assert.equal(shim.sidebar.posts.length, posts, 'nothing from session A reaches the sidebar');
  const after = core.state();
  assert.deepEqual(after.messages.map(m => m.id), ['b-1'], 'no late row, clear-all or removal from session A');
  assert.equal(after.chat.state, 'connected', 'no status from session A');
  shim.emit('iina.window-will-close');
});

test('r2 #5: sessions never repeat across successive controllers on one core', async () => {
  const core = nativeCore();
  const seen = [];
  for (const url of [liveA, liveB, liveA]) {
    await core.playLive(url);
    seen.push(core.connectChat());
  }
  assert.equal(new Set(seen).size, seen.length, `distinct sessions: ${JSON.stringify(seen)}`);
  assert.ok(seen[1] > seen[0] && seen[2] > seen[1], 'and increasing');
  core.shim.emit('iina.window-will-close');
});
