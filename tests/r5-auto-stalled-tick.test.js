'use strict';

// v0.5.5 release review r5 #3 (docs/reviews/2026-11-22-v0.5.5-release-review.md, "Reviewer output, round 5"):
// after a resync, Auto counted earlier playhead movement as permission to rebase. A second agreeing estimator
// update that arrived on a tick with no playhead movement (stalled or buffering, pause=false) jumped the cutoff
// to the mapping.
//
// The rule now: corroboration (two distinct agreeing estimator updates) may happen while stalled; the outright
// rebase waits for a tick on which the playhead itself moved, and that tick's own sample must be confident
// and agree. Since v0.5.5 class A (tests/class-a-properties.test.js, tests/class-a-regressions.test.js) the
// rebase waits for 1 s of progress accumulated after corroboration, and movement within 0.2 s is no progress.

const test = require('node:test');
const assert = require('node:assert/strict');
const {createChatTiming} = require('../src/chat-timing.js');

const mapping = (timePos, offset) => (timePos + offset) * 1000;

// The reviewer's probe setup: a 30 s delay, a wall-clock first sample at playhead 100, then a resync.
function resynced() {
  const timing = createChatTiming();
  const s = (nowMs, timePos, offset, estimateId) =>
    timing.revealCutoffMs({nowMs, timePos, offset, estimateId, paused: false, behindLive: null});
  timing.effective(30);
  assert.equal(s(9_200_000, 100, null, 0), 9_170_000, 'precondition: the first sample takes the wall clock');
  timing.resyncCutoff();
  return s;
}

test('r5 #3: the reviewer probe: a corroborating update on a stalled tick reveals nothing new', () => {
  const s = resynced();
  assert.equal(s(9_200_000, 100, 9090, 10), 9_170_000, 'the first confident sample is clamped');
  assert.equal(s(9_200_250, 100.25, 9090, 10), 9_170_375, 'a reread advances by 1.5x the playhead');
  assert.equal(s(9_201_250, 100.25, 9090, 11), 9_170_375, 'update 11 on a stalled tick reveals nothing new');
});

// v0.5.5 class A edit to the next three: adoption needs 1 s of progress after corroboration, not one advancing tick.
test('r5 #3: a later advancing tick adopts the corroborated mapping, rereading the corroborating update', () => {
  const s = resynced();
  s(9_200_000, 100, 9090, 10);
  s(9_200_250, 100.25, 9090, 10);
  s(9_201_250, 100.25, 9090, 11);
  assert.equal(s(9_201_500, 100.5, 9090, 11), 9_170_750, 'a 0.25 s advance is clamped');
  assert.equal(s(9_202_250, 101.25, 9090, 11), mapping(101.25, 9090), 'adopted once 1 s has played');
});

test('r5 #3: a later advancing tick from a new agreeing update also adopts', () => {
  const s = resynced();
  s(9_200_000, 100, 9090, 10);
  s(9_201_250, 100, 9090, 11); // Fully stalled: both updates at one playhead.
  assert.equal(s(9_201_500, 100.25, 9090.5, 12), 9_170_375, 'a 0.25 s advance is clamped');
  assert.equal(s(9_202_250, 101, 9090.5, 12), mapping(101, 9090.5), 'adopted once 1 s has played');
});

test('r5 #3: a sample that is not confident breaks the corroboration before the advancing tick', () => {
  const s = resynced();
  s(9_200_000, 100, 9090, 10);
  s(9_201_250, 100, 9090, 11);
  const clamped = s(9_201_500, 100.25, null, null);
  assert.equal(clamped, 9_170_375, 'the wall-clock target is clamped, not adopted');
  assert.equal(s(9_201_750, 100.5, 9090, 11), 9_170_750, 'the run starts again: clamped');
});

test('r5 #3: a disagreeing update breaks the corroboration before the advancing tick', () => {
  const s = resynced();
  s(9_200_000, 100, 9090, 10);
  s(9_201_250, 100, 9090, 11);
  assert.equal(s(9_201_500, 100.25, 9100, 12), 9_170_375, 'a disagreeing update is clamped');
  assert.equal(s(9_201_750, 100.5, 9100, 12), 9_170_750, 'its reread is clamped too');
  assert.equal(s(9_202_000, 100.5, 9100, 13), 9_170_750, 'agreeing update 13 on a stalled tick: nothing new');
  assert.equal(s(9_202_250, 100.75, 9100, 13), 9_171_125, 'a 0.25 s advance is clamped');
  assert.equal(s(9_203_000, 101.5, 9100, 13), mapping(101.5, 9100), 'adopted once 1 s has played');
});
