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
const {SIGNED_OUT} = require('../src/auth.js');

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
const USER_CODE = 'WXYZ-1234';
const DEVICE_CODE = 'device-code-secret-9f3a';
const VERIFICATION_URI = 'https://www.twitch.tv/activate?public=true';
const OAUTH = 'https://id.twitch.tv/oauth2';

function loadGlobal({people = twelve(), paused = false, signedIn = false, precheck = 'live', liveLogins = [],
  statusFails = false, holdStatus = false, scopes = ['chat:read'], follows = [], details = {}, followsFail = false,
  holdFollows = false, followsCursor = '', builtInClientID = '', gqlFieldError = null,
  searchResults = [], searchHold = false, searchFail = false, searchPartFail = null, followsPaged = false} = {}) {
  const shim = createIina({role: 'global', identifier: ID});
  const text = historyFile(people, paused);
  shim.file.seed(FILE, text);
  if (signedIn) shim.keychain.seed('twitch-readonly', 'oauth', JSON.stringify(SAVED));
  const control = {liveLogins: new Set(liveLogins), statusFails, precheck, holdStatus, held: [], scopes, userID: USER_ID,
    follows, details, followsFail, holdFollows, heldFollows: [], followsCursor, gqlFieldError,
    // Phase 2 rev 2 (search, R11): what Twitch's search answers for a text, in Twitch's order: an array of
    // {login, name}, or a function of the typed text returning one. Live state and details come from liveLogins and
    // details, as for every other person. searchHold holds an answer until releaseSearch(); searchFail answers 503;
    // searchPartFail is 'streams' or 'ages': only that follow-up lookup fails (R11, C5).
    // Phase 2 rev 2, F6: followed channels honour `after`, as Helix does (cursor = the next offset); the older
    // followsCursor option still answers one constant cursor.
    searchResults, searchHold, searchHeld: [], searchFail, searchPartFail, followsPaged};
  // Only the saved grant is valid in these scenarios.
  const tokenScopes = token => token === SAVED.access_token ? control.scopes : null;

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

  // The search fake (phase 2 rev 2, R11). The typed text of a search request: GQL inline `userQuery:"x"` or a
  // `userQuery` variable; Helix `query=x`.
  const searchTextOf = ({url, options}) => {
    if (url === GQL) {
      const inline = String(options?.data?.query ?? '').match(/userQuery:\s*"([^"]*)"/);
      return inline ? inline[1] : String(options?.data?.variables?.userQuery ?? '');
    }
    const fromUrl = new URL(url).searchParams.get('query');
    return fromUrl ?? String(options?.params?.query ?? '');
  };
  const searchFor = text => (typeof control.searchResults === 'function' ? control.searchResults(text) : control.searchResults);
  const everySearchLogin = () => {
    const results = control.searchResults;
    return typeof results === 'function' ? ['ri', 'rid', 'glaze', 'zq'].flatMap(text => results(text)) : results;
  };
  const isSearchLogin = login => everySearchLogin().some(result => result.login === login);
  const post = shim.iina.http.post;
  const get = shim.iina.http.get;
  shim.iina.http.post = (url, options) => {
    const query = options?.data?.query ?? '';
    if (url.startsWith(OAUTH + '/')) {
      const form = options?.data ?? {};
      const path = url.slice(OAUTH.length);
      if (path === '/device') {
        // Keep a realistic pending device flow so an accidental page sign-in is observable.
        shim.http.setResponse({statusCode: 200, data: {device_code: DEVICE_CODE, user_code: USER_CODE,
          verification_uri: VERIFICATION_URI, expires_in: 1800, interval: 5}});
      } else if (path === '/token' && form.grant_type === 'urn:ietf:params:oauth:grant-type:device_code') {
        shim.http.rejectResponse({statusCode: 400, reason: 'Bad Request', text: '',
          data: {status: 400, message: 'authorization_pending'}});
      } else if (path === '/revoke') {
        shim.http.setResponse({statusCode: 200, data: {}});
      } else {
        shim.http.rejectResponse({statusCode: 404, reason: 'Not Found', text: ''});
      }
      return post(url, options);
    }
    if (url === GQL && PRECHECK.test(query)) {
      const stream = control.precheck === 'live' ? {id: '42'} : null;
      shim.http.setResponse({statusCode: 200, data: {data: {user: {stream}}}});
    } else if (url === GQL && query.includes('videos(')) {
      const node = {id: '1234567890', title: 'Fixture Archive', createdAt: '2026-11-20T10:31:57Z', lengthSeconds: 3600};
      shim.http.setResponse({statusCode: 200, data: {data: {user: {videos: {edges: [{node}]}}}}});
    } else if (url === GQL && query.includes('searchFor')) {
      // Phase 2 rev 2 (R11, signed out): anonymous `searchFor(userQuery, platform:"web") {channels{edges{item{...on User
      // {...}}}}}`; shape checked live 2026-11-25 (TESTS-74 R11). Each item carries only the fields the query selects.
      // The `__typename` of an item is User; text comes inline or as a variable.
      if (control.searchFail) {
        shim.http.rejectResponse({statusCode: 503, reason: 'Service Unavailable', text: ''});
        return post(url, options);
      }
      const answer = () => {
        const edges = searchFor(searchTextOf({url, options})).map(({login, name}) =>
          ({item: {__typename: 'User', ...gqlUser(query, login), displayName: name ?? login}}));
        shim.http.setResponse({statusCode: 200, data: {data: {searchFor: {channels: {edges}}}}});
        return post(url, options);
      };
      if (control.searchHold) return new Promise(resolve => control.searchHeld.push(() => resolve(answer())));
      return answer();
    } else if (control.statusFails) {
      shim.http.rejectResponse({statusCode: 503, reason: 'Service Unavailable', text: ''});
    } else if (control.searchPartFail === 'ages' && !/stream\{/.test(query.replace(/\s+/g, ''))
      && quoted(query).some(isSearchLogin)) {
      shim.http.rejectResponse({statusCode: 503, reason: 'Service Unavailable', text: ''});
    } else {
      // A batched status query, in either plausible shape: users(logins:[...]) or aliased user(login:"x").
      const aliased = Array.from(query.matchAll(/(\w+):user\(login:"(\w+)"\)/g));
      const data = {users: quoted(query).map(login => gqlUser(query, login))};
      for (const [, alias, login] of aliased) data[alias] = gqlUser(query, login);
      // Phase 3c, C5: one field fails, as GraphQL reports it: the field is null and `errors` names its path. Only a
      // query that selects lastBroadcast can hit it, so a query without it is untouched.
      let errors;
      if (control.gqlFieldError && /lastBroadcast\{/.test(query.replace(/\s+/g, ''))) {
        const index = quoted(query).indexOf(control.gqlFieldError);
        const alias = aliased.find(([, , login]) => login === control.gqlFieldError)?.[1];
        if (alias) data[alias].lastBroadcast = null;
        if (index >= 0) data.users[index].lastBroadcast = null;
        errors = [{message: 'Service error', path: [alias ?? 'users', ...(alias ? [] : [index]), 'lastBroadcast']}];
      }
      // Amended 2026-11-25 (phase 3c, TESTS-74): only the live-status query is held; an age lookup (C5) is not.
      if (control.holdStatus && /stream\{/.test(query.replace(/\s+/g, ''))) {
        // Held until releaseStatus(): the answer arrives later, on its own turn.
        return new Promise(resolve => control.held.push(() => {
          shim.http.setResponse({statusCode: 200, data: {data, ...(errors ? {errors} : {})}});
          resolve(post(url, options));
        }));
      }
      shim.http.setResponse({statusCode: 200, data: {data, ...(errors ? {errors} : {})}});
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
    const scopes = tokenScopes(String(headers.Authorization ?? '').replace(/^Bearer /, ''));
    if (!scopes || !headers['Client-Id']) return reject(401, 'Invalid OAuth token');
    if (!scopes.includes('user:read:follows')) return reject(401, 'Missing scope: user:read:follows');
    if (!params.user_id) return reject(400, 'Missing required parameter "user_id"');
    if (params.user_id !== control.userID) return reject(400, 'The user_id must match the user ID in the user access token');
    if (url.includes('/channels/followed')) {
      const size = Number(params.first) || 20;
      const offset = control.followsPaged ? Number(params.after) || 0 : 0;
      const page = control.follows.slice(offset, offset + size);
      const pagination = control.followsPaged
        ? (offset + size < control.follows.length ? {cursor: String(offset + size)} : {})
        : (control.followsCursor ? {cursor: control.followsCursor} : {});
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
      const token = String(options?.headers?.Authorization ?? '').replace(/^OAuth /, '');
      const scopes = tokenScopes(token);
      if (!scopes) {
        shim.http.rejectResponse({statusCode: 401, reason: 'Unauthorized', text: '', data: {status: 401, message: 'invalid access token'}});
      } else {
        shim.http.setResponse({statusCode: 200, data: {client_id: SAVED.clientID,
          login: 'reader', user_id: control.userID, scopes, expires_in: 5000}});
      }
    } else if (FOLLOWED.test(url)) {
      if (control.holdFollows) {
        return new Promise(resolve => control.heldFollows.push(() => {
          followedAnswer(url, options);
          resolve(get(url, options));
        }));
      }
      followedAnswer(url, options);
    } else if (/^https:\/\/api\.twitch\.tv\/helix\/search\/channels(\?|$)/.test(url)) {
      // Phase 2 rev 2 (R11, signed in): Helix Search Channels. Documented fields (dev.twitch.tv/docs/api/reference/
      // #search-channels, read 2026-11-25): broadcaster_login, display_name, game_name, is_live, title, started_at;
      // no viewer count and no last-stream time. Needs a user or app token and a Client-Id (policy: both required).
      const answer = () => {
        const headers = options?.headers ?? {};
        const token = String(headers.Authorization ?? '').replace(/^Bearer /, '');
        if (control.searchFail) return shim.http.rejectResponse({statusCode: 503, reason: 'Service Unavailable', text: ''});
        if (!tokenScopes(token) || !headers['Client-Id']) {
          return shim.http.rejectResponse({statusCode: 401, reason: 'Invalid OAuth token', text: '',
            data: {status: 401, message: 'Invalid OAuth token'}});
        }
        const first = Number(new URL(url).searchParams.get('first') ?? options?.params?.first) || 20;
        shim.http.setResponse({statusCode: 200, data: {pagination: {}, data: searchFor(searchTextOf({url, options}))
          .slice(0, first).map(({login, name}) => {
            const d = liveDetails(login);
            const live = control.liveLogins.has(login);
            return {broadcaster_language: 'en', broadcaster_login: login, display_name: name ?? login, game_id: '9',
              game_name: live ? d.category : '', id: '8' + login.length, is_live: live, tag_ids: [], tags: [],
              thumbnail_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/x-profile_image-300x300.png',
              title: live ? d.title : '', started_at: live ? '2026-11-24T09:00:00Z' : ''};
          })}});
      };
      if (control.searchHold) {
        return new Promise(resolve => control.searchHeld.push(() => { answer(); resolve(get(url, options)); }));
      }
      answer();
    } else if (HELIX.test(url)) {
      if (control.searchPartFail === 'streams'
        && new URL(url).searchParams.getAll('user_login').some(isSearchLogin)) {
        shim.http.rejectResponse({statusCode: 503, reason: 'Service Unavailable', text: ''});
      } else if (control.statusFails) {
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
      if (name === './src/twitch-app.js') return {clientID: builtInClientID};
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
  // Amended 2026-11-25 (phase 3c, TESTS-74): C5 lets the age lookup be its own query, so a request that selects no
  // `stream` is an age lookup (gqlAges), not a live-status request; 5a-5e count live-status requests.
  const gqlAll = () => calls().filter(call => call.url === GQL && call.method === 'POST'
    && !PRECHECK.test(call.options?.data?.query ?? '') && !(call.options?.data?.query ?? '').includes('videos('));
  const gqlStatus = () => gqlAll().filter(call => /stream\{/.test(call.options.data.query.replace(/\s+/g, '')));
  const gqlAges = () => gqlAll().filter(call => !/stream\{/.test(call.options.data.query.replace(/\s+/g, '')));
  const helixStatus = () => calls().filter(call => HELIX.test(call.url));
  const followedLive = () => calls().filter(call => /\/helix\/streams\/followed(\?|$)/.test(call.url));
  const followedChannels = () => calls().filter(call => /\/helix\/channels\/followed(\?|$)/.test(call.url));
  // A held follow request counts as made.
  const followRequests = () => followedLive().length + followedChannels().length + control.heldFollows.length;
  // A held request counts as made: the shim records it only once released.
  const statusRequests = () => gqlStatus().length + helixStatus().length + control.held.length;
  const oauthCalls = path => calls().filter(call => call.url === OAUTH + path);
  const validateCalls = () => calls().filter(call => call.url === OAUTH + '/validate');
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

  // Search requests (phase 2 rev 2): GQL searchFor or Helix Search Channels. A held one counts as made.
  const gqlSearch = () => calls().filter(call => call.url === GQL && (call.options?.data?.query ?? '').includes('searchFor'));
  const helixSearch = () => calls().filter(call => /\/helix\/search\/channels(\?|$)/.test(call.url));
  const searchRequests = () => gqlSearch().length + helixSearch().length + control.searchHeld.length;
  const searchTextOfCall = call => searchTextOf({url: call.url, options: call.options});
  const releaseSearch = () => {
    const waiting = control.searchHeld.splice(0);
    assert.ok(waiting.length, 'fixture: a search request is waiting');
    for (const release of waiting) release();
  };
  // Type a text as the page does, let the pause pass, and let the answers settle.
  async function typeSettled(text, ms = 250) {
    window.receive('open-query', {text});
    await settle();
    shim.timers.advance(ms);
    await settle();
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
    gqlSearch, helixSearch, searchRequests, searchTextOfCall, releaseSearch, typeSettled,
    shim, window, control, releaseStatus, releaseFollows, followedLive, followedChannels, followRequests, showOpen, reopen, signIn, settle, ask, messages, calls, gqlStatus, helixStatus,
    statusRequests, prechecks, archives, menuItem, oracle: oracle(text), text, oauthCalls, validateCalls, gqlAll, gqlAges,
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
  // Amended 2026-11-25 (phase 3c, TESTS-74): C1, the first list waits for the status answer (or 450 ms), so here, where
  // the answer is immediate, it already carries the marks, live people first. It was "unknown until the status arrives".
  assert.deepEqual(first.rows.filter(row => logins.includes(row.login)).map(row => [row.login, row.live]),
    liveFirst(r.oracle('').slice(0, 20), ['p01', 'p03']).map(row => [row.login, ['p01', 'p03'].includes(row.login)]),
    'the first list has the status answer in it');
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
  assert.equal(r.helixStatus().length, 1, 'exactly one live-status request (Helix)');
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
  // Amended 2026-11-24 (phase 3, TESTS-74): G6 adds `details`, and the age lookup may post a second message.
  assert.ok(r.messages('suggestions-status').length >= 1);
  assert.deepEqual(mergedStatus(r, 'status'), statusMap(logins, ['p02']));
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

// Amended 2026-11-25 (phase 2 rev 2, TESTS-74): R3/R4 supersede "typed text is never sent anywhere". Typing alone still
// makes no request (no time passes here, and the 250 ms pause is tested in the search tests below); text that fails
// R3/R4 (a URL, an address, anything with / : . ? = & @ #) is never sent, even after the pause has passed.
test('6. no network for typing: ten open-query messages add no request, and text R4 forbids is never sent', async () => {
  const r = loadGlobal();
  await r.showOpen();
  const before = r.calls().length;
  const typed = ['o', 'oh', 'ohn', 'ohne', 'ohnez', 'zzqq', 'zzqqx', 'qz', 'zq', 'x9'];
  for (const text of typed) await r.ask(text);
  assert.equal(r.calls().length, before, 'no HTTP request for typing, before the pause');
  const forbidden = ['https://zzqqx.tv/video?a=b', 'zzqqx.tv', 'zzqqx@home', 'zzqqx#1', 'zzqqx/1', 'zzqqx:1', 'zzqqx&y', 'zzqqx=y'];
  for (const text of forbidden) {
    await r.ask(text);
    r.shim.timers.advance(1000);
    await r.settle();
  }
  assert.equal(r.calls().length, before, 'no HTTP request for text R4 forbids, even after the pause');
  assert.ok(!JSON.stringify(r.calls()).includes('zzqqx'), 'such text was not sent anywhere');
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

test('G2. signed in without user:read:follows: no follow requests, one needs-sign-in note per open; signed out: the same note', async () => {
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

  // Amended 2026-11-25 (phase 3c, TESTS-74): C3, "or no grant exists": a signed-out person gets the same note (the page
  // shows it as the one-action button "Include who you follow"), once per open, and still no follow request.
  const out = loadGlobal();
  await out.showOpen();
  assert.deepEqual(out.messages('suggestions-follows'), [{state: 'needs-sign-in'}], 'signed out: the note, once');
  await out.reopen();
  assert.deepEqual(out.messages('suggestions-follows'), [{state: 'needs-sign-in'}, {state: 'needs-sign-in'}], 'and once per open');
  assert.equal(out.followRequests(), 0, 'signed out: no follow request');
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
  // Amended 2026-11-25 (phase 2 rev 2, TESTS-74): 'f0'..'f9' pass R3 (two characters), so a search follows the 250 ms
  // pause; Y itself adds no request. Time is held just short of the pause (the search is tested below).
  for (let index = 0; index < 10; index++) {
    await r.ask('f' + index);
    r.shim.timers.advance(249);
    await r.settle();
  }
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

// G7 (the repost when status or follows arrive) was superseded by C1 on 2026-11-25 (phase 3c); see the C1 tests below.

// Amended 2026-11-25 (phase 2 rev 2, TESTS-74): the typed text now reaches Twitch's search, and only there (R3/R4/R14);
// the follow-ups of a search (Helix /streams, the age lookup) may name the logins the search answered with.
test('G8. privacy: follow and detail requests carry only logins, the user id and the token in Authorization', async () => {
  const found = {login: 'qzfan', name: 'QzFan'};
  const r = await openedWithFollows({searchResults: [found], liveLogins: [...FOLLOW_LIVE, 'qzfan']});
  await r.ask('zzqxj');
  r.shim.timers.advance(1000);
  await r.settle();
  const known = new Set([...FOLLOW_HISTORY().map(p => p.login), ...FOLLOWS.map(f => f.login), found.login]);
  const isSearch = call => (call.url === GQL && (call.options?.data?.query ?? '').includes('searchFor'))
    || /\/helix\/search\/channels(\?|$)/.test(call.url);
  const sent = r.calls().filter(call => !call.url.startsWith('https://id.twitch.tv/'));
  assert.ok(sent.length >= 3, 'fixture: the follows, the status and any details were requested');
  for (const call of sent) {
    const headers = call.options?.headers ?? {};
    const names = Object.keys(headers).map(name => name.toLowerCase());
    const {Authorization, ...rest} = headers;
    const wire = JSON.stringify({...call, options: {...call.options, headers: rest}});
    assert.ok(!wire.includes(SAVED.access_token) && !wire.includes(SAVED.refresh_token), `${call.url}: the token is only in Authorization`);
    if (isSearch(call)) {
      assert.equal(r.searchTextOfCall(call), 'zzqxj', 'the search carries the typed text and nothing else of the person');
    } else {
      assert.ok(!wire.includes('zzqxj'), 'the typed text is sent only to search');
    }
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
      } else if (path === '/helix/search/channels') {
        assert.deepEqual(Object.keys(params).sort(), ['first', 'query']);
      }
    } else if (call.url === GQL) {
      assert.equal(Authorization, undefined, 'GQL stays anonymous');
      assert.deepEqual(names.filter(name => !['client-id', 'content-type'].includes(name)), [], 'GQL headers');
      if (!isSearch(call)) {
        assert.ok(quoted(call.options.data.query).every(login => known.has(login)), 'only logins in the query');
      }
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


// =====================================================================================================================
// Phase 3c (TESTS-74, lead 2026-11-25): C1-C7, from the design review (P3-1, P3-2) and the backend review (B1-B8).
// Written 2026-11-25 by a Sonnet agent. The scenarios PROBE-1/2/3/5b/7 come from the backend reviewer's harness.
// =====================================================================================================================

const FOLLOW_ONLY = ['lumen_fx', 'ashgrove', 'thequiet', 'quartzine', 'quenby', 'zephyra', 'arbor_vale'];
const suggestionsFor = (r, text) => r.messages('suggestions').filter(message => message.text === text);
const signOut = async r => {
  await r.shim.global.send('auth-forget', {}, '0');
  await r.settle();
};
// Every login named by a suggestions-status message: its status keys and its detail keys.
const statusKeys = message => [...Object.keys(message.status ?? {}), ...Object.keys(message.details ?? {})];
const FIRST_POST_WAIT_MS = 450;

// ---- C1: the order settles once ----

test('C1. the first list waits for the status answer, or 450 ms; the answer then travels only as status, never as a re-sort', async () => {
  const r = loadGlobal({people: many(25), liveLogins: ['p03'], holdStatus: true});
  await r.showOpen();
  assert.equal(r.statusRequests(), 1, 'fixture: the status request is out and held');
  assert.equal(r.messages('suggestions').length, 0, 'nothing is posted while the answer is pending');
  r.shim.timers.advance(FIRST_POST_WAIT_MS - 1);
  await r.settle();
  assert.equal(r.messages('suggestions').length, 0, 'still nothing at 449 ms');
  r.shim.timers.advance(1);
  await r.settle();
  assert.equal(suggestionsFor(r, '').length, 1, 'at 450 ms the first list goes');
  const first = suggestionsFor(r, '')[0];
  assert.deepEqual(loginsOf(first), r.oracle('').map(row => row.login), 'in history order: nothing is known live');
  assert.ok(first.rows.every(row => row.live === null), 'marks unknown');

  r.releaseStatus();
  await r.settle();
  assert.equal(suggestionsFor(r, '').length, 1, 'the late answer posts no new list for the same text');
  assert.equal(r.messages('suggestions-status').at(-1).status.p03, true, 'it travels as status');
  assert.equal((await r.ask('p0')).rows[0].login, 'p03', 'a new text gets the fresh order, live first');

  const posted = r.messages('suggestions').length;
  await r.reopen();
  assert.equal(r.messages('suggestions').length, posted + 1, 'a reopen posts at once: the answer is cached');
  assert.equal(r.messages('suggestions').at(-1).rows[0].login, 'p03', 'with the fresh order');
});

test('C1. answers that come at once make the first list: one post, already in order, and no re-sort after it', async () => {
  const r = loadGlobal({people: many(25), liveLogins: ['p03', 'p07']});
  await r.showOpen();
  assert.equal(suggestionsFor(r, '').length, 1, 'one list for the opening text');
  assert.deepEqual(loginsOf(suggestionsFor(r, '')[0]).slice(0, 3), ['p03', 'p07', 'p01'], 'live first, with no wait for the 450 ms');
  assert.equal(suggestionsFor(r, '')[0].rows[0].live, true, 'and with its mark');
  r.shim.timers.advance(5000);
  await r.settle();
  assert.equal(suggestionsFor(r, '').length, 1, 'nothing more arrives later');
});

test('C1. with follows: one list, in full order, once status and follows have answered', async () => {
  const r = await openedWithFollows();
  assert.equal(suggestionsFor(r, '').length, 1, 'one list for the opening text, not one per answer');
  assert.deepEqual(loginsOf(suggestionsFor(r, '')[0]), AT_REST);
});

test('C1. a follows answer after the 450 ms changes no order: it travels as status, and the next text or a reopen use it', async () => {
  const r = await openedWithFollows({holdFollows: true});
  assert.equal(r.followRequests(), 2, 'fixture: both follow requests are out and held');
  assert.equal(r.messages('suggestions').length, 0, 'the list waits for the follows too');
  r.shim.timers.advance(FIRST_POST_WAIT_MS - 1);
  await r.settle();
  assert.equal(r.messages('suggestions').length, 0, 'still waiting at 449 ms');
  r.shim.timers.advance(1);
  await r.settle();
  assert.deepEqual(loginsOf(suggestionsFor(r, '')[0]), ['quillfox', 'tidalmoss', 'brindle', 'northpane', 'miss_q'],
    'at 450 ms: the people from history, live first, as far as is known');

  r.releaseFollows();
  await r.settle();
  // Amended 2026-11-25 (phase 3d, TESTS-74): D2, a late follows answer is appended below the rows already shown, so a
  // new list may follow; what C1 still pins is that no row above it moves (D2's own test has the rest).
  const lists = suggestionsFor(r, '').map(loginsOf);
  for (let index = 1; index < lists.length; index++) {
    assert.deepEqual(lists[index].slice(0, lists[index - 1].length), lists[index - 1], 'every row already shown stays where it was');
  }
  assert.deepEqual(loginsOf(await r.ask('qu')), ['quillfox', 'quenby', 'quartzine', 'thequiet', 'miss_q'], 'the next text has them');
  await r.reopen();
  assert.deepEqual(loginsOf(r.messages('suggestions').at(-1)), AT_REST, 'and so does a reopen, at once');
});

// ---- C2: Open Stream reads the saved sign-in itself ----

test('C2. a saved follows grant with no player connected: Open Stream validates it, uses Helix, and loads follows', async () => {
  const r = loadGlobal({people: FOLLOW_HISTORY(), signedIn: true, scopes: FOLLOWS_SCOPES, follows: FOLLOWS,
    liveLogins: FOLLOW_LIVE, details: FOLLOW_DETAILS});
  await r.showOpen();
  assert.equal(r.validateCalls().length, 1, 'the saved grant was validated');
  assert.equal(r.followedLive().length, 1, 'one followed-live request');
  assert.equal(r.followedChannels().length, 1, 'one followed-channels request');
  assert.equal(r.helixStatus().length, 1, 'live status through Helix (D-034), as for a signed-in player');
  assert.deepEqual(loginsOf(suggestionsFor(r, '')[0]), AT_REST, 'the follows are in the first list');
  assert.deepEqual(r.messages('suggestions-follows'), [], 'no note');
  assert.deepEqual(r.shim.global.posts.filter(post => /^auth-/.test(post.name)), [], 'no player was told anything');
});

test('C2. a saved grant without the follows scope, no player: the note, and no follow request', async () => {
  const r = loadGlobal({people: FOLLOW_HISTORY(), signedIn: true, follows: FOLLOWS, liveLogins: FOLLOW_LIVE});
  await r.showOpen();
  assert.equal(r.validateCalls().length, 1, 'the saved grant was validated');
  assert.deepEqual(r.messages('suggestions-follows'), [{state: 'needs-sign-in'}]);
  assert.equal(r.followRequests(), 0);
  assert.equal(r.helixStatus().length, 1, 'its token is good for live status');
});

test('C2. global holds the credentials while Open Stream shows or a player uses them, and drops them when neither does', async () => {
  const alone = loadGlobal({people: FOLLOW_HISTORY(), signedIn: true, scopes: FOLLOWS_SCOPES, follows: FOLLOWS});
  await alone.showOpen();
  assert.equal(alone.validateCalls().length, 1, 'fixture: Open Stream read the grant');
  alone.window.send('open-cancel', {});
  alone.shim.timers.advance(3700000);
  await alone.settle();
  assert.equal(alone.validateCalls().length, 1, 'closed, with no player: the grant is dropped, so nothing validates it again');

  const held = loadGlobal({people: FOLLOW_HISTORY(), signedIn: true, scopes: FOLLOWS_SCOPES, follows: FOLLOWS});
  await held.signIn();
  assert.equal(held.validateCalls().length, 1);
  await held.showOpen();
  held.window.send('open-cancel', {});
  held.shim.timers.advance(3700000);
  await held.settle();
  assert.equal(held.validateCalls().length, 2, 'a player still uses it: Open Stream closing does not drop it');
});

// Removed 2026-11-25 (lead): the follows sign-in from Open Stream is gone (operator, W-21 update); sign-in in the player's panel asks for both permissions.
// (C3: four tests; D1: four tests and the four-ends loop, eight cases.)

// ---- C4: account changes and late answers while Open Stream shows ----

test('C4. sign-out while open: follow-only people leave the list, live status is asked again, and the note returns', async () => {
  const r = await openedWithFollows();
  assert.ok(loginsOf(lastSuggestions(r, '')).includes('lumen_fx'), 'fixture: the follows are in the list');
  const liveRequests = () => r.gqlStatus().filter(call => /stream\{/.test(call.options.data.query)).length;
  const before = liveRequests();
  const notes = r.messages('suggestions-follows').length;
  await signOut(r);
  const rows = loginsOf(lastSuggestions(r, ''));
  assert.deepEqual(rows.filter(login => FOLLOW_ONLY.includes(login)), [], 'no follow-only person stays');
  assert.deepEqual([...rows].sort(), FOLLOW_HISTORY().map(p => p.login).sort(), 'the people from history stay');
  assert.ok(liveRequests() > before, 'live status is asked again, now without the account (anonymous GQL)');
  const status = r.messages('suggestions-status').at(-1);
  assert.equal(status.status.quillfox, true, 'and its answer reaches the page');
  assert.deepEqual(statusKeys(status).filter(login => FOLLOW_ONLY.includes(login)), [], 'with nothing about people who are gone');
  assert.equal(r.messages('suggestions-follows').length, notes + 1, 'the page is told the follows are off');
});

test('C4. sign-in while open: the follows are asked for the showing form and its list gets them', async () => {
  const r = loadGlobal({people: FOLLOW_HISTORY(), scopes: FOLLOWS_SCOPES, follows: FOLLOWS, liveLogins: FOLLOW_LIVE,
    details: FOLLOW_DETAILS});
  await r.showOpen();
  assert.equal(r.followRequests(), 0, 'fixture: nothing to ask while signed out');
  r.shim.keychain.seed('twitch-readonly', 'oauth', JSON.stringify(SAVED));
  await r.signIn();
  await r.settle();
  assert.equal(r.followedLive().length, 1);
  assert.equal(r.followedChannels().length, 1);
  assert.ok(r.helixStatus().length >= 1, 'live status through the account now');
  assert.ok(loginsOf(lastSuggestions(r, '')).includes('lumen_fx'), 'the open list has the follows');
});

test('C4. closing and reopening while the follows are in flight: the answer reaches the reopened window', async () => {
  const r = loadGlobal({people: FOLLOW_HISTORY(), signedIn: true, scopes: FOLLOWS_SCOPES, follows: FOLLOWS,
    liveLogins: FOLLOW_LIVE, details: FOLLOW_DETAILS, holdFollows: true});
  await r.signIn();
  await r.showOpen();
  r.window.send('open-cancel', {});
  await r.showOpen();
  assert.equal(r.followRequests(), 2, 'the reopen asks nothing: the first requests are still current');
  r.releaseFollows();
  for (let turn = 0; turn < 2; turn++) await r.settle();
  assert.deepEqual(loginsOf(lastSuggestions(r, '')), AT_REST, 'the reopened window\'s first list has the follows');
});

// ---- C5: a detail or age error never wipes live status ----

test('C5. signed out: an error on one person\'s last broadcast leaves everyone\'s live status', async () => {
  const r = loadGlobal({people: many(25), liveLogins: ['p01', 'p03'], gqlFieldError: 'p02',
    details: {p01: {title: 'Open mic', category: 'Music', viewers: 40}, p02: {lastAt: '2026-11-20T18:04:11Z'}}});
  await r.showOpen();
  const batch = r.oracle('').slice(0, 20).map(row => row.login);
  assert.ok(r.gqlAll().some(call => /lastBroadcast/.test(call.options.data.query)), 'fixture: the field that errs was asked for');
  assert.deepEqual(mergedStatus(r, 'status'), statusMap(batch, ['p01', 'p03']), 'live status is intact for all 20');
  assert.deepEqual(mergedStatus(r, 'details').p01, {title: 'Open mic', category: 'Music', viewers: 40}, 'and so are live details');
  assert.equal(mergedStatus(r, 'details').p02?.lastAt, undefined, 'only the one age is lost');
  assert.deepEqual(loginsOf(suggestionsFor(r, '')[0]).slice(0, 2), ['p01', 'p03'], 'the list still puts the live people first');
});

test('C5. signed in: an error in the age lookup leaves Helix live status', async () => {
  const r = await openedWithFollows({gqlFieldError: 'northpane'});
  const status = mergedStatus(r, 'status');
  assert.equal(status.quillfox, true);
  assert.equal(status.tidalmoss, true);
  assert.equal(status.brindle, false);
  const details = mergedStatus(r, 'details');
  assert.equal(details.northpane?.lastAt, undefined, 'fixture: the one age that errs is lost');
  assert.equal(details.brindle?.lastAt, FOLLOW_DETAILS.brindle.lastAt, 'the other ages in that lookup survive');
  assert.equal(details.quenby?.lastAt, FOLLOW_DETAILS.quenby.lastAt, 'and so do the follows\' ages');
});

// ---- C6: user_id must be digits ----

for (const bad of ['abc', '77001x', '../users', '12 34', '', undefined]) {
  test(`C6. a validate user_id of ${JSON.stringify(bad)} makes no follow request and counts as needing sign-in`, async () => {
    const r = loadGlobal({people: FOLLOW_HISTORY(), signedIn: true, scopes: FOLLOWS_SCOPES, follows: FOLLOWS, liveLogins: FOLLOW_LIVE});
    r.control.userID = bad;
    await r.shim.global.send('auth-connect', {}, '0');
    await r.settle();
    await r.showOpen();
    assert.equal(r.followRequests(), 0, 'no follow request');
    assert.ok(!JSON.stringify(r.calls()).includes('user_id'), 'and no user_id leaves global');
    assert.deepEqual(r.messages('suggestions-follows'), [{state: 'needs-sign-in'}]);
    assert.ok(!loginsOf(suggestionsFor(r, '').at(-1)).includes('lumen_fx'), 'no follow in the list');
  });
}

// ---- C7: status and details only for the people in the rows sent ----

test('C7. suggestions-status names only people in the rows sent, at most 50 in each part', async () => {
  const follows = Array.from({length: 60}, (_, index) => {
    const two = String(index + 1).padStart(2, '0');
    return {login: `f${two}`, name: `Follow ${two}`};
  });
  const r = loadGlobal({people: many(30), signedIn: true, scopes: FOLLOWS_SCOPES, follows, liveLogins: ['f60', 'p02'],
    details: {f59: {lastAt: '2026-11-21T10:00:00Z'}, f58: {lastAt: '2026-11-22T10:00:00Z'}}});
  await r.signIn();
  await r.showOpen();
  await r.ask('f0');
  await r.ask('');
  const sent = new Set(r.messages('suggestions').flatMap(message => loginsOf(message)));
  assert.ok(sent.size >= 50, 'fixture: the lists sent cover at least 50 people');
  const statuses = r.messages('suggestions-status');
  assert.ok(statuses.length >= 1, 'fixture: status was published');
  for (const message of statuses) {
    assert.ok(Object.keys(message.status ?? {}).length <= 50, 'at most 50 in status');
    assert.ok(Object.keys(message.details ?? {}).length <= 50, 'at most 50 in details');
    assert.deepEqual(statusKeys(message).filter(login => !sent.has(login)), [], 'only people in a list that was sent');
  }
  assert.equal(mergedStatus(r, 'status').f60, true, 'fixture: a person who is in the list has status');
});

// =====================================================================================================================
// Phase 3d (TESTS-74, lead 2026-11-25): D1-D5, from the two 3c re-checks (design P3c-1, backend MAJOR 1-2). Written
// 2026-11-25 by a Sonnet agent. The scenarios R7-R12 come from the backend re-check's harness (probe74r2).
// =====================================================================================================================

const authPosts = (r, since = 0) => r.shim.global.posts.slice(since).filter(post => /^auth-/.test(post.name));
const connectPlayer = async (r, label) => {
  await r.shim.global.send('auth-connect', {}, label);
  await r.settle();
};
const settleTimes = async (r, times = 4) => {
  for (let turn = 0; turn < times; turn++) await r.settle();
};
// Removed 2026-11-25 (lead): the follows sign-in from Open Stream is gone (operator, W-21 update); sign-in in the player's panel asks for both permissions.

test('the page\'s follows-connect and follows-open start no sign-in: no device request, no revoke, no Keychain write, no address, no auth message', async () => {
  const r = loadGlobal({people: FOLLOW_HISTORY(), signedIn: true});
  await r.signIn();
  await connectPlayer(r, '1');
  await r.showOpen();
  assert.deepEqual(r.messages('suggestions-follows'), [{state: 'needs-sign-in'}], 'fixture: a saved grant without the follows scope');
  const keychain = r.shim.keychain.get('twitch-readonly', 'oauth');
  const writes = r.shim.keychain.writes.length;
  const posts = r.shim.global.posts.length;
  const requests = r.calls().length;
  r.window.receive('follows-connect', {});
  await r.settle();
  r.window.receive('follows-open', {});
  await r.settle();
  r.shim.timers.advance(10000);
  await r.settle();
  assert.deepEqual(r.oauthCalls('/device'), [], 'no device-code request to id.twitch.tv');
  assert.deepEqual(r.oauthCalls('/revoke'), [], 'nothing is revoked');
  assert.equal(r.shim.keychain.get('twitch-readonly', 'oauth'), keychain, 'the Keychain holds the same grant');
  assert.deepEqual(r.shim.keychain.writes.slice(writes), [], 'nothing is written to the Keychain');
  assert.deepEqual(r.shim.utils.opened, [], 'no address is opened');
  assert.deepEqual(authPosts(r, posts).map(post => [post.target, post.name]), [], 'no player is sent an auth message');
  assert.deepEqual(r.messages('follows-code'), [], 'the page is given no code');
  assert.equal(r.calls().length, requests, 'and no request of any kind follows');
});

// ---- D2: a late follows answer still reaches the list ----

for (const player of [true, false]) {
  test(`D2. a follows answer after the first list is appended below it; the rows above never move (${player ? 'with' : 'without'} a player)`, async () => {
    const r = loadGlobal({people: FOLLOW_HISTORY(), signedIn: true, scopes: FOLLOWS_SCOPES, follows: FOLLOWS,
      liveLogins: FOLLOW_LIVE, details: FOLLOW_DETAILS, holdFollows: true});
    if (player) await r.signIn();
    await r.showOpen();
    r.shim.timers.advance(FIRST_POST_WAIT_MS);
    await r.settle();
    const first = suggestionsFor(r, '')[0];
    assert.deepEqual([...loginsOf(first)].sort(), FOLLOW_HISTORY().map(p => p.login).sort(), 'fixture: the first list is history only');
    r.releaseFollows();
    await settleTimes(r, 6);
    const lists = suggestionsFor(r, '').map(loginsOf);
    assert.ok(lists.length >= 2, 'the late answer posts the people it adds');
    for (let index = 1; index < lists.length; index++) {
      assert.deepEqual(lists[index].slice(0, lists[index - 1].length), lists[index - 1], `list ${index + 1} keeps every row of list ${index}`);
    }
    const appended = lists.at(-1).slice(first.rows.length);
    assert.deepEqual([...appended].sort(), [...FOLLOW_ONLY].sort(), 'what is added is the follow-only people');
    const status = mergedStatus(r, 'status');
    const details = mergedStatus(r, 'details');
    assert.equal(status.lumen_fx, true, 'their marks follow in suggestions-status');
    assert.equal(details.lumen_fx?.title, FOLLOW_DETAILS.lumen_fx.title, 'and their details (the live title)');
    assert.deepEqual(loginsOf(await r.ask('lu')), ['lumen_fx'], 'a new text uses them as well');
  });
}

// ---- D3: caches outlive the window for 60 s ----

test('D3. a reopen within 60 s with no player shows the cached status and follows at once, and asks for nothing', async () => {
  const r = loadGlobal({people: FOLLOW_HISTORY(), signedIn: true, scopes: FOLLOWS_SCOPES, follows: FOLLOWS,
    liveLogins: FOLLOW_LIVE, details: FOLLOW_DETAILS});
  await r.showOpen();
  assert.deepEqual(loginsOf(suggestionsFor(r, '').at(-1)), AT_REST, 'fixture: the first open has everything');
  const requests = {follows: r.followRequests(), status: r.helixStatus().length, ages: r.gqlAges().length};
  r.window.send('open-cancel', {});
  await r.settle();
  r.shim.timers.advance(5000);
  const lists = suggestionsFor(r, '').length;
  await r.showOpen();
  assert.equal(suggestionsFor(r, '').length, lists + 1, 'the reopen posts its list without waiting for the 450 ms');
  assert.deepEqual(loginsOf(suggestionsFor(r, '').at(-1)), AT_REST, 'with the follows and live people in it');
  assert.deepEqual({follows: r.followRequests(), status: r.helixStatus().length, ages: r.gqlAges().length}, requests,
    'and with no new follow, status or age request');
  r.window.send('open-cancel', {});
  await r.settle();
  r.shim.timers.advance(60000);
  await r.showOpen();
  await settleTimes(r);
  assert.equal(r.followRequests(), requests.follows * 2, 'past 60 s the follows are asked for again (G1)');
  assert.equal(r.helixStatus().length, requests.status + 1, 'and so is live status');
});

test('D3. a kept cache is shown only to the same account: a signed-out or different account gets none of the follows', async () => {
  const kept = loadGlobal({people: FOLLOW_HISTORY(), signedIn: true, scopes: FOLLOWS_SCOPES, follows: FOLLOWS,
    liveLogins: FOLLOW_LIVE, details: FOLLOW_DETAILS});
  await kept.showOpen();
  const asked = kept.followRequests();
  kept.window.send('open-cancel', {});
  await kept.settle();
  await kept.showOpen();
  assert.equal(kept.followRequests(), asked, 'fixture: the same account reopening uses the cache (D3)');

  const out = loadGlobal({people: FOLLOW_HISTORY(), signedIn: true, scopes: FOLLOWS_SCOPES, follows: FOLLOWS,
    liveLogins: FOLLOW_LIVE, details: FOLLOW_DETAILS});
  await out.showOpen();
  out.window.send('open-cancel', {});
  await out.settle();
  out.shim.keychain.seed('twitch-readonly', 'oauth', SIGNED_OUT);
  await out.showOpen();
  await settleTimes(out);
  assert.deepEqual(loginsOf(suggestionsFor(out, '').at(-1)).filter(login => FOLLOW_ONLY.includes(login)), [],
    'the grant is gone: no follow of the old account is shown');
  assert.deepEqual(out.messages('suggestions-follows').at(-1), {state: 'needs-sign-in'});

  const other = loadGlobal({people: FOLLOW_HISTORY(), signedIn: true, scopes: FOLLOWS_SCOPES, follows: FOLLOWS,
    liveLogins: FOLLOW_LIVE, details: FOLLOW_DETAILS});
  await other.showOpen();
  other.window.send('open-cancel', {});
  await other.settle();
  other.control.userID = '88002';
  other.control.follows = [];
  await other.showOpen();
  await settleTimes(other);
  assert.deepEqual(loginsOf(suggestionsFor(other, '').at(-1)).filter(login => FOLLOW_ONLY.includes(login)), [],
    'a different account: none of the first account\'s follows');
});

// ---- D5: a slow validate is a late answer, not an account change ----

test('D5. a validate that answers after the first list changes no order: the people it adds are appended, the marks come as status', async () => {
  const r = loadGlobal({people: FOLLOW_HISTORY(), signedIn: true, scopes: FOLLOWS_SCOPES, follows: FOLLOWS,
    liveLogins: FOLLOW_LIVE, details: FOLLOW_DETAILS});
  const get = r.shim.iina.http.get;
  const held = [];
  r.shim.iina.http.get = (url, options) => url.endsWith('/oauth2/validate') && !held.released
    ? new Promise(resolve => held.push(() => { held.released = true; resolve(get(url, options)); })) : get(url, options);
  await r.showOpen();
  r.shim.timers.advance(FIRST_POST_WAIT_MS);
  await r.settle();
  assert.equal(suggestionsFor(r, '').length, 1, 'fixture: the first list went at 450 ms, before the validate answered');
  const first = loginsOf(suggestionsFor(r, '')[0]);
  assert.deepEqual([...first].sort(), FOLLOW_HISTORY().map(p => p.login).sort(), 'fixture: it is history only');
  held.shift()();
  await settleTimes(r, 8);
  const lists = suggestionsFor(r, '').map(loginsOf);
  for (let index = 1; index < lists.length; index++) {
    assert.deepEqual(lists[index].slice(0, lists[index - 1].length), lists[index - 1], `list ${index + 1} keeps every row of list ${index}`);
  }
  assert.ok(FOLLOW_ONLY.every(login => lists.at(-1).includes(login)), 'the follows are appended once the account is known');
  assert.equal(mergedStatus(r, 'status').tidalmoss, true, 'live marks come in suggestions-status');
});

// =====================================================================================================================
// Phase 2 rev 2: search (TESTS-74 "Phase 2 rev 2: search", R1-R14; lead's answers 2026-11-25). Written 2026-11-25.
// Fixtures: the chosen mock's frames, mock-74-search/index.html variant 1: (b) "ri" (two follows, then others) and
// (c) "glaze" (no follow matches). The names, live states and viewer counts are the mock's made-up data.
// What the fakes model: Helix Search Channels (documented fields only: no viewer count, no last-stream time) and the
// anonymous GQL `searchFor`, shaped by the fields the query selects (see loadGlobal). Where the contract is silent
// these tests pin the readings the lead adopted (TESTS-74, "Rev 2 decisions"); the hand-back lists them.
// =====================================================================================================================

const SEARCH_NAMES = {
  riverlark: 'Riverlark', rimecraft: 'Rimecraft', dunmore: 'dunmore', rivenshade: 'RivenShade', riptidejoe: 'riptidejoe',
  rinnyruns: 'rinnyruns', glazewright: 'Glazewright', glazedgourd: 'glazed_gourd', glazier9: 'glazier9',
};
const searchResult = login => ({login, name: SEARCH_NAMES[login] ?? login});
// Twitch's order for "ri": deliberately not the order the list should come out in.
const RI_RESULTS = ['rinnyruns', 'riptidejoe', 'riverlark', 'rivenshade', 'rimecraft', 'dunmore'].map(searchResult);
const GLAZE_RESULTS = ['glazier9', 'glazedgourd', 'glazewright'].map(searchResult);
const SEARCH_LIVE = ['riverlark', 'rivenshade', 'riptidejoe', 'glazewright', 'glazedgourd'];
const SEARCH_DETAILS = {
  riverlark: {title: 'first time through, no spoilers', category: 'Outer Wilds', viewers: 2140},
  rimecraft: {lastAt: '2026-11-23T10:00:00Z', lastTitle: 'Frostpunk 2, the long night'},
  dunmore: {lastAt: '2026-11-20T10:00:00Z', lastTitle: 'speedrun practice'},
  rivenshade: {title: 'ranked grind to radiant', category: 'Valorant', viewers: 15400},
  riptidejoe: {title: 'sloop life', category: 'Sea of Thieves', viewers: 880},
  rinnyruns: {lastAt: '2026-11-21T09:00:00Z', lastTitle: 'knitting night'},
  glazewright: {title: 'throwing a tea set live', category: 'Makers & Crafting', viewers: 3420},
  glazedgourd: {title: 'morning coffee', category: 'Just Chatting', viewers: 190},
  glazier9: {lastAt: '2026-11-11T10:00:00Z', lastTitle: 'stained glass part 2'},
};
const searchFixture = text => (text.toLowerCase().includes('glaze') ? GLAZE_RESULTS : RI_RESULTS);
const SEARCH_HISTORY = () => [person('riverlark', 'Riverlark', 4), person('dunmore', 'dunmore', 3)];
const SEARCH_FOLLOWS = [{login: 'riverlark', name: 'Riverlark'}, {login: 'rimecraft', name: 'Rimecraft'}];

// Signed in with follows, or signed out (history only), Open Stream open, nothing typed.
async function searchRig({signedIn = false, ...extra} = {}) {
  const base = {people: SEARCH_HISTORY(), liveLogins: SEARCH_LIVE, details: SEARCH_DETAILS, searchResults: searchFixture};
  const r = signedIn
    ? loadGlobal({...base, signedIn: true, scopes: FOLLOWS_SCOPES, follows: SEARCH_FOLLOWS, ...extra})
    : loadGlobal({...base, ...extra});
  if (signedIn) await r.signIn();
  await r.showOpen();
  r.before = r.calls().length;
  return r;
}

const searchAnswers = (r, text = 'ri') => r.messages('suggestions-search')
  .filter(message => message.text.trim().toLowerCase() === text.trim().toLowerCase());
const searchPending = (r, text = 'ri') => r.messages('suggestions-search-pending')
  .filter(message => message.text.trim().toLowerCase() === text.trim().toLowerCase()).map(message => message.pending);
const logins = rows => rows.map(row => row.login);
const MODES = [['signed out', false], ['signed in', true]];

// R3 timing. Red now: no search request is ever made.
for (const [mode, signedIn] of MODES) {
  test(`R3. ${mode}: nothing is requested before the text has been still for 250 ms; then exactly one request`, async () => {
    const r = await searchRig({signedIn});
    r.window.receive('open-query', {text: 'ri'});
    await r.settle();
    r.shim.timers.advance(249);
    await r.settle();
    assert.equal(r.searchRequests(), 0, 'no search request at 249 ms');
    r.shim.timers.advance(1);
    await r.settle();
    assert.equal(r.searchRequests(), 1, 'one search request at 250 ms');
    r.shim.timers.advance(5000);
    await r.settle();
    assert.equal(r.searchRequests(), 1, 'and no second one for the same text');
  });
}

test('R3. the pause restarts on every change: typing r, ri, rid inside the pause asks once, for rid, 250 ms after the last key', async () => {
  const r = await searchRig();
  r.window.receive('open-query', {text: 'r'});
  await r.settle();
  r.shim.timers.advance(100);
  r.window.receive('open-query', {text: 'ri'});
  await r.settle();
  r.shim.timers.advance(100);
  r.window.receive('open-query', {text: 'rid'});
  await r.settle();
  r.shim.timers.advance(249);
  await r.settle();
  assert.equal(r.searchRequests(), 0, 'nothing 249 ms after the last key');
  r.shim.timers.advance(1);
  await r.settle();
  assert.equal(r.searchRequests(), 1, 'one request');
  assert.equal(r.searchTextOfCall(r.gqlSearch()[0]), 'rid', 'for the text the field holds now');
});

test('R3. what passes: 2-40 characters of letters (Unicode), digits, underscore and spaces, after trimming', async () => {
  const r = await searchRig();
  const passing = ['ri', 'a b', 'ñandú', 'x_y', 'zz9', '  glaze', 'q'.repeat(40), 'ab '];
  for (const text of passing) await r.typeSettled(text);
  assert.equal(r.searchRequests(), passing.length, 'each distinct passing text is searched once');
  const sent = r.gqlSearch().map(call => r.searchTextOfCall(call));
  assert.deepEqual(sent, passing.map(text => text.trim()), 'with the trimmed text');
});

test('R3/R4. what is never sent: one character, empty, 41 characters, other punctuation, and anything with / : . ? = & @ #', async () => {
  for (const [, signedIn] of MODES) {
    const r = await searchRig({signedIn});
    const refused = ['r', '', '   ', 'q'.repeat(41), 'a-b', 'a!b', 'https://www.twitch.tv/riverlark', 'twitch.tv/riverlark',
      'a/b', 'a:b', 'a.b', 'a?b', 'a=b', 'a&b', '@ab', '#ab', 'ab cd?x=1'];
    for (const text of refused) await r.typeSettled(text, 1000);
    assert.equal(r.searchRequests(), 0, 'no search request for any of them');
    assert.equal(r.messages('suggestions-search').length, 0, 'no suggestions-search message');
    assert.equal(r.messages('suggestions-search-pending').length, 0, 'no pending message');
    assert.ok(!JSON.stringify(r.calls().slice(r.before)).includes('twitch.tv/riverlark'), 'a pasted address is not sent');
  }
});

test('R2. at rest (empty field): no search request and no search message, signed in or out', async () => {
  for (const [, signedIn] of MODES) {
    const r = await searchRig({signedIn});
    r.shim.timers.advance(5000);
    await r.settle();
    await r.ask('');
    r.shim.timers.advance(5000);
    await r.settle();
    assert.equal(r.searchRequests(), 0);
    assert.equal(r.messages('suggestions-search').length, 0);
  }
});

// R11 signed out. Red now: no request, so nothing is asked and nothing answered.
test('R11. signed out: one anonymous GQL searchFor with the web platform and the selection R11 names, and nothing else', async () => {
  const r = await searchRig();
  const before = r.calls().length;
  await r.typeSettled('ri');
  const added = r.calls().slice(before);
  assert.equal(added.length, 1, `exactly one request for O, got ${added.length}`);
  const [call] = added;
  assert.equal(call.url, GQL);
  assert.equal(call.method, 'POST');
  assert.equal(r.helixSearch().length, 0, 'no Helix search signed out');
  const headers = call.options.headers ?? {};
  assert.equal(headers.Authorization, undefined, 'no token');
  assert.ok(headers['Client-Id'] && headers['Client-Id'] !== SAVED.clientID, 'the public web client id, not the viewer\'s');
  assert.equal(r.searchTextOfCall(call), 'ri');
  const flat = call.options.data.query.replace(/\s+/g, '');
  assert.ok(flat.includes('searchFor(') && /platform:"web"/.test(flat), 'searchFor with platform "web"');
  assert.ok(/channels\{edges\{item\{/.test(flat), 'channels.edges.item');
  for (const piece of ['login', 'displayName', 'viewersCount', 'game{displayName']) assert.ok(flat.includes(piece), piece);
  assert.ok(/lastBroadcast\{[^}]*startedAt/.test(flat) && /lastBroadcast\{[^}]*title/.test(flat), 'lastBroadcast{startedAt title}');
});

test('R11. signed in: Helix search with the viewer\'s token, one /streams for live results, one age lookup for offline ones', async () => {
  const r = await searchRig({signedIn: true});
  const before = r.calls().length;
  await r.typeSettled('ri');
  const added = r.calls().slice(before);
  assert.equal(r.gqlSearch().length, 0, 'no GQL searchFor signed in');
  assert.equal(r.helixSearch().length, 1, 'one Helix search request');
  const [search] = r.helixSearch();
  assert.equal(search.method, 'GET');
  const params = paramsOf(search);
  assert.equal(params.query, 'ri');
  assert.equal(params.first, '10');
  assert.equal(search.options.headers.Authorization, `Bearer ${SAVED.access_token}`);
  assert.ok(search.options.headers['Client-Id']);
  const resultLogins = RI_RESULTS.map(result => result.login);
  const streams = added.filter(call => HELIX.test(call.url));
  assert.equal(streams.length, 1, 'one /streams request');
  const asked = new URL(streams[0].url).searchParams.getAll('user_login');
  for (const login of ['rivenshade', 'riptidejoe']) assert.ok(asked.includes(login), `/streams asks for live result ${login}`);
  assert.ok(asked.every(login => resultLogins.includes(login)), 'and only for results');
  const ages = added.filter(call => call.url === GQL && !/stream\{/.test(call.options.data.query.replace(/\s+/g, '')));
  assert.equal(ages.length, 1, 'one age lookup');
  const flat = ages[0].options.data.query.replace(/\s+/g, '');
  assert.ok(quoted(ages[0].options.data.query).includes('rinnyruns'), 'for the offline result');
  assert.ok(/lastBroadcast\{[^}]*startedAt/.test(flat) && /lastBroadcast\{[^}]*title/.test(flat));
  assert.equal(added.length, 3, 'nothing else is requested for O');
});

test('R11. signed in with only chat:read: still Helix search (the follows scope is not needed)', async () => {
  const r = await searchRig({signedIn: true, scopes: ['chat:read'], follows: []});
  await r.typeSettled('ri');
  assert.equal(r.helixSearch().length, 1, 'one Helix search request');
  assert.equal(r.gqlSearch().length, 0);
});

test('R11. signed in: no /streams when no result is live, and no age lookup when none is offline', async () => {
  const offlineOnly = await searchRig({signedIn: true, liveLogins: [], searchResults: [searchResult('rinnyruns')]});
  const a = offlineOnly.calls().length;
  await offlineOnly.typeSettled('ri');
  assert.equal(offlineOnly.helixSearch().length, 1, 'one Helix search request');
  assert.ok(!offlineOnly.calls().slice(a).some(call => HELIX.test(call.url)), 'no /streams');
  const liveOnly = await searchRig({signedIn: true, searchResults: [searchResult('rivenshade'), searchResult('riptidejoe')]});
  const b = liveOnly.calls().length;
  await liveOnly.typeSettled('ri');
  assert.equal(liveOnly.helixSearch().length, 1, 'one Helix search request');
  assert.ok(!liveOnly.calls().slice(b).some(call => call.url === GQL), 'no age lookup');
});

// R1, R12, R13: who is in Y, in `known`, in `others`, and in what order. Frame (b).
const EXPECTED_RI = {
  'signed out': {known: ['dunmore'], others: ['rivenshade', 'riptidejoe', 'rinnyruns', 'rimecraft']},
  'signed in': {known: ['dunmore'], others: ['rivenshade', 'riptidejoe', 'rinnyruns']},
};
for (const [mode, signedIn] of MODES) {
  test(`R1/R12. ${mode}: known people the search finds but Y does not show are appended; O is live by viewers, then Twitch's order`, async () => {
    const r = await searchRig({signedIn});
    const y = await r.ask('ri');
    await r.typeSettled('ri');
    const [answer, ...more] = searchAnswers(r);
    assert.ok(answer, 'a suggestions-search message for "ri"');
    assert.equal(more.length, 0, 'once per settled text');
    assert.deepEqual(Object.keys(answer).sort(), ['known', 'others', 'text']);
    assert.deepEqual(logins(answer.known), EXPECTED_RI[mode].known, 'known: shown nowhere in Y for this text');
    assert.deepEqual(logins(answer.others), EXPECTED_RI[mode].others, 'others: unknown people, live by viewers then Twitch order');
    const inY = new Set(logins(y.rows));
    for (const row of [...answer.known, ...answer.others]) assert.ok(!inY.has(row.login), `${row.login} is not also in Y`);
    for (const row of [...answer.known, ...answer.others]) {
      assert.deepEqual(Object.keys(row).sort(), ['details', 'displayName', 'live', 'login', 'provider']);
      assert.equal(row.provider, 'twitch');
      assert.equal(row.displayName, SEARCH_NAMES[row.login]);
    }
  });

  test(`R12/R13. ${mode}: O rows carry their own status and details (live: title, category, viewers; offline: lastAt, lastTitle)`, async () => {
    const r = await searchRig({signedIn});
    await r.ask('ri');
    await r.typeSettled('ri');
    const [answer] = searchAnswers(r);
    assert.ok(answer, 'a suggestions-search message for "ri"');
    const byLogin = Object.fromEntries([...answer.known, ...answer.others].map(row => [row.login, row]));
    assert.equal(byLogin.rivenshade.live, true);
    assert.deepEqual(byLogin.rivenshade.details, {title: 'ranked grind to radiant', category: 'Valorant', viewers: 15400});
    assert.equal(byLogin.rinnyruns.live, false);
    assert.equal(byLogin.rinnyruns.details.lastAt, SEARCH_DETAILS.rinnyruns.lastAt);
    assert.equal(byLogin.rinnyruns.details.lastTitle, 'knitting night');
    assert.equal(byLogin.dunmore.live, false, 'a known offline person');
    assert.equal(byLogin.dunmore.details.lastAt, SEARCH_DETAILS.dunmore.lastAt);
  });
}

test('R1. an exact login match for the typed text (trimmed, case-insensitive) leads O, even when offline', async () => {
  for (const [, signedIn] of MODES) {
    const r = await searchRig({signedIn});
    await r.ask(' RinnyRuns ');
    await r.typeSettled(' RinnyRuns ');
    const answer = searchAnswers(r, 'rinnyruns')[0];
    assert.ok(answer, 'answered');
    assert.deepEqual(logins(answer.others).slice(0, 3), ['rinnyruns', 'rivenshade', 'riptidejoe']);
  }
});

test('R1. frame (c) "glaze": no one is known, so Y is empty and O is live by viewers, then the offline one', async () => {
  const r = await searchRig();
  const y = await r.ask('glaze');
  assert.deepEqual(y.rows, [], 'fixture: Y is empty');
  await r.typeSettled('glaze');
  const answer = searchAnswers(r, 'glaze')[0];
  assert.ok(answer);
  assert.deepEqual(answer.known, []);
  assert.deepEqual(logins(answer.others), ['glazewright', 'glazedgourd', 'glazier9']);
});

test('R3. at most 10 O rows and at most 10 known people appended; O keeps the highest viewer counts', async () => {
  const strangers = Array.from({length: 14}, (_, i) => ({login: `st${String(i + 1).padStart(2, '0')}`, name: `Stranger ${i + 1}`}));
  const history = Array.from({length: 12}, (_, i) => person(`hk${String(i + 1).padStart(2, '0')}`, `Historian ${i + 1}`, 12 - i));
  const details = Object.fromEntries(strangers.map((s, i) => [s.login, {title: 't', category: 'c', viewers: 100 + i}]));
  const r = loadGlobal({people: history, liveLogins: strangers.map(s => s.login), details,
    searchResults: [...strangers, ...history.map(p => ({login: p.login, name: p.displayName}))]});
  await r.showOpen();
  await r.ask('zq');
  await r.typeSettled('zq');
  const answer = searchAnswers(r, 'zq')[0];
  assert.ok(answer, 'answered');
  assert.equal(answer.others.length, 10);
  assert.deepEqual(logins(answer.others), strangers.slice(4).reverse().map(s => s.login), 'the 10 highest viewer counts, best first');
  assert.equal(answer.known.length, 10);
  assert.ok(logins(answer.known).every(login => login.startsWith('hk')));
});

// R3 cache.
// Amended 2026-11-25 (phase 2 rev 2, F2, TESTS-74): an edit that leaves the trimmed, lower-cased text unchanged now
// changes nothing (tested in F2 below), so the cache is exercised by going away and coming back ('ri', 'rix', 'ri').
test('R3. the same trimmed, lower-cased text within 60 s is answered from the cache after the same pause, with no request', async () => {
  for (const [, signedIn] of MODES) {
    const r = await searchRig({signedIn});
    await r.ask('ri');
    await r.typeSettled('ri');
    assert.equal(r.searchRequests(), 1, 'fixture: one request');
    r.shim.timers.advance(30000);
    await r.typeSettled('rix');
    const requestsBefore = r.searchRequests();
    assert.equal(requestsBefore, 2, 'fixture: "rix" was asked');
    const followUps = r.calls().length;
    await r.ask('RI ');
    r.window.receive('open-query', {text: 'RI '});
    await r.settle();
    r.shim.timers.advance(249);
    await r.settle();
    assert.equal(searchAnswers(r).length, 1, 'nothing yet at 249 ms');
    r.shim.timers.advance(1);
    await r.settle();
    assert.equal(searchAnswers(r).length, 2, 'the cached answer is posted after the same pause');
    assert.equal(r.searchRequests(), requestsBefore, 'with no request');
    assert.equal(r.calls().length, followUps, 'and no other request');
    assert.deepEqual(searchAnswers(r)[1].others, searchAnswers(r)[0].others);
    assert.equal(searchPending(r).filter(Boolean).length, 1, 'the cache hit shows no pending');
    r.shim.timers.advance(61000);
    await r.settle();
    await r.typeSettled('ri');
    assert.equal(r.searchRequests(), requestsBefore + 1, 'after 60 s the text is asked again');
  }
});

// R12 and R9 messages, R7 for global.
test('R12/R9. signed out: pending true when the request starts, the answer, then pending false; nothing earlier', async () => {
  const r = await searchRig({searchHold: true});
  r.window.receive('open-query', {text: 'ri'});
  await r.settle();
  r.shim.timers.advance(249);
  await r.settle();
  assert.deepEqual(searchPending(r), [], 'no pending before the request starts');
  r.shim.timers.advance(1);
  await r.settle();
  assert.equal(r.searchRequests(), 1, 'the request is out');
  assert.deepEqual(searchPending(r), [true], 'pending true when it starts');
  assert.equal(searchAnswers(r).length, 0, 'and no answer yet');
  r.releaseSearch();
  await r.settle();
  assert.equal(searchAnswers(r).length, 1, 'the answer');
  assert.deepEqual(searchPending(r), [true, false], 'then pending false');
});

test('R12/R9. signed in: pending covers the whole chain, and the answer waits for the viewer counts', async () => {
  const r = await searchRig({signedIn: true, searchHold: true});
  r.window.receive('open-query', {text: 'ri'});
  await r.settle();
  r.shim.timers.advance(250);
  await r.settle();
  assert.deepEqual(searchPending(r), [true]);
  r.releaseSearch();
  await r.settle();
  assert.equal(searchAnswers(r).length, 1, 'one answer, after search, /streams and ages');
  assert.deepEqual(searchPending(r), [true, false], 'one pair of pending messages');
  const rows = searchAnswers(r)[0].others;
  assert.equal(rows.find(row => row.login === 'rivenshade').details.viewers, 15400, 'viewer counts are in the one answer');
});

test('R7. an answer that arrives after the window closed posts nothing to it', async () => {
  for (const [, signedIn] of MODES) {
    const r = await searchRig({signedIn, searchHold: true});
    r.window.receive('open-query', {text: 'ri'});
    await r.settle();
    r.shim.timers.advance(250);
    await r.settle();
    assert.equal(r.searchRequests(), 1, 'fixture: a request is out');
    r.window.send('open-cancel', {});
    await r.settle();
    const posted = r.window.posts.length;
    r.releaseSearch();
    await r.settle();
    assert.equal(r.window.posts.length, posted, 'nothing posted to the closed window');
    assert.equal(searchAnswers(r).length, 0);
  }
});

// R9/R11 failure.
test('R9/R11. a failed search adds nothing and shows no error: pending ends, Y and the list still answer', async () => {
  for (const [, signedIn] of MODES) {
    const r = await searchRig({signedIn, searchFail: true});
    const y = await r.ask('ri');
    await r.typeSettled('ri');
    assert.equal(r.searchRequests(), 1, 'fixture: the search was tried');
    assert.deepEqual(searchPending(r), [true, false]);
    // Amended 2026-11-25 (F8, TESTS-74): asserts even when no answer is posted at all.
    const added = searchAnswers(r).flatMap(answer => [...answer.known, ...answer.others]);
    assert.deepEqual(added, [], 'nothing added to the list by a failed search');
    assert.ok(searchAnswers(r).length <= 1, 'at most one (empty) answer');
    assert.ok(y.rows.length > 0, 'Y is unaffected');
    const again = await r.ask('riv');
    assert.ok(Array.isArray(again.rows), 'later lists still answer');
  }
});

test('R11/C5. signed in: a failed /streams loses only the viewer counts; a failed age lookup loses only the ages', async () => {
  const noViewers = await searchRig({signedIn: true, searchPartFail: 'streams'});
  await noViewers.ask('ri');
  await noViewers.typeSettled('ri');
  const a = searchAnswers(noViewers)[0];
  assert.ok(a, 'the search still answers');
  const riven = a.others.find(row => row.login === 'rivenshade');
  assert.equal(riven.live, true, 'live comes from the search result itself');
  assert.equal(riven.details?.viewers, undefined, 'viewers are lost');
  assert.equal(a.others.find(row => row.login === 'rinnyruns').details.lastAt, SEARCH_DETAILS.rinnyruns.lastAt, 'ages stay');
  const noAges = await searchRig({signedIn: true, searchPartFail: 'ages'});
  await noAges.ask('ri');
  await noAges.typeSettled('ri');
  const b = searchAnswers(noAges)[0];
  assert.ok(b, 'the search still answers');
  const inny = b.others.find(row => row.login === 'rinnyruns');
  assert.equal(inny.live, false);
  assert.equal(inny.details?.lastAt, undefined, 'ages are lost');
  assert.equal(b.others.find(row => row.login === 'rivenshade').details.viewers, 15400, 'viewers stay');
});

// R8: late follows with O drawn.
test('R8. a follows answer after O is drawn changes nothing already drawn; the next text uses it', async () => {
  const r = await searchRig({signedIn: true, holdFollows: true});
  r.shim.timers.advance(450);
  await r.settle();
  const y = await r.ask('ri');
  await r.typeSettled('ri');
  const first = searchAnswers(r)[0];
  assert.ok(first, 'fixture: O is drawn before the follows arrive');
  assert.ok(logins(first.others).includes('rimecraft'), 'fixture: rimecraft is not yet known as a follow, so it is in O');
  const listsBefore = r.messages('suggestions').length;
  r.releaseFollows();
  await r.settle();
  const later = r.messages('suggestions').slice(listsBefore).filter(message => message.text === 'ri');
  for (const list of later) assert.ok(!logins(list.rows).includes('rimecraft'), 'no late append while O is drawn');
  assert.equal(searchAnswers(r).length, 1, 'and O is not redrawn');
  assert.equal(y.rows.length >= 0, true);
  const next = await r.ask('rim');
  assert.ok(logins(next.rows).includes('rimecraft'), 'the next text lists the follow in Y');
  r.shim.timers.advance(250);
  await r.settle();
  const second = searchAnswers(r, 'rim')[0];
  assert.ok(second, 'and searches');
  assert.ok(![...second.known, ...second.others].some(row => row.login === 'rimecraft'), 'one person once: not in O or known');
});

// Follow-up of the removal review (TESTS-74, MINOR), 2026-11-25: the removed D1 test was the only one that ran a real
// validate returning userID and scopes and checked what a player is sent. Global keeps userID and scopes to itself
// (phase 3 decision 6): auth-ready is exactly {token, login, clientID}.
for (const scopes of [FOLLOWS_SCOPES, ['chat:read']]) {
  test(`auth-ready to a player is exactly {token, login, clientID}, though validate returned user_id and scopes (${scopes.join(' ')})`, async () => {
    const r = loadGlobal({signedIn: true, scopes});
    await r.signIn();
    const validated = r.validateCalls();
    assert.ok(validated.length >= 1, 'fixture: a real validate ran (the fake answers user_id and scopes)');
    const ready = r.shim.global.messages('auth-ready');
    assert.ok(ready.length >= 1, 'a player got auth-ready');
    for (const message of ready) {
      assert.deepEqual(decode(typeof message.data === 'string' ? JSON.parse(message.data) : message.data), {token: SAVED.access_token, login: 'reader', clientID: SAVED.clientID});
    }
  });
}

// =====================================================================================================================
// Backend review fixes F1-F8 (TESTS-74, "Phase 2 rev 2" last bullets, 2026-11-25). Scenarios from the review's probes:
// P1/P2/P2b (unpaired pending, duplicate request), P13 (token after sign-out), P11/P5/P7 (account change), P12 (late
// follows). The contract leaves some points open; the readings pinned here are listed in the hand-back.
// =====================================================================================================================

// The pending messages for one text, in order (trimmed, lower-cased match).
const pendingFor = (r, text) => searchPending(r, text);
const paired = list => list.every((value, index) => value === (index % 2 === 0)) && list.length % 2 === 0;

test('F1. a request superseded by a different text still gets pending:false for its own text', async () => {
  const r = await searchRig({searchHold: true});
  await r.typeSettled('ri');
  r.window.receive('open-query', {text: 'riv'});
  await r.settle();
  r.releaseSearch();
  await r.settle();
  assert.deepEqual(pendingFor(r, 'ri'), [true, false], 'the pair for "ri" is closed');
});

test('F1. a window closed while a request is out closes its pending pair at once; nothing is posted after the close', async () => {
  const r = await searchRig({searchHold: true});
  await r.typeSettled('ri');
  assert.deepEqual(pendingFor(r, 'ri'), [true], 'fixture: pending is open');
  r.window.send('open-cancel', {});
  await r.settle();
  assert.deepEqual(pendingFor(r, 'ri'), [true, false], 'closed with the window');
  const posted = r.window.posts.length;
  r.releaseSearch();
  await r.settle();
  assert.equal(r.window.posts.length, posted, 'and the late answer posts nothing');
});

test('F1. one request per cache key: the same text asked again while its request is out reuses it, and its pending pairs up', async () => {
  const r = await searchRig({searchHold: true});
  await r.typeSettled('ri');
  await r.typeSettled('riv');
  assert.equal(r.searchRequests(), 2, 'fixture: "ri" and "riv" are out');
  await r.typeSettled('ri');
  assert.equal(r.searchRequests(), 2, 'no second request for "ri" while the first is out');
  r.releaseSearch();
  await r.settle();
  assert.ok(searchAnswers(r, 'ri').length >= 1, 'the answer serves the new wait');
  assert.ok(paired(pendingFor(r, 'ri')), `every true for "ri" has its false: ${JSON.stringify(pendingFor(r, 'ri'))}`);
  assert.ok(paired(pendingFor(r, 'riv')), 'and for "riv"');
});

test('F1. an answer, a failure, and each pair stay balanced for every text over a typing run', async () => {
  const r = await searchRig({searchFail: true});
  for (const text of ['ri', 'riv', 'ri', 'rid']) await r.typeSettled(text);
  for (const text of ['ri', 'riv', 'rid']) assert.ok(paired(pendingFor(r, text)), `"${text}": ${JSON.stringify(pendingFor(r, text))}`);
  assert.ok(pendingFor(r, 'ri').length >= 2, 'fixture: "ri" was asked');
});

for (const [change, label] of [['ri ', 'a trailing space'], ['RI', 'a case change'], [' Ri', 'a leading space and case']]) {
  test(`F2. ${label} after the answer: no new pause, no request, no pending, no new answer`, async () => {
    for (const [, signedIn] of MODES) {
      const r = await searchRig({signedIn});
      await r.ask('ri');
      await r.typeSettled('ri');
      const requests = r.searchRequests();
      const answers = searchAnswers(r).length;
      const pending = r.messages('suggestions-search-pending').length;
      const calls = r.calls().length;
      await r.ask(change);
      r.shim.timers.advance(2000);
      await r.settle();
      assert.equal(r.searchRequests(), requests, 'no request');
      assert.equal(r.calls().length, calls, 'no other request');
      assert.equal(r.messages('suggestions-search-pending').length, pending, 'no pending message');
      assert.equal(searchAnswers(r).length, answers, 'no new answer');
    }
  });
}

test('F2. a trailing space while the request is out: still one request, one pending pair, one answer', async () => {
  const r = await searchRig({searchHold: true});
  await r.typeSettled('ri');
  await r.typeSettled('ri ');
  assert.equal(r.searchRequests(), 1, 'one request');
  r.releaseSearch();
  await r.settle();
  r.shim.timers.advance(1000);
  await r.settle();
  assert.deepEqual(pendingFor(r, 'ri'), [true, false], 'one pair');
  assert.equal(searchAnswers(r).length, 1, 'one answer');
});

// F3: after sign-out, or an idle stop, no later request carries the token.
const authedAfter = (r, since) => r.calls().slice(since)
  .filter(call => !/\/helix\/search\/channels/.test(call.url) && call.options?.headers?.Authorization);

test('F3. sign-out while a signed-in search is out: no later request carries Authorization', async () => {
  const r = await searchRig({signedIn: true, searchHold: true});
  await r.typeSettled('ri');
  assert.equal(r.searchRequests(), 1, 'fixture: the Helix search is out');
  await r.shim.global.send('auth-forget', {}, '0');
  await r.settle();
  const since = r.calls().length;
  r.releaseSearch();
  await r.settle();
  r.shim.timers.advance(6000);
  await r.settle();
  assert.deepEqual(authedAfter(r, since).map(call => call.url), [], 'no /streams or other call with the token');
});

test('F3. the window closing with no player (credentials dropped) while a signed-in search is out: no later request carries Authorization', async () => {
  const r = loadGlobal({people: SEARCH_HISTORY(), liveLogins: SEARCH_LIVE, details: SEARCH_DETAILS, searchResults: searchFixture,
    signedIn: true, scopes: FOLLOWS_SCOPES, follows: SEARCH_FOLLOWS, searchHold: true});
  await r.showOpen();
  await r.ask('ri');
  await r.typeSettled('ri');
  assert.equal(r.searchRequests(), 1, 'fixture: the Helix search is out');
  r.window.send('open-cancel', {});
  await r.settle();
  const since = r.calls().length;
  r.releaseSearch();
  await r.settle();
  r.shim.timers.advance(6000);
  await r.settle();
  assert.deepEqual(authedAfter(r, since).map(call => call.url), []);
});

// F4: an account change resets the search.
test('F4. sign-in while signed-out search rows are drawn: the current text is searched again as the new account, nobody twice', async () => {
  const base = {people: SEARCH_HISTORY(), liveLogins: SEARCH_LIVE, details: SEARCH_DETAILS, searchResults: searchFixture};
  const r = loadGlobal({...base, scopes: FOLLOWS_SCOPES, follows: SEARCH_FOLLOWS});
  await r.showOpen();
  await r.ask('ri');
  await r.typeSettled('ri');
  assert.equal(r.gqlSearch().length, 1, 'fixture: searched signed out');
  r.shim.keychain.seed('twitch-readonly', 'oauth', JSON.stringify(SAVED));
  await r.signIn();
  r.shim.timers.advance(2000);
  await r.settle();
  assert.equal(r.helixSearch().length, 1, 'searched again, now with Helix');
  const answer = searchAnswers(r).at(-1);
  assert.deepEqual([logins(answer.known), logins(answer.others)], [EXPECTED_RI['signed in'].known, EXPECTED_RI['signed in'].others]);
  const y = r.messages('suggestions').filter(message => message.text === 'ri').at(-1);
  const everyone = [...logins(y.rows), ...logins(answer.known), ...logins(answer.others)];
  assert.equal(new Set(everyone).size, everyone.length, `no person twice: ${everyone.join(',')}`);
});

test('F4. sign-out while signed-in search rows are drawn: the current text is searched again anonymously, nobody twice', async () => {
  const r = await searchRig({signedIn: true});
  await r.ask('ri');
  await r.typeSettled('ri');
  assert.equal(r.helixSearch().length, 1, 'fixture: searched signed in');
  await r.shim.global.send('auth-forget', {}, '0');
  await r.settle();
  r.shim.timers.advance(2000);
  await r.settle();
  assert.equal(r.gqlSearch().length, 1, 'searched again, anonymously');
  const answer = searchAnswers(r).at(-1);
  assert.deepEqual([logins(answer.known), logins(answer.others)], [EXPECTED_RI['signed out'].known, EXPECTED_RI['signed out'].others]);
  const y = r.messages('suggestions').filter(message => message.text === 'ri').at(-1);
  const everyone = [...logins(y.rows), ...logins(answer.known), ...logins(answer.others)];
  assert.equal(new Set(everyone).size, everyone.length, `no person twice: ${everyone.join(',')}`);
});

// F5: late follows are held while known or other rows are drawn.
test('F5. late follows are held while only known rows are drawn; the next text includes them', async () => {
  const r = await searchRig({signedIn: true, holdFollows: true, searchResults: () => [{login: 'dunmore', name: 'dunmore'}]});
  r.shim.timers.advance(450);
  await r.settle();
  await r.ask('ri');
  await r.typeSettled('ri');
  const answer = searchAnswers(r)[0];
  assert.ok(answer && logins(answer.known).includes('dunmore') && answer.others.length === 0, 'fixture: known rows only');
  const listsBefore = r.messages('suggestions').length;
  r.releaseFollows();
  await r.settle();
  r.shim.timers.advance(100);
  await r.settle();
  const later = r.messages('suggestions').slice(listsBefore).filter(message => message.text === 'ri');
  for (const list of later) assert.ok(!logins(list.rows).includes('rimecraft'), 'no late follow appended while known rows are drawn');
  const next = await r.ask('rim');
  assert.ok(logins(next.rows).includes('rimecraft'), 'the next text includes the follow');
});

// F6: every followed channel is known.
test('F6. a followed channel on page 2 of followed channels is known: never in others, and paging stops at 10 pages', async () => {
  const follows = Array.from({length: 130}, (_, index) => {
    const three = String(index + 1).padStart(3, '0');
    return {login: `fx${three}`, name: `Fx ${three}`};
  });
  const r = loadGlobal({people: many(3), signedIn: true, scopes: FOLLOWS_SCOPES, follows, followsPaged: true,
    searchResults: () => [{login: 'fx125', name: 'Fx 125'}, {login: 'stranger1', name: 'Stranger One'}]});
  await r.signIn();
  await r.showOpen();
  await r.ask('fx125');
  await r.typeSettled('fx125');
  const answer = searchAnswers(r, 'fx125')[0];
  assert.ok(answer, 'answered');
  assert.ok(!logins(answer.others).includes('fx125'), 'a followed channel is never "other"');
  assert.ok(logins(answer.known).includes('fx125'), 'it is known');
  assert.deepEqual(logins(answer.others), ['stranger1']);
  const endless = loadGlobal({people: many(3), signedIn: true, scopes: FOLLOWS_SCOPES, followsCursor: 'more',
    follows: Array.from({length: 100}, (_, index) => ({login: `ff${index}`, name: `Ff ${index}`})),
    searchResults: () => [{login: 'stranger1', name: 'Stranger One'}]});
  await endless.signIn();
  await endless.showOpen();
  await endless.ask('str');
  await endless.typeSettled('str');
  assert.equal(endless.followedChannels().length, 10, 'with a cursor that never ends, 10 pages are read and no more');
});

// F7: combining marks.
test('F7. text with combining marks (a Hindi word with vowel signs) is searched', async () => {
  const r = await searchRig();
  const word = '\u0939\u093f\u0902\u0926\u0940';
  await r.typeSettled(word);
  assert.equal(r.searchRequests(), 1, 'one search request');
  assert.equal(r.searchTextOfCall(r.gqlSearch()[0]), word);
});
