'use strict';

// B5b assumed API: async resolveTwitch(request, {http, includeTitle: true}) returns the
// existing {live, variants} plus a sanitized title string. Opt-in leaves B5's token-only
// request unchanged for existing callers. The lookup travels in the same HTTP POST as
// PlaybackAccessToken (a combined query or a batch is fine). Missing or failed title
// data returns "<login or id> — Twitch" if the token and master are good.

const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {resolveTwitch} = require('../src/twitch-playback.js');
const titles = require('./fixtures/twitch-playback/title-responses.json');

const LIVE = {kind: 'live', login: 'fixture_channel'};
const VOD = {kind: 'vod', id: '123456789'};
const MASTER = readFileSync(join(__dirname, 'fixtures/twitch-playback/master.m3u8'), 'utf8');
const GQL_URL = 'https://gql.twitch.tv/gql';

async function lookup(request, titleResponse) {
  const live = request.kind === 'live';
  const tokenField = live ? 'streamPlaybackAccessToken' : 'videoPlaybackAccessToken';
  const tokenResponse = {data: {[tokenField]: titles.accessToken}};
  const calls = [];
  const http = {
    async post(url, {data: body}) {
      const operations = Array.isArray(body) ? body : [body];
      calls.push({method: 'POST', url, operations});
      const data = Array.isArray(body)
        ? operations.map(operation => (titleArgument(operation, request) ? titleResponse : tokenResponse))
        : {...titleResponse, data: {...tokenResponse.data, ...titleResponse.data}};
      return {statusCode: 200, reason: 'OK', data, text: JSON.stringify(data)};
    },
    async get(url) {
      calls.push({method: 'GET', url});
      return {statusCode: 200, reason: 'OK', data: null, text: MASTER};
    },
  };
  const result = await resolveTwitch(request, {http, includeTitle: true});
  return {result, calls};
}

function titleArgument(operation, request) {
  const query = operation.query || '';
  const field = request.kind === 'live'
    ? /\buser\s*\(\s*login\s*:\s*([^)]*)\)\s*\{\s*broadcastSettings\s*\{\s*title\b/
    : /\bvideo\s*\(\s*id\s*:\s*([^)]*)\)\s*\{\s*title\b/;
  const argument = query.match(field)?.[1].trim();
  if (argument?.startsWith('$')) return operation.variables?.[argument.slice(1)];
  return argument?.replace(/^"|"$/g, '');
}

function assertTitleLookup(calls, request) {
  // Changed for the host contract: the title is its own POST (IINA drops array bodies), so POST, POST, GET.
  assert.deepEqual(calls.map(({method}) => method), ['POST', 'POST', 'GET'], 'title lookup is one extra parallel POST');
  const posts = calls.filter(({method}) => method === 'POST');
  assert.ok(posts.every(({url}) => url === GQL_URL));
  const id = request.kind === 'live' ? request.login : request.id;
  const tokenField = request.kind === 'live' ? /\bstreamPlaybackAccessToken\b/ : /\bvideoPlaybackAccessToken\b/;
  const operations = posts.flatMap(({operations: sent}) => sent);
  assert.ok(operations.some(({operationName, query}) => operationName === 'PlaybackAccessToken'
    || tokenField.test(query)), 'a POST must still request a playback token');
  assert.ok(operations.some(operation => titleArgument(operation, request) === id),
    'a POST must look up the title for the requested login or video id');
}

for (const [request, response, expected] of [
  [LIVE, titles.live, 'Fixture live broadcast'],
  [VOD, titles.vod, 'Fixture recording'],
]) {
  test(`Twitch ${request.kind} reads its title in the playback-token POST`, async () => {
    const {result, calls} = await lookup(request, response);

    assert.equal(result.title, expected);
    assertTitleLookup(calls, request);
    assert.equal(result.live, request.kind === 'live');
    assert.ok(result.variants.some(({name}) => name === '720p60'));
  });
}

test('a missing Twitch title uses the login fallback without losing playback', async () => {
  const {result, calls} = await lookup(LIVE, titles.missing);

  assert.equal(result.title, 'fixture_channel — Twitch');
  assertTitleLookup(calls, LIVE);
  assert.ok(result.variants.some(({name}) => name === '720p60'));
});

test('a GraphQL title error uses the recording id fallback without losing playback', async () => {
  const {result, calls} = await lookup(VOD, titles.errored);

  assert.equal(result.title, '123456789 — Twitch');
  assertTitleLookup(calls, VOD);
  assert.ok(result.variants.some(({name}) => name === '720p60'));
});

test('Twitch titles remove URLs and control characters and stop at 240 characters', async () => {
  const tail = '🌊'.repeat(250);
  const title = `\tLine one\r\nLine two\x7fhttp://fixture.invalid/a https://fixture.invalid/b ${tail}`;
  const {result, calls} = await lookup(VOD, {data: {video: {title}}});

  assert.equal(result.title, 'Line one  Line two   ' + '🌊'.repeat(219));
  assertTitleLookup(calls, VOD);
});
