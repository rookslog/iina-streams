'use strict';

// C2b/C3 parts the lead's C3 tests do not pin (#2, #28, #51):
// - the sidebar's chat timing row (segmented Auto | Manual | Live, a stepper, the Auto hollow dot);
// - #28 ⌥-click calibration, both the sidebar message and the player's handling of it;
// - the real live clock becoming confident through the player, which the C3 tests never reach;
// - the disabled menu items.
// Bridge contracts added here: the sidebar posts 'chat-calibrate' with {id}; message rows carry data-id.
// No test contacts Twitch; transport URLs use .invalid.

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
const liveSource = Sources.parse('fixture_c3_extra');
const vodSource = Sources.parse('https://www.twitch.tv/videos/88888888888888888888');
const mediaURL = quality => `https://media.invalid/${quality}.m3u8?sig=fake-c3-extra-signature`;
const START_MS = Date.parse('2026-01-01T00:00:10Z');

const settle = () => new Promise(resolve => setImmediate(resolve));

// ---------------------------------------------------------------------------------------------
// Sidebar page
// ---------------------------------------------------------------------------------------------

// A minimal DOM node: enough for sidebar.js's render path and the click handlers under test.
function element(id = '') {
  const listeners = new Map();
  const attributes = new Map();
  return {
    id, hidden: false, value: '', title: '', textContent: '', dataset: {}, style: {setProperty() {}},
    children: [], parentNode: null, clientHeight: 0, scrollHeight: 0, scrollTop: 0,
    classList: {toggle() {}},
    addEventListener(name, fn) { listeners.set(name, fn); },
    dispatch(name, event) { listeners.get(name)?.(event); },
    setAttribute(name, value) {
      attributes.set(name, String(value));
      if (name === 'data-state') this.dataset.state = String(value);
    },
    getAttribute(name) { return attributes.get(name) ?? null; },
    replaceChildren() { this.children = []; },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    append(...nodes) { for (const node of nodes) this.appendChild(node); },
  };
}

function sidebarPage() {
  const html = fs.readFileSync(join(ui, 'sidebar.html'), 'utf8');
  const page = createWebViewIina();
  const elements = new Map();
  for (const [tag, id] of html.matchAll(/<[^<>]+\bid="([^"]+)"[^<>]*>/g)) {
    const node = element(id);
    node.hidden = /\s+hidden(?:\s|=|>)/.test(tag);
    elements.set(id, node);
  }
  const pendingTimers = [];
  const document = {
    documentElement: element(), activeElement: null, addEventListener() {},
    getElementById: id => elements.get(id) ?? null,
    createElement: () => element(),
  };
  vm.runInNewContext(fs.readFileSync(join(ui, 'sidebar.js'), 'utf8'), {
    document, iina: page.iina, window: {addEventListener() {}},
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    setTimeout: fn => pendingTimers.push(fn),
  }, {filename: 'sidebar.js'});

  function render({kind = 'twitch-live', chatMode = 'live', timing, messages = []} = {}) {
    page.receiveEnvelope('state', {
      title: 'Synthetic stream', source: {kind, provider: 'Twitch'}, live: kind === 'twitch-live',
      behindLive: null, phase: 'playing', formats: [], quality: 'auto720',
      chat: {mode: chatMode, state: chatMode === 'off' ? 'off' : 'connected'},
      chatTiming: timing, auth: {phase: 'off'},
      view: {presentation: 'sidebar', fontSize: 14, spacing: 4, opacity: 0.6, x: 1, y: 0},
      messages,
    });
    // A render that threw part-way is swallowed by the page's message wrapper. The message list
    // renders last, so its rows prove the whole render ran.
    assert.equal(elements.get('messages').children.length, messages.length, 'the render reached the messages');
  }

  const $ = id => {
    const node = elements.get(id);
    assert.ok(node, `sidebar.html has #${id}`);
    return node;
  };
  const postsNamed = name => page.posts.filter(post => post.name === name).map(post => post.data);
  return {render, $, postsNamed, pendingTimers};
}

const timing = (mode, extra = {}) => ({
  mode, manualDelay: 10, fineTune: 0, delay: mode === 'live' ? 0 : 10,
  state: mode === 'auto' ? 'auto' : mode, ...extra,
});

test('timing row: the segmented control reflects the mode and the stepper the value it edits', () => {
  const {render, $} = sidebarPage();
  render({timing: timing('manual', {manualDelay: 12.5})});
  assert.equal($('timing-settings').hidden, false, 'shown for Twitch live');
  const checked = () => ['auto', 'manual', 'live'].map(mode => $('timing-' + mode).getAttribute('aria-checked'));
  assert.deepEqual(checked(), ['false', 'true', 'false']);
  assert.equal($('timing-stepper').hidden, false);
  assert.equal($('timing-value').textContent, '12.5 s', 'Manual edits the delay');

  render({timing: timing('auto', {fineTune: -1.5})});
  assert.deepEqual(checked(), ['true', 'false', 'false']);
  assert.equal($('timing-value').textContent, '−1.5 s', 'Auto edits the signed fine tune');

  render({timing: timing('live')});
  assert.deepEqual(checked(), ['false', 'false', 'true']);
  assert.equal($('timing-stepper').hidden, true, 'Live has no delay to step');

  render({kind: 'twitch-vod', chatMode: 'off', timing: timing('manual')});
  assert.equal($('timing-settings').hidden, true, 'VOD replay keeps its own offset control');
});

test('timing row: segments post the mode; the stepper posts 0.5 s steps of the edited value', () => {
  const {render, $, postsNamed} = sidebarPage();
  render({timing: timing('manual', {manualDelay: 10, fineTune: 2})});
  $('timing-auto').dispatch('click', {});
  $('timing-live').dispatch('click', {});
  $('timing-more').dispatch('click', {});
  render({timing: timing('auto', {manualDelay: 10, fineTune: 2})});
  $('timing-less').dispatch('click', {});
  render({timing: timing('live')});
  $('timing-more').dispatch('click', {});
  assert.deepEqual(postsNamed('chat-timing'), [
    {mode: 'auto'}, {mode: 'live'}, {manualDelay: 10.5}, {fineTune: 1.5},
  ], 'Live posts no step');
});

test('Auto-uncertain shows a hollow dot with a tooltip; confident Auto a filled one; Manual none', () => {
  const {render, $} = sidebarPage();
  render({timing: timing('auto', {state: 'auto-uncertain'})});
  assert.equal($('timing-dot').hidden, false);
  assert.equal($('timing-dot').dataset.state, 'uncertain');
  assert.ok($('timing-dot').title.length > 0, 'the uncertainty is explained on hover, not in the row');
  assert.equal($('timing-dot').textContent, '', 'the dot is a signifier, not text');
  render({timing: timing('auto')});
  assert.equal($('timing-dot').dataset.state, 'synced');
  render({timing: timing('manual')});
  assert.equal($('timing-dot').hidden, true);
  assert.equal($('timing-manual').getAttribute('aria-checked'), 'true', 'Manual stays selectable');
});

const chatRow = {id: 'm-1', sentAt: START_MS, author: 'viewer', text: 'Synthetic chat', kind: 'message'};

test('#28: ⌥-click on a live message in Manual posts chat-calibrate and flashes the row', () => {
  const {render, $, postsNamed, pendingTimers} = sidebarPage();
  render({timing: timing('manual'), messages: [chatRow]});
  const messages = $('messages');
  assert.equal(messages.dataset.calibrating, 'true', 'Manual live chat is marked as calibratable');
  const [row] = messages.children;
  assert.equal(row.dataset.id, 'm-1');
  const text = row.children.at(-1);
  let prevented = 0;
  messages.dispatch('click', {target: text, altKey: false, preventDefault() { prevented++; }});
  assert.deepEqual(postsNamed('chat-calibrate'), [], 'a plain click does not calibrate');
  messages.dispatch('click', {target: text, altKey: true, preventDefault() { prevented++; }});
  assert.deepEqual(postsNamed('chat-calibrate'), [{id: 'm-1'}]);
  assert.equal(prevented, 1);
  assert.equal(row.dataset.calibrated, 'true', 'the row flashes');
  pendingTimers.forEach(fn => fn());
  assert.equal(row.dataset.calibrated, 'false', 'and the flash ends');
});

test('#28: ⌥-click does nothing outside Manual live chat', () => {
  const {render, $, postsNamed} = sidebarPage();
  render({timing: timing('auto'), messages: [chatRow]});
  assert.equal($('messages').dataset.calibrating, 'false');
  $('messages').dispatch('click', {target: $('messages').children[0], altKey: true, preventDefault() {}});
  render({timing: timing('manual'), chatMode: 'replay', messages: [{...chatRow, sentAt: 0, time: 5}]});
  $('messages').dispatch('click', {target: $('messages').children[0], altKey: true, preventDefault() {}});
  assert.deepEqual(postsNamed('chat-calibrate'), []);
});

// ---------------------------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------------------------

function settingsStore(initial = {}) {
  let value = initial;
  return {readSettings: () => structuredClone(value), saveSettings: next => { value = structuredClone(next); }};
}

function playerFixture(t, {source = liveSource, settings = settingsStore({chatEnabled: false})} = {}) {
  const traces = [];
  const shim = createIina({
    label: Sources.label(source, 'unified'),
    mpv: {path: source.url, 'time-pos': 40, speed: 1, duration: 300, pause: false},
  });
  shim.timers.advance(START_MS);
  shim.http.setResponse({statusCode: 200, text: '#EXTM3U'});
  // IINA 1.5.1 JavascriptAPIMpv exposes getNative; the shared shim does not model it.
  shim.iina.mpv.getNative = property => shim.mpv.props.get(property) ?? null;
  shim.mpv.set('demuxer-cache-state', {'cache-end': 82});
  const module = {exports: {}};
  shim.runScript(playerPath, {globals: {module, Date: shim.timers.Date}, require: requireFromPlayer});
  const controller = module.exports.start(shim.iina, {variant: 'unified'}, {
    ...settings,
    trace: (name, data) => traces.push([name, data]),
    async resolve(_source, quality) {
      const concrete = quality === 'auto720' ? '720p60' : quality;
      return {
        ok: true, title: 'Synthetic stream', live: source.kind === 'twitch-live', quality: concrete,
        mediaURL: mediaURL(concrete), formats: [{id: '720p60', label: '720p60'}],
      };
    },
  });
  t.after(() => shim.emit('iina.window-will-close'));
  shim.sidebar.send('ready', {});

  async function load(path = source.url) {
    shim.mpv.set('path', path);
    await shim.mpv.runHook('on_load', () => {});
    shim.emit('iina.file-loaded', path);
    shim.emit('iina.window-size-adjusted');
    await settle();
    shim.timers.advance(600);
    await settle();
  }

  function connectChat() {
    shim.sidebar.send('connect', {});
    shim.global.send('auth-ready', JSON.stringify({login: 'fixture_reader', token: 'fake_c3_extra_credential'}));
    shim.emit('iina.plugin-overlay-loaded');
    shim.overlay.send('overlay-ready', {});
    const config = shim.overlay.messages('live-config').at(-1);
    assert.ok(config, 'the live transport starts with a fake grant');
    const {session} = JSON.parse(decodeURIComponent(config.data.encoded));
    return messages => shim.overlay.send('live-messages', {session, messages});
  }

  const state = () => JSON.parse(decodeURIComponent(shim.sidebar.messages('state').at(-1).data.encoded));
  return {shim, controller, traces, settings, load, connectChat, state};
}

// A live playlist whose newest segment ends `latency` seconds before `nowMs`.
function playlistEndingAt(nowMs, latency) {
  const pdt = new Date(nowMs - (latency + 2) * 1000).toISOString();
  return ['#EXTM3U', '#EXT-X-PROGRAM-DATE-TIME:' + pdt, '#EXTINF:2.000,', 'segment.ts'].join('\n');
}

test('the real live clock becomes confident through the player and the state follows without chat', async t => {
  const {shim, load, state} = playerFixture(t);
  // Every sample: playlist end = now − 3 s, cache-end advancing with time, time-pos 6 s behind the cache end.
  // c_hat = (now − 3) − cacheEnd, so behind = now − (cacheEnd − 6 + c_hat) = 9 s.
  // live-clock keeps the time-pos read at the last sample, so one second after a sample it reports 9 + 1 s.
  let cacheEnd = 82;
  const stage = pollMs => {
    shim.http.setResponse({statusCode: 200, text: playlistEndingAt(pollMs, 3)});
    shim.mpv.set('demuxer-cache-state', {'cache-end': cacheEnd});
    shim.mpv.set('time-pos', cacheEnd - 6);
  };
  const loadedAt = shim.timers.now;
  stage(loadedAt);
  await load(); // Sample 1 at loadedAt.
  const published = [];
  for (let poll = 1; poll < 12; poll++) {
    const pollMs = loadedAt + 2000 * poll;
    cacheEnd += 2;
    shim.timers.advance(pollMs - 1 - shim.timers.now);
    stage(pollMs);
    shim.timers.advance(1); // The poll fires; its response is handled on the next turn.
    await settle();
    shim.timers.advance(1000); // Only the player's status tick runs here: no chat, no mpv event.
    published.push(state().behindLive);
  }
  assert.equal(shim.http.calls.length, 12, 'one poll per 2 s');
  const firstConfident = published.findIndex(value => value !== null);
  assert.equal(firstConfident, 8, `confident from the tenth sample, not before: ${JSON.stringify(published)}`);
  for (const value of published.slice(firstConfident)) assert.ok(Math.abs(value - 10) < 1e-6, String(value));
  const {chatTiming} = state();
  assert.equal(chatTiming.state, 'auto', 'Auto uses the estimate once confident');
  assert.ok(Math.abs(chatTiming.delay - 10) < 1e-6);
});

test('#28: chat-calibrate in Manual sets the delay to the clicked message age and persists it', async t => {
  const settings = settingsStore({chatEnabled: false, chatTiming: {mode: 'manual', manualDelay: 5}});
  const {shim, load, connectChat, state} = playerFixture(t, {settings});
  await load();
  const deliver = connectChat();
  const sentAt = shim.timers.now;
  deliver([
    {id: 'chat-1', timestampMs: sentAt, author: 'viewer', text: 'Synthetic chat'},
    {id: 'notice-1', kind: 'notice', text: 'Synthetic notice'},
  ]);
  assert.deepEqual(state().messages.map(m => m.id), ['notice-1'], 'held by the 5 s delay');
  shim.timers.advance(7250);
  assert.deepEqual(state().messages.map(m => m.id), ['chat-1', 'notice-1'], 'shown, so the viewer can click it');
  shim.sidebar.send('chat-calibrate', {id: 'notice-1'});
  assert.equal(state().chatTiming.manualDelay, 5, 'an untimed notice cannot calibrate');
  shim.sidebar.send('chat-calibrate', {id: 'chat-1'});
  assert.deepEqual(settings.readSettings().chatTiming, {mode: 'manual', manualDelay: 7.5, fineTune: 0},
    '7.25 s rounds to the 0.5 s step');
  assert.equal(state().chatTiming.delay, 7.5);
  assert.deepEqual(state().messages.map(m => m.id), ['chat-1', 'notice-1'], 'a shown message is never un-shown');
});

test('#28: chat-calibrate is ignored outside Manual', async t => {
  const settings = settingsStore({chatEnabled: false, chatTiming: {mode: 'auto', manualDelay: 4}});
  const {shim, load, connectChat, state} = playerFixture(t, {settings});
  await load();
  connectChat()([{id: 'chat-1', timestampMs: shim.timers.now, author: 'viewer', text: 'Synthetic chat'}]);
  shim.timers.advance(2000);
  shim.sidebar.send('chat-calibrate', {id: 'chat-1'});
  assert.equal(state().chatTiming.mode, 'auto');
  assert.deepEqual(settings.readSettings().chatTiming, {mode: 'auto', manualDelay: 4}, 'nothing saved');
});

test('menu: Beside Video is enabled (D1), and Go Live is disabled outside Twitch live', t => {
  const live = playerFixture(t);
  const [, liveGo, liveChat] = live.shim.menu.items;
  assert.equal(liveGo.enabled, true);
  assert.equal(liveChat.items.find(item => item.title === 'Beside Video').enabled, true);
  const vod = playerFixture(t, {source: vodSource});
  assert.equal(vod.shim.menu.items[1].enabled, false);
});

test('Go Live reload: the old file ending is part of the reload, not a stop', async t => {
  const {shim, controller, load, state} = playerFixture(t);
  await load(); // The playlist has no program date-time, so the target is unknown: reload.
  await shim.sidebar.receive('go-live', {});
  await settle();
  const [[name, [replacement]]] = shim.mpv.commands;
  assert.equal(name, 'loadfile');
  // mpv ends the playing file when loadfile replaces it; the shim does not emit this by itself.
  shim.emit('mpv.end-file');
  assert.notEqual(controller.snapshot().phase, 'stopped', 'the replaced file ending is not a stop');
  await load(replacement);
  shim.timers.advance(3000);
  await settle();
  assert.equal(controller.snapshot().phase, 'playing');
  assert.equal(state().phase, 'playing', 'the sidebar does not show Playback stopped');
  assert.equal(shim.http.calls.at(-1).url, mediaURL('720p60'), 'the reloaded playlist is polled');
  // A later end of the reloaded file is a real stop.
  shim.emit('mpv.end-file');
  assert.equal(controller.snapshot().phase, 'stopped');
});

test('Go Live does nothing for a VOD and the VOD never polls', async t => {
  const {shim, load} = playerFixture(t, {source: vodSource});
  await load();
  await shim.sidebar.receive('go-live', {});
  assert.deepEqual(shim.mpv.commands.filter(([name]) => name === 'seek' || name === 'loadfile'), []);
  assert.deepEqual(shim.http.calls, []);
  assert.equal(JSON.parse(decodeURIComponent(shim.sidebar.messages('state').at(-1).data.encoded)).behindLive, null);
});
