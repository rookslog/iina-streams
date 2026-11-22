'use strict';

// Pure chat timing policy: how long to hold chat back so it matches the video, and which
// messages are visible now. No IINA globals, timers or clock reads; the caller passes times.
// Design: docs/design/OVERNIGHT-WAVE-B-2026-11-22.md (C2a).

const MODES = ['auto', 'manual', 'live'];
const DEFAULT_MODE = 'auto';
const MANUAL_DELAY_MAX_SECONDS = 120;
const FINE_TUNE_LIMIT_SECONDS = 10;
const STEP_SECONDS = 0.5;
// While playing, Auto's reveal cutoff advances at most this many times as far as the playhead
// (v0.5.5 review r3 #2), so a corrected offset catches up gradually and a discontinuous one cannot jump it.
const AUTO_CATCH_UP_RATE = 1.5;
// After a timeline change, two consecutive confident offsets within this many seconds of each other are
// adopted outright (v0.5.5 review r4 #2).
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
  // The reveal cutoff last returned and the playhead it was sampled at, {cutoffMs, timePos}, or null before
  // the first sample. Every mode records it, so Auto starts from the cutoff in use. timePos is null after a
  // resync: the next sample re-anchors it (v0.5.5 review r3 #2, r4 #2).
  let heldCutoff = null;
  // True from a resync (and at the start) until a mapping is adopted: the fallback before it can hold
  // a stale delay, such as the one from before a Go Live reload.
  let awaitingMapping = true;
  // While awaiting, the last confident sample, {offset, timePos, estimateId}, which the next one must agree with.
  let candidate = null;
  // While awaiting, whether the run ending at the candidate is corroborated: two distinct estimator updates
  // agreed, possibly while stalled. It permits no rebase by itself (v0.5.5 review r5 #3).
  let corroborated = false;

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
   * The chat send time, in epoch ms, up to which rows show now (v0.5.5 review r3 #2, r4 #2). Live and Manual
   * reveal by wall clock less their delay. Auto's target is autoClockMs, or without a mapping the wall clock
   * less effective().delay; its cutoff then
   * - never advances while the playhead does not (paused, stalled or buffering);
   * - while playing, advances at most AUTO_CATCH_UP_RATE times the playhead's advance since the last sample.
   *   A seek's jump counts as advance, so within one file the cutoff follows a seek: the playhead-to-chat
   *   offset does not change across it. A jump made while paused counts once playing resumes;
   * - follows a lower target at once (rows already shown stay shown: see reveal);
   * - after a resync, keeps its value and adopts a mapping outright only on a tick whose playhead advanced,
   *   once two consecutive confident samples from distinct estimator updates agreed within
   *   MAPPING_AGREEMENT_SECONDS (corroboration, which may happen while stalled) and that tick's own sample
   *   is confident and still agrees; the clamp applies until then, and from then on (v0.5.5 review r5 #3).
   *   A confident sample from the candidate's own update (estimateId) neither confirms nor breaks the run.
   *   Without an estimateId every sample is distinct. A sample that is not confident always breaks it.
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
      heldCutoff = {cutoffMs: wallClockMs, timePos: playhead};
      return wallClockMs;
    }
    const target = mapped === null ? wallClockMs : mapped;
    const confidentOffset = mapped !== null && isFiniteNumber(offset) ? offset : null;
    const estimate = {offset: confidentOffset, id: isFiniteNumber(estimateId) ? estimateId : null};
    return holdCutoff(target, playhead, !!paused, estimate);
  }

  function holdCutoff(target, timePos, paused, estimate) {
    const confidentOffset = estimate.offset;
    // The very first sample has no cutoff to hold, so it takes its target; a confident one is the mapping.
    // A resync never clears the cutoff, so this runs once per timing.
    if (heldCutoff === null) {
      heldCutoff = {cutoffMs: target, timePos};
      if (confidentOffset !== null) {
        awaitingMapping = false;
      }
      noteCandidate(timePos, estimate);
      return target;
    }
    const advance = playheadAdvance(timePos, paused);
    if (awaitingMapping) {
      noteCorroboration(timePos, paused, estimate);
    }
    let cutoffMs;
    // Corroboration is confidence, not permission: the rebase also needs the playhead to move on this tick.
    if (awaitingMapping && corroborated && advance > 0) {
      awaitingMapping = false;
      candidate = null;
      corroborated = false;
      cutoffMs = target;
    } else {
      const ceiling = heldCutoff.cutoffMs + AUTO_CATCH_UP_RATE * advance * 1000;
      cutoffMs = Math.min(target, ceiling);
      noteCandidate(timePos, estimate);
    }
    heldCutoff = {cutoffMs, timePos: nextAnchor(timePos, paused)};
    return cutoffMs;
  }

  // Seconds the playhead advanced since the anchor, or 0 while paused or without a playhead.
  function playheadAdvance(timePos, paused) {
    if (paused || timePos === null || heldCutoff.timePos === null) {
      return 0;
    }
    return Math.max(0, timePos - heldCutoff.timePos);
  }

  // While paused the anchor only moves back, so a jump made while paused counts once playing resumes, and a
  // backward one does not hold the cutoff until the playhead passes the old anchor again.
  function nextAnchor(timePos, paused) {
    if (timePos === null) {
      return heldCutoff.timePos;
    }
    if (paused && heldCutoff.timePos !== null) {
      return Math.min(heldCutoff.timePos, timePos);
    }
    return timePos;
  }

  // A sample that is not confident breaks the corroboration; a reread of the candidate's update leaves it;
  // a sample from a new update sets it to whether it corroborates the candidate.
  function noteCorroboration(timePos, paused, estimate) {
    if (estimate.offset === null || timePos === null) {
      corroborated = false;
      return;
    }
    if (sameUpdate(estimate)) {
      return;
    }
    corroborated = corroborates(paused, estimate);
  }

  // Whether this sample and the candidate are both confident, come from distinct estimator updates and agree
  // on the offset, while playing. The playhead need not have moved between them (v0.5.5 review r5 #3).
  function corroborates(paused, estimate) {
    if (paused || estimate.offset === null || candidate === null) {
      return false;
    }
    if (sameUpdate(estimate)) {
      return false;
    }
    return Math.abs(estimate.offset - candidate.offset) <= MAPPING_AGREEMENT_SECONDS;
  }

  // A confident sample that rereads the candidate's estimator update (v0.5.5 review r4 #2).
  function sameUpdate(estimate) {
    if (candidate === null || estimate.offset === null || estimate.id === null) {
      return false;
    }
    return estimate.id === candidate.estimateId;
  }

  // While awaiting, a confident sample from a new update becomes the candidate; a reread of the candidate's
  // update leaves it; a sample that is not confident breaks the run.
  function noteCandidate(timePos, estimate) {
    if (!awaitingMapping || sameUpdate(estimate)) {
      return;
    }
    if (estimate.offset === null || timePos === null) {
      candidate = null;
      return;
    }
    candidate = {offset: estimate.offset, timePos, estimateId: estimate.id};
  }

  /**
   * A timeline change (a reload, a new file or a mode change; never a seek): the cutoff keeps its value, the
   * next sample re-anchors the playhead, and a mapping is awaited (v0.5.5 review r4 #2).
   */
  function resyncCutoff() {
    awaitingMapping = true;
    candidate = null;
    corroborated = false;
    if (heldCutoff !== null) {
      heldCutoff = {cutoffMs: heldCutoff.cutoffMs, timePos: null};
    }
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
