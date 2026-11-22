'use strict';

// C3b bridge: live-messages carries {session, messages, removed, clearedAll}.
// messages is the newest 150 in arrival order; removed lists IDs deleted by this batch's
// clear-message or clear-user events, and clearedAll flags a clear-all in this batch.
// Ordinary window rollover is not a deletion. All chat and credentials below are synthetic.

const test = require('node:test');
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {createRequire} = require('node:module');
const Sources = require('../src/source.js');
const {createIina} = require('./support/iina-shim.js');

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

  function post(messages, {removed = [], clearedAll = false, sessionId = session()} = {}) {
    assert.ok(messages.length <= windowSize, 'each bridge post is a bounded overlay window');
    shim.overlay.send('live-messages', {session: sessionId, messages, removed, clearedAll});
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

test('60 s delay reveals all 400 messages in arrival order across rolling posts', async t => {
  const {timers, post, visible} = await livePlayer(t);
  const cadenceMs = 150;
  const start = timers.now;
  const arrivals = Array.from({length: 400}, (_, i) => message(`burst-${i + 1}`, start + (i + 1) * cadenceMs));

  // 20 arrivals per post; each post includes the overlapping part of the previous window.
  for (let end = 20; end <= arrivals.length; end += 20) {
    timers.advance(cadenceMs * 20);
    post(arrivals.slice(Math.max(0, end - windowSize), end));
    assert.deepEqual(visible(), [], 'the first 60 s of arrivals are all still pending');
  }

  timers.advance(cadenceMs - 1);
  assert.deepEqual(visible(), [], 'one millisecond before the first message is due');
  timers.advance(1);
  // No more bridge posts. At each due time the newly revealed row must appear exactly once.
  for (let end = 1; end <= arrivals.length; end++) {
    assert.deepEqual(visible(), ids(arrivals.slice(Math.max(0, end - windowSize), end)),
      `message ${end} reveals at its deadline, with at most 150 visible`);
    if (end < arrivals.length) timers.advance(cadenceMs);
  }
});

test('revealed chat remains visible even when the whole overlay window is pending', async t => {
  const {timers, post, visible} = await livePlayer(t);
  const anchor = message('already-visible', timers.now - delayMs);
  const pending = Array.from({length: windowSize}, (_, i) => message(`waiting-${i + 1}`, timers.now));
  post([anchor, ...pending.slice(0, 75)]);
  assert.deepEqual(visible(), [anchor.id], 'the anchor is visible while its neighbors wait');

  post(pending);
  assert.deepEqual(visible(), [anchor.id], 'falling out of the bridge window is not a deletion');
  timers.advance(delayMs - 1);
  assert.deepEqual(visible(), [anchor.id], 'the panel does not go empty while the new window waits');
  timers.advance(1);
  assert.deepEqual(visible(), ids(pending), 'the newest 150 visible messages replace the anchor');
});

test('removed IDs purge revealed and pending chat without deleting displaced survivors', async t => {
  const {timers, post, visible} = await livePlayer(t);
  const now = timers.now;
  const visibleSurvivor = message('keep-visible', now - delayMs);
  const pendingSurvivor = message('keep-pending', now - 30_000);
  const deleted = [
    message('clear-message-visible', now - delayMs),
    message('clear-user-visible', now - delayMs),
    message('clear-message-pending', now - 30_000),
    message('clear-user-pending', now - 30_000),
  ];
  const filler = Array.from({length: windowSize}, (_, i) => message(`filler-${i + 1}`, now));
  post([visibleSurvivor, pendingSurvivor, ...deleted, ...filler.slice(0, -6)]);
  assert.deepEqual(visible(), [visibleSurvivor.id, deleted[0].id, deleted[1].id]);

  // Four moderation removals and six arrivals also displace two unmoderated rows.
  const removed = ids(deleted);
  post(filler, {removed});
  const afterModeration = visible();
  timers.advance(30_000);
  const afterPendingDeadline = visible();
  assert.deepEqual(afterModeration.filter(id => removed.includes(id)), [], 'no deleted visible rows remain');
  assert.deepEqual(afterPendingDeadline.filter(id => removed.includes(id)), [], 'no deleted pending rows reveal');
  assert.deepEqual([afterModeration, afterPendingDeadline],
    [[visibleSurvivor.id], [visibleSurvivor.id, pendingSurvivor.id]],
    'only unmoderated survivors stay visible or reveal later, even outside the overlay window');
});

test('clear-all purges revealed and pending chat but keeps messages from after the clear', async t => {
  const {timers, post, visible} = await livePlayer(t);
  post([message('before-visible', timers.now - delayMs), message('before-pending', timers.now)]);
  assert.deepEqual(visible(), ['before-visible']);

  timers.advance(1000);
  post([message('after-clear', timers.now)], {clearedAll: true});
  assert.deepEqual(visible(), [], 'the old visible row is cleared; the new row is not due');
  timers.advance(delayMs - 1000);
  assert.deepEqual(visible(), [], 'the old pending row never reveals');
  timers.advance(1000);
  assert.deepEqual(visible(), ['after-clear'], 'the same batch can carry fresh chat after clearing');
});

test('overflow drops the oldest pending messages at the 3000-message cap', async t => {
  const {timers, post, visible} = await livePlayer(t);
  const start = timers.now;
  const batchSize = 100;
  const overflow = 5;
  const pending = Array.from({length: 3000 + overflow}, (_, i) => {
    const offset = i < overflow ? i + 1 : (Math.floor(i / batchSize) + 1) * 1000;
    return message(`pending-${i + 1}`, start + offset);
  });
  const batchEnds = [];
  for (let offset = 0; offset < pending.length; offset += batchSize) {
    const end = Math.min(offset + batchSize, pending.length);
    batchEnds.push(end);
    timers.advance(pending[end - 1].timestampMs - timers.now);
    post(pending.slice(Math.max(0, end - windowSize), end));
  }
  assert.deepEqual(visible(), [], 'no pending message is due during ingestion');
  timers.advance(pending[overflow - 1].timestampMs + delayMs - timers.now);
  assert.deepEqual(visible(), [], 'the first five pending messages were dropped');
  // Each due-time group is smaller than the visible window, so none can skip a retained row.
  for (const end of batchEnds) {
    timers.advance(pending[end - 1].timestampMs + delayMs - timers.now);
    const expected = pending.slice(Math.max(overflow, end - windowSize), end);
    const displayed = visible();
    assert.equal(displayed[0], expected[0].id, `oldest retained row at reveal group ending at ${end}`);
    assert.deepEqual(displayed, ids(expected), `all retained rows show in order through row ${end}`);
  }
});

test('a new live transport session discards old chat before its first post', async t => {
  const {timers, authorize, session, post, visible} = await livePlayer(t);
  const previous = session();
  post([message('old-visible', timers.now - delayMs), message('old-pending', timers.now)]);
  assert.deepEqual(visible(), ['old-visible']);

  authorize();
  assert.notEqual(session(), previous, 'reauthorizing starts a new transport session');
  const afterRestart = visible();
  post([message('late-stale-post', timers.now - delayMs)], {sessionId: previous});
  assert.deepEqual(visible(), afterRestart, 'a stale post cannot change the new session');
  timers.advance(delayMs);
  const afterOldDeadline = visible();

  post([message('current-session', timers.now - delayMs)]);
  const afterCurrentPost = visible();
  assert.deepEqual([afterRestart, afterOldDeadline, afterCurrentPost], [[], [], ['current-session']],
    'the replacement session drops old visible and pending chat and accepts its own messages');
});

test('turning chat off clears both visible and pending rows before reconnecting', async t => {
  const {shim, timers, connect, post, visible} = await livePlayer(t);
  post([message('old-visible', timers.now - delayMs), message('old-pending', timers.now)]);
  assert.deepEqual(visible(), ['old-visible']);
  shim.sidebar.send('chat-off', {});
  assert.deepEqual(visible(), []);

  connect();
  post([message('after-reconnect', timers.now - delayMs)]);
  timers.advance(delayMs);
  assert.deepEqual(visible(), ['after-reconnect'], 'chat off canceled the old pending reveal');
});
