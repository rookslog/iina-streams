'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const {join} = require('node:path');
const {format} = require('node:util');
const {createIina} = require('./support/iina-shim.js');

const SCRIPT = join(__dirname, '../global.js');
const requireFromGlobal = createRequire(SCRIPT);
const CLIENT_FILE = '@data/twitch-client.json';
const DIAGNOSTIC_FILE = '@data/beta-global.json';
const BUILT_IN_CLIENT_ID = 'b'.repeat(30);
const TOKEN_PREFIX = 'abcd1234';
const CORRUPT_LOGIN = '{"access_token":"' + TOKEN_PREFIX.repeat(3);
const CLIENT_FILE_MARKER = 'fake-unreadable-client-file';
const CORRUPT_CLIENT = '{"clientID":"' + CLIENT_FILE_MARKER;

function setup() {
  const config = {identifier: 'local.iina.streams.dev', variant: 'unified', qa: true};
  const shim = createIina({role: 'global', identifier: config.identifier});
  shim.keychain.seed('twitch-readonly', 'oauth', CORRUPT_LOGIN);
  shim.file.seed(CLIENT_FILE, CORRUPT_CLIENT);
  shim.http.setResponse({statusCode: 200, data: {
    device_code: 'fake-device-code', user_code: 'ABCD', verification_uri: 'https://www.twitch.tv/activate'
  }});
  shim.runScript(SCRIPT, {
    require(name) {
      if (name === './config.js') return config;
      if (name === './src/twitch-app.js') return {clientID: BUILT_IN_CLIENT_ID};
      return requireFromGlobal(name);
    }
  });
  shim.menu.items[0].action();
  shim.standaloneWindow.send('open-stream', {input: 'example'});
  assert.equal(shim.global.opens.length, 1);
  return {shim, label: '1-' + config.identifier};
}

function diagnosticCodes(shim) {
  const entries = JSON.parse(shim.file.get(DIAGNOSTIC_FILE));
  return entries.filter(entry => entry.step === 'auth-diagnostic').map(entry => entry.code);
}

test('B2a global probe reports an unreadable saved login and still replies saved=false', () => {
  const {shim, label} = setup();
  shim.global.send('auth-probe', {}, label);
  shim.timers.flush();

  const replies = shim.global.messages('auth-status');
  assert.equal(replies.length, 1);
  assert.deepEqual(JSON.parse(replies[0].data), {saved: false});
  assert.equal(shim.http.calls.length, 0);
  assert.deepEqual(diagnosticCodes(shim), ['saved-login-unreadable'], 'probe must record the login parse failure');
});

test('B2a global connect records all parse failures and still signs in with the built-in client', async () => {
  const {shim, label} = setup();
  await shim.global.send('auth-connect', {}, label);
  shim.timers.flush();

  assert.deepEqual(shim.http.calls, [{
    method: 'POST', url: 'https://id.twitch.tv/oauth2/device',
    options: {headers: {}, data: {client_id: BUILT_IN_CLIENT_ID, scopes: 'chat:read'}}
  }]);
  const states = shim.global.messages('auth-state');
  assert.ok(states.length > 0, 'the managed child must receive auth state');
  assert.equal(JSON.parse(states.at(-1).data).phase, 'waiting');
  assert.equal(shim.keychain.writes.length, 0);
  assert.equal(shim.file.get(CLIENT_FILE), CORRUPT_CLIENT);
  assert.deepEqual(new Set(diagnosticCodes(shim)), new Set([
    'client-file-unreadable', 'saved-login-unreadable', 'keychain-unreadable'
  ]), 'connect must log both global parse failures and the auth diagnostic callback');
});

test('B2a global probe and connect do not copy fake credential or client-file text to logs', async () => {
  const {shim, label} = setup();
  shim.global.send('auth-probe', {}, label);
  await shim.global.send('auth-connect', {}, label);
  shim.timers.flush();

  assert.ok(shim.file.has(DIAGNOSTIC_FILE), 'QA mode must write the global diagnostic file');
  const fileWrites = shim.file.writes.map(write => write.content);
  const consoleLines = [...shim.console.logs, ...shim.console.errors].map(args => format(...args));
  for (const marker of [TOKEN_PREFIX, CLIENT_FILE_MARKER]) {
    assert.equal(fileWrites.some(text => text.includes(marker)), false, 'file writes must not expose raw input');
    assert.equal(consoleLines.some(line => line.includes(marker)), false, 'console must not expose raw input');
  }
});
