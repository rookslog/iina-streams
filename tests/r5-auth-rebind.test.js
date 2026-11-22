'use strict';

// v0.5.5 release review r5 #1 (docs/reviews/2026-11-22-v0.5.5-release-review.md, "Reviewer output, round 5"):
// a first-turn pass-through stranded a managed window's sign-in. The startup bind timer cleared itself, then
// skipped registration because the controller was retiring; when the window's own source came back before the
// deferred cleanup, authority returned but nothing bound the auth listeners, so Connect stayed at authorizing.
//
// The reviewer's sequence, replayed in the shim with every main-thread turn explicit: foreign hook -> the
// startup bind timer fires while retiring -> the own-source hook supersedes cleanup -> playback reaches
// playing. Leaving the retiring state on that reactivation re-arms the skipped bind.

const test = require('node:test');
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {createRequire} = require('node:module');
const Sources = require('../src/source.js');
const {createIina} = require('./support/iina-shim.js');

const playerPath = join(__dirname, '../src/player.js');
const requireFromPlayer = createRequire(playerPath);
const live = 'https://www.twitch.tv/fixture_r5_alpha';
const localFile = '/Users/fixture/movie.mkv';
const settle = () => new Promise(resolve => setImmediate(resolve));

async function resolve(source) {
  return {
    ok: true, title: 'Live ' + source.id, live: true, quality: '720p60',
    formats: [{id: '720p60', label: '720p60'}],
    mediaURL: 'https://video-weaver.ttvnw.net/' + source.id + '.m3u8?sig=fake-r5-rebind-signature'
  };
}

// A managed window for one Twitch channel. `bindTimer` is the startup bind turn, captured before anything
// else is scheduled, so a test can fire it alone.
function managedWindow(t) {
  const source = Sources.parse(live);
  const shim = createIina({label: Sources.label(source, 'unified'), mpv: {path: source.url, 'time-pos': 10}});
  shim.http.setResponse({statusCode: 200, text: '#EXTM3U'});
  const module = {exports: {}};
  shim.runScript(playerPath, {globals: {module, Date: shim.timers.Date}, require: requireFromPlayer});
  const services = {readSettings: () => ({chatEnabled: false}), saveSettings() {}, resolve};
  const controller = module.exports.start(shim.iina, {variant: 'unified'}, services);
  t.after(() => shim.emit('iina.window-will-close'));
  const startup = shim.timers.pending().filter(timer => timer.delay === 0);
  assert.equal(startup.length, 1, 'precondition: one startup turn, the auth bind');
  return {shim, controller, source, bindTimer: startup[0]};
}

// Read at assertion time, never copied.
const binds = shim => shim.log.filter(entry => entry.api === 'global.onMessage' && entry.args[0] === 'auth-ready').length;
const connects = shim => shim.global.messages('auth-connect').length;

async function runOwnHook(shim, source) {
  shim.mpv.set('path', source.url);
  let continued = 0;
  await shim.mpv.runHook('on_load', () => continued++);
  assert.equal(continued, 1, 'precondition: the own load continues once');
}

// file-loaded, then the post-load restore turn that confirms the load as playing.
async function reachPlaying(shim, controller, source) {
  shim.emit('iina.file-loaded', source.url);
  await settle();
  shim.emit('iina.window-size-adjusted');
  shim.timers.advance(3000);
  assert.equal(controller.snapshot().phase, 'playing', 'precondition: playback reaches playing');
  shim.sidebar.send('ready', {});
}

// The foreign hook, then the startup bind turn alone, while the cleanup turn is held. Returns the cleanup.
async function bindWhileRetiring(shim, bindTimer) {
  shim.mpv.set('path', localFile);
  const before = new Set(shim.timers.all);
  let continued = 0;
  await shim.mpv.runHook('on_load', () => continued++);
  assert.equal(continued, 1, 'precondition: the foreign file continues once');
  const cleanup = shim.timers.pending().filter(timer => !before.has(timer) && timer.delay === 0);
  assert.equal(cleanup.length, 1, 'precondition: one cleanup turn is scheduled');
  shim.timers.fire(bindTimer);
  assert.equal(binds(shim), 0, 'precondition: the bind turn ran while retiring and registered nothing');
  return cleanup[0];
}

// The auth reply works: the controller accepts it and starts the live transport in the overlay.
function expectUsableAuthReady(shim) {
  shim.global.send('auth-ready', JSON.stringify({login: 'fixture_reader', token: 'fake_r5_rebind_credential'}));
  shim.emit('iina.plugin-overlay-loaded');
  shim.overlay.send('overlay-ready', {});
  assert.ok(shim.overlay.messages('live-config').length > 0, 'auth-ready starts the live transport');
}

test('r5 #1 control: the normal startup binds once and Connect posts auth-connect', async t => {
  const {shim, controller, source} = managedWindow(t);
  shim.timers.advance(0);
  await runOwnHook(shim, source);
  await reachPlaying(shim, controller, source);
  shim.sidebar.send('connect', {});
  assert.equal(binds(shim), 1, 'one bind');
  assert.equal(connects(shim), 1, 'one auth-connect');
  expectUsableAuthReady(shim);
});

test('r5 #1: a bind skipped while retiring is re-armed when the own source supersedes cleanup', async t => {
  const {shim, controller, source, bindTimer} = managedWindow(t);
  const cleanup = await bindWhileRetiring(shim, bindTimer);

  await runOwnHook(shim, source); // Supersedes the held cleanup turn.
  shim.timers.fire(cleanup);
  await settle();
  assert.notEqual(controller.snapshot().phase, 'inactive', 'the stale cleanup leaves the window alone');
  await reachPlaying(shim, controller, source);

  shim.sidebar.send('connect', {});
  assert.equal(binds(shim), 1, 'one bind');
  assert.equal(connects(shim), 1, 'one auth-connect on Connect');
  assert.equal(controller.snapshot().chat.state, 'authorizing');
  expectUsableAuthReady(shim);
  shim.timers.advance(0);
  assert.equal(binds(shim), 1, 'still one bind');
  assert.equal(connects(shim), 1, 'still one auth-connect');
});

test('r5 #1: Connect clicked before the re-armed bind turn posts one auth-connect when it binds', async t => {
  const {shim, controller, source, bindTimer} = managedWindow(t);
  const cleanup = await bindWhileRetiring(shim, bindTimer);
  const before = new Set(shim.timers.all);
  await runOwnHook(shim, source);
  const rebind = shim.timers.pending().filter(timer => !before.has(timer) && timer.delay === 0);
  assert.equal(rebind.length, 1, 'the reactivation schedules one bind turn');

  shim.emit('iina.window-loaded');
  shim.sidebar.send('ready', {});
  shim.sidebar.send('connect', {});
  assert.equal(connects(shim), 0, 'before the bind turn: Connect waits');
  shim.timers.fire(rebind[0]);
  assert.equal(binds(shim), 1, 'one bind');
  assert.equal(connects(shim), 1, 'the waiting Connect posts once');
  shim.timers.fire(cleanup);
  await settle();
  await reachPlaying(shim, controller, source);
  assert.equal(connects(shim), 1, 'still one auth-connect');
  expectUsableAuthReady(shim);
});
