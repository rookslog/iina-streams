'use strict';

// B5 contract: export async resolveTwitch(request, {http, log}) from src/twitch-playback.js.
// request is {kind: 'live', login: string} or {kind: 'vod', id: string}.
// http is iina.http-shaped: post(url, {headers, data}) and get(url, {headers, params}). Its
// responses have {statusCode, reason, data, text}, and HTTP errors reject with that same shape.
// Resolve to {live: boolean, variants: [{name, resolution, bandwidth, fps, url}]}.
// Keep the playlist variant ID as name and the WxH string as resolution. Bandwidth and fps are
// numbers; absent resolution or fps is null. Keep the full variant URL for playback.
// Reject with a code: OFFLINE, NOT_FOUND, RESTRICTED, NETWORK, or MALFORMED. A request still
// pending after 2 seconds is a NETWORK error. The optional log(...args) must omit token, signature,
// and usher query parameters from its output, even when upstream echoes them in an error.
// Usher paths and parameters follow Streamlink 8.6.3 twitch.py (UsherService), the recipe spike #37
// observed working: live /api/v2/channel/hls/<login>.m3u8 with sig, token and fast_bread=true;
// VOD /vod/v2/<id>.m3u8 with nauthsig and nauth (lead correction, 2026-11-22).

const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {inspect} = require('node:util');

const GQL_URL = 'https://gql.twitch.tv/gql';
const WEB_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'; // Public client identifier, not an access token.
const PLAYBACK_HASH = 'ed230aa1e33e07eebb8928504583da78a5173989fadfb1ac94be06a04f3cdbe9';
const LIVE = {kind: 'live', login: 'fixture_channel'};
const VOD = {kind: 'vod', id: '123456789'};
const LIVE_USHER = 'https://usher.ttvnw.net/api/v2/channel/hls/fixture_channel.m3u8';
const VOD_USHER = 'https://usher.ttvnw.net/vod/v2/123456789.m3u8';
const TOKEN = 'fixture-token+A/B=&';
const SIGNATURE = 'fixture-signature+X/Y=';
const MASTER = readFileSync(join(__dirname, 'fixtures', 'twitch-playback', 'master.m3u8'), 'utf8');

const USHER_PARAMS = {
  platform: 'web',
  allow_source: 'true',
  allow_audio_only: 'true',
  playlist_include_framerate: 'true',
  multigroup_video: 'true',
  supported_codecs: 'h264',
};

function resolveTwitch(request, deps) {
  // Load in each case so the intentional red run reports a reason for every test.
  return require('../src/twitch-playback.js').resolveTwitch(request, deps);
}

function response(data, text, statusCode = 200, reason = 'OK') {
  return {statusCode, reason, data, text};
}

function fakeHttp({
  tokenField = 'streamPlaybackAccessToken',
  post = () => {
    const data = {data: {[tokenField]: {value: TOKEN, signature: SIGNATURE}}};
    return Promise.resolve(response(data, JSON.stringify(data)));
  },
  get = () => Promise.resolve(response(null, MASTER)),
} = {}) {
  const calls = [];
  const http = {
    post(url, options) {
      calls.push({method: 'POST', url, options});
      return post(url, options);
    },
    get(url, options) {
      calls.push({method: 'GET', url, options});
      return get(url, options);
    },
  };
  return {http, calls};
}

function assertStringMap(map = {}, label) {
  for (const [key, value] of Object.entries(map)) {
    assert.equal(typeof value, 'string', `${label}.${key} must survive IINA's [String:String] cast`);
  }
}

function assertTokenRequest(call, variables) {
  assert.equal(call.method, 'POST');
  assert.equal(call.url, GQL_URL);
  assertStringMap(call.options.headers, 'GraphQL headers');
  assertStringMap(call.options.params, 'GraphQL params');
  const headers = Object.fromEntries(
    Object.entries(call.options.headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  assert.equal(headers['client-id'], WEB_CLIENT_ID);
  assert.equal(headers['content-type'], 'application/json');
  assert.match(headers['user-agent'], /\S/, 'send an explicit User-Agent');
  const body = call.options.data;
  assert.equal(body.operationName, 'PlaybackAccessToken');
  assert.deepEqual(body.extensions.persistedQuery, {version: 1, sha256Hash: PLAYBACK_HASH});
  assert.deepEqual(body.variables, {...variables, playerType: 'embed', platform: 'site'});
}

function assertUsherRequest(calls, url, params, signed = {sig: SIGNATURE, token: TOKEN}) {
  assert.deepEqual(calls.map(call => call.method), ['POST', 'GET']);
  const request = calls[1];
  assert.equal(request.url, url);
  assertStringMap(request.options.headers, 'usher headers');
  assertStringMap(request.options.params, 'usher params');
  const expected = {...USHER_PARAMS, ...params, ...signed};
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(request.options.params[key], value, `usher params.${key}`);
  }
  assert.match(request.options.params.p, /^\d+$/, 'send a numeric cache buster as a string');
}

test('live requests a GraphQL playback token with login', async () => {
  const {http, calls} = fakeHttp();
  await resolveTwitch(LIVE, {http});
  assertTokenRequest(calls[0], {isLive: true, isVod: false, login: LIVE.login, vodID: ''});
});

test('VOD requests a GraphQL playback token with vodID', async () => {
  const {http, calls} = fakeHttp({tokenField: 'videoPlaybackAccessToken'});
  await resolveTwitch(VOD, {http});
  assertTokenRequest(calls[0], {isLive: false, isVod: true, login: '', vodID: VOD.id});
});

test('live asks usher for a signed master with fast_bread', async () => {
  const {http, calls} = fakeHttp();
  const result = await resolveTwitch(LIVE, {http});
  assertUsherRequest(calls, LIVE_USHER, {fast_bread: 'true'});
  assert.equal(result.live, true);
});

test('VOD asks usher for the signed VOD master', async () => {
  const {http, calls} = fakeHttp({tokenField: 'videoPlaybackAccessToken'});
  const result = await resolveTwitch(VOD, {http});
  assertUsherRequest(calls, VOD_USHER, {}, {nauthsig: SIGNATURE, nauth: TOKEN});
  assert.equal(calls[1].options.params.sig, undefined, 'VOD uses nauthsig, not sig');
  assert.equal(result.live, false);
});

test('the master yields source, five transcodes, and audio-only with their metadata', async () => {
  const {http} = fakeHttp();
  const {variants} = await resolveTwitch(LIVE, {http});
  const expected = [
    ['chunked', '1920x1080', 8450000, 59.94, 'source'],
    ['1080p60', '1920x1080', 6200000, 60, 'video'],
    ['720p60', '1280x720', 3450000, 60, 'video'],
    ['480p', '852x480', 1460000, 30, 'video'],
    ['360p', '640x360', 810000, 30, 'video'],
    ['160p', '284x160', 310000, 30, 'video'],
    ['audio_only', null, 155000, null, 'audio'],
  ].map(([name, resolution, bandwidth, fps, query]) => ({
    name, resolution, bandwidth, fps,
    url: `https://media.example.invalid/live/${name}.m3u8?fixture=${query}`,
  }));
  assert.equal(variants.length, expected.length);
  for (const variant of expected) {
    assert.deepEqual(variants.find(item => item.name === variant.name), variant);
  }
});

test('an usher 404 after a valid token is OFFLINE', async () => {
  const {http} = fakeHttp({get: () => Promise.reject(response(null, 'not found', 404, 'Not Found'))});
  await assert.rejects(resolveTwitch(LIVE, {http}), {code: 'OFFLINE'});
});

test('a null channel token is NOT_FOUND and skips usher', async () => {
  const data = {data: {streamPlaybackAccessToken: null}};
  const {http, calls} = fakeHttp({post: () => Promise.resolve(response(data, JSON.stringify(data)))});
  await assert.rejects(resolveTwitch(LIVE, {http}), {code: 'NOT_FOUND'});
  assert.deepEqual(calls.map(call => call.method), ['POST']);
});

test('an usher 403 with a subscriber-only body is RESTRICTED', async () => {
  const data = [{error: 'restricted', message: 'This video is available to subscribers only.'}];
  const {http} = fakeHttp({
    tokenField: 'videoPlaybackAccessToken',
    get: () => Promise.reject(response(data, JSON.stringify(data), 403, 'Forbidden')),
  });
  await assert.rejects(resolveTwitch(VOD, {http}), {code: 'RESTRICTED'});
});

test('an HTTP transport throw is NETWORK', async () => {
  const {http} = fakeHttp({post() { throw new Error('fixture transport failed'); }});
  await assert.rejects(resolveTwitch(LIVE, {http}), {code: 'NETWORK'});
});

test('a stalled usher request becomes NETWORK at two seconds', {timeout: 1000}, async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const {http, calls} = fakeHttp({get: () => new Promise(() => {})});
  const pending = resolveTwitch(LIVE, {http});
  const result = pending.then(() => 'resolved', error => error.code);

  await new Promise(setImmediate); // Let the token response reach the pending usher request.
  assert.deepEqual(calls.map(call => call.method), ['POST', 'GET']);
  t.mock.timers.tick(1999);
  assert.equal(await Promise.race([result, new Promise(resolve => setImmediate(resolve))]), undefined);
  t.mock.timers.tick(1);
  assert.equal(await result, 'NETWORK');
});

test('a garbage usher playlist is MALFORMED', async () => {
  const {http} = fakeHttp({get: () => Promise.resolve(response(null, '<html>not HLS</html>'))});
  await assert.rejects(resolveTwitch(LIVE, {http}), {code: 'MALFORMED'});
});

test('success and failure logs omit tokens, signatures, and the usher query', async () => {
  const lines = [];
  const log = (...args) => lines.push(inspect(args, {depth: null, maxStringLength: null}));
  const success = fakeHttp();
  await resolveTwitch(LIVE, {http: success.http, log});

  let echoedQuery;
  const failure = fakeHttp({get(url, {params}) {
    echoedQuery = new URLSearchParams(params).toString();
    const reason = `Not Found: ${url}?${echoedQuery}`;
    return Promise.reject(response(null, `${reason}\n${TOKEN}\n${SIGNATURE}`, 404, reason));
  }});
  await assert.rejects(resolveTwitch(LIVE, {http: failure.http, log}), {code: 'OFFLINE'});

  const sentQuery = new URLSearchParams(success.calls[1].options.params).toString();
  for (const line of lines) {
    assert.ok(!line.includes(TOKEN) && !line.includes(encodeURIComponent(TOKEN)), 'logged a playback token');
    assert.ok(!line.includes(SIGNATURE) && !line.includes(encodeURIComponent(SIGNATURE)), 'logged a signature');
    assert.ok(!line.includes(sentQuery) && !line.includes(echoedQuery), 'logged an usher query');
    const queryParameter = /[?&](?:sig|token|nauthsig|nauth|p|allow_source|fast_bread)=/;
    assert.ok(!queryParameter.test(line), 'logged an usher query parameter');
  }
});
