'use strict';

// #73 watch history, player half. tests/history-global.test.js sends the child messages to global directly; this
// file pins the sender, src/player.js, through the shim's real hooks and events. Protocol (see that file's header):
//   history-start {provider, login, displayName}  once per activation, on iina.file-loaded, only for a source
//     that plays; login is the Twitch channel owner or the YouTube channel id, never a video id.
//   history-focus {focused}                       from iina.window-main.changed; IINA 1.5.1 sends that event only
//     on transitions with one boolean (EventController.swift, "iina.window-main.changed"). If none has arrived by
//     the first history-start, the player reports {focused:true} right after it.
//   history-end {}                                when a started activation is retired.
// No message carries a URL, title, token or query string. Synthetic host: nothing here contacts Twitch or YouTube.

const test = require('node:test');
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {createRequire} = require('node:module');
const Sources = require('../src/source.js');
const {createIina} = require('./support/iina-shim.js');

const PLAYER_PATH = join(__dirname, '../src/player.js');
const LIVE = Sources.parse('Fixture_Live');
const VOD = Sources.parse('https://www.twitch.tv/videos/1234567890');
const YOUTUBE = Sources.parse('https://youtu.be/AbC_123-xYz');
const SIGNED = 'https://usher.invalid/api/channel/hls/secret.m3u8?sig=SIGSECRET&token=%7B%22TOKENSECRET%22%7D';
const TITLE = 'A Very Private Title';
const settle = () => new Promise(resolve => setImmediate(resolve));

function okResult(source, extra = {}) {
  return {
    ok: true, title: TITLE, live: source.kind === 'twitch-live', quality: '720p60',
    mediaURL: SIGNED, formats: [{id: '720p60', label: '720p60'}], ...extra,
  };
}

function playerFixture(t, source, resolve) {
  const shim = createIina({label: Sources.label(source, 'unified'), mpv: {path: source.url}});
  const module = {exports: {}};
  shim.runScript(PLAYER_PATH, {globals: {module}, require: createRequire(PLAYER_PATH)});
  const controller = module.exports.start(shim.iina, {variant: 'unified'}, {
    readSettings: () => ({chatEnabled: false}),
    resolve: typeof resolve === 'function' ? resolve : async () => resolve,
  });
  t.after(() => shim.emit('iina.window-will-close'));
  shim.sidebar.send('ready', {});

  async function load() {
    shim.mpv.set('path', source.url);
    await shim.mpv.runHook('on_load', () => {});
    await settle();
  }
  const fileLoaded = () => shim.emit('iina.file-loaded', source.url);
  const posts = () => shim.global.posts.filter(post => post.name.startsWith('history-'));
  const named = name => posts().filter(post => post.name === name).map(post => post.data);
  return {shim, controller, load, fileLoaded, posts, named};
}

async function playing(t, source, result) {
  const f = playerFixture(t, source, result === undefined ? okResult(source) : result);
  await f.load();
  return f;
}

test('#73 a Twitch live source posts history-start once, on file-loaded, and not again for the same activation', async t => {
  const f = await playing(t, LIVE);
  assert.deepEqual(f.posts(), [], 'nothing is posted before the file plays');
  f.fileLoaded();
  assert.deepEqual(f.named('history-start'), [{provider: 'twitch', login: 'fixture_live', displayName: 'fixture_live'}]);
  f.fileLoaded();
  f.fileLoaded();
  assert.equal(f.named('history-start').length, 1, 'repeat file-loaded events do not post again');
});

test('#73 a Twitch live source with a resolved display name posts it', async t => {
  const channel = {provider: 'twitch', login: 'fixture_live', displayName: 'Fixture_Live'};
  const f = await playing(t, LIVE, okResult(LIVE, {channel}));
  f.fileLoaded();
  assert.deepEqual(f.named('history-start'), [channel]);
});

test('#73 a Twitch VOD posts the channel owner, never the video id', async t => {
  const channel = {provider: 'twitch', login: 'ohnepixel', displayName: 'Ohnepixel'};
  const f = await playing(t, VOD, okResult(VOD, {channel}));
  f.fileLoaded();
  assert.deepEqual(f.named('history-start'), [channel]);
  assert.ok(!JSON.stringify(f.posts()).includes('1234567890'), 'the video id is in no history message');
});

test('#73 a Twitch VOD whose owner is unknown posts no history-start', async t => {
  const f = await playing(t, VOD);
  f.fileLoaded();
  assert.deepEqual(f.named('history-start'), []);
  assert.ok(!JSON.stringify(f.posts()).includes('1234567890'));
});

test('#73 a YouTube video posts its channel id and name; with no channel_id it posts nothing', async t => {
  const channel = {provider: 'youtube', login: 'UCaBcD0123456789xyzPQrst', displayName: 'TubeChannel'};
  const f = await playing(t, YOUTUBE, okResult(YOUTUBE, {channel}));
  f.fileLoaded();
  assert.deepEqual(f.named('history-start'), [channel], 'the channel id keeps its case');
  assert.ok(!JSON.stringify(f.posts()).includes('AbC_123-xYz'), 'the video id is in no history message');

  const none = await playing(t, YOUTUBE);
  none.fileLoaded();
  assert.deepEqual(none.named('history-start'), [], 'no channel result, no visit');
  assert.deepEqual(none.posts(), [], 'and no focus report either');
});

test('#73 a load that fails before file-loaded posts no history-start', async t => {
  const f = playerFixture(t, LIVE, {ok: false, error: {code: 'NETWORK', message: 'Twitch could not be reached.'}});
  await f.load();
  await settle();
  assert.deepEqual(f.posts(), [], 'the failed load alone starts no visit');
});

test('#73 a load cancelled before file-loaded posts no history-start', async t => {
  let release;
  const f = playerFixture(t, LIVE, () => new Promise(resolve => { release = () => resolve(okResult(LIVE)); }));
  const loading = f.load();
  await settle();
  f.shim.emit('iina.window-will-close');
  release();
  await loading;
  await settle();
  assert.deepEqual(f.posts(), [], 'closing the window mid-load posts nothing, not even history-end');
});

test('#73 window-main.changed posts history-focus with its boolean', async t => {
  const f = await playing(t, LIVE);
  f.shim.emit('iina.window-main.changed', true);
  assert.deepEqual(f.named('history-focus'), [{focused: true}]);
  f.shim.emit('iina.window-main.changed', false);
  assert.deepEqual(f.named('history-focus'), [{focused: true}, {focused: false}]);
  f.shim.emit('iina.window-main.changed', true);
  assert.deepEqual(f.named('history-focus').at(-1), {focused: true});
  assert.equal(f.named('history-focus').length, 3, 'one report per event');
});

test('#73 with no window-main.changed yet, history-start is followed at once by history-focus true', async t => {
  const f = await playing(t, LIVE);
  f.fileLoaded();
  assert.deepEqual(f.posts().map(post => post.name), ['history-start', 'history-focus']);
  assert.deepEqual(f.named('history-focus'), [{focused: true}]);
});

test('#73 a window-main.changed true that arrived first stands: history-start adds no second focus report', async t => {
  const f = await playing(t, LIVE);
  f.shim.emit('iina.window-main.changed', true);
  f.fileLoaded();
  assert.deepEqual(f.posts().map(post => post.name), ['history-focus', 'history-start']);
});

test('#73 a window-main.changed false that arrived first is not overridden by history-start', async t => {
  const f = await playing(t, LIVE);
  f.shim.emit('iina.window-main.changed', false);
  f.fileLoaded();
  assert.deepEqual(f.named('history-focus'), [{focused: false}], 'the player never claims focus it was told it lost');
  assert.equal(f.named('history-start').length, 1);
});

test('#73 retiring a started activation posts history-end after history-start', async t => {
  const f = await playing(t, LIVE);
  f.fileLoaded();
  f.controller.retire();
  assert.deepEqual(f.named('history-end'), [{}]);
  const names = f.posts().map(post => post.name);
  assert.ok(names.indexOf('history-start') < names.indexOf('history-end'));
  f.controller.retire();
  assert.equal(f.named('history-end').length, 1, 'a second retire posts nothing more');
});

test('#73 retiring an activation that never started posts nothing', async t => {
  const f = await playing(t, LIVE);
  f.controller.retire();
  assert.deepEqual(f.posts(), []);
  const failed = playerFixture(t, LIVE, {ok: false, error: {code: 'NETWORK', message: 'No.'}});
  await failed.load();
  failed.controller.retire();
  assert.deepEqual(failed.posts(), []);
});

test('#73 no history message carries a URL, title, token or query string', async t => {
  const cases = [
    [LIVE, okResult(LIVE)],
    [VOD, okResult(VOD, {channel: {provider: 'twitch', login: 'ohnepixel', displayName: 'Ohnepixel'}})],
    [YOUTUBE, okResult(YOUTUBE, {channel: {provider: 'youtube', login: 'UCaBcD0123456789xyzPQrst', displayName: 'TubeChannel'}})],
  ];
  for (const [source, result] of cases) {
    const f = await playing(t, source, result);
    f.shim.emit('iina.window-main.changed', false);
    f.fileLoaded();
    f.shim.emit('iina.window-main.changed', true);
    f.controller.retire();
    const all = f.posts();
    assert.ok(all.some(post => post.name === 'history-start'), `${source.kind} started`);
    for (const post of all) {
      const text = JSON.stringify(post);
      assert.ok(!/https?:|\?|sig=|token|SIGSECRET|TOKENSECRET|usher\.invalid/i.test(text), `${source.kind} ${post.name}: ${text}`);
      assert.ok(!text.includes(TITLE), `${source.kind} ${post.name} carries the title`);
      assert.ok(!text.includes(source.url), `${source.kind} ${post.name} carries the source URL`);
    }
  }
});
