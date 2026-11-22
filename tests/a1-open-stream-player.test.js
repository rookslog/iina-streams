'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Sources = require('../src/source.js');
const {start} = require('../src/player.js');
const {createIina} = require('./support/iina-shim.js');

const twitchURL = 'https://www.twitch.tv/videos/2930971003';
const youtubeURL = 'https://www.youtube.com/watch?v=Yd9q1Y7Ou7g';
const config = {variant: 'unified'};
const resolution = {
  ok: true,
  title: 'Public recording',
  live: false,
  duration: 120,
  quality: '720p',
  formats: [{id: '720p', label: '720p'}],
  mediaURL: 'https://media.example.invalid/recording.m3u8'
};

function startPlayer(t, {path, label = '', chatEnabled = false}) {
  const resolves = [];
  const helpers = [];
  const shim = createIina({label, mpv: {path, 'stream-open-filename': path}, rejectModalDialogs: true});
  const controller = start(shim.iina, config, {
    readSettings: () => ({chatEnabled}),
    resolve: async source => {
      resolves.push(source);
      return resolution;
    },
    dataPath: name => '/private/test-data/' + name,
    runHelper: async (name, args) => {
      helpers.push({name, args});
      return {ok: false, error: {message: 'No chat in this fixture'}};
    }
  });
  t.after(() => shim.emit('iina.window-will-close'));
  return {controller, shim, resolves, helpers};
}

async function loadThroughMpv(player, path) {
  const {shim} = player;
  // Ordinary local-media windows may have no Streams hooks at all.
  if (!shim.mpv.hooks.has('on_load')) return;
  shim.mpv.set('path', path).set('stream-open-filename', path);
  let continued = 0;
  await shim.mpv.runHook('on_load', () => continued++);
  assert.equal(continued, 1, 'the hook must continue the native load exactly once');
}

function assertAdopted(player, path, kind) {
  const expected = Sources.parse(path);
  const {shim} = player;
  assert.equal(player.resolves.length, 1, `onLoadHook should adopt the unlabeled ${kind} stream and resolve it`);
  assert.deepEqual(player.resolves[0], expected);
  assert.equal(shim.mpv.props.get('stream-open-filename'), resolution.mediaURL);
  shim.emit('iina.file-loaded', path);
  shim.sidebar.receive('ready', {ready: true});
  const state = shim.sidebar.messages('state').at(-1);
  assert.ok(state, 'the adopted window should publish Streams controls');
  const {source, title, quality, phase} = JSON.parse(decodeURIComponent(state.data.encoded));
  assert.deepEqual(source, {kind, id: expected.id, provider: expected.provider});
  assert.equal(title, resolution.title);
  assert.equal(quality, resolution.quality);
  assert.notEqual(phase, 'inactive');
}

test('A1.5 player forwards sidebar open input to global unchanged', async t => {
  const label = Sources.label(Sources.parse(twitchURL), config.variant);
  const {shim} = startPlayer(t, {path: twitchURL, label});
  const input = '  XqC  ';
  await shim.sidebar.send('open', {input});
  shim.timers.flush(0);
  assert.deepEqual(shim.global.messages('open'), [{name: 'open', data: {input}}]);
});

test('A1.6 native load adopts Twitch and YouTube but leaves local and foreign files unmanaged', async t => {
  for (const chatEnabled of [true, false]) {
    const twitch = startPlayer(t, {path: twitchURL, chatEnabled});
    await loadThroughMpv(twitch, twitchURL);
    assertAdopted(twitch, twitchURL, 'twitch-vod');
    await new Promise(setImmediate);
    const acquisitions = twitch.helpers.filter(call => call.name === 'acquire');
    assert.equal(acquisitions.length, chatEnabled ? 1 : 0, 'auto replay must respect the chat preference');
    if (chatEnabled) assert.deepEqual(acquisitions[0].args.slice(0, 2), ['--url', twitchURL]);
  }

  const youtube = startPlayer(t, {path: youtubeURL});
  await loadThroughMpv(youtube, youtubeURL);
  assertAdopted(youtube, youtubeURL, 'youtube');

  const localPath = '/Users/x/movie.mkv';
  const local = startPlayer(t, {path: localPath});
  await loadThroughMpv(local, localPath);
  assert.equal(local.resolves.length, 0, 'local media must not resolve as a stream');
  assert.equal(local.shim.mpv.props.get('stream-open-filename'), localPath);
  if (local.controller) assert.equal(local.controller.snapshot().phase, 'inactive');

  const label = Sources.label(Sources.parse(twitchURL), config.variant);
  const managed = startPlayer(t, {path: twitchURL, label});
  await loadThroughMpv(managed, twitchURL);
  assert.equal(managed.resolves.length, 1, 'fixture must first resolve the managed Twitch source');
  const foreignPath = 'https://www.twitch.tv/anotherchannel';
  await loadThroughMpv(managed, foreignPath);
  assert.equal(managed.controller.snapshot().phase, 'inactive');
  assert.equal(managed.resolves.length, 1, 'a different stream must not be adopted by an active window');
  assert.equal(managed.shim.mpv.props.get('stream-open-filename'), foreignPath);
});
