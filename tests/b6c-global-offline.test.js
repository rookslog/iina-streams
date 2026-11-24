'use strict';

// B6c contract (#32): a player whose Twitch channel is offline posts `source-offline` {login} to global.
// Global accepts it from a managed player or an adopted bare-number label, validates the login, ignores a
// repeat for the same login within 10 s, shows the Open Stream window prefilled with the login, and posts
// `offline-vods` loading, then ready, none or error. A newer source-offline or a closed window makes a late
// result stale. Page messages wait for the page's `open-ready`, because loadFile clears listeners and the
// page cannot receive before it has loaded.
// The real global.js, src/twitch-vods.js and the IINA shim; only Twitch's HTTP reply is a double.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Sources = require('../src/source.js');
const {createIina} = require('./support/iina-shim.js');
const {routeLiveCheck, settleOpens} = require('./support/live-check.js');

const config = {identifier: 'local.iina.streams.b6c-test', variant: 'unified'};
const LOGIN = 'fixture_offline';
const MANAGED = '1-' + config.identifier;
const immediate = () => new Promise(resolve => setImmediate(resolve));
// #67 H-main: global handles source-offline, the archive reply's deadline and the list on main-thread turns (0 ms
// timers), so settling also runs the 0 ms timers of the globals this file loaded, until none is left.
const shims = [];
const settle = async () => {
  for (let turn = 0; turn < 6; turn++) {
    await immediate();
    for (const shim of shims) shim.timers.flush(0);
  }
  await immediate();
};

// Hand-written archive response in the shape src/twitch-vods.js parses (as in b6b-twitch-vods); not captured.
// #74 (lead, 2026-11-24): messages the Open Stream page now receives on open-ready and while typing.
const SUGGESTION_MESSAGES = new Set(['suggestions', 'suggestions-status']);

function archiveResponse(count) {
  const edges = Array.from({length: count}, (_, index) => ({node: {
    id: String(1234567890 + index), title: `Archive ${index}`, createdAt: '2026-11-20T10:31:57Z',
    lengthSeconds: 3600 + index,
  }}));
  const data = {data: {user: {videos: {edges}}}};
  return {statusCode: 200, reason: 'OK', data, text: JSON.stringify(data)};
}

function item(index) {
  return {
    title: `Archive ${index}`, createdAt: '2026-11-20T10:31:57Z', lengthSeconds: 3600 + index,
    url: `https://www.twitch.tv/videos/${1234567890 + index}`,
  };
}

function loadGlobal(t) {
  const shim = createIina({role: 'global', identifier: config.identifier});
  shims.push(shim);
  // #67: a channel open first checks the channel; the check is answered live outside shim.http.
  routeLiveCheck(shim);
  const modules = new Map([
    ['./config.js', config],
    ['./src/source.js', Sources],
    ['./src/auth.js', require('../src/auth.js')],
    ['./src/timers.js', require('../src/timers.js')],
    ['./src/twitch-app.js', {clientID: ''}],
    ['./src/twitch-vods.js', require('../src/twitch-vods.js')],
    ['./src/bridge.js', require('../src/bridge.js')],
    ['./src/history.js', require('../src/history.js')],
    ['./src/listeners.js', require('../src/listeners.js')],
  ]);
  const context = shim.runScript(path.join(__dirname, '../global.js'), {
    require(name) {
      if (!modules.has(name)) throw new Error('Unexpected module ' + name);
      return modules.get(name);
    },
  });
  const win = shim.standaloneWindow;

  // A deferred HTTP reply, released by the test or at teardown so no lookup outlives the test.
  function deferArchives() {
    let release;
    shim.http.setResponse(new Promise(resolve => { release = resolve; }));
    t.after(() => release(archiveResponse(0)));
    return response => release(response);
  }

  async function offline(label = MANAGED, login = LOGIN) {
    await shim.global.send('source-offline', {login}, label);
    await settle();
  }

  // Page messages in order, with offline-vods decoded from its envelope.
  function pageMessages() {
    return win.posts.map(({name, data}) => {
      if (name !== 'offline-vods') return {name, data};
      return {name, data: JSON.parse(decodeURIComponent(data.encoded))};
    });
  }

  function lastList() {
    return pageMessages().filter(post => post.name === 'offline-vods').at(-1)?.data;
  }

  return {shim, context, win, deferArchives, offline, pageMessages, lastList};
}

async function withManagedPlayer(fixture) {
  await fixture.context.openStream(LOGIN);
  await settleOpens();
  assert.equal(fixture.shim.global.opens.length, 1, 'fixture: player 1 is managed');
}

test('B6c a managed player and an adopted label each open the window prefilled with the login', async t => {
  const managed = loadGlobal(t);
  await withManagedPlayer(managed);
  managed.shim.http.setResponse(archiveResponse(1));
  await managed.offline(MANAGED);
  assert.equal(managed.win.loads.length, 1, 'the Open Stream page is loaded');
  assert.equal(managed.win.visible, true);
  managed.win.send('open-ready', {});
  await settle();
  assert.deepEqual(managed.pageMessages()[0], {name: 'prefill', data: {input: LOGIN}});
  assert.deepEqual(managed.lastList(), {state: 'ready', items: [item(0)]});

  const adopted = loadGlobal(t);
  adopted.shim.http.setResponse(archiveResponse(1));
  await adopted.offline('3');
  assert.equal(adopted.win.visible, true, 'an adopted window IINA opened itself is accepted');
  adopted.win.send('open-ready', {});
  assert.deepEqual(adopted.pageMessages()[0], {name: 'prefill', data: {input: LOGIN}});
});

test('B6c an unknown label is ignored', async t => {
  const fixture = loadGlobal(t);
  await withManagedPlayer(fixture);
  // Sent directly: offline() would replace an undefined label with its default.
  for (const label of ['2-' + config.identifier, '1-other.plugin', 'foreign', '', undefined]) {
    fixture.shim.global.send('source-offline', {login: LOGIN}, label);
  }
  await settle();
  assert.equal(fixture.win.loads.length, 0, 'no window for an unknown sender');
  assert.deepEqual(fixture.shim.http.calls, [], 'no lookup for an unknown sender');
});

test('B6c an invalid login is ignored', async t => {
  const fixture = loadGlobal(t);
  await withManagedPlayer(fixture);
  for (const login of ['Fixture_Offline', 'https://www.twitch.tv/videos/1234567890', 'a b', 'videos', '', 42, null]) {
    await fixture.offline(MANAGED, login);
  }
  assert.equal(fixture.win.loads.length, 0, 'no window for an invalid login');
  assert.deepEqual(fixture.shim.http.calls, [], 'no lookup for an invalid login');
});

test('B6c a repeat for the same login within 10 s is ignored', async t => {
  const fixture = loadGlobal(t);
  await withManagedPlayer(fixture);
  fixture.shim.http.setResponse(archiveResponse(1));
  await fixture.offline();
  await fixture.offline('4');
  assert.equal(fixture.shim.http.calls.length, 1, 'one lookup for a repeat within 10 s');

  fixture.shim.timers.advance(9999);
  await fixture.offline();
  assert.equal(fixture.shim.http.calls.length, 1, 'still a repeat at 9.999 s');

  fixture.shim.timers.advance(1);
  await fixture.offline();
  assert.equal(fixture.shim.http.calls.length, 2, 'a new lookup after 10 s');
});

test('B6c the list goes loading, then ready, none or error, and the window grows to fit', async t => {
  const fixture = loadGlobal(t);
  await withManagedPlayer(fixture);
  const release = fixture.deferArchives();
  await fixture.offline();
  fixture.win.send('open-ready', {});
  assert.deepEqual(fixture.lastList(), {state: 'loading'});
  assert.equal(fixture.win.frames.at(-1).height, 84 + 28, 'one row of room while loading');

  release(archiveResponse(12));
  await settle();
  const ready = fixture.lastList();
  assert.equal(ready.state, 'ready');
  assert.deepEqual(ready.items, Array.from({length: 10}, (_, index) => item(index)), 'at most ten rows');
  assert.deepEqual(fixture.win.frames.at(-1), {width: 380, height: 84 + 10 * 28, x: undefined, y: undefined});

  fixture.shim.timers.advance(10000);
  fixture.shim.http.setResponse(archiveResponse(0));
  await fixture.offline();
  assert.deepEqual(fixture.lastList(), {state: 'none'});
  assert.equal(fixture.win.loads.length, 1, 'an open window is reused, not reloaded');

  fixture.shim.timers.advance(10000);
  fixture.shim.http.rejectResponse({statusCode: 503, reason: 'Service Unavailable', data: null, text: ''});
  await fixture.offline();
  assert.deepEqual(fixture.lastList(), {state: 'error'});
  assert.equal(fixture.win.frames.at(-1).height, 84 + 28);
});

test('B6c a newer source-offline makes the earlier result stale', async t => {
  const fixture = loadGlobal(t);
  await withManagedPlayer(fixture);
  const releaseFirst = fixture.deferArchives();
  await fixture.offline(MANAGED, LOGIN);
  fixture.win.send('open-ready', {});
  const releaseSecond = fixture.deferArchives();
  await fixture.offline(MANAGED, 'other_channel');
  assert.deepEqual(fixture.pageMessages().filter(post => post.name === 'prefill').at(-1).data,
    {input: 'other_channel'});

  releaseFirst(archiveResponse(3));
  await settle();
  assert.deepEqual(fixture.lastList(), {state: 'loading'}, 'the first channel\'s list does not land');

  releaseSecond(archiveResponse(0));
  await settle();
  assert.deepEqual(fixture.lastList(), {state: 'none'});
});

test('B6c a closed window makes a late result stale', async t => {
  const fixture = loadGlobal(t);
  await withManagedPlayer(fixture);
  const release = fixture.deferArchives();
  await fixture.offline();
  fixture.win.send('open-ready', {});
  fixture.win.send('open-cancel', {});
  assert.equal(fixture.win.visible, false);
  const before = fixture.win.posts.length;
  const frames = fixture.win.frames.length;

  release(archiveResponse(3));
  await settle();
  assert.equal(fixture.win.posts.length, before, 'nothing is posted to a closed window');
  assert.equal(fixture.win.frames.length, frames, 'a closed window is not resized');
});

// The red close button sends global no message: only isOpen() tells global the window is gone.
test('B6c a window closed natively drops a late result, and a reopened page receives nothing from it', async t => {
  const fixture = loadGlobal(t);
  await withManagedPlayer(fixture);
  const release = fixture.deferArchives();
  await fixture.offline();
  fixture.win.visible = false;
  const frames = fixture.win.frames.length;

  release(archiveResponse(3));
  await settle();
  assert.equal(fixture.win.frames.length, frames, 'a window closed natively is not resized');
  assert.deepEqual(fixture.win.posts, [], 'nothing was posted before open-ready');

  await fixture.context.openStream();
  assert.equal(fixture.win.loads.length, 2, 'a plain Open Stream loads a fresh page');
  fixture.win.send('open-ready', {});
  // #74: a fresh page now receives its empty-field suggestions; nothing else, and nothing from the old lookup.
  assert.deepEqual(fixture.win.posts.filter(post => !SUGGESTION_MESSAGES.has(post.name)), [], 'the fresh page receives no prefill or list from the old lookup');
});

test('B6c page messages wait for open-ready, and a fresh page waits again', async t => {
  const fixture = loadGlobal(t);
  await withManagedPlayer(fixture);
  fixture.shim.http.setResponse(archiveResponse(2));
  await fixture.offline();
  assert.equal(fixture.win.loads.length, 1);
  assert.deepEqual(fixture.win.posts, [], 'nothing reaches the page before it has loaded');

  fixture.win.send('open-ready', {});
  assert.deepEqual(fixture.pageMessages().map(post => post.name).filter(name => !SUGGESTION_MESSAGES.has(name)), ['prefill', 'offline-vods', 'offline-vods']);
  assert.deepEqual(fixture.lastList(), {state: 'ready', items: [item(0), item(1)]});

  // A plain menu open after close loads a fresh page that receives nothing from the old lookup.
  fixture.win.send('open-cancel', {});
  const others = () => fixture.win.posts.filter(post => !SUGGESTION_MESSAGES.has(post.name)).length;
  const posted = others();
  await fixture.context.openStream();
  assert.equal(fixture.win.loads.length, 2);
  fixture.win.send('open-ready', {});
  assert.equal(others(), posted, 'a plain Open Stream posts nothing to the page but its suggestions (#74)');
  const frame = fixture.win.frames.at(-1);
  assert.equal(frame.width, 380);
  assert.ok(frame.height > 84, '#74 item 15: a plain open already holds the suggestion list');
});

test('B6c clicking a row opens the broadcast through the existing open-stream path', async t => {
  const fixture = loadGlobal(t);
  await withManagedPlayer(fixture);
  fixture.shim.http.setResponse(archiveResponse(1));
  await fixture.offline();
  fixture.win.send('open-ready', {});
  fixture.win.send('open-stream', {input: item(0).url});
  assert.equal(fixture.shim.global.opens.length, 2);
  assert.equal(fixture.shim.global.opens[1].url, item(0).url);
  assert.equal(fixture.win.visible, false, 'the window closes once the broadcast opens');
});
