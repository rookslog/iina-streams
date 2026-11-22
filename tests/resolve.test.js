'use strict';

// B5b assumed API: createResolver({resolveTwitch, http, helperResolve, log, now}) returns
// async resolve(source, quality). It accepts canonical src/source.js objects and returns the
// media helper's result shape. resolveTwitch rejects with B5 codes or yields variants and title
// when passed includeTitle: true in its dependencies.
// The Python helper has no OFFLINE, NOT_FOUND, or RESTRICTED entries. These tests assume the
// three definitive JS codes map to Python's structured UNAVAILABLE code/message without fallback.
// Recoverable B5 codes are logged as ('twitch-js-fallback', code), never as raw error details.

const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {createRequire} = require('node:module');
const {join} = require('node:path');
const {inspect} = require('node:util');
const {createIina} = require('./support/iina-shim.js');
const {parse} = require('../src/source.js');
const {resolveTwitch} = require('../src/twitch-playback.js');
const titles = require('./fixtures/twitch-playback/title-responses.json');

const LIVE = parse('fixture_channel');
const VOD = parse('https://www.twitch.tv/videos/123456789?t=1m2s');
const YOUTUBE = parse('https://youtu.be/abcdefghijk?t=90');
const LOCAL = {kind: 'local', url: 'file:///fixture/sample.mp4'};
const MASTER = readFileSync(join(__dirname, 'fixtures/twitch-playback/master.m3u8'), 'utf8');
const HIGH_ONLY = readFileSync(join(__dirname, 'fixtures/twitch-playback/master-high-only.m3u8'), 'utf8');
const AUTO = {id: 'auto720', label: 'Auto · 720p preferred'};
const FORMATS = [
  AUTO,
  {id: '1080p60', label: '1080p60'},
  {id: '720p60', label: '720p60'},
  {id: '480p', label: '480p'},
  {id: '360p', label: '360p'},
  {id: '160p', label: '160p'},
  {id: 'audio_only', label: 'Audio only'},
];
const UNAVAILABLE = {
  ok: false,
  error: {
    code: 'UNAVAILABLE',
    message: 'This video or stream is unavailable. It may be offline, private, or restricted.',
  },
};
const HELPER_FAILURE = {
  ok: false,
  error: {code: 'MISSING_DEPENDENCY', message: 'A required media extractor is not available on this Mac.'},
};
const HELPER_VOD = {
  ok: true,
  source: VOD,
  title: 'Fixture title from the helper',
  live: false,
  duration: 90,
  quality: '480p',
  formats: [AUTO, {id: '480p', label: '480p'}],
  mediaURL: 'https://helper.example.invalid/vod/480p.m3u8',
  headers: {'User-Agent': 'Fixture helper'},
};

function gqlResponse(data) {
  return {statusCode: 200, reason: 'OK', data, text: JSON.stringify(data)};
}

function fakeHttp({
  kind = 'live',
  token = titles.accessToken,
  get = async () => ({statusCode: 200, reason: 'OK', data: null, text: MASTER}),
} = {}) {
  const calls = [];
  const field = kind === 'live' ? 'streamPlaybackAccessToken' : 'videoPlaybackAccessToken';
  const playback = {data: {[field]: token}};
  const title = titles[kind];
  const http = {
    async post(url, options) {
      calls.push(['POST', url]);
      if (Array.isArray(options.data)) {
        return gqlResponse(options.data.map(operation => /\btitle\b/.test(operation.query) ? title : playback));
      }
      if (!/\btitle\b/.test(options.data.query)) return gqlResponse(playback);
      return gqlResponse({data: {...playback.data, ...title.data}});
    },
    async get(url, options) {
      calls.push(['GET', url]);
      return get(url, options);
    },
  };
  return {http, calls};
}

function setup({
  transport = fakeHttp(),
  twitch = resolveTwitch,
  helperResult = HELPER_FAILURE,
} = {}) {
  // Require in each test so the red run reports every missing-module case individually.
  const {createResolver} = require('../src/resolve.js');
  const helperCalls = [];
  const twitchCalls = [];
  const logs = [];
  const log = (...args) => logs.push(args);
  const resolve = createResolver({
    resolveTwitch(request, deps) {
      twitchCalls.push([request, deps]);
      return twitch(request, deps);
    },
    http: transport.http,
    async helperResolve(...args) {
      helperCalls.push(args);
      return helperResult;
    },
    log,
    now: () => 0,
  });
  return {resolve, helperCalls, twitchCalls, logs, log, ...transport};
}

function mediaURL(id, fixture = 'video') {
  return `https://media.fixture.ttvnw.net/live/${id}.m3u8?fixture=${fixture}`;
}

for (const example of [
  {
    source: LIVE, request: {kind: 'live', login: 'fixture_channel'},
    title: 'Fixture live broadcast', live: true,
  },
  {
    source: VOD, request: {kind: 'vod', id: '123456789'},
    title: 'Fixture recording', live: false,
  },
]) {
  test(`Twitch ${example.request.kind} returns the helper-shaped JS result`, async () => {
    const {resolve, twitchCalls, helperCalls, http, log} = setup({
      transport: fakeHttp({kind: example.request.kind}),
    });

    const result = await resolve(example.source, 'auto720');

    assert.deepEqual(result, {
      ok: true,
      source: example.source,
      title: example.title,
      live: example.live,
      duration: null,
      quality: '720p60',
      formats: FORMATS,
      mediaURL: mediaURL('720p60'),
    });
    assert.equal(twitchCalls.length, 1);
    const [[request, deps]] = twitchCalls;
    assert.deepEqual(request, example.request);
    assert.equal(deps.http, http);
    assert.equal(deps.log, log);
    assert.deepEqual(helperCalls, []);
  });
}

test('auto720 uses the lowest video above 720p rather than the highest or audio', async () => {
  const transport = fakeHttp({get: async () => ({statusCode: 200, text: HIGH_ONLY})});
  const {resolve, helperCalls} = setup({transport});

  const result = await resolve(LIVE, 'auto720');

  assert.equal(result.ok, true);
  assert.equal(result.quality, '1080p60');
  assert.equal(result.mediaURL, mediaURL('chunked', 'source'));
  assert.deepEqual(result.formats, [
    AUTO,
    {id: '1440p', label: '1440p'},
    {id: '1080p60', label: '1080p60'},
    {id: 'audio_only', label: 'Audio only'},
  ]);
  assert.deepEqual(helperCalls, []);
});

for (const [quality, url] of [
  ['480p', mediaURL('480p')],
  ['audio_only', mediaURL('audio_only', 'audio')],
]) {
  test(`explicit ${quality} selects that exact Twitch variant`, async () => {
    const {resolve, helperCalls} = setup();
    const result = await resolve(LIVE, quality);

    assert.equal(result.ok, true);
    assert.equal(result.quality, quality);
    assert.equal(result.mediaURL, url);
    assert.deepEqual(helperCalls, []);
  });
}

test('an absent explicit quality returns QUALITY_UNAVAILABLE without falling back', async () => {
  const {resolve, helperCalls} = setup();

  assert.deepEqual(await resolve(LIVE, '2160p60'), {
    ok: false,
    error: {
      code: 'QUALITY_UNAVAILABLE',
      message: 'That quality is no longer available. Open the stream again and choose another quality.',
    },
  });
  assert.deepEqual(helperCalls, []);
});

for (const [code, source, options] of [
  ['OFFLINE', LIVE, {get: async () => { throw {statusCode: 404}; }}],
  ['NOT_FOUND', VOD, {kind: 'vod', token: null}],
  ['RESTRICTED', VOD, {kind: 'vod', get: async () => { throw {statusCode: 403}; }}],
]) {
  test(`${code} returns the helper-compatible error without calling the helper`, async () => {
    const {resolve, helperCalls} = setup({transport: fakeHttp(options)});

    const expected = code === 'OFFLINE'
      ? {...UNAVAILABLE, error: {...UNAVAILABLE.error, reason: 'offline'}}
      : UNAVAILABLE;
    assert.deepEqual(await resolve(source, 'auto720'), expected);
    assert.deepEqual(helperCalls, []);
  });
}

for (const [code, get, helperResult] of [
  ['NETWORK', async () => { throw {statusCode: 503}; }, HELPER_VOD],
  ['MALFORMED', async () => ({statusCode: 200, text: '<html>Not HLS</html>'}), HELPER_FAILURE],
]) {
  test(`${code} falls back once with the original source and quality`, async () => {
    const {resolve, helperCalls, logs} = setup({transport: fakeHttp({kind: 'vod', get}), helperResult});

    assert.deepEqual(await resolve(VOD, '480p'), helperResult);
    assert.deepEqual(helperCalls, [[VOD, '480p']]);
    assert.deepEqual(logs.filter(([event]) => event === 'twitch-js-fallback'), [['twitch-js-fallback', code]]);
  });
}

test('an unexpected throw falls back without logging the exception', async () => {
  const detail = 'Fixture unexpected exception';
  const {resolve, helperCalls, logs} = setup({twitch() { throw new Error(detail); }});

  assert.deepEqual(await resolve(LIVE, 'auto720'), HELPER_FAILURE);
  assert.deepEqual(helperCalls, [[LIVE, 'auto720']]);
  const fallback = logs.filter(([event]) => event === 'twitch-js-fallback');
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0].length, 2);
  assert.match(fallback[0][1], /^[A-Z_]+$/);
  assert.ok(!inspect(logs).includes(detail), 'exception text must not appear in logs');
});

test('a Twitch request timeout invokes the helper once', {timeout: 1000}, async t => {
  const transport = fakeHttp({get: () => new Promise(() => {})});
  const {resolve, helperCalls, calls, logs} = setup({transport});
  t.mock.timers.enable({apis: ['setTimeout']});

  const pending = resolve(LIVE, '720p60');
  await new Promise(setImmediate);
  // Token and title are separate POSTs: IINA drops array bodies (JavascriptAPIHttp.swift L72, L103).
  assert.deepEqual(calls.map(([method]) => method), ['POST', 'POST', 'GET']);
  t.mock.timers.tick(1999);
  await new Promise(setImmediate);
  assert.deepEqual(helperCalls, []);
  t.mock.timers.tick(1);

  assert.deepEqual(await pending, HELPER_FAILURE);
  assert.deepEqual(helperCalls, [[LIVE, '720p60']]);
  assert.deepEqual(logs.filter(([event]) => event === 'twitch-js-fallback'), [
    ['twitch-js-fallback', 'NETWORK'],
  ]);
});

for (const source of [YOUTUBE, LOCAL]) {
  test(`${source.kind} goes straight to the helper`, async () => {
    const {resolve, helperCalls, twitchCalls, calls, logs} = setup();

    assert.deepEqual(await resolve(source, 'auto720'), HELPER_FAILURE);
    assert.deepEqual(helperCalls, [[source, 'auto720']]);
    assert.deepEqual(twitchCalls, []);
    assert.deepEqual(calls, []);
    assert.ok(!logs.some(([event]) => event === 'twitch-js-fallback'));
  });
}

test('JS success and fallback logs omit signed URLs, tokens and signatures', async () => {
  const success = setup();
  assert.equal((await success.resolve(LIVE, 'auto720')).ok, true);
  const urls = [mediaURL('720p60')];
  const failure = setup({transport: fakeHttp({
    async get(url, {params}) {
      const signedURL = `${url}?${new URLSearchParams(params)}`;
      urls.push(url, signedURL);
      throw {
        statusCode: 503,
        reason: signedURL,
        text: `${titles.accessToken.value} ${titles.accessToken.signature}`,
      };
    },
  })});
  assert.deepEqual(await failure.resolve(LIVE, 'auto720'), HELPER_FAILURE);

  const {value, signature} = titles.accessToken;
  const forbidden = [value, signature, encodeURIComponent(value), encodeURIComponent(signature), ...urls];
  assert.ok(failure.logs.some(([event]) => event === 'twitch-js-fallback'), 'must exercise fallback logging');
  for (const args of [...success.logs, ...failure.logs]) {
    const line = inspect(args, {depth: null, maxStringLength: null});
    for (const secret of forbidden) {
      assert.ok(!line.includes(secret), 'a log argument contains a fixture URL, token or signature');
    }
  }
});

test('main.js gives the player the resolver wrapper under the IINA shim', async () => {
  // Load the real wrapper here so the first red run reports the missing module even before wiring.
  require('../src/resolve.js');
  const main = join(__dirname, '../main.js');
  const requireFromMain = createRequire(main);
  const shim = createIina();
  const transport = fakeHttp();
  Object.assign(shim.iina.http, transport.http);
  const helperCalls = [];
  const services = {resolve: helperResolve};
  async function helperResolve(...args) {
    assert.equal(this, services, 'main binds the original method to its services object');
    helperCalls.push(args);
    return HELPER_FAILURE;
  }
  let playerResolve;
  shim.runScript(main, {require(name) {
    if (name === './src/io.js') return {create: () => services};
    if (name === './src/player.js') {
      return {start(_host, _config, playerServices) { playerResolve = playerServices.resolve; }};
    }
    return requireFromMain(name);
  }});

  assert.equal(typeof playerResolve, 'function');
  assert.notEqual(playerResolve, helperResolve, 'player must receive the wrapper, not the old resolver');
  assert.equal((await playerResolve(LIVE, '480p')).mediaURL, mediaURL('480p'));
  assert.deepEqual(transport.calls.map(([method]) => method), ['POST', 'POST', 'GET']);
  assert.deepEqual(helperCalls, []);
  assert.deepEqual(await playerResolve(YOUTUBE, 'auto720'), HELPER_FAILURE);
  assert.deepEqual(helperCalls, [[YOUTUBE, 'auto720']]);
});
