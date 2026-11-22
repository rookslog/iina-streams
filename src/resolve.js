'use strict';

// Resolves a source to a playable media URL. Twitch is resolved in plugin JS (src/twitch-playback.js);
// everything else, and every Twitch failure that is not a definitive answer, goes to the media helper.
//
//   createResolver({resolveTwitch, http, helperResolve, log, now}) -> async resolve(source, quality)
//
// The result has the helper's shape: {ok, source, title, live, duration, quality, formats, mediaURL}
// or {ok: false, error: {code, message}}. The JS path sends no headers, so `headers` is absent.
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

// ---- resolver ----

function errorCode(error) {
  const code = error && error.code;
  return typeof code === 'string' && /^[A-Z_]+$/.test(code) ? code : 'UNEXPECTED';
}

function createResolver({resolveTwitch, http, helperResolve, log}) {
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

  async function resolveWithTwitch(source, quality, request) {
    let twitch;
    try {
      twitch = await resolveTwitch(request, {http, log, includeTitle: true});
    } catch (error) {
      const code = errorCode(error);
      if (DEFINITIVE_CODES.includes(code)) {
        return failure('UNAVAILABLE');
      }
      recordFallback(code);
      return helperResolve(source, quality);
    }
    return helperShapedResult(source, quality, twitch);
  }

  return async function resolve(source, quality) {
    const request = twitchRequest(source);
    if (!request) {
      return helperResolve(source, quality);
    }
    return resolveWithTwitch(source, quality, request);
  };
}

module.exports = {createResolver};
