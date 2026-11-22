'use strict';

// v0.5.5 clearance 2 (Important): a rejected replay import keeps no download.
//
// A replay fetch hands its download to importArchive (options.consumed), which deletes it once the import
// helper has finished with it. Class rule: every helper await that owns a file frees it on every outcome,
// fulfilled, abandoned (late) and rejected, whether the activation is still current or ended between
// promise jobs. These cases cover the rejected outcome, which v0.5.4 (04b64c8) cleaned up and f59cc1b..f777d6c
// did not.
//
// The helpers run through the real src/io.js on the IINA shim: io.runHelper rejects when the helper's stdout is
// empty ("The source helper could not complete."), the rejection the reviewer reproduced, and io.deleteDataPath
// deletes from the shim's file store. Only resolve (the media helper) is replaced, so the player starts without
// a media exec. The download directory is seeded in the file store before the import runs, so its deletion is
// observable as its absence.

const test = require('node:test');
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {createRequire} = require('node:module');
const Sources = require('../src/source.js');
const {createIina} = require('./support/iina-shim.js');

const playerPath = join(__dirname, '../src/player.js');
const ioPath = join(__dirname, '../src/io.js');
const requireFromPlayer = createRequire(playerPath);
const YOUTUBE = Sources.parse('https://www.youtube.com/watch?v=abcdefghijk');
const TWITCH = Sources.parse('https://www.twitch.tv/videos/2922164492');
const FOREIGN = '/Users/fixture/movie.mkv';
const JOBS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const settle = () => new Promise(resolve => setImmediate(resolve));
const EMBEDDED = Object.fromEntries(['media', 'replay', 'acquire', 'runner'].map(name => {
  return [name, {digest: 'a'.repeat(64), source: '# ' + name}];
}));

function realIo(shim) {
  shim.utils.inPath = () => true;
  const module = {exports: {}};
  shim.runScript(ioPath, {require: () => EMBEDDED, globals: {module, Date: shim.timers.Date}});
  return module.exports.create(shim.iina);
}

async function replayWindow(source) {
  const mpv = {path: source.url, 'time-pos': 0, duration: 600};
  const shim = createIina({label: Sources.label(source, 'unified'), mpv, dataRoot: '/private/import-reject'});
  const io = realIo(shim);
  const module = {exports: {}};
  shim.runScript(playerPath, {globals: {module, Date: shim.timers.Date}, require: requireFromPlayer});
  const services = Object.assign({}, io, {
    readSettings: () => ({}),
    saveSettings() {},
    async resolve() {
      return {ok: true, title: 'VOD', live: false, duration: 600, quality: '720p', formats: [],
        mediaURL: 'https://media.invalid/vod.mp4'};
    }
  });
  const controller = module.exports.start(shim.iina, {variant: 'unified'}, services);
  shim.timers.advance(0);
  await shim.mpv.runHook('on_load', () => {});
  shim.emit('iina.file-loaded', source.url);
  shim.emit('iina.window-size-adjusted');
  shim.timers.advance(3000);
  shim.sidebar.send('ready', {});
  await settle();
  return {shim, controller};
}

const argAfter = (job, flag) => job.args[job.args.indexOf(flag) + 1];
const findJob = (shim, flag) => shim.utils.execs.find(job => job.args.includes(flag));

// Starts the fetch if it did not start on load, then answers the acquire helper with a valid download.
async function acquireDownload(w, source) {
  if (!findJob(w.shim, '--url')) {
    w.shim.sidebar.send('fetch-replay', {});
    await settle();
  }
  const acquire = findJob(w.shim, '--url');
  assert.ok(acquire, 'precondition: the acquire helper is running');
  const download = argAfter(acquire, '--output');
  w.shim.file.seed(download, 'downloaded chat');
  assert.ok(w.shim.file.has(download), 'precondition: the download exists');
  const response = {ok: true, path: download + '/replay.jsonl'};
  if (source === TWITCH) {
    const at = Number(argAfter(acquire, '--at'));
    response.window = {requested: at, start: at, end: at + 80, hasMore: false};
  }
  acquire.resolve({stdout: JSON.stringify(response)});
  await settle();
  const importer = findJob(w.shim, '--input');
  assert.ok(importer, 'precondition: the import helper is running');
  assert.equal(argAfter(importer, '--input'), download + '/replay.jsonl', 'precondition: it reads the download');
  return {download, importer};
}

const TEARDOWN = ['sidebar:state', 'overlay:state', 'global:auth-disconnect', 'global:player-closed'];

function assertOnlyTeardown(posts, label) {
  const keys = posts.map(post => post.surface + ':' + post.name);
  const other = keys.filter(key => !TEARDOWN.includes(key));
  assert.deepEqual(other, [], `${label}: nothing but the teardown is published after the loss`);
  for (const key of TEARDOWN) {
    assert.ok(keys.filter(entry => entry === key).length <= 1, `${label}: at most one ${key}`);
  }
}

async function lose(shim, how) {
  if (how === 'close') {
    shim.emit('iina.window-will-close');
    return;
  }
  shim.mpv.set('path', FOREIGN);
  await shim.mpv.runHook('on_load', () => {});
}

for (const [kind, source] of [['YouTube', YOUTUBE], ['Twitch', TWITCH]]) {
  test(`clearance 2: a ${kind} import whose helper rejects while current deletes its download`, async () => {
    const w = await replayWindow(source);
    const {download, importer} = await acquireDownload(w, source);
    importer.resolve({stdout: ''});
    await settle();
    assert.equal(w.shim.file.has(download), false, 'the download is deleted');
    const chat = w.controller.snapshot().chat;
    assert.notEqual(chat.mode, 'replay', 'nothing is imported');
    assert.ok(chat.error, 'the failure is shown while the window is current');
    w.shim.emit('iina.window-will-close');
  });

  for (const how of ['close', 'foreign']) {
    test(`clearance 2: a ${kind} import rejecting just before a ${how} deletes its download`, async () => {
      for (const jobs of JOBS) {
        const label = `N=${jobs}`;
        const w = await replayWindow(source);
        const {download, importer} = await acquireDownload(w, source);
        importer.resolve({stdout: ''});
        for (let job = 0; job < jobs; job++) await null;
        const before = w.shim.posts.length;
        await lose(w.shim, how);
        w.shim.timers.advance(0);
        await settle();
        assertOnlyTeardown(w.shim.posts.slice(before), label);
        assert.equal(w.shim.file.has(download), false, `${label}: the download is deleted`);
        assert.notEqual(w.controller.snapshot().chat.mode, 'replay', `${label}: nothing is imported`);
        w.shim.emit('iina.window-will-close');
      }
    });

    test(`clearance 2: a ${kind} import rejecting after a ${how} deletes its download`, async () => {
      const w = await replayWindow(source);
      const {download, importer} = await acquireDownload(w, source);
      const before = w.shim.posts.length;
      await lose(w.shim, how);
      w.shim.timers.advance(0);
      await settle();
      importer.resolve({stdout: ''});
      await settle();
      assertOnlyTeardown(w.shim.posts.slice(before), 'late');
      assert.equal(w.shim.file.has(download), false, 'the download is deleted');
      assert.notEqual(w.controller.snapshot().chat.mode, 'replay', 'nothing is imported');
      w.shim.emit('iina.window-will-close');
    });
  }
}
