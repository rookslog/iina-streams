'use strict';

// Twitch Helix client for the Following list (#30) and a channel's recent VODs (#32).
//
//   createHelix({http, clientID, token, log})
//     -> {followedLive({userID}), recentVODs({login})}
//
// Both methods resolve to arrays, or reject with an Error whose `code` is one of NEEDS_PERMISSION,
// SIGNED_OUT, RATE_LIMITED, NETWORK or MALFORMED. RATE_LIMITED also carries `resetAt`, the raw
// Ratelimit-Reset header string (a Unix epoch), or '' when the host gave no headers.
//
// `http` is iina.http-shaped. IINA casts `params` and `headers` with `as? [String: String]`, so one
// non-string value drops the whole map: every param and header value below is a string.
//
// The token goes only into the Authorization header. Neither messages nor logs carry it, and logs
// carry no text an upstream or a transport error sent back, since that can echo request headers.
//
// Endpoint shapes, checked against the Twitch API reference on 2026-11-22:
//   Get Followed Streams  https://dev.twitch.tv/docs/api/reference/streams#get-followed-streams
//     GET /helix/streams/followed?user_id=&first=&after=, needs a user token with user:read:follows,
//     user_id must match the token's user, list is in descending viewer order, a full page carries a
//     cursor even when no more streams remain (the next page is then empty).
//   Get Users             https://dev.twitch.tv/docs/api/reference/users#get-users
//     GET /helix/users?login=, user or app token.
//   Get Videos            https://dev.twitch.tv/docs/api/reference/videos#get-videos
//     GET /helix/videos?user_id=&type=archive&first=, user or app token.
//   Rate limits           https://dev.twitch.tv/docs/api/guide#twitch-rate-limits
//     429 responses; Ratelimit-Reset is the epoch second at which the bucket is full again.

const API_BASE = 'https://api.twitch.tv/helix';
const FOLLOWED_PAGE_SIZE = '100';
const VOD_COUNT = '10';
// 2,000 followed channels is the documented ceiling, so 20 full pages is more than Twitch can return.
const MAX_FOLLOWED_PAGES = 20;

const MESSAGES = {
  NEEDS_PERMISSION: 'Twitch needs permission to read who you follow.',
  SIGNED_OUT: 'Sign in to Twitch again.',
  RATE_LIMITED: 'Twitch asked us to slow down.',
  NETWORK: 'Could not reach Twitch.',
  MALFORMED: 'Twitch sent a reply that could not be understood.',
};

class TwitchHelixError extends Error {
  constructor(code, extra) {
    super(MESSAGES[code]);
    this.name = 'TwitchHelixError';
    this.code = code;
    if (extra) {
      Object.assign(this, extra);
    }
  }
}

function makeLogger(log) {
  return function logLine(stage, details) {
    if (typeof log !== 'function') {
      return;
    }
    try {
      log('twitch-helix', stage, details);
    } catch (_) {
      // A broken logger must not change the result of a request.
    }
  };
}

// ---- response reading ----

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

// Case-insensitive, because HTTP header names are and the host does not say how it cases them.
// Returns '' when the response carries no headers (the IINA response shape is not known to have any).
function headerOf(response, name) {
  const headers = response && response.headers;
  if (!headers || typeof headers !== 'object') {
    return '';
  }
  const wanted = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === wanted) {
      return String(headers[key]);
    }
  }
  return '';
}

// ---- error mapping ----

function mentionsMissingScope(response) {
  const body = bodyOf(response);
  const message = body && typeof body.message === 'string' ? body.message : '';
  return /scope/i.test(message);
}

function codeForStatus(response) {
  const status = response.statusCode;
  if (status === 401) {
    return mentionsMissingScope(response) ? 'NEEDS_PERMISSION' : 'SIGNED_OUT';
  }
  if (status === 429) {
    return 'RATE_LIMITED';
  }
  if (status >= 500) {
    return 'NETWORK';
  }
  // Any other 4xx means we sent something Twitch refused: a bug on our side, not the user's state.
  return 'MALFORMED';
}

// An iina.http failure is the response object itself ({statusCode, reason, text}); a transport
// failure is some other Error. Only the status code, the scope message and the reset header are
// read: nothing else in a failure is trusted not to echo the request.
function mapFailure(failure) {
  if (failure instanceof TwitchHelixError) {
    return failure;
  }
  if (failure && typeof failure.statusCode === 'number') {
    const code = codeForStatus(failure);
    if (code === 'RATE_LIMITED') {
      return new TwitchHelixError(code, {resetAt: headerOf(failure, 'Ratelimit-Reset')});
    }
    return new TwitchHelixError(code);
  }
  return new TwitchHelixError('NETWORK');
}

// ---- requests ----

function requestHeaders(config) {
  return {
    Authorization: `Bearer ${config.token}`,
    'Client-Id': config.clientID,
  };
}

// Resolves to the parsed JSON body of a 2xx response; rejects with a TwitchHelixError.
async function getJSON(config, path, params, stage) {
  const options = {params, headers: requestHeaders(config)};
  let response;
  try {
    response = await config.http.get(`${API_BASE}${path}`, options);
    if (response && typeof response.statusCode === 'number' && (response.statusCode < 200 || response.statusCode >= 300)) {
      throw response;
    }
  } catch (failure) {
    const error = mapFailure(failure);
    config.logLine(stage, {failed: error.code});
    throw error;
  }
  const body = bodyOf(response);
  if (!body || typeof body !== 'object') {
    config.logLine(stage, {failed: 'MALFORMED'});
    throw new TwitchHelixError('MALFORMED');
  }
  return body;
}

function dataArray(body, stage, config) {
  if (!Array.isArray(body.data)) {
    config.logLine(stage, {failed: 'MALFORMED'});
    throw new TwitchHelixError('MALFORMED');
  }
  return body.data;
}

function isString(value) {
  return typeof value === 'string';
}

// ---- followed live streams ----

function mapStream(stream) {
  const valid = stream
    && isString(stream.user_login)
    && isString(stream.user_name)
    && Number.isFinite(stream.viewer_count);
  if (!valid) {
    throw new TwitchHelixError('MALFORMED');
  }
  return {
    login: stream.user_login,
    name: stream.user_name,
    title: isString(stream.title) ? stream.title : '',
    game: isString(stream.game_name) ? stream.game_name : '',
    viewers: stream.viewer_count,
    startedAt: isString(stream.started_at) ? stream.started_at : '',
    // Twitch's {width}x{height} placeholders stay in place for the caller to fill.
    thumbnail: isString(stream.thumbnail_url) ? stream.thumbnail_url : '',
  };
}

function nextCursor(body) {
  const cursor = body.pagination && body.pagination.cursor;
  return isString(cursor) && cursor !== '' ? cursor : '';
}

async function fetchFollowedPages(config, userID) {
  const streams = [];
  let cursor = '';
  for (let page = 0; page < MAX_FOLLOWED_PAGES; page += 1) {
    const params = {user_id: userID, first: FOLLOWED_PAGE_SIZE};
    if (cursor) {
      params.after = cursor;
    }
    const body = await getJSON(config, '/streams/followed', params, 'followed');
    const data = dataArray(body, 'followed', config);
    streams.push(...data);
    cursor = nextCursor(body);
    // A full page carries a cursor even at the end, so an empty page is the stop signal too.
    if (!cursor || data.length === 0) {
      break;
    }
  }
  return streams;
}

async function followedLive(config, request) {
  const userID = request && request.userID;
  if (!isString(userID) || userID === '') {
    throw new TwitchHelixError('MALFORMED');
  }
  const streams = await fetchFollowedPages(config, userID);
  const mapped = streams.map(mapStream);
  // Twitch documents descending viewer order per page; pages are fetched at different moments,
  // so the merged list is sorted again.
  mapped.sort((a, b) => b.viewers - a.viewers);
  config.logLine('followed', {count: mapped.length});
  return mapped;
}

// ---- recent VODs ----

function mapVideo(video) {
  const valid = video
    && isString(video.id)
    && /^\d{1,20}$/.test(video.id)
    && isString(video.created_at);
  if (!valid) {
    throw new TwitchHelixError('MALFORMED');
  }
  return {
    id: video.id,
    title: isString(video.title) ? video.title : '',
    createdAt: video.created_at,
    // Twitch's duration string ("1h5m3s") is kept as sent.
    duration: isString(video.duration) ? video.duration : '',
    // Built from the id, not copied from `video.url`, which can carry a ?t= offset.
    url: `https://www.twitch.tv/videos/${video.id}`,
  };
}

async function lookupUserID(config, login) {
  const body = await getJSON(config, '/users', {login}, 'user');
  const users = dataArray(body, 'user', config);
  if (users.length === 0) {
    return '';
  }
  const user = users[0];
  if (!user || !isString(user.id) || user.id === '') {
    config.logLine('user', {failed: 'MALFORMED'});
    throw new TwitchHelixError('MALFORMED');
  }
  return user.id;
}

async function recentVODs(config, request) {
  const login = request && request.login;
  if (!isString(login) || login === '') {
    throw new TwitchHelixError('MALFORMED');
  }
  const userID = await lookupUserID(config, login);
  if (!userID) {
    // Get Users omits unknown, deleted and suspended accounts: there is nothing to list.
    config.logLine('videos', {count: 0});
    return [];
  }
  const params = {user_id: userID, type: 'archive', first: VOD_COUNT};
  const body = await getJSON(config, '/videos', params, 'videos');
  const mapped = dataArray(body, 'videos', config).map(mapVideo);
  config.logLine('videos', {count: mapped.length});
  return mapped;
}

// ---- public ----

function createHelix(options) {
  const {http, clientID, token, log} = options || {};
  if (!http || !isString(clientID) || !isString(token)) {
    throw new TypeError('createHelix needs http, a clientID string and a token string');
  }
  const config = {http, clientID, token, logLine: makeLogger(log)};
  return {
    followedLive: request => followedLive(config, request),
    recentVODs: request => recentVODs(config, request),
  };
}

module.exports = {createHelix, TwitchHelixError};
