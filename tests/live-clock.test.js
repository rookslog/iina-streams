'use strict';

// C2a assumed API: src/live-clock.js exports createLiveClock(deps) and parseNewestSegmentEnd(text).
// The parser returns the last regular segment's end in epoch seconds, or null. The design's
// "12-hour form" is treated here as an ISO PDT timestamp with hour 12, in either UTC notation.
// Deps: http.get(url, {headers, params}) resolves to {text}; readPlayer() returns {timePos, cacheEnd};
// setTimer(callback, delayMs) and clearTimer(id) are one-shot timers; now() returns epoch milliseconds.
// estimator.addSample({now, newestSegmentEnd, rawCacheEnd}) and estimator.behindLive({now, rawTimePos})
// use seconds. Optional controls are intervalMs, staleMs and log(code).
// The returned clock exposes start(url), stop(), behindLive(), and goLiveTarget().

const test = require('node:test');
const assert = require('node:assert/strict');
const {inspect} = require('node:util');

const MEDIA_URL = 'https://example.invalid/v.m3u8?sig=FAKE';
const REPLACEMENT_URL = 'https://example.invalid/replacement.m3u8?sig=ALSO-FAKE';
const INTERVAL_MS = 1250;
const STALE_MS = 5000;
const NEWEST_END = 946728010.75; // 2000-01-01 at 12:00:09.125 UTC plus 1.625 seconds.

function playlist(zone = 'Z') {
  return [
    '#EXTM3U',
    '#EXT-X-TARGETDURATION:4',
    `#EXT-X-PROGRAM-DATE-TIME:2000-01-01T12:00:05.500${zone}`,
    '#EXTINF:3.625,',
    'old.ts',
    `#EXT-X-PROGRAM-DATE-TIME:2000-01-01T12:00:09.125${zone}`,
    '#EXTINF:1.625,',
    'newest.ts',
    '',
  ].join('\n');
}

const PLAYLIST = playlist() + '#EXT-X-TWITCH-PREFETCH:prefetch.ts\n';

function parseSegmentEnd(text) {
  // Load per case so the test-first run reports the missing module for each behavior.
  return require('../src/live-clock.js').parseNewestSegmentEnd(text);
}

function harness({get = async () => ({text: PLAYLIST})} = {}) {
  const {createLiveClock} = require('../src/live-clock.js');
  let nowMs = 946728020500;
  let nextTimerId = 0;
  const timers = new Map();
  const requests = [];
  const samples = [];
  const estimates = [];
  const logs = [];

  const clock = createLiveClock({
    http: {
      get(url, options) {
        // Record the exact promise returned by the async fake so tests can wait for individual polls.
        const response = get(url, options);
        requests.push({url, options, response});
        return response;
      },
    },
    readPlayer: () => ({timePos: 31.25, cacheEnd: 36.5}),
    estimator: {
      addSample(sample) { samples.push(sample); },
      behindLive(input) {
        estimates.push(input);
        return 14.5;
      },
      reset() {},
    },
    setTimer(callback, delayMs) {
      const id = ++nextTimerId;
      timers.set(id, {callback, dueMs: nowMs + delayMs});
      return id;
    },
    clearTimer(id) { timers.delete(id); },
    now: () => nowMs,
    intervalMs: INTERVAL_MS,
    staleMs: STALE_MS,
    log: (...args) => logs.push(args),
  });

  function advance(ms) {
    nowMs += ms;
    for (const [id, {callback, dueMs}] of [...timers]) {
      if (dueMs <= nowMs && timers.delete(id)) callback();
    }
  }

  async function startPolling(url = MEDIA_URL) {
    const index = requests.length;
    clock.start(url);
    await Promise.resolve();
    // Both an immediate first poll and a first poll after one interval satisfy the contract.
    if (requests.length === index) advance(INTERVAL_MS);
    assert.equal(requests.length, index + 1);
    return index;
  }

  async function waitForRequest(index) {
    assert.ok(requests[index], `Expected playlist request ${index + 1}`);
    // A poll must handle its own errors; this wait only drains the fake HTTP response.
    await requests[index].response.catch(() => {});
  }

  return {clock, timers, requests, samples, estimates, logs, advance, startPolling, waitForRequest,
    now: () => nowMs,
  };
}

test('parser adds the last regular segment duration to its noon PDT with Z', () => {
  assert.equal(parseSegmentEnd(playlist()), NEWEST_END);
});

test('parser accepts a noon PDT with an explicit +00:00 zone', () => {
  assert.equal(parseSegmentEnd(playlist('+00:00')), NEWEST_END);
});

test('parser ignores trailing Twitch prefetch lines', () => {
  assert.equal(parseSegmentEnd(PLAYLIST + '#EXT-X-TWITCH-PREFETCH:another-prefetch.ts\n'), NEWEST_END);
});

test('parser returns null for regular segments without PDT', () => {
  assert.equal(parseSegmentEnd('#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:1.625,\nsegment.ts\n'), null);
});

test('a scheduled poll feeds the estimator epoch seconds and the unshifted player timeline', async () => {
  const run = harness();
  assert.equal(run.clock.behindLive(), null);
  assert.equal(run.clock.goLiveTarget(), null);
  assert.deepEqual(run.estimates, []);

  const firstPoll = await run.startPolling();
  await run.waitForRequest(firstPoll);
  const firstSampleAt = run.now() / 1000;
  run.advance(INTERVAL_MS);
  await run.waitForRequest(firstPoll + 1);
  assert.deepEqual(run.samples, [
    {now: firstSampleAt, newestSegmentEnd: NEWEST_END, rawCacheEnd: 36.5},
    {now: firstSampleAt + 1.25, newestSegmentEnd: NEWEST_END, rawCacheEnd: 36.5},
  ]);
  assert.equal(run.clock.goLiveTarget(), 34.5);

  run.advance(250);
  assert.equal(run.clock.behindLive(), 14.5);
  assert.deepEqual(run.estimates, [{now: run.now() / 1000, rawTimePos: 31.25}]);
});

const BAD_RESPONSES = [
  {
    name: 'a fetch error',
    code: 'playlist-fetch',
    get: async url => { throw new Error(`Synthetic fetch error at ${url}`); },
  },
  {
    name: 'malformed playlist text',
    code: 'playlist-malformed',
    get: async url => ({text: `Invalid playlist containing ${url}`}),
  },
];

for (const {name, code, get} of BAD_RESPONSES) {
  test(`${name} adds no sample and logs only its code without the URL`, async () => {
    const run = harness({get});
    await run.waitForRequest(await run.startPolling());

    assert.deepEqual(run.samples, []);
    for (const args of run.logs) {
      for (const arg of args) {
        const value = typeof arg === 'string' ? arg : inspect(arg);
        assert.ok(!value.includes(MEDIA_URL), 'a log argument contained the playlist URL');
      }
    }
    assert.deepEqual(run.logs, [[code]]);
  });
}

test('the live estimate becomes stale based on the last good sample, not the last poll', async () => {
  let hasGoodPlaylist = true;
  const run = harness({get: async () => ({text: hasGoodPlaylist ? PLAYLIST : 'malformed'})});
  const poll = await run.startPolling();
  await run.waitForRequest(poll);
  assert.equal(run.clock.behindLive(), 14.5);

  hasGoodPlaylist = false;
  run.advance(STALE_MS - 1);
  await run.waitForRequest(poll + 1);
  assert.equal(run.clock.behindLive(), 14.5);

  run.advance(2);
  assert.equal(run.clock.behindLive(), null);
  assert.equal(run.estimates.length, 2, 'stale reads must not call the estimator');
});

test('stop clears the scheduled poll and prevents further fetches even when called twice', async () => {
  const run = harness();
  const firstPoll = await run.startPolling();
  await run.waitForRequest(firstPoll);

  run.advance(INTERVAL_MS - 1);
  assert.equal(run.requests.length, 1);
  run.advance(1);
  await run.waitForRequest(firstPoll + 1);
  assert.equal(run.requests.length, 2);
  assert.ok(run.timers.size > 0, 'a poll must still be scheduled before stopping');

  run.clock.stop();
  run.clock.stop();
  assert.equal(run.timers.size, 0);
  run.advance(3 * INTERVAL_MS);
  await Promise.resolve();
  assert.equal(run.requests.length, 2);
});

test('restarting ignores an older response that resolves after the new sample', async () => {
  let respondToOldRequest;
  const oldResponse = new Promise(resolve => { respondToOldRequest = resolve; });
  const run = harness({get: async url => url === MEDIA_URL ? oldResponse : {text: PLAYLIST}});
  const oldPoll = await run.startPolling();
  assert.deepEqual(run.samples, []);

  const newPoll = await run.startPolling(REPLACEMENT_URL);
  await run.waitForRequest(newPoll);
  assert.deepEqual(run.requests.map(({url}) => url), [MEDIA_URL, REPLACEMENT_URL]);
  const expected = [{now: run.now() / 1000, newestSegmentEnd: NEWEST_END, rawCacheEnd: 36.5}];
  assert.deepEqual(run.samples, expected);

  respondToOldRequest({text: PLAYLIST.replace('#EXTINF:1.625,', '#EXTINF:2.625,')});
  await run.waitForRequest(oldPoll);
  assert.deepEqual(run.samples, expected);
});

test('playlist GET keeps the synthetic URL intact and supplies string-only header and param maps', async () => {
  const run = harness();
  const poll = await run.startPolling();
  await run.waitForRequest(poll);
  const {url, options} = run.requests[poll];

  assert.equal(url, MEDIA_URL);
  for (const name of ['headers', 'params']) {
    for (const [key, value] of Object.entries(options[name])) {
      assert.equal(typeof value, 'string', `${name}.${key} must be a string`);
    }
  }
  assert.deepEqual(options, {headers: {}, params: {}});
});
