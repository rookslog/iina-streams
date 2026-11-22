'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Sources = require('../src/source.js');
const {createIina} = require('./support/iina-shim.js');

const config = {identifier: 'local.iina.streams.open-test', variant: 'unified'};
const streamURL = 'https://www.twitch.tv/xqc';

function loadGlobal(options = {}) {
  const shim = createIina({role: 'global', identifier: config.identifier, ...options});
  const modules = new Map([
    ['./config.js', config],
    ['./src/source.js', Sources],
    ['./src/auth.js', require('../src/auth.js')],
    ['./src/timers.js', require('../src/timers.js')],
    ['./src/twitch-app.js', {clientID: ''}],
    ['./src/twitch-vods.js', require('../src/twitch-vods.js')],
    ['./src/bridge.js', require('../src/bridge.js')]
  ]);
  const context = shim.runScript(path.join(__dirname, '../global.js'), {
    require(name) {
      if (!modules.has(name)) throw new Error('Unexpected module ' + name);
      return modules.get(name);
    }
  });
  const menuItem = shim.menu.items.find(item => item.keyBinding === 'Ctrl+Meta+o');
  return {shim, context, menuItem};
}

function assertStandaloneOpened(shim) {
  const loaded = shim.standaloneWindow.loads.map(file => path.posix.normalize(file));
  assert.ok(loaded.includes('ui/open.html'), 'the standalone window should load ui/open.html');
  assert.equal(shim.standaloneWindow.visible, true, 'the standalone window should open');
}

function assertNoModal(shim) {
  assert.equal(shim.utils.prompts.length, 0, 'the route must not call utils.prompt');
  assert.equal(shim.utils.asks.length, 0, 'the route must not call utils.ask');
}

function assertOpenedStream(shim, previousCount, reason) {
  assert.equal(shim.global.opens.length, previousCount + 1, reason);
  const opened = shim.global.opens.at(-1);
  assert.equal(opened.url, streamURL);
  assert.equal(opened.label, Sources.label(Sources.parse('xqc'), config.variant));
}

test('A1.1 openStream and the shortcut open a standalone window without a modal', async () => {
  const direct = loadGlobal({rejectModalDialogs: true});
  await direct.context.openStream();
  assertStandaloneOpened(direct.shim);
  assertNoModal(direct.shim);

  const shortcut = loadGlobal({rejectModalDialogs: true});
  assert.ok(shortcut.menuItem, 'the Ctrl+Meta+o menu action should be registered');
  await shortcut.menuItem.action();
  assertStandaloneOpened(shortcut.shim);
  assertNoModal(shortcut.shim);
});

test('A1.2 standalone submission opens valid streams, rejects invalid input, and ignores blanks', async () => {
  const valid = loadGlobal();
  await valid.menuItem.action();
  await valid.shim.standaloneWindow.receive('open-stream', {input: 'xqc'});
  valid.shim.timers.flush(0);
  assertOpenedStream(valid.shim, 0, 'a valid open-stream submission should create one managed player');
  assert.ok(valid.shim.log.some(call => call.api === 'standaloneWindow.close'), 'valid input closes the window');
  assert.equal(valid.shim.standaloneWindow.visible, false);
  assertNoModal(valid.shim);

  const invalid = loadGlobal();
  await invalid.menuItem.action();
  assertStandaloneOpened(invalid.shim);
  await invalid.shim.standaloneWindow.receive('open-stream', {input: 'not a stream'});
  invalid.shim.timers.flush(0);
  assert.equal(invalid.shim.global.opens.length, 0, 'invalid input must not create a player');
  assert.equal(invalid.shim.standaloneWindow.messages('open-error').length, 1);
  assert.equal(invalid.shim.standaloneWindow.visible, true, 'invalid input must leave the window open');
  assertNoModal(invalid.shim);

  const blank = loadGlobal();
  await blank.menuItem.action();
  assertStandaloneOpened(blank.shim);
  const replies = blank.shim.standaloneWindow.posts.length;
  await blank.shim.standaloneWindow.receive('open-stream', {input: '  '});
  blank.shim.timers.flush(0);
  assert.equal(blank.shim.global.opens.length, 0, 'blank input must not create a player');
  assert.equal(blank.shim.standaloneWindow.posts.length, replies, 'blank input must not send a reply');
  assert.equal(blank.shim.standaloneWindow.visible, true, 'blank input must leave the window open');
  assertNoModal(blank.shim);
});

test('A1.3 player open messages route input and errors, and legacy requests open the standalone window', async () => {
  const {shim, context} = loadGlobal();
  await context.openStream('firstchannel');
  await context.openStream('secondchannel');
  const sender = '2-' + config.identifier;
  const initialPlayers = shim.global.opens.length;
  assert.equal(initialPlayers, 2, 'fixture must have the sender and a second player');

  await shim.global.send('open', {input: 'xqc'}, sender);
  shim.timers.flush(0);
  assertOpenedStream(shim, initialPlayers, 'the player open handler should use the supplied input');
  assert.equal(shim.global.messages('open-error').length, 0);

  await shim.global.send('open', {input: 'not a stream'}, sender);
  shim.timers.flush(0);
  assert.equal(shim.global.opens.length, initialPlayers + 1, 'invalid input must not create another player');
  // The native bridge may address the same child by its numeric ID or its internal label.
  const targets = shim.global.messages('open-error').map(({target}) => target === 2 ? sender : target);
  assert.deepEqual(targets, [sender], 'only the submitting player should receive open-error');
  assert.equal(shim.standaloneWindow.posts.length, 0, 'player errors must not go to the standalone window');
  assert.equal(shim.standaloneWindow.visible, false, 'submitting sidebar input should not open a separate window');
  assertNoModal(shim);

  const legacy = loadGlobal({rejectModalDialogs: true});
  await legacy.context.openStream('firstchannel');
  await legacy.shim.global.send('open', {}, '1-' + config.identifier);
  legacy.shim.timers.flush(0);
  assertStandaloneOpened(legacy.shim);
  assert.equal(legacy.shim.global.opens.length, 1, 'a request without input only opens the standalone window');
  assertNoModal(legacy.shim);
});
