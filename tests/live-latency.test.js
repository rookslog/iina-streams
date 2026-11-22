'use strict';

// C1 assumed CommonJS API: src/live-latency.js exports {createEstimator, goLiveTarget, isDue}.
// createEstimator({windowSeconds: 30, minSamples: 18}) returns {addSample, offset,
// behindLive, videoWallClock, reset}. All times are seconds. addSample({now,
// newestSegmentEnd, rawCacheEnd}) takes wall-clock epoch times for now and the newest
// playlist segment's end (PDT), and a raw mpv time for rawCacheEnd (time-pos + demuxer-start-time).
// offset() returns the median of newestSegmentEnd - rawCacheEnd over the last 30 s of
// sample times, or null unless >=18 samples remain and >half are within ±0.5 s of the median.
// videoWallClock(rawTimePos) adds that offset; behindLive({now, rawTimePos}) subtracts
// that wall-clock time from now. Both return null while uncertain. reset() clears history;
// a rawCacheEnd drop >10 s clears it too, with the triggering sample starting the new window.
// goLiveTarget({cacheEnd}) returns cacheEnd - 2 on the time-pos timeline.
// isDue({sentAt, videoWallClock, offsetSeconds}) checks videoWallClock >= sentAt + offsetSeconds.

const test = require('node:test');
const assert = require('node:assert/strict');

const EPOCH = 1_800_000_000;
const OFFSET = EPOCH - 120;

function loadLatency() {
  // Load inside each case so the intentional red run reports each missing-module failure.
  return require('../src/live-latency.js');
}

function newEstimator() {
  const {createEstimator} = loadLatency();
  return createEstimator({windowSeconds: 30, minSamples: 18});
}

function addSamples(estimator, offsets, {start = 0, rawStart = 100, cadence = 1} = {}) {
  offsets.forEach((offset, index) => {
    const elapsed = index * cadence;
    const rawCacheEnd = rawStart + elapsed;
    estimator.addSample({
      now: EPOCH + start + elapsed,
      newestSegmentEnd: rawCacheEnd + offset,
      rawCacheEnd,
    });
  });
}

test('constant offset: the median is exact with 30% of samples off by ±2 seconds', () => {
  const estimator = newEstimator();
  // Six late and three early segment ends: neither the mean nor the last sample is exact.
  const errors = [
    0, 2, 0, 0, -2, 0, 2, 0, 0, 0,
    0, 0, 2, 0, 0, -2, 0, 2, 0, 0,
    -2, 0, 0, 0, 2, 0, 0, 0, 0, 2,
  ];
  addSamples(estimator, errors.map(error => OFFSET + error));

  assert.equal(estimator.offset(), OFFSET);
});

test('not enough samples: 17 matching samples leave all estimates uncertain', () => {
  const estimator = newEstimator();
  addSamples(estimator, Array(17).fill(OFFSET));

  assert.equal(estimator.offset(), null);
  assert.equal(estimator.videoWallClock(110), null);
  assert.equal(estimator.behindLive({now: EPOCH + 16, rawTimePos: 110}), null);
});

test('split window: a 50/50 split between offsets two seconds apart is uncertain', () => {
  const estimator = newEstimator();
  const offsets = Array.from({length: 18}, (_, index) => OFFSET + (index % 2) * 2);
  addSamples(estimator, offsets);

  assert.equal(estimator.offset(), null);
});

test('confidence: samples exactly 0.5 seconds from the median count toward agreement', () => {
  const estimator = newEstimator();
  const offsets = Array.from({length: 18}, (_, index) => OFFSET + (index % 2) - 0.5);
  addSamples(estimator, offsets);

  assert.equal(estimator.offset(), OFFSET);
});

test('reload: a raw cache drop resets confidence until the 18th new sample', () => {
  const estimator = newEstimator();
  addSamples(estimator, Array(18).fill(OFFSET));
  assert.equal(estimator.offset(), OFFSET);

  // Raw cache end drops from 117 to 5 while the segment end advances by one second.
  const reloadedOffset = OFFSET + 113;
  addSamples(estimator, [reloadedOffset], {start: 18, rawStart: 5});
  assert.equal(estimator.offset(), null);

  addSamples(estimator, Array(16).fill(reloadedOffset), {start: 19, rawStart: 6});
  assert.equal(estimator.offset(), null);

  addSamples(estimator, [reloadedOffset], {start: 35, rawStart: 22});
  assert.equal(estimator.offset(), reloadedOffset);
});

test('reload threshold: a raw cache drop of exactly 10 seconds preserves history', () => {
  const estimator = newEstimator();
  addSamples(estimator, Array(18).fill(OFFSET));
  addSamples(estimator, [OFFSET + 11], {start: 18, rawStart: 107});

  assert.equal(estimator.offset(), OFFSET);
});

test('reset: an explicit reset clears the sample history', () => {
  const estimator = newEstimator();
  addSamples(estimator, Array(18).fill(OFFSET));
  assert.equal(estimator.offset(), OFFSET);

  estimator.reset();
  assert.equal(estimator.offset(), null);

  addSamples(estimator, [OFFSET], {start: 18, rawStart: 118});
  assert.equal(estimator.offset(), null);
});

test('calculations: raw playback time maps to video wall clock and seconds behind live', () => {
  const estimator = newEstimator();
  addSamples(estimator, Array(18).fill(OFFSET));

  assert.equal(estimator.videoWallClock(110.5), EPOCH - 9.5);
  assert.equal(estimator.behindLive({now: EPOCH + 17, rawTimePos: 110.5}), 26.5);
});

test('Go Live: seek two seconds before the cache end in the time-pos domain', () => {
  const {goLiveTarget} = loadLatency();

  assert.equal(goLiveTarget({cacheEnd: 123.5}), 121.5);
});

test('chat timing: a message is due at or after sentAt plus the signed offset', () => {
  const {isDue} = loadLatency();
  const sentAt = EPOCH;
  const cases = [
    {offsetSeconds: 0, videoWallClock: EPOCH - 0.25, expected: false},
    {offsetSeconds: 0, videoWallClock: EPOCH, expected: true},
    {offsetSeconds: 0, videoWallClock: EPOCH + 0.25, expected: true},
    {offsetSeconds: 2.5, videoWallClock: EPOCH + 2.25, expected: false},
    {offsetSeconds: 2.5, videoWallClock: EPOCH + 2.5, expected: true},
    {offsetSeconds: -2.5, videoWallClock: EPOCH - 2.75, expected: false},
    {offsetSeconds: -2.5, videoWallClock: EPOCH - 2.5, expected: true},
  ];
  for (const {offsetSeconds, videoWallClock, expected} of cases) {
    assert.equal(isDue({sentAt, videoWallClock, offsetSeconds}), expected,
      `video time ${videoWallClock}, offset ${offsetSeconds}`);
  }
});

test('window: only samples from the last 30 seconds count', () => {
  const estimator = newEstimator();
  addSamples(estimator, Array(18).fill(OFFSET), {cadence: 0.5}); // 0 through 8.5 s.
  assert.equal(estimator.offset(), OFFSET);

  const recentOffset = OFFSET + 2;
  addSamples(estimator, Array(16).fill(recentOffset), {start: 10, rawStart: 120, cadence: 0.5});

  // At 39 s the original run is >30 s old, but the 16 newer samples are all still in range.
  addSamples(estimator, [recentOffset], {start: 39, rawStart: 128});
  assert.equal(estimator.offset(), null);

  addSamples(estimator, [recentOffset], {start: 39.5, rawStart: 128.5});
  assert.equal(estimator.offset(), recentOffset);
});
