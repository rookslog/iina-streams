'use strict';

// Recent broadcasts of a Twitch channel (B6b, D-030), from Twitch's public GQL, signed out.
//
//   recentArchives({login}, {http, log, limit = 10, setTimeout, clearTimeout})
//     -> {ok: true, vods: [{id, title, createdAt, lengthSeconds, url}]} | {ok: false, code}
//
// `code` is NOT_FOUND (no such user), NETWORK (transport failure, non-2xx or timeout) or MALFORMED.
// It never rejects. `http` is iina.http-shaped: IINA casts `data`, `headers` and `params` with `as?`,
// so the body is a plain {query} object and every header value is a string (see src/twitch-playback.js).
// Nothing here logs a URL, a title or the login; a log line carries only the failure code.

const GQL_URL = 'https://gql.twitch.tv/gql';
const WEB_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'; // Public web client id, as in src/twitch-playback.js.
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const REQUEST_TIMEOUT_MS = 5000;
const STATUS_TIMEOUT_MS = 1500;
const MAX_TITLE_LENGTH = 240;
const LOGIN_PATTERN = /^[A-Za-z0-9_]{1,25}$/;
const VOD_ID_PATTERN = /^\d{1,20}$/;
const CONTROL_CHARACTERS = /[\x00-\x1f\x7f]+/g;

function failure(code) {
  return {ok: false, code};
}

function logCode(log, code) {
  if (typeof log !== 'function') {
    return;
  }
  try {
    log('twitch-vods', code);
  } catch (_) {
    // A broken logger must not change the result.
  }
}

function clampLimit(limit) {
  const value = Math.floor(Number(limit));
  if (!Number.isFinite(value) || value < 1) {
    return DEFAULT_LIMIT;
  }
  return Math.min(value, MAX_LIMIT);
}

// The login is validated against LOGIN_PATTERN before this, so JSON.stringify quoting is safe.
function archivesQuery(login, limit) {
  return `query{user(login:${JSON.stringify(login)}){videos(first:${limit},type:ARCHIVE,sort:TIME)`
    + '{edges{node{id title createdAt lengthSeconds}}}}}';
}

function requestHeaders() {
  return {'Client-ID': WEB_CLIENT_ID, 'Content-Type': 'application/json'};
}

// H-main (#67): races start() against a deadline with every timer call on IINA's main thread. iina.http settles
// off the main thread (JavascriptAPIHttp.swift request, IINA v1.5.1), and IINA's timer registry is a plain
// dictionary that clearTimeout changes on the calling thread (JavascriptPolyfill.swift removeTimer). A timer
// callback runs on the main thread (createTimer schedules the Timer through DispatchQueue.main.async). So the
// reply's continuation only arms a 0 ms handoff timer (creating one is safe from any thread: createTimer itself
// hops to main), and the handoff, on the main thread, clears the deadline and settles. The deadline settles with
// `onTimeout` from its own callback. Resolves to {value} or {error}; it settles exactly once and never rejects.
function raceOnMain(start, ms, onTimeout, timers) {
  const setTimer = timers && timers.setTimeout || setTimeout;
  const clearTimer = timers && timers.clearTimeout || clearTimeout;
  return new Promise(resolve => {
    let settled = false;
    const settle = outcome => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(outcome);
    };
    const deadline = setTimer(() => settle(onTimeout), ms);
    const handOff = outcome => {
      setTimer(() => {
        if (settled) {
          return;
        }
        clearTimer(deadline);
        settle(outcome);
      }, 0);
    };
    Promise.resolve().then(start).then(value => handOff({value}), error => handOff({error}));
  });
}

async function postWithTimeout(http, options, timers) {
  const outcome = await raceOnMain(() => http.post(GQL_URL, options), REQUEST_TIMEOUT_MS,
    {error: new Error('timeout')}, timers);
  if (outcome.error) {
    throw outcome.error;
  }
  return outcome.value;
}

function bodyOf(response) {
  if (response && response.data && typeof response.data === 'object') {
    return response.data;
  }
  try {
    return JSON.parse(response && response.text);
  } catch (_) {
    return null;
  }
}

function cleanTitle(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return Array.from(value.replace(CONTROL_CHARACTERS, ' ').trim()).slice(0, MAX_TITLE_LENGTH).join('');
}

// A node without a usable id is dropped; the other fields degrade to empty values.
function archiveFrom(node) {
  if (!node || typeof node !== 'object' || typeof node.id !== 'string' || !VOD_ID_PATTERN.test(node.id)) {
    return null;
  }
  const length = Number(node.lengthSeconds);
  return {
    id: node.id,
    title: cleanTitle(node.title),
    createdAt: typeof node.createdAt === 'string' ? node.createdAt : '',
    lengthSeconds: Number.isFinite(length) && length >= 0 ? Math.floor(length) : 0,
    url: `https://www.twitch.tv/videos/${node.id}`,
  };
}

function readArchives(response) {
  const body = bodyOf(response);
  const data = body && body.data;
  if (!data || typeof data !== 'object' || !Object.hasOwn(data, 'user')) {
    return failure('MALFORMED');
  }
  if (data.user === null) {
    return failure('NOT_FOUND');
  }
  const edges = data.user && data.user.videos && data.user.videos.edges;
  if (!Array.isArray(edges)) {
    return failure('MALFORMED');
  }
  const vods = edges.map(edge => archiveFrom(edge && edge.node)).filter(Boolean);
  return {ok: true, vods};
}

function isSuccess(response) {
  const status = response && response.statusCode;
  return status === undefined || (status >= 200 && status < 300);
}

async function recentArchives(request, deps) {
  const {http, log, limit = DEFAULT_LIMIT} = deps || {};
  const timers = {setTimeout: deps && deps.setTimeout, clearTimeout: deps && deps.clearTimeout};
  const login = request && request.login;
  if (typeof login !== 'string' || !LOGIN_PATTERN.test(login)) {
    return failure('NOT_FOUND');
  }
  const options = {
    headers: requestHeaders(),
    data: {query: archivesQuery(login, clampLimit(limit))},
  };
  let result;
  try {
    const response = await postWithTimeout(http, options, timers);
    result = isSuccess(response) ? readArchives(response) : failure('NETWORK');
  } catch (_) {
    // A rejection is the response object (non-2xx) or a transport Error; neither is read or logged.
    result = failure('NETWORK');
  }
  if (!result.ok) {
    logCode(log, result.code);
  }
  return result;
}

// ---- live status (#67) ----

// Whether a channel is live, asked by global before it creates a player for the channel.
//
//   channelStatus({login}, {http, setTimeout, clearTimeout}) -> 'live' | 'offline' | 'unknown'
//
// One anonymous GQL query, user(login){stream{id}}, with the public web client id and no viewer credential, like
// archivesQuery. Helix Get Streams cannot decide this: it omits discovery-restricted live streams (Twitch API
// reference, Get Streams), so D-034 allows GQL here. 'offline' only when the answer positively says so: user.stream
// is null and the reply carries no `errors` (a GraphQL field error also nulls the field). 'unknown' covers no such
// channel, any error, an odd reply and no answer within STATUS_TIMEOUT_MS, so the caller creates the player as
// before. It never rejects, and nothing is logged. A request still in flight at the deadline is not cancelled
// (iina.http has no abort); its late answer is ignored.
async function channelStatus(request, deps) {
  const {http} = deps || {};
  const timers = {setTimeout: deps && deps.setTimeout, clearTimeout: deps && deps.clearTimeout};
  const login = request && request.login;
  if (typeof login !== 'string' || !LOGIN_PATTERN.test(login)) {
    return 'unknown';
  }
  const outcome = await raceOnMain(() => gqlStatus(http, login), STATUS_TIMEOUT_MS, {value: 'unknown'}, timers);
  return outcome.error ? 'unknown' : outcome.value;
}

// The login is validated against LOGIN_PATTERN before this, so JSON.stringify quoting is safe.
function streamQuery(login) {
  return `query{user(login:${JSON.stringify(login)}){stream{id}}}`;
}

async function gqlStatus(http, login) {
  const response = await http.post(GQL_URL, {headers: requestHeaders(), data: {query: streamQuery(login)}});
  if (!isSuccess(response)) {
    return 'unknown';
  }
  const body = bodyOf(response);
  if (!body || Object.hasOwn(body, 'errors')) {
    return 'unknown';
  }
  const user = body.data && body.data.user;
  if (!user || typeof user !== 'object' || !Object.hasOwn(user, 'stream')) {
    return 'unknown';
  }
  if (user.stream === null) {
    return 'offline';
  }
  return user.stream && typeof user.stream.id === 'string' ? 'live' : 'unknown';
}

module.exports = {recentArchives, channelStatus};
