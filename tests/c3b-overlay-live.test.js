'use strict';

// C3b bridge: live-messages carries {session, messages, removed, clearedAll}.
// messages is the newest 150 in arrival order; removed lists IDs deleted by this batch's
// clear-message or clear-user events, and clearedAll flags a clear-all in this batch.
// Ordinary window rollover is not a deletion. Batches enter through a synthetic IRC client.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {join} = require('node:path');
const {createWebViewIina} = require('./support/iina-shim.js');

const channel = 'fixture_c3b_live';
const session = 12;
const ids = rows => rows.map(row => row.id);

function message(id, author = 'viewer') {
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
  page.receiveEnvelope('live-config', {session, channel, login: 'reader', token: 'fake_c3b_credential'});
  assert.equal(typeof onBatch, 'function', 'overlay starts the synthetic IRC client');

  return function postBatch(events) {
    const before = page.messages('live-messages').length;
    onBatch(events);
    const posts = page.messages('live-messages');
    assert.equal(posts.length, before + 1, 'one bridge post per IRC batch');
    assert.equal(posts.at(-1).data.session, session);
    return posts.at(-1).data;
  };
}

test('overlay posts only the newest 150 without reporting rollover as moderation', () => {
  const post = overlayFixture();
  const arrivals = Array.from({length: 151}, (_, i) => message(`row-${i + 1}`));
  post(arrivals.slice(0, 100));
  const rollover = post(arrivals.slice(100));
  assert.deepEqual(ids(rollover.messages), ids(arrivals.slice(1)), 'the oldest row rolls out of the bridge window');
  assert.deepEqual(
    {removed: rollover.removed, clearedAll: rollover.clearedAll},
    {removed: [], clearedAll: false},
    'normal rollover sends an empty moderation delta',
  );
});

test('overlay reports the IDs removed by clear-message and clear-user only in that batch', () => {
  const post = overlayFixture();
  post([message('single'), message('user-first', 'target'), message('keep'), message('user-second', 'target')]);
  const moderated = post([
    {type: 'clear-message', channel, id: 'single'},
    {type: 'clear-user', channel, userId: 'target'},
    message('after'),
  ]);
  const later = post([message('later')]);
  assert.deepEqual(ids(moderated.messages), ['keep', 'after'], 'the snapshot still reflects the reducer');
  assert.deepEqual(ids(later.messages), ['keep', 'after', 'later']);
  assert.deepEqual(moderated.removed?.slice().sort(), ['single', 'user-first', 'user-second'],
    'the bridge names the single deleted row and both rows by the timed-out user');
  assert.equal(moderated.clearedAll, false);
  assert.deepEqual(later.removed, [], 'later posts do not repeat the deletion delta');
});

test('overlay flags clear-all and still posts chat received after the clear', () => {
  const post = overlayFixture();
  post([message('old')]);
  const cleared = post([
    message('before-clear'),
    {type: 'clear-all', channel},
    message('after-clear'),
  ]);
  const later = post([message('later')]);
  assert.deepEqual(ids(cleared.messages), ['after-clear']);
  assert.deepEqual(ids(later.messages), ['after-clear', 'later']);
  assert.equal(cleared.clearedAll, true, 'the player needs an explicit signal to discard its longer history');
  assert.equal(later.clearedAll, false, 'the flag applies to one batch only');
});
