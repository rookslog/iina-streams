'use strict';

// v0.5.5 release review r4 #2 (docs/reviews/2026-11-22-v0.5.5-release-review.md, "Reviewer output, round 4",
// and the lead's round-4 disposition): a seek resync bypassed the paused hold and the rate cap, and the first
// confident sample after a resync was adopted outright.
//
// The rule now:
// - A seek is not a resync point. Within one file the playhead-to-chat offset does not change across a seek,
//   so the 1.5x cap, computed on the playhead's own change (a seek's jump included), follows it. A paused
//   no-op seek moves nothing; backward is free.
// - A timeline change (reload, new file, mode change) resyncs into "awaiting". The prior cutoff is kept.
//   A mapping is adopted outright only when two consecutive confident samples agree within 1 s while the
//   playhead advances; until then the clamp applies.
//
// chat-timing runs directly; the player runs under the shared shim with the real live clock and estimator.
// Playlists and the demuxer cache are synthetic; no test contacts Twitch.

const test = require('node:test');
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {createRequire} = require('node:module');
const Sources = require('../src/source.js');
const {createChatTiming} = require('../src/chat-timing.js');
const {createIina} = require('./support/iina-shim.js');

const playerPath = join(__dirname, '../src/player.js');
const requireFromPlayer = createRequire(playerPath);
const liveSource = Sources.parse('fixture_r4_seek');
const mediaURL = quality => `https://video-weaver.ttvnw.net/${quality}.m3u8?sig=fake-r4-seek-signature`;
const START_MS = Date.parse('2026-01-01T00:00:10Z');
const settle = () => new Promise(resolve => setImmediate(resolve));

// ---------------------------------------------------------------------------------------------
// chat-timing
// ---------------------------------------------------------------------------------------------

const NOW = 10_000_000;

function sample(timing, reading) {
  return timing.revealCutoffMs(Object.assign({paused: false, offset: null, behindLive: null}, reading));
}

// A timing that has been playing at offset 9000 up to playhead 100, with its cutoff at the mapping.
function playingAt100() {
  const timing = createChatTiming();
  sample(timing, {nowMs: NOW - 2000, timePos: 98, offset: 9000});
  const cutoff = sample(timing, {nowMs: NOW, timePos: 100, offset: 9000});
  assert.equal(cutoff, (100 + 9000) * 1000, 'precondition: the cutoff is at the mapping');
  return timing;
}

test('r4 #2: the reviewer probe: a resync at the same paused playhead with a shifted offset reveals nothing',
  () => {
    // The round-4 probe verbatim. A seek no longer resyncs, and even a resync now keeps the cutoff.
    const timing = createChatTiming();
    const reading = {nowMs: 9_200_000, timePos: 100, paused: true};
    const a = timing.revealCutoffMs({...reading, offset: 9000});
    const b = timing.revealCutoffMs({...reading, offset: 9030});
    timing.resyncCutoff();
    const c = timing.revealCutoffMs({...reading, offset: 9030});
    assert.deepEqual([a, b, c], [9_100_000, 9_100_000, 9_100_000], 'it was 9 100 000, 9 100 000, 9 130 000');
  });

test('r4 #2: a forward seek of 60 s while playing lets the cutoff follow the jump, at most 1.5x of it', () => {
  const timing = playingAt100();
  const before = (100 + 9000) * 1000;
  const followed = sample(timing, {nowMs: NOW + 100, timePos: 160, offset: 9000});
  assert.equal(followed, before + 60_000, 'the same offset at the new playhead: the cutoff follows 60 s');

  const shifted = playingAt100();
  const capped = sample(shifted, {nowMs: NOW + 100, timePos: 160, offset: 9060});
  assert.equal(capped, before + 90_000, 'a +60 s offset as well: capped at 1.5 x 60 s');
});

test('r4 #2: a backward seek moves the cutoff back at once', () => {
  const timing = playingAt100();
  assert.equal(sample(timing, {nowMs: NOW + 100, timePos: 40, offset: 9000}), (40 + 9000) * 1000);
  assert.equal(sample(timing, {nowMs: NOW + 100, timePos: 40, offset: 9000, paused: true}), (40 + 9000) * 1000,
    'and paused');
});

test('r4 #2: a forward seek while paused moves nothing until play, then the jump counts', () => {
  const timing = playingAt100();
  const held = (100 + 9000) * 1000;
  assert.equal(sample(timing, {nowMs: NOW + 1000, timePos: 160, offset: 9000, paused: true}), held,
    'paused at the new position: held');
  assert.equal(sample(timing, {nowMs: NOW + 5000, timePos: 160, offset: 9000, paused: true}), held, 'still held');
  assert.equal(sample(timing, {nowMs: NOW + 6000, timePos: 161, offset: 9000}), (161 + 9000) * 1000,
    'playing again: the cutoff follows the seek and the second played');
});

test('r4 #2: a backward seek while paused, then play, catches up from the new position', () => {
  const timing = playingAt100();
  assert.equal(sample(timing, {nowMs: NOW + 1000, timePos: 40, offset: 9000, paused: true}), (40 + 9000) * 1000,
    'paused: the cutoff follows back at once');
  assert.equal(sample(timing, {nowMs: NOW + 2000, timePos: 41, offset: 9000}), (41 + 9000) * 1000,
    'playing again: it advances with the playhead from there');
});

// A timeline change from playhead 100 at offset 9000: the cutoff stays at 9 109 000 until a mapping is
// corroborated. The new file's raw timeline starts at 0 with a new offset.
function reloaded() {
  const timing = playingAt100();
  timing.forgetMapping();
  timing.resyncCutoff();
  return {timing, prior: (100 + 9000) * 1000};
}

test('r4 #2: after a reload, one bad confident sample (+20 s) followed by a disagreeing one is clamped', () => {
  const {timing, prior} = reloaded();
  // The true mapping: playhead 0 at the prior video time, so offset 9100. The bad sample is 20 s later.
  const first = sample(timing, {nowMs: NOW + 1000, timePos: 0, offset: 9120, behindLive: 5});
  assert.equal(first, prior, 'the first sample after the reload only re-anchors the playhead');
  const second = sample(timing, {nowMs: NOW + 1250, timePos: 0.25, offset: 9100, behindLive: 25});
  assert.ok(second <= prior + 1.5 * 250, `disagreeing samples are clamped (${second - prior} ms on 250 ms)`);
  assert.equal(second, prior + 250, 'here the true mapping is below the 375 ms ceiling');
});

test('r4 #2: after a reload, a single bad confident sample is never adopted outright', () => {
  const {timing, prior} = reloaded();
  sample(timing, {nowMs: NOW + 1000, timePos: 0, behindLive: null}); // Not confident yet.
  const cutoff = sample(timing, {nowMs: NOW + 1250, timePos: 0.25, offset: 9120, behindLive: 5});
  assert.equal(cutoff, prior + 375, 'the first confident sample, +20 s, moves only 1.5 x 0.25 s');
});

test('r4 #2: after a reload, two agreeing confident samples while playing adopt the mapping outright', () => {
  const {timing, prior} = reloaded();
  const offset = 9130; // 30 s ahead of the prior cutoff: a Go Live landing.
  assert.equal(sample(timing, {nowMs: NOW + 1000, timePos: 0, offset, behindLive: 8}), prior);
  const adopted = sample(timing, {nowMs: NOW + 2000, timePos: 1.5, offset: offset + 0.5, behindLive: 8});
  assert.equal(adopted, (1.5 + offset + 0.5) * 1000, 'within 1 s of each other: adopted outright');
  const next = sample(timing, {nowMs: NOW + 3000, timePos: 2.5, offset: offset + 30, behindLive: -22});
  assert.equal(next, adopted + 1500, 'adoption ends the await: a later +30 s jump is clamped');
});

test('r4 #2: after a reload, agreeing samples at a paused or stalled playhead do not adopt', () => {
  const {timing, prior} = reloaded();
  const offset = 9130;
  sample(timing, {nowMs: NOW + 1000, timePos: 0, offset, behindLive: 8});
  assert.equal(sample(timing, {nowMs: NOW + 2000, timePos: 0, offset, behindLive: 9, paused: true}), prior);
  assert.equal(sample(timing, {nowMs: NOW + 3000, timePos: 0, offset, behindLive: 10}), prior, 'stalled');
  const playing = sample(timing, {nowMs: NOW + 4000, timePos: 1, offset, behindLive: 10});
  assert.equal(playing, (1 + offset) * 1000, 'adopted once the playhead advances');
});

test('r4 #2: samples that disagree by more than 1 s keep the clamp until two agree', () => {
  const {timing, prior} = reloaded();
  sample(timing, {nowMs: NOW + 1000, timePos: 0, offset: 9130, behindLive: 8});
  const a = sample(timing, {nowMs: NOW + 2000, timePos: 1, offset: 9131.5, behindLive: 8});
  assert.equal(a, prior + 1500, '1.5 s apart: clamped');
  const b = sample(timing, {nowMs: NOW + 3000, timePos: 2, offset: 9131.5, behindLive: 8});
  assert.equal(b, (2 + 9131.5) * 1000, 'the next agreeing sample adopts');
});

// The estimator updates on each 2 s playlist poll, and the player samples on each 1 s status tick, so two
// samples can reread one estimate (lead amendment to r4 #2). estimateId is the estimator's update count.

test('r4 #2: two samples that reread one estimator update do not adopt, even with the playhead advancing', () => {
  const {timing, prior} = reloaded();
  const offset = 9130;
  assert.equal(sample(timing, {nowMs: NOW + 1000, timePos: 0, offset, behindLive: 8, estimateId: 7}), prior);
  const reread = sample(timing, {nowMs: NOW + 2000, timePos: 1, offset, behindLive: 8, estimateId: 7});
  assert.equal(reread, prior + 1500, 'the same update a second time: clamped');
  const again = sample(timing, {nowMs: NOW + 3000, timePos: 2, offset, behindLive: 8, estimateId: 7});
  assert.equal(again, prior + 3000, 'and a third time');
});

test('r4 #2: two distinct estimator updates that agree adopt, and a reread between them does not break the run',
  () => {
    const {timing, prior} = reloaded();
    const offset = 9130;
    sample(timing, {nowMs: NOW + 1000, timePos: 0, offset, behindLive: 8, estimateId: 7});
    sample(timing, {nowMs: NOW + 2000, timePos: 1, offset, behindLive: 8, estimateId: 7});
    const adopted = sample(timing, {nowMs: NOW + 3000, timePos: 2, offset: offset + 0.5, behindLive: 8, estimateId: 8});
    assert.equal(adopted, (2 + offset + 0.5) * 1000, 'update 8 agrees with update 7: adopted outright');
    assert.ok(adopted > prior + 3000, 'precondition: past what the clamp allowed');
  });

test('r4 #2: two distinct estimator updates more than 1 s apart do not adopt', () => {
  const {timing, prior} = reloaded();
  sample(timing, {nowMs: NOW + 1000, timePos: 0, offset: 9130, behindLive: 8, estimateId: 7});
  const cutoff = sample(timing, {nowMs: NOW + 3000, timePos: 2, offset: 9131.5, behindLive: 8, estimateId: 8});
  assert.equal(cutoff, prior + 3000, '1.5 s apart: clamped');
});

test('r4 #2: a mode change into Auto starts from the cutoff in use, not a stale Auto one', () => {
  const timing = playingAt100();
  timing.update({mode: 'manual', manualDelay: 4});
  const manual = sample(timing, {nowMs: NOW + 600_000, timePos: 700, offset: 9000});
  assert.equal(manual, NOW + 600_000 - 4000, 'precondition: Manual reveals by wall clock');
  timing.update({mode: 'auto'});
  timing.resyncCutoff();
  const target = (701 + 9898) * 1000;
  assert.ok(target > manual + 1500, 'precondition: the Auto target is ahead of the Manual cutoff');
  assert.equal(sample(timing, {nowMs: NOW + 601_000, timePos: 701, offset: 9898, behindLive: 2}), manual,
    'the first Auto sample keeps the Manual cutoff, not the stale Auto one');
});

// ---------------------------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------------------------

// A live playlist whose newest segment ends `latency` seconds before `nowMs`.
function playlistEndingAt(nowMs, latency) {
  const pdt = new Date(nowMs - (latency + 2) * 1000).toISOString();
  return ['#EXTM3U', '#EXT-X-PROGRAM-DATE-TIME:' + pdt, '#EXTINF:2.000,', 'segment.ts'].join('\n');
}

// The r3-auto-cutoff fixture: each 2 s poll the cache end advances 2 s while `buffering`, and the playhead
// advances 2 s while `playing`. The estimator's offset is loadedAt/1000 - latency - 82.
function liveWindow(t) {
  const shim = createIina({
    label: Sources.label(liveSource, 'unified'),
    mpv: {path: liveSource.url, 'time-pos': 76, speed: 1, pause: false},
  });
  shim.timers.advance(START_MS);
  // IINA 1.5.1 JavascriptAPIMpv exposes getNative; the shared shim does not model it.
  shim.iina.mpv.getNative = property => shim.mpv.props.get(property) ?? null;
  const module = {exports: {}};
  shim.runScript(playerPath, {globals: {module, Date: shim.timers.Date}, require: requireFromPlayer});
  let saved = {chatEnabled: false};
  module.exports.start(shim.iina, {variant: 'unified'}, {
    readSettings: () => structuredClone(saved),
    saveSettings: next => { saved = structuredClone(next); },
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
    shim.emit('iina.file-loaded', liveSource.url);
    shim.emit('iina.window-size-adjusted');
    await settle();
  }
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
  // Moves the playhead and notifies the seek, as mpv does, without a poll.
  function seek(timePos) {
    clock.timePos = timePos;
    shim.mpv.set('time-pos', timePos);
    shim.emit('mpv.seek');
  }
  function connectChat() {
    shim.timers.advance(0);
    shim.sidebar.send('connect', {});
    shim.global.send('auth-ready', JSON.stringify({login: 'fixture_reader', token: 'fake_r4_seek_credential'}));
    shim.emit('iina.plugin-overlay-loaded');
    shim.overlay.send('overlay-ready', {});
    const config = shim.overlay.messages('live-config').at(-1);
    assert.ok(config, 'precondition: the live transport starts with a fake grant');
    const {session} = JSON.parse(decodeURIComponent(config.data.encoded));
    return messages => shim.overlay.send('live-messages', {session, messages});
  }
  const state = () => JSON.parse(decodeURIComponent(shim.sidebar.messages('state').at(-1).data.encoded));
  const shown = () => state().messages.map(m => m.id);
  return {shim, clock, load, poll, offsetFor, pause, seek, connectChat, state, shown};
}

const row = (id, timestampMs) => ({id, timestampMs, author: 'viewer', text: 'Synthetic chat ' + id});

async function playConfident(w) {
  for (let i = 0; i < 11; i++) await w.poll();
  assert.equal(w.state().chatTiming.state, 'auto', 'precondition: Auto is confident while playing');
}

// Polls with the playlist's latency changed until the estimate is confident at the new offset.
async function jumpLatency(w, latency) {
  w.clock.latency = latency;
  const target = w.offsetFor(latency);
  for (let i = 0; i < 30; i++) {
    await w.poll();
    w.shim.sidebar.send('ready', {});
    const s = w.state();
    const video = s.behindLive === null ? null : w.shim.timers.now / 1000 - s.behindLive;
    if (s.chatTiming.state === 'auto' && video !== null && Math.abs(video - (w.clock.timePos + target)) < 1) return;
  }
  assert.fail('precondition: the estimate did not settle at the new offset');
}

test('r4 #2: a seek at the same paused playhead with a shifted offset reveals nothing', async t => {
  const w = liveWindow(t);
  await w.load();
  const deliver = w.connectChat();
  await playConfident(w);
  w.clock.playing = false; // Stalled: the cache and playlist go on, so the estimate stays confident.
  await w.poll();
  const heldMs = (w.clock.timePos + w.offsetFor(3)) * 1000;
  deliver([row('reached', heldMs - 2000), row('ahead', heldMs + 5000)]);
  assert.deepEqual(w.shown(), ['reached'], 'precondition: only the reached row shows');
  const timePos = w.clock.timePos;
  await jumpLatency(w, -27); // The playlist now dates the same cache 30 s later.
  assert.deepEqual(w.shown(), ['reached'], 'precondition: the jump alone reveals nothing');

  w.pause(true);
  w.seek(timePos);
  w.shim.sidebar.send('ready', {});
  assert.deepEqual(w.shown(), ['reached'], 'a paused seek at the same playhead reveals nothing');
  w.shim.timers.advance(5000);
  await settle();
  w.seek(timePos);
  w.shim.sidebar.send('ready', {});
  assert.deepEqual(w.shown(), ['reached'], 'nor a second one');
});

test('r4 #2: while playing, a backward seek moves the cutoff back and a 60 s forward seek follows at once',
  async t => {
    const w = liveWindow(t);
    await w.load();
    const deliver = w.connectChat();
    await playConfident(w);
    const timePos = w.clock.timePos;
    const cutoffMs = (timePos + w.offsetFor(3)) * 1000;

    w.seek(timePos - 60);
    deliver([row('in-between', cutoffMs - 30_000)]);
    assert.deepEqual(w.shown(), [], 'after the backward seek the row 30 s before the old cutoff waits');

    w.seek(timePos);
    w.shim.sidebar.send('ready', {});
    assert.deepEqual(w.shown(), ['in-between'], 'the 60 s forward seek moves the cutoff with it, at once');
    deliver([row('ahead', cutoffMs + 2000)]);
    assert.deepEqual(w.shown(), ['in-between'], 'and no further than the mapping');
  });

test('r4 #2: Go Live by seek follows the playhead jump instead of resyncing', async t => {
  const w = liveWindow(t);
  w.clock.latency = 3;
  await w.load();
  const deliver = w.connectChat();
  await playConfident(w);
  w.pause(true);
  w.clock.buffering = true; // The cache keeps filling ahead of a paused playhead.
  for (let i = 0; i < 4; i++) await w.poll();
  w.shim.sidebar.send('ready', {});
  assert.equal(w.state().atLiveEdge, false, 'precondition: behind the edge');
  const before = w.clock.timePos;
  w.shim.sidebar.send('go-live', {});
  await settle();
  const seekCommand = w.shim.mpv.commands.filter(([name]) => name === 'seek').at(-1);
  assert.ok(seekCommand, 'precondition: Go Live seeks');
  const target = Number(seekCommand[1][0]);
  assert.ok(target > before + 2, `precondition: a forward seek (${target - before} s)`);
  w.clock.playing = true;
  w.seek(target);
  deliver([row('landed', (target + w.offsetFor(3)) * 1000 - 500)]);
  assert.deepEqual(w.shown(), ['landed'], 'the cutoff follows the Go Live seek at once');
});

test('r4 #2: after a quality reload, a status tick that rereads the first confident estimate does not adopt it',
  async t => {
    const w = liveWindow(t);
    w.clock.latency = 24; // About 30 s behind live.
    await w.load();
    const deliver = w.connectChat();
    await playConfident(w);
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
    for (let i = 0; i < 20 && w.state().chatTiming.state !== 'auto'; i++) await w.poll();
    assert.equal(w.state().chatTiming.state, 'auto', 'precondition: the first confident estimate after the reload');

    // Between polls: the playhead advances, and a sample rereads the same estimate.
    w.clock.timePos += 1;
    w.shim.mpv.set('time-pos', w.clock.timePos);
    const nowMs = w.shim.timers.now;
    deliver([row('ten-back', nowMs - 10_000)]);
    assert.deepEqual(w.shown(), [], 'a reread of one estimate does not adopt the new mapping');
    await w.poll(); // A new, agreeing estimate, on a tick with no playhead advance (v0.5.5 review r5 #3).
    assert.deepEqual(w.shown(), [], 'the next distinct estimate corroborates, on a stalled tick: nothing new');
    await w.poll(); // This poll's first tick advances the playhead.
    assert.deepEqual(w.shown(), ['ten-back'], 'the next advancing tick adopts it');
  });
