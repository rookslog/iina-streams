'use strict';

// Assumed CommonJS API: createHelix({http, clientID, token, log}) returns
// {followedLive({userID}), recentVODs({login})}. Both methods resolve to arrays or reject
// with an Error carrying `code`; RATE_LIMITED also carries `resetAt` (the raw header string).
// `http` is IINA's HTTP API and `log(...args)` is the diagnostic sink. Stream thumbnails
// retain Twitch's size placeholders, and VOD durations retain Twitch's duration string.
const test = require('node:test');
const assert = require('node:assert/strict');
const {formatWithOptions} = require('node:util');
const Sources = require('../src/source.js');
const {createIina} = require('./support/iina-shim.js');
const streams = require('./fixtures/twitch-helix/followed-streams.js');
const users = require('./fixtures/twitch-helix/users.js');
const videos = require('./fixtures/twitch-helix/videos.js');

const BASE = 'https://api.twitch.tv/helix';
const FOLLOWED = '/streams/followed';
const USER_ID = '1001';
const LOGIN = 'pixel_harbor';
const CLIENT_ID = 'fixture-client-id';
const TOKEN = 'fixture-token';
const FOLLOWED_PARAMS = {user_id: USER_ID, first: '100'};
const VIDEO_PARAMS = {user_id: '2002', type: 'archive', first: '10'};

function setup(t, ...responses) {
  // Load inside each test so the missing module is reported against each B6 case.
  const {createHelix} = require('../src/twitch-helix.js');
  const shim = createIina();
  const calls = shim.http.calls;
  const logs = [];
  const http = {
    ...shim.iina.http,
    async get(url, options) {
      // Check raw values before the shim's JSON copy can drop undefined fields.
      for (const [name, fields] of Object.entries({params: options?.params, headers: options?.headers})) {
        for (const [key, value] of Object.entries(fields ?? {})) {
          assert.equal(typeof value, 'string', `${name}.${key} must be a string`);
        }
      }
      const response = responses[calls.length];
      if (response instanceof Error) shim.http.failTransport(response);
      else if (response?.statusCode >= 400) shim.http.rejectResponse(response);
      else shim.http.setResponse(response);
      return shim.iina.http.get(url, options);
    }
  };
  const log = (...args) => logs.push(formatWithOptions({colors: false, depth: null}, ...args));
  t.after(() => assert.equal(logs.join('\n').includes(TOKEN), false, 'diagnostics must omit the bearer token'));
  t.after(() => assert.equal(calls.length, responses.length, 'unexpected number of HTTP requests'));
  return {helix: createHelix({http, clientID: CLIENT_ID, token: TOKEN, log}), calls};
}

function ok(data) {
  return {statusCode: 200, data};
}

function assertGet(call, path, params) {
  assert.equal(call.method, 'GET');
  assert.equal(call.url, BASE + path);
  assert.deepEqual(call.options.params, params);
  assert.equal(call.options.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(call.options.headers['Client-Id'], CLIENT_ID);
}

test('followedLive sends an authenticated GET and maps an empty list', async t => {
  const {helix, calls} = setup(t, ok(streams.empty));

  assert.deepEqual(await helix.followedLive({userID: USER_ID}), []);
  assertGet(calls[0], FOLLOWED, FOLLOWED_PARAMS);
});

test('followedLive passes the cursor, maps both pages, and sorts by viewers descending', async t => {
  const {helix, calls} = setup(t, ok(streams.pageOne), ok(streams.pageTwo));

  const result = await helix.followedLive({userID: USER_ID});

  assertGet(calls[0], FOLLOWED, FOLLOWED_PARAMS);
  assertGet(calls[1], FOLLOWED, {...FOLLOWED_PARAMS, after: 'fixture-page+2/='});
  assert.deepEqual(result, [
    {
      login: 'pixel_harbor',
      name: 'Pixel Harbor',
      title: 'Building the docks',
      game: 'Minecraft',
      viewers: 103,
      startedAt: '2026-11-22T04:00:00Z',
      thumbnail: 'https://static-cdn.jtvnw.net/previews-ttv/live_user_pixel_harbor-{width}x{height}.jpg'
    },
    {
      login: 'quiet_station',
      name: 'Quiet Station',
      title: 'Late night radio',
      game: 'Just Chatting',
      viewers: 9,
      startedAt: '2026-11-22T03:00:00Z',
      thumbnail: 'https://static-cdn.jtvnw.net/previews-ttv/live_user_quiet_station-{width}x{height}.jpg'
    }
  ]);
});

test('recentVODs looks up the login, requests archives, and returns URLs that round-trip', async t => {
  const {helix, calls} = setup(t, ok(users), ok(videos.archives));

  const result = await helix.recentVODs({login: LOGIN});

  assertGet(calls[0], '/users', {login: LOGIN});
  assertGet(calls[1], '/videos', VIDEO_PARAMS);
  assert.deepEqual(result, [
    {
      id: '2700000123',
      title: 'Lighthouse build',
      createdAt: '2026-11-21T19:00:00Z',
      duration: '1h5m3s',
      url: 'https://www.twitch.tv/videos/2700000123'
    },
    {
      id: '2700000088',
      title: 'Sketching the harbor',
      createdAt: '2026-11-20T19:00:00Z',
      duration: '47m9s',
      url: 'https://www.twitch.tv/videos/2700000088'
    }
  ]);
  for (const {id, url} of result) {
    assert.deepEqual(Sources.parse(url), {kind: 'twitch-vod', provider: 'Twitch', id, url, startSeconds: 0});
  }
});

test('recentVODs maps an empty archive list', async t => {
  const {helix} = setup(t, ok(users), ok(videos.empty));

  assert.deepEqual(await helix.recentVODs({login: LOGIN}), []);
});

function unauthorized(message) {
  return {statusCode: 401, data: {error: 'Unauthorized', status: 401, message}};
}

test('followedLive maps a 401 naming the missing follow scope to NEEDS_PERMISSION', async t => {
  const {helix} = setup(t, unauthorized('Missing scope: user:read:follows'));

  await assert.rejects(helix.followedLive({userID: USER_ID}), {code: 'NEEDS_PERMISSION'});
});

test('followedLive maps any other 401 to SIGNED_OUT', async t => {
  const {helix} = setup(t, unauthorized('Invalid OAuth token'));

  await assert.rejects(helix.followedLive({userID: USER_ID}), {code: 'SIGNED_OUT'});
});

test('followedLive maps 429 to RATE_LIMITED and preserves the reset header', async t => {
  const {helix} = setup(t, {
    statusCode: 429,
    headers: {'Ratelimit-Reset': '1795323000'},
    data: {error: 'Too Many Requests', status: 429, message: 'Rate limit exceeded'}
  });

  await assert.rejects(helix.followedLive({userID: USER_ID}), {code: 'RATE_LIMITED', resetAt: '1795323000'});
});

test('followedLive maps a transport failure to NETWORK without logging its echoed token', async t => {
  const {helix} = setup(t, new Error(`Connection reset while sending Authorization: Bearer ${TOKEN}`));

  await assert.rejects(helix.followedLive({userID: USER_ID}), {code: 'NETWORK'});
});

test('followedLive maps a non-array response to MALFORMED', async t => {
  const {helix} = setup(t, ok({data: {}, pagination: {}}));

  await assert.rejects(helix.followedLive({userID: USER_ID}), {code: 'MALFORMED'});
});

test('recentVODs maps a non-array video response to MALFORMED', async t => {
  const {helix} = setup(t, ok(users), ok({data: {}, pagination: {}}));

  await assert.rejects(helix.recentVODs({login: LOGIN}), {code: 'MALFORMED'});
});
