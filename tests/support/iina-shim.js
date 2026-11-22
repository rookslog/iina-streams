'use strict';
// Shared IINA 1.5.1 contract shim (#13).
//
// Every plugin-facing surface the tests use is built here once, so a test cannot get a more
// forgiving host than the real one. What is reproduced, and where it comes from:
//   - menu.item(title, action, options) records keyBinding/enabled/selected, menu.forceUpdate exists,
//     and key bindings can be checked against IINA's normalized form and the bundled key configs.
//     Source: JavascriptAPIMenu.swift, MenuController.swift add(menuItemDef:), KeyCodeHelper.swift.
//   - sidebar.loadFile (and, per the issue, the overlay equivalent) clears every onMessage listener
//     of that view and throws when the window is not loaded (sidebar: JavascriptAPISidebarView.swift).
//   - postMessage payloads must be JSON-serializable; undefined, functions and native objects throw.
//   - utils.keychainRead/keychainWrite store per plugin identifier as "<identifier> - <service>"
//     (JavascriptAPIUtils.swift). Writing '' over an existing item returns true but keeps the old value
//     (macOS SecItemUpdate, observed 2026-11-22), so '' never erases a saved secret. The `keyChainRead` spelling is opt-in (see `keychainSpelling`).
//   - utils.exec rejects a non-string-array args value (JavascriptAPIUtils.swift).
//   - event.on validates the event name syntax (JavascriptAPIEvent.swift).
//   - one-shot timers stay registered after they fire until they are cleared (src/timers.js).
//
// Shim POLICY, stricter than anything read in the IINA source (labelled "IINA contract:" in errors
// only for brevity): menu.item rejects an `undefined` action (Swift special-cases only null);
// keychain calls reject non-string arguments; core.window assignment throws in strict mode (the
// native window proxy applies setters without returning true, per the old lifecycle test, not Swift);
// mpv.command rejects non-string args; global.postMessage rejects a target that is not null/number/string.
//
// NOT verified against IINA source because the source was not available when this was written:
// JavascriptMessageHub (listener replacement vs accumulation per name: this shim keeps the last
// listener per name, which is what the previous per-test mocks did), the file/http/mpv/overlay
// APIs, and JavascriptPluginMenuItem's exact property list. Those are marked `UNVERIFIED` below.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const FIXTURE_DIR = path.join(__dirname, '..', 'fixtures', 'iina-1.5.1');

// ---------------------------------------------------------------------------------------------
// Key bindings
// ---------------------------------------------------------------------------------------------

const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'];

// Port of KeyCodeHelper.normalizeSingleMpvKeystroke for single printable keys.
function normalizeKeyBinding(raw) {
  const parts = String(raw).split('+');
  let key = parts.pop();
  const mods = new Set();
  for (const m of parts) {
    const mod = MODIFIER_ORDER.find(o => o.toLowerCase() === m.toLowerCase()) || m.toUpperCase();
    if (mod === 'Shift' && key.length === 1 && key.toLowerCase() !== key.toUpperCase()) key = key.toUpperCase();
    else mods.add(mod);
  }
  if (key.length > 1) key = key.toUpperCase();
  return [...MODIFIER_ORDER.filter(o => mods.has(o)), key].join('+');
}

let boundKeysCache = null;
// Map of normalized key -> where IINA 1.5.1 already binds it (bundled key configs + main menu).
function loadBoundKeys(dir = FIXTURE_DIR) {
  if (dir === FIXTURE_DIR && boundKeysCache) return boundKeysCache;
  const keys = new Map();
  for (const name of fs.readdirSync(dir).filter(n => n.endsWith('.conf'))) {
    for (const line of fs.readFileSync(path.join(dir, name), 'utf8').split('\n')) {
      const m = /^(?:#@iina\s+)?(\S+)\s+\S/.exec(line.trim());
      if (!m || (line.trim().startsWith('#') && !line.trim().startsWith('#@iina'))) continue;
      keys.set(normalizeKeyBinding(m[1]), name + ': ' + line.trim());
    }
  }
  for (const line of fs.readFileSync(path.join(dir, 'mainmenu-keys.txt'), 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const [combo, title] = line.split('\t');
    const parts = combo.split('+'); let key = parts.pop();
    if (key.length === 1 && key !== key.toLowerCase()) parts.push('Shift'), key = key.toLowerCase();
    keys.set(normalizeKeyBinding([...parts, key].join('+')), 'main menu: ' + title);
  }
  if (dir === FIXTURE_DIR) boundKeysCache = keys;
  return keys;
}

// Problems with one plugin key binding: [] when clean. `reason` is 'not-normalized' or 'collides'.
function keyBindingProblems(raw, bound = loadBoundKeys()) {
  const normalized = normalizeKeyBinding(raw);
  const problems = [];
  if (normalized !== raw) problems.push({reason: 'not-normalized', keyBinding: raw, expected: normalized,
    detail: `IINA 1.5.1 compares normalized keys; "${raw}" should be written "${normalized}"`});
  if (bound.has(normalized)) problems.push({reason: 'collides', keyBinding: raw, with: bound.get(normalized),
    detail: `"${normalized}" is already bound by ${bound.get(normalized)}`});
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------------------------

// Realm-independent "plain object" test: objects built inside a vm context have another realm's
// Object.prototype, so compare against the end of the prototype chain, not Object.prototype.
function isPlainObject(value) {
  if (Object.prototype.toString.call(value) !== '[object Object]') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || Object.getPrototypeOf(proto) === null;
}

function payloadError(where, why) { return new TypeError(`IINA contract: ${where} payload ${why}`); }

function checkPayload(value, where, seen, top) {
  const type = typeof value;
  if (value === undefined) { if (top) throw payloadError(where, 'is undefined (not JSON-serializable)'); return; }
  if (value === null || type === 'string' || type === 'boolean') return;
  if (type === 'number') { if (!Number.isFinite(value)) throw payloadError(where, 'contains a non-finite number'); return; }
  if (type === 'function') throw payloadError(where, 'contains a function');
  if (type === 'symbol' || type === 'bigint') throw payloadError(where, `contains a ${type}`);
  if (seen.has(value)) throw payloadError(where, 'is cyclic');
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item === undefined) throw payloadError(where, 'contains an undefined array element');
      checkPayload(item, where, seen, false);
    }
  } else if (isPlainObject(value)) {
    // A property whose value is undefined is dropped by JSON.stringify; it is tolerated.
    for (const key of Object.keys(value)) checkPayload(value[key], where, seen, false);
  } else {
    throw payloadError(where, `contains a native or non-plain object (${Object.prototype.toString.call(value)})`);
  }
  seen.delete(value);
}

// Throws TypeError unless `value` is a JSON-serializable payload; returns a plain JSON copy.
function jsonPayload(value, where = 'postMessage') {
  checkPayload(value, where, new Set(), true);
  return JSON.parse(JSON.stringify(value));
}

// ---------------------------------------------------------------------------------------------
// Fake timers
// ---------------------------------------------------------------------------------------------

function createFakeTimers({retainFired = true} = {}) {
  let clock = 0, nextID = 0;
  const all = [], cleared = [];
  const byID = new Map();
  const api = {
    all, cleared, // cleared: every clearTimeout id, in call order
    get now() { return clock; },
    setTimeout(fn, delay = 0) {
      if (typeof fn !== 'function') throw new TypeError('setTimeout needs a function');
      const entry = {id: ++nextID, fn, delay: Number(delay) || 0, due: clock + (Number(delay) || 0), cancelled: false, fired: false};
      all.push(entry); byID.set(entry.id, entry);
      return entry.id;
    },
    clearTimeout(id) {
      cleared.push(id);
      const entry = byID.get(id);
      if (entry) { entry.cancelled = true; byID.delete(id); }
    },
    pending() { return all.filter(t => !t.fired && !t.cancelled); },
    // IINA 1.5.1 keeps fired one-shot timers registered until they are cleared.
    leaked() { return all.filter(t => t.fired && !t.cancelled); },
    fire(entry) {
      if (entry.fired || entry.cancelled) return undefined;
      entry.fired = true;
      if (!retainFired) { entry.cancelled = true; byID.delete(entry.id); }
      return entry.fn();
    },
    // Fire every pending timer whose delay equals `delay` (deferred native delivery uses 0).
    // Fire every currently pending timer regardless of delay (snapshot; timers set meanwhile wait).
    flushAll() { for (const t of api.pending()) api.fire(t); },
    flush(delay = 0) { for (const t of api.pending()) if (t.delay === delay) api.fire(t); },
    advance(ms) {
      const target = clock + ms;
      for (;;) {
        const next = api.pending().filter(t => t.due <= target).sort((a, b) => a.due - b.due || a.id - b.id)[0];
        if (!next) break;
        clock = Math.max(clock, next.due);
        api.fire(next);
      }
      clock = target;
    },
    // A Date whose now() follows the fake clock.
    Date: class FakeDate extends Date { static now() { return clock; } }
  };
  return api;
}

// ---------------------------------------------------------------------------------------------
// Keychain
// ---------------------------------------------------------------------------------------------

// One store can back several shim instances; entries are keyed per plugin identifier.
function createKeychainStore() {
  const entries = new Map();
  return {
    entries,
    key: (identifier, service, name) => `${identifier} - ${service}\u0000${name}`,
    get(identifier, service, name) { return entries.get(this.key(identifier, service, name)); },
    set(identifier, service, name, value) { entries.set(this.key(identifier, service, name), value); }
  };
}

// ---------------------------------------------------------------------------------------------
// The shim
// ---------------------------------------------------------------------------------------------

function createIina(options = {}) {
  const identifier = options.identifier || 'local.iina.streams.test';
  const role = options.role || 'child'; // 'global' (createPlayerInstance) or 'child' (getLabel)
  const keychainStore = options.keychainStore || createKeychainStore();
  const dataRoot = options.dataRoot || '/private/iina-shim/data/' + identifier;
  const tmpRoot = options.tmpRoot || '/private/iina-shim/tmp/' + identifier;
  const pluginRoot = options.pluginRoot || '/private/iina-shim/plugin/' + identifier;
  const timers = options.timers || createFakeTimers(options.timerOptions);
  const log = []; // ordered record of every API call: {api, args}
  const posts = []; // ordered record of every outgoing message: {surface, target?, name, data}
  // `options.onCall(api, args)` observes every call in order (e.g. to build a legacy call list).
  const record = (api, ...args) => { log.push({api, args}); if (options.onCall) options.onCall(api, args); };

  // ---- hub (listener registry shared by sidebar/overlay/global views) ----
  function createHub(label) {
    const listeners = new Map();
    const hub = {
      listeners, dropped: [], clears: 0,
      add(name, callback) {
        if (typeof name !== 'string') throw new TypeError(`IINA contract: ${label}.onMessage name must be a string`);
        if (typeof callback !== 'function') throw new TypeError(`IINA contract: ${label}.onMessage("${name}") callback must be a function`);
        listeners.set(name, callback); // UNVERIFIED: JavascriptMessageHub replace-vs-append semantics
      },
      clear() { listeners.clear(); hub.clears++; },
      // Message arriving at the plugin side (page -> plugin, or another JS context -> this one).
      receive(name, data, ...rest) {
        const callback = listeners.get(name);
        if (!callback) { hub.dropped.push({name, data}); return undefined; }
        return callback(data === undefined ? undefined : JSON.parse(JSON.stringify(data)), ...rest);
      },
      // Like receive(), but a missing listener is a test error instead of a silent drop. Use this
      // to drive the plugin from a test; use receive() to reproduce IINA's drop behaviour.
      send(name, data, ...rest) {
        if (!listeners.has(name)) throw new Error(`IINA contract: no ${label} onMessage listener registered for "${name}" (registered: ${[...listeners.keys()].join(', ') || 'none'})`);
        return hub.receive(name, data, ...rest);
      },
      names: () => [...listeners.keys()]
    };
    return hub;
  }

  // ---- view (sidebar / overlay) ----
  function createView(kind) {
    const hub = createHub(kind);
    const view = {
      hub, listeners: hub.listeners, posts: [], loads: [], shows: 0, hides: 0, visible: false,
      clickable: null, opacity: null, postError: null,
      receive: hub.receive, send: hub.send, dropped: hub.dropped,
      messages(name) { return view.posts.filter(p => p.name === name); }
    };
    const requireWindow = fn => {
      if (kind === 'sidebar' && !core.native.loaded)
        throw new Error(`sidebar.${fn} called when window is not available. Please call it after receiving the "iina.window-loaded" event.`);
    };
    const api = {
      loadFile(file) {
        record(`${kind}.loadFile`, file);
        if (typeof file !== 'string') throw new TypeError(`IINA contract: ${kind}.loadFile path must be a string`);
        requireWindow('loadFile');
        view.loads.push(file);
        // Do not assume sidebar/overlay listener clearing also applies to the provisional window API.
        if (kind !== 'standaloneWindow') hub.clear();
      },
      show() { record(`${kind}.show`); requireWindow('show'); view.shows++; view.visible = true; },
      hide() { record(`${kind}.hide`); requireWindow('hide'); view.hides++; view.visible = false; },
      postMessage(name, data) {
        record(`${kind}.postMessage`, name);
        if (typeof name !== 'string') throw new TypeError(`IINA contract: ${kind}.postMessage name must be a string`);
        const copy = jsonPayload(data, `${kind}.postMessage("${name}")`);
        if (view.postError) throw view.postError;
        view.posts.push({name, data: copy});
        posts.push({surface: kind, name, data: copy});
      },
      onMessage(name, callback) { record(`${kind}.onMessage`, name); hub.add(name, callback); }
    };
    if (kind === 'overlay') {
      // UNVERIFIED against JavascriptAPIOverlay.swift (not provided): shape only.
      api.setClickable = value => { record('overlay.setClickable', value); view.clickable = !!value; };
      api.setOpacity = value => { record('overlay.setOpacity', value); view.opacity = value; };
    }
    return {view, api};
  }

  // ---- core / window ----
  const nativeWindow = Object.assign({loaded: options.windowLoaded !== false}, options.window);
  const core = {
    native: nativeWindow, windowWrites: [], osds: [],
    // IINA's native window proxy applies setters but does not return true, so strict-mode
    // assignment from plugin code throws unless the plugin guards it.
    window: new Proxy(nativeWindow, {
      set(target, key, value) {
        const copy = value === undefined ? undefined : JSON.parse(JSON.stringify(value));
        core.windowWrites.push({key, value: copy});
        record('core.window.set', key, copy);
        target[key] = copy;
        return false;
      }
    })
  };
  if (options.permissiveWindow) core.window = nativeWindow;
  core.api = {window: core.window, osd(message) { core.osds.push(message); }};

  const sidebar = createView('sidebar');
  const overlay = createView('overlay');

  // PROVISIONAL: the implementer must verify the method names in IINA v1.5.1's
  // iina/JavascriptAPIStandaloneWindow.swift and cite the source here.
  const standaloneWindow = createView('standaloneWindow');
  standaloneWindow.api.open = function open() {
    record('standaloneWindow.open');
    standaloneWindow.view.visible = true;
  };
  standaloneWindow.api.close = function close() {
    record('standaloneWindow.close');
    standaloneWindow.view.visible = false;
  };
  standaloneWindow.api.isOpen = function isOpen() {
    record('standaloneWindow.isOpen');
    return standaloneWindow.view.visible;
  };
  delete standaloneWindow.api.show;
  delete standaloneWindow.api.hide;

  // ---- global (plugin <-> plugin-instance messages) ----
  const globalHub = createHub('global');
  const globalControl = {
    hub: globalHub, listeners: globalHub.listeners, posts: [], opens: [], label: options.label === undefined ? null : options.label,
    nextPlayerResult: undefined, nextPlayerID: 0, postError: null,
    onPost: null, // (post) => void, called after each recorded global.postMessage (e.g. to simulate a reply)
    receive: globalHub.receive, send: globalHub.send, dropped: globalHub.dropped,
    messages(name) { return globalControl.posts.filter(p => p.name === name); }
  };
  const globalApi = {onMessage(name, callback) { record('global.onMessage', name); globalHub.add(name, callback); }};
  if (role === 'global') {
    globalApi.createPlayerInstance = function createPlayerInstance(opts) {
      record('global.createPlayerInstance');
      const copy = jsonPayload(opts, 'global.createPlayerInstance options');
      if (!isPlainObject(opts)) throw new TypeError('IINA contract: createPlayerInstance options must be an object');
      globalControl.opens.push(copy);
      return globalControl.nextPlayerResult === undefined ? ++globalControl.nextPlayerID : globalControl.nextPlayerResult;
    };
    globalApi.postMessage = function postMessage(target, name, data) {
      record('global.postMessage', target, name);
      if (!(target === null || typeof target === 'number' || typeof target === 'string'))
        throw new TypeError('IINA contract: global.postMessage target must be null, a player id or a label');
      if (typeof name !== 'string') throw new TypeError('IINA contract: global.postMessage name must be a string');
      const copy = jsonPayload(data, `global.postMessage("${name}")`);
      if (globalControl.postError) throw globalControl.postError;
      const post = {target, name, data: copy};
      globalControl.posts.push(post); posts.push({surface: 'global', ...post});
      if (globalControl.onPost) globalControl.onPost(post);
    };
  } else {
    globalApi.getLabel = () => globalControl.label;
    globalApi.postMessage = function postMessage(name, data) {
      record('global.postMessage', name);
      if (typeof name !== 'string') throw new TypeError('IINA contract: global.postMessage name must be a string');
      const copy = jsonPayload(data, `global.postMessage("${name}")`);
      if (globalControl.postError) throw globalControl.postError;
      const post = {name, data: copy};
      globalControl.posts.push(post); posts.push({surface: 'global', ...post});
      if (globalControl.onPost) globalControl.onPost(post);
    };
  }

  // ---- menu ----
  class MenuItem {
    constructor(title, action, {enabled = true, selected = false, keyBinding = null, isSeparator = false} = {}) {
      Object.assign(this, {title, action, enabled, selected, keyBinding, isSeparator, items: []});
    }
    addSubMenuItem(item) {
      if (!(item instanceof MenuItem)) throw new TypeError('IINA contract: addSubMenuItem needs a menu item');
      this.items.push(item);
    }
  }
  const menuControl = {
    items: [], created: [], forceUpdates: 0,
    // Every keyBinding on added items (recursively) that is not in IINA normalized form, collides
    // with a bundled IINA binding or main-menu key, or is used twice by this plugin.
    problems() {
      const bound = loadBoundKeys(), seen = new Map(), problems = [];
      const visit = item => {
        if (item.keyBinding != null) {
          for (const p of keyBindingProblems(String(item.keyBinding), bound)) problems.push({title: item.title, ...p});
          const normalized = normalizeKeyBinding(String(item.keyBinding));
          if (seen.has(normalized)) problems.push({title: item.title, reason: 'collides', keyBinding: item.keyBinding,
            with: 'plugin item "' + seen.get(normalized) + '"', detail: `"${normalized}" is used twice by this plugin`});
          else seen.set(normalized, item.title);
        }
        item.items.forEach(visit);
      };
      menuControl.items.forEach(visit);
      return problems;
    },
    assertKeyBindings() { assert.deepEqual(menuControl.problems(), [], 'plugin menu key bindings must be normalized and collision-free'); }
  };
  const menuApi = {
    MenuItem,
    item(title, action, opts) {
      record('menu.item', title);
      if (typeof title !== 'string') throw new TypeError('IINA contract: menu.item title must be a string');
      if (action !== null && typeof action !== 'function') throw new TypeError('IINA contract: menu.item action must be a function or null');
      const keyed = key => (opts !== null && typeof opts === 'object' && opts[key] !== undefined) ? opts[key] : undefined;
      const item = new MenuItem(title, action, {
        enabled: keyed('enabled') === undefined ? true : !!keyed('enabled'),
        selected: keyed('selected') === undefined ? false : !!keyed('selected'),
        keyBinding: keyed('keyBinding') === undefined ? null : String(keyed('keyBinding'))
      });
      menuControl.created.push(item);
      return item;
    },
    separator() { record('menu.separator'); return new MenuItem('', null, {enabled: false, isSeparator: true}); },
    addItem(item) {
      record('menu.addItem', item && item.title);
      if (!(item instanceof MenuItem)) throw new TypeError('IINA contract: menu.addItem needs an item made by menu.item or menu.separator');
      menuControl.items.push(item);
    },
    items: () => menuControl.items.slice(),
    removeAt(index) { record('menu.removeAt', index); if (index < 0 || index >= menuControl.items.length) return false; menuControl.items.splice(index, 1); return true; },
    removeAllItems() { record('menu.removeAllItems'); menuControl.items.length = 0; },
    forceUpdate() { record('menu.forceUpdate'); menuControl.forceUpdates++; }
  };

  // ---- file system (UNVERIFIED against JavascriptAPIFile.swift) ----
  const files = new Map();
  function resolvePath(p) {
    if (typeof p !== 'string') throw new TypeError('IINA contract: path must be a string');
    let out;
    if (p.startsWith('@data/') || p === '@data') out = dataRoot + p.slice('@data'.length);
    else if (p.startsWith('@tmp/') || p === '@tmp') out = tmpRoot + p.slice('@tmp'.length);
    else if (p.startsWith('/')) out = p;
    else out = pluginRoot + '/' + p;
    return out.length > 1 ? out.replace(/\/+$/, '') : out;
  }
  const fileControl = {
    files, ops: [], resolve: resolvePath,
    get reads() { return fileControl.ops.filter(o => o.op === 'exists' || o.op === 'read'); },
    get writes() { return fileControl.ops.filter(o => o.op === 'write'); },
    seed(file, content) { files.set(resolvePath(file), content); return fileControl; },
    has: file => files.has(resolvePath(file)),
    get: file => files.get(resolvePath(file))
  };
  const fileApi = {
    exists(file) { const resolved = resolvePath(file); fileControl.ops.push({op: 'exists', file, resolved}); record('file.exists', file); return files.has(resolved); },
    read(file) { const resolved = resolvePath(file); fileControl.ops.push({op: 'read', file, resolved}); record('file.read', file); return files.has(resolved) ? files.get(resolved) : null; },
    write(file, content) {
      const resolved = resolvePath(file);
      if (typeof content !== 'string') throw new TypeError('IINA contract: file.write content must be a string');
      fileControl.ops.push({op: 'write', file, resolved, content}); record('file.write', file); files.set(resolved, content);
    },
    delete(file) { const resolved = resolvePath(file); fileControl.ops.push({op: 'delete', file, resolved}); record('file.delete', file); files.delete(resolved); }
  };

  // ---- http (UNVERIFIED against JavascriptAPIHttp.swift) ----
  const httpControl = {
    calls: [], response: {statusCode: 200, data: {ok: true}}, rejecting: false, transportError: null,
    setResponse(value) { httpControl.response = value; httpControl.rejecting = false; httpControl.transportError = null; },
    rejectResponse(value) { httpControl.response = value; httpControl.rejecting = true; },
    failTransport(error = new Error('Untrusted transport details')) { httpControl.transportError = error; }
  };
  const httpMethod = method => async function request(url, opts) {
    record('http.' + method.toLowerCase(), url);
    if (typeof url !== 'string') throw new TypeError('IINA contract: http url must be a string');
    if (opts !== undefined && opts !== null && !isPlainObject(opts)) throw new TypeError('IINA contract: http options must be a plain object');
    httpControl.calls.push({method, url, options: opts === undefined ? undefined : JSON.parse(JSON.stringify(opts))});
    if (httpControl.transportError) throw httpControl.transportError;
    if (httpControl.rejecting) throw httpControl.response;
    return httpControl.response;
  };
  const httpApi = {get: httpMethod('GET'), post: httpMethod('POST'), put: httpMethod('PUT'), patch: httpMethod('PATCH'), delete: httpMethod('DELETE')};

  // ---- utils ----
  const spelling = options.keychainSpelling || 'keychain'; // 'keychain' (IINA 1.5.1), 'keyChain' (legacy), 'both'
  const keychainControl = {
    store: keychainStore, reads: [], writes: [],
    get: (service, name) => keychainStore.get(identifier, service, name),
    seed(service, name, value) { keychainStore.set(identifier, service, name, value); return keychainControl; }
  };
  const keychainRead = (service, name) => {
    keychainControl.reads.push({service, name});
    if (typeof service !== 'string' || typeof name !== 'string') throw new TypeError('IINA contract: keychain service and name must be strings');
    if (service === '') return false;
    const value = keychainStore.get(identifier, service, name);
    return value === undefined ? false : value;
  };
  const keychainWrite = (service, name, value) => {
    keychainControl.writes.push({service, name, value});
    if (typeof service !== 'string' || typeof name !== 'string' || typeof value !== 'string') throw new TypeError('IINA contract: keychain service, name and password must be strings');
    if (service === '') return false;
    // Observed host behaviour (macOS SecItemUpdate probe, 2026-11-22; IINA KeychainAccess.write updates an
    // existing item): an empty password is accepted but the old contents are kept. Erasing needs a non-empty value.
    if (value === '' && keychainStore.get(identifier, service, name) !== undefined) return true;
    keychainStore.set(identifier, service, name, value);
    return true;
  };
  const utilsControl = {
    prompts: [], asks: [], opened: [], chosen: [], execs: [],
    promptResult: null, askResult: true, chooseFileResult: null,
    inPath: file => files.has(resolvePath(file)),
    // Resolve with the previous default shape: a finished job object {status, stdout, stderr}.
    nextExec() { return utilsControl.execs.shift(); }
  };
  const utilsApi = {
    prompt(title) {
      record('utils.prompt', title);
      utilsControl.prompts.push(title);
      if (options.rejectModalDialogs) throw new Error('Unexpected blocking call to utils.prompt');
      return utilsControl.promptResult;
    },
    ask(title) {
      record('utils.ask', title);
      utilsControl.asks.push(title);
      if (options.rejectModalDialogs) throw new Error('Unexpected blocking call to utils.ask');
      return utilsControl.askResult;
    },
    chooseFile(title, opts) { record('utils.chooseFile', title); utilsControl.chosen.push({title, options: opts}); return Promise.resolve(utilsControl.chooseFileResult); },
    open(url) { record('utils.open', url); utilsControl.opened.push(url); return true; },
    fileInPath(file) { record('utils.fileInPath', file); return !!file && !!utilsControl.inPath(file); },
    resolvePath(p) { record('utils.resolvePath', p); return resolvePath(p); },
    preferredLocalizations: () => ['en'],
    exec(file, args, cwd, stdoutHook, stderrHook) {
      record('utils.exec', file);
      if (!Array.isArray(args) || !args.every(a => typeof a === 'string')) throw new Error('The exec args parameter must be a string array');
      return new Promise((resolve, reject) => {
        utilsControl.execs.push({file, args, cwd, stdoutHook, stderrHook, reject,
          resolve: result => resolve(Object.assign({status: 0, stdout: '', stderr: ''}, result))});
      });
    },
    keychainRead: spelling === 'keyChain' ? undefined : (...a) => { record('utils.keychainRead', a[0]); return keychainRead(...a); },
    keychainWrite: spelling === 'keyChain' ? undefined : (...a) => { record('utils.keychainWrite', a[0]); return keychainWrite(...a); }
  };
  if (spelling !== 'keychain') {
    utilsApi.keyChainRead = (...a) => { record('utils.keyChainRead', a[0]); return keychainRead(...a); };
    utilsApi.keyChainWrite = (...a) => { record('utils.keyChainWrite', a[0]); return keychainWrite(...a); };
  }
  for (const key of Object.keys(utilsApi)) if (utilsApi[key] === undefined) delete utilsApi[key];

  // ---- event (JavascriptAPIEvent.swift) ----
  const eventControl = {
    listeners: new Map(), offs: [], nextID: 0,
    // Call every listener registered for `name`.
    emit(name, ...args) { for (const fn of [...(eventControl.listeners.get(name)?.values() || [])]) fn(...args); },
    names: () => [...eventControl.listeners.keys()].filter(n => eventControl.listeners.get(n).size)
  };
  const eventApi = {
    on(name, callback) {
      record('event.on', name);
      const parts = String(name).split('.');
      const isEvent = parts.length === 2, isChange = parts.length === 3 && parts[2] === 'changed';
      if (!((isEvent || isChange) && (parts[0] === 'mpv' || parts[0] === 'iina'))) throw new Error(`Incorrect event name syntax: "${name}"`);
      if (typeof callback !== 'function') throw new TypeError('IINA contract: event.on callback must be a function');
      const id = 'listener-' + (++eventControl.nextID);
      if (!eventControl.listeners.has(name)) eventControl.listeners.set(name, new Map());
      eventControl.listeners.get(name).set(id, callback);
      return id;
    },
    off(name, id) { record('event.off', name); eventControl.offs.push({name, id}); eventControl.listeners.get(name)?.delete(id); }
  };

  // ---- mpv (UNVERIFIED against JavascriptAPIMpv.swift) ----
  const mpvControl = {
    props: new Map(Object.entries(options.mpv || {})), sets: [], commands: [], hooks: new Map(),
    onCommand: null, // (name, args) => void: let a test mirror a command's effect into props
    set(name, value) { mpvControl.props.set(name, value); return mpvControl; },
    // Run a registered hook the way IINA does: the hook holds playback until it calls `next`.
    async runHook(name, next = () => {}) { const fn = mpvControl.hooks.get(name); assert.ok(fn, 'no mpv hook registered for ' + name); return fn(next); }
  };
  const mpvApi = {
    getString(name) { const v = mpvControl.props.get(name); return typeof v === 'string' ? v : null; },
    getNumber(name) { const v = mpvControl.props.get(name); return typeof v === 'number' ? v : 0; },
    getFlag(name) { const v = mpvControl.props.get(name); return typeof v === 'boolean' ? v : false; },
    set(name, value) { record('mpv.set', name, value); mpvControl.sets.push([name, value]); mpvControl.props.set(name, value); },
    command(name, args) {
      record('mpv.command', name, args === undefined ? undefined : JSON.parse(JSON.stringify(args)));
      if (args !== undefined && (!Array.isArray(args) || !args.every(a => typeof a === 'string')))
        throw new TypeError('IINA contract: mpv.command args must be an array of strings');
      const copy = args === undefined ? undefined : args.slice();
      mpvControl.commands.push([name, copy]);
      if (mpvControl.onCommand) mpvControl.onCommand(name, copy);
    },
    addHook(name, priority, callback) {
      record('mpv.addHook', name);
      if (typeof name !== 'string' || typeof priority !== 'number' || typeof callback !== 'function')
        throw new TypeError('IINA contract: mpv.addHook(name: string, priority: number, callback: function)');
      mpvControl.hooks.set(name, callback);
    }
  };

  // ---- console ----
  const consoleControl = {logs: [], errors: []};
  const consoleApi = {
    log: (...a) => consoleControl.logs.push(a), warn: (...a) => consoleControl.logs.push(a), error: (...a) => consoleControl.errors.push(a)
  };

  const iina = {
    global: globalApi, menu: menuApi, sidebar: sidebar.api, overlay: overlay.api, utils: utilsApi, file: fileApi,
    http: httpApi, mpv: mpvApi, core: core.api, event: eventApi, console: consoleApi
  };
  if (role === 'global') iina.standaloneWindow = standaloneWindow.api;

  const shim = {
    iina, identifier, role, timers, log, posts,
    standaloneWindow: standaloneWindow.view,
    menu: menuControl, sidebar: sidebar.view, overlay: overlay.view, global: globalControl, core, file: fileControl,
    http: httpControl, utils: utilsControl, keychain: keychainControl, event: eventControl, mpv: mpvControl, console: consoleControl,
    emit: (name, ...args) => eventControl.emit(name, ...args),
    // Run a plugin entry script (global.js / main.js) in a fresh vm context against this shim.
    runScript(file, {require: requireFn, globals = {}, timeout = 1000} = {}) {
      const context = vm.createContext(Object.assign({
        iina, require: requireFn || (name => { throw new Error('Unexpected module ' + name); }),
        setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, console: consoleApi
      }, globals));
      vm.runInContext(fs.readFileSync(file, 'utf8'), context, {filename: file, timeout});
      return context;
    }
  };
  return shim;
}

// ---------------------------------------------------------------------------------------------
// Page side (the `iina` object inside a sidebar/overlay WKWebView)
// ---------------------------------------------------------------------------------------------

// `onPost(name, data)` receives each page -> plugin message after JSON validation (e.g. a shim
// view's `receive`). Delivery to the page uses `receive(name, data)` or `receiveEnvelope`.
function createWebViewIina({onPost} = {}) {
  const listeners = new Map(), posts = [], dropped = [];
  const iina = {
    onMessage(name, callback) {
      if (typeof name !== 'string') throw new TypeError('IINA contract: iina.onMessage name must be a string');
      if (typeof callback !== 'function') throw new TypeError(`IINA contract: iina.onMessage("${name}") callback must be a function`);
      listeners.set(name, callback);
    },
    postMessage(name, data) {
      if (typeof name !== 'string') throw new TypeError('IINA contract: iina.postMessage name must be a string');
      const copy = jsonPayload(data, `page iina.postMessage("${name}")`);
      posts.push({name, data: copy});
      if (onPost) onPost(name, copy);
    }
  };
  function receive(name, data) {
    const callback = listeners.get(name);
    if (!callback) { dropped.push({name, data}); return undefined; }
    return callback(data === undefined ? undefined : JSON.parse(JSON.stringify(data)));
  }
  // IINA 1.5.1 plugins wrap native->page data as {encoded: encodeURIComponent(JSON)} (src/bridge.js).
  function receiveEnvelope(name, value) { return receive(name, {encoded: encodeURIComponent(JSON.stringify(value))}); }
  return {iina, listeners, posts, dropped, receive, receiveEnvelope,
    messages: name => posts.filter(p => p.name === name)};
}

module.exports = {
  createIina, createWebViewIina, createFakeTimers, createKeychainStore,
  normalizeKeyBinding, loadBoundKeys, keyBindingProblems, jsonPayload, isPlainObject, FIXTURE_DIR
};
