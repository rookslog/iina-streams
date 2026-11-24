'use strict';

// Resolves a source to a playable media URL. Twitch is resolved in plugin JS (src/twitch-playback.js);
// everything else, and every Twitch failure that is not a definitive answer, goes to the media helper.
//
//   createResolver({resolveTwitch, http, helperResolve, log, now}) -> async resolve(source, quality, signal)
//
// `signal` (optional) is the loss signal of the activation the resolve is for, {lost()} (src/authority.js).
// Class L pass 2: nothing downstream starts once it is lost. Each stage starts through one gate that checks it
// at that moment: every HTTP request through gatedHttp, every media helper launch through launchHelper. A
// stage that would start after the loss rejects with a LOST error instead.
//
// The result has the helper's shape: {ok, source, title, live, duration, quality, formats, mediaURL}
// or {ok: false, error: {code, message}} (plus error.reason 'offline' for a channel that is not live). The JS path sends no headers, so `headers` is absent.
// Messages mirror helpers/media.py ERROR_MESSAGES. Nothing here logs a URL, token or signature.

const AUTO = {id: 'auto720', label: 'Auto · 720p preferred'};
const AUDIO_ONLY = 'audio_only';
const PREFERRED_HEIGHT = 720;
const HIGH_FPS = 50;

const ERROR_MESSAGES = {
  UNAVAILABLE: 'This video or stream is unavailable. It may be offline, private, or restricted.',
  QUALITY_UNAVAILABLE: 'That quality is no longer available. Open the stream again and choose another quality.',
  NO_PLAYABLE_FORMAT: 'No compatible public playback format is currently available.',
};

// Twitch answers that mean "no", where the helper would also fail with UNAVAILABLE.
const DEFINITIVE_CODES = ['OFFLINE', 'NOT_FOUND', 'RESTRICTED'];

function failure(code) {
  return {ok: false, error: {code, message: ERROR_MESSAGES[code]}};
}

// A definitive OFFLINE keeps the helper's UNAVAILABLE shape and adds reason 'offline' (D-030), so the
// player can offer the channel's recent broadcasts. NOT_FOUND and RESTRICTED stay plain UNAVAILABLE.
function definitiveFailure(code) {
  const result = failure('UNAVAILABLE');
  if (code === 'OFFLINE') {
    result.error.reason = 'offline';
  }
  return result;
}

function twitchRequest(source) {
  if (source && source.kind === 'twitch-live') {
    return {kind: 'live', login: source.id};
  }
  if (source && source.kind === 'twitch-vod') {
    return {kind: 'vod', id: source.id};
  }
  return null;
}

// ---- variants to the helper's formats ----

function heightOf(resolution) {
  const match = /^\d+x(\d+)$/.exec(resolution || '');
  return match ? Number(match[1]) : 0;
}

// Streamlink's Twitch names: 1080p60, 720p60, 480p. The fps suffix appears from 50 fps up.
function optionFrom(variant) {
  if (variant.name === AUDIO_ONLY) {
    return {id: AUDIO_ONLY, label: 'Audio only', height: 0, fps: 0, url: variant.url};
  }
  const height = heightOf(variant.resolution);
  if (height === 0) {
    return null;
  }
  const fps = typeof variant.fps === 'number' ? variant.fps : 30;
  const suffix = fps >= HIGH_FPS ? String(Math.round(fps)) : '';
  const id = `${height}p${suffix}`;
  return {id, label: id, height, fps, url: variant.url};
}

// "chunked" is the source rendition and can share an id with a named variant; the named one wins.
function buildOptions(variants) {
  const options = new Map();
  const ordered = [...variants].sort((a, b) => Number(a.name === 'chunked') - Number(b.name === 'chunked'));
  for (const variant of ordered) {
    const option = optionFrom(variant);
    if (option && !options.has(option.id)) {
      options.set(option.id, option);
    }
  }
  return options;
}

function publicFormats(options) {
  const ordered = [...options.values()].sort((a, b) => (b.height - a.height) || (b.fps - a.fps));
  return [{...AUTO}, ...ordered.map(({id, label}) => ({id, label}))];
}

// Mirrors helpers/media.py _choose: the best video at 720p or below, else the lowest video.
function chooseOption(options, quality) {
  if (quality !== AUTO.id) {
    return options.get(quality) || null;
  }
  const video = [...options.values()].filter(option => option.height > 0);
  if (video.length === 0) {
    return null;
  }
  let preferred = video.filter(option => option.height <= PREFERRED_HEIGHT);
  if (preferred.length === 0) {
    const lowest = Math.min(...video.map(option => option.height));
    preferred = video.filter(option => option.height === lowest);
  }
  return preferred.reduce((best, option) => (
    (option.height > best.height || (option.height === best.height && option.fps > best.fps)) ? option : best
  ));
}

function helperShapedResult(source, quality, twitch) {
  const options = buildOptions(twitch.variants);
  if (options.size === 0) {
    return failure('NO_PLAYABLE_FORMAT');
  }
  const selected = chooseOption(options, quality);
  if (!selected) {
    return failure(quality === AUTO.id ? 'NO_PLAYABLE_FORMAT' : 'QUALITY_UNAVAILABLE');
  }
  return {
    ok: true,
    source,
    title: twitch.title,
    live: twitch.live,
    duration: null,
    quality: selected.id,
    formats: publicFormats(options),
    mediaURL: selected.url,
  };
}

// ---- loss ----

function stopIfLost(signal) {
  if (signal && signal.lost()) {
    const error = new Error('The resolve was abandoned.');
    error.code = 'LOST';
    throw error;
  }
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

// `http` with every request checked against `signal` when it would start. Methods keep `http` as their `this`.
// Without a signal (a two-argument resolve) there is nothing to check, and `http` itself is used.
function gatedHttp(http, signal) {
  if (!signal) {
    return http;
  }
  // Every method is wrapped, whatever typeof reports for a native export: a missing one throws at the call, as
  // it would on `http` itself.
  const gated = {};
  for (const method of HTTP_METHODS) {
    gated[method] = (...args) => {
      stopIfLost(signal);
      return http[method](...args);
    };
  }
  return gated;
}

// ---- resolver ----

function errorCode(error) {
  const code = error && error.code;
  return typeof code === 'string' && /^[A-Z_]+$/.test(code) ? code : 'UNEXPECTED';
}

function createResolver({resolveTwitch, http, helperResolve, log, onChannel}) {
  function recordFallback(code) {
    if (typeof log !== 'function') {
      return;
    }
    try {
      log('twitch-js-fallback', code);
    } catch (_) {
      // A broken logger must not change the result.
    }
  }

  // The only launch of the media helper. fallbackCode, when given, is the Twitch failure it falls back from.
  function launchHelper(source, quality, signal, fallbackCode) {
    stopIfLost(signal);
    if (fallbackCode) {
      recordFallback(fallbackCode);
    }
    return helperResolve(source, quality);
  }

  async function resolveWithTwitch(source, quality, request, signal) {
    let twitch;
    try {
      twitch = await resolveTwitch(request, {http: gatedHttp(http, signal), log, includeTitle: true});
    } catch (error) {
      const code = errorCode(error);
      if (DEFINITIVE_CODES.includes(code)) {
        return definitiveFailure(code);
      }
      return launchHelper(source, quality, signal, code);
    }
    if (typeof onChannel === 'function' && twitch && twitch.channel) {
      onChannel(source, twitch.channel);
    }
    return helperShapedResult(source, quality, twitch);
  }

  return async function resolve(source, quality, signal) {
    const request = twitchRequest(source);
    if (!request) {
      return launchHelper(source, quality, signal, null);
    }
    return resolveWithTwitch(source, quality, request, signal);
  };
}

module.exports = {createResolver};
