'use strict';

// Edges of #35 adoption and #50 error routing that the A1 tests do not pin, plus the archive-mismatch
// behaviour that replaced the utils.ask confirmation.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Sources = require('../src/source.js');
const {start} = require('../src/player.js');
const {createIina} = require('./support/iina-shim.js');

const config = {identifier: 'local.iina.streams.guard-test', variant: 'unified'};
const twitchURL = 'https://www.twitch.tv/videos/2930971003';

function unlabeledWindow(filePath) {
  const mpv = {path: filePath, 'stream-open-filename': filePath};
  const shim = createIina({label: '', mpv, rejectModalDialogs: true});
  const resolves = [];
  const services = {
    readSettings: () => ({chatEnabled: false}),
    resolve: async source => {
      resolves.push(source);
      const mediaURL = 'https://media.example.invalid/x';
      return {ok: true, title: 'T', live: false, quality: '720p', formats: [], mediaURL};
    }
  };
  const controller = start(shim.iina, {variant: 'unified'}, services);
  return {shim, resolves, controller};
}

test('A1 guard: bare words and scheme-less paths are local files, not Twitch channels', async () => {
  for (const filePath of ['movie', 'twitch.tv/xqc']) {
    const {shim, resolves} = unlabeledWindow(filePath);
    let continued = 0;
    await shim.mpv.runHook('on_load', () => continued++);
    assert.equal(continued, 1);
    assert.equal(resolves.length, 0, `${filePath} must not be adopted`);
    assert.equal(shim.mpv.props.get('stream-open-filename'), filePath);
    assert.equal(shim.event.names().length, 0, 'the window stays without Streams controls');
  }
});

test('A1 guard: if adoption throws, the native load continues untouched', async () => {
  const filePath = 'https://www.twitch.tv/xqc';
  const shim = createIina({label: '', mpv: {path: filePath, 'stream-open-filename': filePath}});
  const services = {readSettings() { throw new Error('settings unavailable'); }, resolve: async () => assert.fail()};
  assert.equal(start(shim.iina, {variant: 'unified'}, services), null);
  let continued = 0;
  await shim.mpv.runHook('on_load', () => continued++);
  assert.equal(continued, 1);
  assert.equal(shim.mpv.props.get('stream-open-filename'), filePath);
});

test('A1 guard: an adopted window forwards open-error from global to its sidebar field', async () => {
  const {shim} = unlabeledWindow(twitchURL);
  await shim.mpv.runHook('on_load', () => {});
  // The player binds global listeners on a later turn of the real timer it captured at start.
  await new Promise(resolve => setTimeout(resolve, 0));
  shim.global.send('open-error', '{}');
  assert.equal(shim.sidebar.messages('open-error').length, 1);
  shim.emit('iina.window-will-close');
});

function loadGlobal() {
  const shim = createIina({role: 'global', identifier: config.identifier, rejectModalDialogs: true});
  const modules = new Map([
    ['./config.js', config],
    ['./src/source.js', Sources],
    ['./src/auth.js', require('../src/auth.js')],
    ['./src/timers.js', require('../src/timers.js')],
    ['./src/twitch-app.js', {clientID: ''}]
  ]);
  shim.runScript(path.join(__dirname, '../global.js'), {
    require(name) {
      if (!modules.has(name)) throw new Error('Unexpected module ' + name);
      return modules.get(name);
    }
  });
  return shim;
}

test('A1 guard: global answers an adopted window by its IINA label, and ignores foreign labels', () => {
  const shim = loadGlobal();
  // IINA 1.5.1 labels the windows it opens itself "0", "1", ... (PlayerCore.swift).
  shim.global.send('open', {input: 'not a stream'}, '0');
  shim.global.send('open', {input: 'not a stream'}, 'x-other.plugin');
  shim.global.send('open', {input: 'xqc'}, '0');
  shim.timers.flush(0);
  assert.deepEqual(shim.global.messages('open-error').map(post => post.target), ['0']);
  assert.equal(shim.global.opens.length, 1, 'valid input from an adopted window still opens a stream');
});

test('A1 archive: a manually chosen archive for another video imports without a modal question', async () => {
  const source = Sources.parse(twitchURL);
  const shim = createIina({label: Sources.label(source, 'unified'), rejectModalDialogs: true});
  const timeline = {availableStart: 0};
  const index = {version: 1, count: 0, chunks: [], sourceId: '999', title: 'Other video', timeline};
  const services = {
    readSettings: () => ({chatEnabled: false}),
    dataPath: name => '/private/data/' + name,
    readFile: () => JSON.stringify(index),
    runHelper: async (name, args) => ({ok: true, indexPath: args[args.indexOf('--output') + 1] + '/index.json'})
  };
  const controller = start(shim.iina, {variant: 'unified'}, services);
  assert.equal(await controller.importArchive('/archives/other.json'), true);
  assert.equal(shim.utils.asks.length, 0);
  assert.equal(controller.snapshot().chat.available, true);
  assert.equal(controller.snapshot().chat.sourceName, 'Other video');
  shim.emit('iina.window-will-close');
});
