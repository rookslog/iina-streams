'use strict';

// #67 round 2 (docs/reviews/2026-11-22-issue-67-review.md, lead disposition): global checks a Twitch channel
// before it creates a player, with one small request. Offline: the Open Stream window lists the recent broadcasts
// and no player is created. Live, an unknown channel, or a check that failed or took over 1.5 s: the player is
// created as before, and resolves on its own. VOD and YouTube inputs are not checked.
// Residual race: a channel that goes offline after the check keeps the in-player path (source-offline).
//
// The real global.js and src/twitch-vods.js run in the IINA shim; only Twitch's HTTP replies are a double, routed
// by request: the signed-out GQL user(login){stream{id}} POST and the archives POST. The signed-in path (Helix
// Get Streams, src/twitch-helix.js) is driven through channelStatus with credentials at the end of this file.
// Reply shapes are hand-written from the queries and the Twitch API reference, not captured.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Sources = require('../src/source.js');
const {channelStatus} = require('../src/twitch-vods.js');
const {createIina} = require('./support/iina-shim.js');

const config = {identifier: 'local.iina.streams.precheck-test', variant: 'unified'};
const LOGIN = 'fixture_channel';
const LIVE = Sources.parse(LOGIN);
const UNAVAILABLE = {statusCode: 503, reason: 'Service Unavailable', text: ''};
const settle = async () => {
  for (let round = 0; round < 5; round++) await new Promise(resolve => setImmediate(resolve));
};

function archives(count) {
  const edges = Array.from({length: count}, (_, index) => ({node: {
    id: String(1234567890 + index), title: `Archive ${index}`, createdAt: '2026-11-20T10:31:57Z',
    lengthSeconds: 3600 + index,
  }}));
  return {statusCode: 200, data: {data: {user: {videos: {edges}}}}};
}

// Replies to the signed-out stream query, by mode.
const STREAM_REPLIES = {
  live: () => Promise.resolve({statusCode: 200, data: {data: {user: {stream: {id: '42'}}}}}),
  offline: () => Promise.resolve({statusCode: 200, data: {data: {user: {stream: null}}}}),
  'no-user': () => Promise.resolve({statusCode: 200, data: {data: {user: null}}}),
  down: () => Promise.reject(UNAVAILABLE),
  transport: () => Promise.reject(new Error('transport')),
  hang: () => new Promise(() => {}),
};

// iina.http-shaped, recording {method, url, query} for every request.
function twitchHttp(mode) {
  const calls = [];
  function post(url, options) {
    const query = String(options && options.data && options.data.query || '');
    calls.push({method: 'POST', url, query});
    if (query.includes('stream{id}')) return STREAM_REPLIES[mode]();
    return Promise.resolve(archives(1));
  }
  function get(url) {
    calls.push({method: 'GET', url});
    return Promise.reject(UNAVAILABLE);
  }
  return {calls, api: {get, post}};
}

function loadGlobal(mode) {
  const shim = createIina({role: 'global', identifier: config.identifier});
  const http = twitchHttp(mode);
  const modules = new Map([
    ['./config.js', config],
    ['./src/source.js', Sources],
    ['./src/auth.js', require('../src/auth.js')],
    ['./src/timers.js', require('../src/timers.js')],
    ['./src/twitch-app.js', {clientID: ''}],
    ['./src/twitch-vods.js', require('../src/twitch-vods.js')],
    ['./src/bridge.js', require('../src/bridge.js')],
    ['./src/listeners.js', require('../src/listeners.js')],
  ]);
  const iina = Object.assign({}, shim.iina, {http: http.api});
  const context = shim.runScript(path.join(__dirname, '../global.js'), {
    globals: {iina},
    require(name) {
      if (!modules.has(name)) throw new Error('Unexpected module ' + name);
      return modules.get(name);
    },
  });
  const win = shim.standaloneWindow;
  function lists() {
    return win.posts.filter(post => post.name === 'offline-vods')
      .map(post => JSON.parse(decodeURIComponent(post.data.encoded)));
  }
  const streamChecks = () => http.calls.filter(call => call.query && call.query.includes('stream{id}'));
  return {shim, context, win, http, lists, streamChecks, opens: () => shim.global.opens};
}

async function submit(fixture, input) {
  fixture.context.openStream();
  fixture.win.send('open-ready', {});
  fixture.win.send('open-stream', {input});
  await settle();
  fixture.win.send('open-ready', {});
  await settle();
}

test('#67 an offline channel creates no player and lists its broadcasts', async () => {
  for (const input of [LOGIN, 'https://www.twitch.tv/' + LOGIN]) {
    const fixture = loadGlobal('offline');
    await submit(fixture, input);
    assert.equal(fixture.streamChecks().length, 1, 'one status request');
    assert.deepEqual(fixture.opens(), [], `${input}: no player is created`);
    assert.equal(fixture.win.visible, true, 'the Open Stream window shows');
    assert.deepEqual(fixture.win.posts.find(post => post.name === 'prefill').data, {input: LOGIN});
    assert.equal(fixture.lists().at(-1).state, 'ready', 'the recent broadcasts are listed');
    assert.equal(fixture.lists().at(-1).items.length, 1);
  }
});

test('#67 a live channel creates the player as before, after one status request', async () => {
  const fixture = loadGlobal('live');
  await submit(fixture, LOGIN);
  assert.equal(fixture.streamChecks().length, 1, 'one status request');
  assert.deepEqual(fixture.http.calls.filter(call => call.method === 'GET'), [], 'no playback token or usher fetch');
  assert.equal(fixture.opens().length, 1, 'one player');
  assert.equal(fixture.opens()[0].url, LIVE.url);
  assert.equal(fixture.opens()[0].label, Sources.label(LIVE, config.variant));
  assert.deepEqual(fixture.lists(), [], 'no broadcast list');
});

test('#67 an unknown channel or a failed check still creates the player', async () => {
  for (const mode of ['no-user', 'down', 'transport']) {
    const fixture = loadGlobal(mode);
    fixture.context.openStream(LOGIN);
    await settle();
    assert.equal(fixture.streamChecks().length, 1, 'precondition: the check ran');
    assert.equal(fixture.opens().length, 1, `${mode}: the player opens`);
    assert.deepEqual(fixture.lists(), []);
  }
});

test('#67 a check with no answer within 1.5 s creates the player', async () => {
  const fixture = loadGlobal('hang');
  fixture.context.openStream(LOGIN);
  await settle();
  fixture.shim.timers.advance(1499);
  await settle();
  assert.equal(fixture.opens().length, 0, 'still waiting at 1499 ms');
  fixture.shim.timers.advance(1);
  await settle();
  assert.equal(fixture.opens().length, 1, 'the player opens at 1500 ms');
});

test('#67 VOD and YouTube inputs open a player at once, with no check', async () => {
  for (const input of ['https://www.twitch.tv/videos/1234567890', 'https://youtu.be/abcdefghijk']) {
    const fixture = loadGlobal('offline');
    fixture.context.openStream(input);
    assert.equal(fixture.opens().length, 1, `${input}: the player opens synchronously`);
    await settle();
    assert.deepEqual(fixture.http.calls, [], `${input}: no live check`);
    assert.deepEqual(fixture.lists(), []);
  }
});

test('#67 an offline answer for an older input does not cover a newer one', async () => {
  const fixture = loadGlobal('offline');
  fixture.context.openStream(LOGIN);
  fixture.context.openStream('https://youtu.be/abcdefghijk');
  await settle();
  assert.equal(fixture.opens().length, 1, 'only the YouTube player');
  assert.equal(fixture.win.loads.length, 0, 'the stale offline answer opens no window');
});

test('#67 residual race: a channel that goes offline after a live check still lists through source-offline', async () => {
  const fixture = loadGlobal('live');
  fixture.context.openStream(LOGIN);
  await settle();
  assert.equal(fixture.opens().length, 1, 'precondition: the live check created player 1');
  await fixture.shim.global.send('source-offline', {login: LOGIN}, '1-' + config.identifier);
  await settle();
  fixture.win.send('open-ready', {});
  await settle();
  assert.equal(fixture.lists().at(-1).state, 'ready', 'the in-player path still lists the broadcasts');
});

// ---- signed in: Helix Get Streams (D-034) ----

const CREDENTIALS = {token: 'fixture-token', clientID: 'fixture-client', login: 'viewer'};

// Helix replies by path: /streams lists `streams`, /users lists `users`.
function helixHttp({streams, users, fail}) {
  const calls = [];
  function get(url, options) {
    calls.push({method: 'GET', url, params: options && options.params, auth: options && options.headers.Authorization});
    if (fail) return Promise.reject(fail);
    if (url.endsWith('/streams')) return Promise.resolve({statusCode: 200, data: {data: streams}});
    if (url.endsWith('/users')) return Promise.resolve({statusCode: 200, data: {data: users}});
    return Promise.reject(UNAVAILABLE);
  }
  function post(url) {
    calls.push({method: 'POST', url});
    return Promise.reject(UNAVAILABLE);
  }
  return {calls, api: {get, post}};
}

test('#67 signed in, the check uses Helix Get Streams with the viewer token and never GQL', async () => {
  const cases = [
    [{streams: [{id: '42', user_login: LOGIN}], users: []}, 'live', 1],
    [{streams: [], users: [{id: '7', login: LOGIN}]}, 'offline', 2],
    [{streams: [], users: []}, 'unknown', 2],
    [{fail: {statusCode: 401, reason: 'Unauthorized', text: ''}}, 'unknown', 1],
  ];
  for (const [reply, expected, requests] of cases) {
    const http = helixHttp(reply);
    const status = await channelStatus({login: LOGIN}, {http: http.api, credentials: CREDENTIALS});
    assert.equal(status, expected, JSON.stringify(reply));
    assert.equal(http.calls.length, requests);
    assert.deepEqual(http.calls.filter(call => call.method === 'POST'), [], 'no GQL when signed in');
    assert.equal(http.calls[0].url, 'https://api.twitch.tv/helix/streams');
    assert.deepEqual(http.calls[0].params, {user_login: LOGIN});
    assert.equal(http.calls[0].auth, 'Bearer fixture-token');
  }
});

test('#67 global signed in with a saved login checks through Helix with that login\'s token', async () => {
  const shim = createIina({role: 'global', identifier: config.identifier});
  const saved = {clientID: 'c'.repeat(30), access_token: 'saved-precheck-token', refresh_token: 'saved-precheck-refresh'};
  shim.keychain.seed('twitch-readonly', 'oauth', JSON.stringify(saved));
  const calls = [];
  const validated = {statusCode: 200, data: {client_id: saved.clientID, login: 'reader', scopes: ['chat:read'], expires_in: 5000}};
  const http = {
    get(url, options) {
      calls.push({method: 'GET', url, auth: options && options.headers && options.headers.Authorization});
      if (url.endsWith('/oauth2/validate')) return Promise.resolve(validated);
      if (url.endsWith('/helix/streams')) return Promise.resolve({statusCode: 200, data: {data: []}});
      if (url.endsWith('/helix/users')) return Promise.resolve({statusCode: 200, data: {data: [{id: '7'}]}});
      return Promise.reject(UNAVAILABLE);
    },
    post(url, options) {
      calls.push({method: 'POST', url, query: options && options.data && options.data.query});
      return Promise.resolve(archives(1));
    },
  };
  const modules = new Map([
    ['./config.js', config], ['./src/source.js', Sources], ['./src/auth.js', require('../src/auth.js')],
    ['./src/timers.js', require('../src/timers.js')], ['./src/twitch-app.js', {clientID: ''}],
    ['./src/twitch-vods.js', require('../src/twitch-vods.js')], ['./src/bridge.js', require('../src/bridge.js')],
    ['./src/listeners.js', require('../src/listeners.js')],
  ]);
  shim.runScript(path.join(__dirname, '../global.js'), {
    globals: {iina: Object.assign({}, shim.iina, {http})},
    require: name => modules.get(name),
  });
  await shim.global.send('auth-connect', {}, '0');
  await settle();
  shim.timers.flush(0);
  assert.ok(shim.global.posts.some(post => post.name === 'auth-ready'), 'precondition: global holds credentials');
  const before = calls.length;
  shim.global.send('open', {input: LOGIN}, '0');
  await settle();
  const check = calls.slice(before);
  assert.equal(check[0].url, 'https://api.twitch.tv/helix/streams', 'Helix first, not GQL');
  assert.equal(check[0].auth, 'Bearer saved-precheck-token');
  assert.ok(!check.some(call => call.query && call.query.includes('stream{id}')), 'no GQL status query');
  assert.deepEqual(shim.global.opens, [], 'offline: no player');
});

test('#67 signed out, or with an empty token, the check is one anonymous GQL request', async () => {
  for (const credentials of [null, {token: '', clientID: 'fixture-client'}]) {
    const http = twitchHttp('offline');
    const status = await channelStatus({login: LOGIN}, {http: http.api, credentials});
    assert.equal(status, 'offline');
    assert.equal(http.calls.length, 1);
    assert.equal(http.calls[0].url, 'https://gql.twitch.tv/gql');
  }
});
