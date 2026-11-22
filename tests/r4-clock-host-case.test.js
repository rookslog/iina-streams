'use strict';
// v0.5.5 review r4 #1: IINA 1.5.1 canAccess matches hosts case-sensitively (hasSuffix / ==) and its denial
// exception carries the full URL, so a host with any uppercase letter must never reach http.get.
const test = require('node:test');
const assert = require('node:assert/strict');
const {createLiveClock} = require('../src/live-clock.js');

const SECRET = 'SECRETSIG123';

function build() {
  const gets = [];
  const logs = [];
  const clock = createLiveClock({
    http: {get: url => { gets.push(url); return new Promise(() => {}); }},
    readPlayer: () => ({timePos: 1, cacheEnd: 2}),
    estimator: {addSample() {}, behindLive: () => null},
    setTimer: callback => callback,
    clearTimer() {},
    now: () => 1_000_000,
    log: code => logs.push(code),
  });
  return {clock, gets, logs};
}

for (const host of ['Video.TTVNW.NET', 'video.TTVNW.net', 'TWITCH.TV', 'Twitch.tv']) {
  test(`a mixed-case host makes no http.get call: ${host}`, () => {
    const {clock, gets, logs} = build();
    clock.start(`https://${host}/v1/playlist/x.m3u8?sig=${SECRET}`);
    assert.equal(gets.length, 0);
    assert.deepEqual(logs, ['playlist-url-unsafe']);
    assert.ok(!JSON.stringify(logs).includes(SECRET));
    clock.stop();
  });
}

test('control: the lowercase host still polls', () => {
  const {clock, gets} = build();
  const url = `https://video-weaver.ttvnw.net/v1/playlist/x.m3u8?sig=${SECRET}`;
  clock.start(url);
  assert.deepEqual(gets, [url]);
  clock.stop();
});
