'use strict';

// B6c contract (#32): the player no longer fetches an offline channel's broadcasts. A twitch-live load that
// fails with {ok: false, error: {code: 'UNAVAILABLE', reason: 'offline'}} posts `source-offline` to global
// with {login: source.id}, once per load, and makes no HTTP request. Global shows the list in the Open Stream
// window, because IINA closes a player window whose load failed (native evidence on issue #32).
// Exercise the real mpv hook via the shim; only the resolver is a double.

const test = require('node:test');
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {createRequire} = require('node:module');
const Sources = require('../src/source.js');
const {createIina} = require('./support/iina-shim.js');

const PLAYER_PATH = join(__dirname, '../src/player.js');
const LIVE = Sources.parse('fixture_offline');
const VOD = Sources.parse('https://www.twitch.tv/videos/1234567890');
const YOUTUBE = Sources.parse('https://youtu.be/abcdefghijk');
const MESSAGE = 'That channel is offline.';
const OFFLINE_RESULT = {ok: false, error: {code: 'UNAVAILABLE', reason: 'offline', message: MESSAGE}};

const settle = () => new Promise(resolve => setImmediate(resolve));

function playerFixture(t, source = LIVE, result = OFFLINE_RESULT) {
  const shim = createIina({label: Sources.label(source, 'unified'), mpv: {path: source.url}});
  const module = {exports: {}};
  shim.runScript(PLAYER_PATH, {globals: {module}, require: createRequire(PLAYER_PATH)});
  module.exports.start(shim.iina, {variant: 'unified'}, {
    readSettings: () => ({chatEnabled: false}),
    // Use the offline reason for non-live sources too, to catch a check on the reason alone.
    resolve: async () => result,
  });
  t.after(() => shim.emit('iina.window-will-close'));
  shim.sidebar.send('ready', {});

  async function load() {
    shim.mpv.set('path', source.url);
    let continuations = 0;
    await shim.mpv.runHook('on_load', () => continuations++);
    assert.equal(continuations, 1, 'the mpv load hook continues once');
    await settle();
  }

  function states() {
    return shim.sidebar.messages('state').map(({data}) => JSON.parse(decodeURIComponent(data.encoded)));
  }

  function offlinePosts() {
    return shim.global.posts.filter(post => post.name === 'source-offline');
  }

  return {shim, load, states, offlinePosts};
}

test('B6c an offline live load posts source-offline once with the login and fetches nothing', async t => {
  const {shim, load, states, offlinePosts} = playerFixture(t);
  await load();

  assert.deepEqual(offlinePosts(), [{name: 'source-offline', data: {login: 'fixture_offline'}}]);
  assert.deepEqual(shim.http.calls, [], 'the player makes no archive request');
  assert.equal(states().at(-1).error, MESSAGE, 'the plain error still reaches the sidebar');
  assert.ok(states().every(state => !('offlineVods' in state)), 'the snapshot carries no offlineVods');

  shim.sidebar.send('ready', {});
  await settle();
  assert.equal(offlinePosts().length, 1, 'a sidebar refresh does not post again');

  await load();
  assert.equal(offlinePosts().length, 2, 'a second offline load posts once more');
  assert.deepEqual(shim.http.calls, []);
});

test('B6c VOD and YouTube loads with the offline reason post nothing', async t => {
  for (const source of [VOD, YOUTUBE]) {
    const {shim, load, states, offlinePosts} = playerFixture(t, source);
    await load();
    assert.equal(states().at(-1).error, MESSAGE, 'the load failure reached the sidebar');
    assert.deepEqual(offlinePosts(), [], `${source.kind} must not post source-offline`);
    assert.deepEqual(shim.http.calls, []);
  }
});

test('B6c a live load that fails for a reason other than offline posts nothing', async t => {
  for (const error of [
    {code: 'UNAVAILABLE', message: 'That channel does not exist.'},
    {code: 'UNAVAILABLE', reason: 'restricted', message: 'That channel is restricted.'},
    {code: 'NETWORK', message: 'Twitch could not be reached.'},
  ]) {
    const {shim, load, states, offlinePosts} = playerFixture(t, LIVE, {ok: false, error});
    await load();
    assert.equal(states().at(-1).error, error.message);
    assert.deepEqual(offlinePosts(), [], `${error.reason || error.code} must not post source-offline`);
    assert.deepEqual(shim.http.calls, []);
  }
});
