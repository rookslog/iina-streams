'use strict';

// Pure chat timing policy: how long to hold chat back so it matches the video, and which
// messages are visible now. No IINA globals, timers or clock reads; the caller passes times.
// Design: docs/design/OVERNIGHT-WAVE-B-2026-11-22.md (C2a).

const MODES = ['auto', 'manual', 'live'];
const DEFAULT_MODE = 'auto';
const MANUAL_DELAY_MAX_SECONDS = 120;
const FINE_TUNE_LIMIT_SECONDS = 10;
const STEP_SECONDS = 0.5;
// v0.5.5 class A (docs/design/V055-CLASS-REPAIR-2026-11-22.md, "Class A: Auto chat timing", invariants A1-A7).
// While playing, Auto's reveal cutoff advances at most this many times the playhead's progress (A1), so a
// corrected offset catches up gradually and a discontinuous one cannot jump it.
const AUTO_CATCH_UP_RATE = 1.5;
// J, the jitter tolerance (A2): a playhead that wanders up to J either side of where it stopped makes no
// progress. Forward, the playhead must pass J beyond where progress was last counted (the anchor) for the
// movement to count, and then the whole distance counts; backward, the anchor follows only past 2J, the full
// width of that wander, so a wandering playhead cannot ratchet it. The reviewer's stall probe moved 1 ms; mpv's
// real stall jitter is unmeasured. 0.2 s is 200 times that probe, and below the 0.25 s steps of the round-4 and
// round-5 probes, which are playback. At 1x the playhead passes it within two or three of the player's 100 ms
// reveal timers. Counting from the anchor rather than per sample keeps progress independent of how often the
// player samples (A5).
const PLAYHEAD_JITTER_SECONDS = 0.2;
// P, the progress a rebase needs after its mapping is corroborated (A4). Five times J: a stall adds at most one
// counted step, the playback still due from before it plus up to J of wander, so a stall cannot supply it. One
// second is the player's status tick, so at 1x a corroborated mapping is adopted about 1 s after corroboration,
// at any sampling cadence, while the clamp alone would take 2 s per second of gap.
const REBASE_PROGRESS_SECONDS = 1;
// Playhead differences are of floats such as 487.85 - 487.65; a microsecond absorbs their rounding error.
const ROUNDING_SECONDS = 1e-6;
// Two confident offsets from distinct estimator updates within this many seconds of each other corroborate a
// mapping (A4; v0.5.5 review r4 #2).
const MAPPING_AGREEMENT_SECONDS = 1;

function roundToStep(value) {
  const rounded = Math.round(value / STEP_SECONDS) * STEP_SECONDS;
  // Normalize -0 so settings compare equal to plain zero.
  return rounded === 0 ? 0 : rounded;
}

function normalizeNumber(value, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return roundToStep(Math.min(max, Math.max(min, value)));
}

function normalizeManualDelay(value) {
  return normalizeNumber(value, 0, MANUAL_DELAY_MAX_SECONDS);
}

function normalizeFineTune(value) {
  return normalizeNumber(value, -FINE_TUNE_LIMIT_SECONDS, FINE_TUNE_LIMIT_SECONDS);
}

function normalizeMode(value) {
  return MODES.includes(value) ? value : DEFAULT_MODE;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasTimestamp(message) {
  return typeof message.timestampMs === 'number' && Number.isFinite(message.timestampMs);
}

/**
 * Create a chat timing policy. Settings are the plain object {mode, manualDelay, fineTune}.
 * Returns {settings, update, effective, autoClockMs, forgetMapping, revealCutoffMs, resyncCutoff, reveal,
 * calibrate}.
 * @param {{mode?: string, manualDelay?: number, fineTune?: number}} [options]
 */
function createChatTiming(options = {}) {
  const state = {
    mode: normalizeMode(options.mode),
    manualDelay: normalizeManualDelay(options.manualDelay),
    fineTune: normalizeFineTune(options.fineTune),
  };
  // Ids of messages already shown. Pruned to the ids present in each reveal call.
  let revealedIds = new Set();
  // The last delay Auto computed from a confident estimate, or null before the first one.
  let lastConfidentDelay = null;
  // The last confident offset from the raw mpv timeline to epoch seconds, or null before the first one
  // or after the file timeline changed (v0.5.5 review r2 #2).
  let lastConfidentOffset = null;
  // The reveal cutoff last returned, in epoch ms, or null before the first sample. Every mode records it, so
  // Auto starts from the cutoff in use, and a resync keeps it (A7).
  let heldCutoffMs = null;
  // The anchor: the playhead, in seconds, up to which progress has been counted, or null after a resync, when the
  // next sample re-anchors it (A7). Every mode records it.
  let anchorTimePos = null;
  // Whether the previous sample was paused, and its wall time in ms (null before the first). An interval between
  // samples is playback unless both ends are paused.
  let previousPaused = false;
  let previousNowMs = null;
  // True from a resync (and at the start) until a mapping is adopted: the fallback before it can hold a stale
  // delay, such as the one from before a Go Live reload.
  let awaitingMapping = true;
  // While awaiting, the last confident sample's {offset, estimateId}, which the next distinct update must agree
  // with, or null.
  let candidate = null;
  // While awaiting, the progress in seconds counted since the mapping was corroborated, or null while it is not
  // corroborated (A4).
  let progressSinceCorroboration = null;

  /** @returns {{mode: string, manualDelay: number, fineTune: number}} a copy of the settings */
  function settings() {
    return {mode: state.mode, manualDelay: state.manualDelay, fineTune: state.fineTune};
  }

  /**
   * Change only the supplied settings, normalizing them as the constructor does.
   * @param {{mode?: string, manualDelay?: number, fineTune?: number}} partial
   */
  function update(partial = {}) {
    if ('mode' in partial) {
      state.mode = normalizeMode(partial.mode);
    }
    if ('manualDelay' in partial) {
      state.manualDelay = normalizeManualDelay(partial.manualDelay);
    }
    if ('fineTune' in partial) {
      state.fineTune = normalizeFineTune(partial.fineTune);
    }
    return settings();
  }

  /**
   * The delay to apply to chat, and how sure we are of it.
   * @param {number|null} behindLive seconds the player is behind live, or null if unknown
   * @returns {{delay: number, state: 'live'|'manual'|'auto'|'auto-uncertain'}}
   */
  function effective(behindLive) {
    if (state.mode === 'live') {
      return {delay: 0, state: 'live'};
    }
    if (state.mode === 'manual') {
      return {delay: state.manualDelay, state: 'manual'};
    }
    if (typeof behindLive === 'number' && Number.isFinite(behindLive)) {
      lastConfidentDelay = Math.max(0, behindLive + state.fineTune);
      return {delay: lastConfidentDelay, state: 'auto'};
    }
    // Losing confidence (e.g. a paused video stops the cache end) must never shorten the delay,
    // so keep the last confident one. Manual applies only before any (v0.5.5 review r1 #7).
    if (lastConfidentDelay !== null) {
      return {delay: lastConfidentDelay, state: 'auto-uncertain'};
    }
    return {delay: state.manualDelay, state: 'auto-uncertain'};
  }

  /**
   * Auto's reveal clock (v0.5.5 review r2 #2): the send time, in epoch ms, that the video shows now. It is
   * the playhead mapped to wall-clock time, minus the fine tune, so it stops when the video stops. Without
   * confidence (offset null) the last confident offset maps the current playhead. It never passes nowMs.
   * Returns null outside Auto, before any confident offset, or without a playhead; the caller then reveals
   * by wall clock with effective().delay. An offset is remembered in every mode: it describes the timeline.
   * @param {{nowMs: number, timePos: number|null, offset: number|null}} reading
   * @returns {number|null}
   */
  function autoClockMs({nowMs, timePos, offset}) {
    if (isFiniteNumber(offset)) {
      lastConfidentOffset = offset;
    }
    if (state.mode !== 'auto' || lastConfidentOffset === null || !isFiniteNumber(timePos)) {
      return null;
    }
    const clockMs = (timePos + lastConfidentOffset - state.fineTune) * 1000;
    return Math.min(nowMs, clockMs);
  }

  /** A new file has its own raw timeline, so the remembered offset no longer maps it. */
  function forgetMapping() {
    lastConfidentOffset = null;
  }

  /**
   * The chat send time, in epoch ms, up to which rows show now. Live and Manual reveal by wall clock less their
   * delay. Auto's target is autoClockMs, or without a mapping the wall clock less effective().delay. Auto's
   * cutoff follows the invariants of v0.5.5 class A (docs/design/V055-CLASS-REPAIR-2026-11-22.md):
   * - A1: it advances at most AUTO_CATCH_UP_RATE times the playhead's progress, a forward seek's jump included;
   *   a rebase is the only exception;
   * - A2: without progress it does not advance. Progress is counted from the anchor, not from the last sample,
   *   and movement within PLAYHEAD_JITTER_SECONDS of the anchor counts as none (see countProgress);
   * - A3: it follows a lower target at once (rows already shown stay shown: see reveal);
   * - A4: a rebase, adopting the target outright, needs a corroborated mapping (two confident samples from
   *   distinct estimator updates agreeing within MAPPING_AGREEMENT_SECONDS), then REBASE_PROGRESS_SECONDS of
   *   progress accumulated since corroboration, on samples that are all confident;
   * - A7: after a resync it keeps its value and awaits a mapping; until A4 is met it moves only within A1.
   * A seek is not a resync: within one file the playhead-to-chat offset does not change across it.
   * Call it whether or not chat is on, so the cutoff is held across a pause.
   * @param {{nowMs: number, timePos: number|null, paused: boolean, offset: number|null, behindLive: number|null,
   *   estimateId?: number}} reading estimateId identifies the estimator update the offset comes from
   * @returns {number}
   */
  function revealCutoffMs({nowMs, timePos, paused, offset, behindLive, estimateId}) {
    const mapped = autoClockMs({nowMs, timePos, offset});
    const wallClockMs = nowMs - effective(behindLive).delay * 1000;
    const playhead = isFiniteNumber(timePos) ? timePos : null;
    if (state.mode !== 'auto') {
      heldCutoffMs = wallClockMs;
      anchorTimePos = playhead;
      previousPaused = !!paused;
      previousNowMs = nowMs;
      return wallClockMs;
    }
    const target = mapped === null ? wallClockMs : mapped;
    const confidentOffset = mapped !== null && isFiniteNumber(offset) ? offset : null;
    const estimate = {offset: confidentOffset, id: isFiniteNumber(estimateId) ? estimateId : null};
    return holdCutoff(target, {timePos: playhead, paused: !!paused, nowMs}, estimate);
  }

  function holdCutoff(target, playhead, estimate) {
    // The very first sample has no cutoff to hold, so it takes its target; a confident one is the mapping.
    // A resync never clears the cutoff, so this runs once per timing.
    if (heldCutoffMs === null) {
      heldCutoffMs = target;
      anchorTimePos = playhead.timePos;
      previousPaused = playhead.paused;
      previousNowMs = playhead.nowMs;
      awaitingMapping = estimate.offset === null;
      return target;
    }
    const progress = countProgress(playhead);
    let cutoffMs;
    if (awaitingMapping && rebaseDue(estimate, progress)) {
      awaitingMapping = false;
      candidate = null;
      progressSinceCorroboration = null;
      cutoffMs = target;
    } else {
      const ceilingMs = heldCutoffMs + AUTO_CATCH_UP_RATE * progress * 1000;
      cutoffMs = Math.min(target, ceilingMs);
    }
    heldCutoffMs = cutoffMs;
    return cutoffMs;
  }

  // The progress in seconds this sample adds, measured from the anchor rather than from the last sample, so that
  // it does not depend on how often the player samples (A5). Movement within PLAYHEAD_JITTER_SECONDS ahead of the
  // anchor, or within twice that behind it, counts as none and leaves the anchor (A2). Further ahead, the whole
  // distance counts and the anchor moves to it. Further behind (a backward seek), the anchor moves back and
  // nothing counts.
  // An interval counts as playback unless the player was paused at both ends: the player samples on a pause
  // change, so movement up to a pause was playback. On the sample at a pause no more than the wall time since
  // the previous sample counts; the rest is a jump made while paused, and counts once playing resumes.
  function countProgress({timePos, paused, nowMs}) {
    const pausedThroughout = paused && previousPaused;
    const pausing = paused && !previousPaused;
    const elapsedSeconds = previousNowMs === null ? 0 : Math.max(0, (nowMs - previousNowMs) / 1000);
    previousPaused = paused;
    previousNowMs = nowMs;
    if (timePos === null) {
      return 0;
    }
    if (anchorTimePos === null) {
      anchorTimePos = timePos;
      return 0;
    }
    const moved = timePos - anchorTimePos;
    // A movement of exactly J (or 2J back) is within it; ROUNDING_SECONDS keeps a rounding error from deciding.
    if (moved < -(2 * PLAYHEAD_JITTER_SECONDS + ROUNDING_SECONDS)) {
      anchorTimePos = timePos;
      return 0;
    }
    if (moved <= PLAYHEAD_JITTER_SECONDS + ROUNDING_SECONDS || pausedThroughout) {
      return 0;
    }
    if (pausing && moved > elapsedSeconds) {
      anchorTimePos += elapsedSeconds;
      return elapsedSeconds;
    }
    anchorTimePos = timePos;
    return moved;
  }

  // While awaiting a mapping: whether this sample completes A4. A sample without confidence breaks the run. A
  // sample that rereads the candidate's estimator update neither confirms nor breaks it. A new update that
  // agrees with the candidate corroborates the mapping, or keeps it corroborated; one that disagrees starts
  // over. Progress counts toward P only on samples after the corroborating one.
  function rebaseDue(estimate, progress) {
    if (estimate.offset === null) {
      candidate = null;
      progressSinceCorroboration = null;
      return false;
    }
    if (!rereadsCandidate(estimate)) {
      const agrees = candidate !== null && Math.abs(estimate.offset - candidate.offset) <= MAPPING_AGREEMENT_SECONDS;
      candidate = {offset: estimate.offset, estimateId: estimate.id};
      if (!agrees) {
        progressSinceCorroboration = null;
        return false;
      }
      if (progressSinceCorroboration === null) {
        progressSinceCorroboration = 0;
        return false;
      }
    }
    if (progressSinceCorroboration === null) {
      return false;
    }
    progressSinceCorroboration += progress;
    // The sum of several steps can fall a rounding error short of P.
    return progressSinceCorroboration >= REBASE_PROGRESS_SECONDS - ROUNDING_SECONDS;
  }

  // A confident sample that rereads the candidate's estimator update (v0.5.5 review r4 #2). Without an
  // estimateId every sample is a distinct update.
  function rereadsCandidate(estimate) {
    if (candidate === null || estimate.id === null) {
      return false;
    }
    return estimate.id === candidate.estimateId;
  }

  /**
   * A timeline change (a reload, a new file or a mode change; never a seek): the cutoff keeps its value, the
   * next sample re-anchors the playhead, and a mapping is awaited (A7).
   */
  function resyncCutoff() {
    awaitingMapping = true;
    candidate = null;
    progressSinceCorroboration = null;
    anchorTimePos = null;
  }

  /**
   * Choose the messages visible now. A message shown once stays shown while it is in the input.
   * @param {Array<{id: *, timestampMs?: number}>} messages in display order
   * @param {number} nowMs
   * @param {number} delaySeconds
   * @returns {{visible: Array, nextDueMs: number|null}}
   */
  function reveal(messages, nowMs, delaySeconds) {
    const visible = [];
    const nextRevealed = new Set();
    let nextDueMs = null;
    for (const message of messages) {
      const dueMs = hasTimestamp(message) ? message.timestampMs + delaySeconds * 1000 : null;
      const alreadyShown = revealedIds.has(message.id);
      const isDue = dueMs === null || dueMs <= nowMs;
      if (alreadyShown || isDue) {
        visible.push(message);
        nextRevealed.add(message.id);
      } else if (nextDueMs === null || dueMs < nextDueMs) {
        nextDueMs = dueMs;
      }
    }
    revealedIds = nextRevealed;
    return {visible, nextDueMs};
  }

  /**
   * Set the manual delay to a message's age, and switch to manual mode.
   * @param {{timestampMs: number}} message the message the viewer saw at this moment
   * @param {number} nowMs
   */
  function calibrate(message, nowMs) {
    state.manualDelay = normalizeManualDelay((nowMs - message.timestampMs) / 1000);
    state.mode = 'manual';
    return settings();
  }

  return {settings, update, effective, autoClockMs, forgetMapping, revealCutoffMs, resyncCutoff, reveal, calibrate};
}

module.exports = {createChatTiming};
