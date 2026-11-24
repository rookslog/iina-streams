'use strict';

// #74 phase 1 (docs/design/finding-2026-11-22/open-stream/TESTS-74.md in the main checkout): the global half of
// typing suggestions in Open Stream. Global answers from watch history (src/history.js query) and makes one
// batched live-status request when the page is ready; typing makes no request.
// Protocol: page -> global open-query {text}, open-vods {login}; global -> page suggestions {text, rows},
// suggestions-status {status}. Page-bound messages may be plain or a src/bridge.js envelope ({encoded}); these
// tests read either. New messages are sent with receive(), which drops what has no listener (as IINA does),
// so a missing handler fails at an assertion, not at setup.
// The real global.js, src/history.js and the IINA shim. Twitch's replies are hand-written doubles.

const test = require('node:test');
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const {join} = require('node:path');
const {performance} = require('node:perf_hooks');
const {createIina} = require('./support/iina-shim.js');
const {createHistory} = require('../src/history.js');

const SCRIPT = join(__dirname, '../global.js');
const requireFromGlobal = createRequire(SCRIPT);
const ID = 'local.iina.streams.suggestions-test';
const FILE = '@data/history.json';
const START = 1800000000;
const GQL = 'https://gql.twitch.tv/gql';
const PRECHECK = /^query\{user\(login:"[A-Za-z0-9_]{1,25}"\)\{stream\{id\}\}\}$/;
const HELIX = /^https:\/\/api\.twitch\.tv\/helix\/streams(\?|$)/;
const ARCHIVE_URL = 'https://www.twitch.tv/videos/1234567890';
const CLEAR = 'Clear Watch History';
const SAVED = {clientID: 'c'.repeat(30), access_token: 'saved-suggest-token', refresh_token: 'saved-suggest-refresh'};
const VALIDATED = {statusCode: 200, data: {client_id: SAVED.clientID, login: 'reader', scopes: ['chat:read'], expires_in: 5000}};

// ---- history fixtures ----

function person(login, displayName, visitCount) {
  const visits = Array.from({length: visitCount}, (_, index) => ({at: START - 100 - index * 60, seconds: 3600}));
  return {provider: 'twitch', login, displayName, visits};
}

function historyFile(people, paused = false) {
  return JSON.stringify({version: 1, paused, people});
}

// Twelve people; ten start with "oh", one has "Oh" as a later word, one does not match. Distinct scores.
function twelve() {
  const people = [];
  for (let index = 1; index <= 10; index++) {
    const two = String(index).padStart(2, '0');
    people.push(person(`oh${two}`, `Oh ${two}`, 13 - index));
  }
  people.push(person('mroh', 'Mr Oh', 2), person('zed', 'Zed', 1));
  return people;
}

// n people with distinct scores, named p01 ...
function many(count) {
  return Array.from({length: count}, (_, index) => {
    const two = String(index + 1).padStart(2, '0');
    return person(`p${two}`, `Person ${two}`, count + 1 - index);
  });
}

// What src/history.js says for the same file: the oracle for order.
function oracle(text, now = START) {
  const history = createHistory({storage: {read: () => text, write() {}, backup() {}}, now: () => now});
  return text => history.query(text).map(({provider, login, displayName}) => ({provider, login, displayName}));
}

function decode(data) {
  return data && typeof data.encoded === 'string' ? JSON.parse(decodeURIComponent(data.encoded)) : data;
}

function quoted(query) {
  return Array.from(query.matchAll(/"([^"]*)"/g), match => match[1]);
}

// ---- global fixture ----

function loadGlobal({people = twelve(), paused = false, signedIn = false, precheck = 'live', liveLogins = [],
  statusFails = false} = {}) {
  const shim = createIina({role: 'global', identifier: ID});
  const text = historyFile(people, paused);
  shim.file.seed(FILE, text);
  if (signedIn) shim.keychain.seed('twitch-readonly', 'oauth', JSON.stringify(SAVED));
  const control = {liveLogins: new Set(liveLogins), statusFails, precheck};

  const post = shim.iina.http.post;
  const get = shim.iina.http.get;
  shim.iina.http.post = (url, options) => {
    const query = options?.data?.query ?? '';
    if (url === GQL && PRECHECK.test(query)) {
      const stream = control.precheck === 'live' ? {id: '42'} : null;
      shim.http.setResponse({statusCode: 200, data: {data: {user: {stream}}}});
    } else if (url === GQL && query.includes('videos(')) {
      const node = {id: '1234567890', title: 'Fixture Archive', createdAt: '2026-11-20T10:31:57Z', lengthSeconds: 3600};
      shim.http.setResponse({statusCode: 200, data: {data: {user: {videos: {edges: [{node}]}}}}});
    } else if (control.statusFails) {
      shim.http.rejectResponse({statusCode: 503, reason: 'Service Unavailable', text: ''});
    } else {
      // A batched status query, in either plausible shape: users(logins:[...]) or aliased user(login:"x").
      const aliased = Array.from(query.matchAll(/(\w+):user\(login:"(\w+)"\)/g));
      const data = {users: quoted(query).map(login => ({login, stream: control.liveLogins.has(login) ? {id: '1'} : null}))};
      for (const [, alias, login] of aliased) data[alias] = {login, stream: control.liveLogins.has(login) ? {id: '1'} : null};
      shim.http.setResponse({statusCode: 200, data: {data}});
    }
    return post(url, options);
  };
  shim.iina.http.get = (url, options) => {
    if (url.endsWith('/oauth2/validate')) {
      shim.http.setResponse(VALIDATED);
    } else if (HELIX.test(url)) {
      if (control.statusFails) {
        shim.http.rejectResponse({statusCode: 503, reason: 'Service Unavailable', text: ''});
      } else {
        const found = [...new URL(url).searchParams.getAll('user_login')];
        const param = options?.params?.user_login;
        if (Array.isArray(param)) found.push(...param);
        else if (typeof param === 'string') found.push(param);
        const live = found.filter(login => control.liveLogins.has(login));
        shim.http.setResponse({statusCode: 200, data: {data: live.map(login => ({user_login: login, type: 'live'}))}});
      }
    } else {
      shim.http.rejectResponse({statusCode: 404, reason: 'Not Found', text: ''});
    }
    return get(url, options);
  };

  shim.runScript(SCRIPT, {
    globals: {Date: class extends Date { static now() { return START * 1000 + shim.timers.now; } }},
    require(name) {
      if (name === './config.js') return {identifier: ID, variant: 'unified', qa: false};
      if (name === './src/twitch-app.js') return {clientID: ''};
      return requireFromGlobal(name);
    },
  });
  const window = shim.standaloneWindow;
  const menuItem = title => shim.menu.items.find(item => item.title === title);

  async function settle() {
    for (let turn = 0; turn < 6; turn++) {
      await new Promise(resolve => setImmediate(resolve));
      shim.timers.flush(0);
    }
    await new Promise(resolve => setImmediate(resolve));
  }

  async function showOpen() {
    menuItem('Open Stream…').action();
    window.send('open-ready', {});
    await settle();
  }

  async function reopen() {
    window.send('open-cancel', {});
    await showOpen();
  }

  async function signIn() {
    await shim.global.send('auth-connect', {}, '0');
    await settle();
    assert.ok(shim.global.posts.some(post => post.name === 'auth-ready'), 'fixture: global holds credentials');
  }

  const messages = name => window.posts.filter(post => post.name === name).map(post => decode(post.data));
  const calls = () => shim.http.calls;
  const gqlStatus = () => calls().filter(call => call.url === GQL && call.method === 'POST'
    && !PRECHECK.test(call.options?.data?.query ?? '') && !(call.options?.data?.query ?? '').includes('videos('));
  const helixStatus = () => calls().filter(call => HELIX.test(call.url));
  const statusRequests = () => gqlStatus().length + helixStatus().length;
  const prechecks = () => calls().filter(call => call.url === GQL && PRECHECK.test(call.options?.data?.query ?? ''));
  const archives = () => calls().filter(call => (call.options?.data?.query ?? '').includes('videos('));

  async function ask(textValue) {
    const before = messages('suggestions').length;
    window.receive('open-query', {text: textValue});
    await settle();
    const answers = messages('suggestions').slice(before).filter(message => message.text === textValue);
    assert.ok(answers.length >= 1, `global answers open-query "${textValue}" with suggestions`);
    return answers.at(-1);
  }

  return {
    shim, window, control, showOpen, reopen, signIn, settle, ask, messages, calls, gqlStatus, helixStatus,
    statusRequests, prechecks, archives, menuItem, oracle: oracle(text), text,
  };
}

const identity = ({provider, login, displayName}) => ({provider, login, displayName});

// ---- tests ----

test('1. the empty field: open-ready answers suggestions for "" with the top 8, in query("") order', async () => {
  const r = loadGlobal();
  await r.showOpen();
  const first = r.messages('suggestions').find(message => message.text === '');
  assert.ok(first, 'open-ready is answered with suggestions for ""');
  assert.deepEqual(first.rows.map(identity), r.oracle('').slice(0, 8));
  assert.equal(first.rows.length, 8);
});

test('2. typing: open-query "oh" answers with query("oh")\'s first 8 rows, with identity fields only', async () => {
  const r = loadGlobal();
  await r.showOpen();
  const answer = await r.ask('oh');
  const expected = r.oracle('oh');
  assert.ok(expected.length > 8, 'fixture: more than 8 matches');
  assert.deepEqual(answer.rows.map(identity), expected.slice(0, 8));
  assert.ok(!answer.rows.some(row => row.login === 'mroh'), 'word-start matches rank after the prefix matches');
  for (const row of answer.rows) {
    assert.deepEqual(Object.keys(row).sort(), ['displayName', 'live', 'login', 'provider'], 'no visits, no scores');
    assert.ok([true, false, null].includes(row.live), 'live is true, false or null');
  }
});

test('3. a pasted URL answers rows: []', async () => {
  const r = loadGlobal({people: [person('ohnepixel', 'Ohnepixel', 3), ...twelve()]});
  await r.showOpen();
  for (const text of ['https://www.twitch.tv/ohnepixel', 'twitch.tv/videos/123', 'https://youtu.be/AbC_123-xYz']) {
    const answer = await r.ask(text);
    assert.deepEqual(answer.rows, [], text);
  }
});

test('4. no match answers rows: []', async () => {
  const r = loadGlobal();
  await r.showOpen();
  assert.deepEqual((await r.ask('qqqq')).rows, []);
});

function statusMap(logins, live) {
  return Object.fromEntries(logins.map(login => [login, live.includes(login)]));
}

// 25 people; the batch lists up to 20 (my reading: the top 20 of query("")). Returns the logins of the request.
function assertBatch(logins, r) {
  const people = r.oracle('');
  assert.equal(logins.length, 20, 'up to 20 people, and 25 are in history');
  assert.equal(new Set(logins).size, 20, 'no login twice');
  for (const login of logins) assert.ok(people.some(entry => entry.login === login), `${login} is from history`);
  for (const entry of people.slice(0, 8)) assert.ok(logins.includes(entry.login), `${entry.login} (a visible row) is listed`);
}

test('5a. signed out: one batched GQL request listing the logins, answered as suggestions-status', async () => {
  const r = loadGlobal({people: many(25), liveLogins: ['p01', 'p03']});
  await r.showOpen();
  assert.equal(r.statusRequests(), 1, 'exactly one status request when the window opens');
  assert.equal(r.helixStatus().length, 0, 'signed out: no Helix request');
  const [request] = r.gqlStatus();
  assert.equal(request.url, GQL);
  assert.equal(request.method, 'POST');
  const logins = quoted(request.options.data.query);
  assertBatch(logins, r);
  const headers = request.options.headers || {};
  assert.ok(!Object.keys(headers).some(name => name.toLowerCase() === 'authorization'), 'anonymous');

  const first = r.messages('suggestions').find(message => message.text === '');
  assert.ok(first, 'suggestions arrive first');
  assert.ok(first.rows.every(row => row.live === null), 'live is unknown until the status arrives');
  const statuses = r.messages('suggestions-status');
  assert.equal(statuses.length, 1, 'one suggestions-status');
  assert.deepEqual(statuses[0], {status: statusMap(logins, ['p01', 'p03'])});
  const later = await r.ask('');
  assert.deepEqual(later.rows.map(row => [row.login, row.live]),
    r.oracle('').slice(0, 8).map(row => [row.login, ['p01', 'p03'].includes(row.login)]), 'later suggestions carry cached live');
  assert.equal(r.statusRequests(), 1, 'asking again makes no request');
});

test('5b. signed in: one Helix GET /helix/streams with repeated user_login', async () => {
  const r = loadGlobal({people: many(25), liveLogins: ['p02'], signedIn: true});
  await r.signIn();
  await r.showOpen();
  assert.equal(r.statusRequests(), 1, 'exactly one status request');
  assert.equal(r.gqlStatus().length, 0, 'signed in: the documented API first (D-034), no GQL status');
  const [request] = r.helixStatus();
  assert.equal(request.method, 'GET');
  const url = new URL(request.url);
  assert.equal(url.origin + url.pathname, 'https://api.twitch.tv/helix/streams');
  const logins = url.searchParams.getAll('user_login');
  assertBatch(logins, r);
  assert.match(request.options.headers.Authorization, /^Bearer saved-suggest-token$/);
  assert.ok(request.options.headers['Client-Id'], 'a Client-Id header');
  const statuses = r.messages('suggestions-status');
  assert.equal(statuses.length, 1);
  assert.deepEqual(statuses[0], {status: statusMap(logins, ['p02'])});
});

test('5c. a failed request gives null for those logins, no retry storm, and no request within 60 s', async () => {
  const r = loadGlobal({people: many(25), statusFails: true});
  await r.showOpen();
  assert.equal(r.statusRequests(), 1);
  const logins = quoted(r.gqlStatus()[0].options.data.query);
  assertBatch(logins, r);
  const statuses = r.messages('suggestions-status');
  assert.equal(statuses.length, 1);
  assert.deepEqual(statuses[0], {status: Object.fromEntries(logins.map(login => [login, null]))});
  const later = await r.ask('');
  assert.ok(later.rows.every(row => row.live === null), 'cached unknown');

  for (let step = 0; step < 5; step++) {
    r.shim.timers.advance(5000);
    await r.settle();
  }
  assert.equal(r.statusRequests(), 1, 'no retry storm');
  r.shim.timers.advance(34999);
  await r.reopen();
  assert.equal(r.statusRequests(), 1, 'a failure still holds the 60 s rule: reopening at 59.999 s asks nothing');
  r.shim.timers.advance(1);
  await r.reopen();
  assert.equal(r.statusRequests(), 2, 'a new request once 60 s have passed');
});

test('5d. a success also holds the 60 s rule, and reopening serves the cached live values', async () => {
  const r = loadGlobal({people: many(25), liveLogins: ['p01']});
  await r.showOpen();
  assert.equal(r.statusRequests(), 1);
  r.shim.timers.advance(30000);
  await r.reopen();
  assert.equal(r.statusRequests(), 1, 'reopening at 30 s asks nothing');
  const reopened = r.messages('suggestions').at(-1);
  assert.equal(reopened.text, '');
  assert.deepEqual(reopened.rows.map(row => [row.login, row.live]),
    r.oracle('').slice(0, 8).map(row => [row.login, row.login === 'p01']), 'cached values on the reopened page');
  r.shim.timers.advance(29999);
  await r.reopen();
  assert.equal(r.statusRequests(), 1, 'still one at 59.999 s');
  r.shim.timers.advance(1);
  await r.reopen();
  assert.equal(r.statusRequests(), 2, 'a new request at 60 s');
});

test('6. no network for typing: ten open-query messages add no request, and typed text is never sent', async () => {
  const r = loadGlobal();
  await r.showOpen();
  const before = r.calls().length;
  const typed = ['o', 'oh', 'ohn', 'ohne', 'ohnez', 'zzqq', 'zzqqx', 'qz', 'zq', 'x9'];
  for (const text of typed) await r.ask(text);
  assert.equal(r.calls().length, before, 'no HTTP request for typing');
  const sent = JSON.stringify(r.calls());
  for (const text of ['ohnez', 'zzqq', 'zzqqx']) assert.ok(!sent.includes(text), `${text} was not sent anywhere`);
});

test('7. opening is unchanged: open-stream {input} runs the precheck, then opens a live player or lists broadcasts', async () => {
  const live = loadGlobal();
  await live.showOpen();
  live.window.send('open-stream', {input: 'ohnepixel'});
  await live.settle();
  assert.equal(live.prechecks().length, 1, 'one precheck request');
  assert.equal(live.shim.global.opens.length, 1);
  assert.equal(live.shim.global.opens[0].url, 'https://www.twitch.tv/ohnepixel');
  assert.equal(live.window.visible, false, 'the form closes once the player exists');

  const offline = loadGlobal({precheck: 'offline'});
  await offline.showOpen();
  offline.window.send('open-stream', {input: 'ohnepixel'});
  await offline.settle();
  assert.deepEqual(offline.shim.global.opens, [], 'no player for an offline channel');
  assert.equal(offline.window.visible, true);
  const list = offline.messages('offline-vods').at(-1);
  assert.equal(list.state, 'ready');
  assert.deepEqual(list.items.map(({url}) => url), [ARCHIVE_URL]);
});

test('8. open-vods {login} answers offline-vods with recent broadcasts, whether the person is live or not', async () => {
  for (const precheck of ['live', 'offline']) {
    const r = loadGlobal({precheck, liveLogins: precheck === 'live' ? ['ohnepixel'] : []});
    await r.showOpen();
    r.window.receive('open-vods', {login: 'ohnepixel'});
    await r.settle();
    const list = r.messages('offline-vods').at(-1);
    assert.ok(list, `${precheck}: global answers open-vods with offline-vods`);
    assert.equal(list.state, 'ready', precheck);
    assert.deepEqual(list.items, [{
      title: 'Fixture Archive', createdAt: '2026-11-20T10:31:57Z', lengthSeconds: 3600, url: ARCHIVE_URL,
    }], precheck);
    assert.equal(r.archives().length, 1, `${precheck}: one archive request`);
    assert.equal(r.prechecks().length, 0, `${precheck}: no live precheck for a broadcast list`);
    assert.deepEqual(r.shim.global.opens, [], `${precheck}: no player is created`);
  }
});

test('9. paused history still serves suggestions; cleared history serves rows: []', async () => {
  const paused = loadGlobal({paused: true});
  await paused.showOpen();
  const first = paused.messages('suggestions').find(message => message.text === '');
  assert.ok(first, 'a paused history answers open-ready');
  assert.deepEqual(first.rows.map(identity), paused.oracle('').slice(0, 8));
  assert.deepEqual((await paused.ask('oh')).rows.map(identity), paused.oracle('oh').slice(0, 8));

  const cleared = loadGlobal();
  await cleared.showOpen();
  assert.ok((await cleared.ask('oh')).rows.length > 0, 'fixture: history has people before clearing');
  cleared.menuItem(CLEAR).action();
  await cleared.settle();
  assert.deepEqual((await cleared.ask('oh')).rows, []);
  assert.deepEqual((await cleared.ask('')).rows, []);
});

test('10. speed: answering open-query with 500 people takes under 20 ms of handler time', async () => {
  const people = Array.from({length: 500}, (_, index) => {
    const name = `a${String(index).padStart(3, '0')}`;
    return person(name, `A Person ${name}`, 1 + index % 7);
  });
  const r = loadGlobal({people});
  await r.showOpen();
  const answer = await r.ask('a');
  assert.equal(answer.rows.length, 8, 'fixture: 500 matches, 8 answered');
  const times = [];
  for (let run = 0; run < 5; run++) {
    const start = performance.now();
    r.window.receive('open-query', {text: 'a' + run});
    times.push(performance.now() - start);
    await r.settle();
  }
  times.sort((a, b) => a - b);
  assert.ok(r.messages('suggestions').length >= 6, 'every query was answered');
  assert.ok(times[2] < 20, `median handler time ${times[2].toFixed(2)} ms`);
});

test('15 (global half). the window height is fixed for the list: it does not change between 0 and many rows', async () => {
  const r = loadGlobal();
  await r.showOpen();
  const frames = () => r.shim.standaloneWindow.frames;
  const height = () => frames().at(-1).height;
  const opened = height();
  assert.ok(opened > 84, `the window already holds the list when it opens (height ${opened}, the field alone is 84)`);
  for (const text of ['qqqq', '', 'oh', 'zed']) {
    await r.ask(text);
    assert.equal(height(), opened, `height after "${text}"`);
  }
});
