'use strict';

// v0.5.5 class A regression examples (docs/design/V055-CLASS-REPAIR-2026-11-22.md, "Class A: Auto chat timing").
// The round-6 reviewer probe, a stationary jitter trace, and convergence of a 20 s gap at 0.1 s and 2 s cadence.
// The round-4 and round-5 probes stay in tests/r4-auto-seek.test.js and tests/r5-auto-stalled-tick.test.js.
// CLASS_A_REPORT=1 prints the convergence times.

const test = require('node:test');
const assert = require('node:assert/strict');
const {createChatTiming} = require('../src/chat-timing.js');

const mapping = (timePos, offset) => (timePos + offset) * 1000;

// The round-5 probe setup (tests/r5-auto-stalled-tick.test.js): a 30 s delay, a wall-clock first sample at
// playhead 100, then a resync.
function resynced() {
  const timing = createChatTiming();
  const s = (nowMs, timePos, offset, estimateId) =>
    timing.revealCutoffMs({nowMs, timePos, offset, estimateId, paused: false, behindLive: null});
  timing.effective(30);
  assert.equal(s(9_200_000, 100, null, 0), 9_170_000, 'precondition: the first sample takes the wall clock');
  timing.resyncCutoff();
  return s;
}

// Round 6 #3 (docs/reviews/2026-11-22-v0.5.5-release-review.md, "Reviewer output, round 6"): after two agreeing
// updates corroborated while stalled, changing only 100.250 to 100.251 advanced the cutoff by 19 876 ms.
test('r6 #3: the reviewer probe: a 1 ms advance after corroboration reveals nothing', () => {
  const s = resynced();
  s(9_200_000, 100, 9090, 10);
  assert.equal(s(9_200_250, 100.25, 9090, 10), 9_170_375, 'precondition: a 0.25 s advance is clamped');
  assert.equal(s(9_201_250, 100.25, 9090, 11), 9_170_375, 'precondition: corroborated while stalled');
  assert.equal(s(9_201_500, 100.251, 9090, 11), 9_170_375, 'it was 9 190 251, 19 876 ms more');
});

test('r6 #3: a stationary jitter trace holds the cutoff, and actual resume still converges', () => {
  const s = resynced();
  s(9_200_000, 100, 9090, 10);
  const held = s(9_200_250, 100.25, 9090, 10);
  // Ten seconds stalled at 100.25 with the playhead wandering by up to J = 0.2 s either way, sampled every
  // 100 ms, while a new agreeing update arrives every 2 s.
  for (let step = 1; step <= 100; step++) {
    const wander = 0.2 * Math.sin(step * 1.7);
    const id = 11 + Math.floor(step / 20);
    assert.equal(s(9_200_250 + step * 100, 100.25 + wander, 9090, id), held, `stalled step ${step}`);
  }
  // Playing again at 1x: adopted once 1 s has played.
  const nowMs = 9_210_250;
  assert.equal(s(nowMs + 500, 100.75, 9090, 16), held + 750, 'half a second of play is clamped');
  assert.equal(s(nowMs + 1100, 101.35, 9090, 16), mapping(101.35, 9090), 'adopted after 1.1 s of play');
});

// A 20 s gap: a reload whose new mapping is 20 s ahead of the cutoff held across it, at steady 1x playback.
// The estimator updates every 2 s from the reload on; `agree` says whether consecutive updates agree.
// Returns the playback time, in ms, until the cutoff first meets the target.
function closeGap({cadenceMs, agree}) {
  const timing = createChatTiming();
  const startMs = 50_000_000;
  const oldOffset = 40_000;
  timing.revealCutoffMs({nowMs: startMs, timePos: 500, paused: false, offset: oldOffset, behindLive: 10});
  timing.forgetMapping();
  timing.resyncCutoff();
  const newOffset = oldOffset + 500 + 20; // The new file starts at 0 and shows 20 s later than the held cutoff.
  for (let ms = 0; ms <= 120_000; ms += cadenceMs) {
    const update = Math.floor(ms / 2000);
    const offset = agree ? newOffset + 0.3 * Math.sin(update) : newOffset + (update % 2 === 0 ? 0.8 : -0.8);
    const timePos = ms / 1000;
    const target = (timePos + offset) * 1000;
    const cutoff = timing.revealCutoffMs({
      nowMs: startMs + ms, timePos, paused: false, offset, behindLive: 10, estimateId: update + 1,
    });
    if (ms === 0) {
      assert.equal(target - cutoff, 20_000 + 300 * Math.sin(0) + (agree ? 0 : 800), 'precondition: the gap');
    }
    if (cutoff >= target - 1) {
      return ms;
    }
  }
  return null;
}

const convergence = {
  rebase100: closeGap({cadenceMs: 100, agree: true}),
  rebase2000: closeGap({cadenceMs: 2000, agree: true}),
  clamp100: closeGap({cadenceMs: 100, agree: false}),
  clamp2000: closeGap({cadenceMs: 2000, agree: false}),
};
if (process.env.CLASS_A_REPORT) {
  console.log('20 s gap closed after (ms of playback):', JSON.stringify(convergence));
}

test('A6: with corroboration, a 20 s gap closes by rebase about P after the second agreeing update', () => {
  // The second update lands at 2 s; P = 1 s of play later is 3 s. A 2 s cadence sees it on its next sample.
  assert.ok(convergence.rebase100 >= 3000 && convergence.rebase100 <= 3300, `0.1 s cadence: ${convergence.rebase100}`);
  assert.equal(convergence.rebase2000, 4000, '2 s cadence');
});

test('A6: without corroboration, the clamp alone closes a 20 s gap in 20 / 0.5 s of playback', () => {
  // The disagreeing estimate alternates 0.8 s either side, so the gap is 19.2 s or 20.8 s: 38.4 s to 41.6 s of
  // play, plus up to one sample period.
  for (const [name, ms] of [['0.1 s', convergence.clamp100], ['2 s', convergence.clamp2000]]) {
    assert.ok(ms !== null && ms <= 41_600 + 2000, `${name} cadence: ${ms}`);
    assert.ok(ms >= 38_400, `${name} cadence: not before the 1.5x cap allows (${ms})`);
  }
});
