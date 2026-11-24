'use strict';

// Resolves Twitch playback (live channel or VOD) to its HLS variants in plugin JS.
// Recipe: Streamlink 8.6.3 twitch.py (TwitchAPI.access_token, UsherService), observed working in spike #37.
//
//   resolveTwitch({kind: 'live', login} | {kind: 'vod', id}, {http, log, setTimeout, clearTimeout, includeTitle})
//     -> {live, variants: [{name, resolution, bandwidth, fps, url}]}   (plus `title` when includeTitle is true)
//
// includeTitle is opt-in. It sends a second, parallel POST with a plain-object title query (IINA drops array bodies).
// A missing title, a title error or an odd title value falls back to "<login or id> — Twitch"; it never fails playback.
//
// `http` is iina.http-shaped. IINA casts `params` and `headers` with `as? [String: String]`, so one
// non-string value drops the whole map: every param and header value below is a string.
//
// Failures reject with an Error whose `code` is OFFLINE, NOT_FOUND, RESTRICTED, NETWORK or MALFORMED.
// Neither messages nor logs carry the token, the signature, the usher query or anything upstream said.

const GQL_URL = 'https://gql.twitch.tv/gql';
const USHER_HOST = 'https://usher.ttvnw.net';
const WEB_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'; // Public web client id, the one Streamlink uses.
const PLAYBACK_HASH = 'ed230aa1e33e07eebb8928504583da78a5173989fadfb1ac94be06a04f3cdbe9';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT_MS = 2000;

const LOGIN_PATTERN = /^[A-Za-z0-9_]{1,25}$/;
const VOD_ID_PATTERN = /^\d{1,20}$/;
const MAX_URL_LENGTH = 16384;
const UNSAFE_URL_CHARACTERS = /[\x00-\x20\x7f\\]/;
const URL_PARTS = /^https:\/\/([^/?#]*)([^?#]*)(?:\?[^#]*)?(#.*)?$/i;
const HOST_CHARACTERS = /^[a-zA-Z0-9.-]+$/;
const TWITCH_SUFFIXES = ['ttvnw.net', 'twitch.tv', 'twitchcdn.net'];
const TWITCH_VOD_HOST = /^d[0-9a-z]{13}\.cloudfront\.net$/;
const TWITCH_VOD_PATH = /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/index-[A-Za-z0-9-]+\.m3u8$/;

const MAX_TITLE_LENGTH = 240;

const TOKEN_FIELD = {live: 'streamPlaybackAccessToken', vod: 'videoPlaybackAccessToken'};

const MESSAGES = {
  OFFLINE: 'That channel is offline.',
  NOT_FOUND: 'Twitch has no such channel or video.',
  RESTRICTED: 'Twitch will not play this without an account or in this region.',
  NETWORK: 'Could not reach Twitch.',
  MALFORMED: 'Twitch sent a reply that could not be understood.',
  UNSAFE_MEDIA_URL: 'Twitch sent a media address that is not safe to open.',
};

class TwitchPlaybackError extends Error {
  constructor(code) {
    super(MESSAGES[code]);
    this.name = 'TwitchPlaybackError';
    this.code = code;
  }
}

function makeLogger(log) {
  return function logLine(stage, details) {
    if (typeof log !== 'function') {
      return;
    }
    try {
      log('twitch-playback', stage, details);
    } catch (_) {
      // A broken logger must not change the result of a resolution.
    }
  };
}

function validateRequest(request) {
  if (!request || typeof request !== 'object') {
    throw new TwitchPlaybackError('MALFORMED');
  }
  if (request.kind === 'live') {
    if (typeof request.login !== 'string' || !LOGIN_PATTERN.test(request.login)) {
      throw new TwitchPlaybackError('NOT_FOUND');
    }
    return;
  }
  if (request.kind === 'vod') {
    if (typeof request.id !== 'string' || !VOD_ID_PATTERN.test(request.id)) {
      throw new TwitchPlaybackError('NOT_FOUND');
    }
    return;
  }
  throw new TwitchPlaybackError('MALFORMED');
}

// ---- timeout ----

async function withTimeout(start, timers) {
  // Call the timer functions bare: a native JavaScriptCore function may reject a foreign `this`.
  const setTimer = timers.setTimeout;
  const clearTimer = timers.clearTimeout;
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimer(() => reject(new TwitchPlaybackError('NETWORK')), REQUEST_TIMEOUT_MS);
  });
  try {
    // Promise.resolve().then also turns a synchronous throw from `start` into a rejection.
    return await Promise.race([Promise.resolve().then(start), expired]);
  } finally {
    clearTimer(timer);
  }
}

// ---- error mapping ----

function codeForStatus(statusCode, stage, kind) {
  if (statusCode === 401 || statusCode === 403) {
    return 'RESTRICTED';
  }
  if (statusCode === 404) {
    return stage === 'usher' && kind === 'live' ? 'OFFLINE' : 'NOT_FOUND';
  }
  return 'NETWORK';
}

// An iina.http failure is the response object itself ({statusCode, reason, text}); a transport
// failure is some other Error. Only the status code is read: reason and text can echo the query.
function mapFailure(failure, stage, kind) {
  if (failure instanceof TwitchPlaybackError) {
    return failure;
  }
  const statusCode = failure && failure.statusCode;
  if (typeof statusCode === 'number') {
    return new TwitchPlaybackError(codeForStatus(statusCode, stage, kind));
  }
  return new TwitchPlaybackError('NETWORK');
}

// ---- access token ----

function tokenRequestBody(request) {
  const isLive = request.kind === 'live';
  return {
    operationName: 'PlaybackAccessToken',
    extensions: {persistedQuery: {version: 1, sha256Hash: PLAYBACK_HASH}},
    variables: {
      isLive,
      login: isLive ? request.login : '',
      isVod: !isLive,
      vodID: isLive ? '' : request.id,
      playerType: 'embed',
      platform: 'site',
    },
  };
}

function tokenRequestHeaders() {
  return {
    'Client-ID': WEB_CLIENT_ID,
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
  };
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

// Returns {value, signature}. A null token is how Twitch says the channel or video does not exist.
function readAccessToken(response, kind) {
  const body = bodyOf(response);
  const payload = body && body.data;
  if (!payload || typeof payload !== 'object') {
    throw new TwitchPlaybackError('MALFORMED');
  }
  const token = payload[TOKEN_FIELD[kind]];
  if (token === null) {
    throw new TwitchPlaybackError('NOT_FOUND');
  }
  if (!token || typeof token.value !== 'string' || typeof token.signature !== 'string') {
    throw new TwitchPlaybackError('MALFORMED');
  }
  return {value: token.value, signature: token.signature};
}

// ---- title (opt-in, same POST as the token) ----

// The login and id are validated against strict patterns, so quoting them with JSON.stringify is safe.
function titleOperation(request) {
  if (request.kind === 'live') {
    return {query: `query{user(login:${JSON.stringify(request.login)}){broadcastSettings{title} displayName}}`};
  }
  return {query: `query{video(id:${JSON.stringify(request.id)}){title owner{login displayName}}}`};
}

function fallbackTitle(request) {
  const name = request.kind === 'live' ? request.login : request.id;
  return `${name} — Twitch`;
}

// Same cleanup as helpers/media.py _title: strip URLs, turn control characters into spaces, trim, cut by code point.
function cleanTitle(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const withoutUrls = value.replace(/https?:\/\/\S+/g, '');
  const withoutControls = withoutUrls.replace(/[\x00-\x1f\x7f]/g, ' ').trim();
  return Array.from(withoutControls).slice(0, MAX_TITLE_LENGTH).join('');
}

function readTitle(item, request) {
  const payload = item && item.data;
  if (!payload || typeof payload !== 'object') {
    return '';
  }
  if (request.kind === 'live') {
    const user = payload.user;
    return cleanTitle(user && user.broadcastSettings && user.broadcastSettings.title);
  }
  return cleanTitle(payload.video && payload.video.title);
}

function readChannel(item, request) {
  const payload = item && item.data;
  if (request.kind === 'live') {
    const rawName = payload && payload.user && payload.user.displayName;
    if (typeof rawName !== 'string' || !rawName.trim()) {
      return null;
    }
    return {provider: 'twitch', login: request.login.toLowerCase(), displayName: rawName.trim()};
  }
  const owner = payload && payload.video && payload.video.owner;
  if (!owner || typeof owner.login !== 'string' || !LOGIN_PATTERN.test(owner.login)) {
    return null;
  }
  const login = owner.login.toLowerCase();
  const displayName = typeof owner.displayName === 'string' && owner.displayName.trim()
    ? owner.displayName.trim()
    : login;
  return {provider: 'twitch', login, displayName};
}

// IINA's http API only reads `data` as a plain object (JavascriptAPIHttp.swift, `options?["data"] as? [String: Any]`),
// so each GraphQL operation is its own POST; a batch array would be sent as `{}`.
function postGraphQL(body, deps) {
  const options = {headers: tokenRequestHeaders(), data: body};
  return withTimeout(() => deps.http.post(GQL_URL, options), deps.timers);
}

// Resolves to {title, channel}, or fallback values on any error, timeout or odd shape. Never rejects.
async function fetchTitle(request, deps) {
  try {
    const response = await postGraphQL(titleOperation(request), deps);
    const body = bodyOf(response);
    return {title: readTitle(body, request), channel: readChannel(body, request)};
  } catch (_) {
    return {title: '', channel: readChannel(null, request)};
  }
}

async function fetchAccessToken(request, deps) {
  // Start the title POST alongside the token POST; only the token can fail playback.
  const tokenPost = postGraphQL(tokenRequestBody(request), deps);
  const titlePost = deps.includeTitle
    ? fetchTitle(request, deps)
    : Promise.resolve({title: '', channel: null});
  let token;
  try {
    token = readAccessToken(await tokenPost, request.kind);
  } catch (failure) {
    await titlePost;
    throw failure;
  }
  const meta = await titlePost;
  return {token, title: meta.title, channel: meta.channel};
}

// ---- usher ----

function usherCacheBuster() {
  return String(Math.floor(Math.random() * 999999));
}

function usherRequest(request, token) {
  const params = {
    platform: 'web',
    p: usherCacheBuster(),
    allow_source: 'true',
    allow_audio_only: 'true',
    playlist_include_framerate: 'true',
    multigroup_video: 'true',
    supported_codecs: 'h264',
  };
  if (request.kind === 'live') {
    params.sig = token.signature;
    params.token = token.value;
    params.fast_bread = 'true';
    return {url: `${USHER_HOST}/api/v2/channel/hls/${request.login.toLowerCase()}.m3u8`, params};
  }
  params.nauthsig = token.signature;
  params.nauth = token.value;
  return {url: `${USHER_HOST}/vod/v2/${request.id}.m3u8`, params};
}

async function fetchMaster(request, token, deps) {
  const {url, params} = usherRequest(request, token);
  const options = {params, headers: {'User-Agent': USER_AGENT}};
  const response = await withTimeout(() => deps.http.get(url, options), deps.timers);
  return response && response.text;
}

// ---- master playlist ----

function parseAttributes(text) {
  const attributes = {};
  for (const match of text.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g)) {
    attributes[match[1]] = match[2].replace(/^"|"$/g, '');
  }
  return attributes;
}

function numberOrNull(text) {
  const value = Number(text);
  return text && Number.isFinite(value) ? value : null;
}

// Port of helpers/media.py _media_url and _twitch_vod_path. The URL is parsed by hand, not with URL(),
// because URL() normalizes dot segments and the default port, and the VOD path rule must see the raw path.
function isTwitchVodPath(path) {
  return TWITCH_VOD_PATH.test(path) && !path.split('/').some(segment => segment === '.' || segment === '..');
}

function isSafeMediaUrl(value, kind) {
  if (typeof value !== 'string' || !value || value.length > MAX_URL_LENGTH || UNSAFE_URL_CHARACTERS.test(value)) {
    return false;
  }
  const parts = URL_PARTS.exec(value);
  if (!parts || parts[3] || parts[1].includes('@')) {
    return false;
  }
  const authority = parts[1];
  const colon = authority.indexOf(':');
  const host = (colon === -1 ? authority : authority.slice(0, colon)).toLowerCase();
  const port = colon === -1 ? '' : authority.slice(colon + 1);
  if (!/^\d*$/.test(port) || (port !== '' && Number(port) !== 443) || !HOST_CHARACTERS.test(host)) {
    return false;
  }
  if (TWITCH_SUFFIXES.some(suffix => host === suffix || host.endsWith(`.${suffix}`))) {
    return true;
  }
  return kind === 'vod' && TWITCH_VOD_HOST.test(host) && isTwitchVodPath(parts[2]);
}

function variantFrom(attributes, url, kind) {
  const name = attributes['STABLE-VARIANT-ID'];
  if (!name || typeof url !== 'string' || !url) {
    return null;
  }
  if (!isSafeMediaUrl(url, kind)) {
    throw new TwitchPlaybackError('UNSAFE_MEDIA_URL');
  }
  return {
    name,
    resolution: attributes.RESOLUTION || null,
    bandwidth: numberOrNull(attributes.BANDWIDTH) || 0,
    fps: numberOrNull(attributes['FRAME-RATE']),
    url,
  };
}

function parseMaster(text, kind) {
  if (typeof text !== 'string' || !text.startsWith('#EXTM3U')) {
    throw new TwitchPlaybackError('MALFORMED');
  }
  const lines = text.split(/\r?\n/);
  const variants = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith('#EXT-X-STREAM-INF:')) {
      continue;
    }
    const variant = variantFrom(parseAttributes(line.slice('#EXT-X-STREAM-INF:'.length)), lines[index + 1], kind);
    if (!variant) {
      throw new TwitchPlaybackError('MALFORMED');
    }
    variants.push(variant);
  }
  if (variants.length === 0) {
    throw new TwitchPlaybackError('MALFORMED');
  }
  return variants;
}

// ---- entry point ----

async function resolveTwitch(request, deps = {}) {
  const logLine = makeLogger(deps.log);
  validateRequest(request);
  const resolved = {
    http: deps.http,
    includeTitle: deps.includeTitle === true,
    timers: {
      setTimeout: deps.setTimeout || globalThis.setTimeout,
      clearTimeout: deps.clearTimeout || globalThis.clearTimeout,
    },
  };

  let token;
  let title = '';
  let channel = null;
  try {
    ({token, title, channel} = await fetchAccessToken(request, resolved));
  } catch (failure) {
    const error = mapFailure(failure, 'token', request.kind);
    logLine('token failed', {kind: request.kind, code: error.code, status: failure && failure.statusCode});
    throw error;
  }

  let variants;
  try {
    variants = parseMaster(await fetchMaster(request, token, resolved), request.kind);
  } catch (failure) {
    const error = mapFailure(failure, 'usher', request.kind);
    logLine('usher failed', {kind: request.kind, code: error.code, status: failure && failure.statusCode});
    throw error;
  }

  logLine('resolved', {kind: request.kind, variants: variants.length});
  const result = {live: request.kind === 'live', variants};
  if (resolved.includeTitle) {
    result.title = title || fallbackTitle(request);
    if (channel) {
      result.channel = channel;
    }
  }
  return result;
}

module.exports = {resolveTwitch, TwitchPlaybackError, isSafeMediaUrl};
