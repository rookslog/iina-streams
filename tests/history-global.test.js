'use strict';

// #73 global API choices:
// - The global entry owns @data/history.json (the v1 format in history.test.js).
// - Once playback starts, the child sends history-start {provider, login, displayName}.
//   login is the Twitch channel owner or the case-preserved YouTube channel ID, never
//   the video ID. Global timestamps receipt and counts a repeat from the same playing
//   source once. Existing player-closed ends the visit; no history-start means no visit.
// - Adopted senders use IINA's bare-number label and @data/settings.json's
//   adoptNativeWindows opt-in.
// - Round 2 amendment (lead): history-focus is gone and the bind rebuilds nothing; see the block comment below.
// - Round 2 (TESTS.md items 17-25, after Codex's review): the three history commands live in one
//   "Watch History" submenu; menu changes replace definitions and never write to an added item. Forget acts
//   on the visit bound at menu-open: the player posts history-menu {visit: {provider, login} | null} on
//   iina.menu-update (IINA emits it only to PlayerCore.active, MenuController.swift L847), and the Forget
//   action built for that binding does nothing once the visit has ended or been replaced. history-end carries
//   the same {provider, login} key, so a late end for an earlier visit cannot finish a later one. These two
//   message shapes are the test writer's reading of "keyed by the visit"; history-start stays exactly
//   {provider, login, displayName}.
// - Use #67's real Open Stream precheck protocol and shimmed GQL responses, not a
//   simulated player for an offline open. Use the login as the display name when
//   precheck has only a login, and persist {at, seconds:0, offline:true}.

const test = require('node:test');
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const {join} = require('node:path');
const {createIina, pluginMenuLayout} = require('./support/iina-shim.js');
const Sources = require('../src/source.js');

const SCRIPT = join(__dirname, '../global.js');
const PLAYER_PATH = join(__dirname, '../src/player.js');
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
const SUBMENU = 'Watch History';

function loadGlobal({adoption, stream = {id: '42'}, hold = []} = {}) {
  const shim = createIina({role: 'global', identifier: ID});
  if (adoption !== undefined) {
    shim.file.seed('@data/settings.json', JSON.stringify({adoptNativeWindows: adoption}));
  }

  // Route only the known signed-out #67 status and archive requests. The actual shim
  // still captures every HTTP call, including anything history might add.
  // `hold: ['status']` or `['archive']` keeps those replies pending until release(kind, ...) answers them.
  const ARCHIVE_USER = {videos: {edges: [{node: {
    id: '1234567890', title: 'Fixture Archive', createdAt: '2026-11-20T10:31:57Z', lengthSeconds: 3600,
  }}]}};
  const pending = [];
  const post = shim.iina.http.post;
  shim.iina.http.post = (url, options) => {
    const query = options?.data?.query ?? '';
    let user, kind;
    if (url === 'https://gql.twitch.tv/gql' && query.includes('stream{id}')) {
      kind = 'status';
      user = stream === 'unknown' ? null : {stream};
    } else if (url === 'https://gql.twitch.tv/gql' && query.includes('videos(')) {
      kind = 'archive';
      user = ARCHIVE_USER;
    }
    shim.http.setResponse(user === undefined ? {statusCode: 503} : {statusCode: 200, data: {data: {user}}});
    const answer = post(url, options);
    if (!hold.includes(kind)) return answer;
    return new Promise(resolve => pending.push({
      kind, release: released => resolve({statusCode: 200, data: {data: {user: released === undefined ? user : released}}}),
    }));
  };
  function release(kind, index = 0, user) {
    const entry = pending.filter(item => item.kind === kind)[index];
    assert.ok(entry, `no held ${kind} request #${index}`);
    entry.release(user);
  }

  shim.runScript(SCRIPT, {
    globals: {Date: class extends Date { static now() { return START * 1000 + shim.timers.now; } }},
    require(name) {
      if (name === './config.js') return {identifier: ID, variant: 'unified', qa: false};
      return requireFromGlobal(name);
    },
  });
  const window = shim.standaloneWindow;
  // Items of the Plugin menu as IINA lists them, including a submenu's children (fresh each call: a rebuilt
  // menu replaces its item objects).
  const menuItem = title => {
    const visit = items => {
      for (const item of items) {
        if (item.title === title) return item;
        const nested = visit(item.items);
        if (nested) return nested;
      }
      return undefined;
    };
    return visit(shim.menu.items);
  };

  // #67 added 0 ms timer hops (offline precheck, archive deadline); settle like b6c-global-offline.
  async function settle() {
    for (let turn = 0; turn < 6; turn++) {
      await new Promise(resolve => setImmediate(resolve));
      shim.timers.flush(0);
    }
    await new Promise(resolve => setImmediate(resolve));
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

  // src/history.js also writes a visit id and a root nextId (tests/history.test.js requires them); strip them here.
  function withoutIds(file) {
    const people = file.people.map(person => ({
      ...person, visits: person.visits.map(({id, ...visit}) => visit),
    }));
    const {nextId, ...rest} = file;
    return {...rest, people};
  }

  function historyFile() {
    const text = shim.file.get(FILE);
    return text === undefined ? undefined : withoutIds(JSON.parse(text));
  }

  async function send(name, payload, label) {
    // receive() matches IINA's drop behavior before the new listeners exist.
    await shim.global.receive(name, payload, label);
    await settle();
  }

  return {
    shim, window, showOpen, submit, historyFile, menuItem, settle, release, pending,
    people: () => historyFile()?.people ?? [],
    playing: (person, label = '1-' + ID) => send('history-start', person, label),
    close: (label = '1-' + ID) => send('player-closed', {}, label),
    // The Plugin menu opened with `label` as the active window; `person` is its open visit, or null for none.
    menuOpen: (label, person) => send('history-menu', {visit: person ? {provider: person.provider, login: person.login} : null}, label),
    end: (person, label = '1-' + ID) => send('history-end', {provider: person.provider, login: person.login}, label),
    send,
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

// Round 3 (lead, 2026-11-24, after Codex's narrow check): per-channel Forget is out of 0.5.6 and goes to the People
// screen (#76), where the person is named on screen. Global has no way to know which window is active (no accessor in
// JavascriptAPIGlobal.swift), and a player-side item would be the sixth top-level item, which IINA puts under More…
// (MenuController.swift:660). The Watch History submenu holds Pause and Clear only.
test('15. the Watch History submenu pauses and clears without dialogs, and has no Forget', async () => {
  const r = loadGlobal();
  const item = name => {
    const entry = r.menuItem(name);
    assert.ok(entry, 'missing menu item: ' + name);
    return entry;
  };
  for (const name of [PAUSE, CLEAR]) assert.equal(typeof item(name).action, 'function');
  assert.equal(r.menuItem(FORGET), undefined, 'no Forget item in 0.5.6');
  assert.equal(item(PAUSE).selected, false);
  const windows = r.window.shows;

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

// ---- Round 2 (TESTS.md items 17-25) ----
// Lead's amendment to items 18-19: history-focus is gone (Forget binds only through history-menu); the bind is plain state in global and rebuilds nothing; Forget is always enabled.

// A real src/player.js controller in its own shim: the player half of the Plugin menu, and a sender for global.
function startPlayer(source, resolved) {
  const shim = createIina({label: Sources.label(source, 'unified'), mpv: {path: source.url}});
  const module = {exports: {}};
  shim.runScript(PLAYER_PATH, {globals: {module}, require: createRequire(PLAYER_PATH)});
  module.exports.start(shim.iina, {variant: 'unified'}, {
    readSettings: () => ({chatEnabled: false}),
    resolve: async () => resolved || {ok: false, error: {code: 'NETWORK', message: 'No.'}},
  });
  shim.sidebar.send('ready', {});
  async function load() {
    shim.mpv.set('path', source.url);
    await shim.mpv.runHook('on_load', () => {});
    await new Promise(resolve => setImmediate(resolve));
    shim.emit('iina.file-loaded', source.url);
  }
  return {shim, load};
}

const titlesOf = items => items.map(item => item.title);

test('17. the history commands are one Watch History submenu; Go Live and Chat keep their top-level places', async () => {
  const r = loadGlobal();
  await r.settle();
  const player = startPlayer(Sources.parse('Fixture_Live'));
  const expectTop = ['Open Stream…', SUBMENU, 'Show Streams', 'Go Live', 'Chat'];
  const check = when => {
    // IINA 1.5.1 MenuController.swift L646 (global items + instance items) and L660-667 (the sixth item on
    // goes under "More…"); the shim's pluginMenuLayout models both.
    const {top, more} = pluginMenuLayout(r.shim, player.shim);
    assert.deepEqual(titlesOf(top), expectTop, 'top-level items ' + when);
    assert.deepEqual(titlesOf(more), [], 'nothing is pushed under More… ' + when);
    const submenu = top.find(entry => entry.title === SUBMENU);
    assert.equal(submenu.action, null, 'the submenu title only opens the submenu');
    assert.deepEqual(titlesOf(submenu.items), [PAUSE, CLEAR], "round 3 (item 26): no per-channel Forget");
  };
  check('at start');
  assert.equal(r.menuItem(PAUSE).selected, false, 'Pause is a checkmark item');

  r.menuItem(PAUSE).action();
  await r.settle();
  check('after pausing');
  assert.equal(r.menuItem(PAUSE).selected, true);
});

test('18. history menu changes replace definitions: no write reaches an added item; only pause and clear rebuild', async () => {
  const r = loadGlobal();
  await r.settle();
  const apis = () => r.shim.log.map(entry => entry.api).filter(api => api.startsWith('menu.'));

  // Playing and ending change no displayed state, so neither rebuilds the menu.
  const start = apis().length;
  await r.submit(ARCHIVE_URL);
  await r.playing(OHNE);
  await r.end(OHNE);
  await r.playing(OHNE);
  await r.close();
  assert.deepEqual(apis().slice(start), [], 'no menu call for play or end');

  r.menuItem(PAUSE).action();
  await r.settle();
  assert.equal(r.menuItem(PAUSE).selected, true, 'the rebuilt Pause item shows the new state');
  assert.deepEqual(r.shim.menu.writesToAdded, [],
    'IINA 1.5.1 JavascriptPluginMenuItem writes through an unowned NSMenuItem; a plugin must replace definitions, not edit added ones');

  // Two commands in one turn: one rebuild, ending in forceUpdate after every item is added.
  await r.settle();
  const settled = apis().length, forced = r.shim.menu.forceUpdates;
  r.menuItem(PAUSE).action();
  r.menuItem(CLEAR).action();
  await r.settle();
  const delta = apis().slice(settled);
  assert.equal(delta.filter(api => api === 'menu.removeAllItems').length, 1, 'same-turn changes share one rebuild');
  assert.equal(r.shim.menu.forceUpdates - forced, 1);
  assert.equal(delta[0], 'menu.removeAllItems');
  assert.equal(delta.at(-1), 'menu.forceUpdate', 'forceUpdate comes last, after the definitions are added');
  assert.ok(delta.slice(1, -1).every(api => api === 'menu.item' || api === 'menu.addItem' || api === 'menu.separator'));
  assert.deepEqual(r.shim.menu.writesToAdded, []);
});

test('19. global ignores history-menu and history-focus, and nothing forgets one channel', async () => {
  const r = loadGlobal();
  await r.submit(ARCHIVE_URL);
  await r.playing(OHNE);
  await r.menuOpen('1-' + ID, OHNE);
  await r.send('history-focus', {focused: true}, '1-' + ID);
  await r.settle();
  assert.deepEqual(r.people().map(({login}) => login), [OHNE.login]);
  assert.equal(r.menuItem(FORGET), undefined);
});

test('20. a cancelled offline open records no interest; an edit and a newer submission still do', async () => {
  const r = loadGlobal({stream: null, hold: ['archive']});
  r.showOpen();
  r.window.send('open-stream', {input: OHNE.login});
  await r.settle();
  r.window.send('open-cancel', {});
  await r.settle();
  assert.equal(r.window.visible, false);
  r.release('archive');
  await r.settle();
  assert.deepEqual(r.people(), [], 'the late archive reply of a cancelled open records nothing');
  assert.equal(r.window.visible, false, 'and does not reopen the window');

  // An edit is not a cancellation: the newer submission's own reply records.
  r.showOpen();
  r.window.send('open-stream', {input: 'firstchannel'});
  await r.settle();
  r.window.send('open-edit', {});
  r.window.send('open-stream', {input: 'secondchannel'});
  await r.settle();
  r.release('archive', 2);
  await r.settle();
  assert.deepEqual(r.people().map(({login}) => login), ['secondchannel']);
});

test('21. a cancelled live precheck opens no player and records nothing', async () => {
  const r = loadGlobal({hold: ['status']});
  r.showOpen();
  r.window.send('open-stream', {input: OHNE.login});
  await r.settle();
  r.window.send('open-cancel', {});
  await r.settle();
  r.release('status', 0, {stream: {id: '42'}});
  await r.settle();
  assert.deepEqual(r.shim.global.opens, [], 'the live answer arrives after cancellation: no player');
  assert.deepEqual(r.people(), []);

  // Positive control: a submission that is not cancelled opens its live channel.
  r.showOpen();
  r.window.send('open-stream', {input: OHNE.login});
  await r.settle();
  r.release('status', 1, {stream: {id: '42'}});
  await r.settle();
  assert.equal(r.shim.global.opens.length, 1);
});

test('23. a display name that is a URL with a query reaches neither the message nor the disk', async () => {
  const r = loadGlobal();
  await r.submit(ARCHIVE_URL);
  const hostile = 'https://evil.example/watch?token=SECRETTOKEN';
  const channel = {provider: 'twitch', login: 'ohnepixel', displayName: hostile};
  const player = startPlayer(Sources.parse(ARCHIVE_URL), {
    ok: true, title: 'T', live: false, quality: '720p60', formats: [{id: '720p60', label: '720p60'}],
    mediaURL: 'https://usher.invalid/x.m3u8?sig=S', channel,
  });
  player.shim.global.onPost = post => { r.shim.global.receive(post.name, post.data, '1-' + ID); };
  await player.load();
  await r.settle();

  const sent = JSON.stringify(player.shim.global.posts);
  assert.ok(!/evil\.example|SECRETTOKEN|https?:/.test(sent), 'the message never carries the URL');
  assert.ok(player.shim.global.posts.some(post => post.name === 'history-start'), 'the visit still starts, under the login');
  assert.ok(!/evil\.example|SECRETTOKEN/.test(r.shim.file.get(FILE) ?? ''), 'nor does the file');
  assert.deepEqual(r.people().map(({provider, login, displayName}) => ({provider, login, displayName})),
    [{provider: 'twitch', login: 'ohnepixel', displayName: 'ohnepixel'}], 'the login stands in for the unsafe name');
});

test('24. history-end is keyed by the visit: a late end for an earlier visit or another window changes nothing', async () => {
  const r = loadGlobal();
  await r.submit(ARCHIVE_URL);
  await r.submit(YOUTUBE_URL);
  r.shim.timers.advance(1000);
  await r.playing(OHNE);
  await r.playing(YOUTUBE, '2-' + ID);
  r.shim.timers.advance(20000);
  await r.playing(YOUTUBE); // window 1 moves on: the visit to OHNE ends, a YouTube visit starts
  r.shim.timers.advance(5000);

  const byLogin = login => r.people().find(person => person.login === login);
  const youtubeSeconds = () => byLogin(YOUTUBE.login).visits.map(visit => visit.seconds);
  await r.end(OHNE, '1-' + ID); // late end for the earlier visit of window 1
  assert.deepEqual(byLogin(OHNE.login).visits, [{at: START + 1, seconds: 20}], 'the earlier visit keeps its own length');
  assert.deepEqual(youtubeSeconds(), [null, null], 'a stale end finishes no current visit');
  await r.end(YOUTUBE, '1-' + ID); // the real end of window 1's current visit
  assert.deepEqual(youtubeSeconds().sort(), [5, null].sort(), 'window 1 visit ended once; window 2 visit is still open');
  await r.end(YOUTUBE, '1-' + ID);
  assert.deepEqual(byLogin(YOUTUBE.login).visits.map(visit => visit.seconds).sort(), [5, null].sort(), 'a second end is a no-op');
  await r.end(OHNE, '2-' + ID); // names a visit window 2 does not have
  assert.ok(byLogin(YOUTUBE.login).visits.some(visit => visit.seconds === null), 'window 2 stays open');
});
