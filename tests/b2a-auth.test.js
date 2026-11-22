'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {TwitchAuth, SIGNED_OUT} = require('../src/auth.js');
const {createFakeTimers} = require('./support/iina-shim.js');

const CLIENT_ID = 'a'.repeat(30);
const CORRUPT_GRANT = '{not json';

function makeAuth(saved) {
  const requests = [], writes = [], diagnostics = [];
  const timers = createFakeTimers();
  const auth = new TwitchAuth({
    request: async (path, method, form) => {
      requests.push({path, method, form});
      if (path !== '/device') return {status: 400, data: {}};
      return {status: 200, data: {
        device_code: 'fake-device-code', user_code: 'ABCD', verification_uri: 'https://www.twitch.tv/activate'
      }};
    },
    read: () => saved,
    write: value => { writes.push(value); return true; },
    diagnostic: (...args) => diagnostics.push(args),
    setTimer: timers.setTimeout,
    clearTimer: timers.clearTimeout,
    now: () => timers.now,
    onState: () => {},
    onReady: () => {}
  });
  return {auth, requests, writes, diagnostics};
}

test('B2a auth connect reports an unreadable grant once and starts device sign-in without a write', async () => {
  const {auth, requests, writes, diagnostics} = makeAuth(CORRUPT_GRANT);
  assert.equal(await auth.connect(CLIENT_ID), true);
  assert.equal(auth.snapshot().phase, 'waiting');
  assert.deepEqual(requests, [{path: '/device', method: 'POST', form: {client_id: CLIENT_ID, scopes: 'chat:read'}}]);
  assert.equal(writes.length, 0, 'device sign-in must not replace the item before a new grant is saved');
  assert.deepEqual(diagnostics, [['keychain-unreadable']], 'connect must emit the code once, without raw text');
});

test('B2a auth forget reports an unreadable grant once and leaves revocation unconfirmed', async () => {
  const {auth, requests, writes, diagnostics} = makeAuth(CORRUPT_GRANT);
  assert.deepEqual(await auth.forget(), {removed: true, revoked: false, stale: false});
  assert.equal(auth.snapshot().phase, 'off');
  assert.match(auth.snapshot().message, /revocation.*could not be confirmed/i);
  assert.deepEqual(requests, []);
  assert.deepEqual(writes, [SIGNED_OUT], 'explicit Forget still clears the saved item');
  assert.deepEqual(diagnostics, [['keychain-unreadable']], 'forget must emit the code once, without raw text');
});

test('B2a auth does not report empty or missing grants as unreadable', async () => {
  for (const absent of ['', null]) {
    const connecting = makeAuth(absent);
    assert.equal(await connecting.auth.connect(CLIENT_ID), true);
    assert.equal(connecting.auth.snapshot().phase, 'waiting');
    assert.deepEqual(connecting.diagnostics, [], `connect with ${JSON.stringify(absent)}`);

    const forgetting = makeAuth(absent);
    assert.deepEqual(await forgetting.auth.forget(), {removed: true, revoked: true, stale: false});
    assert.deepEqual(forgetting.diagnostics, [], `forget with ${JSON.stringify(absent)}`);
  }
});
