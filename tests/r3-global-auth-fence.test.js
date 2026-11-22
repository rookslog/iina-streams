'use strict';
// v0.5.5 review r3 #3 (global part): a controller retiring from a core label advances that label's session
// even when the label already left the audience (forget clears it), and a close of a label that was not an
// audience member never stops the broker.
const test = require('node:test');
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const {join} = require('node:path');
const {createIina} = require('./support/iina-shim.js');

const SCRIPT = join(__dirname, '../global.js');
const requireFromGlobal = createRequire(SCRIPT);
const CLIENT_ID = 'c'.repeat(30);
const SAVED_LOGIN = JSON.stringify({clientID: CLIENT_ID, access_token: 'r3-fake-token-0123456789', refresh_token: 'r3-fake-refresh'});

function load() {
  const config = {identifier: 'local.iina.streams.r3-test', variant: 'unified'};
  const shim = createIina({role: 'global', identifier: config.identifier});
  shim.keychain.seed('twitch-readonly', 'oauth', SAVED_LOGIN);
  shim.http.setResponse({statusCode: 200, data: {client_id: CLIENT_ID, login: 'reader', scopes: ['chat:read'], expires_in: 5000}});
  // Deferred revoke: the POST to /revoke waits until the test settles it, and fails.
  let settleRevoke;
  shim.iina.http.post = (url) => {
    shim.http.calls.push({method: 'POST', url});
    return new Promise(resolve => { settleRevoke = () => resolve({statusCode: 500, data: {}}); });
  };
  shim.runScript(SCRIPT, {
    require(name) {
      if (name === './config.js') return config;
      if (name === './src/twitch-app.js') return {clientID: ''};
      return requireFromGlobal(name);
    }
  });
  return {
    shim,
    send: (name, data, label) => shim.global.send(name, data, label),
    flush: () => shim.timers.flush(0),
    settle: () => settleRevoke(),
    to: target => shim.global.posts.filter(post => post.target === target),
    names: target => shim.global.posts.filter(post => post.target === target).map(post => post.name),
  };
}

test('retire and re-probe of the requester label does not deliver the old auth-forgotten', async () => {
  const r = load();
  await r.send('auth-connect', {}, '0');
  r.flush();
  const forgetting = r.send('auth-forget', {}, '0');
  await new Promise(resolve => setImmediate(resolve));
  r.send('auth-disconnect', {retire: true}, '0');
  r.send('auth-probe', {}, '0');
  r.settle();
  await forgetting;
  r.flush();
  assert.equal(r.names('0').includes('auth-forgotten'), false, r.names('0').join(','));
  assert.ok(r.names('0').includes('auth-status'), 'the successor probe is still answered');
});

test('a plain disconnect by a non-member does not advance the requester session', async () => {
  const r = load();
  await r.send('auth-connect', {}, '0');
  r.flush();
  const forgetting = r.send('auth-forget', {}, '0');
  await new Promise(resolve => setImmediate(resolve));
  r.send('auth-disconnect', {}, '0');
  r.settle();
  await forgetting;
  r.flush();
  assert.ok(r.names('0').includes('auth-forgotten'), r.names('0').join(','));
});

test('closing a label that took no part does not suppress the requester auth-forgotten', async () => {
  const r = load();
  await r.send('auth-connect', {}, '0');
  r.flush();
  const forgetting = r.send('auth-forget', {}, '0');
  await new Promise(resolve => setImmediate(resolve));
  r.send('player-closed', {}, '5');
  r.settle();
  await forgetting;
  r.flush();
  const reply = r.to('0').find(post => post.name === 'auth-forgotten');
  assert.ok(reply, r.names('0').join(','));
  assert.equal(JSON.parse(reply.data).revoked, false, 'the failure is reported');
});

test('retire from a label global never saw registers nothing', async () => {
  const r = load();
  r.send('auth-disconnect', {retire: true}, '9');
  r.shim.timers.flushAll();
  assert.equal(r.shim.global.posts.length, 0);
  await r.send('auth-connect', {}, '9');
  r.flush();
  assert.ok(r.names('9').includes('auth-ready'), 'a later connect from that label works normally');
});

// The broker's held credentials show in a probe reply: {saved, login} while held, {saved} after auth.stop().
function probeLogin(r, label) {
  r.send('auth-probe', {}, label);
  r.flush();
  const reply = r.to(label).filter(post => post.name === 'auth-status').pop();
  return JSON.parse(reply.data).login;
}

test('the last audience member closing stops the broker', async () => {
  const r = load();
  await r.send('auth-connect', {}, '4');
  r.flush();
  assert.equal(probeLogin(r, '6'), 'reader', 'credentials are held while a member is connected');
  r.send('player-closed', {}, '4');
  assert.equal(probeLogin(r, '6'), undefined, 'the member closing stopped the broker');
});

test('closing a non-member does not stop the broker', async () => {
  const r = load();
  await r.send('auth-connect', {}, '4');
  r.flush();
  r.send('player-closed', {}, '5');
  assert.equal(probeLogin(r, '6'), 'reader');
});
