'use strict';
// Tests for the shared IINA 1.5.1 contract shim itself (#13). If the shim goes soft, every test
// built on it silently stops catching the bugs it was written to catch.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {
  createIina, createWebViewIina, createFakeTimers, createKeychainStore,
  normalizeKeyBinding, keyBindingProblems, loadBoundKeys, jsonPayload, isPlainObject
} = require('./support/iina-shim.js');

const noop = () => {};

// ---- menu ------------------------------------------------------------------------------------

test('menu.item keeps the third options argument: keyBinding, enabled and selected', () => {
  const {iina, menu} = createIina();
  const item = iina.menu.item('Open', noop, {keyBinding: 'Ctrl+o', enabled: false, selected: true});
  assert.equal(item.title, 'Open');
  assert.equal(item.keyBinding, 'Ctrl+o');
  assert.equal(item.enabled, false);
  assert.equal(item.selected, true);
  assert.equal(menu.created.at(-1), item);
});

test('menu.item defaults match IINA when options are missing or not an object', () => {
  const {iina} = createIina();
  for (const options of [undefined, null, 'x', 5]) {
    const item = iina.menu.item('Plain', null, options);
    assert.deepEqual([item.enabled, item.selected, item.keyBinding, item.action], [true, false, null, null]);
  }
});

test('menu.item rejects an action that is neither a function nor null, and a non-string title', () => {
  const {iina} = createIina();
  assert.throws(() => iina.menu.item('Bad', undefined), /action must be a function or null/);
  assert.throws(() => iina.menu.item('Bad', 'open'), /action must be a function or null/);
  assert.throws(() => iina.menu.item(7, noop), /title must be a string/);
});

test('menu.addItem accepts only items made by the menu API; forceUpdate is counted', () => {
  const shim = createIina();
  assert.throws(() => shim.iina.menu.addItem({title: 'forged', action: noop}), /needs an item made by menu\.item/);
  shim.iina.menu.addItem(shim.iina.menu.item('A', noop));
  shim.iina.menu.addItem(shim.iina.menu.separator());
  assert.equal(shim.menu.items.length, 2);
  assert.equal(shim.menu.items[1].isSeparator, true);
  shim.iina.menu.forceUpdate();
  assert.equal(shim.menu.forceUpdates, 1);
  assert.equal(shim.iina.menu.removeAt(5), false);
  assert.equal(shim.iina.menu.removeAt(0), true);
  shim.iina.menu.removeAllItems();
  assert.equal(shim.menu.items.length, 0);
});

test('key binding helper flags a non-normalized binding', () => {
  assert.equal(normalizeKeyBinding('Meta+Shift+S'), 'Meta+S');
  const problems = keyBindingProblems('Shift+Meta+k');
  assert.deepEqual(problems.map(p => p.reason), ['not-normalized']);
  assert.equal(problems[0].expected, 'Meta+K');
  assert.deepEqual(keyBindingProblems('Ctrl+Alt+Shift+F11'), []);
});

test('key binding helper flags a collision with a bundled binding or main-menu key', () => {
  assert.ok(loadBoundKeys().has('Meta+S'));
  const [problem] = keyBindingProblems('Meta+S');
  assert.equal(problem.reason, 'collides');
  assert.match(problem.with, /main menu|\.conf/);
});

test('menu.problems() inspects added items, including sub-menu items, and a binding used twice', () => {
  const shim = createIina();
  const {menu} = shim.iina;
  menu.addItem(menu.item('Clean', noop, {keyBinding: 'Ctrl+Alt+Shift+F11'}));
  assert.deepEqual(shim.menu.problems(), []);
  const parent = menu.item('Parent', null);
  parent.addSubMenuItem(menu.item('Nested twin', noop, {keyBinding: 'Ctrl+Alt+Shift+F11'}));
  parent.addSubMenuItem(menu.item('Nested collision', noop, {keyBinding: 'Meta+S'}));
  menu.addItem(parent);
  const problems = shim.menu.problems();
  assert.deepEqual(problems.map(p => [p.title, p.reason]), [['Nested twin', 'collides'], ['Nested collision', 'collides']]);
  assert.match(problems[0].with, /plugin item "Clean"/);
  assert.throws(() => shim.menu.assertKeyBindings());
});

test('menu.problems() ignores items that are created but never added', () => {
  const shim = createIina();
  shim.iina.menu.item('Never added', noop, {keyBinding: 'Meta+S'});
  assert.deepEqual(shim.menu.problems(), []);
});

// ---- loadFile clears listeners ---------------------------------------------------------------

for (const kind of ['sidebar', 'overlay']) {
  test(`${kind}.loadFile clears every onMessage listener registered on that view`, () => {
    const shim = createIina();
    const view = shim.iina[kind], control = shim[kind];
    const seen = [];
    view.onMessage('a', () => seen.push('a'));
    view.onMessage('b', () => seen.push('b'));
    control.send('a', {});
    view.loadFile('ui/page.html');
    assert.deepEqual(control.loads, ['ui/page.html']);
    assert.equal(control.listeners.size, 0, 'loadFile must drop all listeners');
    assert.equal(control.receive('a', {}), undefined);
    assert.deepEqual(control.dropped.map(d => d.name), ['a']);
    assert.throws(() => control.send('b', {}), /no .* onMessage listener registered for "b"/);
    assert.deepEqual(seen, ['a']);
    view.onMessage('a', () => seen.push('a2'));
    control.send('a', {});
    assert.deepEqual(seen, ['a', 'a2']);
  });

  test(`${kind}.loadFile leaves the other view's listeners alone`, () => {
    const shim = createIina();
    const other = kind === 'sidebar' ? 'overlay' : 'sidebar';
    shim.iina[other].onMessage('keep', noop);
    shim.iina[kind].onMessage('drop', noop);
    shim.iina[kind].loadFile('x.html');
    assert.deepEqual([...shim[other].listeners.keys()], ['keep']);
  });

  test(`${kind}.onMessage rejects a non-function callback or non-string name`, () => {
    const {iina} = createIina();
    assert.throws(() => iina[kind].onMessage('x', undefined), /callback must be a function/);
    assert.throws(() => iina[kind].onMessage('x', 'not a function'), /callback must be a function/);
    assert.throws(() => iina[kind].onMessage(5, noop), /name must be a string/);
  });
}

test('sidebar.loadFile and show throw before the window is loaded (IINA 1.5.1)', () => {
  const shim = createIina({windowLoaded: false});
  assert.throws(() => shim.iina.sidebar.loadFile('ui/sidebar.html'), /window is not available/);
  assert.throws(() => shim.iina.sidebar.show(), /window is not available/);
  assert.throws(() => shim.iina.sidebar.hide(), /window is not available/);
  assert.equal(shim.sidebar.loads.length, 0);
  shim.core.native.loaded = true;
  shim.iina.sidebar.loadFile('ui/sidebar.html');
  shim.iina.sidebar.show();
  assert.equal(shim.sidebar.visible, true);
});

test('a listener cleared by loadFile makes page messages drop, as in IINA', () => {
  const shim = createIina();
  let calls = 0;
  shim.iina.sidebar.onMessage('ready', () => calls++);
  shim.iina.sidebar.loadFile('ui/sidebar.html');
  shim.sidebar.receive('ready', {});
  assert.equal(calls, 0);
  assert.equal(shim.sidebar.dropped.length, 1);
});

// ---- payloads --------------------------------------------------------------------------------

class Native { constructor() { this.x = 1; } }
const BAD_PAYLOADS = [
  ['undefined', undefined],
  ['function', () => {}],
  ['nested function', {a: {b: noop}}],
  ['symbol', Symbol('s')],
  ['bigint', 10n],
  ['NaN', {a: NaN}],
  ['Infinity', [Infinity]],
  ['undefined array element', [1, undefined]],
  ['Map', new Map([[1, 2]])],
  ['Set', new Set([1])],
  ['Date', new Date(0)],
  ['class instance', new Native()],
  ['nested class instance', {a: [new Native()]}],
  ['native Error', new Error('x')],
  ['cycle', (() => { const o = {}; o.self = o; return o; })()]
];

for (const [name, payload] of BAD_PAYLOADS) {
  test(`postMessage rejects a ${name} payload on sidebar, overlay and both global roles`, () => {
    const child = createIina({role: 'child'}), parent = createIina({role: 'global'});
    assert.throws(() => child.iina.sidebar.postMessage('m', payload), TypeError);
    assert.throws(() => child.iina.overlay.postMessage('m', payload), TypeError);
    assert.throws(() => child.iina.global.postMessage('m', payload), TypeError);
    assert.throws(() => parent.iina.global.postMessage(1, 'm', payload), TypeError);
    assert.throws(() => parent.iina.global.postMessage(null, 'm', payload), TypeError);
    assert.deepEqual([child.sidebar.posts, child.overlay.posts, child.global.posts, parent.global.posts], [[], [], [], []]);
  });
}

test('postMessage accepts primitives, null, plain data and objects built in another vm realm', () => {
  const shim = createIina();
  const foreign = vm.runInNewContext('({list: [1, {deep: true}], text: "t"})');
  for (const payload of ['text', 0, false, null, [], {}, {a: [1, 'x', null, {b: 2}]}, foreign]) shim.iina.sidebar.postMessage('m', payload);
  assert.equal(shim.sidebar.posts.length, 8);
  assert.deepEqual(shim.sidebar.posts.at(-1).data, {list: [1, {deep: true}], text: 't'});
  assert.equal(shim.posts.length, 8, 'the combined ordered post log sees every message');
});

test('an object property set to undefined is tolerated and dropped, like JSON.stringify', () => {
  assert.deepEqual(jsonPayload({a: 1, b: undefined}), {a: 1});
});

test('a recorded payload is a copy, not the caller\'s live object', () => {
  const shim = createIina();
  const payload = {n: 1};
  shim.iina.overlay.postMessage('m', payload);
  payload.n = 2;
  assert.equal(shim.overlay.posts[0].data.n, 1);
});

test('a view can be told to throw on post, to model an unavailable WebView', () => {
  const shim = createIina();
  shim.sidebar.postError = new Error('Sidebar WebView unavailable');
  assert.throws(() => shim.iina.sidebar.postMessage('m', {}), /unavailable/);
  assert.equal(shim.sidebar.posts.length, 0);
});

test('postMessage names must be strings; isPlainObject is realm independent', () => {
  const shim = createIina();
  assert.throws(() => shim.iina.sidebar.postMessage(undefined, {}), /name must be a string/);
  assert.equal(isPlainObject(vm.runInNewContext('({})')), true);
  assert.equal(isPlainObject(Object.create(null)), true);
  assert.equal(isPlainObject(new Native()), false);
  assert.equal(isPlainObject([]), false);
});

test('global role: createPlayerInstance validates options, records them, returns ids or a forced result', () => {
  const shim = createIina({role: 'global'});
  assert.equal(shim.iina.global.createPlayerInstance({url: 'https://x.example'}), 1);
  assert.equal(shim.iina.global.createPlayerInstance({}), 2);
  assert.deepEqual(shim.global.opens, [{url: 'https://x.example'}, {}]);
  shim.global.nextPlayerResult = false;
  assert.equal(shim.iina.global.createPlayerInstance({}), false);
  assert.throws(() => shim.iina.global.createPlayerInstance(undefined), TypeError);
  assert.throws(() => shim.iina.global.createPlayerInstance({onOpen: noop}), TypeError);
});

test('global role: postMessage targets are null, a numeric id or a label; anything else throws', () => {
  const shim = createIina({role: 'global'});
  for (const target of [null, 3, '3-plugin']) shim.iina.global.postMessage(target, 'x', 'wire');
  for (const target of [undefined, {}, true]) assert.throws(() => shim.iina.global.postMessage(target, 'x', 'wire'), /target must be/);
  assert.deepEqual(shim.global.posts.map(p => p.target), [null, 3, '3-plugin']);
  assert.equal(shim.iina.global.getLabel, undefined, 'the controller has no getLabel');
});

test('child role: getLabel returns the label (null when none) and has no createPlayerInstance', () => {
  assert.equal(createIina().iina.global.getLabel(), null);
  const shim = createIina({label: '1-plugin'});
  assert.equal(shim.iina.global.getLabel(), '1-plugin');
  assert.equal(shim.iina.global.createPlayerInstance, undefined);
  shim.iina.global.postMessage('auth-probe', {});
  assert.deepEqual(shim.global.messages('auth-probe'), [{name: 'auth-probe', data: {}}]);
});

test('global.onPost observes each recorded message', () => {
  const shim = createIina();
  const seen = [];
  shim.global.onPost = post => seen.push(post.name);
  shim.iina.global.postMessage('a', {});
  shim.iina.global.postMessage('b', {});
  assert.deepEqual(seen, ['a', 'b']);
});

test('page side: iina.postMessage rejects undefined and non-serializable data, and routes to the plugin view', () => {
  const shim = createIina();
  shim.iina.sidebar.onMessage('connect', data => { shim.got = data; });
  const page = createWebViewIina({onPost: (name, data) => shim.sidebar.send(name, data)});
  assert.throws(() => page.iina.postMessage('ready', undefined), TypeError);
  assert.throws(() => page.iina.postMessage('ready', {cb: noop}), TypeError);
  page.iina.postMessage('connect', {clientID: 'abc'});
  assert.deepEqual(shim.got, {clientID: 'abc'});
  assert.deepEqual(page.messages('connect').map(p => p.data), [{clientID: 'abc'}]);
});

test('page side: receiveEnvelope delivers the percent-encoded JSON envelope IINA 1.5.1 plugins use', () => {
  const page = createWebViewIina();
  let got;
  page.iina.onMessage('state', data => { got = JSON.parse(decodeURIComponent(data.encoded)); });
  page.receiveEnvelope('state', {title: '`) ${x} \\'});
  assert.deepEqual(got, {title: '`) ${x} \\'});
  assert.equal(page.receive('missing', {}), undefined);
  assert.deepEqual(page.dropped.map(d => d.name), ['missing']);
  assert.throws(() => page.iina.onMessage('x', null), /callback must be a function/);
});

// ---- keychain --------------------------------------------------------------------------------

test('keychain: write then read returns the password; a missing entry or empty service is false', () => {
  const shim = createIina({identifier: 'plugin.a'});
  const {utils} = shim.iina;
  assert.equal(utils.keychainRead('svc', 'oauth'), false);
  assert.equal(utils.keychainWrite('svc', 'oauth', 'secret'), true);
  assert.equal(utils.keychainRead('svc', 'oauth'), 'secret');
  assert.equal(utils.keychainRead('svc', 'other'), false);
  assert.equal(utils.keychainWrite('', 'oauth', 'x'), false);
  assert.equal(utils.keychainRead('', 'oauth'), false);
  assert.deepEqual(shim.keychain.writes[0], {service: 'svc', name: 'oauth', value: 'secret'});
  assert.equal(shim.keychain.reads.length, 4);
});

test('keychain storage is per plugin identifier', () => {
  const store = createKeychainStore();
  const a = createIina({identifier: 'plugin.a', keychainStore: store});
  const b = createIina({identifier: 'plugin.b', keychainStore: store});
  a.iina.utils.keychainWrite('svc', 'oauth', 'for-a');
  assert.equal(b.iina.utils.keychainRead('svc', 'oauth'), false);
  b.iina.utils.keychainWrite('svc', 'oauth', 'for-b');
  assert.equal(a.iina.utils.keychainRead('svc', 'oauth'), 'for-a');
  assert.equal(b.iina.utils.keychainRead('svc', 'oauth'), 'for-b');
  assert.ok([...store.entries.keys()].some(key => key.startsWith('plugin.a - svc')), 'service name is "<identifier> - <service>"');
});

test('keychain values must be strings', () => {
  const {iina} = createIina();
  assert.throws(() => iina.utils.keychainWrite('svc', 'n', undefined), TypeError);
  assert.throws(() => iina.utils.keychainWrite('svc', 'n', {token: 'x'}), TypeError);
  assert.throws(() => iina.utils.keychainRead(undefined, 'n'), TypeError);
});

test('keychain spelling: IINA 1.5.1 exposes keychainRead only; keyChainRead is opt-in and shares the store', () => {
  const real = createIina().iina.utils;
  assert.equal(typeof real.keychainRead, 'function');
  assert.equal(real.keyChainRead, undefined);
  const legacy = createIina({keychainSpelling: 'keyChain'}).iina.utils;
  assert.equal(legacy.keychainRead, undefined);
  assert.equal(legacy.keyChainWrite('svc', 'n', 'v'), true);
  assert.equal(legacy.keyChainRead('svc', 'n'), 'v');
  const both = createIina({keychainSpelling: 'both'});
  both.iina.utils.keyChainWrite('svc', 'n', 'v2');
  assert.equal(both.iina.utils.keychainRead('svc', 'n'), 'v2');
});

// ---- utils, file, http, mpv, event, timers ---------------------------------------------------

test('utils.exec requires a string array of args and returns a controllable job', async () => {
  const shim = createIina();
  assert.throws(() => shim.iina.utils.exec('python3', 'not-an-array'), /string array/);
  assert.throws(() => shim.iina.utils.exec('python3', ['ok', 3]), /string array/);
  const pending = shim.iina.utils.exec('python3', ['a.py']);
  assert.equal(shim.utils.execs.length, 1);
  shim.utils.execs[0].resolve({stdout: '{}'});
  assert.deepEqual(await pending, {status: 0, stdout: '{}', stderr: ''});
});

test('utils.prompt, ask, chooseFile and open record and return their configured results', async () => {
  const shim = createIina();
  shim.utils.promptResult = 'twitch.tv/x';
  assert.equal(shim.iina.utils.prompt('Stream?'), 'twitch.tv/x');
  assert.equal(shim.iina.utils.ask('Sure?'), true);
  assert.deepEqual([shim.utils.prompts, shim.utils.asks], [['Stream?'], ['Sure?']]);
  assert.equal(await shim.iina.utils.chooseFile('Pick', {}), null);
  assert.equal(shim.iina.utils.open('https://example.test'), true);
  assert.deepEqual(shim.utils.opened, ['https://example.test']);
});

test('file and resolvePath: @data and @tmp are per plugin, and the same file is seen through either spelling', () => {
  const shim = createIina({identifier: 'plugin.a', dataRoot: '/private/d'});
  assert.equal(shim.iina.utils.resolvePath('@data/x.json'), '/private/d/x.json');
  assert.equal(shim.iina.utils.resolvePath('@data/'), '/private/d');
  assert.match(shim.iina.utils.resolvePath('@tmp/y'), /\/tmp\/plugin\.a\/y$/);
  assert.equal(shim.iina.file.exists('@data/x.json'), false);
  shim.iina.file.write('@data/x.json', '{}');
  assert.equal(shim.iina.file.exists('/private/d/x.json'), true);
  assert.equal(shim.iina.file.read('@data/x.json'), '{}');
  assert.equal(shim.iina.file.read('@data/missing'), null);
  shim.iina.file.delete('@data/x.json');
  assert.equal(shim.iina.file.exists('@data/x.json'), false);
  assert.throws(() => shim.iina.file.write('@data/x', {}), TypeError);
  assert.deepEqual(shim.file.ops.map(o => o.op), ['exists', 'write', 'exists', 'read', 'read', 'delete', 'exists']);
});

test('http records calls with plain option copies and supports resolve, reject and transport failure', async () => {
  const shim = createIina();
  const options = {headers: {A: 'b'}, data: {k: 'v'}};
  assert.deepEqual(await shim.iina.http.post('https://t.example/x', options), {statusCode: 200, data: {ok: true}});
  options.data.k = 'changed';
  assert.deepEqual(shim.http.calls[0], {method: 'POST', url: 'https://t.example/x', options: {headers: {A: 'b'}, data: {k: 'v'}}});
  shim.http.rejectResponse({statusCode: 400, data: {message: 'authorization_pending'}});
  await assert.rejects(shim.iina.http.get('https://t.example/y'), e => e.statusCode === 400);
  shim.http.failTransport();
  await assert.rejects(shim.iina.http.get('https://t.example/y'), /Untrusted transport details/);
  shim.http.setResponse({statusCode: 204});
  assert.deepEqual(await shim.iina.http.get('https://t.example/y'), {statusCode: 204});
  await assert.rejects(shim.iina.http.get(undefined), TypeError);
});

test('mpv: typed getters with IINA defaults, recorded set/command, validated command args and hooks', async () => {
  const shim = createIina({mpv: {path: '/a.mp4', 'time-pos': 12.5, pause: true}});
  const {mpv} = shim.iina;
  assert.deepEqual([mpv.getString('path'), mpv.getString('nope'), mpv.getNumber('time-pos'), mpv.getNumber('nope'), mpv.getFlag('pause'), mpv.getFlag('nope')],
    ['/a.mp4', null, 12.5, 0, true, false]);
  mpv.set('speed', 1.5);
  assert.equal(mpv.getNumber('speed'), 1.5);
  mpv.command('seek', ['10', 'absolute+exact']);
  assert.deepEqual(shim.mpv.sets, [['speed', 1.5]]);
  assert.deepEqual(shim.mpv.commands, [['seek', ['10', 'absolute+exact']]]);
  assert.throws(() => mpv.command('seek', [10]), /array of strings/);
  assert.throws(() => mpv.command('seek', '10'), /array of strings/);
  assert.throws(() => mpv.addHook('on_load', 'high', noop), /addHook/);
  let nextCalled = 0;
  mpv.addHook('on_load', 10, next => { nextCalled++; next(); });
  await shim.mpv.runHook('on_load', () => {});
  assert.equal(nextCalled, 1);
  await assert.rejects(shim.mpv.runHook('on_unload'), /no mpv hook registered/);
});

test('core.window: plugin assignment is applied but throws in strict mode (native proxy does not return true)', () => {
  const shim = createIina({window: {frame: {x: 1, y: 2, width: 3, height: 4}}});
  assert.equal(shim.iina.core.window.loaded, true);
  assert.throws(() => { shim.iina.core.window.frame = {x: 9, y: 9, width: 9, height: 9}; }, TypeError);
  assert.deepEqual(shim.core.native.frame, {x: 9, y: 9, width: 9, height: 9});
  assert.deepEqual(shim.core.windowWrites.map(w => w.key), ['frame']);
  const lenient = createIina({permissiveWindow: true});
  lenient.iina.core.window.frame = {x: 0, y: 0, width: 1, height: 1};
});

test('event.on validates IINA event name syntax and returns removable ids', () => {
  const shim = createIina();
  const seen = [];
  const id = shim.iina.event.on('iina.window-will-close', () => seen.push('close'));
  shim.iina.event.on('mpv.time-pos.changed', () => seen.push('pos'));
  shim.iina.event.on('mpv.seek', () => seen.push('seek'));
  for (const bad of ['window-will-close', 'other.thing', 'iina.a.b', 'mpv.x.y.changed', 'iina']) {
    assert.throws(() => shim.iina.event.on(bad, noop), /Incorrect event name syntax/);
  }
  assert.throws(() => shim.iina.event.on('iina.x', undefined), /callback must be a function/);
  shim.emit('iina.window-will-close');
  shim.emit('mpv.time-pos.changed');
  shim.iina.event.off('iina.window-will-close', id);
  shim.emit('iina.window-will-close');
  assert.deepEqual(seen, ['close', 'pos']);
  assert.deepEqual(shim.event.names().sort(), ['mpv.seek', 'mpv.time-pos.changed']);
});

test('fake timers: fired one-shots stay registered until cleared (IINA 1.5.1), flush and advance fire in order', () => {
  const timers = createFakeTimers();
  const order = [];
  const a = timers.setTimeout(() => order.push('a'), 20);
  timers.setTimeout(() => order.push('b'), 10);
  timers.setTimeout(() => order.push('zero'), 0);
  timers.flush(0);
  assert.deepEqual(order, ['zero']);
  assert.equal(timers.leaked().length, 1, 'the fired timer is still registered');
  timers.clearTimeout(timers.all[2].id);
  assert.equal(timers.leaked().length, 0);
  timers.advance(25);
  assert.deepEqual(order, ['zero', 'b', 'a']);
  assert.equal(timers.leaked().length, 2);
  timers.clearTimeout(a);
  assert.deepEqual(timers.cleared, [timers.all[2].id, a]);
  assert.equal(timers.now, 25);
  assert.throws(() => timers.setTimeout('x', 1), TypeError);
});

test('fake timers: a cancelled timer never fires, flushAll fires every pending timer, retainFired:false self-clears', () => {
  const timers = createFakeTimers({retainFired: false});
  let fired = 0;
  const id = timers.setTimeout(() => fired++, 5);
  timers.setTimeout(() => fired++, 500);
  timers.clearTimeout(id);
  timers.advance(10);
  assert.equal(fired, 0);
  timers.flushAll();
  assert.equal(fired, 1);
  assert.equal(timers.leaked().length, 0);
  assert.equal(new timers.Date().getTime() >= 0, true);
  assert.equal(timers.Date.now(), 10);
});

test('runScript executes a plugin entry script against the shim with injected require and timers', () => {
  const os = require('node:os'), fs = require('node:fs'), path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iina-shim-'));
  try {
    const file = path.join(dir, 'entry.js');
    fs.writeFileSync(file, "const {menu}=iina;menu.addItem(menu.item('Hi',()=>{},{keyBinding:require('./k.js')}));setTimeout(()=>{},3);");
    const shim = createIina();
    shim.runScript(file, {require: name => (name === './k.js' ? 'Ctrl+Alt+Shift+F10' : assert.fail(name))});
    assert.equal(shim.menu.items[0].keyBinding, 'Ctrl+Alt+Shift+F10');
    assert.equal(shim.timers.pending().length, 1);
    assert.throws(() => createIina().runScript(file), /Unexpected module/);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});
