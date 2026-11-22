'use strict';

// Pure live-latency estimator. No IINA globals, timers or clock reads: the caller supplies
// every time value, in seconds. Design: docs/design/OVERNIGHT-WAVE-B-2026-11-22.md (C1).

const AGREEMENT_TOLERANCE_SECONDS = 0.5;
const RELOAD_DROP_SECONDS = 10;
const GO_LIVE_MARGIN_SECONDS = 2;

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function countAgreeing(values, center) {
  let count = 0;
  for (const value of values) {
    if (Math.abs(value - center) <= AGREEMENT_TOLERANCE_SECONDS) {
      count += 1;
    }
  }
  return count;
}

/**
 * Create an estimator of the offset between the raw mpv timeline and live wall-clock time.
 * Returns {addSample, offset, behindLive, videoWallClock, reset, updates}.
 * @param {{windowSeconds: number, minSamples: number}} options
 */
function createEstimator({windowSeconds, minSamples}) {
  let samples = [];
  // How many samples were added since creation. Never reset, so equal counts mean the same estimate
  // (v0.5.5 review r4 #2).
  let updateCount = 0;

  function reset() {
    samples = [];
  }

  function isReload(rawCacheEnd) {
    if (samples.length === 0) {
      return false;
    }
    const previous = samples[samples.length - 1];
    return previous.rawCacheEnd - rawCacheEnd > RELOAD_DROP_SECONDS;
  }

  function dropExpired(now) {
    const oldestAllowed = now - windowSeconds;
    samples = samples.filter(sample => sample.now >= oldestAllowed);
  }

  function addSample({now, newestSegmentEnd, rawCacheEnd}) {
    if (isReload(rawCacheEnd)) {
      reset();
    }
    samples.push({now, rawCacheEnd, offset: newestSegmentEnd - rawCacheEnd});
    updateCount += 1;
    dropExpired(now);
  }

  /** @returns {number} the identity of the current estimate: the count of samples added so far */
  function updates() {
    return updateCount;
  }

  function offset() {
    if (samples.length < minSamples) {
      return null;
    }
    const offsets = samples.map(sample => sample.offset);
    const center = median(offsets);
    const agreeing = countAgreeing(offsets, center);
    if (agreeing * 2 <= offsets.length) {
      return null;
    }
    return center;
  }

  function videoWallClock(rawTimePos) {
    const estimate = offset();
    if (estimate === null) {
      return null;
    }
    return rawTimePos + estimate;
  }

  function behindLive({now, rawTimePos}) {
    const wallClock = videoWallClock(rawTimePos);
    if (wallClock === null) {
      return null;
    }
    return now - wallClock;
  }

  return {addSample, offset, behindLive, videoWallClock, reset, updates};
}

/**
 * Seek target for "Go Live", on the time-pos timeline: two seconds before the cache end.
 * A seek at or past the cache end is a silent no-op, and half a second stalls (spike #16/#31).
 * @param {{cacheEnd: number}} args
 */
function goLiveTarget({cacheEnd}) {
  return cacheEnd - GO_LIVE_MARGIN_SECONDS;
}

/**
 * Whether a chat message sent at `sentAt` (epoch seconds) is due, given the video's wall-clock
 * position and a signed offset in seconds.
 * @param {{sentAt: number, videoWallClock: number, offsetSeconds: number}} args
 */
function isDue({sentAt, videoWallClock, offsetSeconds}) {
  return videoWallClock >= sentAt + offsetSeconds;
}

module.exports = {createEstimator, goLiveTarget, isDue};
