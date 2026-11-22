'use strict';

// D1 bridge assumptions: the existing sidebar 'view' message accepts {presentation, columnWidth}.
// The player sends the overlay its existing encoded 'state' message, adding layout: 'column' and
// carrying the width in view.columnWidth. The overlay cluster posts 'go-live' or 'chat-off' with {},
// reusing the names and actions already used by the sidebar. These tests cover the player boundary,
// not WebKit layout, hit-testing, or the native pixels reserved by mpv.

const test = require('node:test');
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {createRequire} = require('node:module');
const {viewSettings} = require('../src/player.js');
const Sources = require('../src/source.js');
const {createIina} = require('./support/iina-shim.js');

const playerPath = join(__dirname, '../src/player.js');
const requireFromPlayer = createRequire(playerPath);
const source = Sources.parse('fixture_d1_live');
const marginOption = 'video-margin-ratio-right';
const windowedFrame = {x: 80, y: 120, width: 800, height: 450};
const screenFrame = {x: 0, y: 0, width: 1600, height: 1000};

async function playerFixture(t) {
  let settings = {};
  // IINA 1.5.1 exposes frame as {x, y, width, height} in screen points and sets it via NSWindow.setFrame.
  // Its screens list exposes full screen frames, not visibleFrame; this fixture has room to widen.
  // https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPICore.swift#L240-L286
  // The mpv option is on IINA's allow-list; the native result is in the #47/#52 spike, §7.
  // https://github.com/iina/iina/blob/v1.5.1/iina/AppData.swift#L245
  const shim = createIina({
    label: Sources.label(source, 'unified'),
    mpv: {path: source.url, 'time-pos': 40, speed: 1, pause: false, [marginOption]: 0},
    window: {
      frame: {...windowedFrame},
      fullscreen: false,
      screens: [{frame: {...screenFrame}, main: true, current: true}],
    },
  });
  const module = {exports: {}};
  shim.runScript(playerPath, {
    globals: {module, Date: shim.timers.Date},
    require(name) {
      if (name !== './live-clock.js') return requireFromPlayer(name);
      // As in C3, fix the clock at an edge estimate that makes the real Go Live action seek.
      return {createLiveClock: () => ({start() {}, stop() {}, behindLive: () => 45, goLiveTarget: () => 80})};
    },
  });
  const controller = module.exports.start(shim.iina, {variant: 'unified'}, {
    readSettings: () => structuredClone(settings),
    saveSettings: next => { settings = structuredClone(next); },
    async resolve() {
      return {
        ok: true, title: 'Synthetic stream', live: true, quality: '720p60',
        mediaURL: 'https://media.invalid/d1.m3u8', formats: [{id: '720p60', label: '720p60'}],
      };
    },
  });
  // Update the host frame before emitting either notification. Both supply a rect as the first argument.
  // https://github.com/iina/iina/blob/v1.5.1/iina/EventController.swift#L31-L35
  // https://github.com/iina/iina/blob/v1.5.1/iina/MainWindowController.swift#L1973
  // https://github.com/iina/iina/blob/v1.5.1/iina/MainWindowController.swift#L2609
  // https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPIEvent.swift#L67-L74
  function resize(width, event = 'iina.window-resized') {
    shim.core.native.frame = {...shim.core.native.frame, width};
    shim.emit(event, {...shim.core.native.frame});
  }

  // Fullscreen completion supplies the new boolean and the frame then belongs to AppKit.
  // https://github.com/iina/iina/blob/v1.5.1/iina/MainWindowController.swift#L1575
  function goFullscreen() {
    shim.core.native.frame = {...screenFrame};
    shim.core.native.fullscreen = true;
    shim.emit('iina.window-fs.changed', true);
  }

  function setView(change) {
    shim.sidebar.send('view', change);
    shim.timers.flush();
  }

  t.after(() => shim.emit('iina.window-will-close'));
  shim.sidebar.send('ready', {});
  await shim.mpv.runHook('on_load');
  shim.emit('iina.file-loaded', source.url);
  resize(windowedFrame.width, 'iina.window-size-adjusted');
  shim.timers.advance(600);
  assert.equal(controller.snapshot().phase, 'playing');

  shim.sidebar.send('connect', {});
  shim.global.send('auth-ready', JSON.stringify({login: 'fixture_reader', token: 'fake_d1_credential'}));
  shim.emit('iina.plugin-overlay-loaded');
  shim.overlay.send('overlay-ready', {});
  assert.equal(controller.snapshot().chat.mode, 'live');

  return {shim, controller, setView, resize, goFullscreen, savedSettings: () => settings};
}

function frameWrites(shim) {
  return shim.core.windowWrites.filter(write => write.key === 'frame').map(write => write.value);
}

function margin(shim) {
  return shim.mpv.props.get(marginOption);
}

function assertMargin(shim, expected, context) {
  const actual = margin(shim);
  assert.ok(Math.abs(actual - expected) < 1e-6, `${context}: expected margin ${expected}, got ${actual}`);
}

function latestState(surface) {
  const post = surface.messages('state').at(-1);
  assert.ok(post, 'the ready surface receives state');
  return JSON.parse(decodeURIComponent(post.data.encoded));
}

test('D1 viewSettings accepts the beside presentation', () => {
  assert.equal(viewSettings({presentation: 'beside'}).presentation, 'beside');
});

test('D1 viewSettings defaults columnWidth to 320 and clamps it to 240–480', () => {
  const widths = [undefined, 239, 240, 360, 480, 481];
  const actual = widths.map(columnWidth => viewSettings({presentation: 'beside', columnWidth}).columnWidth);
  assert.deepEqual(actual, [320, 240, 240, 360, 480, 480]);
});

test('D1 entering beside reserves space for the column in mpv', async t => {
  const {shim, setView} = await playerFixture(t);
  setView({presentation: 'beside', columnWidth: 320});
  assertMargin(shim, 320 / shim.core.native.frame.width, 'entering beside');
});

for (const event of ['iina.window-resized', 'iina.window-size-adjusted']) {
  test(`D1 ${event} recomputes the margin from the current window width`, async t => {
    const {shim, setView, resize} = await playerFixture(t);
    setView({presentation: 'beside', columnWidth: 320});
    resize(1040, event);
    shim.timers.flush();
    assertMargin(shim, 320 / shim.core.native.frame.width, event);
  });
}

const exitActions = {
  'selecting another presentation': ({setView}) => setView({presentation: 'overlay'}),
  'turning chat off': ({shim}) => shim.sidebar.send('chat-off', {}),
  'deactivating the controller': ({controller}) => controller.passThrough(),
  'closing the window': ({shim}) => shim.emit('iina.window-will-close'),
};

for (const [description, exit] of Object.entries(exitActions)) {
  test(`D1 ${description} resets the mpv margin to zero`, async t => {
    const fixture = await playerFixture(t);
    const {shim, setView} = fixture;
    setView({presentation: 'beside', columnWidth: 320});
    const activeMargin = margin(shim);
    const activeWidth = shim.core.native.frame.width;
    const beforeExit = shim.mpv.sets.length;

    exit(fixture);
    shim.timers.flush();
    const exitMargins = shim.mpv.sets.slice(beforeExit).filter(([name]) => name === marginOption);
    assert.deepEqual(exitMargins.at(-1), [marginOption, 0], 'the exit must explicitly clear the player option');
    assert.equal(margin(shim), 0);
    assert.ok(activeMargin > 0, 'the option was active before the exit');
    assert.deepEqual([activeWidth, shim.core.native.frame.width], [1120, 800], 'restore the untouched width');
  });
}

test('D1 widens the window once and restores the original frame when its width is unchanged', async t => {
  const {shim, setView, resize} = await playerFixture(t);
  setView({presentation: 'beside', columnWidth: 320});
  resize(shim.core.native.frame.width);
  setView({presentation: 'beside', columnWidth: 320});
  setView({presentation: 'sidebar'});

  const widenedFrame = {...windowedFrame, width: 1120};
  assert.deepEqual(frameWrites(shim), [widenedFrame, windowedFrame]);
});

test('D1 leaving beside does not restore over a user-resized width', async t => {
  const {shim, setView, resize} = await playerFixture(t);
  setView({presentation: 'beside', columnWidth: 320});
  resize(960);
  setView({presentation: 'sidebar'});

  assert.deepEqual(frameWrites(shim).map(frame => frame.width), [1120], 'widen once, but do not undo the drag');
  assert.equal(shim.core.native.frame.width, 960);
});

test('D1 entering and leaving beside in fullscreen uses the margin without writing a frame', async t => {
  const {shim, setView, goFullscreen} = await playerFixture(t);
  goFullscreen();
  setView({presentation: 'beside', columnWidth: 320});
  const activeMargin = margin(shim);
  setView({presentation: 'sidebar'});

  assert.deepEqual(frameWrites(shim), [], 'no widening or restoring in fullscreen');
  assert.equal(activeMargin, 0.2, '320 points out of the 1600-point fullscreen frame');
  assert.equal(margin(shim), 0);
});

test('D1 going fullscreen with beside active recomputes the margin without writing a frame', async t => {
  const {shim, setView, goFullscreen} = await playerFixture(t);
  setView({presentation: 'beside', columnWidth: 320});
  const writesBeforeFullscreen = frameWrites(shim).length;
  goFullscreen();
  shim.timers.flush();

  assert.equal(frameWrites(shim).length, writesBeforeFullscreen);
  assertMargin(shim, 0.2, 'iina.window-fs.changed');
});

test('D1 the ready overlay receives the column layout and selected width in state', async t => {
  const {shim, setView} = await playerFixture(t);
  setView({presentation: 'beside', columnWidth: 360});
  const {layout, view} = latestState(shim.overlay);
  assert.deepEqual({layout, columnWidth: view.columnWidth}, {layout: 'column', columnWidth: 360});
});

test('D1 the overlay Go Live message uses the C3 seek action', async t => {
  const {shim, controller, setView} = await playerFixture(t);
  setView({presentation: 'beside', columnWidth: 320});
  shim.mpv.set('pause', true);
  assert.equal(controller.snapshot().behindLive, 45, 'the live clock is running with a confident estimate');
  // Per the IINA bridge, a message with no listener is dropped, not a test-harness exception.
  await shim.overlay.receive('go-live', {});
  const commands = shim.mpv.commands.map(([name, args]) => [name, Array.from(args)]);
  assert.deepEqual(commands, [['seek', ['80', 'absolute']]], 'the cluster uses the existing live-edge seek');
  assert.equal(shim.mpv.props.get('pause'), false, 'the existing action resumes playback');
});

test('D1 the overlay Hide Chat message turns chat off and saves the preference', async t => {
  const {shim, controller, setView, savedSettings} = await playerFixture(t);
  setView({presentation: 'beside', columnWidth: 320});
  await shim.overlay.receive('chat-off', {});

  assert.equal(controller.snapshot().chat.mode, 'off', 'the cluster uses the existing chat-off action');
  assert.equal(savedSettings().chatEnabled, false);
  assert.equal(margin(shim), 0);
});

test('D1 the Chat submenu enables Beside Video and selects beside', async t => {
  const {shim} = await playerFixture(t);
  const item = shim.menu.items.find(item => item.title === 'Chat')?.items.find(item => item.title === 'Beside Video');
  assert.ok(item, 'the Chat submenu contains Beside Video');
  // Inspect both the enabled flag and the callback result, even while the stub is disabled.
  await item.action();
  assert.deepEqual(
    {enabled: item.enabled, presentation: latestState(shim.sidebar).view.presentation},
    {enabled: true, presentation: 'beside'},
  );
});
