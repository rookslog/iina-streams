'use strict';

// #60: every plugin-side onMessage callback is kept reachable from the JS global through src/listeners.js.
// Test environment difference: in IINA each plugin instance has its own JSContext, so its own registry. Here
// src/listeners.js is loaded by Node, so every shim in this file shares Node's globalThis and one registry. Each
// test clears it first and reads sizes and entries, never totals across tests.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Sources = require('../src/source.js');
const {listen, registry, REGISTRY} = require('../src/listeners.js');
const {start} = require('../src/player.js');
const {createIina} = require('./support/iina-shim.js');

const ROOT = path.join(__dirname, '..');
const LISTENERS = path.join(ROOT, 'src', 'listeners.js');
const LIVE = 'https://www.twitch.tv/fixturechannel';
const RESOLUTION = {
  ok: true, title: 'Recording', live: false, duration: 100, quality: '360p30',
  formats: [{id: '360p30', label: '360p'}], mediaURL: 'https://vod-secure.twitch.tv/transport'
};

// ---- Scan: no onMessage registration outside src/listeners.js ----

// The plugin-side JS files: src/ (recursively), main.js and global.js.
function pluginFiles() {
  const files = [path.join(ROOT, 'main.js'), path.join(ROOT, 'global.js')];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  };
  walk(path.join(ROOT, 'src'));
  return files;
}

// [line] of every `.onMessage(` call in `source`, ignoring line comments.
function onMessageCalls(source) {
  const lines = source.split('\n');
  const found = [];
  lines.forEach((line, index) => {
    const code = line.replace(/\/\/.*$/, '');
    if (/\.onMessage\s*\(/.test(code)) found.push(index + 1);
  });
  return found;
}

test('listener scan: no .onMessage( call in src/, main.js or global.js outside src/listeners.js', () => {
  const files = pluginFiles();
  assert.ok(files.includes(path.join(ROOT, 'src', 'player.js')), 'precondition: src/player.js is scanned');
  assert.ok(files.includes(LISTENERS), 'precondition: src/listeners.js is found');
  const found = [];
  for (const file of files) {
    if (file === LISTENERS) continue;
    for (const line of onMessageCalls(fs.readFileSync(file, 'utf8'))) {
      found.push(path.relative(ROOT, file) + ':' + line);
    }
  }
  assert.deepEqual(found, []);
});

test('listener scan: a bypass in real source is seen (positive control)', () => {
  const global = fs.readFileSync(path.join(ROOT, 'global.js'), 'utf8');
  const bypass = global.replace("listen(app,'global','open',onPlayerOpen);", "app.onMessage('open',onPlayerOpen);");
  assert.notEqual(bypass, global, 'precondition: the bypass was applied');
  assert.equal(onMessageCalls(bypass).length, 1);
  const player = fs.readFileSync(path.join(ROOT, 'src', 'player.js'), 'utf8');
  const inline = player.replace("listen(overlay,'overlay',name,whileActive(handler));",
    'overlay.onMessage(name,whileActive(handler));');
  assert.notEqual(inline, player, 'precondition: the bypass was applied');
  assert.equal(onMessageCalls(inline).length, 1);
  assert.deepEqual(onMessageCalls(' // iina.overlay.onMessage(x) in a comment is not a call'), []);
});

// ---- listen() ----

// An API object that records the function each onMessage call was given.
function fakeApi() {
  const given = [];
  return {given, onMessage(name, fn) { given.push({name, fn}); }};
}

test('listen keeps the identical function on the JS global and passes that same function to the API', () => {
  registry().clear();
  const api = fakeApi();
  const fn = () => {};
  listen(api, 'overlay', 'geometry', fn);
  assert.equal(api.given.length, 1);
  assert.equal(api.given[0].name, 'geometry');
  assert.equal(api.given[0].fn, fn, 'the API receives the passed function, not a wrapper');
  assert.equal(globalThis[REGISTRY], registry(), 'the registry lives on the global object');
  assert.equal(registry().get('overlay:geometry'), fn, 'the registry holds the passed function');
  assert.equal(registry().get('overlay'), api, 'the registry holds the API object');
  assert.throws(() => listen(api, 'other', 'x', fn), /unknown API key/);
});

test('listen replaces the entry for a name instead of adding one', () => {
  registry().clear();
  const api = fakeApi();
  const first = () => 1;
  const second = () => 2;
  listen(api, 'sidebar', 'ready', first);
  const size = registry().size;
  listen(api, 'sidebar', 'ready', second);
  assert.equal(registry().size, size);
  assert.equal(registry().get('sidebar:ready'), second);
  listen(api, 'overlay', 'ready', first);
  assert.equal(registry().get('sidebar:ready'), second, 'the same name on another API is a separate entry');
  assert.equal(registry().get('overlay:ready'), first);
});

// ---- A real controller ----

async function playerWithOverlay() {
  const shim = createIina({label: Sources.label(Sources.parse(LIVE), 'unified'), mpv: {path: LIVE,
    'stream-open-filename': LIVE}});
  const services = {
    resolve: async () => Object.assign({}, RESOLUTION, {live: true, title: 'Live'}),
    readSettings: () => ({}), saveSettings() {}, runHelper() {}, readFile() {}, dataPath: name => '/private/' + name
  };
  const controller = start(shim.iina, {variant: 'unified'}, services);
  await shim.mpv.runHook('on_load', () => {});
  shim.emit('iina.file-loaded', LIVE);
  shim.emit('iina.window-size-adjusted');
  await new Promise(resolve => setTimeout(resolve, 650));
  shim.sidebar.send('ready', {});
  shim.sidebar.send('connect', {});
  shim.global.send('auth-ready', JSON.stringify({login: 'fixture_reader', token: 'fake_registry_credential'}));
  assert.equal(shim.overlay.loads.length, 1, 'precondition: the overlay page was loaded');
  return {shim, controller};
}

// Every registered name on `view` maps to the identical function in the registry under `apiKey`.
function assertMirrors(view, apiKey) {
  assert.ok(view.listeners.size > 0, 'precondition: ' + apiKey + ' has listeners');
  for (const [name, fn] of view.listeners) {
    assert.equal(registry().get(apiKey + ':' + name), fn, apiKey + ':' + name + ' is the registered function');
  }
}

test('player: page messages reach the controller through the registered functions', async t => {
  registry().clear();
  const {shim} = await playerWithOverlay();
  t.after(() => shim.emit('iina.window-will-close'));
  assertMirrors(shim.sidebar, 'sidebar');
  assert.equal(registry().get('sidebar'), shim.iina.sidebar);
  const before = shim.sidebar.messages('state').length;
  shim.sidebar.send('ready', {});
  assert.ok(shim.sidebar.messages('state').length > before, 'the sidebar ready message was handled');
});

test('player: ten overlay reloads keep the registry the same size', async t => {
  registry().clear();
  const {shim} = await playerWithOverlay();
  t.after(() => shim.emit('iina.window-will-close'));
  shim.emit('iina.plugin-overlay-loaded');
  assertMirrors(shim.overlay, 'overlay');
  const size = registry().size;
  const ready = registry().get('overlay:overlay-ready');
  for (let i = 0; i < 10; i++) {
    shim.iina.overlay.loadFile('ui/overlay.html');
    shim.emit('iina.plugin-overlay-loaded');
  }
  assert.equal(registry().size, size);
  assert.notEqual(registry().get('overlay:overlay-ready'), ready, 'each reload replaced the entry');
  assertMirrors(shim.overlay, 'overlay');
  shim.overlay.send('overlay-ready', {});
});

// ---- global.js ----

function loadGlobal() {
  const config = {identifier: 'local.iina.streams.listener-test', variant: 'unified'};
  const shim = createIina({role: 'global', identifier: config.identifier, rejectModalDialogs: true});
  const modules = new Map([
    ['./config.js', config],
    ['./src/source.js', Sources],
    ['./src/auth.js', require('../src/auth.js')],
    ['./src/timers.js', require('../src/timers.js')],
    ['./src/twitch-app.js', {clientID: ''}],
    ['./src/listeners.js', require('../src/listeners.js')]
  ]);
  shim.runScript(path.join(ROOT, 'global.js'), {
    require(name) {
      if (!modules.has(name)) throw new Error('Unexpected module ' + name);
      return modules.get(name);
    }
  });
  return shim;
}

test('global: app listeners and repeated Open Stream windows stay registered without growth', () => {
  registry().clear();
  const shim = loadGlobal();
  assertMirrors(shim.global, 'global');
  assert.equal(registry().get('global'), shim.iina.global);
  const item = shim.menu.items.find(entry => entry.keyBinding === 'Ctrl+Meta+o');
  assert.ok(item, 'precondition: the Open Stream menu item exists');
  item.action();
  const size = registry().size;
  for (let i = 0; i < 10; i++) {
    shim.iina.standaloneWindow.close();
    item.action();
  }
  assert.equal(registry().size, size);
  assertMirrors(shim.standaloneWindow, 'standaloneWindow');
  assert.equal(registry().get('standaloneWindow'), shim.iina.standaloneWindow);
});

// ---- #60 lifetime probe ----

test('lifetime probe: last-session.json carries the instance id and start time, and no URL', async t => {
  registry().clear();
  const {shim} = await playerWithOverlay();
  t.after(() => shim.emit('iina.window-will-close'));
  const writes = shim.file.writes.filter(write => write.file === '@data/last-session.json');
  assert.ok(writes.length > 0, 'precondition: the diagnostics were written');
  const text = writes.at(-1).content;
  const record = JSON.parse(text);
  assert.match(record.instanceId, /^[a-z0-9]{8,}$/);
  assert.equal(new Date(record.instanceStartedAt).toISOString(), record.instanceStartedAt);
  assert.ok(Array.isArray(record.steps) && record.steps.length > 0);
  for (const write of writes) {
    assert.equal(JSON.parse(write.content).instanceId, record.instanceId, 'one id per JS context');
  }
  assert.doesNotMatch(text, /https?:|:\/\/|twitch\.tv|fixturechannel|fixture_reader|fake_registry_credential/);
});
