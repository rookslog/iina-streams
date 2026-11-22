'use strict';

// v0.5.5 release review r1 #6 and #8 (docs/reviews/2026-11-22-v0.5.5-release-review.md).
// IINA reuses idle player cores (PlayerCore.swift L48-81, v1.5.1), and keeps every on_load hook a plugin
// instance registers. So one native core's single hook must adopt each new stream, pass a local file
// through, and adopt again after its window closes. Controller work runs on a main-thread turn, never on
// mpv's hook queue (MPVController.swift L1241-1247, as cited by the review).
//
// The player runs in a vm context on the shim's fake timers, so every main-thread turn is explicit.

const test = require('node:test');
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {createRequire} = require('node:module');
const {createIina} = require('./support/iina-shim.js');

const playerPath = join(__dirname, '../src/player.js');
const requireFromPlayer = createRequire(playerPath);
const STABLE = 'local.iina.streams';
const vodA = 'https://www.twitch.tv/videos/100000001';
const vodB = 'https://www.twitch.tv/videos/100000002';
const localFile = '/Users/fixture/movie.mkv';
const media = url => 'https://media.invalid/' + url.split('/').pop() + '.m3u8';

const settle = () => new Promise(resolve => setImmediate(resolve));

function resolvedFor(source) {
  return {
    ok: true, title: 'VOD ' + source.id, live: false, quality: '720p60', duration: 600,
    formats: [{id: '720p60', label: '720p60'}, {id: '360p30', label: '360p30'}],
    mediaURL: media(source.url)
  };
}

// One native core with the player entry loaded. `resolve` defaults to an immediate success.
function nativeCore(options = {}) {
  const shim = createIina({label: '', identifier: STABLE, timers: options.timers});
  const module = {exports: {}};
  shim.runScript(playerPath, {globals: {module, Date: shim.timers.Date}, require: requireFromPlayer});
  const resolves = [];
  const services = Object.assign({
    readSettings: () => ({chatEnabled: false}),
    async resolve(source) {
      resolves.push(source.url);
      return options.resolve ? options.resolve(source, resolves.length) : resolvedFor(source);
    }
  }, options.services);
  const controller = module.exports.start(shim.iina, {identifier: STABLE, variant: 'unified'}, services);
  assert.equal(controller, null, 'precondition: an unlabeled window gets no controller at start');

  // Runs IINA's on_load hook for `path`, then gives main-thread turns until the hook settles.
  async function load(path, turns = 20) {
    shim.mpv.set('path', path);
    shim.mpv.set('stream-open-filename', path);
    const state = {continued: 0, done: false};
    const hook = shim.mpv.runHook('on_load', () => state.continued++);
    hook.then(() => { state.done = true; }, () => { state.done = true; });
    for (let i = 0; i < turns && !state.done; i++) {
      shim.timers.advance(0);
      await settle();
    }
    return state;
  }

  const listenerCount = name => shim.event.listeners.get(name)?.size || 0;
  return {shim, resolves, load, listenerCount};
}

test('r1 #6: stream A, stream B, a local file, then stream A on one core resolves each stream', async () => {
  const core = nativeCore();
  const {shim} = core;

  const first = await core.load(vodA);
  assert.equal(first.continued, 1);
  assert.deepEqual(core.resolves, [vodA]);
  assert.equal(shim.mpv.props.get('stream-open-filename'), media(vodA));
  assert.equal(shim.menu.items.length, 3, 'one controller: Show Streams, Go Live, Chat');
  shim.emit('iina.file-loaded', vodA);

  const second = await core.load(vodB);
  assert.equal(second.continued, 1);
  assert.deepEqual(core.resolves, [vodA, vodB], 'the new URL is adopted and resolved');
  assert.equal(shim.mpv.props.get('stream-open-filename'), media(vodB));
  assert.equal(shim.menu.items.length, 3, 'the old controller\'s menu items are removed');
  assert.equal(core.listenerCount('iina.file-loaded'), 1, 'the old controller\'s listeners are removed');

  shim.sidebar.send('ready', {});
  const file = await core.load(localFile);
  assert.equal(file.continued, 1);
  const last = JSON.parse(decodeURIComponent(shim.sidebar.messages('state').at(-1).data.encoded));
  assert.equal(last.phase, 'inactive', 'the sidebar shows that Streams is inactive for the file');
  assert.deepEqual(core.resolves, [vodA, vodB], 'a local file is not resolved');
  assert.equal(shim.mpv.props.get('stream-open-filename'), localFile, 'IINA\'s own loader plays the file');
  assert.equal(shim.menu.items.length, 0, 'no Streams controls for a local file');
  assert.deepEqual(shim.event.names(), [], 'no Streams listeners remain for a local file');

  const again = await core.load(vodA);
  assert.equal(again.continued, 1);
  assert.deepEqual(core.resolves, [vodA, vodB, vodA], 'stream A is adopted again after the file');
  assert.equal(shim.mpv.props.get('stream-open-filename'), media(vodA));
  assert.equal(shim.menu.items.length, 3);
  shim.emit('iina.window-will-close');
});

test('r1 #6: closing the window and reopening a stream on the reused core adopts again', async () => {
  const core = nativeCore();
  const {shim} = core;
  await core.load(vodA);
  shim.emit('iina.file-loaded', vodA);
  shim.emit('iina.window-will-close');
  assert.equal(shim.global.messages('player-closed').length, 1, 'a real close tells global');
  assert.equal(core.listenerCount('iina.file-loaded'), 0, 'precondition: the closed controller is gone');

  const reopened = await core.load(vodA);
  assert.equal(reopened.continued, 1);
  assert.deepEqual(core.resolves, [vodA, vodA], 'the reopened stream is resolved, not passed through');
  assert.equal(shim.mpv.props.get('stream-open-filename'), media(vodA));
  assert.equal(shim.menu.items.length, 3, 'the reopened window has one set of controls');
  assert.equal(core.listenerCount('iina.file-loaded'), 1);
  shim.emit('iina.window-will-close');
});

test('r1 #6: a watchdog timeout, then a successful adoption on the next load', async () => {
  let settleFirst = null;
  const core = nativeCore({
    resolve(source, call) {
      if (call === 1) return new Promise(done => { settleFirst = () => done(resolvedFor(source)); });
      return resolvedFor(source);
    }
  });
  const {shim} = core;
  const held = await core.load(vodA);
  assert.deepEqual(core.resolves, [vodA]);
  assert.equal(held.continued, 0, 'held while the first resolve is pending');
  shim.timers.advance(9999);
  await settle();
  assert.equal(held.continued, 0);
  shim.timers.advance(1);
  await settle();
  assert.equal(held.continued, 1, 'the watchdog continues the load at 10 s');
  assert.equal(shim.mpv.props.get('stream-open-filename'), vodA, 'IINA\'s own loader gets the URL');

  const next = await core.load(vodB);
  assert.equal(next.continued, 1);
  assert.deepEqual(core.resolves, [vodA, vodB], 'the next stream is adopted');
  assert.equal(shim.mpv.props.get('stream-open-filename'), media(vodB));

  settleFirst();
  await settle();
  assert.equal(shim.mpv.props.get('stream-open-filename'), media(vodB), 'the late first resolve is dropped');
  assert.equal(held.continued, 1, 'the timed-out load is never continued twice');
  shim.emit('iina.window-will-close');
});

test('r1 #8: switching from an adopted VOD with replay to a local file does no event.off or chatOff on the hook stack',
  async () => {
    const files = new Map();
    const services = {
      readSettings: () => ({chatEnabled: true}),
      dataPath: name => '/data/' + name,
      readFile: path => files.get(path),
      deleteDataPath: () => true,
      cancelHelpers: () => 0,
      async runHelper(name, args) {
        const output = args[args.indexOf('--output') + 1];
        if (name === 'acquire') {
          const at = Number(args[args.indexOf('--at') + 1]);
          return {ok: true, path: output + '/replay.jsonl', window: {requested: at, start: 0, end: 90, hasMore: true}};
        }
        const index = {version: 1, sourceId: '100000001', count: 1, title: 'Twitch window',
          timeline: {availableStart: 0, availableEnd: 0}, chunks: [{file: 'chunk-000000.json', start: 0, end: 0, count: 1}]};
        files.set(output + '/index.json', JSON.stringify(index));
        files.set(output + '/chunk-000000.json', JSON.stringify([{id: 'm0', time: 0, author: 'A', text: 'hi', color: '#AABBCC', badges: [], kind: 'message'}]));
        return {ok: true, indexPath: output + '/index.json'};
      }
    };
    const core = nativeCore({services});
    const {shim} = core;
    await core.load(vodA);
    shim.emit('iina.file-loaded', vodA);
    for (let i = 0; i < 6; i++) await settle();
    assert.equal(core.listenerCount('mpv.time-pos.changed'), 1, 'precondition: replay chat observes time-pos');

    shim.mpv.set('path', localFile);
    shim.mpv.set('stream-open-filename', localFile);
    const mark = shim.log.length;
    let continued = 0;
    shim.mpv.runHook('on_load', () => continued++);
    for (let i = 0; i < 4; i++) await settle(); // microtasks only: still the hook queue in IINA
    const offMain = shim.log.slice(mark).map(entry => entry.api + ':' + entry.args[0]);
    assert.deepEqual(offMain.filter(call => call.startsWith('event.off')), [], 'no event.off before a main-thread turn');
    assert.equal(offMain.includes('global.postMessage:auth-disconnect'), false, 'no chatOff before a main-thread turn');
    assert.equal(continued, 0, 'the load is held for that turn');

    shim.timers.advance(0);
    await settle();
    const onMain = shim.log.slice(mark).map(entry => entry.api + ':' + entry.args[0]);
    assert.ok(onMain.includes('event.off:mpv.time-pos.changed'), 'the replay observer is removed on the main thread');
    assert.ok(onMain.includes('global.postMessage:auth-disconnect'), 'chat is turned off on the main thread');
    assert.equal(continued, 1);
    assert.equal(shim.mpv.props.get('stream-open-filename'), localFile);
  });

// IINA 1.5.1 timers, as review r1 #8 reads JavascriptPolyfill.swift L32-49 (not re-read here) and as
// src/timers.js records: setTimeout returns its id at once and registers the native timer on a later
// main-thread turn; a clearTimeout that runs before that registration finds nothing to remove; and a fired
// one-shot timer stays registered until it is cleared.
function lateRegistrationTimers() {
  let clock = 0, nextID = 0;
  const unregistered = [], registry = new Map();
  const api = {
    get now() { return clock; },
    setTimeout(fn, delay = 0) {
      const entry = {id: ++nextID, fn, due: clock + (Number(delay) || 0), fired: false};
      unregistered.push(entry);
      return entry.id;
    },
    clearTimeout(id) { registry.delete(id); },
    register() { for (const entry of unregistered.splice(0)) registry.set(entry.id, entry); },
    advance(ms) {
      const target = clock + ms;
      for (;;) {
        api.register();
        const due = [...registry.values()].filter(e => !e.fired && e.due <= target)
          .sort((a, b) => a.due - b.due || a.id - b.id)[0];
        if (!due) break;
        clock = Math.max(clock, due.due);
        due.fired = true;
        due.fn();
      }
      clock = target;
    },
    retained: () => [...registry.values()].filter(entry => entry.fired),
    Date: class LateDate extends Date { static now() { return clock; } }
  };
  return api;
}

test('r1 #8: a fast staged reload with late native timer registration leaves no retained watchdog', async () => {
  const timers = lateRegistrationTimers();
  const core = nativeCore({
    timers,
    resolve: (source, call) => Object.assign(resolvedFor(source), call > 1 ? {quality: '360p30', mediaURL: media(source.url) + '?q=360'} : {})
  });
  const {shim} = core;
  await core.load(vodA);
  shim.emit('iina.file-loaded', vodA);
  shim.emit('iina.window-size-adjusted');
  timers.advance(3000);
  await settle();
  shim.sidebar.send('ready', {});
  shim.sidebar.send('change-quality', '360p30');
  for (let i = 0; i < 4; i++) await settle();
  const loadfile = shim.mpv.commands.filter(([name]) => name === 'loadfile');
  assert.equal(loadfile.length, 1, 'precondition: the quality change stages one reload');
  const staged = loadfile[0][1][0];
  assert.match(staged, /#streams-generation=1$/);
  assert.equal(timers.retained().length, 0, 'precondition: nothing is retained before the reload');

  shim.mpv.set('path', staged);
  let continued = 0;
  shim.mpv.runHook('on_load', () => continued++);
  for (let i = 0; i < 4; i++) await settle(); // no main-thread turn yet: no native timer is registered
  timers.advance(0);
  for (let i = 0; i < 4; i++) await settle();
  assert.equal(continued, 1, 'the staged load continues once');
  assert.deepEqual(core.resolves, [vodA, vodA], 'the staged load is the controller\'s own: no new adoption');
  assert.equal(shim.mpv.props.get('stream-open-filename'), media(vodA) + '?q=360');
  timers.advance(20000);
  await settle();
  assert.deepEqual(timers.retained().map(entry => entry.id), [], 'no fired timer stays registered');
  shim.emit('iina.window-will-close');
});
