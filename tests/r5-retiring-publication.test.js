'use strict';

// v0.5.5 release review r5 #2 (docs/reviews/2026-11-22-v0.5.5-release-review.md, "Reviewer output, round 5"):
// between a pass-through's `next` and its deferred cleanup turn, the retiring controller still published state
// (pause and fullscreen events posted snapshots with the old source), and a quality change resolving then
// committed its pending state and armed a 25 s deadline although replaceFile refused the load. When the
// managed source came back, its file loaded but the controls stayed busy until "Quality change did not finish."
//
// Now ordinary publication is suppressed while retiring; the intentional final inactive snapshot has its own
// path. Playback fences a quality completion that lands while retiring: it abandons the change before touching
// pending state or arming the deadline.

const test = require('node:test');
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {createRequire} = require('node:module');
const Sources = require('../src/source.js');
const {createIina} = require('./support/iina-shim.js');

const playerPath = join(__dirname, '../src/player.js');
const requireFromPlayer = createRequire(playerPath);
const STABLE = 'local.iina.streams';
const liveA = 'https://www.twitch.tv/fixture_r5_alpha';
const localFile = '/Users/fixture/movie.mkv';
const QUALITY_DEADLINE_MS = 25000;
const settle = () => new Promise(resolve => setImmediate(resolve));

// Resolves at once, or, while `gate.held`, when `gate.release()` is called.
function resolver(resolves, gate) {
  return async source => {
    resolves.push(source.url);
    if (gate.held) await new Promise(resolve => { gate.release = resolve; });
    if (gate.reject) throw new Error('Synthetic resolve failure at https://video-weaver.ttvnw.net/x.m3u8');
    return {
      ok: true, title: 'Live ' + source.id, live: true, quality: '720p60',
      formats: [{id: '720p60', label: '720p60'}],
      mediaURL: 'https://video-weaver.ttvnw.net/' + source.id + '.m3u8?sig=fake-r5-publication-signature'
    };
  };
}

// Every post from the plugin (sidebar, overlay, global), read at assertion time.
const postsSince = (shim, mark) => shim.posts.slice(mark);
const sidebarStates = shim => shim.sidebar.messages('state');
const decoded = post => JSON.parse(decodeURIComponent(post.data.encoded));
const deadlines = shim => shim.timers.pending().filter(timer => timer.delay === QUALITY_DEADLINE_MS);
const loadfiles = shim => shim.mpv.commands.filter(([name]) => name === 'loadfile').length;

function deliverPauseAndFullscreen(shim) {
  shim.emit('mpv.pause.changed');
  shim.emit('iina.window-fs.changed');
}

// Positive control: while the controller holds authority, the same two events publish state to the sidebar.
function provesPublication(shim) {
  const states = sidebarStates(shim).length;
  deliverPauseAndFullscreen(shim);
  assert.equal(sidebarStates(shim).length, states + 2, 'control: pause and fullscreen each publish a state');
}

// ---------------------------------------------------------------------------------------------
// Managed pass-through (run's own onLoadHook), restored by its own source before cleanup
// ---------------------------------------------------------------------------------------------

function managedWindow(t) {
  const source = Sources.parse(liveA);
  const shim = createIina({label: Sources.label(source, 'unified'), mpv: {path: source.url, 'time-pos': 10}});
  shim.http.setResponse({statusCode: 200, text: '#EXTM3U'});
  const module = {exports: {}};
  shim.runScript(playerPath, {globals: {module, Date: shim.timers.Date}, require: requireFromPlayer});
  const resolves = [];
  const gate = {held: false};
  const services = {readSettings: () => ({chatEnabled: false}), saveSettings() {}, resolve: resolver(resolves, gate)};
  const controller = module.exports.start(shim.iina, {variant: 'unified'}, services);
  t.after(() => shim.emit('iina.window-will-close'));
  async function loadOwn() {
    shim.mpv.set('path', source.url);
    let continued = 0;
    await shim.mpv.runHook('on_load', () => continued++);
    assert.equal(continued, 1, 'precondition: the own load continues once');
    shim.emit('iina.file-loaded', source.url);
    await settle();
    shim.emit('iina.window-size-adjusted');
    shim.timers.advance(3000); // The post-load restore confirms the load as playing.
  }
  // The foreign hook, continued on the hook; returns its cleanup turn, which stays pending.
  async function loadForeign() {
    shim.mpv.set('path', localFile);
    const before = new Set(shim.timers.all);
    let continued = 0;
    await shim.mpv.runHook('on_load', () => continued++);
    assert.equal(continued, 1, 'precondition: the foreign file continues once');
    const cleanup = shim.timers.pending().filter(timer => !before.has(timer) && timer.delay === 0);
    assert.equal(cleanup.length, 1, 'precondition: one cleanup turn is scheduled');
    return cleanup[0];
  }
  return {shim, controller, resolves, gate, loadOwn, loadForeign};
}

// D-033 (v0.5.5): a loss is final. The tails of the two managed tests changed from "the restored source plays"
// to "the own source passes through; after cleanup the window is inactive, not busy, with no quality error".
test('r5 #2 managed: no publication or quality deadline while retiring; the own source returning stays inactive',
  async t => {
    const {shim, controller, resolves, gate, loadOwn, loadForeign} = managedWindow(t);
    shim.timers.advance(0); // The startup bind turn.
    await loadOwn();
    assert.equal(controller.snapshot().phase, 'playing', 'precondition: playing');
    shim.sidebar.send('ready', {});
    provesPublication(shim);

    gate.held = true;
    shim.sidebar.send('change-quality', 'auto720');
    await settle();
    assert.equal(resolves.length, 2, 'precondition: the quality change is resolving');
    assert.equal(controller.snapshot().busy, true, 'precondition: the controls are busy');
    const loads = loadfiles(shim);

    const cleanup = await loadForeign();
    const mark = shim.posts.length;
    shim.emit('mpv.end-file'); // The stream ends as the foreign file replaces it.
    deliverPauseAndFullscreen(shim);
    gate.held = false;
    gate.release(); // The quality completion lands between next and cleanup.
    await settle();
    await settle();
    assert.deepEqual(postsSince(shim, mark), [], 'no publication while retiring');
    assert.deepEqual(deadlines(shim), [], 'no quality deadline is armed');
    assert.equal(loadfiles(shim), loads, 'no loadfile replaces the passed-through file');
    // v0.5.5 class L: with no current activation the controls are not published at all (above).

    shim.emit('mpv.end-file'); // The foreign file ends as the stream replaces it.
    await loadOwn(); // The window's own source returns before the cleanup turn, and passes through.
    assert.equal(resolves.length, 2, 'the own source is not resolved again');
    shim.timers.fire(cleanup);
    await settle();
    const snapshot = controller.snapshot();
    assert.equal(snapshot.phase, 'inactive', 'the window stays inactive');
    assert.equal(snapshot.busy, false, 'the controls are not busy');
    shim.timers.advance(QUALITY_DEADLINE_MS + 1000);
    assert.doesNotMatch(controller.snapshot().error, /Quality/, 'no "Quality change did not finish"');
    assert.equal(controller.snapshot().busy, false, 'still not busy');
    const last = decoded(sidebarStates(shim).at(-1));
    assert.equal(last.phase, 'inactive', 'the sidebar shows the inactive state');
    assert.equal(last.busy, false, 'with no busy controls');
  });

test('r5 #2 managed: a quality resolve that rejects while retiring leaves no error and no busy controls',
  async t => {
    const {shim, controller, resolves, gate, loadOwn, loadForeign} = managedWindow(t);
    shim.timers.advance(0);
    await loadOwn();
    shim.sidebar.send('ready', {});
    gate.held = true;
    shim.sidebar.send('change-quality', 'auto720');
    await settle();
    assert.equal(resolves.length, 2, 'precondition: the quality change is resolving');

    const cleanup = await loadForeign();
    const mark = shim.posts.length;
    gate.held = false;
    gate.reject = true;
    gate.release();
    await settle();
    await settle();
    assert.deepEqual(postsSince(shim, mark), [], 'no publication while retiring');
    assert.equal(controller.snapshot().error, '', 'the rejection sets no error');

    gate.reject = false;
    shim.emit('mpv.end-file');
    await loadOwn(); // Passes through.
    shim.timers.fire(cleanup);
    await settle();
    assert.equal(controller.snapshot().phase, 'inactive', 'the window stays inactive');
    assert.equal(controller.snapshot().busy, false, 'with no busy controls');
    assert.doesNotMatch(controller.snapshot().error, /Quality|could not/, 'and no stale rejection error');
  });

// ---------------------------------------------------------------------------------------------
// Adopted pass-through (waitForNativeStream): no stale publication, then the final inactive snapshot
// ---------------------------------------------------------------------------------------------

function nativeCore() {
  const shim = createIina({label: '', identifier: STABLE});
  shim.http.setResponse({statusCode: 200, text: '#EXTM3U'});
  const module = {exports: {}};
  shim.runScript(playerPath, {globals: {module, Date: shim.timers.Date}, require: requireFromPlayer});
  const resolves = [];
  const gate = {held: false};
  const services = {
    readSettings: () => ({chatEnabled: false, adoptNativeWindows: true}), saveSettings() {}, resolve: resolver(resolves, gate)
  };
  assert.equal(module.exports.start(shim.iina, {identifier: STABLE, variant: 'unified'}, services), null);
  function startHook(path) {
    shim.mpv.set('path', path);
    shim.mpv.set('stream-open-filename', path);
    const state = {continued: 0, done: false};
    state.promise = shim.mpv.runHook('on_load', () => { state.continued++; }).then(() => { state.done = true; });
    return state;
  }
  async function turns(state) {
    for (let i = 0; i < 20 && !state.done; i++) {
      for (const timer of shim.timers.pending()) if (timer.delay === 0) shim.timers.fire(timer);
      await settle();
    }
  }
  return {shim, resolves, gate, startHook, turns};
}

test('r5 #2 adopted: no publication while retiring; the cleanup turn posts the final inactive snapshot',
  async () => {
    const {shim, resolves, gate, startHook, turns} = nativeCore();
    const a = startHook(liveA);
    await turns(a);
    assert.equal(a.continued, 1, 'precondition: A continues once');
    shim.emit('iina.file-loaded', liveA);
    shim.timers.advance(0);
    shim.sidebar.send('ready', {});
    shim.emit('iina.window-size-adjusted');
    shim.timers.advance(3000);
    provesPublication(shim);

    gate.held = true;
    shim.sidebar.send('change-quality', 'auto720');
    await settle();
    assert.equal(resolves.length, 2, 'precondition: the quality change is resolving');

    const before = new Set(shim.timers.all);
    const local = startHook(localFile);
    assert.equal(local.continued, 1, 'the local file continues on the hook');
    const cleanup = shim.timers.pending().filter(timer => !before.has(timer) && timer.delay === 0);
    assert.equal(cleanup.length, 1, 'precondition: one cleanup turn is scheduled');
    const mark = shim.posts.length;
    deliverPauseAndFullscreen(shim);
    gate.held = false;
    gate.release();
    await settle();
    await settle();
    assert.deepEqual(postsSince(shim, mark), [], 'no publication while retiring');
    assert.deepEqual(deadlines(shim), [], 'no quality deadline is armed');

    const states = sidebarStates(shim).length;
    shim.timers.fire(cleanup[0]);
    await settle();
    assert.equal(sidebarStates(shim).length, states + 1, 'the cleanup turn publishes one final state');
    const final = sidebarStates(shim).at(-1);
    assert.equal(decoded(final).phase, 'inactive', 'the final snapshot shows Streams inactive');
    assert.equal(decoded(final).busy, false, 'with usable controls');
  });
