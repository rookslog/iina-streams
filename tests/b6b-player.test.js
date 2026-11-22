'use strict';

// B6b contract: a twitch-live load with {ok: false, error: {code: 'UNAVAILABLE', reason: 'offline'}}
// makes one archive lookup through host.http. Sidebar state carries offlineVods: {state, items},
// with state loading, ready, none, or error. Leaving the source or closing invalidates a pending lookup.
// Exercise the real mpv hook and sidebar bridge via the shim; only the resolver and HTTP are doubles.

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

// Hand-written archive response shaped-from-observation (B6b); not captured traffic.
const ARCHIVE_BODY = {data: {user: {videos: {edges: [
  {node: {id: '1234567890', title: 't', createdAt: '2026-11-20T10:31:57Z', lengthSeconds: 171258}},
]}}}};
const ARCHIVE_ITEM = {
  id: '1234567890', title: 't', createdAt: '2026-11-20T10:31:57Z', lengthSeconds: 171258,
  url: 'https://www.twitch.tv/videos/1234567890',
};

const settle = () => new Promise(resolve => setImmediate(resolve));

function gqlResponse(data) {
  return {statusCode: 200, reason: 'OK', data, text: JSON.stringify(data)};
}

function playerFixture(t, source = LIVE) {
  const shim = createIina({label: Sources.label(source, 'unified'), mpv: {path: source.url}});
  shim.http.setResponse(gqlResponse(ARCHIVE_BODY));
  const module = {exports: {}};
  shim.runScript(PLAYER_PATH, {globals: {module}, require: createRequire(PLAYER_PATH)});
  const resolveCalls = [];
  const controller = module.exports.start(shim.iina, {variant: 'unified'}, {
    readSettings: () => ({chatEnabled: false}),
    async resolve(resolvedSource, quality) {
      resolveCalls.push([resolvedSource.url, quality]);
      // Use the same reason for non-live sources to catch an implementation that checks only the reason.
      return {ok: false, error: {code: 'UNAVAILABLE', reason: 'offline', message: MESSAGE}};
    },
  });
  t.after(() => shim.emit('iina.window-will-close'));
  shim.sidebar.send('ready', {});

  async function load(url = source.url) {
    shim.mpv.set('path', url);
    let continuations = 0;
    await shim.mpv.runHook('on_load', () => continuations++);
    assert.equal(continuations, 1, 'the mpv load hook continues once');
  }

  function states() {
    return shim.sidebar.messages('state').map(({data}) => JSON.parse(decodeURIComponent(data.encoded)));
  }

  function delayArchives() {
    let release;
    const response = new Promise(resolve => { release = resolve; });
    shim.http.setResponse(response);
    t.after(() => release(gqlResponse(ARCHIVE_BODY)));
    return () => release(gqlResponse(ARCHIVE_BODY));
  }

  return {shim, controller, load, states, delayArchives, resolveCalls};
}

function assertArchiveRequest(shim, count) {
  assert.equal(shim.http.calls.length, count, 'one archive fetch for each offline load');
  const {method, url, options} = shim.http.calls.at(-1);
  assert.equal(method, 'POST');
  assert.equal(url, 'https://gql.twitch.tv/gql');
  assert.match(options?.data?.query ?? '', /\buser\s*\(\s*login\s*:\s*"fixture_offline"\s*\)/);
  assert.match(options.data.query, /\bvideos\s*\(/);
}

test('B6b only offline live loads fetch archives, once per load, publishing loading before ready', async t => {
  for (const source of [VOD, YOUTUBE]) {
    const {shim, load, states, resolveCalls} = playerFixture(t, source);
    await load();
    await settle();

    assert.deepEqual(resolveCalls, [[source.url, 'auto720']]);
    assert.equal(states().at(-1).error, MESSAGE, 'the load failure reached the sidebar');
    assert.deepEqual(shim.http.calls, [], `${source.kind} must not fetch archives`);
    assert.ok(states().every(state => !['loading', 'ready'].includes(state.offlineVods?.state)));
  }

  const {shim, load, states, delayArchives, resolveCalls} = playerFixture(t);
  const release = delayArchives();
  const pending = load();
  await settle();

  assert.deepEqual(resolveCalls, [[LIVE.url, 'auto720']]);
  assertArchiveRequest(shim, 1);
  assert.deepEqual(states().at(-1).offlineVods, {state: 'loading', items: []});
  shim.sidebar.send('ready', {});
  assertArchiveRequest(shim, 1);

  release();
  await pending;
  await settle();
  assert.deepEqual(states().at(-1).offlineVods, {state: 'ready', items: [ARCHIVE_ITEM]});
  assertArchiveRequest(shim, 1);

  await load();
  await settle();
  assertArchiveRequest(shim, 2);
  assert.deepEqual(states().at(-1).offlineVods, {state: 'ready', items: [ARCHIVE_ITEM]});
});

for (const reason of ['source change', 'window close']) {
  test(`B6b player ignores an in-flight archive reply after ${reason}`, async t => {
    const {shim, controller, load, states, delayArchives} = playerFixture(t);
    const release = delayArchives();
    const pending = load();
    await settle();
    assertArchiveRequest(shim, 1);
    assert.deepEqual(states().at(-1).offlineVods, {state: 'loading', items: []});

    if (reason === 'source change') {
      // A foreign file deactivates the player on a main-thread turn (r2 #6), a shim timer that never runs
      // on its own, so the load waits for it. Without this advance the load hangs. DEVIATION from the
      // tests commit 9237fec, harness only: no assertion is changed.
      const foreignLoad = load(YOUTUBE.url);
      await settle();
      shim.timers.advance(0);
      await foreignLoad;
    } else shim.emit('iina.window-will-close');
    const phase = reason === 'source change' ? 'inactive' : 'closed';
    assert.equal(controller.snapshot().phase, phase);
    if (phase === 'inactive') {
      assert.notEqual(states().at(-1).offlineVods?.state, 'loading', 'the old loading state is cleared');
    }
    const before = states().length;

    release();
    await pending;
    await settle();
    for (const state of [states().at(-1), ...states().slice(before), controller.snapshot()]) {
      // Close stops sending immediately; its last published state can still be loading.
      assert.notEqual(state.offlineVods?.state, 'ready', 'the stale result must not become ready');
      assert.equal(state.offlineVods?.items?.length ?? 0, 0, 'the stale archive must not surface');
    }
    assertArchiveRequest(shim, 1);
  });
}

test('B6b player publishes none for an empty archive list and retains the load error', async t => {
  const {shim, load, states} = playerFixture(t);
  shim.http.setResponse(gqlResponse({data: {user: {videos: {edges: []}}}}));
  await load();
  await settle();

  assert.equal(states().at(-1).error, MESSAGE);
  assert.deepEqual(states().at(-1).offlineVods, {state: 'none', items: []});
  assertArchiveRequest(shim, 1);
});

test('B6b player publishes error when the archive lookup fails and retains the load error', async t => {
  const {shim, load, states} = playerFixture(t);
  shim.http.rejectResponse({statusCode: 503, reason: 'Service Unavailable', data: null, text: ''});
  await load();
  await settle();

  assert.equal(states().at(-1).error, MESSAGE);
  assert.deepEqual(states().at(-1).offlineVods, {state: 'error', items: []});
  assertArchiveRequest(shim, 1);
});
