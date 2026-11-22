'use strict';

// v0.5.5 review r1 #7: in Auto, losing confidence must never shorten the chat delay.
// When the cache end stops advancing (a paused video), the latency samples disagree and
// behindLive becomes null. Once a confident estimate has been seen, auto-uncertain keeps the
// last confident delay; only before any confident estimate does it use the Manual delay.
// The status stays 'auto-uncertain' so the dot still shows hollow.

const test = require('node:test');
const assert = require('node:assert/strict');
const {createChatTiming} = require('../src/chat-timing.js');

const SENT_MS = 100_000;

test('auto at 8 s then uncertain keeps the 8 s delay and holds a pending message', () => {
  const timing = createChatTiming();
  assert.deepEqual(timing.effective(8), {delay: 8, state: 'auto'});

  const uncertain = timing.effective(null);
  assert.deepEqual(uncertain, {delay: 8, state: 'auto-uncertain'}, 'the delay does not drop to Manual (0)');

  const pending = {id: 'pending', timestampMs: SENT_MS};
  const early = timing.reveal([pending], SENT_MS + 7_999, uncertain.delay);
  assert.deepEqual(early.visible, [], 'not revealed before its send time plus 8 s');
  assert.equal(early.nextDueMs, SENT_MS + 8_000);
  const due = timing.reveal([pending], SENT_MS + 8_000, timing.effective(null).delay);
  assert.deepEqual(due.visible, [pending], 'revealed at its send time plus 8 s');
});

test('repeated uncertain readings keep the last confident delay', () => {
  const timing = createChatTiming({manualDelay: 2});
  timing.effective(5);
  timing.effective(8);
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(timing.effective(null), {delay: 8, state: 'auto-uncertain'});
  }
});

test('uncertain before any confident estimate uses the Manual delay, as before', () => {
  assert.deepEqual(createChatTiming().effective(null), {delay: 0, state: 'auto-uncertain'});
  assert.deepEqual(createChatTiming({manualDelay: 9, fineTune: 3}).effective(null), {delay: 9, state: 'auto-uncertain'});
});

test('a new confident estimate after uncertainty takes over', () => {
  const timing = createChatTiming();
  timing.effective(8);
  timing.effective(null);
  assert.deepEqual(timing.effective(3), {delay: 3, state: 'auto'});
  assert.deepEqual(timing.effective(null), {delay: 3, state: 'auto-uncertain'}, 'the newer estimate is the one held');
});

test('the held value is the confident delay, fine tune included', () => {
  const timing = createChatTiming({fineTune: 1.5});
  assert.deepEqual(timing.effective(6.5), {delay: 8, state: 'auto'});
  assert.deepEqual(timing.effective(null), {delay: 8, state: 'auto-uncertain'});
});

test('manual and live modes are unaffected by a held estimate', () => {
  const timing = createChatTiming({manualDelay: 4});
  timing.effective(8);
  timing.update({mode: 'manual'});
  assert.deepEqual(timing.effective(null), {delay: 4, state: 'manual'});
  timing.update({mode: 'live'});
  assert.deepEqual(timing.effective(null), {delay: 0, state: 'live'});
});
