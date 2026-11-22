'use strict';
// v0.5.5 review r3 #1: IINA's http allowlist (Info.json allowedDomains) matches by dotted suffix, so the
// apexes ttvnw.net and twitchcdn.net are denied and IINA's denial exception contains the full signed URL
// (JavascriptPluginInstance.swift L80-L95, JavascriptAPIHttp.swift L116-L125, IINA v1.5.1). The clock must
// apply the same match before it polls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createLiveClock, HTTP_ALLOWED_DOMAINS} = require('../src/live-clock.js');

const SIGNATURE = 'SYNTHETIC-SIG-r3clock';
const PLAYLIST = [
  '#EXTM3U',
  '#EXT-X-PROGRAM-DATE-TIME:2026-11-22T10:00:00.000Z',
  '#EXTINF:2.000,',
  'seg.ts',
].join('\n');

function makeClock() {
  const calls = [];
  const logs = [];
  const clock = createLiveClock({
    http: {get: url => { calls.push(url); return Promise.resolve({text: PLAYLIST}); }},
    readPlayer: () => ({timePos: 1, cacheEnd: 2}),
    estimator: {addSample() {}, behindLive: () => null},
    setTimer: () => 1,
    clearTimer() {},
    now: () => 1_000_000,
    log: code => logs.push(String(code)),
  });
  return {clock, calls, logs};
}

for (const host of ['ttvnw.net', 'twitchcdn.net', 'example.com', 'evilttvnw.net', 'ttvnw.net.evil.com']) {
  test(`the clock makes no http call for ${host}`, () => {
    const {clock, calls, logs} = makeClock();
    clock.start(`https://${host}/v.m3u8?sig=${SIGNATURE}`);
    assert.equal(calls.length, 0);
    for (const entry of logs) assert.equal(entry.includes(SIGNATURE) || entry.includes(host), false, entry);
  });
}

for (const host of ['video-weaver.ttvnw.net', 'a.b.twitchcdn.net']) {
  test(`the clock still polls ${host}`, () => {
    const {clock, calls} = makeClock();
    clock.start(`https://${host}/v.m3u8?sig=${SIGNATURE}`);
    assert.equal(calls.length, 1);
    clock.stop();
  });
}

test('the clock host list equals Info.json allowedDomains', () => {
  const info = JSON.parse(fs.readFileSync(path.join(__dirname, '../Info.json'), 'utf8'));
  assert.deepEqual([...HTTP_ALLOWED_DOMAINS], info.allowedDomains);
});
