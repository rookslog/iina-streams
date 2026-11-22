'use strict';

// C3b moderation across the bridge: intents (clear-message ids, clear-user identities) must reach the player
// even for messages that already rolled out of the overlay's 150-message window. All data is synthetic.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {join} = require('node:path');
const {createRequire} = require('node:module');
const Sources = require('../src/source.js');
const {createIina, createWebViewIina} = require('./support/iina-shim.js');

const playerPath = join(__dirname, '../src/player.js');
const source = Sources.parse('fixture_c3b_live');
const delayMs = 60_000;
const windowSize = 150;

const message = (id, timestampMs) => ({id, timestampMs, author: 'Fixture', text: 'Synthetic chat'});
const ids = rows => rows.map(row => row.id);

function readPost(view, name) {
  const post = view.messages(name).at(-1);
  assert.ok(post, `player posted ${name}`);
  return JSON.parse(decodeURIComponent(post.data.encoded));
}

async function livePlayer(t) {
  const shim = createIina({
    label: Sources.label(source, 'unified'),
    mpv: {path: source.url, 'time-pos': 40, speed: 1, pause: false},
  });
  shim.timers.advance(Date.parse('2026-01-01T00:00:00Z'));
  shim.http.setResponse({statusCode: 200, text: '#EXTM3U'});
  const module = {exports: {}};
  shim.runScript(playerPath, {
    globals: {module, Date: shim.timers.Date},
    require: createRequire(playerPath),
  });
  module.exports.start(shim.iina, {variant: 'unified'}, {
    readSettings: () => ({chatEnabled: false, chatTiming: {mode: 'manual', manualDelay: delayMs / 1000}}),
    resolve: async () => ({
      ok: true, live: true, title: 'Synthetic stream', quality: '720p60',
      mediaURL: 'https://media.invalid/live.m3u8',
      formats: [{id: '720p60', label: '720p60'}],
    }),
  });
  t.after(() => shim.emit('iina.window-will-close'));

  await shim.mpv.runHook('on_load');
  shim.emit('iina.file-loaded', source.url);
  shim.emit('iina.window-size-adjusted');
  await new Promise(resolve => setImmediate(resolve));
  shim.timers.advance(600);
  shim.sidebar.send('ready', {});
  assert.equal(readPost(shim.sidebar, 'state').phase, 'playing');
  assert.equal(readPost(shim.sidebar, 'state').chatTiming.delay, delayMs / 1000);

  function authorize() {
    shim.global.send('auth-ready', JSON.stringify({login: 'fixture_reader', token: 'fake_c3b_credential'}));
  }

  function connect() {
    shim.sidebar.send('connect', {});
    authorize();
    shim.emit('iina.plugin-overlay-loaded');
    shim.overlay.send('overlay-ready', {});
    return session();
  }

  function session() {
    return readPost(shim.overlay, 'live-config').session;
  }

  function post(messages, {removed = [], removedUsers = [], clearedAll = false, sessionId = session()} = {}) {
    assert.ok(messages.length <= windowSize, 'each bridge post is a bounded overlay window');
    shim.overlay.send('live-messages', {session: sessionId, messages, removed, removedUsers, clearedAll});
  }

  function visible() {
    const sidebar = ids(readPost(shim.sidebar, 'state').messages);
    const overlay = ids(readPost(shim.overlay, 'state').messages);
    assert.deepEqual(overlay, sidebar, 'both surfaces receive the same chat');
    return sidebar;
  }

  connect();
  return {shim, timers: shim.timers, authorize, connect, session, post, visible};
}


const channel = 'fixture_c3b_live';
const overlaySession = 12;

function overlayMessage(id, author = 'viewer') {
  return {
    type: 'message', id, channel, author, login: author, userId: author,
    timestampMs: 1_000, text: 'Synthetic chat',
  };
}

function overlayFixture() {
  const page = createWebViewIina();
  let onBatch;
  const context = vm.createContext({
    iina: page.iina,
    addEventListener() {},
    StreamsLive: {
      create(callbacks) {
        onBatch = callbacks.onBatch;
        return {start() {}, stop() {}};
      },
    },
  });
  context.window = context;
  for (const name of ['live-history.js', 'overlay-live.js']) {
    const filename = join(__dirname, '../ui', name);
    vm.runInContext(fs.readFileSync(filename, 'utf8'), context, {filename});
  }
  page.receiveEnvelope('live-config', {session: overlaySession, channel, login: 'reader', token: 'fake_c3b_credential'});
  assert.equal(typeof onBatch, 'function', 'overlay starts the synthetic IRC client');

  return function postBatch(events) {
    const before = page.messages('live-messages').length;
    onBatch(events);
    const posts = page.messages('live-messages');
    assert.equal(posts.length, before + 1, 'one bridge post per IRC batch');
    assert.equal(posts.at(-1).data.session, overlaySession);
    return posts.at(-1).data;
  };
}


const sender = (id, timestampMs, userId, login = '') => ({...message(id, timestampMs), userId, login});

async function readState(view) {
  return readPost(view, 'state');
}

test('a clear-message id removes a pending message that already left the overlay window', async t => {
  const {timers, post, visible} = await livePlayer(t);
  const a = message('rolled-out', timers.now);
  post([a, message('other', timers.now)]);
  post([message('newer', timers.now)], {removed: [a.id]});
  timers.advance(delayMs + 1000);
  assert.deepEqual(visible(), ['other', 'newer'], 'the moderated message never reveals');
});

test('removedUsers purges pending and revealed rows by userId without touching other users', async t => {
  const {timers, post, visible} = await livePlayer(t);
  const now = timers.now;
  post([
    sender('u1-visible', now - delayMs, 'u1'),
    sender('u2-visible', now - delayMs, 'u2'),
    sender('u1-pending', now, 'u1'),
    sender('u2-pending', now, 'u2'),
  ]);
  assert.deepEqual(visible(), ['u1-visible', 'u2-visible']);
  post([message('newer', now)], {removedUsers: [{userId: 'u1', login: ''}]});
  assert.deepEqual(visible(), ['u2-visible'], 'the revealed row from u1 disappears');
  timers.advance(delayMs + 1000);
  assert.deepEqual(visible(), ['u2-visible', 'u2-pending', 'newer'], 'u1 never reveals; u2 stays');
});

test('removedUsers matches by login, and an empty login or userId never matches', async t => {
  const {timers, post, visible} = await livePlayer(t);
  const now = timers.now;
  post([sender('by-login', now - delayMs, '', 'target'), sender('anonymous', now - delayMs, '', ''),
    sender('other', now - delayMs, 'u9', 'someone')]);
  assert.deepEqual(visible(), ['by-login', 'anonymous', 'other']);
  post([], {removedUsers: [{userId: '', login: 'target'}, {userId: '', login: ''}]});
  assert.deepEqual(visible(), ['anonymous', 'other'], 'only the named login is removed');
});

test('userId and login never reach the sidebar or overlay state', async t => {
  const {shim, timers, post, visible} = await livePlayer(t);
  post([sender('seen', timers.now - delayMs, 'secret-user-id', 'secretlogin')]);
  assert.deepEqual(visible(), ['seen']);
  for (const view of [shim.sidebar, shim.overlay]) {
    const text = JSON.stringify(await readState(view));
    assert.ok(!text.includes('secret-user-id') && !text.includes('secretlogin'), 'identity stays in the buffer');
  }
});

test('overlay reports a clear-message id that is not in its window, and clear-user identities', () => {
  const post = overlayFixture();
  post([overlayMessage('in-window')]);
  const moderated = post([
    {type: 'clear-message', channel, id: 'long-gone'},
    {type: 'clear-user', channel, userId: 'U-1', login: 'Some_Login'},
    {type: 'clear-user', channel: 'other_channel', userId: 'ignored', login: 'ignored'},
    {type: 'clear-message', channel: 'other_channel', id: 'ignored-id'},
  ]);
  assert.ok(moderated.removed.includes('long-gone'), 'the intent is reported even outside the window');
  assert.ok(!moderated.removed.includes('ignored-id'), 'other channels are ignored');
  assert.deepEqual(moderated.removedUsers, [{userId: 'U-1', login: 'some_login'}]);
  assert.deepEqual(post([overlayMessage('x')]).removedUsers, [], 'the delta is per batch');
});
