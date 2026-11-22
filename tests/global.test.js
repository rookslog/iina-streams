'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const Sources = require('../src/source.js');
const {TwitchAuth} = require('../src/auth.js');
const scriptPath = path.join(__dirname, '../global.js');
const script = fs.readFileSync(scriptPath, 'utf8');
const plain = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function harness(overrides = {}) {
  const config = {identifier: 'local.iina.streams.candidate.unified', variant: 'unified', ...overrides};
  const handlers = new Map(), items = [], opens = [], messages = [], wires = [], httpCalls = [], timers = [];
  const files = new Map(), fileReads = [], fileWrites = [], keychainReads = [], keychainWrites = [], prompts = [], alerts = [];
  let input = null, nextID = 0, auth, authOptions, nativeResult, response = {statusCode: 200, data: {ok: true}}, transportError = false, rejectHTTP = false;
  class CapturedAuth extends TwitchAuth {
    constructor(options) { super(options); auth = this; authOptions = options; }
  }
  const utils = {
    prompt(title) { prompts.push(title); return input; },
    ask(message) { alerts.push(message); return true; },
    keychainRead(service, name) { keychainReads.push({service, name}); return false; },
    keychainWrite(service, name, value) { keychainWrites.push({service, name, value}); return true; }
  };
  const request = method => async (url, options) => {
    httpCalls.push({method, url, options: plain(options)});
    if (transportError) throw new Error('Untrusted transport details');
    if (rejectHTTP) throw response;
    return response;
  };
  const iina = {
    global: {
      createPlayerInstance(options) {
        opens.push(plain(options));
        return nativeResult === undefined ? ++nextID : nativeResult;
      },
      onMessage(name, callback) { handlers.set(name, callback); },
      postMessage(target, name, data) { wires.push({target, name, data: plain(data)}); messages.push({target, name, data: typeof data === 'string' ? JSON.parse(data) : plain(data)}); }
    },
    menu: {item: (title, callback) => ({title, callback}), addItem(item) { items.push(item); }},
    utils,
    file: {
      exists(file) { fileReads.push({operation: 'exists', file}); return files.has(file); },
      read(file) { fileReads.push({operation: 'read', file}); return files.get(file); },
      write(file, value) { fileWrites.push({file, value}); files.set(file, value); }
    },
    http: {post: request('POST'), get: request('GET')}
  };
  const context = vm.createContext({
    iina,
    require(moduleName) {
      if (moduleName === './config.js') return config;
      if (moduleName === './src/source.js') return Sources;
      if (moduleName === './src/auth.js') return {TwitchAuth: CapturedAuth};
      if (moduleName === './src/timers.js') return require('../src/timers.js');
      throw new Error('Unexpected module ' + moduleName);
    },
    setTimeout(fn, delay) { const timer = {fn, delay, cancelled: false}; timers.push(timer); return timer; },
    clearTimeout(timer) { timer.cancelled = true; }
  });
  vm.runInContext(script, context, {filename: scriptPath, timeout: 1000});
  return {
    config, handlers, items, opens, messages, wires, httpCalls, timers, files, fileReads, fileWrites,
    keychainReads, keychainWrites, prompts, alerts, auth, authOptions,
    open(value) { input = value; items[0].callback(); return opens.at(-1); },
    setResponse(value) { response = value; rejectHTTP = false; },
    rejectResponse(value) { response = value; rejectHTTP = true; },
    failTransport() { transportError = true; },
    setNativeResult(value) { nativeResult = value; },
    label(id = 1) { return id + '-' + config.identifier; },
    flushMessages() { for (const timer of timers.slice()) if (timer.delay === 0 && !timer.cancelled) timer.fn(); }
  };
}

test('production global loading registers its menu but performs no open, network, secret read, or timer work', () => {
  const r = harness();
  assert.equal(r.items.length, 1);
  for (const events of [r.opens, r.httpCalls, r.keychainReads, r.keychainWrites, r.fileReads, r.fileWrites, r.prompts, r.timers, r.messages]) assert.equal(events.length, 0);
  assert.equal(r.auth.snapshot().phase, 'off');
});

test('global auth timers release fired native entries and stop cancels pending work', async () => {
  const r = harness(); let invoked = 0;
  r.auth.schedule(() => { invoked++; assert.equal(r.timers[0].cancelled, true); }, 5000, r.auth.generation);
  await r.timers[0].fn();
  assert.equal(invoked, 1);
  r.auth.schedule(() => invoked++, 5000, r.auth.generation);
  const queued = r.timers[1];
  r.auth.stop();
  assert.equal(queued.cancelled, true);
  await queued.fn();
  assert.equal(invoked, 1);
});

test('the global Open Stream menu creates canonical managed players with only this plugin enabled', () => {
  const cases = [
    ['HuTcHmF', 'https://www.twitch.tv/hutchmf', 'twitch-live', 0],
    ['https://twitch.tv/videos/123456?t=1h2m3s', 'https://www.twitch.tv/videos/123456', 'twitch-vod', 3723],
    ['https://youtu.be/AbC_123-xYz?t=95&tracking=discard', 'https://www.youtube.com/watch?v=AbC_123-xYz', 'youtube', 95]
  ];
  for (const [input, url, kind, startSeconds] of cases) {
    const r = harness({variant: 'focus'}), opened = r.open(input);
    assert.equal(opened.url, url); assert.equal(opened.enablePlugins, false);
    const identity = Sources.fromLabel(opened.label);
    assert.equal(identity.variant, 'focus'); assert.equal(identity.source.kind, kind); assert.equal(identity.source.startSeconds, startSeconds);
    assert.equal(r.httpCalls.length, 0); assert.equal(r.keychainReads.length, 0);
  }
});

test('cancelled or invalid source prompts never create a managed player', () => {
  const r = harness(); r.open(null); r.open('https://twitch.tv.evil.example/channel');
  assert.equal(r.opens.length, 0); assert.equal(r.alerts.length, 1);
  assert.equal(r.httpCalls.length, 0); assert.equal(r.keychainReads.length, 0);
});

test('native internal string labels route authorization only to numeric opted-in children', async () => {
  const r = harness(); r.open('firstchannel'); r.open('secondchannel');
  await r.handlers.get('auth-connect')({}, r.label(2));
  assert.equal(r.messages.length, 0, 'native delivery must not occur while the child call is on the stack');
  r.flushMessages();
  assert.ok(r.messages.length > 0);
  assert.ok(r.messages.every(event => typeof event.target === 'number' && event.target === 2));
  assert.ok(r.messages.some(event => event.name === 'auth-state' && event.data.phase === 'needs-client'));
  r.authOptions.onReady({token: 'offline-test-token', login: 'reader', clientID: 'a'.repeat(30)});
  r.flushMessages();
  assert.deepEqual(r.messages.at(-1), {target: 2, name: 'auth-ready', data: {token: 'offline-test-token', login: 'reader', clientID: 'a'.repeat(30)}});
  r.messages.length = 0;
  await r.handlers.get('auth-connect')({}, r.label(1));
  r.flushMessages();
  assert.deepEqual(r.messages.map(event => [event.target, event.name]), [[1, 'auth-state'], [1, 'auth-ready']]);
  assert.ok(r.wires.every(event => typeof event.data === 'string' && event.data.length <= 8192));
  assert.equal(r.httpCalls.length, 0);
});

test('unrelated, malformed, numeric and uncreated labels are rejected before touching credentials', async () => {
  const r = harness(); r.open('example');
  for (const label of [null, undefined, 1, {}, '1-other-plugin', '01-' + r.config.identifier, r.label(2), r.label() + '-extra', '0-' + r.config.identifier]) {
    await r.handlers.get('auth-connect')({clientID: 'a'.repeat(30)}, label);
    r.handlers.get('auth-disconnect')({}, label);
    r.handlers.get('player-closed')({}, label);
  }
  for (const events of [r.messages, r.httpCalls, r.keychainReads, r.keychainWrites, r.fileReads, r.fileWrites, r.timers]) assert.equal(events.length, 0);
  await r.handlers.get('auth-connect')({}, r.label());
  r.flushMessages();
  assert.ok(r.messages.some(event => event.target === 1 && event.name === 'auth-state'));
});

test('disconnect and close affect the addressed player without stopping another opted-in child', async () => {
  const r = harness(); r.open('firstchannel'); r.open('secondchannel');
  await r.handlers.get('auth-connect')({}, r.label(1));
  await r.handlers.get('auth-connect')({}, r.label(2));
  r.flushMessages();
  r.handlers.get('auth-disconnect')({}, '1-unrelated');
  r.messages.length = 0; r.authOptions.onState({phase: 'ready'}); r.flushMessages();
  assert.deepEqual(r.messages.map(event => event.target).sort(), [1, 2]);
  r.handlers.get('player-closed')({}, r.label(1));
  r.messages.length = 0; r.authOptions.onState({phase: 'ready'}); r.flushMessages();
  assert.deepEqual(r.messages.map(event => event.target), [2]);
  r.messages.length = 0; await r.handlers.get('auth-connect')({}, r.label(1));
  assert.equal(r.messages.length, 0, 'closed player is no longer a managed authentication target');
  r.handlers.get('auth-disconnect')({}, r.label(2));
  r.messages.length = 0; r.authOptions.onReady({token: 'offline-test-token', login: 'reader'}); r.flushMessages();
  assert.equal(r.messages.length, 0);
});

test('OAuth POST fields use dictionary data while validation uses an Authorization header', async () => {
  const r = harness(), form = {client_id: 'offline-client', grant_type: 'refresh_token', refresh_token: 'offline-refresh-secret'};
  r.setResponse({statusCode: 200, data: {access_token: 'offline-response-token'}});
  const result = await r.authOptions.request('/token', 'POST', form, {});
  assert.deepEqual(plain(result), {status: 200, data: {access_token: 'offline-response-token'}});
  const sent = r.httpCalls[0];
  assert.equal(sent.method, 'POST'); assert.equal(sent.url, 'https://id.twitch.tv/oauth2/token');
  assert.deepEqual(sent.options.data, form); assert.equal('params' in sent.options, false);
  assert.equal(sent.url.includes('secret'), false); assert.equal(sent.url.includes('?'), false);
  await r.authOptions.request('/validate', 'GET', null, {Authorization: 'OAuth offline-access-secret'});
  const validation = r.httpCalls[1];
  assert.equal(validation.method, 'GET'); assert.equal(validation.url, 'https://id.twitch.tv/oauth2/validate');
  assert.deepEqual(validation.options, {headers: {Authorization: 'OAuth offline-access-secret'}});
  r.failTransport();
  assert.deepEqual(plain(await r.authOptions.request('/token', 'POST', form, {})), {status: 0, data: {}});
});

test('IINA HTTP rejection preserves Twitch authorization_pending and the global poller retries', async () => {
  const r = harness();
  const pending = {statusCode: 400, data: {status: 400, message: 'authorization_pending'}};
  r.rejectResponse(pending);
  assert.deepEqual(plain(await r.authOptions.request('/token', 'POST', {client_id: 'offline-client'}, {})),
    {status: 400, data: {status: 400, message: 'authorization_pending'}});
  r.rejectResponse({statusCode: 400, data: null, text: '{"status":400,"message":"authorization_pending"}'});
  assert.deepEqual(plain(await r.authOptions.request('/token', 'POST', {}, {})),
    {status: 400, data: {status: 400, message: 'authorization_pending'}});
  r.rejectResponse({statusCode: 403, data: {message: 'access_denied'}});
  assert.deepEqual(plain(await r.authOptions.request('/token', 'POST', {}, {})),
    {status: 403, data: {message: 'access_denied'}});

  r.open('example');
  r.setResponse({statusCode: 200, data: {device_code: 'pending-device', user_code: 'ABCD-EFGH', verification_uri: 'https://www.twitch.tv/activate', expires_in: 1800, interval: 5}});
  await r.handlers.get('auth-connect')({clientID: 'a'.repeat(30)}, r.label());
  assert.equal(r.auth.snapshot().phase, 'waiting');
  const poll = r.timers.find(timer => timer.delay === 5000 && !timer.cancelled);
  assert.ok(poll);
  r.rejectResponse(pending);
  await poll.fn();
  assert.equal(r.auth.snapshot().phase, 'waiting');
  assert.ok(r.timers.some(timer => timer !== poll && timer.delay === 5000 && !timer.cancelled));
  assert.equal(r.auth.snapshot().message, '');  // the code panel and status line carry this state; no extra narration
});

test('real authorization orchestration requests only chat:read in a POST form after explicit opt-in', async () => {
  const r = harness(); r.open('example');
  r.setResponse({statusCode: 200, data: {device_code: 'offline-device-code', user_code: 'ABCD-EFGH', verification_uri: 'https://www.twitch.tv/activate', expires_in: 1800, interval: 5}});
  await r.handlers.get('auth-connect')({clientID: 'a'.repeat(30)}, r.label());
  assert.equal(r.httpCalls.length, 1);
  assert.deepEqual(r.httpCalls[0], {method: 'POST', url: 'https://id.twitch.tv/oauth2/device', options: {headers: {}, data: {client_id: 'a'.repeat(30), scopes: 'chat:read'}}});
  assert.equal(r.keychainReads.length, 1); assert.equal(r.timers.filter(timer => timer.delay > 0).length, 1);
  assert.equal(r.auth.snapshot().phase, 'waiting');
  assert.equal(JSON.stringify(r.messages).includes('offline-device-code'), false);
  r.handlers.get('auth-disconnect')({}, r.label()); assert.equal(r.timers.find(timer => timer.delay > 0).cancelled, true);
  r.flushMessages(); assert.ok(r.messages.every(event => event.name === 'auth-stop'), 'only a stop may reach an opted-out managed child');
});

test('a failed native player creation never authorizes a fabricated numeric target', async () => {
  const r = harness(); r.setNativeResult(false); r.open('example');
  await r.handlers.get('auth-connect')({clientID: 'a'.repeat(30)}, r.label());
  assert.equal(r.messages.length, 0); assert.equal(r.httpCalls.length, 0); assert.equal(r.keychainReads.length, 0);
});

test('an unrelated sender cannot forget the candidate shared authorization', async () => {
  const r = harness(); r.open('example');
  await r.handlers.get('auth-forget')({}, '1-unrelated-plugin');
  assert.equal(r.keychainWrites.length, 0); assert.equal(r.httpCalls.length, 0);
  await r.handlers.get('auth-forget')({}, r.label());
  assert.equal(r.keychainWrites.length, 1); assert.equal(r.keychainWrites[0].value, '');
});

test('deferred credentials are discarded if the child opts out or closes before delivery', async () => {
  const r = harness(); r.open('firstchannel'); r.open('secondchannel');
  await r.handlers.get('auth-connect')({}, r.label(1));
  await r.handlers.get('auth-connect')({}, r.label(2));
  r.flushMessages(); r.messages.length = 0;
  r.authOptions.onReady({token: 'offline-current-token', login: 'reader'});
  assert.equal(r.messages.length, 0);
  r.handlers.get('auth-disconnect')({}, r.label(1));
  r.handlers.get('player-closed')({}, r.label(2));
  r.flushMessages();
  assert.deepEqual(r.messages, []);
  assert.ok(r.timers.filter(timer => timer.delay === 0).every(timer => timer.cancelled));
});

test('a queued old token is never delivered after the broker replaces credentials', async () => {
  const r = harness(); r.open('example');
  await r.handlers.get('auth-connect')({}, r.label()); r.flushMessages(); r.messages.length = 0;
  r.authOptions.onReady({token: 'offline-obsolete-token', login: 'reader'});
  r.authOptions.onReady({token: 'offline-current-token', login: 'reader'});
  assert.equal(r.messages.length, 0); r.flushMessages();
  assert.deepEqual(r.messages, [{target: 1, name: 'auth-ready', data: {token: 'offline-current-token', login: 'reader'}}]);
});

test('stop and forgotten reach managed children after Forget clears the opted-in audience', async () => {
  const r = harness(); r.open('example');
  await r.handlers.get('auth-connect')({}, r.label()); r.flushMessages(); r.messages.length = 0;
  await r.handlers.get('auth-forget')({}, r.label());
  assert.equal(r.messages.length, 0); r.flushMessages();
  assert.deepEqual(r.messages.map(event => event.name), ['auth-stop', 'auth-forgotten']);
  assert.deepEqual(r.messages.at(-1).data, {removed: true, revoked: true, stale: false});
  r.messages.length = 0;
  await r.handlers.get('auth-forget')({}, r.label());
  r.handlers.get('player-closed')({}, r.label()); r.flushMessages();
  assert.deepEqual(r.messages, []);
});

test('oversized or unserializable auth payloads never enter native delivery', async () => {
  const r = harness(); r.open('example');
  await r.handlers.get('auth-connect')({}, r.label()); r.flushMessages(); r.messages.length = 0;
  const cycle = {phase: 'error'}; cycle.self = cycle;
  assert.doesNotThrow(() => r.authOptions.onState(cycle));
  r.authOptions.onState({phase: 'error', message: 'x'.repeat(8193)});
  r.flushMessages(); assert.deepEqual(r.messages, []);
});

test('a queued Forget result and stop cannot interrupt a newer authorization generation', async () => {
  const r = harness(); r.open('example');
  await r.handlers.get('auth-connect')({}, r.label()); r.flushMessages(); r.messages.length = 0;
  await r.handlers.get('auth-forget')({}, r.label());
  await r.handlers.get('auth-connect')({}, r.label());
  r.flushMessages();
  assert.equal(r.messages.some(event => event.name === 'auth-forgotten'), false);
  assert.equal(r.messages.filter(event => event.name === 'auth-stop').length, 1, 'only the new connect generation can stop its own previous session');
  assert.deepEqual(r.messages.filter(event => event.name === 'auth-state').map(event => event.data.phase), ['off', 'needs-client']);
});

test('A reconnecting after shared Forget still stops B without stopping A newer session', async () => {
  const r = harness(); r.open('firstchannel'); r.open('secondchannel');
  await r.handlers.get('auth-connect')({}, r.label(1));
  await r.handlers.get('auth-connect')({}, r.label(2));
  r.flushMessages(); r.messages.length = 0;
  await r.handlers.get('auth-forget')({}, r.label(1));
  await r.handlers.get('auth-connect')({}, r.label(1));
  r.flushMessages();
  assert.deepEqual(r.messages.filter(event => event.target === 2).map(event => event.name), ['auth-stop'], 'B must still stop its old live session after audience clearing');
  assert.equal(r.messages.some(event => event.target === 1 && event.name === 'auth-forgotten'), false);
  assert.equal(r.messages.filter(event => event.target === 1 && event.name === 'auth-stop').length, 1);
  assert.equal(r.messages.filter(event => event.target === 1 && event.name === 'auth-state').at(-1).data.phase, 'needs-client');
});
