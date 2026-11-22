'use strict';

// Pure chat timing policy: how long to hold chat back so it matches the video, and which
// messages are visible now. No IINA globals, timers or clock reads; the caller passes times.
// Design: docs/design/OVERNIGHT-WAVE-B-2026-11-22.md (C2a).

const MODES = ['auto', 'manual', 'live'];
const DEFAULT_MODE = 'auto';
const MANUAL_DELAY_MAX_SECONDS = 120;
const FINE_TUNE_LIMIT_SECONDS = 10;
const STEP_SECONDS = 0.5;

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
 * Returns {settings, update, effective, autoClockMs, forgetMapping, reveal, calibrate}.
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

  return {settings, update, effective, autoClockMs, forgetMapping, reveal, calibrate};
}

module.exports = {createChatTiming};
