'use strict';

// #51: Go Live resumes playback, and the sidebar pill is "live" only when the player says it is at the
// live edge (cache end within 4 s of the playhead), not when behindLive is small. Twitch's floor on this
// path is 6-8 s behind live, so behindLive alone never reads as live. Synthetic sources only.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const Sources = require('../src/source.js');
const {createIina, createWebViewIina} = require('./support/iina-shim.js');

const ui = join(__dirname, '../ui');
const playerPath = join(__dirname, '../src/player.js');
const requireFromPlayer = createRequire(playerPath);
const liveSource = Sources.parse('fixture_c3_live_edge');
const mediaURL = quality => `https://media.invalid/${quality}.m3u8?sig=fake-c3-live-edge`;
const settle = () => new Promise(resolve => setImmediate(resolve));

function latestState(view) {
  const message = view.messages('state').at(-1);
  assert.ok(message, 'the ready view receives a player state');
  return JSON.parse(decodeURIComponent(message.data.encoded));
}

function playerFixture(t, {behind = 7, goLiveTarget = null, timePos = 40, cacheEnd = 82} = {}) {
  const shim = createIina({
    label: Sources.label(liveSource, 'unified'),
    mpv: {path: liveSource.url, 'time-pos': timePos, speed: 1, duration: 300, pause: false},
  });
  shim.timers.advance(Date.parse('2026-01-01T00:00:10Z'));
  shim.http.setResponse({statusCode: 200, text: '#EXTM3U'});
  shim.iina.mpv.getNative = property => shim.mpv.props.get(property) ?? null;
  shim.mpv.set('demuxer-cache-state', {'cache-end': cacheEnd});
  const liveClock = {start() {}, stop() {}, behindLive: () => behind, goLiveTarget: () => goLiveTarget};
  const module = {exports: {}};
  shim.runScript(playerPath, {
    globals: {module, Date: shim.timers.Date},
    require: name => name === './live-clock.js'
      ? {...requireFromPlayer(name), createLiveClock: () => liveClock}
      : requireFromPlayer(name),
  });
  module.exports.start(shim.iina, {variant: 'unified'}, {
    readSettings: () => ({chatEnabled: false}),
    saveSettings() {},
    trace() {},
    async resolve() {
      return {
        ok: true, title: 'Synthetic stream', live: true, quality: '720p60', mediaURL: mediaURL('720p60'),
        formats: [{id: '720p60', label: '720p60'}],
      };
    },
  });
  t.after(() => shim.emit('iina.window-will-close'));
  shim.sidebar.send('ready', {});

  async function load(path = liveSource.url) {
    shim.mpv.set('path', path);
    await shim.mpv.runHook('on_load', () => {});
    shim.emit('iina.file-loaded', path);
    shim.emit('iina.window-size-adjusted');
    await settle();
    shim.timers.advance(600);
    await settle();
  }
  return {shim, load, setBehind: value => { behind = value; }};
}

const pauseWrites = shim => shim.mpv.sets.filter(([name]) => name === 'pause').map(([, value]) => value);

test('Go Live unpauses after a successful seek', async t => {
  const {shim, load} = playerFixture(t, {goLiveTarget: 80});
  await load();
  shim.mpv.set('pause', true);
  await shim.sidebar.receive('go-live', {});
  assert.deepEqual(shim.mpv.commands.map(([name]) => name), ['seek']);
  assert.equal(shim.mpv.props.get('pause'), false);
});

test('Go Live unpauses after the reload fallback', async t => {
  const {shim, load} = playerFixture(t, {goLiveTarget: null});
  await load();
  shim.mpv.set('pause', true);
  await shim.sidebar.receive('go-live', {});
  await settle();
  const [[name, [replacement]]] = shim.mpv.commands;
  assert.equal(name, 'loadfile');
  await load(replacement);
  assert.equal(shim.mpv.props.get('pause'), false);
  assert.equal(pauseWrites(shim).at(-1), false);
});

test('the player publishes atLiveEdge from cache end minus playhead, at most 4 s', async t => {
  const published = [];
  for (const [timePos, cacheEnd] of [[78, 82], [77.9, 82], [40, 82]]) {
    const {shim, load} = playerFixture(t, {behind: 7, timePos, cacheEnd});
    await load();
    shim.emit('mpv.pause.changed');
    published.push(latestState(shim.sidebar).atLiveEdge);
  }
  assert.deepEqual(published, [true, false, false]);
});

test('atLiveEdge is false without an estimate', async t => {
  const {shim, load} = playerFixture(t, {behind: null, timePos: 80, cacheEnd: 82});
  await load();
  shim.emit('mpv.pause.changed');
  assert.equal(latestState(shim.sidebar).atLiveEdge, false);
  assert.equal(latestState(shim.sidebar).behindLive, null);
});

// ---- Sidebar pill ----

function element(id) {
  const attributes = new Map();
  const listeners = new Map();
  return {
    id, hidden: false, value: '', textContent: '', title: '', dataset: {}, clientHeight: 0, children: [],
    style: {setProperty() {}},
    classList: {toggle() {}},
    addEventListener(name, fn) { listeners.set(name, fn); },
    setAttribute(name, value) {
      attributes.set(name, String(value));
      if (name === 'data-state') this.dataset.state = String(value);
    },
    getAttribute(name) { return attributes.get(name) ?? null; },
    replaceChildren() { this.children = []; },
    appendChild(child) { this.children.push(child); },
    click() { listeners.get('click')?.({target: this, preventDefault() {}, stopPropagation() {}}); },
  };
}

function sidebarFixture() {
  const html = fs.readFileSync(join(ui, 'sidebar.html'), 'utf8');
  const script = fs.readFileSync(join(ui, 'sidebar.js'), 'utf8');
  const page = createWebViewIina();
  const elements = new Map();
  for (const [, id] of html.matchAll(/<[^<>]+\bid="([^"]+)"[^<>]*>/g)) elements.set(id, element(id));
  const document = {
    documentElement: element(''), activeElement: null, addEventListener() {},
    getElementById: id => elements.get(id) ?? null, createElement: () => element(''),
  };
  vm.runInNewContext(script, {
    document, window: {addEventListener() {}}, iina: page.iina,
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  }, {filename: 'sidebar.js'});
  function render(behindLive, atLiveEdge) {
    page.receiveEnvelope('state', {
      title: 'Synthetic stream', source: {kind: 'twitch-live', provider: 'Twitch'}, live: true,
      behindLive, atLiveEdge, phase: 'playing',
      chat: {mode: 'off', state: 'off'},
      chatTiming: {mode: 'manual', manualDelay: 10, fineTune: 0, delay: 10, state: 'manual'},
      auth: {phase: 'off'},
      view: {presentation: 'sidebar', fontSize: 14, spacing: 4, opacity: 0.6, x: 1, y: 0},
      messages: [],
    });
    return elements.get('live-pill');
  }
  return {render, posts: page.posts};
}

test('the pill is live at the edge even with behindLive at 7', () => {
  const pill = sidebarFixture().render(7, true);
  assert.equal(pill.hidden, false);
  assert.equal(pill.dataset.state, 'live');
});

test('the pill is behind, showing the rounded gap, when not at the edge', () => {
  const pill = sidebarFixture().render(7.4, false);
  assert.equal(pill.dataset.state, 'behind');
  assert.equal(pill.textContent.replace(/\s+/g, ' '), '−7 s');
});

test('a small behindLive without atLiveEdge is still behind', () => {
  assert.equal(sidebarFixture().render(2, false).dataset.state, 'behind');
});

test('the pill is hidden when behindLive is null', () => {
  assert.equal(sidebarFixture().render(null, true).hidden, true);
});

test('clicking posts Go Live only in the behind state', () => {
  const behind = sidebarFixture();
  behind.render(9, false).click();
  assert.equal(behind.posts.filter(post => post.name === 'go-live').length, 1);
  const live = sidebarFixture();
  live.render(7, true).click();
  assert.equal(live.posts.filter(post => post.name === 'go-live').length, 0);
});
