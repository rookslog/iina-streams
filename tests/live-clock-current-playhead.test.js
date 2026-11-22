'use strict';
// Lead review of C3: behindLive() must use the current playhead, not the one from the last sample.
const test = require('node:test');
const assert = require('node:assert/strict');
const {createLiveClock} = require('../src/live-clock.js');

test('behindLive reads the current time-pos between samples', async () => {
  let clockMs = 1_000_000;
  let timePos = 50;
  const seen = [];
  const clock = createLiveClock({
    http: {get: async () => ({text: '#EXTM3U\n#EXT-X-PROGRAM-DATE-TIME:2026-01-01T00:00:00Z\n#EXTINF:2,\ns.ts'})},
    readPlayer: () => ({timePos, cacheEnd: timePos + 3}),
    estimator: {addSample() {}, behindLive: ({rawTimePos}) => { seen.push(rawTimePos); return 9; }},
    setTimer: () => ({}),
    clearTimer() {},
    now: () => clockMs,
  });
  clock.start('https://video-weaver.ttvnw.net/v.m3u8?sig=FAKE');
  await new Promise(setImmediate);
  clockMs += 1500;
  timePos = 51.5;
  clock.behindLive();
  assert.deepEqual(seen, [51.5]);
  clock.stop();
});
