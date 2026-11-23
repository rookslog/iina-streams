'use strict';

// #67 (docs/reviews/2026-11-22-issue-67-review.md): global checks a Twitch channel before it creates a player.
// Round 3 tests the five written invariants of the step-back after round 2:
//   H-main      an interface call (createPlayerInstance, standaloneWindow.*) that follows an iina.http reply runs
//               in a timer callback, never in the reply's own continuation. IINA v1.5.1 runs a plugin timer
//               callback on the main thread (JavascriptPolyfill.swift createTimer / callJSCallback), while an
//               iina.http promise settles from Just's completion handler (JavascriptAPIHttp.swift request). In this
//               shim a timer callback is a fake-timer fire, so "no interface call before the timer turn" is the check.
//   D-offline   'offline' only for anonymous GQL user{stream} = null with no `errors`; anything else creates the player.
//   F-session   every update to the shared Open Stream form is dropped once that form session has moved on; separate
//               opens stay independent.
//   U-feedback  the form stays open, with the existing loading signifier, until a player exists or the list shows.
//   A-auth      the check sends no viewer credential, signed in or not.
// Residual race: a channel that goes offline after a live check keeps the in-player path (source-offline).
//
// The real global.js, src/twitch-vods.js and the IINA shim; only Twitch's HTTP replies are a double. Status replies
// are held until the test answers them; archive replies answer at once. Reply shapes are hand-written from the
// query and the GraphQL response format (data plus optional errors), not captured.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Sources = require('../src/source.js');
const {channelStatus} = require('../src/twitch-vods.js');
const fs = require('node:fs');
const vm = require('node:vm');
const {createIina, createWebViewIina} = require('./support/iina-shim.js');

const config = {identifier: 'local.iina.streams.precheck-test', variant: 'unified'};
const LOGIN = 'fixture_channel';
const LIVE = Sources.parse(LOGIN);
const VOD_URL = 'https://www.twitch.tv/videos/1234567890';
const UNAVAILABLE = {statusCode: 503, reason: 'Service Unavailable', text: ''};
const STREAM_QUERY = 'stream{id}';
const UI_CALL = /^(global\.createPlayerInstance|standaloneWindow\.)/;
const settle = async () => {
  for (let round = 0; round < 5; round++) await new Promise(resolve => setImmediate(resolve));
};

function archives(count) {
  const edges = Array.from({length: count}, (_, index) => ({node: {
    id: String(1234567890 + index), title: `Archive ${index}`, createdAt: '2026-11-20T10:31:57Z',
    lengthSeconds: 3600 + index,
  }}));
  return {statusCode: 200, data: {data: {user: {videos: {edges}}}}};
}

const STATUS = {
  live: {ok: true, value: {statusCode: 200, data: {data: {user: {stream: {id: '42'}}}}}},
  offline: {ok: true, value: {statusCode: 200, data: {data: {user: {stream: null}}}}},
  'offline-with-errors': {ok: true, value: {statusCode: 200, data: {
    data: {user: {stream: null}}, errors: [{message: 'service timeout', path: ['user', 'stream']}],
  }}},
  'no-user': {ok: true, value: {statusCode: 200, data: {data: {user: null}}}},
  malformed: {ok: true, value: {statusCode: 200, data: {data: {}}}},
  down: {ok: false, value: UNAVAILABLE},
  transport: {ok: false, value: new Error('transport')},
};

// iina.http-shaped. Status queries are held: answer(kind) settles the oldest unanswered one.
function twitchHttp() {
  const calls = [];
  const held = [];
  function post(url, options) {
    const query = String(options && options.data && options.data.query || '');
    calls.push({method: 'POST', url, query, headers: Object.assign({}, options && options.headers)});
    if (!query.includes(STREAM_QUERY)) return Promise.resolve(archives(1));
    return new Promise((resolve, reject) => held.push({resolve, reject}));
  }
  function get(url, options) {
    calls.push({method: 'GET', url, headers: Object.assign({}, options && options.headers)});
    return Promise.reject(UNAVAILABLE);
  }
  function answer(kind) {
    const request = held.shift();
    assert.ok(request, 'fixture: a status request is waiting');
    const reply = STATUS[kind];
    if (reply.ok) request.resolve(reply.value);
    else request.reject(reply.value);
  }
  return {calls, held, answer, api: {get, post}};
}

function loadGlobal(options = {}) {
  const shim = createIina({role: 'global', identifier: config.identifier});
  if (options.savedLogin) {
    shim.keychain.seed('twitch-readonly', 'oauth', JSON.stringify(options.savedLogin));
  }
  const http = options.http || twitchHttp();
  const modules = new Map([
    ['./config.js', config],
    ['./src/source.js', Sources],
    ['./src/auth.js', require('../src/auth.js')],
    ['./src/timers.js', require('../src/timers.js')],
    ['./src/twitch-app.js', {clientID: ''}],
    ['./src/twitch-vods.js', require('../src/twitch-vods.js')],
    ['./src/bridge.js', require('../src/bridge.js')],
    ['./src/listeners.js', require('../src/listeners.js')],
  ]);
  const context = shim.runScript(path.join(__dirname, '../global.js'), {
    globals: {iina: Object.assign({}, shim.iina, {http: http.api})},
    require(name) {
      if (!modules.has(name)) throw new Error('Unexpected module ' + name);
      return modules.get(name);
    },
  });
  const win = shim.standaloneWindow;
  const fixture = {shim, context, win, http, opens: () => shim.global.opens};
  fixture.lists = () => win.posts.filter(post => post.name === 'offline-vods')
    .map(post => JSON.parse(decodeURIComponent(post.data.encoded)));
  fixture.statusChecks = () => http.calls.filter(call => call.query && call.query.includes(STREAM_QUERY));
  fixture.mark = () => ({log: shim.log.length, timers: shim.timers.all.length, posts: win.posts.length});
  fixture.uiCallsSince = at => shim.log.slice(at.log).map(call => call.api).filter(api => UI_CALL.test(api));
  // Timers armed since `at` that are still armed, or fired and never cleared (IINA keeps those registered).
  fixture.timersLeftSince = at => shim.timers.all.slice(at.timers)
    .filter(timer => !timer.cancelled);
  fixture.postsSince = at => win.posts.slice(at.posts).map(post => post.name);
  return fixture;
}

// Opens the Open Stream form and lets its page report ready.
function openForm(fixture) {
  fixture.context.openStream();
  fixture.win.send('open-ready', {});
}

// A reply's own continuation runs in promise jobs; a timer turn is the main thread. Answers the status check, then
// runs main-thread turns until none is left (an offline answer's turn starts the archive lookup, whose reply has a
// turn of its own). Returns the interface calls made in promise jobs, outside any turn: H-main wants none.
async function replyThenMainTurn(fixture, kind) {
  let at = fixture.mark();
  fixture.http.answer(kind);
  const offMain = [];
  for (let turn = 0; turn < 6; turn++) {
    await settle();
    offMain.push(...fixture.uiCallsSince(at));
    fixture.shim.timers.flush(0);
    at = fixture.mark();
  }
  return offMain;
}

// Runs main-thread turns (0 ms timers) and their promise jobs until none is left.
async function mainTurns(fixture) {
  for (let turn = 0; turn < 6; turn++) {
    fixture.shim.timers.flush(0);
    await settle();
  }
}

function assertAnonymous(fixture) {
  for (const call of fixture.http.calls) {
    assert.equal(call.headers.Authorization, undefined, `no Authorization header on ${call.url}`);
    assert.ok(!call.url.startsWith('https://api.twitch.tv/'), `no Helix request: ${call.url}`);
  }
}

test('#67 U-feedback + H-main: an offline channel keeps the form open while checking, then lists, with no player', async () => {
  for (const input of [LOGIN, 'https://www.twitch.tv/' + LOGIN]) {
    const fixture = loadGlobal();
    openForm(fixture);
    const at = fixture.mark();
    fixture.win.send('open-stream', {input});
    await settle();
    assert.equal(fixture.win.visible, true, 'U-feedback: the form stays open while checking');
    assert.deepEqual(fixture.lists().at(-1), {state: 'loading'}, 'U-feedback: the existing loading signifier shows');
    assert.equal(fixture.statusChecks().length, 1, 'one status request');

    const offMain = await replyThenMainTurn(fixture, 'offline');
    assert.deepEqual(offMain, [], 'H-main: no interface call in the reply continuation');
    assert.deepEqual(fixture.opens(), [], `${input}: no player is created`);
    assert.equal(fixture.win.visible, true);
    assert.deepEqual(fixture.win.posts.filter(post => post.name === 'prefill').at(-1).data, {input: LOGIN});
    assert.equal(fixture.lists().at(-1).state, 'ready', 'the recent broadcasts are listed');
    assert.deepEqual(fixture.timersLeftSince(at), [], 'no timer is left armed or registered');
    assertAnonymous(fixture);
  }
});

test('#67 U-feedback + H-main: a live channel keeps the form open until its player exists', async () => {
  const fixture = loadGlobal();
  openForm(fixture);
  const at = fixture.mark();
  fixture.win.send('open-stream', {input: LOGIN});
  await settle();
  assert.equal(fixture.win.visible, true, 'still checking');
  assert.deepEqual(fixture.opens(), []);

  const offMain = await replyThenMainTurn(fixture, 'live');
  assert.deepEqual(offMain, [], 'H-main: no interface call in the reply continuation');
  assert.equal(fixture.opens().length, 1, 'one player');
  assert.equal(fixture.opens()[0].url, LIVE.url);
  assert.equal(fixture.opens()[0].label, Sources.label(LIVE, config.variant));
  assert.equal(fixture.win.visible, false, 'the form closes once the player exists');
  assert.ok(fixture.lists().every(list => list.state === 'loading'), 'no broadcast list, only the checking state');
  assert.deepEqual(fixture.timersLeftSince(at), []);
  assertAnonymous(fixture);
});

test('#67 D-offline: only a clean stream:null is offline; errors, no user, failures and odd replies open the player', async () => {
  for (const kind of ['offline-with-errors', 'no-user', 'malformed', 'down', 'transport']) {
    const fixture = loadGlobal();
    openForm(fixture);
    const at = fixture.mark();
    fixture.win.send('open-stream', {input: LOGIN});
    await settle();
    const offMain = await replyThenMainTurn(fixture, kind);
    assert.deepEqual(offMain, [], `${kind}: H-main`);
    assert.equal(fixture.opens().length, 1, `${kind}: the player opens`);
    assert.equal(fixture.win.visible, false, `${kind}: the form closes`);
    assert.ok(!fixture.postsSince(at).includes('prefill'), `${kind}: no broadcast list`);
    assert.deepEqual(fixture.timersLeftSince(at), [], `${kind}: no timer left`);
  }
});

test('#67 a check with no answer within 1.5 s opens the player, and the late answer changes nothing', async () => {
  const fixture = loadGlobal();
  openForm(fixture);
  const at = fixture.mark();
  fixture.win.send('open-stream', {input: LOGIN});
  await settle();
  fixture.shim.timers.advance(1499);
  await settle();
  fixture.shim.timers.flush(0);
  assert.equal(fixture.opens().length, 0, 'still waiting at 1499 ms');
  fixture.shim.timers.advance(1);
  await settle();
  fixture.shim.timers.flush(0);
  await settle();
  assert.equal(fixture.opens().length, 1, 'the player opens at 1500 ms');
  assert.equal(fixture.win.visible, false);
  await replyThenMainTurn(fixture, 'offline');
  assert.equal(fixture.opens().length, 1, 'a late offline answer opens nothing more');
  assert.equal(fixture.win.loads.length, 1, 'and shows no list');
  assert.deepEqual(fixture.timersLeftSince(at), []);
});

test('#67 F-session: a late offline answer does not overwrite a reopened form', async () => {
  const fixture = loadGlobal();
  openForm(fixture);
  fixture.win.send('open-stream', {input: LOGIN});
  await settle();
  fixture.win.send('open-cancel', {});
  openForm(fixture);
  fixture.win.send('open-stream', {input: 'not a stream ::'});
  await settle();
  const at = fixture.mark();
  await replyThenMainTurn(fixture, 'offline');
  assert.deepEqual(fixture.postsSince(at), [], 'nothing reaches the newer form');
  assert.deepEqual(fixture.opens(), [], 'and no player opens');
  assert.equal(fixture.win.visible, true);
});

test('#67 F-session: an invalid submit in the same form outdates an earlier channel\'s offline answer', async () => {
  const fixture = loadGlobal();
  openForm(fixture);
  fixture.win.send('open-stream', {input: LOGIN});
  await settle();
  fixture.win.send('open-stream', {input: 'not a stream ::'});
  await settle();
  const at = fixture.mark();
  await replyThenMainTurn(fixture, 'offline');
  assert.deepEqual(fixture.postsSince(at), [], 'the earlier channel neither prefills nor lists');
  assert.equal(fixture.win.loads.length, 1, 'nor reloads the form');
  assert.deepEqual(fixture.opens(), []);
  assert.equal(fixture.win.visible, true);
});

test('#67 F-session: editing the field after a submit outdates the earlier channel\'s late offline answer', async () => {
  const fixture = loadGlobal();
  openForm(fixture);
  fixture.win.send('open-stream', {input: LOGIN});
  await settle();
  // The page posts open-edit on every input event (ui/open.js onInput; see the page test below).
  fixture.win.send('open-edit', {});
  const at = fixture.mark();
  await replyThenMainTurn(fixture, 'offline');
  assert.deepEqual(fixture.postsSince(at), [], 'the draft is neither prefilled over nor given a list');
  assert.equal(fixture.win.loads.length, 1);
  assert.deepEqual(fixture.opens(), []);
});

test('#67 F-session: the Open Stream page reports every edit of its field as open-edit', () => {
  const page = createWebViewIina();
  const target = () => {
    const listeners = new Map();
    return {
      addEventListener: (name, fn) => listeners.set(name, (listeners.get(name) || []).concat(fn)),
      dispatch: (name, event) => (listeners.get(name) || []).forEach(fn => fn(event)),
      setAttribute() {}, removeAttribute() {}, focus() {}, value: '',
    };
  };
  const elements = {'open-form': target(), 'open-input': target()};
  const document = Object.assign(target(), {getElementById: id => elements[id] || null});
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../ui/open.js'), 'utf8'),
    {document, window: target(), iina: page.iina}, {filename: 'open.js'});
  elements['open-input'].value = 'other_channel';
  elements['open-input'].dispatch('input', {target: elements['open-input']});
  assert.deepEqual(page.messages('open-edit'), [{name: 'open-edit', data: {}}]);
});

test('#67 H-main deadline: no timer is cleared in a reply continuation, only on the turn after it', async () => {
  const fixture = loadGlobal();
  openForm(fixture);
  fixture.win.send('open-stream', {input: LOGIN});
  await settle();
  const deadline = fixture.shim.timers.all.find(timer => timer.delay === 1500);
  assert.ok(deadline, 'precondition: the check armed its deadline');
  const cleared = fixture.shim.timers.cleared.length;
  fixture.http.answer('offline');
  await settle();
  assert.equal(fixture.shim.timers.cleared.length, cleared, 'no clearTimeout in the status reply continuation');
  assert.equal(deadline.cancelled, false);
  fixture.shim.timers.flush(0);
  assert.equal(deadline.cancelled, true, 'the main-thread turn clears the deadline');
  await settle();
  fixture.shim.timers.flush(0);
  // The offline turn has started the archive lookup; its reply is answered at once.
  const archiveDeadline = fixture.shim.timers.all.find(timer => timer.delay === 5000);
  assert.ok(archiveDeadline, 'precondition: the archive lookup armed its deadline');
  const beforeArchive = fixture.shim.timers.cleared.length;
  await settle();
  assert.equal(fixture.shim.timers.cleared.length, beforeArchive, 'no clearTimeout in the archive reply continuation');
  fixture.shim.timers.flush(0);
  assert.equal(archiveDeadline.cancelled, true, 'the archive deadline is cleared on the turn after its reply');
});

test('#67 F-session: a late live answer still opens its player but leaves a newer form alone', async () => {
  const fixture = loadGlobal();
  openForm(fixture);
  fixture.win.send('open-stream', {input: LOGIN});
  await settle();
  fixture.win.send('open-cancel', {});
  openForm(fixture);
  const at = fixture.mark();
  await replyThenMainTurn(fixture, 'live');
  assert.equal(fixture.opens().length, 1, 'separate opens stay independent');
  assert.equal(fixture.win.visible, true, 'the newer form is not closed');
  assert.deepEqual(fixture.postsSince(at), []);
});

test('#67 F-session: a second submit in the same form supersedes the first one\'s form updates', async () => {
  const fixture = loadGlobal();
  openForm(fixture);
  fixture.win.send('open-stream', {input: LOGIN});
  await settle();
  fixture.win.send('open-stream', {input: VOD_URL});
  await settle();
  assert.equal(fixture.opens().length, 1, 'the VOD opens at once');
  assert.equal(fixture.win.visible, false);
  const at = fixture.mark();
  await replyThenMainTurn(fixture, 'offline');
  assert.deepEqual(fixture.postsSince(at), [], 'the earlier channel\'s list does not appear');
  assert.equal(fixture.win.loads.length, 1, 'and the form is not reopened');
});

test('#67 a sidebar open of an offline channel lists its broadcasts in the Open Stream window', async () => {
  const fixture = loadGlobal();
  fixture.shim.global.send('open', {input: LOGIN}, '0');
  await settle();
  assert.deepEqual(fixture.opens(), []);
  const offMain = await replyThenMainTurn(fixture, 'offline');
  assert.deepEqual(offMain, [], 'H-main');
  assert.equal(fixture.win.visible, true);
  fixture.win.send('open-ready', {});
  await settle();
  assert.equal(fixture.lists().at(-1).state, 'ready');
  assert.deepEqual(fixture.opens(), []);
});

test('#67 VOD and YouTube inputs open a player at once, with no check', async () => {
  for (const input of [VOD_URL, 'https://youtu.be/abcdefghijk']) {
    const fixture = loadGlobal();
    fixture.context.openStream(input);
    assert.equal(fixture.opens().length, 1, `${input}: the player opens synchronously`);
    await settle();
    assert.deepEqual(fixture.http.calls, [], `${input}: no live check`);
  }
});

test('#67 H-main fallback + residual race: source-offline opens the window only on a timer turn, and still lists', async () => {
  const fixture = loadGlobal();
  fixture.context.openStream(LOGIN);
  await settle();
  await replyThenMainTurn(fixture, 'live');
  assert.equal(fixture.opens().length, 1, 'precondition: the live check created player 1');
  const at = fixture.mark();
  await fixture.shim.global.send('source-offline', {login: LOGIN}, '1-' + config.identifier);
  await settle();
  assert.deepEqual(fixture.uiCallsSince(at), [], 'H-main: the message handler itself opens no window');
  await mainTurns(fixture);
  assert.equal(fixture.win.visible, true, 'the window opens on a main-thread turn');
  fixture.win.send('open-ready', {});
  await mainTurns(fixture);
  assert.equal(fixture.lists().at(-1).state, 'ready', 'the in-player path still lists the broadcasts');
});

test('#67 A-auth: signed in with a saved login, the check is still anonymous GQL', async () => {
  const saved = {clientID: 'c'.repeat(30), access_token: 'saved-precheck-token', refresh_token: 'saved-precheck-refresh'};
  const base = twitchHttp();
  const validated = {statusCode: 200, data: {client_id: saved.clientID, login: 'reader', scopes: ['chat:read'], expires_in: 5000}};
  const http = Object.assign({}, base, {api: {
    post: base.api.post,
    get: (url, options) => (url.endsWith('/oauth2/validate') ? Promise.resolve(validated) : base.api.get(url, options)),
  }});
  const fixture = loadGlobal({savedLogin: saved, http});
  await fixture.shim.global.send('auth-connect', {}, '0');
  await settle();
  fixture.shim.timers.flush(0);
  assert.ok(fixture.shim.global.posts.some(post => post.name === 'auth-ready'), 'precondition: global holds credentials');
  const before = base.calls.length;
  fixture.shim.global.send('open', {input: LOGIN}, '0');
  await settle();
  const check = base.calls.slice(before);
  assert.equal(check.length, 1, 'one request');
  assert.equal(check[0].url, 'https://gql.twitch.tv/gql');
  assert.equal(check[0].headers.Authorization, undefined, 'no viewer credential');
  assert.ok(!check[0].query.includes('saved-precheck-token'));
});

test('#67 channelStatus: one anonymous GQL request; offline only for stream:null without errors', async () => {
  const cases = [['live', 'live'], ['offline', 'offline'], ['offline-with-errors', 'unknown'], ['no-user', 'unknown'],
    ['malformed', 'unknown'], ['down', 'unknown'], ['transport', 'unknown']];
  for (const [kind, expected] of cases) {
    const http = twitchHttp();
    const pending = channelStatus({login: LOGIN}, {http: http.api, credentials: {token: 'x', clientID: 'y'}});
    await settle();
    http.answer(kind);
    assert.equal(await pending, expected, kind);
    assert.equal(http.calls.length, 1);
    assert.equal(http.calls[0].url, 'https://gql.twitch.tv/gql');
    assert.equal(http.calls[0].headers.Authorization, undefined);
  }
});
