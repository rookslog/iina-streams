"use strict";
// QA-only command harness. It is packaged only by `scripts/build.py --dev --qa`
// (never into beta or stable archives) and required by main.js when config.qa is set.
//
// Protocol: qa/control.py writes @data/qa-request.json {id, command, data, targetSource}.
// This file answers in @data/qa-response.json {id, time, result, state}. Every response
// carries a redacted state snapshot. Nothing here prints or returns credentials.

const REQUEST_FILE = '@data/qa-request.json';
const RESPONSE_FILE = '@data/qa-response.json';
const MAX_REQUEST_BYTES = 8192;
const POLL_MS = 400;
const MAX_DEPTH = 8;

// Keys whose names say "credential". The field is dropped, whatever its value.
const SECRET_KEY = /token|secret|password|passwd|authorization|credential|keychain|(?:device|user)[_-]?code|^code$/i;
// Values that look like credentials even under an innocent key.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_VALUE_PATTERNS = [
  /\bbearer\s+\S+/i,
  /\boauth:\S+/i,
  /[?&](?:access_token|oauth_token|token|sig|auth)=/i,
];
const OPAQUE_VALUE = /^[A-Za-z0-9_-]{32,}$/;
const ELEMENT_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

function looksSecret(value) {
  if (UUID.test(value)) return false;
  return OPAQUE_VALUE.test(value) || SECRET_VALUE_PATTERNS.some(pattern => pattern.test(value));
}

// Returns a copy of `value` without credential-named fields or credential-shaped strings.
// `counter.dropped` counts what was removed so a reader can tell redaction happened.
function redact(value, counter, depth = 0) {
  if (typeof value === 'string') {
    if (looksSecret(value)) {
      counter.dropped += 1;
      return '[redacted]';
    }
    return value;
  }
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value)) return value.map(item => redact(item, counter, depth + 1));
  const copy = {};
  for (const key of Object.keys(value)) {
    if (SECRET_KEY.test(key)) {
      counter.dropped += 1;
      continue;
    }
    copy[key] = redact(value[key], counter, depth + 1);
  }
  return copy;
}

function run(host, controller, config, services) {
  const {file, mpv, core, event} = host;
  let lastID = '';
  let closed = false;
  let timer = null;
  let armedInput = false;

  controller.qaPongListener = data => {
    services.trace('qa-pong', {route: typeof data === 'string' ? data : data && data.route, type: typeof data});
  };
  controller.qaInputListeners = [];

  const messageSetup = setTimeout(() => {
    clearTimeout(messageSetup);
    if (closed) return;
    host.global.onMessage('qa-pong', controller.qaPongListener);
    if (!host.input) return;
    for (const name of ['onMouseDown', 'onMouseUp']) {
      const listener = data => {
        if (armedInput && !closed) {
          services.trace('native-input', {kind: name, x: data.x, y: data.y, clickCount: data.clickCount});
        }
        return false;
      };
      controller.qaInputListeners.push(listener);
      host.input[name](host.input.MOUSE, listener, host.input.PRIORITY_HIGH);
    }
  }, 0);

  function nativeState() {
    return {
      position: mpv.getNumber('time-pos'),
      duration: mpv.getNumber('duration'),
      paused: mpv.getFlag('pause'),
      speed: mpv.getNumber('speed'),
      width: mpv.getNumber('video-params/w'),
      height: mpv.getNumber('video-params/h'),
      videoCodec: mpv.getString('video-codec'),
      videoFps: mpv.getNumber('container-fps'),
      droppedFrames: mpv.getNumber('frame-drop-count'),
      audioCodec: mpv.getString('audio-codec-name'),
      audioRate: mpv.getNumber('audio-params/samplerate'),
      playlistCount: mpv.getNumber('playlist-count'),
      idle: mpv.getFlag('idle-active'),
      seeking: mpv.getFlag('seeking'),
      pausedForCache: mpv.getFlag('paused-for-cache'),
      cacheBuffering: mpv.getNumber('cache-buffering-state'),
      fullscreen: core.window.fullscreen,
      frame: core.window.frame,
      hwdec: mpv.getString('hwdec-current'),
      activeHelpers: services.activeHelpers ? services.activeHelpers() : [],
    };
  }

  // The state every response carries. Credentials are removed here, once, for all commands.
  function state() {
    const counter = {dropped: 0};
    const safe = redact({controller: controller.snapshot(), native: nativeState()}, counter);
    safe.redactedFields = counter.dropped;
    return safe;
  }

  function report(id, result) {
    if (closed) return;
    file.write(RESPONSE_FILE, JSON.stringify({
      id,
      time: new Date().toISOString(),
      result: result === undefined ? true : result,
      state: state(),
    }));
  }

  function keychainProbe() {
    const service = 'native-qa-probe';
    const name = 'noncredential';
    const sample = 'streams-native-probe-' + Date.now();
    const wrote = host.utils.keychainWrite(service, name, sample) === true;
    const matched = wrote && host.utils.keychainRead(service, name) === sample;
    const cleared = host.utils.keychainWrite(service, name, '') === true
      && host.utils.keychainRead(service, name) === '';
    return {wrote, matched, cleared};
  }

  function overlaySimpleProbe() {
    host.overlay.simpleMode();
    host.overlay.setStyle('body { background:transparent; color:white; font:40px -apple-system; } '
      + '#content { position:absolute; left:80px; top:100px; background:#d80000; padding:30px; }');
    host.overlay.setContent('<div>Native overlay diagnostic</div>');
    host.overlay.setOpacity(1);
    host.overlay.show();
  }

  // The sidebar's existing qa-action hook clicks by element id (ui/sidebar.js onQaAction).
  function click(data) {
    const id = String(data.id || data.selector || '').replace(/^#/, '');
    if (!ELEMENT_ID.test(id)) return {error: 'click needs a sidebar element id such as "refresh" or "#refresh"'};
    if (data.target && data.target !== 'sidebar') return {error: 'only sidebar clicks are supported'};
    controller.qaCommand('click', {id});
    return true;
  }

  function open(data) {
    const url = String(data.url || '');
    if (!url || url.length > 2048) return {error: 'open needs a url'};
    host.global.postMessage('qa-open', {url});
    return true;
  }

  async function execute(request) {
    const data = request.data || {};
    let result = true;
    switch (request.command) {
      case 'snapshot':
      case 'state':
        break;
      case 'keychain-probe': result = keychainProbe(); break;
      case 'ping': host.global.postMessage('qa-ping', {}); break;
      case 'arm-input': armedInput = !!data.enabled; break;
      case 'open': result = open(data); break;
      case 'click': result = click(data); break;
      case 'ui': controller.qaCommand(data.name, data.data); break;
      case 'overlay': controller.overlayCommand(data.name, data.data); break;
      case 'overlay-simple-probe': overlaySimpleProbe(); break;
      case 'show': controller.showSidebar(); break;
      case 'hide': controller.hideSidebar(); break;
      case 'import': result = await controller.importArchive(String(data.path)); break;
      case 'import-start':
        controller.importArchive(String(data.path)).then(ok => services.trace('qa-import-finished', {ok}));
        break;
      case 'off': controller.chatOff(); break;
      case 'view': controller.setView(data); break;
      case 'seek': mpv.command('seek', [String(Number(data.seconds) || 0), 'absolute+exact']); break;
      case 'pause': mpv.set('pause', !!data.value); break;
      case 'speed': mpv.set('speed', Math.max(0.25, Math.min(3, Number(data.value) || 1))); break;
      case 'fullscreen': Reflect.set(core.window, 'fullscreen', !!data.value); break;
      case 'frame':
        Reflect.set(core.window, 'frame', {
          x: Number(data.x),
          y: Number(data.y),
          width: Math.max(600, Number(data.width)),
          height: Math.max(400, Number(data.height)),
        });
        break;
      case 'quality': result = await controller.changeQuality(String(data.value)); break;
      case 'stop': core.stop(); break;
      default: result = {error: 'Unknown QA command'};
    }
    report(request.id, result);
  }

  function readRequest() {
    if (!file.exists(REQUEST_FILE)) return null;
    const raw = file.read(REQUEST_FILE);
    if (raw.length >= MAX_REQUEST_BYTES) return null;
    return JSON.parse(raw);
  }

  function isForThisPlayer(request) {
    return !request.targetSource || request.targetSource === controller.snapshot().source.id;
  }

  async function poll() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (closed) return;
    try {
      const request = readRequest();
      if (request && isForThisPlayer(request) && typeof request.id === 'string' && request.id !== lastID) {
        lastID = request.id;
        await execute(request);
      }
    } catch (_) {
      report(lastID, {error: 'QA command failed'});
    }
    if (!closed) timer = setTimeout(poll, POLL_MS);
  }

  event.on('iina.window-will-close', () => {
    closed = true;
    clearTimeout(messageSetup);
    if (timer !== null) clearTimeout(timer);
  });
  services.trace('qa-started', {
    variant: config.variant,
    keychainRead: typeof host.utils.keychainRead,
    keyChainRead: typeof host.utils.keyChainRead,
  });
  poll();
}

module.exports = {run, redact};
