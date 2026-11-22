'use strict';

// C2a assumed API: src/chat-timing.js exports createChatTiming({mode, manualDelay, fineTune}).
// settings() returns those three persisted fields; update(partial) changes only supplied fields.
// effective(behindLiveSeconds) returns {delay, state}, with delay in seconds.
// reveal(messages, nowMs, delaySeconds) returns {visible, nextDueMs}; messages have an id
// and optional timestampMs. Reveal history belongs to the instance and is keyed by id.
// calibrate(message, nowMs) switches to manual mode and returns the updated settings.

const test = require('node:test');
const assert = require('node:assert/strict');

function createTiming(options = {}) {
  // Load per case so the test-first run reports the missing module for each behavior.
  return require('../src/chat-timing.js').createChatTiming(options);
}

test('auto applies the fine tune to a finite live estimate', () => {
  const timing = createTiming({manualDelay: 20, fineTune: 1.5});
  assert.deepEqual(timing.effective(6.25), {delay: 7.75, state: 'auto'});
});

test('manual uses the configured delay instead of the live estimate', () => {
  const timing = createTiming({mode: 'manual', manualDelay: 12.5, fineTune: 2});
  assert.deepEqual(timing.effective(8), {delay: 12.5, state: 'manual'});
});

test('live shows chat immediately regardless of the estimate and settings', () => {
  const timing = createTiming({mode: 'live', manualDelay: 12.5, fineTune: 2});
  assert.deepEqual(timing.effective(8), {delay: 0, state: 'live'});
});

test('auto with no estimate reports uncertainty and falls back to manual delay', () => {
  const timing = createTiming({manualDelay: 9, fineTune: 3});
  assert.deepEqual(timing.effective(null), {delay: 9, state: 'auto-uncertain'});
});

test('auto clamps a negative finely tuned delay to zero', () => {
  const timing = createTiming({fineTune: -4});
  assert.deepEqual(timing.effective(2), {delay: 0, state: 'auto'});
});

test('reveal uses the inclusive due time and preserves input order, including notices', () => {
  const timing = createTiming();
  const last = {id: 'last', timestampMs: 5000};
  const boundary = {id: 'boundary', timestampMs: 2000};
  const notice = {id: 'notice', text: 'Synthetic notice'};
  const earliest = {id: 'earliest', timestampMs: 0};
  const next = {id: 'next', timestampMs: 3000};
  const messages = [last, boundary, notice, earliest, next];

  assert.deepEqual(timing.reveal(messages, 1999, 2), {visible: [notice], nextDueMs: 2000});
  assert.deepEqual(timing.reveal(messages, 3999, 2), {visible: [notice, earliest], nextDueMs: 4000});
  assert.deepEqual(timing.reveal(messages, 4000, 2), {visible: [boundary, notice, earliest], nextDueMs: 5000});
  assert.deepEqual(timing.reveal(messages, 7000, 2), {visible: messages, nextDueMs: null});
});

test('reveal keeps an already shown id visible after an increase in delay', () => {
  const timing = createTiming();
  const shown = {id: 'shown', timestampMs: 2000};
  const pending = {id: 'pending', timestampMs: 3000};

  assert.deepEqual(timing.reveal([shown, pending], 4000, 2), {visible: [shown], nextDueMs: 5000});
  const updatedShown = {...shown, text: 'Updated display text'};
  assert.deepEqual(timing.reveal([updatedShown, pending], 4000, 10), {
    visible: [updatedShown], nextDueMs: 13000,
  });
});

test('reveal prunes only ids that disappear from the input', () => {
  const timing = createTiming();
  const removed = {id: 'removed', timestampMs: 1000};
  const retained = {id: 'retained', timestampMs: 2000};

  assert.deepEqual(timing.reveal([removed, retained], 3000, 0), {
    visible: [removed, retained], nextDueMs: null,
  });
  assert.deepEqual(timing.reveal([retained], 3000, 10), {visible: [retained], nextDueMs: null});
  assert.deepEqual(timing.reveal([removed, retained], 3000, 10), {visible: [retained], nextDueMs: 11000});
});

test('calibrate rounds message age to half a second and selects manual mode', () => {
  const timing = createTiming({mode: 'live', fineTune: -1.5});
  const expected = {mode: 'manual', manualDelay: 8.5, fineTune: -1.5};

  assert.deepEqual(timing.calibrate({id: 'cue', timestampMs: 1000}, 9260), expected);
  assert.deepEqual(timing.settings(), expected);
  assert.deepEqual(timing.effective(20), {delay: 8.5, state: 'manual'});
});

test('calibrate clamps a 200-second-old message to 120 and a future message to zero', () => {
  const timing = createTiming();
  assert.deepEqual(timing.calibrate({id: 'old', timestampMs: 1000}, 201000), {
    mode: 'manual', manualDelay: 120, fineTune: 0,
  });
  assert.deepEqual(timing.calibrate({id: 'future', timestampMs: 201800}, 201000), {
    mode: 'manual', manualDelay: 0, fineTune: 0,
  });
});

const DEFAULTS = {mode: 'auto', manualDelay: 0, fineTune: 0};
const NORMALIZATION_CASES = [
  {input: {manualDelay: 2.74, fineTune: -3.26}, expected: {manualDelay: 2.5, fineTune: -3.5}},
  {input: {manualDelay: 500, fineTune: -30}, expected: {manualDelay: 120, fineTune: -10}},
  {input: {manualDelay: -8, fineTune: 30}, expected: {manualDelay: 0, fineTune: 10}},
  {input: {manualDelay: Infinity, fineTune: NaN}, expected: {manualDelay: 0, fineTune: 0}},
  {input: {manualDelay: '12', fineTune: -Infinity}, expected: {manualDelay: 0, fineTune: 0}},
];

test('constructor defaults, rounds, clamps, and rejects non-finite settings', () => {
  assert.deepEqual(createTiming().settings(), DEFAULTS);
  for (const {input, expected} of NORMALIZATION_CASES) {
    assert.deepEqual(createTiming(input).settings(), {...DEFAULTS, ...expected});
  }
});

test('update applies the same normalization and preserves omitted settings', () => {
  for (const {input, expected} of NORMALIZATION_CASES) {
    const timing = createTiming({mode: 'manual', manualDelay: 7, fineTune: 2});
    timing.update(input);
    assert.deepEqual(timing.settings(), {mode: 'manual', ...expected});
    timing.update({mode: 'live'});
    assert.deepEqual(timing.settings(), {mode: 'live', ...expected});
  }
});
