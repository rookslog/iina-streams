'use strict';

// D1 (chat beside the video) under v0.5.5 class L (docs/design/V055-CLASS-REPAIR-2026-11-22.md, L1, L2, L5).
// The explorer's alphabet has no view change, so it never enters beside; these pin beside across a loss.
//   - Between a foreign hook and its release turn nothing is current: a resize, an overlay column drag or a
//     sidebar view change writes no margin and no frame. The release turn then leaves beside once.
//   - The applied margin and widening are window-scoped (they mirror mpv's option and the window frame). D-033:
//     an own-source reopen before the release turn passes through and begins no activation, so the release
//     turn clears the margin and restores the width once, and the window stays inactive.

const test = require('node:test');
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {createRequire} = require('node:module');
const Sources = require('../src/source.js');
const {createIina} = require('./support/iina-shim.js');

const playerPath = join(__dirname, '../src/player.js');
const requireFromPlayer = createRequire(playerPath);
const source = Sources.parse('fixture_d1_class_l');
const foreignFile = '/Users/fixture/movie.mkv';
const marginOption = 'video-margin-ratio-right';
const windowedFrame = {x: 80, y: 120, width: 800, height: 450};
const screenFrame = {x: 0, y: 0, width: 1600, height: 1000};
const settle = () => new Promise(resolve => setImmediate(resolve));

// As in tests/d1-player.test.js: the frame and screens follow IINA 1.5.1 (JavascriptAPICore.swift L240-L286).
async function besideWindow(t) {
  let settings = {};
  // When set, the next resolve waits until the test calls the stored function.
  let holdNext = false;
  let release = null;
  const shim = createIina({
    label: Sources.label(source, 'unified'),
    mpv: {path: source.url, 'time-pos': 40, speed: 1, pause: false, [marginOption]: 0},
    window: {
      frame: {...windowedFrame},
      fullscreen: false,
      screens: [{frame: {...screenFrame}, main: true, current: true}],
    },
  });
  shim.http.setResponse({statusCode: 200, text: '#EXTM3U'});
  const module = {exports: {}};
  shim.runScript(playerPath, {globals: {module, Date: shim.timers.Date}, require: requireFromPlayer});
  const controller = module.exports.start(shim.iina, {variant: 'unified'}, {
    readSettings: () => structuredClone(settings),
    saveSettings: next => { settings = structuredClone(next); },
    async resolve() {
      const result = {
        ok: true, title: 'Synthetic stream', live: true, quality: '720p60',
        mediaURL: 'https://media.invalid/d1-class-l.m3u8', formats: [{id: '720p60', label: '720p60'}],
      };
      if (!holdNext) return result;
      holdNext = false;
      return new Promise(resolve => { release = () => resolve(result); });
    },
  });
  t.after(() => shim.emit('iina.window-will-close'));

  async function load(path) {
    shim.mpv.set('path', path);
    let continued = 0;
    await shim.mpv.runHook('on_load', () => continued++);
    assert.equal(continued, 1, 'precondition: the load continues once');
  }

  function connect() {
    shim.sidebar.send('connect', {});
    shim.global.send('auth-ready', JSON.stringify({login: 'fixture_reader', token: 'fake_d1_class_l_credential'}));
  }

  shim.timers.advance(0);
  shim.sidebar.send('ready', {});
  await load(source.url);
  shim.emit('iina.file-loaded', source.url);
  shim.emit('iina.window-size-adjusted', {...shim.core.native.frame});
  shim.timers.advance(600);
  connect();
  shim.emit('iina.plugin-overlay-loaded');
  shim.overlay.send('overlay-ready', {});
  shim.sidebar.send('view', {presentation: 'beside', columnWidth: 320});
  shim.timers.flush();
  assert.equal(controller.snapshot().chat.mode, 'live', 'precondition: live chat is on');
  assert.ok(shim.mpv.props.get(marginOption) > 0, 'precondition: beside reserves the margin');
  assert.equal(shim.core.native.frame.width, 1120, 'precondition: beside widened the window');
  function holdResolve() {
    holdNext = true;
  }
  return {shim, controller, load, connect, holdResolve, releaseResolve: () => release()};
}

function marginWrites(shim, from) {
  return shim.mpv.sets.slice(from).filter(([name]) => name === marginOption);
}

function frameWrites(shim, from) {
  return shim.core.windowWrites.slice(from).filter(write => write.key === 'frame').map(write => write.value);
}

function mark(shim) {
  return {sets: shim.mpv.sets.length, frames: shim.core.windowWrites.length};
}

test('D1 class L: a resize or column drag after a foreign hook writes nothing until the release turn', async t => {
  const {shim, load} = await besideWindow(t);
  await load(foreignFile);
  const atLoss = mark(shim);
  shim.core.native.frame = {...shim.core.native.frame, width: 1040};
  shim.emit('iina.window-resized', {...shim.core.native.frame});
  shim.emit('iina.window-size-adjusted', {...shim.core.native.frame});
  shim.overlay.send('view', {columnWidth: 400});
  shim.sidebar.send('view', {presentation: 'beside', columnWidth: 300});
  assert.deepEqual(marginWrites(shim, atLoss.sets), [], 'no margin is written for an ended activation');
  assert.deepEqual(frameWrites(shim, atLoss.frames), [], 'no frame is written for an ended activation');

  shim.timers.advance(0); // The release turn.
  await settle();
  assert.deepEqual(marginWrites(shim, atLoss.sets), [[marginOption, 0]], 'the release leaves beside once');
  assert.deepEqual(frameWrites(shim, atLoss.frames), [], 'and does not restore over the resized width');
});

test('D1 class L: the release turn of a foreign load clears the margin and restores the width once', async t => {
  const {shim, load} = await besideWindow(t);
  await load(foreignFile);
  const atLoss = mark(shim);
  shim.timers.advance(0);
  await settle();
  shim.timers.advance(3000);
  await settle();
  assert.deepEqual(marginWrites(shim, atLoss.sets), [[marginOption, 0]]);
  assert.deepEqual(frameWrites(shim, atLoss.frames).map(frame => frame.width), [800]);
  assert.equal(shim.core.native.frame.width, 800);
});

// D-033 (v0.5.5): a loss is final. This replaces "an own-source reopen before the release turn neither keeps the
// margin nor widens twice": the reopen no longer begins an activation, so nothing can widen the window again.
test('D1 class L: an own-source reopen before the release turn passes through, and the release leaves beside once',
  async t => {
    const {shim, controller, load} = await besideWindow(t);
    await load(foreignFile);
    const atLoss = mark(shim);
    await load(source.url); // The source reopens before the release turn, and continues once (load asserts it).
    assert.deepEqual(shim.mpv.sets.slice(atLoss.sets), [], 'the reopen sets nothing on mpv: it passes through');
    shim.timers.advance(0); // The release turn.
    await settle();
    shim.emit('iina.file-loaded', source.url);
    shim.emit('iina.window-size-adjusted', {...shim.core.native.frame});
    shim.timers.advance(3000);
    await settle();
    assert.deepEqual(marginWrites(shim, atLoss.sets), [[marginOption, 0]], 'the release clears the margin once');
    assert.deepEqual(frameWrites(shim, atLoss.frames).map(frame => frame.width), [800], 'and restores the width once');
    assert.equal(shim.core.native.frame.width, 800);
    assert.equal(controller.snapshot().phase, 'inactive', 'the window stays inactive');
  });

// D-033 (v0.5.5): this replaces "a reopen still resolving at the release turn does not keep the old margin". The
// reopen no longer resolves: with a resolve held, it still continues at once.
test('D1 class L: a reopen at the release turn passes through without resolving, and beside is left once',
  async t => {
    const {shim, controller, load, holdResolve} = await besideWindow(t);
    await load(foreignFile);
    const atLoss = mark(shim);
    holdResolve();
    await load(source.url); // Continues once although a resolve would be held: nothing resolves.
    shim.timers.advance(0); // The foreign load's release turn.
    await settle();
    assert.equal(shim.overlay.visible, false, 'the release hides the old overlay');
    assert.deepEqual(marginWrites(shim, atLoss.sets), [[marginOption, 0]], 'and leaves beside with it');
    assert.deepEqual(frameWrites(shim, atLoss.frames).map(frame => frame.width), [800], 'restoring the width once');
    assert.equal(shim.core.native.frame.width, 800);
    assert.equal(controller.snapshot().phase, 'inactive', 'the window stays inactive');
  });
