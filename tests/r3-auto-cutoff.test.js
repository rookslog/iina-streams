'use strict';

// v0.5.5 release review r3 #2 (docs/reviews/2026-11-22-v0.5.5-release-review.md, "Reviewer output, round 3"):
// Auto still revealed chat at a frozen playhead, when chat was enabled after a pause had cost confidence and
// when a newly confident offset jumped while the playhead stood still.
//
// The invariant: Auto's reveal cutoff (the chat send time up to which rows show)
// - never advances while the playhead does not advance (paused, stalled or buffering);
// - while playing, advances at most 1.5x the playhead's advance since the last sample;
// - may move backward at once (rows already shown stay shown);
// - resyncs only on Go Live's reload, a quality reload, a source change or a mode change; since r4 #2 a seek
//   is not a resync, and a resync adopts a mapping only once two confident samples agree (r4-auto-seek).
// The mapping is sampled whether or not chat is on. Live and Manual keep their wall-clock delays.
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
const liveSource = Sources.parse('fixture_r3_cutoff');
const mediaURL = quality => `https://video-weaver.ttvnw.net/${quality}.m3u8?sig=fake-r3-cutoff-signature`;
const START_MS = Date.parse('2026-01-01T00:00:10Z');
const settle = () => new Promise(resolve => setImmediate(resolve));

// ---------------------------------------------------------------------------------------------
// chat-timing: the Auto cutoff
// ---------------------------------------------------------------------------------------------

const NOW = 10_000_000;

function sample(timing, reading) {
  return timing.revealCutoffMs(Object.assign({paused: false, offset: null, behindLive: null}, reading));
}

test('r3 #2: the first Auto sample adopts its target: the mapped playhead, else wall clock less the delay', () => {
  const mapped = createChatTiming();
  assert.equal(sample(mapped, {nowMs: NOW, timePos: 100, offset: 9000, behindLive: 9}), (100 + 9000) * 1000);
  const fallback = createChatTiming();
  fallback.effective(8);
  assert.equal(sample(fallback, {nowMs: NOW, timePos: 100}), NOW - 8000, 'no mapping: wall clock less 8 s');
});

test('r3 #2: the Auto cutoff does not advance while paused, mapped or not', () => {
  const timing = createChatTiming();
  timing.effective(8);
  const held = sample(timing, {nowMs: NOW, timePos: 100});
  assert.equal(sample(timing, {nowMs: NOW + 60_000, timePos: 100, paused: true}), held, 'wall time alone');
  timing.resyncCutoff();
  const mapped = sample(timing, {nowMs: NOW, timePos: 100, offset: 9000});
  assert.equal(sample(timing, {nowMs: NOW + 5000, timePos: 100, offset: 9030, paused: true}), mapped,
    'a newer offset at the same paused playhead');
});

test('r3 #2: a stalled playhead holds the cutoff even while not paused', () => {
  const timing = createChatTiming();
  const held = sample(timing, {nowMs: NOW, timePos: 100, offset: 9000});
  assert.equal(sample(timing, {nowMs: NOW + 5000, timePos: 100, offset: 9030}), held, '+30 s offset jump');
  assert.equal(sample(timing, {nowMs: NOW + 9000, timePos: 100, offset: 9000}), held, 'and back');
});

test('r3 #2: a backward target is taken at once, and a forward one returns only with the playhead', () => {
  const timing = createChatTiming();
  const start = sample(timing, {nowMs: NOW, timePos: 100, offset: 9000});
  const lowered = sample(timing, {nowMs: NOW + 2000, timePos: 100, offset: 8970});
  assert.equal(lowered, start - 30_000, 'a -30 s offset lowers the cutoff at once');
  assert.equal(sample(timing, {nowMs: NOW + 4000, timePos: 100, offset: 9000}), lowered, 'the +30 s return waits');
  assert.equal(sample(timing, {nowMs: NOW + 6000, timePos: 102, offset: 9000}), lowered + 3000,
    'two seconds of playhead let it catch up three');
});

test('r3 #2: while playing, the cutoff catches up at no more than 1.5x the playhead', () => {
  const timing = createChatTiming();
  const start = sample(timing, {nowMs: NOW, timePos: 100, offset: 9000});
  sample(timing, {nowMs: NOW + 1000, timePos: 100, offset: 9030});
  let cutoff = start;
  for (let step = 1; step <= 70; step++) {
    const timePos = 100 + step;
    cutoff = sample(timing, {nowMs: NOW + 1000 + step * 1000, timePos, offset: 9030});
    assert.ok(cutoff <= start + 1.5 * step * 1000, `step ${step}: ${cutoff - start} ms after ${step} s`);
  }
  assert.equal(cutoff, (170 + 9030) * 1000, 'the 30 s gap closes at 0.5 s per second, by 60 s');
});

test('r3 #2: repeated samples at one playhead never grant the catch-up twice', () => {
  const timing = createChatTiming();
  const start = sample(timing, {nowMs: NOW, timePos: 100, offset: 9000});
  sample(timing, {nowMs: NOW, timePos: 100, offset: 9030});
  const first = sample(timing, {nowMs: NOW + 1000, timePos: 101, offset: 9030});
  assert.equal(first, start + 1500);
  for (let i = 0; i < 5; i++) assert.equal(sample(timing, {nowMs: NOW + 1000, timePos: 101, offset: 9030}), first);
});

// r4 #2 edit: a resync no longer adopts the target at a still playhead; it keeps the cutoff.
test('r3 #2: a resync keeps the cutoff at a still playhead, and Live and Manual reveal by wall clock', () => {
  const timing = createChatTiming({manualDelay: 4});
  const start = sample(timing, {nowMs: NOW, timePos: 100, offset: 9000});
  assert.equal(sample(timing, {nowMs: NOW, timePos: 100, offset: 9030}), start);
  timing.resyncCutoff();
  assert.equal(sample(timing, {nowMs: NOW + 40_000, timePos: 100, offset: 9030}), start);
  timing.update({mode: 'manual'});
  assert.equal(sample(timing, {nowMs: NOW, timePos: 100, paused: true}), NOW - 4000);
  timing.update({mode: 'live'});
  assert.equal(sample(timing, {nowMs: NOW, timePos: 100, paused: true}), NOW);
});

// After a resync, a confident mapping is adopted outright once two consecutive confident samples agree while
// the playhead advances (r4 #2; it was the first one, lead amendment to r3 #2); the clamp applies until then
// and from then on. Before it, the fallback keeps r1 #7's retained delay.

// A Go Live reload from 30 s behind: the fallback holds the old 30 s delay until the estimate returns.
function reloadedFrom30sBehind() {
  const timing = createChatTiming();
  timing.effective(30);
  timing.resyncCutoff();
  timing.forgetMapping();
  let timePos = 0;
  for (let s = 0; s < 20; s += 2) {
    const cutoff = sample(timing, {nowMs: NOW + s * 1000, timePos: timePos + s});
    assert.equal(NOW + s * 1000 - cutoff, 30_000, `precondition at ${s} s: the fallback keeps the 30 s delay`);
  }
  return timing;
}

const offsetAt = (nowMs, timePos, behind) => nowMs / 1000 - behind - timePos;

// r4 #2 edit: adoption needs a second agreeing confident sample.
test('r3 #2: after a resync, a confident mapping while playing is adopted on its second agreeing sample', () => {
  const timing = reloadedFrom30sBehind();
  sample(timing, {nowMs: NOW + 20_000, timePos: 20, offset: offsetAt(NOW + 20_000, 20, 8), behindLive: 8});
  const nowMs = NOW + 21_000;
  const cutoff = sample(timing, {nowMs, timePos: 21, offset: offsetAt(nowMs, 21, 8), behindLive: 8});
  assert.equal(nowMs - cutoff, 8000, 'the lag is the estimate, 8 s, at once');
});

test('r3 #2: a first confident mapping that arrives while paused waits for the playhead, then is adopted',
  () => {
    const timing = reloadedFrom30sBehind();
    const pausedAt = NOW + 20_000;
    const held = sample(timing, {nowMs: pausedAt, timePos: 18, paused: true});
    const offset = offsetAt(pausedAt, 18, 8);
    for (let s = 0; s <= 6; s += 2) {
      const nowMs = pausedAt + s * 1000;
      assert.equal(sample(timing, {nowMs, timePos: 18, paused: true, offset, behindLive: 8 + s}), held,
        `paused ${s} s: held`);
      assert.equal(sample(timing, {nowMs, timePos: 18, offset, behindLive: 8 + s}), held,
        `stalled ${s} s: held`);
    }
    const resumedMs = pausedAt + 8000;
    const cutoff = sample(timing, {nowMs: resumedMs, timePos: 19, offset, behindLive: 15});
    assert.equal(cutoff, (19 + offset) * 1000, 'adopted once the playhead moves');
  });

test('r3 #2: once a mapping was adopted, a +30 s discontinuity while playing is still clamped', () => {
  const timing = reloadedFrom30sBehind();
  let nowMs = NOW + 20_000;
  const offset = offsetAt(nowMs, 20, 8);
  sample(timing, {nowMs: nowMs - 1000, timePos: 19, offset, behindLive: 8}); // r4 #2 edit: the first agreeing sample.
  const adopted = sample(timing, {nowMs, timePos: 20, offset, behindLive: 8});
  assert.equal(nowMs - adopted, 8000, 'precondition: the first mapping was adopted');
  nowMs += 2000;
  const cutoff = sample(timing, {nowMs, timePos: 22, offset: offset + 30, behindLive: -22});
  assert.equal(cutoff, adopted + 1.5 * 2000, 'two seconds of playhead let it advance three');
});

// ---------------------------------------------------------------------------------------------
// Player
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

// The clock: each 2 s poll the cache end advances 2 s while `buffering`, and the playhead advances 2 s
// while `playing`. While both hold, the playhead sits 6 s behind the cache end. The playlist ends
// `latency` seconds before each poll, so the estimator's offset is loadedAt/1000 - latency - 82, and a
// change of latency is a program-date-time discontinuity of the opposite sign.
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

  const clock = {cacheEnd: 82, timePos: 76, playing: true, buffering: true, latency: 3, loadedAt: 0, polls: 0};
  function stage(pollMs) {
    shim.http.setResponse({statusCode: 200, text: playlistEndingAt(pollMs, clock.latency)});
    shim.mpv.set('demuxer-cache-state', {'cache-end': clock.cacheEnd});
    shim.mpv.set('time-pos', clock.timePos);
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
    if (clock.buffering) clock.cacheEnd += 2;
    if (clock.playing) clock.timePos += 2;
    shim.timers.advance(pollMs - 1 - shim.timers.now);
    stage(pollMs);
    shim.timers.advance(1);
    await settle();
    shim.timers.advance(1000);
    await settle();
  }
  const offsetFor = latency => clock.loadedAt / 1000 - latency - 82;
  function pause(paused) {
    clock.playing = !paused;
    shim.mpv.set('pause', paused);
    shim.emit('mpv.pause.changed');
  }
  function connectChat() {
    shim.timers.advance(0); // The controller binds its auth listeners on a later turn.
    shim.sidebar.send('connect', {});
    shim.global.send('auth-ready', JSON.stringify({login: 'fixture_reader', token: 'fake_r3_cutoff_credential'}));
    shim.emit('iina.plugin-overlay-loaded');
    shim.overlay.send('overlay-ready', {});
    const config = shim.overlay.messages('live-config').at(-1);
    assert.ok(config, 'precondition: the live transport starts with a fake grant');
    const {session} = JSON.parse(decodeURIComponent(config.data.encoded));
    return messages => shim.overlay.send('live-messages', {session, messages});
  }
  const state = () => JSON.parse(decodeURIComponent(shim.sidebar.messages('state').at(-1).data.encoded));
  const shown = () => state().messages.map(m => m.id);
  return {shim, clock, load, poll, offsetFor, pause, connectChat, state, shown};
}

const row = (id, timestampMs) => ({id, timestampMs, author: 'viewer', text: 'Synthetic chat ' + id});

async function playConfident(w) {
  for (let i = 0; i < 11; i++) await w.poll();
  assert.equal(w.state().chatTiming.state, 'auto', 'precondition: Auto is confident while playing');
}

test('r3 #2: chat enabled after a pause cost confidence reveals no row the frozen video has not reached',
  async t => {
    const w = liveWindow(t);
    await w.load();
    await playConfident(w); // Chat is off throughout.
    w.pause(true);
    w.clock.buffering = false; // A paused video stops the cache end, so the samples disagree.
    for (let i = 0; i < 20 && w.state().chatTiming.state !== 'auto-uncertain'; i++) await w.poll();
    assert.equal(w.state().chatTiming.state, 'auto-uncertain', 'precondition: the pause cost the estimate');
    const retainedDelay = w.state().chatTiming.delay;
    assert.ok(retainedDelay > 0, 'precondition: Auto retained a delay');
    const frozenVideoMs = (w.clock.timePos + w.offsetFor(3)) * 1000;
    for (let i = 0; i < 10; i++) await w.poll(); // The pause goes on past the retained delay.
    assert.equal(w.state().chatTiming.state, 'auto-uncertain', 'precondition: still without confidence');

    const deliver = w.connectChat();
    const nowMs = w.shim.timers.now;
    const newer = nowMs - (retainedDelay + 1) * 1000;
    assert.ok(newer > frozenVideoMs, 'precondition: the newer row is past the frozen video time');
    assert.ok(nowMs - newer > retainedDelay * 1000, 'precondition: wall time is past its send time plus the delay');
    deliver([row('before-pause', frozenVideoMs - 5000), row('after-pause', newer)]);
    assert.deepEqual(w.shown(), ['before-pause'], 'the batch is accepted; only the row the video reached shows');
    await w.poll();
    await w.poll();
    assert.deepEqual(w.shown(), ['before-pause'], 'still held while paused');
  });

test('r3 #2: Auto with no estimate yet holds its wall-clock fallback while paused', async t => {
  const w = liveWindow(t, settingsStore({chatEnabled: false, chatTiming: {mode: 'auto', manualDelay: 3}}));
  await w.load();
  w.shim.http.setResponse({statusCode: 200, text: '#EXTM3U'}); // No program date-time: no estimate.
  const play = ms => {
    for (let left = ms; left > 0; left -= 100) {
      w.shim.mpv.set('time-pos', w.shim.mpv.props.get('time-pos') + 0.1);
      w.shim.timers.advance(100);
    }
  };
  play(3000); // Past the post-load playback-state restore, which sets pause.
  const deliver = w.connectChat();
  w.pause(true);
  const sentAt = w.shim.timers.now;
  deliver([row('paused-row', sentAt)]);
  w.shim.timers.advance(10_000);
  w.shim.sidebar.send('ready', {}); // Posts a fresh state.
  assert.equal(w.state().chatTiming.state, 'auto-uncertain', 'precondition: no estimate');
  assert.equal(w.state().chatTiming.delay, 3, 'precondition: the 3 s fallback');
  assert.equal(w.shim.mpv.props.get('pause'), true, 'precondition: still paused');
  assert.deepEqual(w.shown(), [], 'wall time past the 3 s fallback does not reveal it while paused');

  w.pause(false);
  play(1500);
  assert.deepEqual(w.shown(), [], 'not before the playhead has moved 2 s (1.5x catch-up of 3 s)');
  play(600);
  assert.deepEqual(w.shown(), ['paused-row'], 'shown once the playhead has moved far enough');
});

// Plays to a confident estimate with chat on, then stalls the playhead (not paused) while the cache and the
// playlist keep advancing together, so the estimate stays confident at a constant offset.
async function stalledWithChat(t) {
  const w = liveWindow(t);
  await w.load();
  const deliver = w.connectChat();
  await playConfident(w);
  w.clock.playing = false;
  await w.poll();
  assert.equal(w.state().chatTiming.state, 'auto', 'precondition: a stalled playhead keeps the estimate');
  const heldMs = (w.clock.timePos + w.offsetFor(3)) * 1000;
  return {w, deliver, heldMs};
}

// The video time the estimate maps the playhead to, in epoch seconds, from a state posted now.
function videoSeconds(w) {
  w.shim.sidebar.send('ready', {}); // Posts a fresh state.
  const s = w.state();
  return s.behindLive === null ? null : w.shim.timers.now / 1000 - s.behindLive;
}

// Polls with the playlist's latency changed until the estimate is confident at the new offset.
async function jumpLatency(w, latency) {
  const expected = videoSeconds(w) + (w.clock.latency - latency);
  w.clock.latency = latency;
  let video = null;
  for (let i = 0; i < 30; i++) {
    await w.poll();
    video = videoSeconds(w);
    if (w.state().chatTiming.state === 'auto' && video !== null && Math.abs(video - expected) < 1) break;
  }
  assert.equal(w.state().chatTiming.state, 'auto', 'precondition: confident again after the discontinuity');
  assert.ok(Math.abs(video - expected) < 1, `precondition: the offset moved to the new dating (${video - expected})`);
}

test('r3 #2: a +30 s offset jump at a stalled playhead reveals no row', async t => {
  const {w, deliver, heldMs} = await stalledWithChat(t);
  const nowMs = w.shim.timers.now;
  assert.ok(heldMs + 5000 < nowMs, 'precondition: the row sits between the video time and now');
  deliver([row('reached', heldMs - 2000), row('ahead', heldMs + 5000)]);
  assert.deepEqual(w.shown(), ['reached']);
  const timePos = w.clock.timePos;
  await jumpLatency(w, -27); // The playlist now dates the same cache 30 s later.
  assert.equal(w.shim.mpv.props.get('time-pos'), timePos, 'precondition: the playhead has not moved');
  assert.deepEqual(w.shown(), ['reached'], 'the jump alone reveals nothing');
});

test('r3 #2: a -30 s jump and its return at a stalled playhead reveal no row, and shown rows stay', async t => {
  const {w, deliver, heldMs} = await stalledWithChat(t);
  deliver([row('reached', heldMs - 2000)]);
  assert.deepEqual(w.shown(), ['reached']);
  await jumpLatency(w, 33); // Dated 30 s earlier: the cutoff drops at once.
  deliver([row('between', heldMs - 10_000)]);
  assert.deepEqual(w.shown(), ['reached'], 'a row below the old cutoff but above the lowered one waits');
  await jumpLatency(w, 3); // And back.
  assert.deepEqual(w.shown(), ['reached'], 'the return alone reveals nothing');
});

test('r3 #2: resuming across a +30 s jump catches up at no more than 1.5x the playhead', async t => {
  const {w, deliver, heldMs} = await stalledWithChat(t);
  const rows = [];
  for (let k = 0; k < 40; k++) rows.push(row('r' + k, heldMs + k * 1000 + 500));
  deliver(rows);
  assert.deepEqual(w.shown(), []);
  await jumpLatency(w, -27);
  assert.deepEqual(w.shown(), [], 'precondition: nothing revealed before the resume');
  const resumedAt = w.clock.timePos;
  w.clock.playing = true;
  let shownCount = 0;
  for (let i = 0; i < 20; i++) {
    await w.poll();
    const advanced = w.shim.mpv.props.get('time-pos') - resumedAt;
    const visible = w.state().messages.map(m => m.sentAt);
    const newest = visible.length ? Math.max(...visible) : -Infinity;
    assert.ok(newest <= heldMs + 1.5 * advanced * 1000,
      `poll ${i}: newest row ${newest - heldMs} ms past the held cutoff after ${advanced} s of playhead`);
    shownCount = visible.length;
  }
  assert.ok(shownCount > 0, 'rows appear once the playhead moves');
});

test('r3 #2: an ordinary pause and resume keeps 0/0/0/1 at a continuous playhead', async t => {
  const w = liveWindow(t);
  await w.load();
  const deliver = w.connectChat();
  await playConfident(w);
  const cutoffMs = (w.clock.timePos + w.offsetFor(3)) * 1000;
  deliver([row('ahead', cutoffMs + 3000)]);
  const counts = [w.shown().length];
  w.pause(true);
  w.clock.buffering = false;
  await w.poll();
  await w.poll();
  counts.push(w.shown().length);
  w.pause(false);
  w.clock.buffering = true;
  await w.poll(); // The playhead moves 2 s: below the row.
  counts.push(w.shown().length);
  await w.poll(); // 4 s: past it.
  counts.push(w.shown().length);
  assert.deepEqual(counts, [0, 0, 0, 1]);
});

test('r3 #2: after a quality reload, the first confident mapping is adopted at once, not caught up at 1.5x',
  async t => {
    const w = liveWindow(t);
    w.clock.latency = 24; // About 30 s behind live: 24 s of playlist latency plus 6 s of buffer.
    await w.load();
    const deliver = w.connectChat();
    await playConfident(w);
    assert.ok(Math.abs(w.state().chatTiming.delay - 30) <= 1, `precondition: ~30 s behind (${w.state().chatTiming.delay})`);

    // A quality reload: the player stages it, then IINA loads the marked URL on a fresh file timeline.
    w.shim.sidebar.send('change-quality', 'auto720');
    await settle();
    const reloadURL = liveSource.url + '#streams-generation=1';
    assert.ok(w.shim.mpv.commands.some(([name, args]) => name === 'loadfile' && args[0] === reloadURL),
      'precondition: the reload was issued');
    Object.assign(w.clock, {cacheEnd: 82, timePos: 76, latency: 2, loadedAt: w.shim.timers.now, polls: 0});
    w.shim.mpv.set('path', reloadURL);
    await w.shim.mpv.runHook('on_load', () => {});
    w.shim.emit('iina.file-loaded', reloadURL);
    await settle();

    // The estimate returns at about 8 s behind while the video plays.
    for (let i = 0; i < 20 && w.state().chatTiming.state !== 'auto'; i++) await w.poll();
    assert.equal(w.state().chatTiming.state, 'auto', 'precondition: confident again after the reload');
    assert.ok(Math.abs(w.state().behindLive - 8) <= 1, `precondition: ~8 s behind (${w.state().behindLive})`);
    // This fixture moves the playhead 2 s per poll, so the first confident sample can fall on a status tick
    // with no playhead advance since the last one. Adoption waits for an advancing sample: one more poll.
    // Each poll's new estimate lands on a tick with no playhead advance, so the agreeing estimate of that poll
    // only corroborates; the next poll's advancing tick adopts (v0.5.5 review r5 #3): a second poll.
    const before = w.shim.mpv.props.get('time-pos');
    await w.poll();
    await w.poll();
    assert.ok(w.shim.mpv.props.get('time-pos') > before, 'precondition: the playhead advanced');
    const nowMs = w.shim.timers.now;
    deliver([row('ten-back', nowMs - 10_000), row('six-back', nowMs - 6000)]);
    assert.deepEqual(w.shown(), ['ten-back'], 'the cutoff is at the new mapping, about 8 s behind, at once');
  });
