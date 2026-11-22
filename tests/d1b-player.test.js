'use strict';

// D1 follow-ups (#47): Hide Chat from the docked cluster, the widen/restore frame at the screen edge, and a chat
// restart (Connect, import, resume, replay fetch) that must not shrink and re-widen the window in beside mode.
// Same host assumptions as d1-player.test.js (IINA 1.5.1 frame in screen points, full screen frames, the
// video-margin-ratio-right option). Synthetic host only: no test contacts Twitch or authorizes an account.

const test = require('node:test');
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {createRequire} = require('node:module');
const Sources = require('../src/source.js');
const {createIina} = require('./support/iina-shim.js');

const playerPath = join(__dirname, '../src/player.js');
const requireFromPlayer = createRequire(playerPath);
const source = Sources.parse('fixture_d1b_live');
const marginOption = 'video-margin-ratio-right';
const screenFrame = {x: 0, y: 0, width: 1600, height: 1000};
const roomyFrame = {x: 80, y: 120, width: 800, height: 450};
const edgeFrame = {x: 1000, y: 120, width: 600, height: 450};

async function playerFixture(t, {frame = roomyFrame, runHelper} = {}) {
  let settings = {};
  const shim = createIina({
    label: Sources.label(source, 'unified'),
    mpv: {path: source.url, 'time-pos': 40, speed: 1, pause: false, [marginOption]: 0},
    window: {frame: {...frame}, fullscreen: false, screens: [{frame: {...screenFrame}, main: true, current: true}]},
  });
  const module = {exports: {}};
  shim.runScript(playerPath, {
    globals: {module, Date: shim.timers.Date},
    require(name) {
      if (name !== './live-clock.js') return requireFromPlayer(name);
      return {createLiveClock: () => ({start() {}, stop() {}, behindLive: () => 45, goLiveTarget: () => 80})};
    },
  });
  const controller = module.exports.start(shim.iina, {variant: 'unified'}, {
    readSettings: () => structuredClone(settings),
    saveSettings: next => { settings = structuredClone(next); },
    dataPath: name => '/private/data/' + name,
    runHelper,
    readFile: () => JSON.stringify({version: 1, count: 0, chunks: [], sourceId: '', title: 'Archive', timeline: {availableStart: 0}}),
    async resolve() {
      return {
        ok: true, title: 'Synthetic stream', live: true, quality: '720p60',
        mediaURL: 'https://media.invalid/d1b.m3u8', formats: [{id: '720p60', label: '720p60'}],
      };
    },
  });
  function setView(change) {
    shim.sidebar.send('view', change);
    shim.timers.flush();
  }
  t.after(() => shim.emit('iina.window-will-close'));
  shim.sidebar.send('ready', {});
  await shim.mpv.runHook('on_load');
  shim.emit('iina.file-loaded', source.url);
  shim.emit('iina.window-size-adjusted', {...shim.core.native.frame});
  shim.timers.advance(600);
  shim.sidebar.send('connect', {});
  shim.global.send('auth-ready', JSON.stringify({login: 'fixture_reader', token: 'fake_d1b_credential'}));
  shim.emit('iina.plugin-overlay-loaded');
  shim.overlay.send('overlay-ready', {});
  assert.equal(controller.snapshot().chat.mode, 'live');
  return {shim, controller, setView, savedSettings: () => settings};
}

const frameWrites = shim => shim.core.windowWrites.filter(write => write.key === 'frame').map(write => write.value);
const marginSets = shim => shim.mpv.sets.filter(([name]) => name === marginOption);

test('D1b the Hide Chat click turns chat off, keeps it off, and leaves beside without taking the presentation', async t => {
  const {shim, controller, setView, savedSettings} = await playerFixture(t);
  setView({presentation: 'beside', columnWidth: 320});
  assert.ok(shim.mpv.props.get(marginOption) > 0, 'beside was active');
  const hidesBefore = shim.overlay.hides;

  await shim.overlay.receive('chat-off', {});
  shim.timers.flush();
  // A late auth message must not bring chat back.
  shim.global.send('auth-ready', JSON.stringify({login: 'fixture_reader', token: 'fake_d1b_credential'}));
  shim.timers.flush();

  const snapshot = controller.snapshot();
  assert.equal(snapshot.chat.mode, 'off');
  assert.equal(snapshot.view.presentation, 'beside', 'only chat is turned off; the presentation choice stays');
  assert.equal(savedSettings().chatEnabled, false);
  assert.equal(shim.mpv.props.get(marginOption), 0);
  assert.ok(shim.overlay.hides > hidesBefore, 'the overlay is hidden');
  assert.equal(shim.overlay.visible, false);
  assert.deepEqual(shim.core.native.frame, roomyFrame, 'the window returns to its original frame');
});

test('D1b restore returns to the original x when the widening shifted the window left at the screen edge', async t => {
  const {shim, setView} = await playerFixture(t, {frame: edgeFrame});
  setView({presentation: 'beside', columnWidth: 320});
  assert.deepEqual(shim.core.native.frame, {x: 680, y: 120, width: 920, height: 450}, 'widened, shifted left 320');

  await shim.overlay.receive('chat-off', {});
  assert.deepEqual(shim.core.native.frame, edgeFrame, 'x comes back to 1000: the undo of the forced shift');
});

test('D1b a reconnect in beside mode sets no frame and changes no margin', async t => {
  const {shim, controller, setView} = await playerFixture(t);
  setView({presentation: 'beside', columnWidth: 320});
  const frames = frameWrites(shim).length;
  const margins = marginSets(shim).length;
  const hides = shim.overlay.hides;
  const marginBefore = shim.mpv.props.get(marginOption);

  shim.sidebar.send('connect', {});
  shim.timers.flush();

  assert.equal(controller.snapshot().chat.mode, 'live');
  assert.equal(frameWrites(shim).length, frames, 'no frame change');
  assert.equal(marginSets(shim).length, margins, 'no margin change');
  assert.equal(shim.mpv.props.get(marginOption), marginBefore);
  assert.equal(shim.overlay.hides, hides, 'the overlay stays up');
  assert.deepEqual(shim.core.native.frame, {...roomyFrame, width: 1120});
});

test('D1b importing an archive and resuming replay in beside mode do not cycle the window', async t => {
  const runHelper = async (name, args) => ({ok: true, indexPath: args[args.indexOf('--output') + 1] + '/index.json'});
  const {shim, controller, setView} = await playerFixture(t, {runHelper});
  setView({presentation: 'beside', columnWidth: 320});
  const frames = frameWrites(shim).length;
  const margins = marginSets(shim).length;

  assert.equal(await controller.importArchive('/synthetic/archive.json'), true);
  assert.equal(controller.snapshot().chat.mode, 'replay');
  controller.resumeReplay();
  shim.timers.flush();

  assert.equal(frameWrites(shim).length, frames);
  assert.equal(marginSets(shim).length, margins);
});

test('D1b an import in progress keeps beside, and a failed import leaves it and hides the overlay', async t => {
  let fail;
  const runHelper = () => new Promise((resolve, reject) => { fail = reject; });
  const {shim, controller, setView} = await playerFixture(t, {runHelper});
  setView({presentation: 'beside', columnWidth: 320});
  const frames = frameWrites(shim).length;
  const margins = marginSets(shim).length;
  const pending = controller.importArchive('/synthetic/archive.json');
  assert.equal(controller.snapshot().chat.state, 'importing');
  assert.equal(frameWrites(shim).length, frames, 'importing keeps the widened window');
  assert.equal(marginSets(shim).length, margins);

  fail(new Error('Synthetic failure'));
  await pending;
  assert.equal(controller.snapshot().chat.mode, 'off');
  assert.equal(shim.mpv.props.get(marginOption), 0, 'a failed restart ends beside');
  assert.deepEqual(shim.core.native.frame, roomyFrame);
  assert.equal(shim.overlay.visible, false);
});
