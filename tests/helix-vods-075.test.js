'use strict';
// #75 (0.5.6, lead, 2026-11-24): signed in, an offline channel's recent broadcasts come from Twitch's documented
// API (Helix Get Users, then Get Videos), per D-034. Signed out, the GQL path of #32 is unchanged (D-030).
// Choices (lead's, provisional):
//   - Any Helix failure (401, 429, network, malformed) falls back to one GQL request, so the list still appears
//     (PRODUCT: degrade, don't dead-end). No retry.
//   - Helix says the account doesn't exist (Get Users returns no user): the list is "none" and nothing else is asked.
//   - Rows are the #32 shape: {title, createdAt, lengthSeconds, url}; Helix's duration "1h5m3s" becomes seconds and
//     the url is built from the id (src/twitch-helix.js mapVideo).
//   - A late answer after the form closed posts nothing (class C, docs/REVIEW.md).
// Unchecked (the issue's own): that Twitch accepts the saved sign-in token for Get Videos. Fixture-tested only.
const test = require('node:test');
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const {join} = require('node:path');
const {createIina} = require('./support/iina-shim.js');

const SCRIPT = join(__dirname, '../global.js');
const requireFromGlobal = createRequire(SCRIPT);
const ID = 'local.iina.streams.helix-vods-test';
const LOGIN = 'fixture_channel';
const USER_ID = '987654';
const TOKEN = 'saved-helix-vods-token';
const SAVED = {clientID: 'c'.repeat(30), access_token: TOKEN, refresh_token: 'saved-helix-vods-refresh'};
const settle = () => new Promise(resolve => setImmediate(resolve));

const HELIX_VIDEOS = [
  {id: '1234567890', title: 'Helix one', created_at: '2026-11-20T10:31:57Z', duration: '1h5m3s', url: 'https://www.twitch.tv/videos/1234567890?t=1s'},
  {id: '1234567891', title: 'Helix two', created_at: '2026-11-19T10:31:57Z', duration: '45m', url: 'https://www.twitch.tv/videos/1234567891'},
];

// users: 'found' | 'none' | 'fail'; videos: 'ok' | 'fail'; hold: keep Helix answers until release().
function load({signedIn = true, users = 'found', videos = 'ok', hold = false} = {}) {
  const shim = createIina({role: 'global', identifier: ID});
  if (signedIn) shim.keychain.seed('twitch-readonly', 'oauth', JSON.stringify(SAVED));
  const calls = [];
  const held = [];
  const answer = value => (hold ? new Promise(resolve => held.push(() => resolve(value))) : Promise.resolve(value));
  const fail = {statusCode: 401, reason: 'Unauthorized', text: ''};
  const api = {
    post(url, options) {
      const query = String(options?.data?.query || '');
      calls.push({method: 'POST', url, query, headers: Object.assign({}, options?.headers)});
      if (query.includes('stream{id}')) return Promise.resolve({statusCode: 200, data: {data: {user: {stream: null}}}});
      const node = {id: '2222222222', title: 'GQL archive', createdAt: '2026-11-18T10:31:57Z', lengthSeconds: 1800};
      return Promise.resolve({statusCode: 200, data: {data: {user: {videos: {edges: [{node}]}}}}});
    },
    get(url, options) {
      calls.push({method: 'GET', url, params: Object.assign({}, options?.params), headers: Object.assign({}, options?.headers)});
      if (url.endsWith('/oauth2/validate')) {
        return Promise.resolve({statusCode: 200, data: {client_id: SAVED.clientID, login: 'reader', scopes: ['chat:read'], expires_in: 5000}});
      }
      if (url.includes('/helix/users')) {
        if (users === 'fail') return hold ? answer(Promise.reject(fail)) : Promise.reject(fail);
        return answer({statusCode: 200, data: {data: users === 'found' ? [{id: USER_ID, login: LOGIN}] : []}});
      }
      if (url.includes('/helix/videos')) {
        if (videos === 'fail') return Promise.reject({statusCode: 429, reason: 'Too Many Requests', text: ''});
        return answer({statusCode: 200, data: {data: HELIX_VIDEOS}});
      }
      return Promise.reject({statusCode: 404, reason: 'Not Found', text: ''});
    },
  };
  const context = shim.runScript(SCRIPT, {
    globals: {iina: Object.assign({}, shim.iina, {http: api})},
    require(name) {
      if (name === './config.js') return {identifier: ID, variant: 'unified', qa: false};
      if (name === './src/twitch-app.js') return {clientID: ''};
      return requireFromGlobal(name);
    },
  });
  const win = shim.standaloneWindow;
  async function turns() {
    for (let turn = 0; turn < 8; turn++) {
      shim.timers.flush(0);
      await settle();
    }
  }
  async function signIn() {
    await shim.global.send('auth-connect', {}, '0');
    await turns();
    assert.ok(shim.global.posts.some(post => post.name === 'auth-ready'), 'fixture: global holds credentials');
  }
  async function submit(input = LOGIN) {
    context.openStream();
    win.send('open-ready', {});
    win.send('open-stream', {input});
    await turns();
  }
  const lists = () => win.posts.filter(post => post.name === 'offline-vods').map(post => JSON.parse(decodeURIComponent(post.data.encoded)));
  const helix = () => calls.filter(call => call.url.includes('/helix/'));
  const gqlArchives = () => calls.filter(call => call.query && call.query.includes('videos('));
  const release = async () => {
    while (held.length) held.shift()();
    await turns();
  };
  return {shim, win, calls, held, signIn, submit, lists, helix, gqlArchives, release, turns};
}

const paramsOf = call => Object.assign(Object.fromEntries(new URL(call.url).searchParams), call.params);

test('#75 1. signed in: Get Users then Get Videos, with the saved token, and the #32 rows from Helix', async () => {
  const f = load();
  await f.signIn();
  await f.submit();
  const [users, videos] = f.helix();
  assert.ok(users && users.url.includes('/helix/users'), 'Get Users first');
  assert.equal(paramsOf(users).login, LOGIN);
  assert.ok(videos && videos.url.includes('/helix/videos'), 'then Get Videos');
  assert.deepEqual([paramsOf(videos).user_id, paramsOf(videos).type], [USER_ID, 'archive']);
  for (const call of [users, videos]) {
    assert.equal(call.headers.Authorization, 'Bearer ' + TOKEN);
    assert.equal(call.headers['Client-Id'], SAVED.clientID);
  }
  assert.equal(f.gqlArchives().length, 0, 'no GQL broadcast request when Helix answers');
  const list = f.lists().at(-1);
  assert.equal(list.state, 'ready');
  assert.deepEqual(list.items, [
    {title: 'Helix one', createdAt: '2026-11-20T10:31:57Z', lengthSeconds: 3903, url: 'https://www.twitch.tv/videos/1234567890'},
    {title: 'Helix two', createdAt: '2026-11-19T10:31:57Z', lengthSeconds: 2700, url: 'https://www.twitch.tv/videos/1234567891'},
  ]);
});

test('#75 2. signed out: the GQL path is unchanged and Helix is never asked', async () => {
  const f = load({signedIn: false});
  await f.submit();
  assert.equal(f.helix().length, 0);
  assert.equal(f.gqlArchives().length, 1);
  assert.deepEqual(f.lists().at(-1).items.map(item => item.title), ['GQL archive']);
});

for (const [name, options] of [['Get Users fails (401)', {users: 'fail'}], ['Get Videos fails (429)', {videos: 'fail'}]]) {
  test(`#75 3. signed in, ${name}: one GQL fallback, the list still appears, no retry`, async () => {
    const f = load(options);
    await f.signIn();
    await f.submit();
    const helixCalls = f.helix().length;
    assert.ok(helixCalls >= 1, 'Helix is asked first');
    assert.equal(f.gqlArchives().length, 1, 'exactly one fallback request');
    assert.deepEqual(f.lists().at(-1).items.map(item => item.title), ['GQL archive']);
    await f.turns();
    assert.equal(f.helix().length, helixCalls, 'no Helix retry');
  });
}

test('#75 4. signed in, Helix has no such account: "none", and nothing else is asked', async () => {
  const f = load({users: 'none'});
  await f.signIn();
  await f.submit();
  assert.equal(f.lists().at(-1).state, 'none');
  assert.equal(f.helix().length, 1, 'Get Videos is not asked');
  assert.equal(f.gqlArchives().length, 0, 'no fallback for an account that does not exist');
});

test('#75 5. a Helix answer arriving after the form closed posts nothing (class C)', async () => {
  const f = load({hold: true});
  await f.signIn();
  await f.submit();
  assert.ok(f.held.length > 0, 'fixture: a Helix answer is held');
  f.win.send('open-cancel', {});
  await f.turns();
  const posted = f.win.posts.length;
  await f.release();
  await f.release();
  assert.equal(f.win.posts.length, posted, 'nothing reaches the closed form');
  assert.equal(f.win.visible, false, 'and it is not reopened');
});

test('#75 6. the token reaches only the Authorization header: no log, trace, file or page message holds it', async () => {
  const f = load();
  await f.signIn();
  await f.submit();
  assert.ok(f.helix().some(call => call.headers.Authorization === 'Bearer ' + TOKEN), 'precondition: the token was used');
  const outside = JSON.stringify({log: f.shim.log, files: [...f.shim.file.files.values()], posts: f.win.posts});
  assert.ok(!outside.includes(TOKEN));
  for (const call of f.calls) {
    assert.ok(!JSON.stringify(call.params || {}).includes(TOKEN) && !call.url.includes(TOKEN), 'not in a URL or parameter');
  }
});
