'use strict';
// Wires one real player (src/player.js) to the real global entry (global.js) and the real TwitchAuth
// broker, with synthetic Twitch HTTP and Keychain. Tests built on it exercise the whole sign-in or
// sign-out path instead of hand-issuing the broker messages a player is supposed to send (#41, #42).
//
// Message delivery follows IINA: a message posted while a JS call is on the stack is delivered later.
//   child -> global: queued in `inbox`, run by settle() one at a time, awaiting async handlers.
//   global -> child: global.js defers its own postMessage with a 0 ms timer; settle() flushes those.
// Nothing here contacts Twitch, reads the real Keychain or launches IINA.
const path = require('node:path');
const Sources = require('../../src/source.js');
const BuiltInApp = require('../../src/twitch-app.js');
const {TwitchAuth} = require('../../src/auth.js');
const {start} = require('../../src/player.js');
const {createIina} = require('./iina-shim.js');

const ROOT = path.join(__dirname, '..', '..');
const IDENTIFIER = 'local.iina.streams';
const LOGIN = 'testreader';
const ACCESS_TOKEN = 'a'.repeat(30);

function createBridge(options = {}) {
  const sourceURL = options.sourceURL || 'https://www.twitch.tv/test_channel';
  const keychainWrites = options.keychainWrites || (() => true); // (call number) => saved?
  const revokeStatus = options.revokeStatus === undefined ? 200 : options.revokeStatus;
  const bridge = {revokes: [], deviceRequests: 0, tokenRequests: 0, writeAttempts: 0, inbox: []};

  // ---- global entry, with the real broker ----
  const globalShim = createIina({role: 'global', identifier: IDENTIFIER});
  const originalWrite = globalShim.iina.utils.keychainWrite;
  globalShim.iina.utils.keychainWrite = (service, name, value) => {
    bridge.writeAttempts++;
    if (!keychainWrites(bridge.writeAttempts)) return false;
    return originalWrite(service, name, value);
  };
  const ok = data => ({statusCode: 200, data});
  const respond = async (url, httpOptions) => {
    if (url.endsWith('/device')) {
      bridge.deviceRequests++;
      return ok({device_code: 'fixture-device', user_code: 'ABCD-EFGH', expires_in: 1800, interval: 5,
        verification_uri: 'https://www.twitch.tv/activate?device-code=ABCDEFGH'});
    }
    if (url.endsWith('/token')) {
      bridge.tokenRequests++;
      return ok({access_token: ACCESS_TOKEN, refresh_token: 'r'.repeat(30)});
    }
    if (url.endsWith('/validate')) {
      return ok({client_id: BuiltInApp.clientID, login: LOGIN, scopes: ['chat:read'], expires_in: 14400});
    }
    if (url.endsWith('/revoke')) {
      bridge.revokes.push(httpOptions && httpOptions.data);
      return {statusCode: revokeStatus, data: {}};
    }
    throw new Error('unexpected Twitch request in test: ' + url);
  };
  globalShim.iina.http.get = respond;
  globalShim.iina.http.post = respond;
  globalShim.runScript(path.join(ROOT, 'global.js'), {
    require: name => name === './config.js' ? {identifier: IDENTIFIER, variant: 'unified', qa: false}
      : require(path.join(ROOT, name))
  });

  // ---- the player is created the way the product creates it: Open Stream, then a child with that label ----
  globalShim.utils.promptResult = sourceURL;
  globalShim.menu.items[0].action();
  const opened = globalShim.global.opens[0];
  const senderLabel = '1-' + IDENTIFIER;
  const source = Sources.parse(sourceURL);
  const childShim = createIina({label: opened.label, window: {loaded: true}, mpv: {path: source.url}, ...options.child});
  const services = {readSettings: () => ({}), cancelHelpers() {}, ...options.services};
  // The player reads the global timer functions when it starts; give it the child's fake ones just for that call.
  const realSetTimeout = global.setTimeout, realClearTimeout = global.clearTimeout;
  global.setTimeout = childShim.timers.setTimeout;
  global.clearTimeout = childShim.timers.clearTimeout;
  try {
    bridge.player = start(childShim.iina, {variant: 'unified'}, services);
  } finally {
    global.setTimeout = realSetTimeout;
    global.clearTimeout = realClearTimeout;
  }

  childShim.global.onPost = post => bridge.inbox.push(post);
  globalShim.global.onPost = ({name, data}) => { childShim.global.send(name, data); };

  Object.assign(bridge, {global: globalShim, child: childShim, services});
  bridge.opened = childShim.utils.opened;
  bridge.keychain = globalShim.keychain;
  bridge.chat = () => bridge.player.snapshot().chat;

  // Run queued messages and deferred deliveries until nothing is left to do at 0 ms.
  bridge.settle = async () => {
    for (let round = 0; round < 50; round++) {
      await new Promise(resolve => setImmediate(resolve));
      const post = bridge.inbox.shift();
      if (post) {
        const handler = globalShim.global.listeners.get(post.name);
        if (handler) await handler(post.data, senderLabel);
        continue;
      }
      const zeroDelay = shim => shim.timers.pending().filter(timer => timer.delay === 0);
      if (!zeroDelay(globalShim).length && !zeroDelay(childShim).length) return;
      globalShim.timers.flush(0);
      childShim.timers.flush(0);
    }
    throw new Error('settle(): the bridge did not go quiet');
  };

  // Twitch approves the device code: fire the broker's poll timer.
  bridge.approve = async () => {
    const poll = globalShim.timers.pending().find(timer => timer.delay === 5000);
    if (!poll) throw new Error('approve(): no poll timer is pending (is the broker waiting?)');
    await globalShim.timers.fire(poll);
    await bridge.settle();
  };

  bridge.click = async (name, data) => {
    childShim.sidebar.send(name, data);
    await bridge.settle();
  };

  bridge.close = () => childShim.emit('iina.window-will-close');
  return bridge;
}

module.exports = {createBridge, TwitchAuth, LOGIN, ACCESS_TOKEN, IDENTIFIER};
