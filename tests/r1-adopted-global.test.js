'use strict';
// v0.5.5 review r1 #5 (#56): windows IINA opened itself ("adopted" windows) reach global with IINA's own
// core label, a bare number such as "0" (PlayerCore.swift label, JavascriptPluginInstance.swift L175-182 in
// IINA v1.5.1). Global must answer their auth and open requests at that string label
// (JavascriptAPIGlobal.swift L105-111 looks a string target up in PlayerCore.playerCores), with the same
// session, audience and credential fences as the players global created itself.
const test = require('node:test');
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const {join} = require('node:path');
const {format} = require('node:util');
const {createIina} = require('./support/iina-shim.js');
const {routeLiveCheck, settleOpens} = require('./support/live-check.js');

const SCRIPT = join(__dirname, '../global.js');
const requireFromGlobal = createRequire(SCRIPT);
const CLIENT_ID = 'c'.repeat(30);
const TOKEN = 'saved-adopted-test-token';
const REFRESH = 'saved-adopted-refresh-token';
const SAVED_LOGIN = JSON.stringify({clientID: CLIENT_ID, access_token: TOKEN, refresh_token: REFRESH});
const VALIDATED = {statusCode: 200, data: {client_id: CLIENT_ID, login: 'reader', scopes: ['chat:read'], expires_in: 5000}};

function load(overrides = {}) {
  const config = {identifier: 'local.iina.streams.adopted-test', variant: 'unified', ...overrides.config};
  const shim = createIina({role: 'global', identifier: config.identifier});
  if (overrides.savedLogin !== false) shim.keychain.seed('twitch-readonly', 'oauth', SAVED_LOGIN);
  shim.http.setResponse(VALIDATED);
  const {TwitchAuth} = requireFromGlobal('./src/auth.js');
  let auth;
  class CapturedAuth extends TwitchAuth {
    constructor(options) { super(options); auth = this; }
  }
  // #67: a channel open first checks the channel; the check is answered live outside shim.http.
  routeLiveCheck(shim);
  shim.runScript(SCRIPT, {
    require(name) {
      if (name === './config.js') return config;
      if (name === './src/twitch-app.js') return {clientID: ''};
      if (name === './src/auth.js') return {TwitchAuth: CapturedAuth};
      return requireFromGlobal(name);
    }
  });
  const posts = shim.global.posts;
  return {
    shim, config, posts, auth: () => auth,
    send: (name, data, label) => shim.global.send(name, data, label),
    flush: () => shim.timers.flush(0),
    to: target => posts.filter(post => post.target === target),
    names: target => posts.filter(post => post.target === target).map(post => post.name),
    managedLabel: id => id + '-' + config.identifier,
    async openManaged(input) {
      shim.menu.items[0].action();
      shim.standaloneWindow.send('open-stream', {input});
      await settleOpens();
      return shim.global.opens.length;
    }
  };
}

test('an adopted window with a saved login gets auth-state, then auth-ready, at its string label', async () => {
  const r = load();
  await r.send('auth-connect', {}, '0');
  assert.equal(r.posts.length, 0, 'nothing is posted while the child call is on the stack');
  r.flush();
  assert.ok(r.posts.length > 0);
  assert.ok(r.posts.every(post => post.target === '0'), 'every reply goes to the string label "0"');
  const names = r.names('0');
  const firstState = names.indexOf('auth-state'), ready = names.indexOf('auth-ready');
  assert.ok(firstState >= 0 && ready > firstState, 'auth-state precedes auth-ready: ' + names.join(','));
  assert.equal(names.filter(name => name === 'auth-ready').length, 1);
  const readyPost = r.to('0').find(post => post.name === 'auth-ready');
  assert.deepEqual(JSON.parse(readyPost.data), {token: TOKEN, login: 'reader', clientID: CLIENT_ID});
  assert.equal(typeof readyPost.data, 'string', 'the payload is a JSON string, as for managed players');
});

test('a second adopted connect while signed in gets auth-state then auth-ready immediately', async () => {
  const r = load();
  await r.send('auth-connect', {}, '0');
  r.flush();
  r.posts.length = 0;
  await r.send('auth-connect', {}, '3');
  r.flush();
  assert.deepEqual(r.posts.map(post => [post.target, post.name]), [['3', 'auth-state'], ['3', 'auth-ready']]);
});

test('auth-ready never reaches an adopted label that did not connect', async () => {
  const r = load();
  r.send('auth-probe', {}, '2');
  await r.send('auth-connect', {}, '0');
  r.flush();
  assert.equal(r.names('2').includes('auth-ready'), false);
  assert.equal(r.names('2').includes('auth-state'), false);
  assert.deepEqual(r.names('2'), ['auth-status'], 'the probe is answered, nothing else');
});

test('auth-ready queued for an earlier session of an adopted label is dropped', async () => {
  const r = load();
  await r.send('auth-connect', {}, '0');
  // Session 1's replies are queued. Disconnect and reconnect before they are delivered.
  r.send('auth-disconnect', {}, '0');
  await r.send('auth-connect', {}, '0');
  r.flush();
  assert.equal(r.names('0').filter(name => name === 'auth-ready').length, 1, 'only the current session is answered');
});

test('auth-ready stops reaching an adopted label after it disconnects', async () => {
  const r = load();
  await r.send('auth-connect', {}, '0');
  r.flush();
  r.send('auth-disconnect', {}, '0');
  r.flush();
  r.posts.length = 0;
  assert.equal(r.auth().snapshot().phase, 'off', 'the last listener leaving stops auth');
  await r.auth().connect(CLIENT_ID);
  r.flush();
  assert.equal(r.to('0').length, 0);
});

test('player-closed clears an adopted label, and a reconnect from the reused core starts a new session', async () => {
  const r = load();
  await r.send('auth-connect', {}, '4');
  // Replies for the first session are queued; IINA reuses the idle core, which then connects again.
  r.send('player-closed', {}, '4');
  assert.equal(r.auth().snapshot().phase, 'off', 'the closed label was the only listener');
  r.flush();
  assert.equal(r.to('4').length, 0, 'nothing reaches a closed label');
  await r.send('auth-connect', {}, '4');
  r.send('player-closed', {}, '4');
  await r.send('auth-connect', {}, '4');
  r.flush();
  const names = r.names('4');
  assert.equal(names.filter(name => name === 'auth-ready').length, 1, 'stale sessions are dropped: ' + names.join(','));
  assert.ok(names.indexOf('auth-state') < names.indexOf('auth-ready'));
});

test('a reply queued before player-closed does not reach the reused core that probes again', () => {
  const r = load();
  r.send('auth-probe', {}, '5');
  r.send('player-closed', {}, '5');
  r.send('auth-probe', {}, '5');
  r.send('open', {input: 'https://twitch.tv.evil.example/channel'}, '9');
  r.send('player-closed', {}, '9');
  r.send('open', {input: 'https://twitch.tv.evil.example/channel'}, '9');
  r.flush();
  assert.deepEqual(r.names('5'), ['auth-status'], 'only the probe after the reuse is answered');
  assert.deepEqual(r.names('9'), ['open-error'], 'only the open after the reuse is answered');
});

test('auth-probe answers an adopted label at its string label', async () => {
  const saved = load();
  saved.send('auth-probe', {}, '5');
  saved.flush();
  assert.deepEqual(saved.to('5').map(post => [post.name, JSON.parse(post.data)]), [['auth-status', {saved: true}]]);
  const none = load({savedLogin: false});
  none.send('auth-probe', {}, '5');
  none.flush();
  assert.deepEqual(none.to('5').map(post => [post.name, JSON.parse(post.data)]), [['auth-status', {saved: false}]]);
  const ready = load();
  await ready.send('auth-connect', {}, '6');
  ready.flush();
  ready.posts.length = 0;
  ready.send('auth-probe', {}, '5');
  ready.flush();
  assert.deepEqual(ready.to('5').map(post => [post.name, JSON.parse(post.data)]),
    [['auth-status', {saved: true, login: 'reader'}]]);
});

test('auth-disconnect from one adopted label keeps another listener signed in', async () => {
  const r = load();
  await r.send('auth-connect', {}, '0');
  await r.send('auth-connect', {}, '1');
  r.flush();
  r.send('auth-disconnect', {}, '0');
  assert.equal(r.auth().snapshot().phase, 'ready');
  r.posts.length = 0;
  r.auth().publish('ready', '', {login: 'reader'});
  r.flush();
  assert.deepEqual(r.posts.map(post => [post.target, post.name]), [['1', 'auth-state']]);
});

test('auth-forget from an adopted label signs out and answers that label', async () => {
  const r = load();
  await r.send('auth-connect', {}, '7');
  r.flush();
  r.posts.length = 0;
  await r.send('auth-forget', {}, '7');
  r.flush();
  const {SIGNED_OUT} = requireFromGlobal('./src/auth.js');
  assert.equal(r.shim.keychain.writes.at(-1).value, SIGNED_OUT);
  assert.ok(r.posts.every(post => post.target === '7'));
  // forget() stops auth before the audience is cleared, so auth-stop arrives first, as for a managed player.
  const managed = load();
  await managed.openManaged('example');
  await managed.send('auth-connect', {}, managed.managedLabel(1));
  managed.flush();
  managed.posts.length = 0;
  await managed.send('auth-forget', {}, managed.managedLabel(1));
  managed.flush();
  assert.deepEqual(r.names('7'), managed.names(1));
  assert.deepEqual(r.names('7'), ['auth-stop', 'auth-forgotten']);
});

test('invalid open input from an adopted label posts open-error to that label', async () => {
  const r = load();
  r.send('open', {input: 'https://twitch.tv.evil.example/channel'}, '8');
  assert.equal(r.posts.length, 0);
  r.flush();
  assert.deepEqual(r.posts.map(post => [post.target, post.name, post.data]), [['8', 'open-error', '{}']]);
  assert.equal(r.shim.global.opens.length, 0);
  r.send('open', {input: 'somechannel'}, '8');
  await settleOpens();
  assert.equal(r.shim.global.opens.length, 1, 'valid input from an adopted window opens a managed player');
});

test('labels that are neither a bare number nor a managed player are ignored', async () => {
  const r = load();
  await r.openManaged('example');
  const rejected = [null, undefined, 0, 1, {}, '', ' 1', '1 ', '-1', '1-', '1.0', '1e3', '0x1', 'abc', '1234567890',
    '1-other-plugin', '2-' + r.config.identifier, '01-' + r.config.identifier, '0-' + r.config.identifier];
  const timersBefore = r.shim.timers.all.length;
  for (const label of rejected) {
    await r.send('auth-connect', {clientID: CLIENT_ID}, label);
    r.send('auth-probe', {}, label);
    r.send('auth-disconnect', {}, label);
    await r.send('auth-forget', {}, label);
    r.send('player-closed', {}, label);
    r.send('open', {input: 'https://twitch.tv.evil.example/channel'}, label);
  }
  r.flush();
  assert.equal(r.posts.length, 0);
  assert.equal(r.shim.http.calls.length, 0);
  assert.equal(r.shim.keychain.reads.length, 0);
  assert.equal(r.shim.keychain.writes.length, 0);
  assert.equal(r.shim.timers.all.length, timersBefore);
  assert.equal(r.auth().snapshot().phase, 'off');
});

test('a bare-number label and a managed id with the same number stay separate', async () => {
  const r = load();
  await r.openManaged('example');
  await r.send('auth-connect', {}, '1');
  r.flush();
  assert.ok(r.to('1').length > 0);
  assert.equal(r.to(1).length, 0, 'the adopted label "1" is not managed player 1');
  r.send('player-closed', {}, r.managedLabel(1));
  assert.equal(r.auth().snapshot().phase, 'ready', 'closing managed player 1 leaves adopted "1" listening');
  r.posts.length = 0;
  await r.send('auth-connect', {}, r.managedLabel(1));
  r.flush();
  assert.equal(r.posts.length, 0, 'managed player 1 is closed; the adopted label does not revive it');
  await r.openManaged('second');
  await r.send('auth-connect', {}, r.managedLabel(2));
  r.send('player-closed', {}, '1');
  r.flush();
  assert.deepEqual(r.names(2), ['auth-state', 'auth-ready']);
  assert.equal(r.auth().snapshot().phase, 'ready', 'closing adopted "1" leaves managed player 2 listening');
});

test('managed players are still answered at their numeric id', async () => {
  const r = load();
  await r.openManaged('example');
  await r.send('auth-connect', {}, r.managedLabel(1));
  r.flush();
  assert.ok(r.posts.length > 0);
  assert.ok(r.posts.every(post => post.target === 1));
  assert.ok(r.names(1).indexOf('auth-state') < r.names(1).indexOf('auth-ready'));
  r.posts.length = 0;
  r.send('open', {input: 'https://twitch.tv.evil.example/channel'}, r.managedLabel(1));
  r.flush();
  assert.deepEqual(r.posts.map(post => [post.target, post.name]), [[1, 'open-error']]);
});

test('loading global schedules only the deferred menu refresh', () => {
  const r = load({savedLogin: false});
  assert.equal(r.shim.menu.forceUpdates, 0, 'the menu is not refreshed while the initializer runs');
  assert.equal(r.shim.timers.all.length, 1);
  assert.equal(r.shim.timers.all[0].delay, 0);
  r.flush();
  assert.equal(r.shim.menu.forceUpdates, 1);
  assert.equal(r.posts.length, 0);
  assert.equal(r.shim.http.calls.length, 0);
  assert.equal(r.shim.keychain.reads.length, 0);
  assert.equal(r.shim.file.writes.length, 0);
});

test('no token reaches a log, a diagnostic file or a trace during adopted sign-in', async () => {
  const r = load({config: {beta: true, qa: true}});
  await r.send('auth-connect', {}, '0');
  r.flush();
  r.send('auth-probe', {}, '0');
  r.send('open', {input: 'bad input ::'}, '0');
  r.flush();
  r.send('auth-disconnect', {}, '0');
  await r.send('auth-connect', {}, '0');
  r.flush();
  await r.send('auth-forget', {}, '0');
  r.send('player-closed', {}, '0');
  r.flush();
  assert.equal(r.names('0').filter(name => name === 'auth-ready').length, 2, 'the token was delivered twice');
  assert.ok(r.shim.file.writes.length > 0, 'diagnostics were written, so the check is not vacuous');
  const logged = [
    ...r.shim.file.writes.map(write => write.content),
    ...r.shim.console.logs.map(args => format(...args)),
    ...r.shim.console.errors.map(args => format(...args))
  ];
  for (const secret of [TOKEN, REFRESH]) {
    assert.equal(logged.some(text => text.includes(secret)), false, 'a secret reached a log');
  }
});
