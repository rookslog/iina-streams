'use strict';

// Host contract for iina.http, as read from IINA v1.5.1 iina/JavascriptAPIHttp.swift:
//   lines 72 and 103: `let data = options?["data"] as? [String: Any]`, then `data: data ?? [:]`
//     -> a `data` that is not a plain object (an array, say) is sent as `{}`.
//   `params` and `headers` are cast with `as? [String: String]`
//     -> one non-string value drops the whole map.
// This fake models those casts, so a request shape IINA would mangle fails here.

const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {resolveTwitch} = require('../src/twitch-playback.js');
const titles = require('./fixtures/twitch-playback/title-responses.json');

const MASTER = readFileSync(join(__dirname, 'fixtures/twitch-playback/master.m3u8'), 'utf8');

function iinaStringMap(map) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
  return Object.values(map).every(value => typeof value === 'string') ? map : {};
}

function iinaBody(data) {
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

// Answers as Twitch would: a token operation needs its variables; an empty `{}` body is an error.
function hostHttp(kind) {
  const tokenField = kind === 'live' ? 'streamPlaybackAccessToken' : 'videoPlaybackAccessToken';
  const sent = [];
  return {
    sent,
    async post(url, options = {}) {
      const body = iinaBody(options.data);
      const headers = iinaStringMap(options.headers);
      sent.push({url, body, headers});
      let data;
      if (body.operationName === 'PlaybackAccessToken') {
        data = {data: {[tokenField]: titles.accessToken}};
      } else if (typeof body.query === 'string') {
        data = titles[kind];
      } else {
        data = {errors: [{message: 'empty body'}]};
      }
      return {statusCode: 200, reason: 'OK', data, text: JSON.stringify(data)};
    },
    async get(url, options = {}) {
      iinaStringMap(options.params);
      return {statusCode: 200, reason: 'OK', data: null, text: MASTER};
    },
  };
}

for (const [request, kind, title] of [
  [{kind: 'live', login: 'fixture_channel'}, 'live', 'Fixture live broadcast'],
  [{kind: 'vod', id: '123456789'}, 'vod', 'Fixture recording'],
]) {
  test(`${kind}: token, variants and title survive IINA's body and map casts`, async () => {
    const http = hostHttp(kind);

    const result = await resolveTwitch(request, {http, includeTitle: true});

    assert.equal(result.title, title);
    assert.ok(result.variants.some(({name}) => name === '720p60'));
    assert.ok(http.sent.length >= 2, 'token and title are separate POSTs');
    assert.ok(http.sent.every(({headers}) => headers['Client-ID']), 'headers are all strings');
  });
}
