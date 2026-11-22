'use strict';

// v0.5.5 release review r4 #3 (docs/reviews/2026-11-22-v0.5.5-release-review.md, "Reviewer output, round 4"):
// between `next` and the deferred cleanup turn, the old controller could still poll the playlist, render an
// overlay chat batch and post Sign Out. Both pass-through paths now mark the old controller as retiring, in
// pure JS, before the hook continues. From then on its action guards, clock completions, overlay batches and
// pending completions do nothing. Physical teardown stays on the deferred turn.
//
// Each test first proves the same three deliveries act while the controller holds authority (positive
// controls), then delivers them between `next` and the cleanup turn, then lets a newer load supersede the
// cleanup. The player runs in a vm context on the shim's fake timers, so every main-thread turn is explicit.

const test = require('node:test');
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {createRequire} = require('node:module');
const Sources = require('../src/source.js');
const {createIina} = require('./support/iina-shim.js');

const playerPath = join(__dirname, '../src/player.js');
const requireFromPlayer = createRequire(playerPath);
const STABLE = 'local.iina.streams';
const liveA = 'https://www.twitch.tv/fixture_r4_alpha';
const liveB = 'https://www.twitch.tv/fixture_r4_bravo';
const localFile = '/Users/fixture/movie.mkv';
const settle = () => new Promise(resolve => setImmediate(resolve));

// Resolves at once, or, while `gate.held`, when `gate.release()` is called.
function resolver(resolves, gate = {held: false}) {
  return async source => {
    resolves.push(source.url);
    if (gate.held) await new Promise(resolve => { gate.release = resolve; });
    return {
      ok: true, title: 'Live ' + source.id, live: true, quality: '720p60',
      formats: [{id: '720p60', label: '720p60'}],
      mediaURL: 'https://video-weaver.ttvnw.net/' + source.id + '.m3u8?sig=fake-r4-retiring-signature'
    };
  };
}

// A notice-free chat row with no send time: it shows at once in any timing mode.
const row = id => ({id, author: 'viewer', text: 'Synthetic chat ' + id});

// What the authority checks observe. Read at assertion time, never copied.
function observer(shim) {
  return {
    requests: () => shim.http.calls.length,
    forgets: () => shim.global.messages('auth-forget').length,
    postsSince: mark => JSON.stringify(shim.posts.slice(mark)),
    mark: () => shim.posts.length,
  };
}

function connectChat(shim) {
  shim.timers.advance(0); // The controller binds its auth listeners on a later turn.
  shim.sidebar.send('connect', {});
  shim.global.send('auth-ready', JSON.stringify({login: 'fixture_reader', token: 'fake_r4_retiring_credential'}));
  shim.emit('iina.plugin-overlay-loaded');
  shim.overlay.send('overlay-ready', {});
  const config = shim.overlay.messages('live-config').at(-1);
  assert.ok(config, 'precondition: the live transport starts with a fake grant');
  const {session} = JSON.parse(decodeURIComponent(config.data.encoded));
  return messages => shim.overlay.send('live-messages', {session, messages});
}

// Positive controls: while the controller holds authority, a clock timer requests the playlist, Sign Out
// posts auth-forget, and (with chat connected again, since Sign Out turns it off) a batch row is posted.
// Returns the delivery function for the connected chat.
function provesAuthority(shim, seen) {
  const requests = seen.requests();
  shim.timers.advance(2000);
  assert.ok(seen.requests() > requests, 'control: the clock polls the playlist');
  connectChat(shim);
  const forgets = seen.forgets();
  shim.sidebar.send('forget-auth', {});
  assert.equal(seen.forgets(), forgets + 1, 'control: Sign Out posts auth-forget');
  const deliver = connectChat(shim);
  const mark = seen.mark();
  deliver([row('r4-control-row')]);
  assert.ok(seen.postsSince(mark).includes('r4-control-row'), 'control: a batch row is posted');
  return deliver;
}

// The `next` callback: an overlay batch, then a Sign Out, delivered while the hook continues.
function insideNext(shim, deliver, seen) {
  const result = {mark: seen.mark(), forgets: seen.forgets()};
  result.deliverAll = () => {
    deliver([row('r4-next-row')]);
    shim.sidebar.send('forget-auth', {});
  };
  result.check = () => {
    assert.ok(!seen.postsSince(result.mark).includes('r4-next-row'), 'a batch inside next shows no row');
    assert.equal(seen.forgets(), result.forgets, 'a Sign Out inside next posts nothing');
  };
  return result;
}

// Delivers an old clock poll, an overlay batch and a sidebar Sign Out, in that order, and expects no side
// effect from any.
function expectNoAuthority(shim, deliver, seen, skip) {
  const requests = seen.requests();
  const forgets = seen.forgets();
  const mark = seen.mark();
  for (const timer of shim.timers.pending()) if (!skip.has(timer)) shim.timers.fire(timer); // Clock and status.
  assert.equal(seen.requests(), requests, 'no playlist request');
  deliver([row('r4-stale-row')]);
  assert.ok(!seen.postsSince(mark).includes('r4-stale-row'), 'no row shown');
  shim.sidebar.send('forget-auth', {});
  assert.equal(seen.forgets(), forgets, 'no auth-forget post');
}

// ---------------------------------------------------------------------------------------------
// Adopted pass-through (waitForNativeStream)
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
  function startHook(path, onNext = () => {}) {
    shim.mpv.set('path', path);
    shim.mpv.set('stream-open-filename', path);
    const state = {continued: 0, done: false};
    state.promise = shim.mpv.runHook('on_load', () => {
      state.continued++;
      onNext();
    }).then(() => { state.done = true; });
    return state;
  }
  // Main-thread turns, except for the timers in `hold`.
  async function turns(state, hold = new Set()) {
    for (let i = 0; i < 20 && !state.done; i++) {
      for (const timer of shim.timers.pending()) if (!hold.has(timer) && timer.delay === 0) shim.timers.fire(timer);
      await settle();
    }
  }
  async function playLive(url) {
    const state = startHook(url);
    await turns(state);
    assert.equal(state.continued, 1, 'precondition: the load continues once');
    shim.emit('iina.file-loaded', url);
    shim.timers.advance(0);
    shim.sidebar.send('ready', {});
  }
  return {shim, resolves, gate, startHook, turns, playLive};
}

test('r4 #3 adopted: between next and cleanup the old controller has no authority; a newer load supersedes',
  async () => {
    const core = nativeCore();
    const {shim} = core;
    const seen = observer(shim);
    await core.playLive(liveA);
    const deliver = provesAuthority(shim, seen);

    // A batch and a Sign Out delivered inside `next` itself: the flag is set before the hook continues.
    const next = insideNext(shim, deliver, seen);
    const timersBefore = new Set(shim.timers.all);
    const local = core.startHook(localFile, next.deliverAll);
    assert.equal(local.continued, 1, 'continued synchronously, on the hook');
    next.check();
    assert.deepEqual(shim.mpv.offMainCalls, [], 'no main-thread UI call on the hook stack');
    const cleanup = shim.timers.pending().filter(timer => !timersBefore.has(timer) && timer.delay === 0);
    assert.equal(cleanup.length, 1, 'precondition: one cleanup turn is scheduled');
    await settle();

    expectNoAuthority(shim, deliver, seen, new Set(cleanup));
    assert.equal(local.continued, 1, 'one continuation');

    // B's hook and turns run before the delayed cleanup turn; B retires A itself.
    const disconnects = shim.global.messages('auth-disconnect').length;
    const b = core.startHook(liveB);
    await core.turns(b, new Set(cleanup));
    assert.equal(b.continued, 1, 'B continued once');
    assert.deepEqual(core.resolves, [liveA, liveB], 'B is adopted, not owned by the retiring A');
    assert.deepEqual(shim.global.messages('auth-disconnect').slice(disconnects).map(post => post.data),
      [{retire: true}], 'A is retired once, by B');
    shim.emit('iina.file-loaded', liveB);
    const menuItems = shim.menu.items.length;
    shim.timers.fire(cleanup[0]);
    await settle();
    assert.equal(shim.menu.items.length, menuItems, 'the stale cleanup leaves B alone');
    assert.equal(local.continued, 1, 'the passed-through file still continued once');
    shim.emit('iina.window-will-close');
    assert.equal(shim.global.messages('player-closed').length, 1, 'B is the open controller');
  });

test('r4 #3 adopted: a first-load resolve that lands while retiring does not set the next file', async () => {
  const core = nativeCore();
  const {shim} = core;
  core.gate.held = true;
  const a = core.startHook(liveA);
  await core.turns(a);
  assert.deepEqual(core.resolves, [liveA], 'precondition: A is resolving');
  assert.equal(a.continued, 0, 'precondition: A is held');
  const local = core.startHook(localFile);
  assert.equal(local.continued, 1, 'the local file continues on the hook');
  core.gate.release();
  await settle();
  await settle();
  assert.equal(a.continued, 1, 'A continues once');
  assert.equal(shim.mpv.props.get('stream-open-filename'), localFile, 'A\'s media URL never reaches mpv');
});

test('r4 #3 adopted: a quality change that resolves while retiring issues no loadfile', async () => {
  const core = nativeCore();
  const {shim} = core;
  await core.playLive(liveA);
  shim.emit('iina.window-size-adjusted');
  shim.timers.advance(3000); // The post-load playback-state restore confirms the load.
  core.gate.held = true;
  shim.sidebar.send('change-quality', 'auto720');
  await settle();
  assert.equal(core.resolves.length, 2, 'precondition: the quality change is resolving');
  const local = core.startHook(localFile);
  assert.equal(local.continued, 1);
  core.gate.release(); // Before the cleanup turn.
  await settle();
  await settle();
  assert.ok(!shim.mpv.commands.some(([name]) => name === 'loadfile'), 'no loadfile replaces the passed-through file');
});

// ---------------------------------------------------------------------------------------------
// Managed pass-through (run's own onLoadHook)
// ---------------------------------------------------------------------------------------------

function managedWindow(t) {
  const source = Sources.parse(liveA);
  const shim = createIina({label: Sources.label(source, 'unified'), mpv: {path: source.url, 'time-pos': 10}});
  shim.http.setResponse({statusCode: 200, text: '#EXTM3U'});
  const module = {exports: {}};
  shim.runScript(playerPath, {globals: {module, Date: shim.timers.Date}, require: requireFromPlayer});
  const resolves = [];
  const services = {readSettings: () => ({chatEnabled: false}), saveSettings() {}, resolve: resolver(resolves)};
  const controller = module.exports.start(shim.iina, {variant: 'unified'}, services);
  t.after(() => shim.emit('iina.window-will-close'));
  async function loadOwn() {
    shim.mpv.set('path', source.url);
    let continued = 0;
    await shim.mpv.runHook('on_load', () => continued++);
    assert.equal(continued, 1, 'precondition: the own load continues once');
    shim.emit('iina.file-loaded', source.url);
    await settle();
  }
  async function loadForeign() {
    shim.mpv.set('path', localFile);
    let continued = 0;
    await shim.mpv.runHook('on_load', () => continued++);
    assert.equal(continued, 1, 'precondition: the foreign load continues once');
  }
  return {shim, controller, resolves, loadOwn, loadForeign};
}

// D-033 (v0.5.5): a loss is final. The tail of this test changed from "its own source restores it" to "its own
// source passes through and the window stays inactive".
test('r4 #3 managed: between next and cleanup the old controller has no authority; its own source does not restore it',
  async t => {
    const {shim, controller, resolves, loadOwn} = managedWindow(t);
    const seen = observer(shim);
    await loadOwn();
    shim.sidebar.send('ready', {});
    const deliver = provesAuthority(shim, seen);

    const next = insideNext(shim, deliver, seen);
    shim.mpv.set('path', localFile);
    const timersBefore = new Set(shim.timers.all);
    let continued = 0;
    const promise = shim.mpv.runHook('on_load', () => {
      continued++;
      next.deliverAll();
    });
    assert.equal(continued, 1, 'continued synchronously, on the hook');
    next.check();
    assert.deepEqual(shim.mpv.offMainCalls, [], 'no main-thread UI call on the hook stack');
    const cleanup = shim.timers.pending().filter(timer => !timersBefore.has(timer) && timer.delay === 0);
    assert.equal(cleanup.length, 1, 'precondition: one cleanup turn is scheduled');
    await promise;

    expectNoAuthority(shim, deliver, seen, new Set(cleanup));
    assert.equal(continued, 1, 'one continuation');

    // The window returns to its own stream before the cleanup turn: the load passes through.
    await loadOwn();
    assert.equal(resolves.length, 1, 'the own load passed through: no second resolve');
    shim.timers.fire(cleanup[0]);
    await settle();
    assert.equal(controller.snapshot().phase, 'inactive', 'the cleanup turn leaves the window inactive');
    // Sign Out is a window action and still works in an inactive window, so authority is probed with a quality
    // change, which only a current activation resolves.
    shim.sidebar.send('change-quality', '480p30');
    await settle();
    assert.equal(resolves.length, 1, 'the controller does not hold authority again');
  });

test('r4 #3 managed: the cleanup turn deactivates, and the inactive sidebar keeps its Open field', async t => {
  const {shim, controller, loadOwn} = managedWindow(t);
  await loadOwn();
  shim.sidebar.send('ready', {});
  shim.mpv.set('path', localFile);
  let continued = 0;
  await shim.mpv.runHook('on_load', () => continued++);
  assert.equal(continued, 1);
  shim.sidebar.send('open', {input: 'fixture_r4_charlie'});
  assert.equal(shim.global.messages('open').length, 0, 'before cleanup: no open request');
  shim.timers.advance(0);
  await settle();
  assert.equal(controller.snapshot().phase, 'inactive', 'the cleanup turn deactivates the controller');
  shim.sidebar.send('open', {input: 'fixture_r4_charlie'});
  assert.equal(shim.global.messages('open').length, 1, 'after cleanup: the Open field works as before');
});

// D-033 (v0.5.5): retitled from "... restores a deactivated window"; the window now stays inactive (asserted).
test('r4 #3 managed: an own-source load before a second cleanup turn leaves the window inactive, not inert',
  async t => {
  const {shim, controller, loadOwn, loadForeign} = managedWindow(t);
  await loadOwn();
  shim.sidebar.send('ready', {});
  await loadForeign();
  shim.timers.advance(0);
  await settle();
  assert.equal(controller.snapshot().phase, 'inactive', 'precondition: the first foreign file deactivated it');
  await loadForeign(); // Its cleanup turn is still pending when the window's own source loads.
  shim.mpv.set('path', Sources.parse(liveA).url);
  let continued = 0;
  await shim.mpv.runHook('on_load', () => continued++);
  assert.equal(continued, 1);
  shim.timers.advance(0);
  await settle();
  assert.equal(controller.snapshot().phase, 'inactive', 'the window stays inactive');
  shim.sidebar.send('open', {input: 'fixture_r4_charlie'});
  assert.equal(shim.global.messages('open').length, 1, 'the Open field works: the window is not stuck inert');
  });
