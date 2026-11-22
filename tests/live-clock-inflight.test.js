'use strict';
// Lead review of C2a: a slow playlist response must not overlap the next poll, and a hung
// request must stop blocking once it is older than staleMs.
const test = require('node:test');
const assert = require('node:assert/strict');
const {createLiveClock} = require('../src/live-clock.js');

function fakeTimers() {
  const pending = [];
  return {
    setTimer(callback, delayMs) {
      const entry = {callback, delayMs};
      pending.push(entry);
      return entry;
    },
    clearTimer(entry) {
      const index = pending.indexOf(entry);
      if (index >= 0) pending.splice(index, 1);
    },
    fireNext() {
      const entry = pending.shift();
      entry.callback();
    },
  };
}

test('a poll is skipped while a playlist request is outstanding, until it is older than staleMs', () => {
  let clockMs = 1_000_000;
  const timers = fakeTimers();
  const requests = [];
  const clock = createLiveClock({
    http: {get: url => { requests.push(url); return new Promise(() => {}); }},
    readPlayer: () => ({timePos: 10, cacheEnd: 12}),
    estimator: {addSample() {}, behindLive: () => null},
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    now: () => clockMs,
    intervalMs: 2000,
    staleMs: 10000,
  });
  clock.start('https://video-weaver.ttvnw.net/v.m3u8?sig=FAKE');
  assert.equal(requests.length, 1);
  for (let tick = 0; tick < 4; tick += 1) {
    clockMs += 2000;
    timers.fireNext();
  }
  assert.equal(requests.length, 1, 'no overlapping request while the first is outstanding (8 s)');
  clockMs += 2000;
  timers.fireNext();
  assert.equal(requests.length, 2, 'a request outstanding for 10 s no longer blocks');
  clock.stop();
});
