'use strict';

// #35 / #50: an adopted on_load hook (a Twitch or YouTube URL opened in an IINA window Streams did not
// create) must hold the load only while Streams resolves it, must not call main-thread APIs on mpv's
// event-queue stack, and must always continue within a bounded time.
//
// Host behaviour comes from the shim's runHook, which follows IINA v1.5.1 MPVHookValue.call: a plain
// function is continued by IINA as soon as it returns; only an async function holds the load. The shim
// also collects main-thread calls made on the hook's synchronous stack (see MAIN_THREAD_APIS there).

const test = require('node:test');
const assert = require('node:assert/strict');
const {start} = require('../src/player.js');
const {createIina} = require('./support/iina-shim.js');

const vodURL = 'https://www.twitch.tv/videos/2930971003';
const mediaURL = 'https://media.example.invalid/vod.m3u8';
const TRACE_FILE = '@data/qa-events-adopted.json';

// A resolve the test settles by hand, so a hook can be observed while it waits.
function deferredResolve() {
  const calls = [];
  const resolve = source => new Promise((settle, fail) => calls.push({source, settle, fail}));
  return {calls, resolve};
}

function adoptedWindow({qa = false, resolve} = {}) {
  // windowLoaded defaults to true in the shim: the window is already loaded when adoption starts.
  const shim = createIina({label: '', mpv: {path: vodURL, 'stream-open-filename': vodURL}});
  assert.equal(shim.iina.core.window.loaded, true, 'precondition: the window is loaded before adoption');
  // v0.5.5 descope: adoption runs only when opted in (or in QA).
  const services = {readSettings: () => ({chatEnabled: false, adoptNativeWindows: true}), resolve};
  assert.equal(start(shim.iina, {identifier: 'local.iina.streams', variant: 'unified', qa}, services), null);
  return shim;
}

const resolved = () => ({ok: true, title: 'VOD', live: false, quality: '720p', formats: [], mediaURL});

// Let pending main-thread turns (setTimeout 0) and their promise chains run.
async function settle(rounds = 4) {
  for (let i = 0; i < rounds; i++) await new Promise(resolve => setImmediate(resolve));
}

function tracePhases(shim) {
  const writes = shim.file.writes.filter(w => w.file === TRACE_FILE);
  if (!writes.length) return [];
  return JSON.parse(writes.at(-1).content);
}

test('adopted hook in a loaded window: no main-thread call on the hook stack, and it holds the load for resolve',
  async () => {
    const pending = deferredResolve();
    const shim = adoptedWindow({resolve: pending.resolve});
    let continued = 0;
    const hook = shim.mpv.runHook('on_load', () => continued++);
    // Still on mpv's event-queue stack: sidebar.loadFile here is DispatchQueue.main.sync in IINA.
    assert.deepEqual(shim.mpv.offMainCalls, [], 'the hook stack must not call main-thread APIs');
    assert.equal(continued, 0, 'the load must be held while Streams adopts it');
    await settle();
    assert.equal(pending.calls.length, 1, 'adoption resolves the VOD through the normal pipeline');
    assert.equal(pending.calls[0].source.kind, 'twitch-vod');
    assert.equal(continued, 0, 'the load stays held until resolve settles');
    assert.equal(shim.sidebar.loads.length, 1, 'the sidebar is shown, off the hook stack');
    pending.calls[0].settle(resolved());
    await hook;
    assert.equal(continued, 1, 'the load continues exactly once');
    assert.equal(shim.mpv.props.get('stream-open-filename'), mediaURL);
    shim.emit('iina.window-will-close');
  });

test('watchdog: an adopted hook whose resolve never settles continues at 10 s and passes the file through',
  async t => {
    t.mock.timers.enable({apis: ['setTimeout']});
    const pending = deferredResolve();
    const shim = adoptedWindow({qa: true, resolve: pending.resolve});
    let continued = 0;
    shim.mpv.runHook('on_load', () => continued++);
    t.mock.timers.tick(0);
    await settle();
    assert.equal(pending.calls.length, 1);
    t.mock.timers.tick(9999);
    await settle();
    assert.equal(continued, 0, 'held until the 10 s watchdog');
    t.mock.timers.tick(1);
    await settle();
    assert.equal(continued, 1, 'the watchdog continues the load');
    assert.equal(shim.mpv.props.get('stream-open-filename'), vodURL, 'IINA\'s own loader gets the URL');
    const phases = tracePhases(shim).map(e => e.phase);
    assert.ok(phases.includes('watchdog-fired'), phases.join(','));
    assert.deepEqual(tracePhases(shim).find(e => e.phase === 'next-called').by, 'watchdog');
    // A resolve that settles after the watchdog must not touch mpv or continue again.
    pending.calls[0].settle(resolved());
    await settle();
    assert.equal(continued, 1);
    assert.equal(shim.mpv.props.get('stream-open-filename'), vodURL);
    assert.equal(shim.utils.opened.length, 0);
  });

test('watchdog also covers a later load in an adopted window', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const pending = deferredResolve();
  const shim = adoptedWindow({resolve: pending.resolve});
  let continued = 0;
  shim.mpv.runHook('on_load', () => continued++);
  t.mock.timers.tick(0);
  await settle();
  pending.calls[0].settle(resolved());
  await settle();
  assert.equal(continued, 1);
  // The same URL opened again resolves again; that resolve never settles. Every later load yields a
  // main-thread turn before controller work (review r1 #8).
  shim.mpv.runHook('on_load', () => continued++);
  t.mock.timers.tick(0);
  await settle();
  assert.equal(pending.calls.length, 2);
  assert.equal(continued, 1);
  t.mock.timers.tick(10000);
  await settle();
  assert.equal(continued, 2, 'the second load is continued by the watchdog');
});

test('QA trace: adopted phases are written in order, without media URLs', async () => {
  const shim = adoptedWindow({qa: true, resolve: async () => resolved()});
  await shim.mpv.runHook('on_load', () => {});
  const events = tracePhases(shim);
  assert.deepEqual(events.map(e => e.phase), ['hook-entered', 'source', 'resolve-start', 'resolve-done', 'next-called']);
  for (const e of events) assert.equal(typeof e.time, 'string', 'same shape as qaTrace events: {phase, time, ...}');
  assert.equal(events[1].kind, 'twitch-vod');
  assert.equal(events.at(-1).by, 'hook');
  const text = JSON.stringify(events);
  assert.equal(text.includes('media.example.invalid'), false);
  shim.emit('iina.window-will-close');
});

test('QA trace: a failed resolve is traced as an error and still continues once', async () => {
  const shim = adoptedWindow({qa: true, resolve: async () => ({ok: false, error: {message: 'gone'}})});
  let continued = 0;
  await shim.mpv.runHook('on_load', () => continued++);
  assert.equal(continued, 1);
  const phases = tracePhases(shim).map(e => e.phase);
  assert.deepEqual(phases, ['hook-entered', 'source', 'resolve-start', 'error', 'next-called']);
  shim.emit('iina.window-will-close');
});

test('QA trace: nothing is written for adopted windows when config.qa is off', async () => {
  const shim = adoptedWindow({qa: false, resolve: async () => resolved()});
  await shim.mpv.runHook('on_load', () => {});
  assert.equal(shim.file.writes.filter(w => w.file === TRACE_FILE).length, 0);
  shim.emit('iina.window-will-close');
});

test('QA trace: a file that is not adopted is traced as passed through', async () => {
  const shim = createIina({label: '', mpv: {path: '/Users/x/movie.mkv'}});
  start(shim.iina, {variant: 'unified', qa: true}, {resolve: async () => assert.fail('no resolve')});
  let continued = 0;
  await shim.mpv.runHook('on_load', () => continued++);
  assert.equal(continued, 1);
  const events = tracePhases(shim);
  assert.deepEqual(events.map(e => e.phase), ['hook-entered', 'source', 'next-called']);
  assert.equal(events[1].kind, null);
  assert.equal(events[2].by, 'pass-through');
});

test('a throw while reading the loading path passes the file through instead of holding it', async () => {
  const shim = createIina({label: '', mpv: {path: vodURL}});
  start(shim.iina, {variant: 'unified', qa: true}, {resolve: async () => assert.fail('no resolve')});
  shim.iina.mpv.getString = () => { throw new Error('mpv unavailable'); };
  let continued = 0;
  await shim.mpv.runHook('on_load', () => continued++);
  assert.equal(continued, 1);
  assert.deepEqual(tracePhases(shim).map(e => e.phase), ['hook-entered', 'error', 'next-called']);
});

test('a file that is not adopted arms no timer', async t => {
  const shim = createIina({label: '', mpv: {path: '/Users/x/movie.mkv'}});
  // v0.5.5 descope: adoption runs only when opted in.
  start(shim.iina, {identifier: 'local.iina.streams', variant: 'unified'},
    {readSettings: () => ({adoptNativeWindows: true}), resolve: async () => assert.fail('no resolve')});
  const realSetTimeout = globalThis.setTimeout;
  let armed = 0;
  globalThis.setTimeout = (...args) => {
    armed++;
    return realSetTimeout(...args);
  };
  t.after(() => { globalThis.setTimeout = realSetTimeout; });
  let continued = 0;
  await shim.mpv.runHook('on_load', () => continued++);
  globalThis.setTimeout = realSetTimeout;
  assert.equal(continued, 1);
  assert.equal(armed, 0);
});
