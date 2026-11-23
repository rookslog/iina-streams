'use strict';

// #73 global API choices:
// - The global entry owns @data/history.json (the v1 format in history.test.js).
// - Once playback starts, the child sends history-start {provider, login, displayName}.
//   login is the Twitch channel owner or the case-preserved YouTube channel ID, never
//   the video ID. Global timestamps receipt and counts a repeat from the same playing
//   source once. Existing player-closed ends the visit; no history-start means no visit.
// - Adopted senders use IINA's bare-number label and @data/settings.json's
//   adoptNativeWindows opt-in. A child sends history-focus {focused} for the active
//   window; Forget targets that window's recorded person, not the last person opened.
// - Use #67's real Open Stream precheck protocol and shimmed GQL responses, not a
//   simulated player for an offline open. Use the login as the display name when
//   precheck has only a login, and persist {at, seconds:0, offline:true}.

const test = require('node:test');
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const {join} = require('node:path');
const {createIina} = require('./support/iina-shim.js');

const SCRIPT = join(__dirname, '../global.js');
const requireFromGlobal = createRequire(SCRIPT);
const ID = 'local.iina.streams.history-test';
const FILE = '@data/history.json';
const START = 1800000000;
const OHNE = {provider: 'twitch', login: 'ohnepixel', displayName: 'Ohnepixel'};
const ARCHIVE_URL = 'https://www.twitch.tv/videos/1234567890';
const YOUTUBE_URL = 'https://youtu.be/AbC_123-xYz';
const YOUTUBE = {provider: 'youtube', login: 'UCaBcD0123456789xyzPQrst', displayName: 'TubeChannel'};
const PAUSE = 'Pause Watch History';
const CLEAR = 'Clear Watch History';
const FORGET = 'Forget This Channel';

function loadGlobal({adoption, stream = {id: '42'}} = {}) {
  const shim = createIina({role: 'global', identifier: ID});
  if (adoption !== undefined) {
    shim.file.seed('@data/settings.json', JSON.stringify({adoptNativeWindows: adoption}));
  }

  // Route only the known signed-out #67 status and archive requests. The actual shim
  // still captures every HTTP call, including anything history might add.
  const post = shim.iina.http.post;
  shim.iina.http.post = (url, options) => {
    const query = options?.data?.query ?? '';
    let user;
    if (url === 'https://gql.twitch.tv/gql' && query.includes('stream{id}')) {
      user = stream === 'unknown' ? null : {stream};
    } else if (url === 'https://gql.twitch.tv/gql' && query.includes('videos(')) {
      user = {videos: {edges: [{node: {
        id: '1234567890', title: 'Fixture Archive', createdAt: '2026-11-20T10:31:57Z', lengthSeconds: 3600,
      }}]}};
    }
    shim.http.setResponse(user === undefined ? {statusCode: 503} : {statusCode: 200, data: {data: {user}}});
    return post(url, options);
  };

  shim.runScript(SCRIPT, {
    globals: {Date: class extends Date { static now() { return START * 1000 + shim.timers.now; } }},
    require(name) {
      if (name === './config.js') return {identifier: ID, variant: 'unified', qa: false};
      return requireFromGlobal(name);
    },
  });
  const window = shim.standaloneWindow;
  const menuItem = title => shim.menu.items.find(item => item.title === title);

  async function settle() {
    shim.timers.flush(0);
    await new Promise(resolve => setImmediate(resolve));
    shim.timers.flush(0);
  }

  function showOpen() {
    menuItem('Open Stream…').action();
    window.send('open-ready', {});
  }

  async function submit(input) {
    showOpen();
    window.send('open-stream', {input});
    await settle();
    if (window.visible) window.send('open-ready', {});
  }

  function historyFile() {
    const text = shim.file.get(FILE);
    return text === undefined ? undefined : JSON.parse(text);
  }

  async function send(name, payload, label) {
    // receive() matches IINA's drop behavior before the new listeners exist.
    await shim.global.receive(name, payload, label);
    await settle();
  }

  return {
    shim, window, showOpen, submit, historyFile, menuItem, settle,
    people: () => historyFile()?.people ?? [],
    playing: (person, label = '1-' + ID) => send('history-start', person, label),
    close: (label = '1-' + ID) => send('player-closed', {}, label),
    focus: (label, focused = true) => send('history-focus', {focused}, label),
  };
}

test('10. a live open records at playback once and finishes on window close', async () => {
  const r = loadGlobal();
  await r.submit('Ohnepixel');
  assert.equal(r.shim.global.opens[0]?.url, 'https://www.twitch.tv/ohnepixel');
  assert.deepEqual(r.people(), [], 'requesting the channel is not a visit');

  r.shim.timers.advance(10000);
  await r.playing(OHNE);
  r.shim.timers.advance(5000);
  await r.playing(OHNE);
  assert.deepEqual(r.people(), [{...OHNE, visits: [{at: START + 10, seconds: null}]}]);

  r.shim.timers.advance(70000);
  await r.close();
  assert.deepEqual(r.people(), [{...OHNE, visits: [{at: START + 10, seconds: 75}]}]);
});

test('11. the precheck shows archives without creating a player and records full-weight offline interest', async () => {
  const r = loadGlobal({stream: null});
  await r.submit(OHNE.login);

  assert.deepEqual(r.shim.global.opens, [], 'offline precheck must not create a player');
  assert.equal(r.window.visible, true);
  const list = r.window.messages('offline-vods').at(-1);
  assert.ok(list, 'the Open Stream window receives an offline list');
  const broadcasts = JSON.parse(decodeURIComponent(list.data.encoded));
  assert.equal(broadcasts.state, 'ready');
  assert.deepEqual(broadcasts.items.map(({url}) => url), [ARCHIVE_URL]);

  const person = {...OHNE, displayName: OHNE.login};
  assert.deepEqual(r.people(), [{...person, visits: [{at: START, seconds: 0, offline: true}]}]);

  const text = r.shim.file.get(FILE);
  const {createHistory} = requireFromGlobal('./src/history.js');
  const history = createHistory({
    now: () => START,
    storage: {
      read: path => path === FILE ? text : null,
      write: () => assert.fail('query should not write'),
      backup: () => assert.fail('valid history should not be backed up'),
    },
  });
  assert.deepEqual(history.query('').map(({login, score}) => [login, score]), [['ohnepixel', 100]]);
  assert.deepEqual(r.shim.http.calls.map(({method, url}) => [method, url]), [
    ['POST', 'https://gql.twitch.tv/gql'], ['POST', 'https://gql.twitch.tv/gql'],
  ], 'only the status and archive lookups are needed');
});

test('12. VOD playback records the Twitch owner and the YouTube channel ID and name, not the video', async () => {
  const r = loadGlobal();
  await r.submit(ARCHIVE_URL);
  await r.playing(OHNE);
  await r.submit(YOUTUBE_URL);
  await r.playing(YOUTUBE, '2-' + ID);

  assert.deepEqual(r.shim.global.opens.map(({url}) => url), [
    ARCHIVE_URL, 'https://www.youtube.com/watch?v=AbC_123-xYz',
  ]);
  assert.deepEqual(r.people().map(({provider, login, displayName}) => ({provider, login, displayName}))
    .sort((a, b) => a.provider.localeCompare(b.provider)), [OHNE, YOUTUBE]);
});

test('13. unknown users, resolve errors and cancelled opens leave no visits', async () => {
  const r = loadGlobal({stream: 'unknown'});
  await r.submit('not_a_known_user');
  assert.deepEqual(r.people(), [], 'an unknown user is not offline interest');
  // A failed child resolves nothing playable and closes without history-start.
  await r.close('1-' + ID);
  assert.deepEqual(r.people(), []);
  await r.submit(ARCHIVE_URL);
  assert.deepEqual(r.people(), [], 'opening the VOD is not playback');
  await r.close('2-' + ID);
  assert.deepEqual(r.people(), [], 'a VOD resolve error is not a visit');

  r.showOpen();
  r.window.send('open-cancel', {});
  await r.settle();
  assert.equal(r.window.visible, false);
  assert.equal(r.shim.global.opens.length, 2, 'cancelling the input opens nothing');
  assert.deepEqual(r.people(), []);

  // Positive control: an unwired implementation cannot pass by never recording.
  await r.submit(YOUTUBE_URL);
  await r.playing(YOUTUBE, '3-' + ID);
  assert.deepEqual(r.people(), [{...YOUTUBE, visits: [{at: START, seconds: null}]}]);
});

test('14. a native window contributes only when adoption is opted in', async () => {
  for (const adoption of [undefined, false, true]) {
    const r = loadGlobal({adoption});
    await r.playing(OHNE, '0');
    assert.deepEqual(r.shim.global.opens, [], 'this player was opened by IINA, not Streams');
    assert.deepEqual(r.people(), adoption ? [{...OHNE, visits: [{at: START, seconds: null}]}] : [],
      adoption ? 'opted-in adoption records once' : 'adoption is off');
  }
});

test('15. the Streams menu pauses, forgets the focused channel, and clears without dialogs', async () => {
  const r = loadGlobal();
  const item = name => {
    const entry = r.menuItem(name);
    assert.ok(entry, 'missing menu item: ' + name);
    return entry;
  };
  for (const name of [PAUSE, CLEAR, FORGET]) assert.equal(typeof item(name).action, 'function');
  assert.equal(item(PAUSE).selected, false);
  assert.equal(item(FORGET).enabled, false);

  await r.submit(ARCHIVE_URL);
  await r.focus('1-' + ID);
  assert.equal(item(FORGET).enabled, false, 'a player still loading has no visit');
  await r.playing(OHNE);
  assert.equal(item(FORGET).enabled, true);

  await r.submit(YOUTUBE_URL);
  await r.focus('1-' + ID, false);
  await r.focus('2-' + ID);
  assert.equal(item(FORGET).enabled, false, 'another window has the recorded person');
  await r.playing(YOUTUBE, '2-' + ID);
  assert.equal(item(FORGET).enabled, true);

  await r.focus('2-' + ID, false);
  await r.focus('1-' + ID);
  const windows = r.window.shows;
  item(FORGET).action();
  await r.settle();
  assert.deepEqual(r.people().map(({login}) => login), [YOUTUBE.login]);
  assert.equal(item(FORGET).enabled, false);

  item(PAUSE).action();
  await r.settle();
  assert.equal(item(PAUSE).selected, true);
  assert.equal(r.historyFile()?.paused, true);
  item(PAUSE).action();
  await r.settle();
  assert.equal(item(PAUSE).selected, false);
  assert.equal(r.historyFile()?.paused, false);

  item(PAUSE).action();
  item(CLEAR).action();
  await r.settle();
  assert.deepEqual(r.historyFile(), {version: 1, paused: true, people: []});
  assert.equal(r.window.shows, windows, 'history actions do not open another window');
  assert.deepEqual(r.shim.utils.prompts, []);
  assert.deepEqual(r.shim.utils.asks, []);
  assert.deepEqual(r.shim.core.osds, []);
});

test('16. history records, finishes and clears locally without an HTTP request', async () => {
  const r = loadGlobal();
  // VODs bypass #67's live-status precheck; the simulated child also needs no network.
  await r.submit(ARCHIVE_URL);
  await r.playing(OHNE);
  r.shim.timers.advance(60000);
  await r.close();
  assert.deepEqual(r.people(), [{...OHNE, visits: [{at: START, seconds: 60}]}],
    'history must actually run for the network assertion to say anything');

  assert.equal(typeof r.menuItem(CLEAR)?.action, 'function');
  r.menuItem(CLEAR).action();
  await r.settle();
  assert.deepEqual(r.people(), []);
  assert.deepEqual(r.shim.http.calls, []);
});
