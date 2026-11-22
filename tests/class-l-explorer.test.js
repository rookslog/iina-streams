'use strict';

// v0.5.5 class L falsifier (docs/design/V055-CLASS-REPAIR-2026-11-22.md, "Class L: controller authority").
//
// Drives the real controller (src/player.js, a managed twitch-live window) in the IINA shim through every event
// sequence up to length K, then through seeded random sequences of length 8-12. After every step it checks L4
// and L5. At quiescence (held resolves settled, pending mpv loads delivered, every timer due within the horizon
// run), it checks L4 and L6.
//
// The oracle is external to the product. It needs no activation API, so it runs against any revision. An epoch
// is the model's name for an activation:
//   - the first epoch begins when the controller starts;
//   - a foreign-file hook or a window close ends the current epoch;
//   - after that, an own-source hook begins a new epoch.
// Work is attributed to the epoch that started it:
//   - a step to the epoch current when it runs (a loss step to the epoch it ends);
//   - a timer to the step that armed it;
//   - a resolve settlement to the step that called services.resolve.
//
// Checked per step:
//   L4: an on_load hook's `next` runs at most once; at quiescence, exactly once.
//   L5: work attributed to an ended epoch emits nothing (an mpv command or property, a sidebar, overlay or global
//       post, an HTTP request, a file write, a window write, an overlay or sidebar call; services.trace is a file
//       write, as in a QA build). The loss step and the turns it armed may also emit this teardown, at most once
//       each per loss:
//         - one sidebar `state` (for a foreign file, its phase must be `inactive`) and one overlay `state`;
//         - global `auth-disconnect` and `player-closed`;
//         - overlay `live-stop`, `overlay.hide` and `overlay.setClickable`;
//         - the `chat-off` and `window-closed` traces.
//       Teardown that a newer epoch could see is never allowed: no global post once a newer epoch is current.
//   L6: at quiescence the current epoch is not busy, a Go Live click resolves a reload, and a quality change
//       resolves (the controls are not stuck short of `playing`; not probed while a failed load shows its error).
//   Host: a hook step makes no main-thread UI call on mpv's queue (shim.mpv.offMainCalls).
//
// Not covered (see the design's "What this does not claim"): replay and VOD chat continuations (importArchive,
// fetchTwitchWindow, fetchReplay); adopted windows (waitForNativeStream); anything beyond K and the seeds.
//
// Run deeper with `npm run test:explore` (CLASS_L_K, CLASS_L_RANDOM, CLASS_L_SEED).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {join} = require('node:path');
const {createRequire} = require('node:module');
const Sources = require('../src/source.js');
const {createIina, createFakeTimers} = require('./support/iina-shim.js');

const playerPath = join(__dirname, '../src/player.js');
const requireFromPlayer = createRequire(playerPath);
// Compiled once; each world runs it in a fresh context shaped like shim.runScript's.
const playerScript = new vm.Script(fs.readFileSync(playerPath, 'utf8'), {filename: playerPath});

const K = Number(process.env.CLASS_L_K || 3);
const RANDOM_RUNS = Number(process.env.CLASS_L_RANDOM || 1000);
const SEED = Number(process.env.CLASS_L_SEED || 20261122);
const QUIESCENCE_HORIZON_MS = 40000; // Past the 25 s quality deadline and the 15 s Go Live timeout.
const SOURCE = Sources.parse('https://www.twitch.tv/fixture_class_l');
const FOREIGN = '/Users/fixture/movie.mkv';
const FORMATS = [
  {id: '720p60', label: '720p60'},
  {id: '480p30', label: '480p30'},
  {id: '360p30', label: '360p30'}
];
const CREDENTIAL = JSON.stringify({login: 'fixture_reader', token: 'fake_class_l_credential_token'});

const ALPHABET = [
  'load', 'reopen', 'foreign', 'close',
  'quality', 'settle-ok', 'settle-error',
  'go-live', 'settle-go-live',
  'file-loaded', 'end-file', 'turn',
  'auth-ready', 'chat-batch', 'pause', 'fullscreen'
];
// After a close IINA delivers no hook or window event; only late work can still run.
const AFTER_CLOSE = new Set(['settle-ok', 'settle-error', 'settle-go-live', 'turn']);

// Host calls that count as emissions (shim.log api names). Posts are read from shim.posts.
const EMITTING_CALLS = new Set([
  'mpv.set', 'mpv.command', 'file.write', 'file.delete', 'core.window.set', 'utils.open',
  'http.get', 'http.post', 'http.put', 'http.patch', 'http.delete',
  'sidebar.show', 'sidebar.hide', 'sidebar.loadFile',
  'overlay.show', 'overlay.hide', 'overlay.loadFile', 'overlay.setClickable', 'overlay.setOpacity'
]);
const POST_APIS = new Set(['sidebar.postMessage', 'overlay.postMessage', 'global.postMessage']);
// Teardown a loss may emit, once each per loss.
const TEARDOWN = new Set([
  'sidebar:state', 'overlay:state', 'global:auth-disconnect', 'global:player-closed', 'overlay:live-stop',
  'call:overlay.hide', 'call:overlay.setClickable',
  // QA traces of the teardown itself.
  'call:file.write:@data/qa-trace-chat-off', 'call:file.write:@data/qa-trace-window-closed'
]);

const settle = () => new Promise(resolve => setImmediate(resolve));
const decoded = post => JSON.parse(decodeURIComponent(post.data.encoded));

function result(quality) {
  const id = quality === 'auto720' ? '720p60' : quality;
  return {
    ok: true, title: 'Live ' + SOURCE.id, live: true, quality: id, formats: FORMATS,
    mediaURL: 'https://video-weaver.ttvnw.net/' + SOURCE.id + '-' + id + '.m3u8'
  };
}

// One managed window and its model.
function createWorld() {
  const timers = createFakeTimers();
  const tags = new Map(); // timer id -> attribution
  const rawSetTimeout = timers.setTimeout;
  const shim = createIina({
    label: Sources.label(SOURCE, 'unified'),
    mpv: {path: SOURCE.url, 'time-pos': 10, speed: 1, pause: false},
    timers
  });
  shim.http.setResponse({statusCode: 200, text: '#EXTM3U'});
  const model = {
    epoch: 1, // The current epoch, or null between a loss and the next own-source hook.
    last: 1, // The most recent epoch.
    closed: false,
    losses: new Map(), // ended epoch -> {kind, used: Map(teardown key -> count)}
    held: [], // services.resolve calls still waiting: {kind, attr, resolve, reject}
    hooks: [], // {path, continued}
    loadfiles: [], // loadfile paths not yet hooked
    hooked: null, // the path of the last own-source hook, and whether its load failed
    delivered: true, // whether file-loaded was delivered for `hooked`
    resolveKind: 'other',
    immediate: false,
    attr: {epoch: 1, loss: false}
  };
  const wrapSetTimeout = (fn, delay) => {
    const attr = model.attr;
    const id = rawSetTimeout(() => {
      const outer = model.attr;
      model.attr = attr;
      try {
        return fn();
      } finally {
        model.attr = outer;
      }
    }, delay);
    tags.set(id, attr);
    return id;
  };
  const services = {
    readSettings: () => ({chatEnabled: true}),
    saveSettings() {},
    // As in a QA build (main.js): every trace is a file write, so a trace after a loss is an emission.
    trace(phase) {
      shim.iina.file.write('@data/qa-trace-' + phase, '');
    },
    cancelHelpers() {},
    resolve(source, quality) {
      if (model.immediate) return Promise.resolve(result(quality));
      return new Promise((resolve, reject) => {
        model.held.push({kind: model.resolveKind, attr: model.attr, quality, resolve, reject});
      });
    }
  };
  shim.mpv.onCommand = (name, args) => {
    if (name === 'loadfile') model.loadfiles.push(args[0]);
  };
  const module = {exports: {}};
  const context = vm.createContext({
    iina: shim.iina, require: requireFromPlayer, module, Date: timers.Date, console: shim.iina.console,
    setTimeout: wrapSetTimeout, clearTimeout: timers.clearTimeout
  });
  playerScript.runInContext(context);
  const controller = module.exports.start(shim.iina, {variant: 'unified'}, services);
  return {shim, timers, tags, model, controller};
}

// ---- steps ----

function ownPath(world) {
  return world.model.loadfiles.length ? world.model.loadfiles[0] : SOURCE.url;
}

async function runHook(world, path, onRun) {
  const {shim, model} = world;
  shim.mpv.set('path', path);
  const record = {path, continued: 0};
  model.hooks.push(record);
  if (onRun) onRun();
  const offMain = shim.mpv.offMainCalls.length;
  // Not awaited: an async hook settles only when its held resolve does. A rejection still counts continuations.
  shim.mpv.runHook('on_load', () => record.continued++).catch(() => {});
  const made = shim.mpv.offMainCalls.length - offMain;
  await settle();
  return made;
}

function beginEpochIfNeeded(model) {
  if (model.epoch !== null || model.closed) return;
  model.last++;
  model.epoch = model.last;
}

function endEpoch(model, kind) {
  if (model.epoch === null) return null;
  const ended = model.epoch;
  model.losses.set(ended, {kind, used: new Map()});
  model.epoch = null;
  return ended;
}

const STEPS = {
  async load(world) {
    const {model} = world;
    const path = ownPath(world);
    if (model.loadfiles.length) model.loadfiles.shift();
    beginEpochIfNeeded(model);
    model.attr = {epoch: model.epoch, loss: false};
    model.resolveKind = 'load';
    const offMain = await runHook(world, path);
    model.hooked = {path, failed: false};
    model.delivered = false;
    return {offMain};
  },
  async reopen(world) {
    const {shim, model} = world;
    model.loadfiles.length = 0;
    beginEpochIfNeeded(model);
    model.attr = {epoch: model.epoch, loss: false};
    model.immediate = true;
    let offMain;
    try {
      offMain = await runHook(world, SOURCE.url);
      await settle();
    } finally {
      model.immediate = false;
    }
    model.hooked = {path: SOURCE.url, failed: false};
    shim.emit('iina.file-loaded', SOURCE.url);
    shim.emit('iina.window-size-adjusted');
    model.delivered = true;
    return {offMain};
  },
  async foreign(world) {
    const {model} = world;
    // A second foreign file before the first loss is cleaned up may carry out that teardown: it shares the
    // allowance, as a close does.
    const ended = endEpoch(model, 'foreign');
    model.attr = {epoch: ended === null ? model.last : ended, loss: model.losses.has(model.last)};
    const offMain = await runHook(world, FOREIGN);
    model.hooked = null;
    model.delivered = true;
    return {offMain};
  },
  async close(world) {
    const {shim, model} = world;
    // A close after a foreign file tears down the same loss: its teardown allowance is shared.
    const ended = endEpoch(model, 'close');
    model.closed = true;
    model.attr = {epoch: ended === null ? model.last : ended, loss: model.losses.has(model.last)};
    shim.emit('iina.window-will-close');
    return {};
  },
  async quality(world) {
    const {shim, controller, model} = world;
    const current = controller.snapshot().quality;
    model.resolveKind = 'quality';
    shim.sidebar.receive('change-quality', current === '480p30' ? '360p30' : '480p30');
    return {};
  },
  async 'settle-ok'(world) {
    return settleHeld(world, call => call.kind !== 'go-live', 'ok');
  },
  async 'settle-error'(world) {
    return settleHeld(world, call => call.kind !== 'go-live', 'error');
  },
  async 'go-live'(world) {
    world.model.resolveKind = 'go-live';
    world.shim.sidebar.receive('go-live', {});
    return {};
  },
  async 'settle-go-live'(world) {
    return settleHeld(world, call => call.kind === 'go-live', 'ok');
  },
  // mpv can deliver it at any time; it counts as the hooked file's load only once that hook has continued.
  async 'file-loaded'(world) {
    const {shim, model} = world;
    shim.emit('iina.file-loaded', shim.mpv.props.get('path'));
    const last = model.hooks.at(-1);
    if (last && last.continued > 0) model.delivered = true;
    return {};
  },
  async 'end-file'(world) {
    world.shim.emit('mpv.end-file');
    return {};
  },
  // Fires exactly one timer, the earliest, so its emissions are attributed to it alone. The others due by then
  // are held back for this turn (marked cancelled, then restored unless the turn cleared them).
  async turn(world) {
    const {timers, tags, model} = world;
    const next = timers.pending().sort((a, b) => a.due - b.due || a.id - b.id)[0];
    if (!next) return {};
    model.attr = Object.assign({}, tags.get(next.id) || model.attr, {via: 'a timer'});
    const held = timers.pending().filter(timer => timer !== next && timer.due <= next.due);
    for (const timer of held) timer.cancelled = true;
    const cleared = timers.cleared.length;
    try {
      timers.advance(Math.max(0, next.due - timers.now));
    } finally {
      const clearedNow = new Set(timers.cleared.slice(cleared));
      for (const timer of held) if (!clearedNow.has(timer.id)) timer.cancelled = false;
    }
    return {};
  },
  async 'auth-ready'(world) {
    world.shim.global.receive('auth-status', JSON.stringify({saved: true, login: 'fixture_reader'}));
    world.shim.global.receive('auth-ready', CREDENTIAL);
    return {};
  },
  async 'chat-batch'(world) {
    const {shim} = world;
    const configs = shim.overlay.messages('live-config');
    const session = configs.length ? decoded(configs.at(-1)).session : 0;
    shim.overlay.receive('live-state', {state: 'connected', session});
    const sentAt = shim.timers.now - 1000;
    shim.overlay.receive('live-messages', {
      session, removed: [],
      messages: [{id: 'm' + sentAt, author: 'viewer', text: 'hello', timestampMs: sentAt}]
    });
    return {};
  },
  async pause(world) {
    const {shim} = world;
    shim.mpv.set('pause', !shim.mpv.props.get('pause'));
    shim.emit('mpv.pause.changed');
    return {};
  },
  async fullscreen(world) {
    const {shim} = world;
    shim.core.native.fullscreen = !shim.core.native.fullscreen;
    shim.emit('iina.window-fs.changed');
    return {};
  }
};

function settleHeld(world, matches, how) {
  const {model} = world;
  const index = model.held.findIndex(matches);
  if (index < 0) return {};
  const [call] = model.held.splice(index, 1);
  model.attr = Object.assign({}, call.attr, {via: 'a late ' + call.kind + ' resolve ' + how});
  if (call.kind === 'load' && how === 'error' && model.hooked) model.hooked.failed = true;
  if (how === 'ok') call.resolve(result(call.quality));
  else call.reject(new Error('Synthetic resolve failure at https://video-weaver.ttvnw.net/x.m3u8'));
  return {};
}

function enabled(world, name) {
  const {model, timers} = world;
  if (model.closed && !AFTER_CLOSE.has(name)) return false;
  if (name === 'settle-ok' || name === 'settle-error') return model.held.some(call => call.kind !== 'go-live');
  if (name === 'settle-go-live') return model.held.some(call => call.kind === 'go-live');
  if (name === 'turn') return timers.pending().length > 0;
  return true;
}

// ---- checks ----

// Emissions since `mark`, in call order, as keys: 'sidebar:state', 'global:auth-probe',
// 'call:mpv.command:loadfile', ... A post is keyed by its surface and name.
function emissionsSince(world, mark) {
  const {shim} = world;
  const posts = shim.posts.slice(mark.posts);
  const out = [];
  for (const call of shim.log.slice(mark.log)) {
    if (POST_APIS.has(call.api)) {
      const post = posts.shift();
      if (!post) continue; // A post the host refused.
      const entry = {key: post.surface + ':' + post.name};
      if (post.surface === 'sidebar' && post.name === 'state') entry.phase = decoded(post).phase;
      out.push(entry);
      continue;
    }
    if (!EMITTING_CALLS.has(call.api)) continue;
    const named = ['mpv.command', 'mpv.set', 'file.write'].includes(call.api);
    const detail = named ? ':' + call.args[0] : '';
    const base = 'call:' + call.api;
    out.push({key: base + detail, base});
  }
  return out;
}

function mark(world) {
  return {posts: world.shim.posts.length, log: world.shim.log.length};
}

// L5 for one step's emissions, attributed to `attr`.
function checkEmissions(world, attr, emissions) {
  const {model} = world;
  if (attr.epoch === model.epoch && !model.closed) return null;
  const loss = model.losses.get(attr.epoch);
  const newer = model.epoch !== null && model.epoch > attr.epoch;
  for (const emission of emissions) {
    const key = TEARDOWN.has(emission.key) ? emission.key : emission.base || emission.key;
    const teardown = loss && attr.loss && TEARDOWN.has(key) && !(newer && key.startsWith('global:'));
    if (!teardown) {
      const via = attr.via ? ' from ' + attr.via : '';
      const when = newer ? ', newer epoch current' : '';
      return {invariant: 'L5', detail: 'ended epoch emits ' + emission.key + via + when};
    }
    const count = (loss.used.get(key) || 0) + 1;
    loss.used.set(key, count);
    if (count > 1) return {invariant: 'L5', detail: 'ended epoch emits a second ' + key};
    if (key === 'sidebar:state' && loss.kind === 'foreign' && emission.phase !== 'inactive') {
      return {invariant: 'L5', detail: 'final snapshot phase ' + emission.phase + ', not inactive'};
    }
  }
  return null;
}

function checkHooks(world, final) {
  for (const hook of world.model.hooks) {
    if (hook.continued > 1) return {invariant: 'L4', detail: 'a hook continued ' + hook.continued + ' times'};
    if (final && hook.continued !== 1) return {invariant: 'L4', detail: 'a hook never continued'};
  }
  return null;
}

async function step(world, name) {
  const before = mark(world);
  const {model} = world;
  model.attr = {epoch: model.epoch === null ? model.last : model.epoch, loss: false};
  model.resolveKind = 'other';
  const outcome = await STEPS[name](world);
  const attr = model.attr;
  await settle();
  model.attr = {epoch: model.epoch === null ? model.last : model.epoch, loss: false};
  model.resolveKind = 'other';
  if (outcome.offMain) return {invariant: 'host', detail: name + ' made a main-thread call on the hook'};
  return checkEmissions(world, attr, emissionsSince(world, before)) || checkHooks(world, false);
}

// Settles held resolves, delivers pending mpv loads, and runs every timer due within the horizon.
async function quiesce(world) {
  const {model, timers} = world;
  const horizon = timers.now + QUIESCENCE_HORIZON_MS;
  for (let round = 0; round < 400; round++) {
    let name = null;
    if (model.held.some(call => call.kind !== 'go-live')) name = 'settle-ok';
    else if (model.held.length) name = 'settle-go-live';
    else if (!model.closed && model.epoch !== null && model.loadfiles.length) name = 'load';
    else if (!model.closed && model.epoch !== null && model.hooked && !model.delivered &&
      model.hooks.at(-1).continued > 0) {
      name = model.hooked.failed ? 'end-file' : 'file-loaded';
      model.delivered = true;
      if (name === 'file-loaded') world.shim.mpv.set('path', model.hooked.path);
    }
    if (name) {
      const violation = await step(world, name);
      if (violation) return violation;
      if (name === 'file-loaded') world.shim.emit('iina.window-size-adjusted');
      continue;
    }
    const next = timers.pending().sort((a, b) => a.due - b.due || a.id - b.id)[0];
    if (!next || next.due > horizon) break;
    const violation = await step(world, 'turn');
    if (violation) return violation;
  }
  return checkHooks(world, true) || await checkNotBusy(world);
}

// L6, for the current epoch only.
async function checkNotBusy(world) {
  const {model, shim, controller} = world;
  if (model.closed || model.epoch === null) return null;
  const snapshot = controller.snapshot();
  if (snapshot.busy) return {invariant: 'L6', detail: 'busy at quiescence (' + snapshot.phase + ')'};
  const probes = [];
  const before = model.held.length;
  model.resolveKind = 'probe';
  shim.sidebar.receive('go-live', {});
  await settle();
  if (model.held.length === before) probes.push('Go Live does not resolve a reload');
  // Rejected, so Go Live is not busy for the quality probe that follows.
  for (const call of model.held.splice(before)) call.reject(new Error('Synthetic probe failure'));
  await settle();
  // Scope: the quality probe looks for controls stuck by abandoned work. A load whose resolve failed shows its
  // error and stays short of playing until the source is opened again (as a failed first load does at 04fe12f);
  // that is not abandoned work, so it is not probed.
  if (snapshot.error) return probes.length ? {invariant: 'L6', detail: probes.join('; ')} : null;
  // A quality the controls list (an activation whose load failed lists none, so it asks for Auto).
  const current = controller.snapshot();
  const other = current.formats.map(format => format.id).find(id => id !== current.quality);
  shim.sidebar.receive('change-quality', other || 'auto720');
  await settle();
  if (model.held.length === before) probes.push('a quality change does not resolve (' + snapshot.phase + ')');
  model.held.length = before;
  model.resolveKind = 'other';
  return probes.length ? {invariant: 'L6', detail: probes.join('; ')} : null;
}

// The window as the sequences start: loaded, playing, the sidebar ready, live chat connected.
async function setUp(world) {
  const {shim, model} = world;
  shim.timers.advance(0); // The startup bind turn.
  await settle();
  model.immediate = true;
  try {
    await runHook(world, SOURCE.url);
    await settle();
  } finally {
    model.immediate = false;
  }
  model.hooked = {path: SOURCE.url, failed: false};
  shim.emit('iina.file-loaded', SOURCE.url);
  shim.emit('iina.window-size-adjusted');
  shim.timers.advance(3000); // The post-load restore confirms the load.
  shim.sidebar.send('ready', {});
  shim.global.receive('auth-status', JSON.stringify({saved: true, login: 'fixture_reader'}));
  shim.timers.advance(0);
  await settle();
  shim.global.receive('auth-ready', CREDENTIAL);
  shim.emit('iina.plugin-overlay-loaded');
  shim.overlay.receive('overlay-ready', {});
  await settle();
  const snapshot = world.controller.snapshot();
  assert.equal(snapshot.phase, 'playing', 'set-up: playing');
  assert.equal(snapshot.chat.mode, 'live', 'set-up: live chat on');
  assert.equal(shim.overlay.messages('live-config').length, 1, 'set-up: the live transport started');
}

// Runs one sequence; returns null or {at, invariant, detail}.
async function runSequence(sequence) {
  const world = createWorld();
  await setUp(world);
  for (let i = 0; i < sequence.length; i++) {
    if (!enabled(world, sequence[i])) return {skipped: true};
    const violation = await step(world, sequence[i]);
    if (violation) return Object.assign({at: i + 1}, violation);
  }
  const violation = await quiesce(world);
  return violation ? Object.assign({at: 'quiescence'}, violation) : null;
}

function signature(violation) {
  return violation.invariant + ': ' + violation.detail;
}

// Breadth first, so the first sequence found for a signature is a shortest one. A sequence that violates at a
// step is not extended. Returns {runs, found: Map(signature -> {sequence, violation})}.
async function explore(depth) {
  const found = new Map();
  let frontier = [[]];
  let runs = 0;
  for (let length = 1; length <= depth; length++) {
    const next = [];
    for (const prefix of frontier) {
      for (const name of ALPHABET) {
        const sequence = prefix.concat(name);
        const outcome = await runSequence(sequence);
        if (outcome && outcome.skipped) continue;
        runs++;
        if (outcome && !found.has(signature(outcome))) found.set(signature(outcome), {sequence, violation: outcome});
        // A step violation ends the sequence; one found only at quiescence leaves its steps worth extending.
        if (!outcome || outcome.at === 'quiescence') next.push(sequence);
      }
    }
    frontier = next;
  }
  return {runs, found};
}

// mulberry32: a small seeded generator, so a failing random sequence can be replayed from its seed.
function generator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Each step is drawn from the steps enabled at that point, so no random sequence is skipped.
async function randomRun(random) {
  const length = 8 + Math.floor(random() * 5);
  const world = createWorld();
  await setUp(world);
  const sequence = [];
  while (sequence.length < length) {
    const choices = ALPHABET.filter(name => enabled(world, name));
    if (!choices.length) break; // Closed, with no late work left.
    const name = choices[Math.floor(random() * choices.length)];
    sequence.push(name);
    const violation = await step(world, name);
    if (violation) return {sequence, violation: Object.assign({at: sequence.length}, violation)};
  }
  const violation = await quiesce(world);
  return {sequence, violation: violation ? Object.assign({at: 'quiescence'}, violation) : null};
}

async function randomRuns(count, seed) {
  const random = generator(seed);
  const found = new Map();
  for (let run = 0; run < count; run++) {
    const {sequence, violation} = await randomRun(random);
    if (violation && !found.has(signature(violation))) found.set(signature(violation), {sequence, violation, run});
  }
  return found;
}

function describe(found) {
  return [...found].map(([sig, entry]) =>
    sig + '\n    at step ' + entry.violation.at + ' of [' + entry.sequence.join(', ') + ']').join('\n');
}

test('class L explorer: exhaustive to K, no L4-L6 violation', {timeout: 600000}, async () => {
  const started = Date.now();
  const {runs, found} = await explore(K);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`class-l explorer: K=${K}, ${runs} sequences, ${seconds} s, ${found.size} signatures`);
  assert.equal(found.size, 0, 'violations (shortest sequence per signature):\n' + describe(found));
});

test('class L explorer: seeded random sequences of length 8-12, no L4-L6 violation', {timeout: 600000},
  async () => {
    const started = Date.now();
    const found = await randomRuns(RANDOM_RUNS, SEED);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`class-l explorer: ${RANDOM_RUNS} random sequences from seed ${SEED}, ${seconds} s`);
    assert.equal(found.size, 0, 'violations (first sequence per signature):\n' + describe(found));
  });

module.exports = {runSequence, explore, ALPHABET};
