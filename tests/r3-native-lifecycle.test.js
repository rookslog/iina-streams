'use strict';

// v0.5.5 release review r3 #3 (player side), #4 and #5 (adopted path)
// (docs/reviews/2026-11-22-v0.5.5-release-review.md, "Reviewer output, round 3").
//
// #4: a window close advances the core's load epoch, so a load still waiting for its main-thread turn
//     continues once and builds no controller, resolver or listener. The core is reused normally afterwards.
// #5: a file that passes through continues the hook at once, on the hook. Only the old controller's
//     retirement waits for a main-thread turn, fenced by the load epoch, so a later load is never cleaned up.
//     IINA invalidates plugin timers on unload (JavascriptPluginInstance.swift L72-78, v1.5.1, as cited by
//     the review), so a continuation that waits for a timer may never come.
// #3: retirement tells global with auth-disconnect {retire: true}, connected or not.
//
// The player runs in a vm context on the shim's fake timers, so every main-thread turn is explicit.

const test = require('node:test');
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {createRequire} = require('node:module');
const {createIina} = require('./support/iina-shim.js');

const playerPath = join(__dirname, '../src/player.js');
const requireFromPlayer = createRequire(playerPath);
const STABLE = 'local.iina.streams';
const liveA = 'https://www.twitch.tv/fixture_r3_alpha';
const liveB = 'https://www.twitch.tv/fixture_r3_bravo';
const liveC = 'https://www.twitch.tv/fixture_r3_charlie';
const localFile = '/Users/fixture/movie.mkv';
const settle = () => new Promise(resolve => setImmediate(resolve));

function nativeCore() {
  const shim = createIina({label: '', identifier: STABLE});
  shim.http.setResponse({statusCode: 200, text: '#EXTM3U'});
  const module = {exports: {}};
  shim.runScript(playerPath, {globals: {module, Date: shim.timers.Date}, require: requireFromPlayer});
  const resolves = [];
  const services = {
    readSettings: () => ({chatEnabled: false}),
    saveSettings() {},
    async resolve(source) {
      resolves.push(source.url);
      return {
        ok: true, title: 'Live ' + source.id, live: true, quality: '720p60',
        formats: [{id: '720p60', label: '720p60'}],
        mediaURL: 'https://video-weaver.ttvnw.net/' + source.id + '.m3u8'
      };
    }
  };
  assert.equal(module.exports.start(shim.iina, {identifier: STABLE, variant: 'unified'}, services), null);

  // Starts IINA's on_load hook for `path` and returns its continuation count, without giving any turn.
  function startHook(path) {
    shim.mpv.set('path', path);
    shim.mpv.set('stream-open-filename', path);
    const state = {continued: 0, done: false};
    state.promise = shim.mpv.runHook('on_load', () => state.continued++).then(() => { state.done = true; });
    return state;
  }
  async function turns(state, count = 20) {
    for (let i = 0; i < count && !(state && state.done); i++) {
      shim.timers.advance(0);
      await settle();
    }
  }
  async function load(path) {
    const state = startHook(path);
    await turns(state);
    assert.equal(state.continued, 1, 'the load continues once');
    return state;
  }
  async function playLive(url) {
    await load(url);
    shim.emit('iina.file-loaded', url);
    shim.timers.advance(0);
    shim.sidebar.send('ready', {});
  }
  function connectChat() {
    shim.sidebar.send('connect', {});
    shim.global.send('auth-ready', JSON.stringify({login: 'fixture_reader', token: 'fake_r3_native_credential'}));
    shim.emit('iina.plugin-overlay-loaded');
    shim.overlay.send('overlay-ready', {});
    assert.ok(shim.overlay.messages('live-config').length > 0, 'precondition: live chat started');
  }
  const listenerCount = () => [...shim.event.listeners.values()].reduce((sum, map) => sum + map.size, 0);
  return {shim, resolves, startHook, turns, load, playLive, connectChat, listenerCount};
}

// ---------------------------------------------------------------------------------------------
// #4: close vs a load waiting for its turn
// ---------------------------------------------------------------------------------------------

test('r3 #4: a close after A was retired invalidates B waiting for its turn; the core reopens normally',
  async () => {
    const core = nativeCore();
    const {shim} = core;
    await core.playLive(liveA);
    await core.load(localFile);
    assert.equal(core.listenerCount(), 1, 'precondition: only the core close watcher remains');

    const b = core.startHook(liveB);
    await settle(); // Microtasks only: B waits for its main-thread turn.
    assert.equal(b.continued, 0, 'precondition: B is held for its turn');
    shim.emit('iina.window-will-close');
    assert.equal(shim.global.messages('player-closed').length, 1, 'the close is told once');
    await core.turns(b);
    assert.equal(b.continued, 1, 'B continues once');
    assert.deepEqual(core.resolves, [liveA], 'B is never resolved');
    assert.equal(core.listenerCount(), 0, 'B registers no listener');
    assert.equal(shim.timers.pending().length, 0, 'and leaves no timer, watchdog included');

    await core.playLive(liveC); // IINA reuses the core for the next window.
    assert.deepEqual(core.resolves, [liveA, liveC], 'the reused core adopts the next stream');
    assert.ok(shim.event.listeners.get('iina.window-will-close')?.size >= 1, 'with its own close listener');
    shim.emit('iina.window-will-close');
    assert.equal(shim.global.messages('player-closed').length, 2, 'and its close is told once');
  });

test('r3 #4: a close while A is current invalidates B waiting for its turn', async () => {
  const core = nativeCore();
  const {shim} = core;
  await core.playLive(liveA);
  const b = core.startHook(liveB);
  await settle();
  assert.equal(b.continued, 0, 'precondition: B is held for its turn');
  shim.emit('iina.window-will-close');
  await core.turns(b);
  assert.equal(b.continued, 1, 'B continues once');
  assert.deepEqual(core.resolves, [liveA], 'B is never resolved');
  assert.equal(core.listenerCount(), 0, 'B registers no listener');
  assert.equal(shim.global.messages('player-closed').length, 1);

  await core.playLive(liveC);
  assert.deepEqual(core.resolves, [liveA, liveC], 'the reused core adopts the next stream');
});

// ---------------------------------------------------------------------------------------------
// #5: an adopted window's pass-through continues at once
// ---------------------------------------------------------------------------------------------

test('r3 #5: a file passing through an adopted window continues on the hook, with no event.off there',
  async () => {
    const core = nativeCore();
    const {shim} = core;
    await core.playLive(liveA);
    const offsBefore = shim.event.offs.length;
    const timersBefore = new Set(shim.timers.all);
    const local = core.startHook(localFile);
    assert.equal(local.continued, 1, 'continued synchronously, on the hook');
    await settle();
    assert.equal(shim.event.offs.length, offsBefore, 'no event.off on the hook stack');
    assert.deepEqual(shim.mpv.offMainCalls, [], 'no main-thread UI call on the hook stack');

    // The cleanup turn never runs, as when IINA unloads the plugin's timers.
    const cleanup = shim.timers.pending().filter(timer => !timersBefore.has(timer) && timer.delay === 0);
    assert.equal(cleanup.length, 1, 'precondition: one cleanup turn is scheduled');
    for (const timer of cleanup) shim.timers.clearTimeout(timer.id);
    shim.timers.advance(60_000);
    await settle();
    assert.equal(local.continued, 1, 'still exactly one continuation');
  });

test('r3 #5: a late cleanup turn of a passed-through file does not retire the stream adopted after it',
  async () => {
    const core = nativeCore();
    const {shim} = core;
    await core.playLive(liveA);
    const timersBefore = new Set(shim.timers.all);
    const local = core.startHook(localFile);
    assert.equal(local.continued, 1);
    const cleanup = shim.timers.pending().filter(timer => !timersBefore.has(timer) && timer.delay === 0);
    assert.equal(cleanup.length, 1, 'precondition: one cleanup turn is scheduled');

    // B's hook and turn run before the delayed cleanup turn.
    const b = core.startHook(liveB);
    for (let i = 0; i < 20 && !b.done; i++) {
      for (const timer of shim.timers.pending()) if (timer !== cleanup[0] && timer.delay === 0) shim.timers.fire(timer);
      await settle();
    }
    assert.equal(b.continued, 1, 'precondition: B continued');
    assert.deepEqual(core.resolves, [liveA, liveB], 'precondition: B was adopted');
    shim.emit('iina.file-loaded', liveB);
    const menuBefore = shim.menu.items.length;
    const disconnectsBefore = shim.global.messages('auth-disconnect').length;
    assert.ok(menuBefore > 0, 'precondition: B has its menu items');

    shim.timers.fire(cleanup[0]);
    await settle();
    assert.equal(shim.menu.items.length, menuBefore, 'B keeps its menu items');
    assert.equal(shim.global.messages('auth-disconnect').length, disconnectsBefore, 'B is not retired');
    shim.emit('iina.window-will-close');
    assert.equal(shim.global.messages('player-closed').length, 1, 'B is still the open controller');
  });

// ---------------------------------------------------------------------------------------------
// #3: retirement tells global
// ---------------------------------------------------------------------------------------------

function disconnectsAfter(shim, index) {
  return shim.global.posts.slice(index).filter(post => post.name === 'auth-disconnect');
}

test('r3 #3: retiring a controller that never connected chat posts one auth-disconnect with retire:true',
  async () => {
    const core = nativeCore();
    const {shim} = core;
    await core.playLive(liveA);
    const mark = shim.global.posts.length;
    await core.load(localFile);
    assert.deepEqual(disconnectsAfter(shim, mark).map(post => post.data), [{retire: true}]);
  });

test('r3 #3: retiring a connected controller posts one auth-disconnect with retire:true', async () => {
  const core = nativeCore();
  const {shim} = core;
  await core.playLive(liveA);
  core.connectChat();
  const mark = shim.global.posts.length;
  await core.playLive(liveB); // A new stream retires A as well.
  assert.deepEqual(disconnectsAfter(shim, mark).map(post => post.data), [{retire: true}]);
});

test('r3 #3: a window close is not a retirement', async () => {
  const core = nativeCore();
  const {shim} = core;
  await core.playLive(liveA);
  const mark = shim.global.posts.length;
  shim.emit('iina.window-will-close');
  const disconnects = disconnectsAfter(shim, mark);
  assert.equal(disconnects.length, 1);
  assert.notEqual(disconnects[0].data.retire, true);
});
