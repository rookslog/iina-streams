'use strict';

// v0.5.5 class L pass 2: async chains the player starts outside src/player.js stop at a loss
// (docs/design/V055-CLASS-REPAIR-2026-11-22.md, L1 and L5; clearance 1, Important #2, second half).
//
// The real controller (src/player.js, a managed twitch-live window) runs in the IINA shim with the services
// wired as main.js wires them: src/io.js over the shim, and src/resolve.js over src/twitch-playback.js. Only
// iina.http is replaced, by a double that holds each request until the test settles it. The double models
// iina.http as src/twitch-playback.js reads it: a promise of {statusCode, text, data}; a failure rejects with
// the response object itself (the shim's http double, tests/support/iina-shim.js, is marked UNVERIFIED against
// JavascriptAPIHttp.swift; this one inherits that status).
//
// Each case settles one resolver stage after the activation that started it has lost authority, and asserts
// that nothing downstream starts: no HTTP request, no helper launch (utils.exec), no file write. The teardown
// of the loss itself (the release turn) runs before the count begins.

const test = require('node:test');
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {createRequire} = require('node:module');
const Sources = require('../src/source.js');
const {createIina} = require('./support/iina-shim.js');
const {create: createServices} = require('../src/io.js');
const {createResolver} = require('../src/resolve.js');
const {resolveTwitch} = require('../src/twitch-playback.js');

const playerPath = join(__dirname, '../src/player.js');
const requireFromPlayer = createRequire(playerPath);
const LIVE = Sources.parse('https://www.twitch.tv/fixture_class_l2');
const FOREIGN = '/Users/fixture/movie.mkv';
const settle = () => new Promise(resolve => setImmediate(resolve));
const TOKEN = {data: {streamPlaybackAccessToken: {value: '{"fixture":true}', signature: 'fixturesignature'}}};
const NETWORK_FAILURE = {statusCode: 503, reason: 'Service Unavailable', text: ''};

// iina.http with every request held: {method, url, settle(ok, value)}.
function heldHttp() {
  const requests = [];
  const method = name => url => new Promise((resolve, reject) => {
    requests.push({method: name, url, settle: (ok, value) => (ok ? resolve(value) : reject(value))});
  });
  return {requests, api: {get: method('GET'), post: method('POST')}};
}

function window(t, source = LIVE) {
  const shim = createIina({label: Sources.label(source, 'unified'), mpv: {path: source.url, 'time-pos': 10}});
  const http = heldHttp();
  // As main.js wires them.
  const services = createServices(shim.iina);
  services.resolve = createResolver({
    resolveTwitch,
    http: http.api,
    helperResolve: services.resolve.bind(services),
    log: () => {},
    now: () => Date.now()
  });
  services.readSettings = () => ({chatEnabled: false});
  services.saveSettings = () => {};
  const module = {exports: {}};
  shim.runScript(playerPath, {globals: {module, Date: shim.timers.Date}, require: requireFromPlayer});
  module.exports.start(shim.iina, {variant: 'unified'}, services);
  shim.timers.advance(0);
  const hooks = [];
  // Starts an on_load hook for `path` and lets its synchronous part and promise jobs run.
  async function hook(path) {
    shim.mpv.set('path', path);
    const record = {path, continued: 0};
    hooks.push(record);
    shim.mpv.runHook('on_load', () => record.continued++).catch(() => {});
    await settle();
    return record;
  }
  // The loss of authority, then its release turn.
  async function loseTo(kind) {
    if (kind === 'close') shim.emit('iina.window-will-close');
    else await hook(FOREIGN);
    shim.timers.advance(0);
    await settle();
  }
  // Effects since `mark`: HTTP requests, helper launches and file writes.
  function mark() {
    return {requests: http.requests.length, log: shim.log.length};
  }
  function effectsSince(at) {
    const requests = http.requests.slice(at.requests).map(request => 'http.' + request.method + ' ' + request.url);
    const calls = shim.log.slice(at.log)
      .filter(call => call.api === 'utils.exec' || call.api === 'file.write')
      .map(call => call.api + (call.api === 'file.write' ? ' ' + call.args[0] : ''));
    return requests.concat(calls);
  }
  async function drain() {
    for (let round = 0; round < 5; round++) await settle();
  }
  t.after(async () => {
    // Settle whatever is still held, so resolveTwitch's request timers are cleared.
    for (const request of http.requests) request.settle(false, NETWORK_FAILURE);
    await drain();
    shim.emit('iina.window-will-close');
  });
  return {shim, http, hook, loseTo, mark, effectsSince, drain, hooks};
}

function tokenPost(w, from = 0) {
  const post = w.http.requests.slice(from).find(request => request.method === 'POST');
  assert.ok(post, 'precondition: the load posted its GraphQL token request');
  return post;
}

for (const loss of ['foreign', 'close']) {
  test(`class L2: a GraphQL token answer after a ${loss} loss starts no playlist request`, async t => {
    const w = window(t);
    await w.hook(LIVE.url);
    const posts = w.http.requests.filter(request => request.method === 'POST');
    assert.equal(posts.length, 2, 'precondition: token and title requests are in flight');
    await w.loseTo(loss);
    const at = w.mark();
    for (const post of posts) post.settle(true, {statusCode: 200, text: JSON.stringify(TOKEN), data: TOKEN});
    await w.drain();
    assert.deepEqual(w.effectsSince(at), []);
  });

  test(`class L2: a GraphQL failure after a ${loss} loss launches no media helper`, async t => {
    const w = window(t);
    await w.hook(LIVE.url);
    await w.loseTo(loss);
    const at = w.mark();
    for (const post of w.http.requests.slice()) post.settle(false, NETWORK_FAILURE);
    await w.drain();
    assert.deepEqual(w.effectsSince(at), []);
  });

  test(`class L2: a playlist failure after a ${loss} loss launches no media helper`, async t => {
    const w = window(t);
    await w.hook(LIVE.url);
    for (const post of w.http.requests.slice()) {
      post.settle(true, {statusCode: 200, text: JSON.stringify(TOKEN), data: TOKEN});
    }
    await w.drain();
    const usher = w.http.requests.find(request => request.method === 'GET');
    assert.ok(usher, 'precondition: the playlist request is in flight while the activation is current');
    await w.loseTo(loss);
    const at = w.mark();
    usher.settle(false, NETWORK_FAILURE);
    await w.drain();
    assert.deepEqual(w.effectsSince(at), []);
  });
}

// A reopen of the source after the loss passes through (D-033, v0.5.5) and starts nothing; the old chain still
// stops. (Before D-033 the reopen began a new activation, so these also showed that the signal is the starting
// activation's, not "some activation is current". With one activation per controller the two coincide.)
test('class L2: an old load\'s GraphQL answer after a reopen starts no playlist request', async t => {
  const w = window(t);
  await w.hook(LIVE.url);
  const old = w.http.requests.filter(request => request.method === 'POST');
  await w.loseTo('foreign');
  const before = w.http.requests.length;
  const reopen = await w.hook(LIVE.url);
  assert.equal(w.http.requests.length, before, 'the reopen passes through and starts no resolve');
  assert.equal(reopen.continued, 1, 'the reopen continues once');
  const at = w.mark();
  for (const post of old) post.settle(true, {statusCode: 200, text: JSON.stringify(TOKEN), data: TOKEN});
  await w.drain();
  assert.deepEqual(w.effectsSince(at), []);
});

test('class L2: an old load\'s GraphQL failure after a reopen launches no media helper', async t => {
  const w = window(t);
  await w.hook(LIVE.url);
  const old = w.http.requests.filter(request => request.method === 'POST');
  await w.loseTo('foreign');
  await w.hook(LIVE.url);
  const at = w.mark();
  for (const post of old) post.settle(false, NETWORK_FAILURE);
  await w.drain();
  assert.deepEqual(w.effectsSince(at), []);
});

// Positive control: the same stages, settled while the activation is current, do start the next stage.
test('class L2: while the activation is current, the chain runs (positive control)', async t => {
  const w = window(t);
  await w.hook(LIVE.url);
  let at = w.mark();
  for (const post of w.http.requests.slice()) {
    post.settle(true, {statusCode: 200, text: JSON.stringify(TOKEN), data: TOKEN});
  }
  await w.drain();
  assert.deepEqual(w.effectsSince(at).map(effect => effect.split(' ')[0]), ['http.GET'], 'the playlist request');
  at = w.mark();
  w.http.requests.find(request => request.method === 'GET').settle(false, NETWORK_FAILURE);
  await w.drain();
  const effects = w.effectsSince(at);
  assert.ok(effects.includes('utils.exec'), 'the media helper launches: ' + effects.join(', '));
});

// ---- A resolver helper already running at the loss is cancelled at the release turn ----
//
// src/io.js runs each helper with --cancel-file <marker path> and cancels it by writing 'cancel' to that marker
// (cancelHelpers). chatOff cancels only replay and acquire helpers, so a media helper the resolver launched is
// cancelled only by releaseActivation's cancelHelpers().

const YOUTUBE = Sources.parse('https://www.youtube.com/watch?v=abcdefghijk');

function cancelMarkerOf(exec) {
  return exec.args[exec.args.indexOf('--cancel-file') + 1];
}

function cancelled(w, marker) {
  return w.shim.file.writes.some(op => op.resolved === marker && op.content === 'cancel');
}

async function expectCancelledAtRelease(w) {
  const exec = w.shim.utils.execs.at(-1);
  assert.ok(exec, 'precondition: the media helper is running');
  const marker = cancelMarkerOf(exec);
  await w.hook(FOREIGN);
  assert.equal(cancelled(w, marker), false, 'precondition: nothing is cancelled on the hook');
  w.shim.timers.advance(0);
  await settle();
  assert.equal(cancelled(w, marker), true, 'the release turn cancels the running media helper');
}

test('class L2: a YouTube media helper running at a foreign load is cancelled at the release turn', async t => {
  const w = window(t, YOUTUBE);
  await w.hook(YOUTUBE.url);
  await expectCancelledAtRelease(w);
});

test('class L2: a Twitch fallback media helper running at a foreign load is cancelled at the release turn',
  async t => {
    const w = window(t);
    await w.hook(LIVE.url);
    for (const post of w.http.requests.slice()) post.settle(false, NETWORK_FAILURE);
    await w.drain();
    await expectCancelledAtRelease(w);
  });
