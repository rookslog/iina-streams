'use strict';
// Independent source-level regressions. Synthetic data; no IINA or network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const Sources = require('../src/source.js');
const playerPath = path.join(__dirname, '../src/player.js');
const plain = value => JSON.parse(JSON.stringify(value));

function fixture({retainFiredTimers = false} = {}) {
  let clock = 0, timerID = 0, listenerID = 0;
  const timers = new Map(), events = new Map(), messages = new Map();
  const hooks = new Map(), calls = [], helperCalls = [], deletes = [];
  const source = Sources.parse('https://www.twitch.tv/videos/123456');
  const native = {path: source.url, position: 83.25, paused: true, speed: 1.5,
    frame: {x: 11, y: 22, width: 1000, height: 620}, fullscreen: false, visibleSidebar: null};
  const formats = [{id: '720p60', label: '720p60'}, {id: '360p30', label: '360p'}];
  const result = quality => ({ok: true, quality: quality === 'auto720' ? '720p60' : quality,
    title: 'Synthetic recording', live: false, duration: 100, formats,
    mediaURL: 'https://vod-secure.twitch.tv/synthetic-transport'});
  let resolve = async (_source, quality) => result(quality);
  const script = {exports: {}};
  const context = vm.createContext({module: script, require: createRequire(playerPath),
    Date: class extends Date { static now() { return clock; } },
    setTimeout(fn, delay) { const id = ++timerID; timers.set(id, {fn, due: clock + delay}); return id; },
    clearTimeout(id) { timers.delete(id); }});
  vm.runInContext(fs.readFileSync(playerPath, 'utf8'), context, {filename: playerPath});
  function emit(name, data) {
    for (const fn of [...(events.get(name)?.values() || [])]) fn(data);
  }
  function advance(ms) {
    const target = clock + ms;
    for (;;) {
      const next = [...timers].filter(([, value]) => !value.fired && value.due <= target).sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      if (retainFiredTimers) next[1].fired = true; else timers.delete(next[0]);
      clock = next[1].due; next[1].fn();
    }
    clock = target;
  }
  const window = new Proxy({loaded: true}, {
    get(target, key) { return key in native ? native[key] : target[key]; },
    // IINA's native window proxy applies setters but does not return true.
    set(_target, key, value) { native[key] = plain(value); calls.push(['window', key, plain(value)]); return false; }
  });
  const host = {
    global: {getLabel: () => Sources.label(source, 'unified'), onMessage() {}, postMessage() {}},
    mpv: {
      addHook(name, _priority, fn) { hooks.set(name, fn); },
      getString(name) { return name === 'path' || name === 'stream-open-filename' ? native.path : ''; },
      getNumber(name) { return name === 'time-pos' ? native.position : name === 'speed' ? native.speed : 0; },
      getFlag(name) { return name === 'pause' ? native.paused : false; },
      set(name, value) { calls.push(['set', name, value]); if (name === 'pause') native.paused = value; if (name === 'speed') native.speed = value; },
      command(name, args) { calls.push(['command', name, plain(args)]); if (name === 'loadfile') native.path = args[0]; }
    },
    core: {window},
    sidebar: {loadFile() {}, onMessage(name, fn) { messages.set(name, fn); }, postMessage() {}, show() { native.visibleSidebar = 'streams'; calls.push(['sidebar', 'show']); }, hide() { native.visibleSidebar = null; }},
    overlay: {loadFile() {}, onMessage() {}, postMessage() {}, show() {}, hide() {}, setClickable() {}, setOpacity() {}},
    event: {
      on(name, fn) { if (!events.has(name)) events.set(name, new Map()); const id = ++listenerID; events.get(name).set(id, fn); return id; },
      off(name, id) { events.get(name)?.delete(id); }
    },
    menu: {item: (name, fn) => ({name, fn}), addItem() {}},
    utils: {ask: () => true, chooseFile: async () => null}
  };
  const index = {version: 1, sourceId: source.id, title: 'Synthetic archive', count: 1,
    timeline: {availableStart: 40}, chunks: [{file: 'chunk-000000.json', start: 40, end: 40, count: 1}]};
  const services = {
    resolve: (...args) => resolve(...args), readSettings: () => ({}), saveSettings() {}, cancelHelpers() {},
    dataPath: name => '/private/candidate/' + name,
    runHelper: async (name, args) => { helperCalls.push({name, args}); return {ok: true, indexPath: args[4] + '/index.json'}; },
    readFile: file => JSON.stringify(file.endsWith('/index.json') ? index : [{id: 'synthetic-1', time: 40,
      author: 'Synthetic', text: 'Synthetic fixture message', color: '', badges: [], kind: 'message'}]),
    deleteDataPath: file => { deletes.push(file); return true; }
  };
  const controller = script.exports.start(host, {variant: 'unified'}, services);
  async function load() { let next = 0; await hooks.get('on_load')(() => next++); assert.equal(next, 1); }
  async function initial() { await load(); emit('iina.file-loaded', source.url); emit('iina.window-size-adjusted'); advance(600); calls.length = 0; }
  return {controller, source, native, calls, messages, emit, advance, load, initial, result,
    setResolver(fn) { resolve = fn; }, helperCalls, deletes, retainedTimers: timers};
}

test('native retained timer entries are removed after initial and quality restoration', async () => {
  const r = fixture({retainFiredTimers: true}); await r.initial();
  assert.equal(r.retainedTimers.size, 0, 'initial restoration must clear its fired native ID');
  await r.controller.changeQuality('360p30'); await r.load();
  r.emit('iina.file-loaded', r.native.path); r.emit('iina.window-size-adjusted');
  r.advance(600);
  assert.equal(r.retainedTimers.size, 0, 'restoration and quality deadline must both be released');
  r.emit('iina.window-will-close');
});

test('replay throttling does not accumulate fired native timer entries', async () => {
  const r = fixture({retainFiredTimers: true}); await r.initial();
  await r.controller.importArchive('/synthetic.json');
  for (let i = 0; i < 25; i++) {
    r.advance(50); r.emit('mpv.time-pos.changed');
    assert.equal(r.retainedTimers.size, 1, 'only the next throttle timer may remain');
    r.advance(150);
    assert.equal(r.retainedTimers.size, 0, 'each fired timer must release its native entry');
  }
  r.emit('iina.window-will-close');
});

test('closing a player releases pending replay, restoration and quality timeout entries', async () => {
  const r = fixture({retainFiredTimers: true}); await r.initial();
  await r.controller.importArchive('/synthetic.json');
  r.advance(50); r.emit('mpv.time-pos.changed');
  await r.controller.changeQuality('360p30'); await r.load();
  r.emit('iina.file-loaded', r.native.path); r.emit('iina.window-size-adjusted');
  assert.ok(r.retainedTimers.size >= 2);
  r.emit('iina.window-will-close');
  assert.equal(r.retainedTimers.size, 0);
});

test('quality remains busy and uncommitted until the native restoration callback runs', async () => {
  const r = fixture(); await r.initial();
  await r.controller.changeQuality('360p30'); await r.load();
  r.emit('iina.file-loaded', r.native.path); r.emit('iina.window-size-adjusted');
  assert.equal(r.controller.snapshot().quality, '720p60'); assert.equal(r.controller.snapshot().busy, true);
  r.advance(599); assert.equal(r.controller.snapshot().quality, '720p60');
  r.advance(1); assert.equal(r.controller.snapshot().quality, '360p30'); assert.equal(r.controller.snapshot().busy, false);
  assert.ok(r.calls.some(call => call[0] === 'window' && call[1] === 'frame'));
  r.emit('iina.window-will-close');
});

for (const nativeChoice of [null, 'video-settings']) {
  test('quality replacement preserves native sidebar choice ' + String(nativeChoice), async () => {
    const r = fixture(); await r.initial();
    assert.equal(r.native.visibleSidebar, 'streams', 'initial source still opens its controls');
    // Simulate IINA's own collapse/tab control, which sends no Streams Hide message.
    r.native.visibleSidebar = nativeChoice;
    await r.controller.changeQuality('360p30'); await r.load();
    r.emit('iina.file-loaded', r.native.path); r.emit('iina.window-size-adjusted'); r.advance(600);
    assert.equal(r.controller.snapshot().quality, '360p30');
    assert.equal(r.native.visibleSidebar, nativeChoice, 'a reload must not reopen or replace the user-selected native sidebar');
    assert.equal(r.calls.filter(call => call[0] === 'sidebar' && call[1] === 'show').length, 0);

    r.controller.showSidebar();
    assert.equal(r.native.visibleSidebar, 'streams', 'explicit Show must still reopen controls after a native collapse');
    r.calls.length = 0;
    await r.controller.changeQuality('720p60'); await r.load();
    r.emit('iina.file-loaded', r.native.path); r.emit('iina.window-size-adjusted'); r.advance(600);
    assert.equal(r.native.visibleSidebar, 'streams');
    assert.equal(r.calls.filter(call => call[0] === 'sidebar' && call[1] === 'show').length, 0, 'visible controls need no redundant native show');
    r.emit('iina.window-will-close');
  });
}

test('two native size events keep restoration pending until the last event has been quiet', async () => {
  const r = fixture(); await r.initial();
  await r.controller.changeQuality('360p30'); await r.load();
  r.emit('iina.file-loaded', r.native.path);
  r.native.frame = {x: 11, y: 22, width: 640, height: 360}; r.emit('iina.window-size-adjusted');
  r.advance(555); assert.equal(r.controller.snapshot().busy, true);
  r.native.frame = {x: 11, y: 22, width: 720, height: 405}; r.emit('iina.window-size-adjusted');
  r.advance(599); assert.equal(r.controller.snapshot().quality, '720p60');
  r.advance(1); assert.equal(r.controller.snapshot().quality, '360p30');
  assert.deepEqual(r.native.frame, {x: 11, y: 22, width: 1000, height: 620});
  assert.equal(r.calls.filter(call => call[0] === 'window' && call[1] === 'frame').length, 1);
  r.emit('iina.window-will-close');
});

test('continued native sizing is capped from file-loaded and never enforces the frame perpetually', async () => {
  const r = fixture(); await r.initial();
  await r.controller.changeQuality('360p30'); await r.load();
  r.emit('iina.file-loaded', r.native.path); r.emit('iina.window-size-adjusted');
  for (let i = 0; i < 4; i++) { r.advance(500); r.emit('iina.window-size-adjusted'); }
  // Repeated load notifications may not reset the absolute deadline.
  r.emit('iina.file-loaded', r.native.path);
  r.advance(400); r.emit('iina.window-size-adjusted');
  r.advance(99); assert.equal(r.controller.snapshot().busy, true);
  r.advance(1); assert.equal(r.controller.snapshot().busy, false); assert.equal(r.controller.snapshot().quality, '360p30');
  const framesBefore = r.calls.filter(call => call[0] === 'window' && call[1] === 'frame').length;
  assert.equal(framesBefore, 1);
  r.native.frame = {x: 30, y: 40, width: 900, height: 550}; r.emit('iina.window-size-adjusted'); r.advance(3000);
  assert.equal(r.calls.filter(call => call[0] === 'window' && call[1] === 'frame').length, framesBefore);
  assert.deepEqual(r.native.frame, {x: 30, y: 40, width: 900, height: 550});
  r.emit('iina.window-will-close');
});

test('a load with no native size event uses the bounded fallback before committing', async () => {
  const r = fixture(); await r.initial();
  await r.controller.changeQuality('360p30'); await r.load();
  r.emit('iina.file-loaded', r.native.path);
  r.advance(1599); assert.equal(r.controller.snapshot().quality, '720p60'); assert.equal(r.controller.snapshot().busy, true);
  r.advance(1); assert.equal(r.controller.snapshot().quality, '360p30'); assert.equal(r.controller.snapshot().busy, false);
  r.emit('iina.window-will-close');
});

test('close during native stabilization cancels restoration and cannot commit or seek later', async () => {
  const r = fixture(); await r.initial();
  await r.controller.changeQuality('360p30'); await r.load();
  r.emit('iina.file-loaded', r.native.path); r.emit('iina.window-size-adjusted');
  r.emit('iina.window-will-close'); r.calls.length = 0; r.advance(30000);
  assert.equal(r.controller.snapshot().phase, 'closed'); assert.equal(r.controller.snapshot().quality, '720p60');
  assert.deepEqual(r.calls, []);
});

test('source deactivation fences a queued native restoration callback', async () => {
  const r = fixture(); await r.initial();
  await r.controller.changeQuality('360p30'); await r.load();
  r.emit('iina.file-loaded', r.native.path); r.emit('iina.window-size-adjusted');
  r.native.path = '/Users/example/unrelated.mp4'; await r.load(); r.calls.length = 0; r.advance(30000);
  assert.equal(r.controller.snapshot().phase, 'inactive'); assert.deepEqual(r.calls, []);
  r.emit('iina.window-will-close');
});

test('repeated Refresh requests do not create concurrent provider resolutions', async () => {
  const r = fixture(); await r.initial(); const pending = [];
  r.setResolver(() => new Promise(resolve => pending.push(resolve)));
  const requests = [r.messages.get('refresh')(), r.messages.get('refresh')(), r.messages.get('refresh')()];
  const count = pending.length; for (const resolve of pending) resolve(r.result('720p60'));
  await Promise.all(requests); r.emit('iina.window-will-close');
  assert.equal(count, 1, 'Refresh must not multiply expensive media helper work while a refresh is outstanding');
});

test('Refresh is available again after a failed provider request and after a success', async () => {
  const r = fixture(); await r.initial(); let resolutions = 0;
  r.setResolver(async () => { resolutions++; if (resolutions === 1) throw Error('Synthetic provider failure'); return r.result('720p60'); });
  await r.messages.get('refresh')(); await r.messages.get('refresh')(); await r.messages.get('refresh')();
  assert.equal(resolutions, 3); assert.equal(r.controller.snapshot().error, '');
  r.emit('iina.window-will-close');
});

test('document visibility is advisory and preserves replay plus sidebar reopen intent', async () => {
  const r = fixture(); await r.initial();
  assert.equal(await r.controller.importArchive('/archives/synthetic.json'), true);
  r.messages.get('surface-visibility')({visible: false});
  assert.equal(r.controller.snapshot().chat.mode, 'replay', 'window occlusion must not discard the chosen chat session');
  r.calls.length = 0; r.emit('iina.file-loaded', r.source.url);
  assert.ok(r.calls.some(call => call[0] === 'sidebar' && call[1] === 'show'), 'visibility must not impersonate an explicit sidebar Hide');
  r.emit('iina.window-will-close');
});

for (const disposition of ['inactive', 'closed', 'off']) {
  test('a queued First message action cannot seek after ' + disposition, async () => {
    const r = fixture(); await r.initial();
    assert.equal(await r.controller.importArchive('/archives/synthetic.json'), true);
    if (disposition === 'closed') r.emit('iina.window-will-close');
    else if (disposition === 'off') r.controller.chatOff();
    else { r.native.path = '/Users/example/unrelated.mp4'; await r.load(); }
    r.calls.length = 0; r.messages.get('first-message')();
    assert.deepEqual(r.calls, [], 'a stale sidebar action must not issue mpv seek after leaving its source');
    if (disposition !== 'closed') r.emit('iina.window-will-close');
  });
}

for (const disposition of ['inactive', 'closed']) {
  test('queued sidebar actions cannot change timeline or start quality work after ' + disposition, async () => {
    const r = fixture(); await r.initial();
    if (disposition === 'closed') r.emit('iina.window-will-close');
    else { r.native.path = '/Users/example/unrelated.mp4'; await r.load(); }
    let resolutions = 0; r.setResolver(async () => { resolutions++; return r.result('360p30'); });
    const originalOffset = r.controller.snapshot().chat.offset;
    r.calls.length = 0;
    r.messages.get('offset')(90); r.messages.get('seek-chat')(40);
    await r.messages.get('change-quality')('360p30');
    assert.equal(r.controller.snapshot().chat.offset, originalOffset);
    assert.equal(resolutions, 0); assert.deepEqual(r.calls, []);
    if (disposition !== 'closed') r.emit('iina.window-will-close');
  });
}
