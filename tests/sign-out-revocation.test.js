'use strict';
// Sign out must revoke the grant it holds, or say that revocation could not be confirmed (#41).
// The whole path runs: sidebar message -> real player -> real global.js -> real TwitchAuth, with synthetic
// Twitch and Keychain (tests/support/auth-bridge.js). Release review finding 2.
const test = require('node:test');
const assert = require('node:assert/strict');
const {createBridge, ACCESS_TOKEN} = require('./support/auth-bridge.js');
const {SIGNED_OUT} = require('../src/auth.js');

const FIRST_SAVE_FAILS = call => call > 1;
const savedLogin = bridge => bridge.keychain.get('twitch-readonly', 'oauth');

async function signedIn(options) {
  const bridge = createBridge(options);
  await bridge.settle();
  await bridge.click('connect', {clientID: ''});
  await bridge.approve();
  assert.equal(bridge.chat().mode, 'live');
  assert.equal(bridge.player.snapshot().auth.phase, 'ready', 'precondition: the session is connected');
  return bridge;
}

test('Sign out revokes the grant that only this session holds after a failed Keychain save', async () => {
  // The reviewer's probe: one window, the first save fails, so the grant lives only in memory.
  const bridge = await signedIn({keychainWrites: FIRST_SAVE_FAILS});
  assert.equal(bridge.writeAttempts, 1, 'precondition: the login save was attempted and failed');
  assert.equal(savedLogin(bridge), undefined, 'precondition: nothing reached the Keychain');
  await bridge.click('forget-auth');
  assert.equal(bridge.revokes.length, 1, 'one /revoke request');
  assert.equal(bridge.revokes[0].token, ACCESS_TOKEN);
  assert.equal(bridge.chat().error, '', 'a 200 revocation reports no problem');
  assert.equal(savedLogin(bridge), SIGNED_OUT);
  bridge.close();
});

test('Sign out reports an unconfirmed revocation when Twitch refuses the request', async () => {
  const bridge = await signedIn({keychainWrites: FIRST_SAVE_FAILS, revokeStatus: 503});
  await bridge.click('forget-auth');
  assert.equal(bridge.revokes.length, 1);
  assert.match(bridge.chat().error, /revocation could not be confirmed/);
  bridge.close();
});

test('control: Sign out of a saved login revokes it once and overwrites the saved grant', async () => {
  const bridge = await signedIn();
  assert.match(savedLogin(bridge), /access_token/, 'precondition: the grant was saved');
  await bridge.click('forget-auth');
  assert.equal(bridge.revokes.length, 1);
  assert.equal(bridge.revokes[0].token, ACCESS_TOKEN);
  assert.equal(savedLogin(bridge), SIGNED_OUT);
  assert.equal(bridge.chat().error, '');
  bridge.close();
});

test('control: ordinary Chat Off neither revokes nor clears a saved login', async () => {
  const bridge = await signedIn();
  const saved = savedLogin(bridge);
  await bridge.click('chat-off');
  assert.equal(bridge.chat().mode, 'off');
  assert.equal(bridge.revokes.length, 0);
  assert.equal(savedLogin(bridge), saved, 'the saved login is untouched');
  assert.equal(bridge.writeAttempts, 1, 'Chat Off made no Keychain write');
  bridge.close();
});

test('Sign out after Chat Off cannot claim revocation for a grant that was never saved', async () => {
  // Chat Off drops the session-only grant (the Keychain save failed). Sign out then holds nothing to
  // revoke, so it must not report success.
  const bridge = await signedIn({keychainWrites: FIRST_SAVE_FAILS});
  await bridge.click('chat-off');
  await bridge.click('forget-auth');
  assert.equal(bridge.revokes.length, 0, 'no grant is left to send');
  assert.match(bridge.chat().error, /revocation could not be confirmed/);
  bridge.close();
});

test('control: Sign out with no login at all still reports success', async () => {
  const bridge = createBridge();
  await bridge.settle();
  await bridge.click('forget-auth');
  assert.equal(bridge.revokes.length, 0);
  assert.equal(bridge.chat().error, '');
  bridge.close();
});
