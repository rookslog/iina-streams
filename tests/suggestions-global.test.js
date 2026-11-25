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

// Phase 3 (TESTS-74, 2026-11-24) extends the fakes. What they model, and from where:
// - GQL answers carry only the fields the query text asks for (a query that keeps `stream{id}` gets no title), as
//   Twitch's GraphQL does. Shape: anonymous user(login){stream{title viewersCount game{displayName}} lastBroadcast
//   {startedAt}}, checked live 2026-11-24 (TESTS-74 phase 3).
// - Helix /streams, /streams/followed and /channels/followed answer with Twitch's documented field names
//   (user_login, user_name, title, game_name, viewer_count; broadcaster_login, broadcaster_name, followed_at).
// - The two followed endpoints need a user token with user:read:follows (else 401 "Missing scope"), and a user_id equal
//   to the token's own; a params map with a non-string value is dropped whole, as IINA's `as? [String: String]` does
//   (src/twitch-helix.js header). Policy, not host: both must carry Authorization and Client-Id headers.
// - `control.scopes` and `control.userID` are what /oauth2/validate says.
const FOLLOWED = /\/helix\/(streams|channels)\/followed(\?|$)/;
const USER_ID = '77001';
const FOLLOWS_SCOPES = ['chat:read', 'user:read:follows'];

function loadGlobal({people = twelve(), paused = false, signedIn = false, precheck = 'live', liveLogins = [],
  statusFails = false, holdStatus = false, scopes = ['chat:read'], follows = [], details = {}, followsFail = false,
  holdFollows = false, followsCursor = ''} = {}) {
  const shim = createIina({role: 'global', identifier: ID});
  const text = historyFile(people, paused);
  shim.file.seed(FILE, text);
  if (signedIn) shim.keychain.seed('twitch-readonly', 'oauth', JSON.stringify(SAVED));
  const control = {liveLogins: new Set(liveLogins), statusFails, precheck, holdStatus, held: [], scopes, userID: USER_ID,
    follows, details, followsFail, holdFollows, heldFollows: [], followsCursor};

  const liveDetails = login => ({title: `Stream of ${login}`, category: 'Just Chatting', viewers: 100,
    ...(control.details[login] || {})});
  const lastAtOf = login => (control.details[login] || {}).lastAt || null;
  // The stream object of a GQL answer, with only the fields the query selects.
  const gqlStream = (query, login) => {
    if (!control.liveLogins.has(login)) return null;
    const flat = query.replace(/\s+/g, '');
    const d = liveDetails(login);
    const stream = {};
    if (/stream\{[^}]*\bid\b/.test(flat)) stream.id = '1';
    if (flat.includes('title')) stream.title = d.title;
    if (flat.includes('viewersCount')) stream.viewersCount = d.viewers;
    if (/game\{[^}]*displayName/.test(flat)) stream.game = {displayName: d.category};
    return Object.keys(stream).length ? stream : {__typename: 'Stream'};
  };
  const gqlUser = (query, login) => {
    const user = {login, stream: gqlStream(query, login)};
    const flatQuery = query.replace(/\s+/g, '');
    if (/lastBroadcast\{[^}]*startedAt/.test(flatQuery)) {
      // Amended 2026-11-24 (lead, phase 3b): the last broadcast's title too, when the query selects it.
      const lastTitle = (control.details[login] || {}).lastTitle;
      user.lastBroadcast = lastAtOf(login) ? {startedAt: lastAtOf(login),
        ...(/lastBroadcast\{[^}]*title/.test(flatQuery) && lastTitle ? {title: lastTitle} : {})} : null;
    }
    return user;
  };

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
      const data = {users: quoted(query).map(login => gqlUser(query, login))};
      for (const [, alias, login] of aliased) data[alias] = gqlUser(query, login);
      if (control.holdStatus) {
        // Held until releaseStatus(): the answer arrives later, on its own turn.
        return new Promise(resolve => control.held.push(() => {
          shim.http.setResponse({statusCode: 200, data: {data}});
          resolve(post(url, options));
        }));
      }
      shim.http.setResponse({statusCode: 200, data: {data}});
    }
    return post(url, options);
  };

  // The followed endpoints' answer, or a rejection, for one request.
  const followedAnswer = (url, options) => {
    const headers = options?.headers ?? {};
    const rawParams = options?.params;
    const params = rawParams && Object.values(rawParams).every(value => typeof value === 'string') ? {...rawParams} : {};
    for (const [key, value] of new URL(url).searchParams) params[key] = value;
    const reject = (statusCode, message) => shim.http.rejectResponse({statusCode, reason: message, text: '',
      data: {error: message, status: statusCode, message}});
    if (control.followsFail) return reject(503, 'Service Unavailable');
    if (headers.Authorization !== `Bearer ${SAVED.access_token}` || !headers['Client-Id']) return reject(401, 'Invalid OAuth token');
    if (!control.scopes.includes('user:read:follows')) return reject(401, 'Missing scope: user:read:follows');
    if (!params.user_id) return reject(400, 'Missing required parameter "user_id"');
    if (params.user_id !== control.userID) return reject(400, 'The user_id must match the user ID in the user access token');
    if (url.includes('/channels/followed')) {
      const page = control.follows.slice(0, Number(params.first) || 20);
      const pagination = control.followsCursor ? {cursor: control.followsCursor} : {};
      return shim.http.setResponse({statusCode: 200, data: {total: control.follows.length, pagination,
        data: page.map(({login, name, followedAt = '2025-03-01T12:00:00Z'}) => ({broadcaster_id: String(login.length * 1000),
          broadcaster_login: login, broadcaster_name: name, followed_at: followedAt}))}});
    }
    const live = control.follows.filter(({login}) => control.liveLogins.has(login));
    return shim.http.setResponse({statusCode: 200, data: {pagination: {}, data: live.map(({login, name}) => {
      const d = liveDetails(login);
      return {id: '5' + login.length, user_id: String(login.length * 1000), user_login: login, user_name: name,
        game_id: '9', game_name: d.category, type: 'live', title: d.title, viewer_count: d.viewers,
        started_at: '2026-11-24T09:00:00Z', thumbnail_url: 'https://static-cdn.jtvnw.net/previews-ttv/live_user_x-{width}x{height}.jpg'};
    }).sort((a, b) => b.viewer_count - a.viewer_count)}});
  };

  shim.iina.http.get = (url, options) => {
    if (url.endsWith('/oauth2/validate')) {
      shim.http.setResponse({statusCode: 200, data: {client_id: SAVED.clientID, login: 'reader', user_id: control.userID,
        scopes: control.scopes, expires_in: 5000}});
    } else if (FOLLOWED.test(url)) {
      if (control.holdFollows) {
        return new Promise(resolve => control.heldFollows.push(() => {
          followedAnswer(url, options);
          resolve(get(url, options));
        }));
      }
      followedAnswer(url, options);
    } else if (HELIX.test(url)) {
      if (control.statusFails) {
        shim.http.rejectResponse({statusCode: 503, reason: 'Service Unavailable', text: ''});
      } else {
        const found = [...new URL(url).searchParams.getAll('user_login')];
        const param = options?.params?.user_login;
        if (Array.isArray(param)) found.push(...param);
        else if (typeof param === 'string') found.push(param);
        const live = found.filter(login => control.liveLogins.has(login));
        shim.http.setResponse({statusCode: 200, data: {data: live.map(login => {
          const d = liveDetails(login);
          return {id: '7' + login.length, user_id: String(login.length * 1000), user_login: login, user_name: login,
            game_name: d.category, type: 'live', title: d.title, viewer_count: d.viewers, started_at: '2026-11-24T09:00:00Z'};
        })}});
      }
    } else if (url.includes('/helix/users')) {
      shim.http.setResponse({statusCode: 200, data: {data: [{id: '4242', login: 'ohnepixel'}]}});
    } else if (url.includes('/helix/videos')) {
      shim.http.setResponse({statusCode: 200, data: {data: [{id: '1234567890', title: 'Helix Archive',
        created_at: '2026-11-20T10:31:57Z', duration: '1h0m0s'}]}});
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
  // #73 put Clear Watch History in the Watch History submenu, so the search goes into submenus (lead, 2026-11-24).
  const menuItem = title => {
    const visit = items => {
      for (const item of items || []) {
        if (item.title === title) return item;
        const inner = visit(item.items || item.submenu);
        if (inner) return inner;
      }
      return undefined;
    };
    return visit(shim.menu.items);
  };

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
    assert.ok(shim.global.posts.some(post => post.name === 'auth-ready'),
    `fixture: global holds credentials (validate accepted scopes ${control.scopes.join(' ')})`);
  }

  const messages = name => window.posts.filter(post => post.name === name).map(post => decode(post.data));
  const calls = () => shim.http.calls;
  const gqlStatus = () => calls().filter(call => call.url === GQL && call.method === 'POST'
    && !PRECHECK.test(call.options?.data?.query ?? '') && !(call.options?.data?.query ?? '').includes('videos('));
  const helixStatus = () => calls().filter(call => HELIX.test(call.url));
  const followedLive = () => calls().filter(call => /\/helix\/streams\/followed(\?|$)/.test(call.url));
  const followedChannels = () => calls().filter(call => /\/helix\/channels\/followed(\?|$)/.test(call.url));
  // A held follow request counts as made.
  const followRequests = () => followedLive().length + followedChannels().length + control.heldFollows.length;
  // A held request counts as made: the shim records it only once released.
  const statusRequests = () => gqlStatus().length + helixStatus().length + control.held.length;
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

  const releaseFollows = () => {
    const waiting = control.heldFollows.splice(0);
    assert.ok(waiting.length, 'fixture: a follow request is waiting');
    for (const release of waiting) release();
  };

  const releaseStatus = () => {
    const next = control.held.shift();
    assert.ok(next, 'fixture: a status request is waiting');
    next();
  };

  return {
    shim, window, control, releaseStatus, releaseFollows, followedLive, followedChannels, followRequests, showOpen, reopen, signIn, settle, ask, messages, calls, gqlStatus, helixStatus,
    statusRequests, prechecks, archives, menuItem, oracle: oracle(text), text,
  };
}

const identity = ({provider, login, displayName}) => ({provider, login, displayName});

// G4 for history-only lists: live people first, each group in history order.
const liveFirst = (rows, live) => [...rows.filter(row => live.includes(row.login)), ...rows.filter(row => !live.includes(row.login))];

// ---- tests ----

// Amended 2026-11-24 ~21:00 (lead, design review): global sends up to 20 people (one status batch) and the
// page shows 8 at a time and scrolls (TESTS-74 item 2; the operator: the quick list must scroll).
// Amended 2026-11-24 (phase 3, TESTS-74): G4, "up to 50 rows" (one cap, history-only lists included; with nobody known
// live the order is query("")'s). This was 20 rows; the status batch still lists 20 people (5a-5d).
test('1. the empty field: open-ready answers suggestions for "" with the top 50, in query("") order', async () => {
  const r = loadGlobal({people: many(60)});
  await r.showOpen();
  const first = r.messages('suggestions').find(message => message.text === '');
  assert.ok(first, 'open-ready is answered with suggestions for ""');
  assert.deepEqual(first.rows.map(identity), r.oracle('').slice(0, 50));
  assert.equal(first.rows.length, 50);
});

test('2. typing: open-query "oh" answers with query("oh")\'s first 20 rows, with identity fields only', async () => {
  const r = loadGlobal();
  await r.showOpen();
  const answer = await r.ask('oh');
  const expected = r.oracle('oh');
  assert.ok(expected.length > 8, 'fixture: more than 8 matches');
  assert.deepEqual(answer.rows.map(identity), expected.slice(0, 20));
  const mroh = answer.rows.findIndex(row => row.login === 'mroh');
  assert.ok(mroh === -1 || answer.rows.slice(mroh).every(row => !row.login.startsWith('oh')), 'word-start matches rank after every prefix match');
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
  // Amended 2026-11-24 (phase 3, TESTS-74): G6 adds `details` to the message, so the status map is compared on its own;
  // G4 puts live people first, so p03 now precedes p02 (it was in history position).
  assert.deepEqual(statuses[0].status, statusMap(logins, ['p01', 'p03']));
  const later = await r.ask('');
  assert.deepEqual(later.rows.map(row => row.login), liveFirst(r.oracle(''), ['p01', 'p03']).map(row => row.login),
    'live people first, then the rest in history order (all 25 of them)');
  // The batch covered the top 20; whoever is beyond it is not known live (null or false, never true).
  assert.deepEqual(later.rows.filter(row => logins.includes(row.login)).map(row => [row.login, row.live]),
    later.rows.filter(row => logins.includes(row.login)).map(row => [row.login, ['p01', 'p03'].includes(row.login)]),
    'later suggestions carry cached live');
  assert.ok(later.rows.filter(row => !logins.includes(row.login)).every(row => row.live !== true));
  assert.equal(r.statusRequests(), 1, 'asking again makes no request');
});

test('5b. signed in: one Helix GET /helix/streams with repeated user_login', async () => {
  const r = loadGlobal({people: many(25), liveLogins: ['p02'], signedIn: true});
  await r.signIn();
  await r.showOpen();
  assert.equal(r.statusRequests(), 1, 'exactly one status request');
  // Amended 2026-11-24 (lead, phase 3 decision 2): signed in, live status comes only from Helix; the one GQL
  // lookup allowed is the batched age lookup (lastBroadcast), which must not ask for live status.
  const gqlLive = r.gqlStatus().filter(call => /stream\s*\{/.test(call.options?.data?.query ?? ''));
  assert.equal(gqlLive.length, 0, 'signed in: the documented API first (D-034), no GQL live status');
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
  // Amended 2026-11-24 (phase 3, TESTS-74): G6 adds `details` to the message.
  assert.deepEqual(statuses[0].status, statusMap(logins, ['p02']));
});

test('5c. a failed request gives null for those logins, no retry storm, and no request within 60 s', async () => {
  const r = loadGlobal({people: many(25), statusFails: true});
  await r.showOpen();
  assert.equal(r.statusRequests(), 1);
  const logins = quoted(r.gqlStatus()[0].options.data.query);
  assertBatch(logins, r);
  const statuses = r.messages('suggestions-status');
  assert.equal(statuses.length, 1);
  // Amended 2026-11-24 (phase 3, TESTS-74): G6 adds `details`; a failed request gives none.
  assert.deepEqual(statuses[0].status, Object.fromEntries(logins.map(login => [login, null])));
  assert.deepEqual(Object.keys(statuses[0].details ?? {}), [], 'a failed request gives no details');
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
  // Amended 2026-11-24 (phase 3, TESTS-74): G4 caps the list at 50 (25 people are in history); p01 is live and first.
  assert.deepEqual(reopened.rows.map(row => row.login), r.oracle('').map(row => row.login), 'all 25 people, p01 (live) already first');
  assert.deepEqual(reopened.rows.slice(0, 20).map(row => [row.login, row.live]),
    r.oracle('').slice(0, 20).map(row => [row.login, row.login === 'p01']), 'cached values on the reopened page');
  assert.ok(reopened.rows.slice(20).every(row => row.live !== true));
  r.shim.timers.advance(29999);
  await r.reopen();
  assert.equal(r.statusRequests(), 1, 'still one at 59.999 s');
  r.shim.timers.advance(1);
  await r.reopen();
  assert.equal(r.statusRequests(), 2, 'a new request at 60 s');
});

// Lead, 2026-11-24, after a mutation check of the global build: removing the form check on a late status answer
// failed no test. Class C governs what reaches the form. The live values themselves are global's data, so they are
// cached either way, and the 60 s rule holds for a reopen.
test('5e. a status answer arriving after the form closed posts nothing to it, and a reopen within 60 s uses it', async () => {
  const r = loadGlobal({people: many(25), liveLogins: ['p01'], holdStatus: true});
  await r.showOpen();
  assert.equal(r.statusRequests(), 1);
  r.window.send('open-cancel', {});
  await r.settle();
  const before = r.messages('suggestions-status').length;
  r.releaseStatus();
  await r.settle();
  assert.equal(r.messages('suggestions-status').length, before, 'nothing posts to a closed form');

  r.shim.timers.advance(1000);
  r.control.holdStatus = false;
  await r.showOpen();
  assert.equal(r.statusRequests(), 1, 'a reopen within 60 s asks nothing');
  const rows = r.messages('suggestions').at(-1).rows;
  assert.deepEqual(rows.filter(row => row.login === 'p01').map(row => row.live), rows.some(row => row.login === 'p01') ? [true] : [],
    'and shows the cached live value');
  assert.ok(rows.some(row => row.live !== null), 'the cached values are used, not unknown');
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

test('7b. the window keeps its height through a live check and the offline list that follows (no shrink to a spinner)', async () => {
  // Lead, 2026-11-24 ~21:00, design review finding 3: the check used to shrink the window to 112 px, then regrow.
  const r = loadGlobal({precheck: 'offline'});
  await r.showOpen();
  const frames = () => r.shim.standaloneWindow.frames;
  const opened = frames().at(-1).height;
  const before = frames().length;
  r.window.send('open-stream', {input: 'ohnepixel'});
  await r.settle();
  assert.equal(r.messages('offline-vods').at(-1).state, 'ready', 'the offline list arrived');
  for (const frame of frames().slice(before)) assert.equal(frame.height, opened, 'every resize keeps the opened height');
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

// Lead, 2026-11-24, after merging #75: a person's broadcasts asked for from a suggestion go through Helix when signed
// in, like the typed path (tests/helix-vods-075.test.js).
test('8b. signed in, open-vods lists broadcasts through Helix, with no GQL archive request', async () => {
  const r = loadGlobal({signedIn: true});
  await r.signIn();
  await r.showOpen();
  r.window.receive('open-vods', {login: 'ohnepixel'});
  await r.settle();
  const helixCalls = r.calls().filter(call => /\/helix\/(users|videos)/.test(call.url));
  assert.deepEqual(helixCalls.map(call => new URL(call.url).pathname), ['/helix/users', '/helix/videos']);
  assert.equal(r.archives().length, 0, 'no GQL archive request');
  assert.deepEqual(r.messages('offline-vods').at(-1).items.map(item => item.title), ['Helix Archive']);
});

test('9. paused history still serves suggestions; cleared history serves rows: []', async () => {
  const paused = loadGlobal({paused: true});
  await paused.showOpen();
  const first = paused.messages('suggestions').find(message => message.text === '');
  assert.ok(first, 'a paused history answers open-ready');
  assert.deepEqual(first.rows.map(identity), paused.oracle('').slice(0, 20));
  assert.deepEqual((await paused.ask('oh')).rows.map(identity), paused.oracle('oh').slice(0, 20));

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
  // Amended 2026-11-24 (phase 3, TESTS-74): G4, up to 50 rows.
  assert.equal(answer.rows.length, 50, 'fixture: 500 matches, 50 answered');
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

// =====================================================================================================================
// Phase 3 (TESTS-74, "your follows and mock A's rows", lead 2026-11-24): G1-G8. Written 2026-11-24 by a Sonnet agent.
// Follows come from Helix /streams/followed and /channels/followed (needs user:read:follows, one new sign-in).
// Where the design leaves a choice, these tests pin the weakest thing: no endpoint is required for details, request
// counts are bounded, and the places the design is silent are listed in the hand-back, not decided here.
// =====================================================================================================================

const FOLLOW_HISTORY = () => [
  person('quillfox', 'Quillfox', 6), person('brindle', 'Brindle', 5), person('tidalmoss', 'Tidal Moss', 4),
  person('northpane', 'North Pane', 3), person('miss_q', 'Miss Quill', 2),
];
const FOLLOWS = [
  {login: 'quillfox', name: 'Quillfox'}, {login: 'lumen_fx', name: 'Lumen FX'}, {login: 'ashgrove', name: 'Ashgrove'},
  {login: 'thequiet', name: 'The Quiet One'}, {login: 'quartzine', name: 'Quartzine'}, {login: 'quenby', name: 'Quenby'},
  {login: 'zephyra', name: 'Zephyra'}, {login: 'arbor_vale', name: 'Arbor Vale'},
];
const FOLLOW_LIVE = ['quillfox', 'tidalmoss', 'lumen_fx', 'ashgrove', 'thequiet'];
const FOLLOW_DETAILS = {
  quillfox: {title: 'Celeste any% attempts', category: 'Celeste', viewers: 1200},
  tidalmoss: {title: 'Tide pool sketching', category: 'Art', viewers: 310},
  lumen_fx: {title: 'Cozy cooking stream', category: 'Just Chatting', viewers: 9000},
  ashgrove: {title: 'Morning ranked grind', category: 'Valorant', viewers: 40},
  thequiet: {title: 'Quiet night walk', category: 'IRL', viewers: 700},
  quartzine: {lastAt: '2026-11-20T18:04:11Z'},
  quenby: {lastAt: '2026-11-22T20:10:00Z'},
  brindle: {lastAt: '2026-11-18T16:00:00Z'},
};
// G4 over the fixture above: live history (history order), live follows by viewers, then the rest.
const AT_REST = ['quillfox', 'tidalmoss', 'lumen_fx', 'thequiet', 'ashgrove',
  'brindle', 'northpane', 'miss_q', 'quenby', 'quartzine', 'arbor_vale', 'zephyra'];

async function openedWithFollows(extra = {}) {
  const r = loadGlobal({people: FOLLOW_HISTORY(), signedIn: true, scopes: FOLLOWS_SCOPES, follows: FOLLOWS,
    liveLogins: FOLLOW_LIVE, details: FOLLOW_DETAILS, ...extra});
  await r.signIn();
  const before = r.calls().length;
  await r.showOpen();
  r.opened = r.calls().slice(before);
  return r;
}

const loginsOf = answer => answer.rows.map(row => row.login);
const lastSuggestions = (r, text) => r.messages('suggestions').filter(message => message.text === text).at(-1);
const paramsOf = call => {
  const params = {...(call.options?.params ?? {})};
  for (const [key, value] of new URL(call.url).searchParams) params[key] = value;
  return params;
};
const mergedStatus = (r, field) => Object.assign({}, ...r.messages('suggestions-status').map(message => message[field] ?? {}));

test('G1. signed in with user:read:follows: one followed-live and one followed-channels request on open, cached for 60 s', async () => {
  const many130 = Array.from({length: 130}, (_, index) => {
    const two = String(index + 1).padStart(3, '0');
    return {login: `fx${two}`, name: `Fx ${two}`};
  });
  const r = loadGlobal({people: many(5), signedIn: true, scopes: FOLLOWS_SCOPES, follows: many130, followsCursor: 'page-two',
    liveLogins: ['fx003']});
  await r.signIn();
  await r.showOpen();
  assert.equal(r.followedLive().length, 1, 'one followed-live request');
  assert.equal(r.followedChannels().length, 1, 'one followed-channels request, though Twitch offers a second page');
  const [live] = r.followedLive();
  const [channels] = r.followedChannels();
  assert.equal(live.method, 'GET');
  assert.equal(new URL(live.url).origin + new URL(live.url).pathname, 'https://api.twitch.tv/helix/streams/followed');
  assert.equal(paramsOf(live).user_id, USER_ID, 'user_id is the one validate returned');
  assert.equal(new URL(channels.url).origin + new URL(channels.url).pathname, 'https://api.twitch.tv/helix/channels/followed');
  assert.equal(paramsOf(channels).user_id, USER_ID);
  assert.equal(paramsOf(channels).first, '100', 'the first page of 100');
  for (const call of [live, channels]) {
    assert.equal(call.options.headers.Authorization, `Bearer ${SAVED.access_token}`);
    assert.ok(call.options.headers['Client-Id'], 'a Client-Id header');
  }
  assert.deepEqual(r.messages('suggestions-follows'), [], 'a token with the scope gets no sign-in note');

  r.shim.timers.advance(30000);
  await r.reopen();
  assert.equal(r.followRequests(), 2, 'reopening at 30 s asks nothing');
  r.shim.timers.advance(29999);
  await r.reopen();
  assert.equal(r.followRequests(), 2, 'still nothing at 59.999 s');
  r.shim.timers.advance(1);
  await r.reopen();
  assert.equal(r.followedLive().length, 2, 'followed-live again at 60 s');
  assert.equal(r.followedChannels().length, 2, 'followed-channels again at 60 s');
});

test('G2. signed in without user:read:follows: no follow requests, one needs-sign-in note per open; signed out: neither', async () => {
  const old = loadGlobal({signedIn: true});
  await old.signIn();
  await old.showOpen();
  assert.equal(old.followRequests(), 0, 'an old token makes no follow request');
  assert.deepEqual(old.messages('suggestions-follows'), [{state: 'needs-sign-in'}], 'one note when the window opens');
  for (let index = 0; index < 10; index++) await old.ask('o' + index);
  assert.equal(old.messages('suggestions-follows').length, 1, 'typing does not repeat it');
  await old.reopen();
  assert.deepEqual(old.messages('suggestions-follows'), [{state: 'needs-sign-in'}, {state: 'needs-sign-in'}], 'one more per open');
  assert.equal(old.followRequests(), 0);

  const out = loadGlobal();
  await out.showOpen();
  await out.reopen();
  assert.equal(out.followRequests(), 0, 'signed out: no follow request');
  assert.deepEqual(out.messages('suggestions-follows'), [], 'signed out: no note');
});

test('G3. rows: people from history and follows, each once, with the same four keys and nothing from visits or scores', async () => {
  const r = await openedWithFollows();
  const answer = await r.ask('');
  const logins = loginsOf(answer);
  assert.equal(new Set(logins).size, logins.length, 'no login twice (quillfox is in both lists)');
  assert.deepEqual([...logins].sort(), [...new Set([...FOLLOW_HISTORY().map(p => p.login), ...FOLLOWS.map(f => f.login)])].sort(),
    'every person from history and every follow');
  for (const row of answer.rows) {
    assert.deepEqual(Object.keys(row).sort(), ['displayName', 'live', 'login', 'provider'], `${row.login}: no visits, no scores`);
    assert.equal(row.provider, 'twitch');
    assert.ok([true, false, null].includes(row.live));
  }
  const byLogin = Object.fromEntries(answer.rows.map(row => [row.login, row]));
  assert.equal(byLogin.lumen_fx.displayName, 'Lumen FX', 'a follow\'s name comes from Twitch');
  assert.equal(byLogin.thequiet.displayName, 'The Quiet One');
  assert.equal(byLogin.lumen_fx.live, true, 'a followed person who is live');
  assert.equal(byLogin.zephyra.live, false, 'a followed person who is not live (the followed-live list is complete)');
});

test('G4. order at rest, signed out: live people first, then the rest, each in history order', async () => {
  const live = ['p05', 'p03', 'p09'];
  const r = loadGlobal({people: many(25), liveLogins: live});
  await r.showOpen();
  const answer = await r.ask('');
  assert.deepEqual(loginsOf(answer), liveFirst(r.oracle(''), live).map(row => row.login));
  assert.deepEqual(loginsOf(answer).slice(0, 3), ['p03', 'p05', 'p09'], 'live people lead, in history order');
});

test('G4. order at rest with follows: live history, live follows by viewers; then history, offline follows by lastAt, then by name', async () => {
  const r = await openedWithFollows();
  assert.deepEqual(r.oracle('').map(row => row.login), ['quillfox', 'brindle', 'tidalmoss', 'northpane', 'miss_q'], 'fixture: history order');
  const answer = await r.ask('');
  assert.deepEqual(loginsOf(answer), AT_REST);
});

test('G4. up to 50 rows, and a live follow beats the cut; the requests do not grow with the people', async () => {
  const follows = Array.from({length: 60}, (_, index) => {
    const two = String(index + 1).padStart(2, '0');
    return {login: `f${two}`, name: `Follow ${two}`};
  });
  const r = loadGlobal({people: many(30), signedIn: true, scopes: FOLLOWS_SCOPES, follows, liveLogins: ['f60']});
  await r.signIn();
  const before = r.calls().length;
  await r.showOpen();
  const answer = await r.ask('');
  assert.equal(answer.rows.length, 50);
  assert.equal(answer.rows[0].login, 'f60', 'the one live follow leads');
  assert.equal(answer.rows[0].live, true);
  assert.deepEqual(loginsOf(answer).slice(1, 31), r.oracle('').map(row => row.login), 'then history, in history order');
  assert.deepEqual(loginsOf(answer).slice(31), Array.from({length: 19}, (_, index) => `f${String(index + 1).padStart(2, '0')}`),
    'then follows with no known lastAt, by display name');
  const used = r.calls().length - before;
  assert.ok(used <= 8, `${used} requests for 90 people: a few batches, not one per person`);
  for (let index = 0; index < 10; index++) await r.ask('f' + index);
  assert.equal(r.calls().length - before, used, 'typing adds no request');
});

test('G5. order while typing, signed out: matches only; prefix before word-start; live first within each', async () => {
  const live = ['oh05', 'mroh'];
  const r = loadGlobal({liveLogins: live});
  await r.showOpen();
  const answer = await r.ask('oh');
  const expected = ['oh05', 'oh01', 'oh02', 'oh03', 'oh04', 'oh06', 'oh07', 'oh08', 'oh09', 'oh10', 'mroh'];
  assert.deepEqual(loginsOf(answer), expected, 'oh05 (live) leads the prefix matches; mroh (live) still follows them');
  assert.ok(!loginsOf(answer).includes('zed'), 'no match, no row');
});

test('G5. order while typing with follows: history.query\'s matching applies to follows too', async () => {
  const r = await openedWithFollows();
  const answer = await r.ask('qu');
  assert.deepEqual(loginsOf(answer), ['quillfox', 'quenby', 'quartzine', 'thequiet', 'miss_q'],
    'prefix: live history, then offline follows newest lastAt first; word-start: live follow, then history');
  assert.deepEqual(loginsOf(await r.ask('quiet')), ['thequiet'], 'a follow matches on a later word of its name');
  assert.deepEqual(loginsOf(await r.ask('zzqxj')), []);
});

test('G6. signed out: details come with the status batch: live gives title, category, viewers; offline gives lastAt when known', async () => {
  const details = {
    p01: {title: 'Speedrun marathon day 3', category: 'Celeste', viewers: 12345},
    p02: {lastAt: '2026-11-20T18:04:11Z', lastTitle: 'Sunday cozy stream'},
  };
  const r = loadGlobal({people: many(25), liveLogins: ['p01'], details});
  await r.showOpen();
  const got = mergedStatus(r, 'details');
  assert.deepEqual(got.p01, {title: 'Speedrun marathon day 3', category: 'Celeste', viewers: 12345});
  // Amended 2026-11-24 (lead, phase 3b; mock A shows an offline person's last broadcast title).
  assert.deepEqual(Object.keys(got.p02 ?? {}).sort(), ['lastAt', 'lastTitle'], 'an offline person with a known last broadcast');
  assert.equal(got.p02.lastTitle, 'Sunday cozy stream');
  assert.equal(typeof got.p02.lastAt, 'string');
  assert.equal(Date.parse(got.p02.lastAt), Date.parse('2026-11-20T18:04:11Z'), 'an ISO time for the same moment');
  assert.equal(got.p03?.lastAt, undefined, 'unknown stays unknown (no lastAt, not 0 or NaN)');
  assert.ok(r.statusRequests() <= 2, `${r.statusRequests()} status requests: the batch, not one per person`);
  for (let index = 0; index < 10; index++) await r.ask('p0' + index);
  assert.ok(r.statusRequests() <= 2, 'typing makes no request');
});

test('G6. signed in: follows\' live details come from the followed-live answer, history people\'s from the status batch', async () => {
  const r = await openedWithFollows();
  const got = mergedStatus(r, 'details');
  for (const login of ['quillfox', 'tidalmoss', 'lumen_fx', 'thequiet', 'ashgrove']) {
    const {title, category, viewers} = FOLLOW_DETAILS[login];
    assert.deepEqual(got[login], {title, category, viewers}, login);
  }
  for (const login of ['lumen_fx', 'thequiet', 'ashgrove']) {
    assert.ok(!r.opened.some(call => JSON.stringify(call).includes(login)), `no request names ${login}: its details came with the follows`);
  }
  assert.ok(r.opened.length <= 8, `${r.opened.length} requests on open`);
  assert.deepEqual(mergedStatus(r, 'status').lumen_fx ?? true, true, 'a live follow is live in status, if status lists it');
  for (const login of ['quenby', 'quartzine']) {
    if (got[login]) assert.deepEqual(Object.keys(got[login]), ['lastAt'], `${login}: an offline person has only lastAt`);
  }
});

test('G7. when status arrives, global posts a new suggestions for the current text, live first', async () => {
  const r = loadGlobal({people: many(25), liveLogins: ['p03'], holdStatus: true});
  await r.showOpen();
  const typed = await r.ask('p0');
  assert.deepEqual(loginsOf(typed).slice(0, 3), ['p01', 'p02', 'p03'], 'fixture: nothing is known live yet');
  const before = r.messages('suggestions').length;
  r.releaseStatus();
  await r.settle();
  const later = r.messages('suggestions').slice(before);
  assert.ok(later.length >= 1, 'a new suggestions message follows the status');
  assert.equal(r.messages('suggestions').at(-1).text, 'p0', 'for the text now in the field');
  assert.deepEqual(loginsOf(r.messages('suggestions').at(-1)).slice(0, 3), ['p03', 'p01', 'p02']);
  assert.equal(r.messages('suggestions').at(-1).rows[0].live, true);
});

test('G7. when the follows arrive, global posts a new suggestions for the current text in G5 order', async () => {
  const r = await openedWithFollows({holdFollows: true});
  const typed = await r.ask('qu');
  assert.ok(!loginsOf(typed).includes('quenby'), 'fixture: the follows have not arrived');
  const before = r.messages('suggestions').length;
  r.releaseFollows();
  await r.settle();
  assert.ok(r.messages('suggestions').length > before, 'a new suggestions message follows the follows');
  const latest = r.messages('suggestions').at(-1);
  assert.equal(latest.text, 'qu');
  assert.deepEqual(loginsOf(latest), ['quillfox', 'quenby', 'quartzine', 'thequiet', 'miss_q']);
});

test('G8. privacy: follow and detail requests carry only logins, the user id and the token in Authorization', async () => {
  const r = await openedWithFollows();
  await r.ask('zzqxj');
  const known = new Set([...FOLLOW_HISTORY().map(p => p.login), ...FOLLOWS.map(f => f.login)]);
  const sent = r.opened.filter(call => !call.url.startsWith('https://id.twitch.tv/'));
  assert.ok(sent.length >= 3, 'fixture: the follows, the status and any details were requested');
  for (const call of sent) {
    const headers = call.options?.headers ?? {};
    const names = Object.keys(headers).map(name => name.toLowerCase());
    const {Authorization, ...rest} = headers;
    const wire = JSON.stringify({...call, options: {...call.options, headers: rest}});
    assert.ok(!wire.includes(SAVED.access_token) && !wire.includes(SAVED.refresh_token), `${call.url}: the token is only in Authorization`);
    assert.ok(!wire.includes('zzqxj'), 'the typed text is never sent');
    if (call.url.startsWith('https://api.twitch.tv/helix/')) {
      assert.deepEqual(names.filter(name => !['authorization', 'client-id'].includes(name)), [], 'Helix headers');
      const params = paramsOf(call);
      const path = new URL(call.url).pathname;
      if (/\/followed$/.test(path)) {
        assert.equal(params.user_id, USER_ID);
        assert.deepEqual(Object.keys(params).filter(key => !['user_id', 'first', 'after'].includes(key)), [], path);
      } else if (path === '/helix/streams') {
        assert.deepEqual(Object.keys(params), ['user_login']);
        assert.ok(new URL(call.url).searchParams.getAll('user_login').every(login => known.has(login)));
      }
    } else if (call.url === GQL) {
      assert.equal(Authorization, undefined, 'GQL stays anonymous');
      assert.deepEqual(names.filter(name => !['client-id', 'content-type'].includes(name)), [], 'GQL headers');
      assert.ok(quoted(call.options.data.query).every(login => known.has(login)), 'only logins in the query');
    } else {
      assert.fail(`unexpected request to ${call.url}`);
    }
  }
});

test('G8. a failed follow request leaves history rows and status working, and no earlier follow is posted as live', async () => {
  const rejections = [];
  const record = reason => rejections.push(reason);
  process.on('unhandledRejection', record);
  try {
    const r = await openedWithFollows();
    assert.equal((await r.ask('')).rows.find(row => row.login === 'lumen_fx')?.live, true, 'fixture: the follows worked once');
    r.shim.timers.advance(60000);
    r.control.followsFail = true;
    const statusBefore = r.messages('suggestions-status').length;
    await r.reopen();
    assert.equal(r.followedLive().length, 2, 'the failing refresh was attempted');
    assert.equal(r.followedChannels().length, 2);
    const answer = await r.ask('');
    const byLogin = Object.fromEntries(answer.rows.map(row => [row.login, row]));
    for (const login of ['lumen_fx', 'thequiet', 'ashgrove']) {
      assert.notEqual(byLogin[login]?.live, true, `${login} is not posted as live from a stale follow list`);
    }
    for (const login of FOLLOW_HISTORY().map(p => p.login)) assert.ok(byLogin[login], `${login} (history) is still a row`);
    assert.equal(byLogin.tidalmoss.live, true, 'history status still works');
    assert.ok(r.messages('suggestions-status').length > statusBefore, 'a status message still arrives');
    await r.settle();
  } finally {
    process.off('unhandledRejection', record);
  }
  assert.deepEqual(rejections, [], 'no unhandled rejection');
});
