'use strict';

// D1c, player half (docs/design/OVERNIGHT-WAVE-B-2026-11-22.md, "D1c — Hiding chat never turns it off").
// Rule: hiding is a view state, and only Turn Chat Off stops chat.
// Contract (the UI half, tests/d1c-ui.test.js, implements the page side):
//   page -> player   'chat-collapse' {collapsed: boolean}, from the overlay's column button and the sidebar toggle.
//   player -> overlay 'state' and player -> sidebar 'state' carry collapsed: boolean and unread: boolean; unread is
//   true only while collapsed and messages have arrived since collapsing.
// Same host assumptions as d1-player.test.js: IINA 1.5.1 frame in screen points, full screen frames, and the
// video-margin-ratio-right option. Synthetic host only: no test contacts Twitch or authorizes an account.

const test = require('node:test');
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {createRequire} = require('node:module');
const Sources = require('../src/source.js');
const {createIina, keyBindingProblems} = require('./support/iina-shim.js');

const playerPath = join(__dirname, '../src/player.js');
const requireFromPlayer = createRequire(playerPath);
const source = Sources.parse('fixture_d1c_live');
const marginOption = 'video-margin-ratio-right';
const windowedFrame = {x: 80, y: 120, width: 800, height: 450};
const screenFrame = {x: 0, y: 0, width: 1600, height: 1000};
const archiveDir = '/private/data/';

// A replay archive with messages at 30 s and 45 s of media time. The real Replay class reads it.
const archiveIndex = {
  version: 1, count: 2, sourceId: '', title: 'Archive', timeline: {availableStart: 30, availableEnd: 45},
  chunks: [{file: 'chunk-000000.json', start: 30, end: 45, count: 2}],
};
const archiveRows = [
  {id: 'replay-30', time: 30, author: 'Viewer', text: 'at thirty', color: '', badges: [], kind: 'message'},
  {id: 'replay-45', time: 45, author: 'Viewer', text: 'at forty-five', color: '', badges: [], kind: 'message'},
];

async function playerFixture(t, {view} = {}) {
  let settings = view ? {view} : {};
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
      return {createLiveClock: () => ({start() {}, stop() {}, behindLive: () => 45, goLiveTarget: () => 80})};
    },
  });
  const controller = module.exports.start(shim.iina, {variant: 'unified'}, {
    readSettings: () => structuredClone(settings),
    saveSettings: next => { settings = structuredClone(next); },
    dataPath: name => archiveDir + name,
    async runHelper(name, args) {
      if (args.includes('/synthetic/unreadable.json')) return {ok: false, error: {message: 'Unreadable archive.'}};
      return {ok: true, indexPath: args[args.indexOf('--output') + 1] + '/index.json'};
    },
    readFile(path) {
      if (path.endsWith('/index.json')) return JSON.stringify(archiveIndex);
      if (path.endsWith('/chunk-000000.json')) return JSON.stringify(archiveRows);
      throw new Error('unexpected read ' + path);
    },
    async resolve(_source, quality) {
      return {
        ok: true, title: 'Synthetic stream', live: true, quality: quality || '720p60',
        mediaURL: 'https://media.invalid/d1c.m3u8',
        formats: [{id: '720p60', label: '720p60'}, {id: '480p30', label: '480p30'}],
      };
    },
  });

  function resize(width, event = 'iina.window-resized') {
    shim.core.native.frame = {...shim.core.native.frame, width};
    shim.emit(event, {...shim.core.native.frame});
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
  shim.global.send('auth-ready', JSON.stringify({login: 'fixture_reader', token: 'fake_d1c_credential'}));
  shim.emit('iina.plugin-overlay-loaded');
  shim.overlay.send('overlay-ready', {});
  assert.equal(controller.snapshot().chat.mode, 'live');

  return {shim, controller, setView, resize, savedSettings: () => settings};
}

function decode(post) {
  return JSON.parse(decodeURIComponent(post.data.encoded));
}

function latestState(surface) {
  const post = surface.messages('state').at(-1);
  assert.ok(post, 'the ready surface receives state');
  return decode(post);
}

function liveSession(shim) {
  const config = shim.overlay.messages('live-config').at(-1);
  assert.ok(config, 'the overlay received live-config');
  return decode(config).session;
}

// Messages with no send time show at once under every timing mode (src/player.js inboxEntry).
function liveBatch(shim, ids) {
  const messages = ids.map(id => ({id, author: 'Viewer', text: 'message ' + id}));
  shim.overlay.send('live-messages', {session: liveSession(shim), messages});
  shim.timers.flush();
}

function collapse(shim, collapsed, surface = shim.overlay) {
  surface.receive('chat-collapse', {collapsed});
  shim.timers.flush();
}

// The surfaces' view of collapsed and unread, both of which must carry it.
function surfaceFlags(shim) {
  const overlay = latestState(shim.overlay);
  const sidebar = latestState(shim.sidebar);
  return {
    overlay: {collapsed: overlay.collapsed, unread: overlay.unread},
    sidebar: {collapsed: sidebar.collapsed, unread: sidebar.unread},
  };
}

function flags(collapsed, unread) {
  return {overlay: {collapsed, unread}, sidebar: {collapsed, unread}};
}

function frameWrites(shim) {
  return shim.core.windowWrites.filter(write => write.key === 'frame').length;
}

function margin(shim) {
  return shim.mpv.props.get(marginOption);
}

function assertMargin(shim, expected, context) {
  const actual = margin(shim);
  assert.ok(Math.abs(actual - expected) < 1e-6, `${context}: expected margin ${expected}, got ${actual}`);
}

function chatMenu(shim) {
  const chat = shim.menu.items.find(item => item.title === 'Chat');
  assert.ok(chat, 'the Chat submenu is registered');
  return chat;
}

// The toggle, whichever title it has now. Read at assertion time: the player may replace its items.
function toggleItem(shim) {
  const items = chatMenu(shim).items.filter(item => item.title === 'Hide Chat' || item.title === 'Show Chat');
  assert.equal(items.length, 1, 'the Chat submenu has one Hide Chat / Show Chat item');
  return items[0];
}

function chatItem(shim, title) {
  const item = chatMenu(shim).items.find(entry => entry.title === title);
  assert.ok(item, 'the Chat submenu has ' + title);
  return item;
}

// What stopping chat leaves behind: these must not change while chat is only hidden.
function stopSignals(shim) {
  return {
    liveStops: shim.overlay.messages('live-stop').length,
    disconnects: shim.global.messages('auth-disconnect').length,
    overlayHides: shim.overlay.hides,
  };
}

for (const presentation of ['overlay', 'beside']) {
  test(`D1c collapsing chat ${presentation === 'overlay' ? 'over' : 'beside'} the video keeps live chat running`,
    async t => {
      const {shim, controller, setView, savedSettings} = await playerFixture(t);
      setView({presentation});
      const before = stopSignals(shim);

      collapse(shim, true);

      assert.deepEqual(surfaceFlags(shim), flags(true, false), 'the collapse reached both surfaces');
      assert.deepEqual(stopSignals(shim), before, 'no live-stop, no auth-disconnect, the overlay stays up');
      assert.equal(controller.snapshot().chat.mode, 'live');
      assert.notEqual(savedSettings().chatEnabled, false, 'the chat preference is not cleared');
      assert.equal(shim.overlay.visible, true, 'the overlay page, which runs the transport, stays shown');
      liveBatch(shim, ['while-hidden']);
      assert.equal(controller.snapshot().messages.at(-1).id, 'while-hidden', 'the transport still delivers');
    });
}

test('D1c collapsing keeps replay chat following the playhead', async t => {
  const {shim, controller, setView} = await playerFixture(t);
  setView({presentation: 'overlay'});
  assert.equal(await controller.importArchive('/synthetic/archive.json'), true);
  shim.timers.flush();
  assert.equal(controller.snapshot().chat.mode, 'replay');
  assert.deepEqual(controller.snapshot().messages.map(m => m.id), ['replay-30']);

  collapse(shim, true);
  assert.deepEqual(surfaceFlags(shim), flags(true, false), 'the collapse reached both surfaces');
  shim.mpv.set('time-pos', 50);
  shim.timers.advance(250);
  shim.emit('mpv.time-pos.changed');
  shim.timers.advance(250);

  assert.equal(controller.snapshot().chat.mode, 'replay');
  assert.deepEqual(controller.snapshot().messages.map(m => m.id), ['replay-30', 'replay-45'], 'replay keeps ticking');
  assert.deepEqual(surfaceFlags(shim), flags(true, true), 'the new replay row marks chat unread');
});

test('D1c unread turns on with a chat batch while collapsed and clears on show', async t => {
  const {shim, setView} = await playerFixture(t);
  setView({presentation: 'beside'});
  liveBatch(shim, ['before-hide']);
  collapse(shim, true);
  assert.deepEqual(surfaceFlags(shim), flags(true, false), 'nothing has arrived since collapsing');

  liveBatch(shim, ['after-hide']);
  assert.deepEqual(surfaceFlags(shim), flags(true, true));

  collapse(shim, false);
  assert.deepEqual(surfaceFlags(shim), flags(false, false), 'showing chat clears unread');
});

test('D1c a chat batch while chat is shown never sets unread', async t => {
  const {shim, setView} = await playerFixture(t);
  setView({presentation: 'overlay'});
  liveBatch(shim, ['shown-1']);
  liveBatch(shim, ['shown-2']);
  assert.deepEqual(surfaceFlags(shim), flags(false, false));
});

test('D1c a moderation removal while collapsed is not an arrival', async t => {
  const {shim, setView} = await playerFixture(t);
  setView({presentation: 'overlay'});
  liveBatch(shim, ['kept', 'removed']);
  collapse(shim, true);
  shim.overlay.send('live-messages', {session: liveSession(shim), messages: [], removed: ['removed']});
  shim.timers.flush();
  assert.deepEqual(surfaceFlags(shim), flags(true, false));
});

test('D1c the sidebar toggle collapses and shows chat like the overlay button', async t => {
  const {shim, setView} = await playerFixture(t);
  setView({presentation: 'overlay'});
  collapse(shim, true, shim.sidebar);
  assert.deepEqual(surfaceFlags(shim), flags(true, false));
  collapse(shim, false, shim.sidebar);
  assert.deepEqual(surfaceFlags(shim), flags(false, false));
});

test('D1c collapsing beside zeroes the margin without a frame write, and showing restores it', async t => {
  const {shim, setView, resize} = await playerFixture(t);
  setView({presentation: 'beside', columnWidth: 320});
  const widened = shim.core.native.frame.width;
  assertMargin(shim, 320 / widened, 'beside');

  const writes = frameWrites(shim);
  collapse(shim, true);
  assert.equal(latestState(shim.overlay).collapsed, true);
  assert.equal(margin(shim), 0, 'the video fills the window');
  assert.equal(frameWrites(shim), writes, 'collapse never writes the window frame');
  assert.equal(shim.core.native.frame.width, widened);

  resize(1000);
  shim.timers.flush();
  assert.equal(margin(shim), 0, 'a resize while collapsed keeps the margin at 0');

  collapse(shim, false);
  assertMargin(shim, 320 / 1000, 'show restores the margin from the current width');
  assert.equal(frameWrites(shim), writes, 'show never writes the window frame');
});

test('D1c the Chat menu has Hide Chat with a collision-free key binding', async t => {
  const {shim} = await playerFixture(t);
  const item = toggleItem(shim);
  assert.equal(item.title, 'Hide Chat');
  assert.equal(item.keyBinding, 'Ctrl+Meta+c');
  assert.deepEqual(keyBindingProblems(item.keyBinding), []);
  assert.deepEqual(shim.menu.problems(), []);
});

test('D1c the menu item toggles, follows the state, and is enabled only for chat on the video', async t => {
  const {shim, setView} = await playerFixture(t);
  assert.equal(toggleItem(shim).enabled, false, 'chat in the sidebar: nothing to hide');
  toggleItem(shim).action();
  shim.timers.flush();
  assert.equal(latestState(shim.sidebar).collapsed, false, 'a disabled item does nothing if IINA calls it anyway');

  setView({presentation: 'overlay'});
  assert.deepEqual([toggleItem(shim).title, toggleItem(shim).enabled], ['Hide Chat', true]);
  // The items are replaced on a later turn, then IINA is asked to rebuild its menu once.
  const rebuilds = shim.menu.forceUpdates;
  toggleItem(shim).action();
  assert.equal(shim.menu.forceUpdates, rebuilds, 'no forceUpdate on the action\'s own stack');
  shim.timers.flush();
  assert.equal(shim.menu.forceUpdates, rebuilds + 1, 'one forceUpdate after the items are replaced');
  assert.deepEqual(surfaceFlags(shim), flags(true, false));
  assert.deepEqual([toggleItem(shim).title, toggleItem(shim).enabled], ['Show Chat', true]);

  toggleItem(shim).action();
  shim.timers.flush();
  assert.deepEqual(surfaceFlags(shim), flags(false, false));
  assert.equal(toggleItem(shim).title, 'Hide Chat');
  assert.deepEqual(shim.menu.problems(), [], 'the replaced items keep a collision-free binding');
});

async function changeQualityInWindow(shim, controller) {
  assert.equal(await controller.changeQuality('480p30'), true);
  shim.mpv.set('path', source.url + '#streams-generation=1');
  await shim.mpv.runHook('on_load');
  shim.emit('iina.file-loaded', source.url + '#streams-generation=1');
  shim.emit('iina.window-size-adjusted', {...shim.core.native.frame});
  shim.timers.advance(3000);
  assert.equal(controller.snapshot().quality, '480p30', 'the replacement loaded');
}

// Beside keeps its column through a reload; over the video has no column, so it is checked on its own.
test('D1c collapsed over the video survives a quality change in the same window', async t => {
  const {shim, controller, setView} = await playerFixture(t);
  setView({presentation: 'overlay'});
  collapse(shim, true);
  await changeQualityInWindow(shim, controller);
  assert.deepEqual(surfaceFlags(shim), flags(true, false));
  assert.equal(controller.snapshot().chat.mode, 'live');
  assert.equal(toggleItem(shim).title, 'Show Chat');
});

test('D1c collapsed survives a quality change in the same window', async t => {
  const {shim, controller, setView} = await playerFixture(t);
  setView({presentation: 'beside'});
  collapse(shim, true);
  assert.equal(margin(shim), 0);

  assert.equal(await controller.changeQuality('480p30'), true);
  shim.mpv.set('path', source.url + '#streams-generation=1');
  await shim.mpv.runHook('on_load');
  shim.emit('iina.file-loaded', source.url + '#streams-generation=1');
  shim.emit('iina.window-size-adjusted', {...shim.core.native.frame});
  shim.timers.advance(3000);

  assert.equal(controller.snapshot().quality, '480p30', 'the replacement loaded');
  assert.deepEqual(surfaceFlags(shim), flags(true, false));
  assert.equal(margin(shim), 0, 'the video still fills the window');
  assert.equal(controller.snapshot().chat.mode, 'live');
});

// A restart (import, replay, reconnect) runs chatOff({restart:true}), which over the video publishes with chat off for
// a moment. Chat comes straight back on, so it stays hidden.
test('D1c importing an archive while collapsed over the video keeps chat hidden', async t => {
  const {shim, controller, setView} = await playerFixture(t);
  setView({presentation: 'overlay'});
  collapse(shim, true);
  assert.equal(await controller.importArchive('/synthetic/archive.json'), true);
  shim.timers.flush();
  assert.equal(controller.snapshot().chat.mode, 'replay');
  assert.equal(latestState(shim.overlay).collapsed, true);
  assert.equal(latestState(shim.sidebar).collapsed, true);
});

// The import's chatOff is a restart, so only the failure turns chat off. Chat that is off is not hidden, and the
// next chat start beside the video is an ordinary one: the column and its margin come back.
test('D1c a failed import while collapsed leaves chat off and shown', async t => {
  const {shim, controller, setView} = await playerFixture(t);
  setView({presentation: 'beside', columnWidth: 320});
  collapse(shim, true);
  assert.equal(margin(shim), 0);

  assert.equal(await controller.importArchive('/synthetic/unreadable.json'), false);
  shim.timers.flush();
  assert.equal(controller.snapshot().chat.mode, 'off');
  assert.deepEqual(surfaceFlags(shim), flags(false, false), 'chat that is off is not hidden');
  assert.equal(toggleItem(shim).enabled, false);

  shim.sidebar.send('connect', {});
  shim.global.send('auth-ready', JSON.stringify({login: 'fixture_reader', token: 'fake_d1c_credential'}));
  shim.timers.flush();
  assert.equal(controller.snapshot().chat.mode, 'live');
  assert.deepEqual(surfaceFlags(shim), flags(false, false));
  assertMargin(shim, 320 / shim.core.native.frame.width, 'the column is back');
});

test('D1c Turn Chat Off while collapsed really stops chat', async t => {
  const {shim, controller, setView, savedSettings} = await playerFixture(t);
  setView({presentation: 'beside'});
  collapse(shim, true);
  assert.equal(latestState(shim.overlay).collapsed, true);
  const before = stopSignals(shim);

  chatItem(shim, 'Turn Chat Off').action();
  shim.timers.flush();

  assert.equal(controller.snapshot().chat.mode, 'off');
  assert.equal(savedSettings().chatEnabled, false);
  assert.ok(shim.overlay.messages('live-stop').length > before.liveStops, 'the live transport stops');
  assert.ok(shim.global.messages('auth-disconnect').length > before.disconnects, 'the login is released');
  assert.equal(margin(shim), 0);
  assert.deepEqual(shim.core.native.frame, windowedFrame, 'leaving beside restores the untouched frame');
  assert.deepEqual(surfaceFlags(shim), flags(false, false), 'chat that is off is not hidden');
  assert.equal(toggleItem(shim).enabled, false, 'nothing to hide while chat is off');
});

test('D1c choosing another presentation shows chat again', async t => {
  const {shim, setView} = await playerFixture(t);
  setView({presentation: 'beside'});
  collapse(shim, true);
  assert.equal(latestState(shim.overlay).collapsed, true);
  setView({presentation: 'overlay'});
  assert.deepEqual(surfaceFlags(shim), flags(false, false));
});

test('D1c a collapse request is ignored while chat is in the sidebar', async t => {
  const {shim, controller} = await playerFixture(t);
  collapse(shim, true, shim.sidebar);
  assert.equal(controller.snapshot().view.presentation, 'sidebar');
  assert.deepEqual(surfaceFlags(shim), flags(false, false));
});

test('D1c hiding the Streams sidebar keeps live chat in it running', async t => {
  const {shim, controller} = await playerFixture(t);
  assert.equal(controller.snapshot().view.presentation, 'sidebar');
  const before = stopSignals(shim);

  shim.sidebar.send('hide', {});
  shim.timers.flush();

  assert.equal(controller.snapshot().chat.mode, 'live');
  assert.equal(shim.overlay.messages('live-stop').length, before.liveStops, 'no live-stop');
  assert.equal(shim.global.messages('auth-disconnect').length, before.disconnects, 'no auth-disconnect');
  liveBatch(shim, ['while-sidebar-hidden']);
  assert.equal(controller.snapshot().messages.at(-1).id, 'while-sidebar-hidden');
});
