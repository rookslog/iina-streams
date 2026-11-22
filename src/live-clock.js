'use strict';

// Live clock: polls the (signed) media playlist, feeds the latency estimator, and answers
// "how far behind live is the player". Pure: every dependency is injected. The media URL is
// a signed secret, so it is only ever passed to http.get and never logged, thrown or returned.
// Design: docs/design/OVERNIGHT-WAVE-B-2026-11-22.md (C2a).

const GO_LIVE_MARGIN_SECONDS = 2;
const PDT_PREFIX = '#EXT-X-PROGRAM-DATE-TIME:';
const EXTINF_PREFIX = '#EXTINF:';
// ISO 8601 with an explicit zone (Z or +hh:mm); a zone-less time would depend on local time.
const PDT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

function parseProgramDateTime(text) {
  if (!PDT_PATTERN.test(text)) {
    return null;
  }
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms / 1000 : null;
}

function parseExtinfDuration(line) {
  const duration = parseFloat(line.slice(EXTINF_PREFIX.length));
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

/**
 * End time of the last regular segment in a media playlist: its program date-time plus its
 * duration. Segments without their own date-time continue from the previous segment's end.
 * Prefetch lines are ignored.
 * @param {string} text playlist text
 * @returns {number|null} epoch seconds, or null if there is no usable date-time
 */
function parseNewestSegmentEnd(text) {
  if (typeof text !== 'string') {
    return null;
  }
  let cursor = null;
  let newestEnd = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith(PDT_PREFIX)) {
      cursor = parseProgramDateTime(line.slice(PDT_PREFIX.length));
    } else if (line.startsWith(EXTINF_PREFIX)) {
      const duration = parseExtinfDuration(line);
      if (cursor !== null && duration !== null) {
        cursor += duration;
        newestEnd = cursor;
      }
    }
  }
  return newestEnd;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Create a live clock.
 * Returns {start, stop, behindLive, goLiveTarget}.
 * @param {object} deps
 * @param {{get: function(string, {headers: object, params: object}): Promise<{text: string}>}} deps.http
 * @param {function(): {timePos: number, cacheEnd: number}} deps.readPlayer
 * @param {{addSample: function, behindLive: function}} deps.estimator
 * @param {function(function, number): *} deps.setTimer one-shot timer
 * @param {function(*): void} deps.clearTimer
 * @param {function(): number} deps.now epoch milliseconds
 * @param {number} [deps.intervalMs] poll interval
 * @param {number} [deps.staleMs] age after which the last good sample no longer counts
 * @param {function(string): void} [deps.log] receives a short code only, never the URL
 */
function createLiveClock({
  http, readPlayer, estimator, setTimer, clearTimer, now,
  intervalMs = 2000, staleMs = 10000, log = () => {},
}) {
  let generation = 0;
  let timerId = null;
  let lastTimePos = null;
  let lastCacheEnd = null;
  let lastGoodSampleMs = null;
  // When the outstanding playlist request started, or null. Polls are skipped while one is
  // outstanding, so a slow response can't overlap the next and be sampled late. A request
  // older than staleMs no longer blocks, so a hung request can't stop the clock.
  let inFlightSince = null;

  function cancelTimer() {
    if (timerId !== null) {
      clearTimer(timerId);
      timerId = null;
    }
  }

  function handlePlaylist(text) {
    const newestSegmentEnd = parseNewestSegmentEnd(text);
    if (newestSegmentEnd === null) {
      log('playlist-malformed');
      return;
    }
    const {timePos, cacheEnd} = readPlayer();
    if (!isFiniteNumber(timePos) || !isFiniteNumber(cacheEnd)) {
      return;
    }
    estimator.addSample({now: now() / 1000, newestSegmentEnd, rawCacheEnd: cacheEnd});
    lastTimePos = timePos;
    lastCacheEnd = cacheEnd;
    lastGoodSampleMs = now();
  }

  function fetchPlaylist(mediaURL, myGeneration) {
    if (inFlightSince !== null && now() - inFlightSince < staleMs) {
      return;
    }
    inFlightSince = now();
    let request;
    try {
      // String-only header and param maps: the host rejects other value types.
      request = Promise.resolve(http.get(mediaURL, {headers: {}, params: {}}));
    } catch (_) {
      request = Promise.reject(new Error('playlist-fetch'));
    }
    request.then(
      response => {
        if (myGeneration === generation) {
          inFlightSince = null;
          handlePlaylist(response && response.text);
        }
      },
      () => {
        if (myGeneration === generation) {
          inFlightSince = null;
          log('playlist-fetch');
        }
      },
    );
  }

  function poll(mediaURL, myGeneration) {
    if (myGeneration !== generation) {
      return;
    }
    // Schedule the next poll first so a slow or failed response never stops the clock.
    timerId = setTimer(() => poll(mediaURL, myGeneration), intervalMs);
    fetchPlaylist(mediaURL, myGeneration);
  }

  /**
   * Begin polling the playlist, replacing any earlier run. Polls once immediately.
   * @param {string} mediaURL signed playlist URL
   */
  function start(mediaURL) {
    stop();
    generation += 1;
    lastTimePos = null;
    lastCacheEnd = null;
    lastGoodSampleMs = null;
    inFlightSince = null;
    poll(mediaURL, generation);
  }

  /** Stop polling. Responses still in flight are ignored. Safe to call repeatedly. */
  function stop() {
    generation += 1;
    cancelTimer();
  }

  /** @returns {number|null} seconds behind live, or null without a recent good sample */
  function behindLive() {
    if (lastGoodSampleMs === null || now() - lastGoodSampleMs > staleMs) {
      return null;
    }
    return estimator.behindLive({now: now() / 1000, rawTimePos: lastTimePos});
  }

  /** @returns {number|null} player time to seek to for "go live", or null if unknown */
  function goLiveTarget() {
    return lastCacheEnd === null ? null : lastCacheEnd - GO_LIVE_MARGIN_SECONDS;
  }

  return {start, stop, behindLive, goLiveTarget};
}

module.exports = {createLiveClock, parseNewestSegmentEnd};
