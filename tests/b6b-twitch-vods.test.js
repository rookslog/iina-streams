'use strict';

// B6b / D-030 contract: recentArchives({login}, {http, log, limit = 10}) uses one signed-out GQL POST.
// It resolves to {ok: true, vods: [{id, title, createdAt, lengthSeconds, url}]} or {ok: false, code}.
// Host model: IINA v1.5.1 JavascriptAPIHttp.swift request() and HTTPResult.toDict():
// https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPIHttp.swift#L88-L105
// https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPIHttp.swift#L153-L160
// A failed dictionary cast sends {}; unsuccessful HTTP results reject with the same response envelope.

const test = require('node:test');
const assert = require('node:assert/strict');
const {inspect} = require('node:util');
const Sources = require('../src/source.js');
const {isPlainObject} = require('./support/iina-shim.js');

const LOGIN = 'fixture_offline';
const CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'; // The public web Client-ID in twitch-playback.js.
const GQL_URL = 'https://gql.twitch.tv/gql';
const UPSTREAM_URL = 'https://fixture.invalid/untrusted-response';

// Hand-written fixtures shaped-from-observation (B6b); not recordings of Twitch responses.
const ARCHIVES = {data: {user: {videos: {edges: [
  {node: {id: '1234567890', title: 't', createdAt: '2026-11-20T10:31:57Z', lengthSeconds: 171258}},
]}}}};
const UNKNOWN_USER = {data: {user: null}};

function stringDictionary(value) {
  return isPlainObject(value) && Object.values(value).every(item => typeof item === 'string') ? value : {};
}

function hostHttp({data = ARCHIVES, statusCode = 200, transportError} = {}) {
  const requests = [];
  const http = Object.fromEntries(['get', 'post', 'put', 'patch', 'delete'].map(method => [method,
    async (url, options = {}) => {
      const body = isPlainObject(options.data) ? options.data : {};
      const headers = stringDictionary(options.headers);
      const params = stringDictionary(options.params);
      requests.push({method, url, body, headers, params});
      if (transportError) throw transportError;

      const ok = statusCode >= 200 && statusCode < 300;
      const payload = typeof body.query === 'string' && Object.keys(headers).length > 0
        ? data : {errors: [{message: 'Missing query or headers after host casts'}]};
      const response = {statusCode, reason: ok ? 'OK' : 'Service Unavailable',
        data: payload, text: JSON.stringify(payload)};
      if (!ok) throw response;
      return response;
    },
  ]));
  return {http, requests};
}

async function fetchArchives(host, limit) {
  // Load inside the test so the test runner reports every case while the module does not yet exist.
  const {recentArchives} = require('../src/twitch-vods.js');
  const logs = [];
  const result = await recentArchives({login: LOGIN}, {http: host.http, log: (...args) => logs.push(args), limit});
  const captured = inspect(logs, {depth: null, maxArrayLength: null, maxStringLength: null});
  assert.doesNotMatch(captured, /\b[a-z][a-z\d+.-]*:\/\//i, 'no log argument may contain a URL, even on failure');
  return result;
}

test('B6b archives use one signed-out, IINA-compatible POST with the default limit', async () => {
  const host = hostHttp();
  await fetchArchives(host);

  assert.equal(host.requests.length, 1);
  const [{method, url, body, headers}] = host.requests;
  assert.equal(method, 'post');
  assert.equal(url, GQL_URL);
  assert.deepEqual(Object.keys(body), ['query'], 'a plain {query} must survive the host data cast');
  assert.equal(typeof body.query, 'string');
  const lowerHeaders = Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
  assert.equal(lowerHeaders['client-id'], CLIENT_ID, 'all headers must be strings to survive the host cast');
  assert.equal(lowerHeaders['content-type'], 'application/json');
  assert.equal(lowerHeaders.authorization, undefined);
  assert.equal(lowerHeaders.cookie, undefined);

  assert.match(body.query, /\buser\s*\(\s*login\s*:\s*"fixture_offline"\s*\)/);
  const videoArgs = /\bvideos\s*\(([^)]*)\)/.exec(body.query)?.[1] || '';
  assert.match(videoArgs, /\bfirst\s*:\s*10\b/);
  assert.match(videoArgs, /\btype\s*:\s*ARCHIVE\b/);
  assert.match(videoArgs, /\bsort\s*:\s*TIME\b/);
  const nodeFields = /\bedges\s*\{\s*node\s*\{([^}]*)\}/.exec(body.query)?.[1] || '';
  for (const field of ['id', 'title', 'createdAt', 'lengthSeconds']) {
    assert.match(nodeFields, new RegExp(`\\b${field}\\b`));
  }
});

test('B6b archives use the caller-supplied limit', async () => {
  const host = hostHttp();
  await fetchArchives(host, 3);

  assert.equal(host.requests.length, 1);
  assert.match(host.requests[0].body.query, /\bvideos\s*\([^)]*\bfirst\s*:\s*3\b/);
});

test('B6b maps archive nodes to canonical Sources.parse VOD URLs', async () => {
  const result = await fetchArchives(hostHttp());

  assert.deepEqual(result, {ok: true, vods: [{
    id: '1234567890', title: 't', createdAt: '2026-11-20T10:31:57Z', lengthSeconds: 171258,
    url: 'https://www.twitch.tv/videos/1234567890',
  }]});
  const parsed = Sources.parse(result.vods[0].url);
  assert.equal(parsed?.kind, 'twitch-vod');
  assert.equal(parsed.id, '1234567890');
});

test('B6b maps a null Twitch user to NOT_FOUND', async () => {
  assert.deepEqual(await fetchArchives(hostHttp({data: UNKNOWN_USER})), {ok: false, code: 'NOT_FOUND'});
});

test('B6b maps an IINA non-2xx rejection to NETWORK without logging upstream URLs', async () => {
  const host = hostHttp({statusCode: 503, data: {errors: [{message: `Unavailable: ${UPSTREAM_URL}`}]}});
  assert.deepEqual(await fetchArchives(host), {ok: false, code: 'NETWORK'});
});

test('B6b maps a transport rejection to NETWORK without logging upstream URLs', async () => {
  const host = hostHttp({transportError: new Error(`Disconnected from ${UPSTREAM_URL}`)});
  assert.deepEqual(await fetchArchives(host), {ok: false, code: 'NETWORK'});
});

test('B6b maps an unexpected archive shape to MALFORMED without logging upstream URLs', async () => {
  const host = hostHttp({data: {data: {user: {videos: {edges: UPSTREAM_URL}}}}});
  assert.deepEqual(await fetchArchives(host), {ok: false, code: 'MALFORMED'});
});
