'use strict';

// C2b/C3 contracts: sidebar sends 'chat-timing' with a partial {mode, manualDelay, fineTune}
// and 'go-live' with an empty payload. Sidebar state exposes behindLive (seconds or null) and
// chatTiming ({mode, manualDelay, fineTune, delay, state}). Only the bridge names/shape are assumptions.
// The real live clock reads mpv.getNative('demuxer-cache-state')['cache-end'] and polls the resolved
// playlist through the shim. One test substitutes createLiveClock at require time to control confidence.
// No test contacts Twitch; canonical source identities are synthetic and transport URLs use .invalid.

const test = require('node:test');
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {createRequire} = require('node:module');
const Sources = require('../src/source.js');
const {createIina} = require('./support/iina-shim.js');

const playerPath = join(__dirname, '../src/player.js');
const requireFromPlayer = createRequire(playerPath);
const liveSource = Sources.parse('fixture_c3_live');
const vodSource = Sources.parse('https://www.twitch.tv/videos/99999999999999999999');
const signature = 'fake-c3-signature';
const mediaURL = quality => `https://video-weaver.ttvnw.net/${quality}.m3u8?sig=${signature}`;
const playlist = [
  '#EXTM3U',
  '#EXT-X-PROGRAM-DATE-TIME:2026-01-01T00:00:00Z',
  '#EXTINF:2.0,',
  'segment.ts',
].join('\n');

const settle = () => new Promise(resolve => setImmediate(resolve));

function latestState(view) {
  const message = view.messages('state').at(-1);
  assert.ok(message, 'the ready view receives a player state');
  return JSON.parse(decodeURIComponent(message.data.encoded));
}

function messageIds(view) {
  return latestState(view).messages.map(message => message.id);
}

function settingsStore(initial = {}) {
  let value = initial;
  return {
    readSettings: () => structuredClone(value),
    saveSettings: next => { value = structuredClone(next); },
  };
}

function playerFixture(t, options = {}) {
  const source = options.source || liveSource;
  const settings = options.settings || settingsStore({chatEnabled: false});
  const resolveCalls = [];
  const traces = [];
  const shim = createIina({
    label: Sources.label(source, 'unified'),
    mpv: {path: source.url, 'time-pos': 40, speed: 1, duration: 300, pause: false},
  });
  shim.timers.advance(Date.parse('2026-01-01T00:00:10Z'));
  shim.http.setResponse({statusCode: 200, text: playlist});
  shim.iina.mpv.getNative = property => shim.mpv.props.get(property) ?? null;
  shim.mpv.set('demuxer-cache-state', {'cache-end': 82});

  // IINA's addSubMenuItem returns Self; the shared shim already models the children but not chaining.
  // https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPIMenu.swift (item options, addItem)
  // https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptPluginMenuItem.swift (items, addSubMenuItem)
  const makeItem = shim.iina.menu.item;
  shim.iina.menu.item = (...args) => {
    const item = makeItem(...args);
    const addChild = item.addSubMenuItem.bind(item);
    item.addSubMenuItem = child => {
      addChild(child);
      return item;
    };
    return item;
  };

  const module = {exports: {}};
  shim.runScript(playerPath, {
    globals: {module, Date: shim.timers.Date},
    require: name => {
      if (name === './live-clock.js' && options.liveClock) {
        return {...requireFromPlayer(name), createLiveClock: () => options.liveClock};
      }
      return requireFromPlayer(name);
    },
  });
  const services = {
    ...settings,
    ...options.services,
    trace: (name, data) => traces.push([name, data]),
    async resolve(resolvedSource, requestedQuality) {
      assert.equal(resolvedSource.url, source.url);
      resolveCalls.push(requestedQuality);
      const quality = requestedQuality === 'auto720' ? '720p60' : requestedQuality;
      return {
        ok: true, title: 'Synthetic stream', live: source.kind === 'twitch-live',
        quality, mediaURL: options.resolveMedia?.(quality, resolveCalls.length) || mediaURL(quality),
        formats: [{id: '720p60', label: '720p60'}, {id: '360p30', label: '360p30'}],
      };
    },
  };
  const controller = module.exports.start(shim.iina, {variant: 'unified'}, services);
  t.after(() => shim.emit('iina.window-will-close'));
  shim.sidebar.send('ready', {});

  async function loadHook(path = source.url) {
    shim.mpv.set('path', path);
    let continued = 0;
    await shim.mpv.runHook('on_load', () => continued++);
    assert.equal(continued, 1, 'the normal mpv load hook continues once');
  }

  // v0.5.5 review r2 #6: a foreign file deactivates on a main-thread turn and holds the load until then.
  async function loadForeignHook(path) {
    shim.mpv.set('path', path);
    let continued = 0;
    const hook = shim.mpv.runHook('on_load', () => continued++);
    shim.timers.advance(0);
    await hook;
    assert.equal(continued, 1, 'the foreign file load continues once');
  }

  async function fileLoaded(path = source.url) {
    shim.emit('iina.file-loaded', path);
    shim.emit('iina.window-size-adjusted');
    await settle();
    shim.timers.advance(600);
    await settle();
    assert.equal(latestState(shim.sidebar).phase, 'playing');
  }

  async function load(path = source.url) {
    await loadHook(path);
    await fileLoaded(path);
  }

  function connectChat() {
    shim.timers.advance(0);
    shim.sidebar.send('connect', {});
    shim.global.send('auth-ready', JSON.stringify({login: 'fixture_reader', token: 'fake_c3_credential'}));
    shim.emit('iina.plugin-overlay-loaded');
    shim.overlay.send('overlay-ready', {});
    const config = shim.overlay.messages('live-config').at(-1);
    assert.ok(config, 'the existing live transport starts with a fake grant');
    const {session} = JSON.parse(decodeURIComponent(config.data.encoded));
    return messages => shim.overlay.send('live-messages', {session, messages});
  }

  return {shim, controller, traces, resolveCalls, loadHook, loadForeignHook, fileLoaded, load, connectChat};
}

// The shim records mpv argument arrays from the player's VM realm.
function commands(shim) {
  return shim.mpv.commands.map(([name, args]) => [name, args && Array.from(args)]);
}

function polledURLs(shim) {
  return shim.http.calls.map(({url}) => url);
}

test('live clock starts once, only after the Twitch file loads', async t => {
  const {shim, loadHook, fileLoaded} = playerFixture(t);
  assert.deepEqual(polledURLs(shim), [], 'no polling at controller creation');
  await loadHook();
  assert.equal(shim.mpv.props.get('stream-open-filename'), mediaURL('720p60'));
  assert.deepEqual(polledURLs(shim), [], 'resolving the URL must not start polling');
  await fileLoaded();
  assert.deepEqual(polledURLs(shim), [mediaURL('720p60')], 'poll the resolved media playlist, not the channel');
  shim.emit('iina.file-loaded', liveSource.url);
  shim.timers.advance(2000);
  await settle();
  assert.deepEqual(polledURLs(shim), [mediaURL('720p60'), mediaURL('720p60')], 'no duplicate poller');
});

test('quality change replaces the clock with one polling the new playlist', async t => {
  const {shim, load, resolveCalls} = playerFixture(t);
  await load();
  await shim.sidebar.send('change-quality', '360p30');
  const replacement = shim.mpv.commands.find(([name]) => name === 'loadfile');
  assert.ok(replacement, 'the existing quality change issues a reload');
  await load(replacement[1][0]);
  assert.deepEqual(resolveCalls, ['auto720', '360p30']);
  assert.equal(latestState(shim.sidebar).quality, '360p30');
  shim.timers.advance(2000);
  await settle();
  assert.deepEqual(polledURLs(shim), [mediaURL('720p60'), mediaURL('360p30'), mediaURL('360p30')],
    'the new playlist polls immediately and keeps polling; the old poller stops');
});

for (const replacedURL of [false, true]) {
  const description = replacedURL ? 'with a new signed URL' : 'without a URL change';
  test(`same-quality reload restarts the clock ${description}`, async t => {
    const original = mediaURL('720p60');
    const renewed = replacedURL ? original + '&renewal=fixture' : original;
    const {shim, load, resolveCalls} = playerFixture(t, {
      resolveMedia: (_quality, call) => call === 1 ? original : renewed,
    });
    await load();
    await load();
    assert.deepEqual(resolveCalls, ['auto720', 'auto720']);
    assert.equal(shim.mpv.props.get('stream-open-filename'), renewed);
    assert.deepEqual(polledURLs(shim), [original, renewed], 'each completed load polls immediately');
    shim.timers.advance(2000);
    await settle();
    assert.deepEqual(polledURLs(shim), [original, renewed, renewed], 'only the new run polls again');
  });
}

for (const trigger of ['close', 'deactivation', 'foreign source']) {
  test(`live clock stops on ${trigger}`, async t => {
    const {shim, controller, load, loadForeignHook} = playerFixture(t);
    await load();
    const activePolls = polledURLs(shim);
    if (trigger === 'close') shim.emit('iina.window-will-close');
    else if (trigger === 'deactivation') controller.passThrough();
    else await loadForeignHook(Sources.parse('fixture_c3_other').url);
    assert.equal(controller.snapshot().phase, trigger === 'close' ? 'closed' : 'inactive');
    shim.timers.advance(10000);
    await settle();
    assert.deepEqual(polledURLs(shim), activePolls, 'no poll after playback ownership ends');
    assert.deepEqual(activePolls, [mediaURL('720p60')], 'there was an active clock to stop');
    assert.equal(shim.timers.pending().length, 0);
  });
}

function liveMessage(shim) {
  return {id: 'chat-1', timestampMs: shim.timers.now, author: 'viewer', text: 'Synthetic chat message'};
}

test('Manual 10 s holds live chat on both surfaces and reveals it at the timer boundary', async t => {
  const {shim, load, connectChat} = playerFixture(t, {
    settings: settingsStore({chatTiming: {mode: 'manual', manualDelay: 10}}),
  });
  await load();
  const deliver = connectChat();
  const notice = {id: 'notice-1', kind: 'notice', text: 'Synthetic notice'};
  deliver([notice, liveMessage(shim)]);
  for (const view of [shim.sidebar, shim.overlay]) {
    assert.deepEqual(messageIds(view), ['notice-1'], 'untimed notices pass, but timestamped chat waits');
  }
  shim.timers.advance(9999);
  for (const view of [shim.sidebar, shim.overlay]) {
    assert.deepEqual(messageIds(view), ['notice-1'], 'one millisecond early is still early');
  }
  shim.timers.advance(1);
  for (const view of [shim.sidebar, shim.overlay]) {
    assert.deepEqual(messageIds(view), ['notice-1', 'chat-1'], 'no second IRC batch is needed at the due time');
  }
});

test('Live mode keeps showing timestamped messages immediately', async t => {
  const {shim, load, connectChat} = playerFixture(t, {
    settings: settingsStore({chatTiming: {mode: 'live', manualDelay: 10, fineTune: 4}}),
  });
  await load();
  connectChat()([liveMessage(shim)]);
  assert.deepEqual(messageIds(shim.sidebar), ['chat-1']);
  assert.deepEqual(messageIds(shim.overlay), ['chat-1']);
});

test('Auto-uncertain uses the saved manual delay rather than the fine tune', async t => {
  const {shim, load, connectChat} = playerFixture(t, {
    settings: settingsStore({chatTiming: {mode: 'auto', manualDelay: 3, fineTune: 1}}),
  });
  shim.http.setResponse({statusCode: 200, text: '#EXTM3U'}); // No usable program date-time.
  await load();
  connectChat()([liveMessage(shim)]);
  assert.deepEqual(messageIds(shim.sidebar), [], 'uncertain Auto holds chat at launch');
  // Review r3 #2: Auto's cutoff follows the playhead, so the video plays: time-pos advances with the clock.
  const play = ms => {
    for (let left = ms; left > 0; left -= Math.min(100, left)) {
      const step = Math.min(100, left);
      shim.mpv.set('time-pos', shim.mpv.props.get('time-pos') + step / 1000);
      shim.timers.advance(step);
    }
  };
  play(2999);
  assert.deepEqual(messageIds(shim.sidebar), [], 'not due before the 3 s fallback');
  play(1);
  assert.deepEqual(messageIds(shim.sidebar), ['chat-1']);
  const state = latestState(shim.sidebar);
  assert.equal(state.behindLive, null);
  assert.equal(state.chatTiming.state, 'auto-uncertain');
  assert.equal(state.chatTiming.delay, 3);
});

test('the player publishes behindLive for the pill, independent of chat delay', async t => {
  let behind = null;
  const liveClock = {start() {}, stop() {}, behindLive: () => behind, goLiveTarget: () => null};
  const {shim, load} = playerFixture(t, {
    liveClock,
    settings: settingsStore({chatEnabled: false, chatTiming: {mode: 'manual', manualDelay: 10}}),
  });
  await load();
  const samples = [null, 5, 12];
  const published = samples.map(sample => {
    behind = sample;
    shim.emit('mpv.pause.changed');
    return latestState(shim.sidebar).behindLive;
  });
  assert.deepEqual(published, samples, 'the pill receives the live estimate, not the 10 s chat delay');
});

test('Go Live seeks to cache-end minus 2 s when the target is over 1 s ahead', async t => {
  // Lead (go-live-reach): a seek is used only when it reaches the edge, so the clock must be confident.
  // 45 s behind, target 80 with time-pos 40: a 40 s gain leaves 5 s, which is within the 12 s reach.
  const liveClock = {start() {}, stop() {}, behindLive: () => 45, goLiveTarget: () => 80};
  const {shim, load, resolveCalls} = playerFixture(t, {liveClock});
  await load();
  await shim.sidebar.receive('go-live', {});
  assert.deepEqual(commands(shim), [['seek', ['80', 'absolute']]], 'seek without reloading');
  assert.deepEqual(resolveCalls, ['auto720']);
});

for (const target of ['unknown', 'exactly 1 s ahead']) {
  test(`Go Live reloads the current quality when the target is ${target}`, async t => {
    const {shim, load, resolveCalls} = playerFixture(t);
    if (target === 'unknown') shim.http.setResponse({statusCode: 200, text: '#EXTM3U'});
    else shim.mpv.set('time-pos', 79); // cache-end (82) minus 2 minus position = 1.
    await load();
    assert.equal(latestState(shim.sidebar).quality, '720p60');
    await shim.sidebar.receive('go-live', {});
    await settle();
    assert.equal(shim.mpv.commands.length, 1, 'fallback must force a reload, not no-op on the same quality');
    const [[name, [url]]] = shim.mpv.commands;
    assert.equal(name, 'loadfile', 'do not try a near-edge or unknown seek');
    if (url === mediaURL('720p60')) {
      assert.deepEqual(resolveCalls, ['auto720'], 'reusing the current media needs no re-resolution');
    } else {
      assert.equal(Sources.parse(url)?.url, liveSource.url);
      assert.deepEqual(resolveCalls, ['auto720', '720p60'], 're-resolve the active quality, not Auto');
    }
  });
}

test('chat timing settings persist across player instances without replacing other settings', async t => {
  const settings = settingsStore({chatEnabled: false, view: {fontSize: 18}});
  const first = playerFixture(t, {settings});
  await first.load();
  await first.shim.sidebar.receive('chat-timing', {mode: 'manual', manualDelay: 10});
  await first.shim.sidebar.receive('chat-timing', {mode: 'auto', fineTune: -1.5});
  const expected = {mode: 'auto', manualDelay: 10, fineTune: -1.5};
  assert.deepEqual(settings.readSettings(), {chatEnabled: false, view: {fontSize: 18}, chatTiming: expected});
  first.shim.emit('iina.window-will-close');

  const second = playerFixture(t, {settings});
  await second.load();
  const {mode, manualDelay, fineTune} = latestState(second.shim.sidebar).chatTiming || {};
  assert.deepEqual({mode, manualDelay, fineTune}, expected, 'another player initializes from the stored object');
});

test('Twitch VOD replay retains its media-time offset and does not start a live clock', async t => {
  const file = 'chunk-000000.json';
  const row = {id: 'vod-row', time: 45, author: 'viewer', text: 'Replay chat', color: '', badges: [], kind: 'message'};
  const index = {version: 1, count: 1, chunks: [{file, start: 45, end: 45, count: 1}]};
  const {shim, controller, load} = playerFixture(t, {
    source: vodSource,
    settings: settingsStore({chatEnabled: false, chatTiming: {mode: 'manual', manualDelay: 120}}),
    services: {
      dataPath: name => '/data/' + name,
      runHelper: async (_name, args) => ({ok: true, indexPath: args.at(-1) + '/index.json'}),
      readFile: path => JSON.stringify(path.endsWith('/index.json') ? index : [row]),
    },
  });
  await load();
  assert.equal(await controller.importArchive('/fixtures/replay.json'), true);
  assert.equal(latestState(shim.sidebar).chat.mode, 'replay');
  assert.deepEqual(messageIds(shim.sidebar), [], 'the 45 s row is not due at video time 40 s');
  shim.timers.advance(10000);
  assert.deepEqual(messageIds(shim.sidebar), [], 'wall-clock time does not advance replay');
  shim.sidebar.send('offset', 5);
  assert.equal(latestState(shim.sidebar).chat.offset, 5);
  assert.deepEqual(messageIds(shim.sidebar), ['vod-row'], 'the +5 s replay offset reveals the row immediately');
  shim.sidebar.send('seek-chat', 45);
  assert.deepEqual(commands(shim), [['seek', ['40', 'absolute+exact']]]);
  assert.deepEqual(polledURLs(shim), [], 'VOD never polls a live playlist');
});

test('menu has Show Streams, Go Live with Ctrl+Meta+g, and a Chat submenu', t => {
  const {shim} = playerFixture(t);
  const items = shim.menu.items;
  assert.deepEqual(items.map(item => item.title), ['Show Streams', 'Go Live', 'Chat']);
  const [show, goLive, chat] = items;
  assert.equal(typeof show.action, 'function');
  assert.equal(typeof goLive.action, 'function');
  assert.equal(goLive.keyBinding, 'Ctrl+Meta+g');
  assert.equal(chat.action, null, 'the parent only opens its submenu');
  assert.deepEqual(chat.items.map(item => item.title),
    ['Hide Chat', 'Import Chat Archive…', 'Turn Chat Off', 'In Sidebar', 'Over Video', 'Beside Video']);
  assert.ok(chat.items.every(item => typeof item.action === 'function'));
  // Lead: Ctrl+Meta+l collided with Log Viewer in the v1.5.1 main-menu fixture; G is free there.
});

test('playlist transport failures never leak the URL into player logs', async t => {
  const {shim, load, traces} = playerFixture(t);
  const url = mediaURL('720p60');
  shim.http.failTransport(new Error(`Synthetic fetch failure for ${url}`));
  await load();
  assert.deepEqual(polledURLs(shim), [url], 'exercise the real error path, not an idle logger');
  const logs = [
    ...shim.console.logs,
    ...shim.console.errors,
    ...traces,
    ...shim.file.writes.map(write => write.content),
  ];
  // The shim interaction ledger is not plugin logging; HTTP/mpv must receive the URL.
  // Inspect stack/message too: JSON.stringify(Error) otherwise drops both.
  const captured = JSON.stringify(logs, (_key, value) => {
    if (value && typeof value.stack === 'string') return value.stack;
    return value;
  });
  assert.equal(captured.includes(url), false, 'no signed playlist URL in console, traces or diagnostic files');
  assert.equal(captured.includes(signature), false, 'no partial URL exposing the signature either');
});

test('Go Live reloads when a seek would stop short of the edge (lead, observed after a pause)', async t => {
  // 30 s behind, target only 3 s ahead: the seek would leave 27 s, so Go Live reloads instead.
  const liveClock = {start() {}, stop() {}, behindLive: () => 30, goLiveTarget: () => 43};
  const {shim, load, resolveCalls} = playerFixture(t, {liveClock});
  await load();
  await shim.sidebar.receive('go-live', {});
  await settle();
  assert.equal(commands(shim).some(([name]) => name === 'seek'), false, 'no short seek');
  assert.equal(resolveCalls.length, 2, 'the current quality is resolved again for the reload');
});
