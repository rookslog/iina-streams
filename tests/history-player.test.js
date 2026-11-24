'use strict';

// #73 watch history, player half. tests/history-global.test.js sends the child messages to global directly; this
// file pins the sender, src/player.js, through the shim's real hooks and events. Protocol (see that file's header):
//   history-start {provider, login, displayName}  once per activation, on iina.file-loaded, only for a source
//     that plays; login is the Twitch channel owner or the YouTube channel id, never a video id.
//   history-menu {visit}                          on iina.menu-update (IINA emits it only to PlayerCore.active when the
//     Plugin menu opens, MenuController.swift L847): {visit: {provider, login}} for this window's open visit, or
//     {visit: null}. Round 2 (lead's amendment): history-focus no longer exists, so the player sends none and
//     listens to no iina.window-main.changed.
//   history-end {provider, login}                 exactly once per started visit, on retire, a managed foreign load
//     and window close (round 2, item 24).
//   Round 2 also: history-start posts exactly {provider, login, displayName}, validated (item 23), and only for a
//     load this activation resolved and handed off (item 22).
// No message carries a URL, title, token or query string. Synthetic host: nothing here contacts Twitch or YouTube.

const test = require('node:test');
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {createRequire} = require('node:module');
const Sources = require('../src/source.js');
const {createIina} = require('./support/iina-shim.js');
const {createResolver} = require('../src/resolve.js');

const PLAYER_PATH = join(__dirname, '../src/player.js');
const LIVE = Sources.parse('Fixture_Live');
const VOD = Sources.parse('https://www.twitch.tv/videos/1234567890');
const YOUTUBE = Sources.parse('https://youtu.be/AbC_123-xYz');
const SIGNED = 'https://usher.invalid/api/channel/hls/secret.m3u8?sig=SIGSECRET&token=%7B%22TOKENSECRET%22%7D';
const TITLE = 'A Very Private Title';
const settle = () => new Promise(resolve => setImmediate(resolve));

function okResult(source, extra = {}) {
  return {
    ok: true, title: TITLE, live: source.kind === 'twitch-live', quality: '720p60',
    mediaURL: SIGNED, formats: [{id: '720p60', label: '720p60'}], ...extra,
  };
}

function playerFixture(t, source, resolve) {
  const shim = createIina({label: Sources.label(source, 'unified'), mpv: {path: source.url}});
  const module = {exports: {}};
  shim.runScript(PLAYER_PATH, {globals: {module}, require: createRequire(PLAYER_PATH)});
  const controller = module.exports.start(shim.iina, {variant: 'unified'}, {
    readSettings: () => ({chatEnabled: false}),
    resolve: typeof resolve === 'function' ? resolve : async () => resolve,
  });
  t.after(() => shim.emit('iina.window-will-close'));
  shim.sidebar.send('ready', {});

  async function load() {
    shim.mpv.set('path', source.url);
    await shim.mpv.runHook('on_load', () => {});
    await settle();
  }
  const fileLoaded = () => shim.emit('iina.file-loaded', source.url);
  const posts = () => shim.global.posts.filter(post => post.name.startsWith('history-'));
  const named = name => posts().filter(post => post.name === name).map(post => post.data);
  return {shim, controller, load, fileLoaded, posts, named};
}

async function playing(t, source, result) {
  const f = playerFixture(t, source, result === undefined ? okResult(source) : result);
  await f.load();
  return f;
}

test('#73 a Twitch live source posts history-start once, on file-loaded, and not again for the same activation', async t => {
  const f = await playing(t, LIVE);
  assert.deepEqual(f.posts(), [], 'nothing is posted before the file plays');
  f.fileLoaded();
  assert.deepEqual(f.named('history-start'), [{provider: 'twitch', login: 'fixture_live', displayName: 'fixture_live'}]);
  f.fileLoaded();
  f.fileLoaded();
  assert.equal(f.named('history-start').length, 1, 'repeat file-loaded events do not post again');
});

test('#73 a Twitch live source with a resolved display name posts it', async t => {
  const channel = {provider: 'twitch', login: 'fixture_live', displayName: 'Fixture_Live'};
  const f = await playing(t, LIVE, okResult(LIVE, {channel}));
  f.fileLoaded();
  assert.deepEqual(f.named('history-start'), [channel]);
});

test('#73 a Twitch VOD posts the channel owner, never the video id', async t => {
  const channel = {provider: 'twitch', login: 'ohnepixel', displayName: 'Ohnepixel'};
  const f = await playing(t, VOD, okResult(VOD, {channel}));
  f.fileLoaded();
  assert.deepEqual(f.named('history-start'), [channel]);
  assert.ok(!JSON.stringify(f.posts()).includes('1234567890'), 'the video id is in no history message');
});

test('#73 a Twitch VOD whose owner is unknown posts no history-start', async t => {
  const f = await playing(t, VOD);
  f.fileLoaded();
  assert.deepEqual(f.named('history-start'), []);
  assert.ok(!JSON.stringify(f.posts()).includes('1234567890'));
});

test('#73 a YouTube video posts its channel id and name; with no channel_id it posts nothing', async t => {
  const channel = {provider: 'youtube', login: 'UCaBcD0123456789xyzPQrst', displayName: 'TubeChannel'};
  const f = await playing(t, YOUTUBE, okResult(YOUTUBE, {channel}));
  f.fileLoaded();
  assert.deepEqual(f.named('history-start'), [channel], 'the channel id keeps its case');
  assert.ok(!JSON.stringify(f.posts()).includes('AbC_123-xYz'), 'the video id is in no history message');

  const none = await playing(t, YOUTUBE);
  none.fileLoaded();
  assert.deepEqual(none.named('history-start'), [], 'no channel result, no visit');
  assert.deepEqual(none.posts(), [], 'and no focus report either');
});

test('#73 a load that fails before file-loaded posts no history-start', async t => {
  const f = playerFixture(t, LIVE, {ok: false, error: {code: 'NETWORK', message: 'Twitch could not be reached.'}});
  await f.load();
  await settle();
  assert.deepEqual(f.posts(), [], 'the failed load alone starts no visit');
});

test('#73 a load cancelled before file-loaded posts no history-start', async t => {
  let release;
  const f = playerFixture(t, LIVE, () => new Promise(resolve => { release = () => resolve(okResult(LIVE)); }));
  const loading = f.load();
  await settle();
  f.shim.emit('iina.window-will-close');
  release();
  await loading;
  await settle();
  assert.deepEqual(f.posts(), [], 'closing the window mid-load posts nothing, not even history-end');
});

test('#73 retiring a started activation posts history-end after history-start', async t => {
  const f = await playing(t, LIVE);
  f.fileLoaded();
  f.controller.retire();
  assert.deepEqual(f.named('history-end'), [{provider: 'twitch', login: 'fixture_live'}], 'keyed by the visit');
  const names = f.posts().map(post => post.name);
  assert.ok(names.indexOf('history-start') < names.indexOf('history-end'));
  f.controller.retire();
  assert.equal(f.named('history-end').length, 1, 'a second retire posts nothing more');
});

test('#73 retiring an activation that never started posts nothing', async t => {
  const f = await playing(t, LIVE);
  f.controller.retire();
  assert.deepEqual(f.posts(), []);
  const failed = playerFixture(t, LIVE, {ok: false, error: {code: 'NETWORK', message: 'No.'}});
  await failed.load();
  failed.controller.retire();
  assert.deepEqual(failed.posts(), []);
});

test('#73 no history message carries a URL, title, token or query string', async t => {
  const cases = [
    [LIVE, okResult(LIVE)],
    [VOD, okResult(VOD, {channel: {provider: 'twitch', login: 'ohnepixel', displayName: 'Ohnepixel'}})],
    [YOUTUBE, okResult(YOUTUBE, {channel: {provider: 'youtube', login: 'UCaBcD0123456789xyzPQrst', displayName: 'TubeChannel'}})],
  ];
  for (const [source, result] of cases) {
    const f = await playing(t, source, result);
    f.fileLoaded();
    f.shim.emitMenuUpdate();
    f.controller.retire();
    const all = f.posts();
    assert.ok(all.some(post => post.name === 'history-start'), `${source.kind} started`);
    for (const post of all) {
      const text = JSON.stringify(post);
      assert.ok(!/https?:|\?|sig=|token|SIGSECRET|TOKENSECRET|usher\.invalid/i.test(text), `${source.kind} ${post.name}: ${text}`);
      assert.ok(!text.includes(TITLE), `${source.kind} ${post.name} carries the title`);
      assert.ok(!text.includes(source.url), `${source.kind} ${post.name} carries the source URL`);
    }
  }
});

// ---- Round 2 (TESTS.md items 17-25) ----
// Lead's amendment to items 18-19: history-focus is gone; Forget binds only through history-menu at iina.menu-update.

const channelOf = (provider, login, displayName) => ({provider, login, displayName});
const YT_ID = 'UCaBcD0123456789xyzPQrst';

test('#73 19. iina.menu-update posts history-menu with this window\'s open visit, or none', async t => {
  const f = await playing(t, LIVE);
  f.shim.emitMenuUpdate();
  assert.deepEqual(f.named('history-menu'), [{visit: null}], 'nothing has played yet');
  f.fileLoaded();
  f.shim.emitMenuUpdate();
  assert.deepEqual(f.named('history-menu').at(-1), {visit: {provider: 'twitch', login: 'fixture_live'}});
  assert.equal(f.named('history-menu').length, 2, 'one message per menu-update');
  f.controller.retire();
  f.shim.emitMenuUpdate();
  assert.ok(f.named('history-menu').slice(2).every(message => message.visit === null), 'a retired window has no visit');
});

test('#73 19. the player sends no history-focus message at all', async t => {
  const f = await playing(t, LIVE);
  f.shim.emit('iina.window-main.changed', true);
  f.fileLoaded();
  f.shim.emit('iina.window-main.changed', false);
  f.shim.emitMenuUpdate();
  f.shim.emit('iina.window-main.changed', true);
  f.controller.retire();
  assert.deepEqual(f.posts().filter(post => post.name === 'history-focus'), []);
  assert.deepEqual(f.posts().map(post => post.name), ['history-start', 'history-menu', 'history-end'],
    'history-start, the menu report, history-end: nothing else');
});

test('#73 22. a failed resolve followed by IINA\'s own fallback load posts no history-start', async t => {
  const f = playerFixture(t, LIVE, {ok: false, error: {code: 'NETWORK', message: 'Twitch could not be reached.'}});
  await f.load();
  // IINA releases the original URL and mpv\'s yt-dlp loader can still succeed (MPVController.swift, ytdl_hook.lua).
  f.fileLoaded();
  await settle();
  assert.deepEqual(f.named('history-start'), []);
  assert.deepEqual(f.posts(), []);
});

test('#73 22. a generation-0 load that Streams never resolved is not a visit, but the resolved handoff is', async t => {
  const f = playerFixture(t, LIVE, okResult(LIVE));
  f.fileLoaded(); // no on_load hook has resolved anything yet; a live source has an identity from its name alone
  assert.deepEqual(f.named('history-start'), []);
  await f.load();
  f.fileLoaded();
  assert.equal(f.named('history-start').length, 1, 'positive control: the resolved handoff starts the visit');
});

const BAD_IDENTITIES = [
  ['a Twitch login with an uppercase letter', LIVE, channelOf('twitch', 'Fixture_Live', 'Fixture_Live')],
  ['a Twitch login of 26 characters', LIVE, channelOf('twitch', 'a'.repeat(26), 'name')],
  ['a Twitch login with a slash', LIVE, channelOf('twitch', 'a/b', 'name')],
  ['a Twitch login that is a URL', LIVE, channelOf('twitch', 'https://x.example/y', 'name')],
  ['an empty Twitch login', LIVE, channelOf('twitch', '', 'name')],
  ['a YouTube id without the UC prefix', YOUTUBE, channelOf('youtube', 'XXaBcD0123456789xyzPQrst', 'name')],
  ['a YouTube id one character short', YOUTUBE, channelOf('youtube', YT_ID.slice(1), 'name')],
  ['a YouTube id one character long', YOUTUBE, channelOf('youtube', YT_ID + 'x', 'name')],
  ['a Twitch-shaped login for YouTube', YOUTUBE, channelOf('youtube', 'ohnepixel', 'name')],
  ['an unknown provider', LIVE, channelOf('vimeo', 'fixture_live', 'name')],
];

test('#73 23. an invalid login or provider posts no history-start', async t => {
  for (const [what, source, channel] of BAD_IDENTITIES) {
    const f = await playing(t, source, okResult(source, {channel}));
    f.fileLoaded();
    assert.deepEqual(f.named('history-start'), [], what);
  }
});

test('#73 23. an unsafe or overlong display name is replaced by the login; safe ones stay', async t => {
  const login = 'ohnepixel', cases = [
    ['Ohne Pixel', 'Ohne Pixel'],
    ['x'.repeat(64), 'x'.repeat(64)],
    ['x'.repeat(65), login],
    ['https://evil.example/a?b=c', login],
    ['see://here', login],
    ['a/b', login], ['a?b', login], ['a=b', login], ['a&b', login], ['a#b', login],
    ['two  spaces', login], ['tab\there', login], ['line\nbreak', login],
  ];
  for (const [displayName, expected] of cases) {
    const f = await playing(t, VOD, okResult(VOD, {channel: channelOf('twitch', login, displayName)}));
    f.fileLoaded();
    assert.deepEqual(f.named('history-start'), [channelOf('twitch', login, expected)], JSON.stringify(displayName));
  }
});

test('#73 23. only provider, login and displayName are posted, whatever the channel object carries', async t => {
  const extra = {...channelOf('twitch', 'ohnepixel', 'Ohnepixel'), url: 'https://x.example/?t=1', id: '123', title: TITLE};
  const f = await playing(t, VOD, okResult(VOD, {channel: extra}));
  f.fileLoaded();
  assert.deepEqual(f.named('history-start'), [channelOf('twitch', 'ohnepixel', 'Ohnepixel')]);
});

test('#73 24. exactly one history-end per visit on retire, a managed foreign load and window close', async t => {
  const visit = {provider: 'twitch', login: 'fixture_live'};
  const retired = await playing(t, LIVE);
  retired.fileLoaded();
  retired.controller.retire();
  retired.shim.emit('iina.window-will-close');
  assert.deepEqual(retired.named('history-end'), [visit], 'retire, then close');

  const foreign = await playing(t, LIVE);
  foreign.fileLoaded();
  foreign.shim.mpv.set('path', '/Users/fixture/movie.mkv');
  await foreign.shim.mpv.runHook('on_load', () => {}).catch(() => {});
  await settle();
  assert.deepEqual(foreign.named('history-end'), [visit], 'a managed foreign load ends the visit');
  foreign.shim.emit('iina.window-will-close');
  assert.deepEqual(foreign.named('history-end'), [visit], 'and the later window close adds none');

  const closed = await playing(t, LIVE);
  closed.fileLoaded();
  closed.shim.emit('iina.window-will-close');
  closed.shim.emit('iina.window-will-close');
  assert.deepEqual(closed.named('history-end'), [visit], 'window close ends the visit once');
});

test('#73 24. the resolver returns the channel in its result, for Twitch live and VOD', async () => {
  for (const [source, channel] of [
    [LIVE, channelOf('twitch', 'fixture_live', 'Fixture_Live')],
    [VOD, channelOf('twitch', 'ohnepixel', 'Ohnepixel')],
  ]) {
    const resolve = createResolver({
      resolveTwitch: async () => ({live: source === LIVE, title: 'T', channel, variants: [
        {id: '720p60', url: 'https://media.invalid/720.m3u8', label: '720p60', resolution: '1280x720', fps: 60, bandwidth: 1, video: true},
      ]}),
      http: {get: async () => assert.fail('no request'), post: async () => assert.fail('no request')},
      helperResolve: async () => assert.fail('no helper'),
      log: () => {}, now: () => 0,
    });
    const result = await resolve(source, '720p60');
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(result.channel, channel, source.kind);
  }
});

test('#73 24. a channel reported after the signal is lost cannot reach a later load of the same source', async t => {
  const reported = [];
  const resolve = createResolver({
    resolveTwitch: async () => ({live: false, title: 'T', channel: channelOf('twitch', 'ohnepixel', 'Ohnepixel'), variants: [
      {id: '720p60', url: 'https://media.invalid/720.m3u8', label: '720p60', resolution: '1280x720', fps: 60, bandwidth: 1, video: true},
    ]}),
    http: {}, helperResolve: async () => assert.fail('no helper'), log: () => {}, now: () => 0,
    onChannel: (source, channel) => reported.push([source.url, channel]),
  });
  await resolve(VOD, '720p60', {lost: () => true}).catch(() => {});
  assert.deepEqual(reported, [], 'no URL-keyed slot is written after loss');

  // The player takes identity from the result only: a slot another service holds for the URL is not consulted.
  const shim = createIina({label: Sources.label(VOD, 'unified'), mpv: {path: VOD.url}});
  const module = {exports: {}};
  shim.runScript(PLAYER_PATH, {globals: {module}, require: createRequire(PLAYER_PATH)});
  module.exports.start(shim.iina, {variant: 'unified'}, {
    readSettings: () => ({chatEnabled: false}),
    resolve: async () => okResult(VOD),
    resolvedChannel: () => channelOf('twitch', 'stale_owner', 'Stale Owner'),
  });
  t.after(() => shim.emit('iina.window-will-close'));
  shim.sidebar.send('ready', {});
  shim.mpv.set('path', VOD.url);
  await shim.mpv.runHook('on_load', () => {});
  await settle();
  shim.emit('iina.file-loaded', VOD.url);
  assert.deepEqual(shim.global.posts.filter(post => post.name === 'history-start'), []);
});

test('#73 25. a Twitch VOD that falls back to Streamlink without owner metadata records no visit and asks nothing extra', async t => {
  const requests = [];
  const helper = {ok: true, source: VOD, title: 'From helper', live: false, duration: 90, quality: '480p',
    formats: [{id: '480p', label: '480p'}], mediaURL: 'https://helper.invalid/vod.m3u8'};
  let helperCalls = 0;
  const resolve = createResolver({
    resolveTwitch: async () => { throw Object.assign(new Error('x'), {code: 'NETWORK'}); },
    http: {get: async (...a) => requests.push(a), post: async (...a) => requests.push(a)},
    helperResolve: async () => { helperCalls++; return helper; },
    log: () => {}, now: () => 0,
  });
  const result = await resolve(VOD, '480p');
  assert.equal(result.ok, true);
  assert.equal(result.channel, undefined, 'no owner is guessed');
  assert.equal(helperCalls, 1);
  assert.deepEqual(requests, [], 'history adds no request');

  const f = await playing(t, VOD, result);
  f.fileLoaded();
  assert.deepEqual(f.named('history-start'), [], 'documented omission: no owner, no visit');
});
