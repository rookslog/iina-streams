'use strict';

// Release review r1 #2: every URL the JS path hands to mpv gets the same checks as helpers/media.py _media_url.
// URLs here are synthetic; signatures are fake.

const test = require('node:test');
const assert = require('node:assert/strict');
const {inspect} = require('node:util');
const {createResolver} = require('../src/resolve.js');
const {parse} = require('../src/source.js');
const {resolveTwitch} = require('../src/twitch-playback.js');
const titles = require('./fixtures/twitch-playback/title-responses.json');

const LIVE_REQUEST = {kind: 'live', login: 'fixture_channel'};
const VOD_REQUEST = {kind: 'vod', id: '123456789'};
const GOOD_LIVE = 'https://video-weaver.fra05.hls.ttvnw.net/v1/playlist/FAKESIG.m3u8';
const CLOUDFRONT_VOD = 'https://d1234567890abc.cloudfront.net/abcdef0123_fixture_1234/chunked/index-dvr.m3u8';

function master(urls) {
  const lines = ['#EXTM3U'];
  urls.forEach((url, index) => {
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${1000000 + index},RESOLUTION=1280x720,STABLE-VARIANT-ID="v${index}"`);
    lines.push(url);
  });
  return lines.join('\n') + '\n';
}

function fakeHttp(text) {
  const token = {value: 'fake-token', signature: 'fake-signature'};
  return {
    async post(url, options) {
      const playback = {data: {streamPlaybackAccessToken: token, videoPlaybackAccessToken: token}};
      if (Array.isArray(options.data)) {
        return {statusCode: 200, data: options.data.map(() => playback)};
      }
      return {statusCode: 200, data: playback};
    },
    async get() {
      return {statusCode: 200, reason: 'OK', data: null, text};
    },
  };
}

async function codeOf(request, url) {
  try {
    await resolveTwitch(request, {http: fakeHttp(master([url]))});
  } catch (error) {
    return error.code;
  }
  return 'ACCEPTED';
}

const REJECT_LIVE = {
  'unlisted host': 'https://media.example.invalid/live/a.m3u8',
  'suffix lookalike': 'https://evilttvnw.net/a.m3u8',
  userinfo: 'https://user:pw@video-weaver.fra05.hls.ttvnw.net/a.m3u8',
  'empty userinfo': 'https://@video-weaver.fra05.hls.ttvnw.net/a.m3u8',
  'port 8443': 'https://video-weaver.fra05.hls.ttvnw.net:8443/a.m3u8',
  fragment: 'https://video-weaver.fra05.hls.ttvnw.net/a.m3u8#frag',
  'http scheme': 'http://video-weaver.fra05.hls.ttvnw.net/a.m3u8',
  backslash: 'https://video-weaver.fra05.hls.ttvnw.net/a\\b.m3u8',
  'overlong': 'https://video-weaver.fra05.hls.ttvnw.net/' + 'a'.repeat(16384),
  'cloudfront host for a live stream': CLOUDFRONT_VOD,
};

for (const [name, url] of Object.entries(REJECT_LIVE)) {
  test(`live rejects ${name}`, async () => {
    assert.equal(await codeOf(LIVE_REQUEST, url), 'UNSAFE_MEDIA_URL');
  });
}

test('whitespace in a rendition URL is rejected', async () => {
  const text = master([GOOD_LIVE]).replace('FAKESIG', 'FAKE SIG');
  await assert.rejects(resolveTwitch(LIVE_REQUEST, {http: fakeHttp(text)}), {code: 'UNSAFE_MEDIA_URL'});
});

test('vod rejects a cloudfront host with a path outside the VOD shape', async () => {
  const bad = ['https://d1234567890abc.cloudfront.net/x/index-dvr.m3u8',
    'https://d1234567890abc.cloudfront.net/a/../index-dvr.m3u8',
    'https://d1234567890abc.cloudfront.net/a/b/other.m3u8',
    'https://dshort.cloudfront.net/a/b/index-dvr.m3u8'];
  for (const url of bad) {
    assert.equal(await codeOf(VOD_REQUEST, url), 'UNSAFE_MEDIA_URL', url);
  }
});

test('vod rejects port 8443 on an allowed host', async () => {
  assert.equal(await codeOf(VOD_REQUEST, 'https://vod.twitchcdn.net:8443/a.m3u8'), 'UNSAFE_MEDIA_URL');
});

const ACCEPT = {
  'live weaver host': ['https://video-weaver.fra05.hls.ttvnw.net/v1/playlist/FAKESIG.m3u8', LIVE_REQUEST],
  'live playlist host': ['https://abc123.playlist.ttvnw.net/v1/playlist/FAKESIG.m3u8', LIVE_REQUEST],
  'live twitchcdn host': ['https://edge.twitchcdn.net/a/b.m3u8?sig=FAKESIG', LIVE_REQUEST],
  'live explicit port 443': ['https://video-weaver.fra05.hls.ttvnw.net:443/a.m3u8', LIVE_REQUEST],
  'vod cloudfront with a valid path': [CLOUDFRONT_VOD, VOD_REQUEST],
  'vod ttvnw host': ['https://usher.ttvnw.net/vod/a.m3u8', VOD_REQUEST],
};

for (const [name, [url, request]] of Object.entries(ACCEPT)) {
  test(`accepts ${name}`, async () => {
    const result = await resolveTwitch(request, {http: fakeHttp(master([url]))});
    assert.equal(result.variants[0].url, url);
  });
}

test('one unsafe rendition makes resolve() fall back to the helper exactly once', async () => {
  const text = master([GOOD_LIVE, 'https://media.example.invalid/x.m3u8?sig=FAKESIG', GOOD_LIVE]);
  const helperResult = {ok: true, mediaURL: 'https://video-weaver.fra05.hls.ttvnw.net/from-helper.m3u8'};
  const helperCalls = [];
  const logs = [];
  const resolve = createResolver({
    resolveTwitch,
    http: fakeHttp(text),
    async helperResolve(...args) {
      helperCalls.push(args);
      return helperResult;
    },
    log: (...args) => logs.push(args),
  });
  const result = await resolve(parse('fixture_channel'), 'auto720');
  assert.equal(helperCalls.length, 1);
  assert.equal(result, helperResult);
  assert.ok(logs.some(args => args.includes('UNSAFE_MEDIA_URL')), 'the fallback code is logged');
});

test('no log argument contains the rejected URL', async () => {
  const unsafe = 'https://media.example.invalid/x.m3u8?sig=FAKESIG';
  const logs = [];
  const log = (...args) => logs.push(args);
  await assert.rejects(resolveTwitch(LIVE_REQUEST, {http: fakeHttp(master([unsafe])), log}));
  const resolve = createResolver({
    resolveTwitch,
    http: fakeHttp(master([unsafe])),
    async helperResolve() {
      return {ok: false};
    },
    log,
  });
  await resolve(parse('fixture_channel'), 'auto720');
  const dump = inspect(logs, {depth: 10});
  assert.ok(logs.length > 0);
  for (const fragment of ['media.example.invalid', 'FAKESIG', 'x.m3u8']) {
    assert.ok(!dump.includes(fragment), `log leaks ${fragment}`);
  }
});
