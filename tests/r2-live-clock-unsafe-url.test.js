'use strict';
// v0.5.5 review r2 #1 (clock part): IINA embeds a disallowed or invalid URL in its http.get exception
// (JavascriptAPIHttp.swift L116-125), so the clock must validate the signed playlist URL first.
const test = require('node:test');
const assert = require('node:assert/strict');
const {createLiveClock} = require('../src/live-clock.js');

const SECRET = 'SECRETSIG123';
const UNSAFE = [
  `https://evil.example.com/v.m3u8?sig=${SECRET}`,
  `http://video-weaver.ttvnw.net/v.m3u8?sig=${SECRET}`,
  `https://user:pw@video-weaver.ttvnw.net/v.m3u8?sig=${SECRET}`,
  `https://video-weaver.ttvnw.net:8443/v.m3u8?sig=${SECRET}`,
  `file:///etc/passwd?sig=${SECRET}`,
  '',
  null,
];
const SAFE = `https://video-weaver.ttvnw.net/v1/playlist/x.m3u8?sig=${SECRET}`;

function build() {
  const gets = [];
  const logs = [];
  const timers = [];
  const clock = createLiveClock({
    http: {get: url => { gets.push(url); return new Promise(() => {}); }},
    readPlayer: () => ({timePos: 1, cacheEnd: 2}),
    estimator: {addSample() {}, behindLive: () => null},
    setTimer: callback => { timers.push(callback); return callback; },
    clearTimer() {},
    now: () => 1_000_000,
    log: code => logs.push(code),
  });
  return {clock, gets, logs};
}

for (const url of UNSAFE) {
  test(`an unsafe playlist URL makes no http.get call and is never logged: ${String(url).slice(0, 40)}`, () => {
    const {clock, gets, logs} = build();
    clock.start(url);
    assert.equal(gets.length, 0, 'no request is made');
    assert.deepEqual(logs, ['playlist-url-unsafe'], 'a fixed code is recorded');
    assert.ok(!JSON.stringify(logs).includes(SECRET), 'the log never contains the URL');
    clock.stop();
  });
}

test('control: a Twitch playlist URL is fetched', () => {
  const {clock, gets, logs} = build();
  clock.start(SAFE);
  assert.deepEqual(gets, [SAFE]);
  assert.deepEqual(logs, []);
  clock.stop();
});
