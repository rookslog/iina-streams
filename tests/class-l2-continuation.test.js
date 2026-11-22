'use strict';

// v0.5.5 class L pass 2: a helper's output survives no fenced continuation (src/authority.js, continues).
//
// A YouTube replay fetch runs two helpers in a managed window: acquire (a download) and then replay import, which
// consumes the download. When a helper settles while the activation is current, its wait resolves, but the
// continuation runs a promise job later. If the window closes or loads a foreign file in between, the
// continuation is fenced (act.continues), and the helper's output has to be deleted by the wait's abandon, as
// for a helper that settles after the loss.
//
// Each case settles one helper, then ends the activation N promise jobs later, for N from 0 to 8 (as the
// explorer's between-jobs close does; the test is not told which N reaches the fenced path). For every N:
// the download and the import output are deleted, nothing is imported, and nothing is published after the
// loss except the final teardown.
//
// The services double follows src/io.js's interface (runHelper, deleteDataPath, dataPath, readFile, cancelHelpers);
// helpers are held until the test settles them. deleteDataPath records the path, as io.js deletes it.

const test = require('node:test');
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {createRequire} = require('node:module');
const Sources = require('../src/source.js');
const {createIina} = require('./support/iina-shim.js');

const playerPath = join(__dirname, '../src/player.js');
const requireFromPlayer = createRequire(playerPath);
const VIDEO = Sources.parse('https://www.youtube.com/watch?v=abcdefghijk');
const FOREIGN = '/Users/fixture/movie.mkv';
const JOBS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const settle = () => new Promise(resolve => setImmediate(resolve));
const INDEX = {version: 1, sourceId: VIDEO.id, title: 'Synthetic archive', count: 0, chunks: []};

async function replayWindow() {
  const mpv = {path: VIDEO.url, 'time-pos': 40, duration: 600};
  const shim = createIina({label: Sources.label(VIDEO, 'unified'), mpv});
  const module = {exports: {}};
  shim.runScript(playerPath, {globals: {module, Date: shim.timers.Date}, require: requireFromPlayer});
  const helpers = [];
  const deleted = [];
  const services = {
    readSettings: () => ({chatEnabled: false}),
    saveSettings() {},
    cancelHelpers() {},
    dataPath: name => '/private/class-l2/' + name,
    runHelper(name, args) {
      return new Promise((resolve, reject) => helpers.push({name, args, resolve, reject}));
    },
    readFile: file => JSON.stringify(file.endsWith('/index.json') ? INDEX : []),
    deleteDataPath(path) {
      deleted.push(path);
      return true;
    },
    async resolve() {
      return {ok: true, title: 'VOD', live: false, duration: 600, quality: '720p', formats: [],
        mediaURL: 'https://media.invalid/vod.mp4'};
    }
  };
  const controller = module.exports.start(shim.iina, {variant: 'unified'}, services);
  shim.timers.advance(0);
  await shim.mpv.runHook('on_load', () => {});
  shim.emit('iina.file-loaded', VIDEO.url);
  shim.emit('iina.window-size-adjusted');
  shim.timers.advance(3000);
  shim.sidebar.send('ready', {});
  await settle();
  return {shim, controller, helpers, deleted};
}

const outputOf = helper => helper.args[helper.args.indexOf('--output') + 1];

// After the loss only the teardown is posted, once each (the explorer's L5 allowance): the final sidebar and
// overlay state, and global's auth-disconnect and player-closed.
const TEARDOWN = ['sidebar:state', 'overlay:state', 'global:auth-disconnect', 'global:player-closed'];

function assertOnlyTeardown(posts, jobs) {
  const keys = posts.map(post => post.surface + ':' + post.name);
  const other = keys.filter(key => !TEARDOWN.includes(key));
  assert.deepEqual(other, [], `N=${jobs}: nothing but the teardown is published after the loss`);
  for (const key of TEARDOWN) {
    assert.ok(keys.filter(entry => entry === key).length <= 1, `N=${jobs}: at most one ${key}`);
  }
}

// Ends the activation: a window close, or a foreign file's hook and its release turn.
async function lose(shim, how) {
  if (how === 'close') {
    shim.emit('iina.window-will-close');
    return;
  }
  shim.mpv.set('path', FOREIGN);
  await shim.mpv.runHook('on_load', () => {});
}

for (const how of ['close', 'foreign']) {
  test(`class L2: an acquire result settling just before a ${how} leaves no download and imports nothing`,
    async () => {
      for (const jobs of JOBS) {
        const w = await replayWindow();
        w.shim.sidebar.send('fetch-replay', {});
        await settle();
        const acquire = w.helpers.find(helper => helper.name === 'acquire');
        assert.ok(acquire, 'precondition: the download is running');
        const download = outputOf(acquire);
        acquire.resolve({ok: true, path: download + '/replay.jsonl'});
        for (let job = 0; job < jobs; job++) await null;
        const before = w.shim.posts.length;
        await lose(w.shim, how);
        w.shim.timers.advance(0);
        await settle();
        assertOnlyTeardown(w.shim.posts.slice(before), jobs);
        // An import that started before the loss consumes the download: settle it late, as its helper would.
        for (const helper of w.helpers.filter(entry => entry.name === 'replay')) {
          helper.resolve({ok: true, indexPath: outputOf(helper) + '/index.json'});
        }
        await settle();
        assert.ok(w.deleted.includes(download), `N=${jobs}: the download is deleted`);
        assert.notEqual(w.controller.snapshot().chat.mode, 'replay', `N=${jobs}: nothing is imported`);
        w.shim.emit('iina.window-will-close');
      }
    });

  test(`class L2: an import result settling just before a ${how} leaves no output or download`, async () => {
    for (const jobs of JOBS) {
      const w = await replayWindow();
      w.shim.sidebar.send('fetch-replay', {});
      await settle();
      const acquire = w.helpers.find(helper => helper.name === 'acquire');
      const download = outputOf(acquire);
      acquire.resolve({ok: true, path: download + '/replay.jsonl'});
      await settle();
      const importer = w.helpers.find(helper => helper.name === 'replay');
      assert.ok(importer, 'precondition: the import is running');
      const output = outputOf(importer);
      importer.resolve({ok: true, indexPath: output + '/index.json'});
      for (let job = 0; job < jobs; job++) await null;
      const before = w.shim.posts.length;
      await lose(w.shim, how);
      w.shim.timers.advance(0);
      await settle();
      assert.ok(w.deleted.includes(download), `N=${jobs}: the consumed download is deleted`);
      assert.ok(w.deleted.includes(output), `N=${jobs}: the import output is deleted`);
      assertOnlyTeardown(w.shim.posts.slice(before), jobs);
      w.shim.emit('iina.window-will-close');
    }
  });
}
