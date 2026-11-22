'use strict';

// v0.5.5 release review r2 #2 (docs/reviews/2026-11-22-v0.5.5-release-review.md, "Reviewer output, round 2"):
// in Auto, live chat is revealed by the video's position, not by the wall clock. The reveal point is the
// playhead mapped to wall-clock time (the estimator's offset), minus the fine tune. When the video stops,
// that point stops. When confidence is lost, the last confident offset still maps the current playhead.
// Manual and Live keep their wall-clock delays.
//
// The player runs under the shared shim with the real live clock and estimator. Playlists and the demuxer
// cache are synthetic; no test contacts Twitch.

const test = require('node:test');
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {createRequire} = require('node:module');
const Sources = require('../src/source.js');
const {createChatTiming} = require('../src/chat-timing.js');
const {createIina} = require('./support/iina-shim.js');

const playerPath = join(__dirname, '../src/player.js');
const requireFromPlayer = createRequire(playerPath);
const liveSource = Sources.parse('fixture_r2_auto');
const mediaURL = quality => `https://media.invalid/${quality}.m3u8?sig=fake-r2-auto-signature`;
const START_MS = Date.parse('2026-01-01T00:00:10Z');
const settle = () => new Promise(resolve => setImmediate(resolve));

// ---------------------------------------------------------------------------------------------
// chat-timing: the Auto reveal clock
// ---------------------------------------------------------------------------------------------

test('r2 #2: the Auto clock is the playhead mapped by the offset, minus the fine tune', () => {
  const timing = createChatTiming({fineTune: 1.5});
  const now = 2_000_000;
  assert.equal(timing.autoClockMs({nowMs: now, timePos: 100, offset: 1800}), (100 + 1800 - 1.5) * 1000);
});

test('r2 #2: the Auto clock never passes the wall clock', () => {
  const timing = createChatTiming({fineTune: -3});
  assert.equal(timing.autoClockMs({nowMs: 1_000_000, timePos: 999, offset: 0}), 1_000_000);
});

test('r2 #2: without confidence the last offset maps the current playhead, so a frozen playhead holds', () => {
  const timing = createChatTiming();
  const now = 5_000_000;
  timing.autoClockMs({nowMs: now, timePos: 134, offset: 4000});
  const frozen = timing.autoClockMs({nowMs: now + 60_000, timePos: 134, offset: null});
  assert.equal(frozen, (134 + 4000) * 1000, 'a stopped video does not advance the clock');
  assert.equal(timing.autoClockMs({nowMs: now + 61_000, timePos: 140, offset: null}), (140 + 4000) * 1000);
});

test('r2 #2: no clock before any confident offset, outside Auto, or after the timeline is forgotten', () => {
  const timing = createChatTiming();
  assert.equal(timing.autoClockMs({nowMs: 1000, timePos: 10, offset: null}), null, 'before any offset');
  timing.update({mode: 'manual'});
  assert.equal(timing.autoClockMs({nowMs: 1000, timePos: 10, offset: 5}), null, 'Manual reveals by wall clock');
  timing.update({mode: 'live'});
  assert.equal(timing.autoClockMs({nowMs: 1000, timePos: 10, offset: null}), null, 'Live reveals by wall clock');
  timing.update({mode: 'auto'});
  assert.equal(timing.autoClockMs({nowMs: 100_000, timePos: 10, offset: null}), 15_000,
    'an offset seen in another mode still maps the timeline');
  timing.forgetMapping();
  assert.equal(timing.autoClockMs({nowMs: 100_000, timePos: 10, offset: null}), null,
    'a new file timeline drops the old offset');
  assert.equal(timing.autoClockMs({nowMs: 100_000, timePos: Number.NaN, offset: 5}), null, 'no playhead');
});

// ---------------------------------------------------------------------------------------------
// Player: the reviewer's case
// ---------------------------------------------------------------------------------------------

function settingsStore(initial = {}) {
  let value = initial;
  return {readSettings: () => structuredClone(value), saveSettings: next => { value = structuredClone(next); }};
}

// A live playlist whose newest segment ends `latency` seconds before `nowMs`.
function playlistEndingAt(nowMs, latency) {
  const pdt = new Date(nowMs - (latency + 2) * 1000).toISOString();
  return ['#EXTM3U', '#EXT-X-PROGRAM-DATE-TIME:' + pdt, '#EXTINF:2.000,', 'segment.ts'].join('\n');
}

function liveWindow(t, settings = settingsStore({chatEnabled: false})) {
  const shim = createIina({
    label: Sources.label(liveSource, 'unified'),
    mpv: {path: liveSource.url, 'time-pos': 76, speed: 1, pause: false},
  });
  shim.timers.advance(START_MS);
  // IINA 1.5.1 JavascriptAPIMpv exposes getNative; the shared shim does not model it.
  shim.iina.mpv.getNative = property => shim.mpv.props.get(property) ?? null;
  const module = {exports: {}};
  shim.runScript(playerPath, {globals: {module, Date: shim.timers.Date}, require: requireFromPlayer});
  module.exports.start(shim.iina, {variant: 'unified'}, {
    ...settings,
    async resolve(_source, quality) {
      const concrete = quality === 'auto720' ? '720p60' : quality;
      return {
        ok: true, title: 'Synthetic stream', live: true, quality: concrete,
        mediaURL: mediaURL(concrete), formats: [{id: '720p60', label: '720p60'}],
      };
    },
  });
  t.after(() => shim.emit('iina.window-will-close'));
  shim.sidebar.send('ready', {});

  // The playlist ends 3 s before each poll. While playing, the cache end advances 2 s per 2 s poll and
  // the playhead sits 6 s behind it, so the estimator's offset is constant: loadedAt/1000 - 3 - 82.
  const clock = {cacheEnd: 82, playing: true, loadedAt: 0, polls: 0};
  function stage(pollMs) {
    shim.http.setResponse({statusCode: 200, text: playlistEndingAt(pollMs, 3)});
    shim.mpv.set('demuxer-cache-state', {'cache-end': clock.cacheEnd});
    if (clock.playing) shim.mpv.set('time-pos', clock.cacheEnd - 6);
  }
  async function load() {
    clock.loadedAt = shim.timers.now;
    stage(clock.loadedAt);
    shim.mpv.set('path', liveSource.url);
    await shim.mpv.runHook('on_load', () => {});
    shim.emit('iina.file-loaded', liveSource.url); // The clock samples at once.
    shim.emit('iina.window-size-adjusted');
    await settle();
  }
  // The next 2 s poll, then the player's 1 s status ticks up to just before the poll after it.
  async function poll() {
    clock.polls += 1;
    const pollMs = clock.loadedAt + 2000 * clock.polls;
    if (clock.playing) clock.cacheEnd += 2;
    shim.timers.advance(pollMs - 1 - shim.timers.now);
    stage(pollMs);
    shim.timers.advance(1);
    await settle();
    shim.timers.advance(1000);
    await settle();
  }
  const offset = () => clock.loadedAt / 1000 - 3 - 82;
  function connectChat() {
    shim.timers.advance(0); // The controller binds its auth listeners on a later turn.
    shim.sidebar.send('connect', {});
    shim.global.send('auth-ready', JSON.stringify({login: 'fixture_reader', token: 'fake_r2_auto_credential'}));
    shim.emit('iina.plugin-overlay-loaded');
    shim.overlay.send('overlay-ready', {});
    const config = shim.overlay.messages('live-config').at(-1);
    assert.ok(config, 'precondition: the live transport starts with a fake grant');
    const {session} = JSON.parse(decodeURIComponent(config.data.encoded));
    return messages => shim.overlay.send('live-messages', {session, messages});
  }
  const state = () => JSON.parse(decodeURIComponent(shim.sidebar.messages('state').at(-1).data.encoded));
  const shown = () => state().messages.map(m => m.id);
  return {shim, clock, load, poll, offset, connectChat, state, shown};
}

// Plays to a confident Auto estimate, then pauses: the playhead and cache end stop while the playlist
// keeps advancing, so the samples disagree and confidence is lost. Returns the frozen playhead.
async function pausedPastConfidence(w) {
  for (let i = 0; i < 11; i++) await w.poll();
  assert.equal(w.state().chatTiming.state, 'auto', 'precondition: Auto is confident while playing');
  w.clock.playing = false;
  w.shim.mpv.set('pause', true);
  w.shim.emit('mpv.pause.changed');
  for (let i = 0; i < 20 && w.state().chatTiming.state !== 'auto-uncertain'; i++) await w.poll();
  assert.equal(w.state().chatTiming.state, 'auto-uncertain', 'precondition: the pause cost the estimate');
  return w.shim.mpv.props.get('time-pos');
}

test('r2 #2: paused past confidence loss, a newer row stays hidden by wall time and shows at its playhead',
  async t => {
    const w = liveWindow(t);
    await w.load();
    const deliver = w.connectChat();
    const frozen = await pausedPastConfidence(w);
    const retainedDelay = w.state().chatTiming.delay;
    assert.ok(retainedDelay > 0, 'precondition: Auto retained a delay');
    const frozenVideoMs = (frozen + w.offset()) * 1000;
    const sentAt = w.shim.timers.now;
    assert.ok(sentAt > frozenVideoMs, 'precondition: the row was sent after the frozen video time');
    deliver([{id: 'after-frozen', timestampMs: sentAt, author: 'viewer', text: 'Synthetic chat'}]);
    assert.deepEqual(w.shown(), [], 'held at arrival');

    while (w.shim.timers.now < sentAt + (retainedDelay + 5) * 1000) await w.poll();
    assert.equal(w.state().chatTiming.state, 'auto-uncertain', 'precondition: still without confidence');
    assert.equal(w.shim.mpv.props.get('time-pos'), frozen, 'precondition: the playhead has not moved');
    assert.deepEqual(w.shown(), [], 'wall time past the retained delay does not reveal it while paused');

    // Resume. The cache end stays where it was, so the estimate stays unconfident and only the
    // retained offset maps the moving playhead.
    w.shim.mpv.set('pause', false);
    w.shim.emit('mpv.pause.changed');
    const reachesRow = sentAt / 1000 - w.offset();
    w.shim.mpv.set('time-pos', reachesRow - 0.5);
    await w.poll();
    assert.equal(w.state().chatTiming.state, 'auto-uncertain');
    assert.deepEqual(w.shown(), [], 'hidden until the playhead reaches it');
    w.shim.mpv.set('time-pos', reachesRow + 0.25);
    await w.poll();
    assert.deepEqual(w.shown(), ['after-frozen'], 'shown once the playhead reaches its send time');
  });

test('r2 #2: Manual keeps its wall-clock delay while the video is paused', async t => {
  const w = liveWindow(t, settingsStore({chatEnabled: false, chatTiming: {mode: 'manual', manualDelay: 3}}));
  await w.load();
  const deliver = w.connectChat();
  for (let i = 0; i < 11; i++) await w.poll();
  w.shim.mpv.set('pause', true);
  w.shim.emit('mpv.pause.changed');
  const sentAt = w.shim.timers.now;
  deliver([{id: 'manual-row', timestampMs: sentAt, author: 'viewer', text: 'Synthetic chat'}]);
  w.shim.timers.advance(2900);
  assert.deepEqual(w.shown(), [], 'held by the 3 s delay');
  w.shim.timers.advance(100);
  assert.deepEqual(w.shown(), ['manual-row'], 'revealed at its send time plus 3 s with the video paused');
});

test('r2 #2: Live shows rows at once while the video is paused', async t => {
  const w = liveWindow(t, settingsStore({chatEnabled: false, chatTiming: {mode: 'live'}}));
  await w.load();
  const deliver = w.connectChat();
  w.shim.mpv.set('pause', true);
  w.shim.emit('mpv.pause.changed');
  deliver([{id: 'live-row', timestampMs: w.shim.timers.now, author: 'viewer', text: 'Synthetic chat'}]);
  assert.deepEqual(w.shown(), ['live-row']);
});
