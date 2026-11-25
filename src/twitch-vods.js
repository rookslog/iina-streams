'use strict';

const {createHelix} = require('./twitch-helix.js');

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

// #75: keep the anonymous path as the one fallback for an unavailable Helix list.
async function recentBroadcasts(request, deps) {
  if (deps.credentials) {
    const outcome = await raceOnMain(() => helixArchives(request, deps), REQUEST_TIMEOUT_MS,
      {error: new Error('timeout')}, deps);
    if (!outcome.error) {
      return outcome.value;
    }
  }
  return recentArchives(request, deps);
}

async function helixArchives(request, {http, credentials}) {
  const helix = createHelix({http, clientID: credentials.clientID, token: credentials.token});
  const videos = await helix.recentVODs(request);
  return {ok: true, vods: videos.map(helixArchive)};
}

function helixArchive(video) {
  const parts = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(video.duration);
  if (!parts || !parts[0]) {
    throw new Error('Malformed Helix duration');
  }
  const lengthSeconds = Number(parts[1] || 0) * 3600 + Number(parts[2] || 0) * 60 + Number(parts[3] || 0);
  if (!Number.isSafeInteger(lengthSeconds)) {
    throw new Error('Malformed Helix duration');
  }
  return archiveFrom({...video, lengthSeconds});
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

// #74: one live-status batch per refresh, plus anonymous last-broadcast details
// when Helix supplies the live status. The failure value preserves unknown marks.
async function channelsStatus(logins, credentials, deps) {
  const unknown = {status: Object.fromEntries(logins.map(login => [login, null])), details: {}};
  if (!logins.length || logins.length > 20 || !logins.every(login => typeof login === 'string' && LOGIN_PATTERN.test(login))) {
    return unknown;
  }
  const {http} = deps;
  const outcome = await raceOnMain(() => credentials
    ? requestForOwner(deps, () => helixBatch(http, logins, credentials))
    : gqlBatch(http, logins), STATUS_TIMEOUT_MS, {value: unknown}, deps);
  return outcome.error || !outcome.value ? unknown : outcome.value;
}

function liveDetails(title, category, viewers) {
  return {title: cleanTitle(title), category: cleanTitle(category),
    viewers: Number.isFinite(viewers) && viewers >= 0 ? viewers : 0};
}

function lastBroadcastDetail(user) {
  const broadcast = user && user.lastBroadcast;
  if (!broadcast) return null;
  const details = {};
  const lastAt = broadcast.startedAt;
  const lastTitle = cleanTitle(broadcast.title);
  if (typeof lastAt === 'string' && Number.isFinite(Date.parse(lastAt))) details.lastAt = lastAt;
  if (lastTitle) details.lastTitle = lastTitle;
  return Object.keys(details).length ? details : null;
}

async function helixBatch(http, logins, credentials) {
  // IINA accepts only string-valued params, so repeated keys belong in the URL itself.
  const query = logins.map(login => 'user_login=' + encodeURIComponent(login)).join('&');
  const response = await http.get('https://api.twitch.tv/helix/streams?' + query, {
    headers: {Authorization: `Bearer ${credentials.token}`, 'Client-Id': credentials.clientID},
  });
  const body = bodyOf(response);
  if (!isSuccess(response) || !body || !Array.isArray(body.data)) return null;
  if (!body.data.every(stream => stream && typeof stream.user_login === 'string')) return null;
  const live = new Map(body.data.map(stream => [stream.user_login.toLowerCase(), stream]));
  const status = Object.fromEntries(logins.map(login => [login, live.has(login)]));
  const details = Object.fromEntries(logins.filter(login => live.has(login)).map(login => {
    const stream = live.get(login);
    return [login, liveDetails(stream.title, stream.game_name, stream.viewer_count)];
  }));
  return {status, details};
}

async function gqlUsers(http, logins, fields) {
  const aliases = logins.map((login, index) => `u${index}:user(login:${JSON.stringify(login)}){${fields}}`);
  const response = await http.post(GQL_URL, {headers: requestHeaders(), data: {query: `query{${aliases.join(' ')}}`}});
  const body = bodyOf(response);
  if (!isSuccess(response) || !body || !body.data || typeof body.data !== 'object') return null;
  const errors = Object.hasOwn(body, 'errors') ? body.errors : [];
  // Unscoped errors cannot be attributed to a field. Scoped field errors must
  // not take away the rest of a successful response.
  if (!Array.isArray(errors) || errors.some(error => !Array.isArray(error?.path) || !error.path.length)) return null;
  return {data: body.data, errors};
}

// GQL aliases are under our control; an error can cover a user, a parent
// field, or one child. An error in one alias never invalidates another.
function fieldFailed(reply, alias, ...path) {
  return reply.errors.some(({path: failed}) => failed[0] === alias &&
    failed.slice(1).every((key, index) => key === path[index]));
}

function broadcastDetail(reply, alias) {
  const user = reply.data[alias];
  if (!user || fieldFailed(reply, alias, 'lastBroadcast')) return null;
  const broadcast = user.lastBroadcast;
  if (!broadcast) return null;
  return lastBroadcastDetail({lastBroadcast: {
    startedAt: fieldFailed(reply, alias, 'lastBroadcast', 'startedAt') ? undefined : broadcast.startedAt,
    title: fieldFailed(reply, alias, 'lastBroadcast', 'title') ? undefined : broadcast.title
  }});
}

async function gqlBatch(http, logins) {
  const reply = await gqlUsers(http, logins, 'stream{id,title,viewersCount,game{displayName}} lastBroadcast{startedAt title}');
  if (!reply) return null;
  const status = [], details = [];
  logins.forEach((login, index) => {
    const alias = 'u' + index;
    const user = reply.data[alias];
    const stream = user && user.stream;
    const failed = fieldFailed(reply, alias, 'stream', 'id');
    // A null stream caused by a nested field error is not proof of being offline.
    const streamError = reply.errors.some(({path}) => path[0] === alias && path[1] === 'stream');
    const live = failed ? null : user && stream === null && !streamError ? false
      : stream && typeof stream.id === 'string' ? true : null;
    status.push([login, live]);
    const detail = live === true ? liveDetails(stream.title, stream.game && stream.game.displayName, stream.viewersCount)
      : live === false ? broadcastDetail(reply, alias) : null;
    if (live === true) {
      if (fieldFailed(reply, alias, 'stream', 'title')) delete detail.title;
      if (fieldFailed(reply, alias, 'stream', 'viewersCount')) delete detail.viewers;
      if (fieldFailed(reply, alias, 'stream', 'game', 'displayName')) delete detail.category;
    }
    if (detail && Object.keys(detail).length) details.push([login, detail]);
  });
  return {status: Object.fromEntries(status), details: Object.fromEntries(details)};
}

// Last-broadcast details are not available as a Helix batch. Each anonymous query carries at
// most 50 validated logins and never an account credential or typed text.
async function lastBroadcasts(logins, deps) {
  const unique = [...new Set(logins)].filter(login => typeof login === 'string' && LOGIN_PATTERN.test(login));
  const batches = [];
  for (let offset = 0; offset < unique.length; offset += 50) {
    const batch = unique.slice(offset, offset + 50);
    batches.push(raceOnMain(() => gqlUsers(deps.http, batch, 'lastBroadcast{startedAt title}'),
      REQUEST_TIMEOUT_MS, {value: null}, deps).then(({value}) => {
      if (!value) return [];
      return batch.flatMap((login, index) => {
        const detail = broadcastDetail(value, 'u' + index);
        return detail ? [[login, detail]] : [];
      });
    }));
  }
  return Object.fromEntries((await Promise.all(batches)).flat());
}

async function followedSuggestions(credentials, deps) {
  const outcome = await raceOnMain(async () => {
    const helix = createHelix({http: deps.http, clientID: credentials.clientID, token: credentials.token});
    const request = {userID: credentials.userID};
    const [live, channels] = await Promise.all([helix.followedLive(request), helix.followedChannelsPage(request)]);
    const rows = new Map(), status = new Map(), details = new Map();
    for (const channel of channels.rows) {
      if (!LOGIN_PATTERN.test(channel.login)) continue;
      const login = channel.login.toLowerCase();
      rows.set(login, {provider: 'twitch', login, displayName: cleanTitle(channel.name) || login});
      status.set(login, false);
    }
    for (const stream of live) {
      if (!LOGIN_PATTERN.test(stream.login)) continue;
      const login = stream.login.toLowerCase();
      if (!rows.has(login)) rows.set(login, {provider: 'twitch', login, displayName: cleanTitle(stream.name) || login});
      status.set(login, true);
      details.set(login, liveDetails(stream.title, stream.game, stream.viewers));
    }
    return {rows: [...rows.values()], status: Object.fromEntries(status), details: Object.fromEntries(details), cursor: channels.cursor};
  }, REQUEST_TIMEOUT_MS, {value: null}, deps);
  return outcome.value || null;
}

// F3: check immediately before issuing each actual request, including after
// an asynchronous response. IINA 1.5.1's standaloneWindow.isOpen() already
// dispatches its visibility read through Utility.executeOnMainThread.
function requestForOwner(deps, start) {
  return !deps.canRequest || deps.canRequest() ? start() : null;
}

// F6: the first page was already fetched for the at-rest list. Read at most
// nine more pages, each with an owner check and one overall deadline. Keep successful
// membership even if a subsequent page fails.
async function remainingFollowedChannels(credentials, cursor, deps) {
  const rows = [];
  const helix = createHelix({http: deps.http, clientID: credentials.clientID, token: credentials.token});
  let active = true;
  await raceOnMain(async () => {
    for (let page = 1; active && page < 10 && cursor; page++) {
      const reply = await requestForOwner(deps, () => helix.followedChannelsPage({userID: credentials.userID, after: cursor}));
      if (!active || !reply) break;
      for (const channel of reply.rows) {
        if (LOGIN_PATTERN.test(channel.login)) rows.push(channel.login.toLowerCase());
      }
      cursor = reply.cursor;
    }
  }, REQUEST_TIMEOUT_MS, {value: null}, deps);
  active = false;
  return rows;
}

// #74 phase 2: validate at the actual request boundary as well as before
// scheduling. Only trimmed search text, never an address, can leave here.
function searchText(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return /^[\p{L}\p{M}\p{Nd}_ ]{2,40}$/u.test(text) ? text : null;
}

function searchRow(login, name, live, details) {
  if (typeof login !== 'string' || !LOGIN_PATTERN.test(login)) return null;
  return {provider: 'twitch', login: login.toLowerCase(), displayName: cleanTitle(name) || login, live, details};
}

async function gqlSearch(http, text, deps) {
  const query = `query{searchFor(userQuery:${JSON.stringify(text)},platform:"web"){channels{edges{item{... on User{login displayName stream{viewersCount title game{displayName}} lastBroadcast{startedAt title}}}}}}}`;
  const response = await postWithTimeout(http, {headers: {'Client-Id': WEB_CLIENT_ID, 'Content-Type': 'application/json'}, data: {query}}, deps);
  const body = bodyOf(response);
  const edges = body?.data?.searchFor?.channels?.edges;
  if (!isSuccess(response) || !Array.isArray(edges)) return null;
  const errors = body.errors ?? [];
  if (!Array.isArray(errors) || errors.some(error => !Array.isArray(error?.path) || !error.path.length)) return null;
  return edges.flatMap((edge, index) => {
    const user = edge?.item;
    if (!user) return [];
    const prefix = ['searchFor', 'channels', 'edges', index, 'item'];
    // A scoped field failure loses only that field. A null stream caused by
    // an error is not evidence that the channel is offline.
    const failed = (...path) => errors.some(error => error.path.every((key, i) => key === [...prefix, ...path][i]));
    const streamFailed = errors.some(error => {
      const path = [...prefix, 'stream'];
      return error.path.slice(0, path.length).every((key, i) => key === path[i]);
    });
    const stream = user.stream;
    const live = failed('stream') ? null : stream && typeof stream === 'object' ? true
      : stream === null && !streamFailed ? false : null;
    let details = {};
    if (live === true) {
      details = liveDetails(stream.title, stream.game?.displayName, stream.viewersCount);
      if (failed('stream', 'title')) delete details.title;
      if (failed('stream', 'game', 'displayName')) delete details.category;
      if (failed('stream', 'viewersCount') || !Number.isFinite(stream.viewersCount)) delete details.viewers;
    } else if (live === false && !failed('lastBroadcast')) {
      details = lastBroadcastDetail(user) || {};
      if (failed('lastBroadcast', 'startedAt')) delete details.lastAt;
      if (failed('lastBroadcast', 'title')) delete details.lastTitle;
    }
    const row = searchRow(user.login, user.displayName, live, details);
    return row ? [row] : [];
  });
}

async function helixSearch(text, credentials, deps) {
  const {http} = deps;
  const outcome = await raceOnMain(() => requestForOwner(deps, () => http.get('https://api.twitch.tv/helix/search/channels', {
    params: {query: text, first: '10'},
    headers: {Authorization: `Bearer ${credentials.token}`, 'Client-Id': credentials.clientID},
  })), REQUEST_TIMEOUT_MS, {value: null}, deps);
  const response = outcome.value;
  const body = bodyOf(response);
  if (!isSuccess(response) || !Array.isArray(body?.data)) return null;
  const rows = body.data.slice(0, 10).flatMap(channel => {
    if (!channel || typeof channel.is_live !== 'boolean') return [];
    const details = channel.is_live ? {title: cleanTitle(channel.title), category: cleanTitle(channel.game_name)} : {};
    const row = searchRow(channel.broadcaster_login, channel.display_name, channel.is_live, details);
    return row ? [row] : [];
  });
  const live = [...new Set(rows.filter(row => row.live).map(row => row.login))];
  const offline = [...new Set(rows.filter(row => !row.live).map(row => row.login))];
  const followups = await requestForOwner(deps, () => Promise.all([
    live.length ? channelsStatus(live, credentials, deps) : null,
    lastBroadcasts(offline, deps),
  ]));
  if (!followups) return null;
  const [streams, broadcasts] = followups;
  // Search Channels supplies the marks, titles and categories; Get Streams
  // supplies only missing counts. A failed detail lookup never changes a mark.
  for (const row of rows) {
    if (row.live) {
      const detail = streams?.details[row.login];
      if (detail) row.details.viewers = detail.viewers;
    } else if (Object.hasOwn(broadcasts, row.login)) row.details = broadcasts[row.login];
  }
  return rows;
}

async function searchChannels(value, credentials, deps) {
  const text = searchText(value);
  if (text === null) return null;
  try {
    return credentials ? await helixSearch(text, credentials, deps) : await gqlSearch(deps.http, text, deps);
  } catch (_) {
    // Do not log upstream errors: they may echo typed text or headers.
    return null;
  }
}

module.exports = {recentArchives, recentBroadcasts, channelStatus, channelsStatus, lastBroadcasts, followedSuggestions, remainingFollowedChannels, searchText, searchChannels};
