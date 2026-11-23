'use strict';
// v0.5.5 review r2 #4 (global part): an unrelated label's disconnect must not stop the broker or register
// itself, and a sign-out reply is fenced to the requester's own session, not to whichever label retires.
const test = require('node:test');
const assert = require('node:assert/strict');
const {createBridge, IDENTIFIER} = require('./support/auth-bridge.js');

const REQUESTER = '1-' + IDENTIFIER;
const BYSTANDER = '77';

async function signedIn(options) {
  const bridge = await createBridge(options);
  await bridge.settle();
  await bridge.click('connect', {clientID: ''});
  await bridge.approve();
  assert.equal(bridge.player.snapshot().auth.phase, 'ready', 'precondition: signed in');
  const posts = [];
  bridge.global.global.onPost = post => posts.push(post);
  const send = (name, data, label) => bridge.global.global.listeners.get(name)(data, label);
  return {bridge, posts, send};
}

const forgotten = posts => posts.filter(post => post.name === 'auth-forgotten');
const flush = async bridge => {
  for (let round = 0; round < 5; round++) {
    await new Promise(resolve => setImmediate(resolve));
    bridge.global.timers.flush(0);
  }
};

test('a failed revoke still reaches the requester when an unrelated label disconnects meanwhile', async () => {
  const {bridge, posts, send} = await signedIn({revokeStatus: 503});
  const pending = send('auth-forget', {}, REQUESTER);
  await send('auth-disconnect', {}, BYSTANDER);
  await pending;
  await flush(bridge);
  const replies = forgotten(posts);
  assert.equal(replies.length, 1, 'the requester gets auth-forgotten');
  assert.equal(replies[0].target, 1);
  assert.equal((typeof replies[0].data === 'string' ? JSON.parse(replies[0].data) : replies[0].data).revoked, false, 'the failed revocation is reported');
  bridge.close();
});

test('a successful revoke is not made stale by an unrelated label disconnecting meanwhile', async () => {
  const {bridge, posts, send} = await signedIn();
  const pending = send('auth-forget', {}, REQUESTER);
  await send('auth-disconnect', {}, BYSTANDER);
  await pending;
  await flush(bridge);
  const replies = forgotten(posts);
  assert.equal(replies.length, 1, 'auth.stop() from the bystander would have made the result stale');
  assert.equal((typeof replies[0].data === 'string' ? JSON.parse(replies[0].data) : replies[0].data).revoked, true);
  assert.equal(bridge.revokes.length, 1);
  bridge.close();
});

test('control: an unrelated disconnect leaves a signed-in session running', async () => {
  const {bridge, send} = await signedIn();
  await send('auth-disconnect', {}, BYSTANDER);
  await flush(bridge);
  assert.equal(bridge.player.snapshot().auth.phase, 'ready', 'the member still holds its session');
  bridge.close();
});

// A broker stub whose forget() settles on demand with a result that is NOT stale. With the real broker, every
// path that changes the requester's session also stops auth, which already makes the result stale, so the
// session fence is only reachable through a result that arrives fresh (a stop landing after it settled).
function stubbedGlobal() {
  const path = require('node:path');
  const {createIina} = require('./support/iina-shim.js');
  const script = path.join(__dirname, '..', 'global.js');
  const shim = createIina({role: 'global', identifier: IDENTIFIER});
  let settle;
  class StubAuth {
    snapshot() { return {phase: 'off'}; }
    stop() {}
    forget() { return new Promise(resolve => { settle = resolve; }); }
  }
  shim.runScript(script, {
    require: name => {
      if (name === './config.js') return {identifier: IDENTIFIER, variant: 'unified', qa: false};
      if (name === './src/auth.js') return {TwitchAuth: StubAuth};
      return require(path.join(__dirname, '..', name));
    }
  });
  const posts = [];
  shim.global.onPost = post => posts.push(post);
  const send = (name, data, label) => shim.global.listeners.get(name)(data, label);
  return {shim, posts, send, settle: result => settle(result)};
}

test('the sign-out reply is dropped when the requester label retired and returned during the revoke', async () => {
  const {shim, posts, send, settle} = stubbedGlobal();
  const requester = '5';
  const pending = send('auth-forget', {}, requester);
  await send('player-closed', {}, requester);
  await send('auth-probe', {}, requester); // a successor controller takes the same label
  settle({removed: true, revoked: false, stale: false});
  await pending;
  shim.timers.flush(0);
  assert.equal(forgotten(posts).length, 0, 'the old request does not answer the successor');
});

test('control: the same stubbed flow delivers the reply when the requester stays current', async () => {
  const {shim, posts, send, settle} = stubbedGlobal();
  const pending = send('auth-forget', {}, '5');
  settle({removed: true, revoked: false, stale: false});
  await pending;
  shim.timers.flush(0);
  assert.equal(forgotten(posts).length, 1);
});
