'use strict';

// D1c (UI half): hiding chat is a view state, never "chat off".
// Contract (fixed by the lead):
//   page -> player   'chat-collapse' {collapsed: boolean}; the overlay's #hide-chat never posts 'chat-off'.
//   player -> overlay state: collapsed, unread (missing = false).
//   player -> sidebar state: collapsed (missing = false).
// Also the sidebar text cleanup: no replay prose (and no #chat-status), no "Hide inspector" button,
// and the on/off switch is named "Chat" so it is not confused with Show Chat.
//
// The pages run in a vm over a small DOM built from the real HTML files, so parent/child structure is the page's
// own. Host model (WebKit, HTML spec): an HTML element's `hidden` property reflects the `hidden` content attribute,
// and `[hidden]` hides the element and everything inside it. SVG elements have no `hidden` property, so assigning
// one does nothing; only the attribute counts. CSS layout is not run; a native check covers the pixels.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const {createWebViewIina} = require('./support/iina-shim.js');

const ui = join(__dirname, '../ui');
const read = name => fs.readFileSync(join(ui, name), 'utf8');

const SVG_TAGS = new Set(['svg', 'path', 'rect', 'circle', 'line', 'g', 'polyline', 'polygon']);
const VOID_TAGS = new Set(['meta', 'link', 'input', 'br', 'img', 'hr']);

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.nodeName = this.tagName;
    this.nodeType = 1;
    this.ownerDocument = ownerDocument;
    this.attributes = new Map();
    this.children = [];
    this.childNodes = this.children;
    this.parentNode = null;
    this.listeners = new Map();
    this.style = {setProperty(name, value) { this[name] = value; }};
    this.dataset = {};
    this.value = '';
    this.textContent = '';
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.clientHeight = 0;
    this.clientWidth = 0;
    this.offsetLeft = 0;
    this.offsetTop = 0;
    this.offsetWidth = 0;
    this.offsetHeight = 0;
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(n => classes.add(n)),
      remove: (...names) => names.forEach(n => classes.delete(n)),
      toggle: (name, force) => {
        const on = force === undefined ? !classes.has(name) : !!force;
        if (on) classes.add(name);
        else classes.delete(name);
        return on;
      },
      contains: name => classes.has(name),
    };
    if (!SVG_TAGS.has(tagName.toLowerCase())) {
      Object.defineProperty(this, 'hidden', {
        get: () => this.attributes.has('hidden'),
        set: value => {
          if (value) this.attributes.set('hidden', '');
          else this.attributes.delete('hidden');
        },
      });
    }
  }
  get id() { return this.attributes.get('id') || ''; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(fn);
  }
  dispatch(name, event = {}) {
    const full = {target: this, button: 0, preventDefault() {}, stopPropagation() {}, ...event};
    for (const fn of this.listeners.get(name) || []) fn(full);
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  append(...nodes) { for (const node of nodes) this.appendChild(node); }
  replaceChildren(...nodes) {
    this.children.length = 0;
    this.append(...nodes);
  }
  contains(other) {
    for (let node = other; node; node = node.parentNode) if (node === this) return true;
    return false;
  }
  querySelectorAll(selector) {
    assert.equal(selector, '*', 'the double supports only querySelectorAll("*")');
    const out = [];
    const walk = node => {
      for (const child of node.children) {
        if (child.nodeType === 1) {
          out.push(child);
          walk(child);
        }
      }
    };
    walk(this);
    return out;
  }
  focus() { this.ownerDocument.activeElement = this; }
  blur() {}
}

// Builds the element tree of an HTML file: tags only, which is all the pages look up.
function buildDocument(html) {
  const document = {
    activeElement: null, hidden: false, listeners: new Map(),
    addEventListener(name, fn) { this.listeners.set(name, fn); },
    hasFocus: () => true,
    createElement: tag => new FakeElement(tag, document),
    createTextNode: text => ({nodeType: 3, nodeValue: String(text), textContent: String(text)}),
  };
  const root = new FakeElement('html', document);
  document.documentElement = root;
  const byId = new Map();
  const stack = [root];
  for (const match of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^<>]*?)(\/?)>/g)) {
    const [, closing, tag, attrs, selfClosing] = match;
    const lower = tag.toLowerCase();
    if (closing) {
      while (stack.length > 1 && stack.pop().tagName.toLowerCase() !== lower);
      continue;
    }
    if (lower === 'html') continue;
    const el = new FakeElement(lower, document);
    for (const [, name, value] of attrs.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) el.setAttribute(name, value ?? '');
    stack[stack.length - 1].appendChild(el);
    if (el.id) byId.set(el.id, el);
    if (lower === 'body') document.body = el;
    if (!selfClosing && !VOID_TAGS.has(lower)) stack.push(el);
  }
  document.getElementById = id => byId.get(id) ?? null;
  return document;
}

// Hidden by itself or by any ancestor, by the `hidden` attribute.
function shown(el) {
  for (let node = el; node && node.nodeType === 1; node = node.parentNode) {
    if (node.hasAttribute('hidden')) return false;
  }
  return true;
}

function overlayPage() {
  const page = createWebViewIina();
  const document = buildDocument(read('overlay.html'));
  const context = {
    document, iina: page.iina, innerWidth: 1280, innerHeight: 720,
    window: {addEventListener() {}},
    getComputedStyle: () => ({}),
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(read('chat-content.js'), context, {filename: 'chat-content.js'});
  vm.runInContext(read('overlay.js'), context, {filename: 'overlay.js'});
  return {page, $: id => document.getElementById(id), document};
}

function sidebarPage() {
  const page = createWebViewIina();
  const document = buildDocument(read('sidebar.html'));
  const context = {
    document, iina: page.iina,
    window: {addEventListener() {}},
    requestAnimationFrame: () => 1, cancelAnimationFrame() {}, setTimeout() {},
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(read('chat-content.js'), context, {filename: 'chat-content.js'});
  vm.runInContext(read('sidebar.js'), context, {filename: 'sidebar.js'});
  return {page, $: id => document.getElementById(id), document};
}

const LIVE_MESSAGES = [
  {id: 'm1', time: 0, sentAt: 1763790000000, author: 'viewer1', text: 'hello'},
  {id: 'm2', time: 0, sentAt: 1763790001000, author: 'viewer2', text: 'hi there'},
];

// An overlay state as src/player.js sends it today, with no collapsed or unread fields.
function overlayState({layout = 'column', presentation = 'beside', ...extra} = {}) {
  return {
    layout, canGoLive: true, qa: false,
    chat: {mode: 'live', state: 'connected'},
    messages: LIVE_MESSAGES,
    view: {presentation, fontSize: 14, spacing: 4, opacity: 0.6, x: 1, y: 0, width: 340, height: 260,
      columnWidth: 320, timestamps: false, timestampSeconds: false},
    ...extra,
  };
}

function sidebarState({presentation = 'beside', chat = {mode: 'live', state: 'connected'}, ...extra} = {}) {
  return {
    title: 'Synthetic stream', source: {kind: 'twitch-live', provider: 'Twitch'}, live: true, behindLive: null,
    phase: 'playing', formats: [], quality: 'auto720', chat,
    auth: {phase: 'off'}, messages: [],
    view: {presentation, fontSize: 14, spacing: 4, opacity: 0.6, x: 1, y: 0, columnWidth: 320},
    ...extra,
  };
}

// ---- Overlay: the toggle ----

test('D1c the overlay hide button posts chat-collapse true while shown, and never chat-off', () => {
  const {page, $} = overlayPage();
  page.receiveEnvelope('state', overlayState({collapsed: false}));
  $('hide-chat').dispatch('click');
  assert.deepEqual(page.messages('chat-collapse').map(p => p.data), [{collapsed: true}]);
  assert.equal(page.messages('chat-off').length, 0);
});

test('D1c the same button posts chat-collapse false while collapsed, and never chat-off', () => {
  const {page, $} = overlayPage();
  page.receiveEnvelope('state', overlayState({collapsed: true}));
  $('hide-chat').dispatch('click');
  assert.deepEqual(page.messages('chat-collapse').map(p => p.data), [{collapsed: false}]);
  assert.equal(page.messages('chat-off').length, 0);
});

test('D1c the toggle follows state, not its own clicks', () => {
  const {page, $} = overlayPage();
  page.receiveEnvelope('state', overlayState());
  $('hide-chat').dispatch('click');
  $('hide-chat').dispatch('click');
  assert.deepEqual(page.messages('chat-collapse').map(p => p.data), [{collapsed: true}, {collapsed: true}],
    'until the player answers, the page still shows chat, so both clicks ask to hide');
});

// ---- Overlay: collapsed hides the column, keeps the cluster ----

test('D1c beside: collapsed hides the messages and the width handle, and keeps the cluster shown', () => {
  const {page, $} = overlayPage();
  page.receiveEnvelope('state', overlayState({collapsed: false}));
  assert.ok(shown($('messages')), 'precondition: the column shows messages');
  assert.ok(shown($('column-handle')), 'precondition: the width handle is shown');
  assert.ok(shown($('hide-chat')), 'precondition: the cluster is shown');
  assert.equal($('panel').style.height, '720px', 'precondition: the column is full height');

  page.receiveEnvelope('state', overlayState({collapsed: true}));
  assert.equal(shown($('messages')), false, 'the messages are hidden');
  assert.equal(shown($('column-handle')), false, 'the width handle is hidden');
  assert.ok(shown($('column-tools')), 'the cluster has no hidden ancestor');
  assert.ok(shown($('hide-chat')), 'the button that brings chat back is shown');
  assert.notEqual($('panel').style.height, '720px', 'the panel no longer covers the full height');
  assert.notEqual($('panel').style.width, '320px', 'the panel no longer covers the column width');
});

test('D1c beside: messages that arrive while collapsed are there when chat is shown again', () => {
  const {page, $} = overlayPage();
  page.receiveEnvelope('state', overlayState({collapsed: true, messages: LIVE_MESSAGES}));
  page.receiveEnvelope('state', overlayState({collapsed: false, messages: LIVE_MESSAGES}));
  assert.ok(shown($('messages')));
  assert.equal($('messages').children.length, LIVE_MESSAGES.length);
});

test('D1c over the video: collapsed hides the chat panel', () => {
  const {page, $} = overlayPage();
  page.receiveEnvelope('state', overlayState({layout: 'float', presentation: 'overlay', collapsed: false}));
  assert.ok(shown($('panel')), 'precondition: the floating panel is shown');
  page.receiveEnvelope('state', overlayState({layout: 'float', presentation: 'overlay', collapsed: true}));
  assert.equal(shown($('panel')), false);
});

test('D1c a missing collapsed field behaves as false (today\'s player)', () => {
  const {page, $} = overlayPage();
  page.receiveEnvelope('state', overlayState());
  assert.ok(shown($('messages')));
  assert.ok(shown($('column-handle')));
  assert.equal($('panel').style.height, '720px');
  assert.equal($('hide-chat').getAttribute('aria-label'), 'Hide Chat');
  assert.equal(shown($('chat-unread')), false, 'a missing unread field shows no dot');

  const float = overlayPage();
  float.page.receiveEnvelope('state', overlayState({layout: 'float', presentation: 'overlay'}));
  assert.ok(shown(float.$('panel')));
});

// ---- Overlay: label, icon, dot ----

test('D1c the button\'s label, title and icon follow collapsed', () => {
  const {page, $} = overlayPage();
  page.receiveEnvelope('state', overlayState({collapsed: false}));
  assert.equal($('hide-chat').getAttribute('aria-label'), 'Hide Chat');
  assert.equal($('hide-chat').getAttribute('title'), 'Hide Chat');
  assert.ok(shown($('hide-chat-icon')));
  assert.equal(shown($('show-chat-icon')), false);

  page.receiveEnvelope('state', overlayState({collapsed: true}));
  assert.equal($('hide-chat').getAttribute('aria-label'), 'Show Chat');
  assert.equal($('hide-chat').getAttribute('title'), 'Show Chat');
  assert.equal(shown($('hide-chat-icon')), false);
  assert.ok(shown($('show-chat-icon')));

  page.receiveEnvelope('state', overlayState({collapsed: false}));
  assert.equal($('hide-chat').getAttribute('aria-label'), 'Hide Chat');
  assert.ok(shown($('hide-chat-icon')));
  assert.equal(shown($('show-chat-icon')), false);
});

test('D1c the icons are swapped on HTML wrappers, which have a hidden attribute, not on the SVGs', () => {
  const {$} = overlayPage();
  for (const id of ['hide-chat-icon', 'show-chat-icon']) {
    assert.equal($(id).tagName, 'SPAN', id);
    assert.equal($(id).parentNode.id, 'hide-chat', id);
  }
});

test('D1c unread shows a dot on the button, with no text', () => {
  const {page, $} = overlayPage();
  page.receiveEnvelope('state', overlayState({collapsed: true, unread: false}));
  assert.equal(shown($('chat-unread')), false);
  page.receiveEnvelope('state', overlayState({collapsed: true, unread: true}));
  assert.ok(shown($('chat-unread')));
  assert.equal($('chat-unread').parentNode.id, 'hide-chat', 'the dot sits on the button');
  assert.equal($('chat-unread').textContent, '', 'no count or text');
  assert.equal($('hide-chat').getAttribute('aria-label'), 'Show Chat', 'the label stays the action');
  page.receiveEnvelope('state', overlayState({collapsed: false, unread: false}));
  assert.equal(shown($('chat-unread')), false);
});

test('D1c a collapsed column carries data-collapsed for the cluster-only style (pixels: native check)', () => {
  const {page, $} = overlayPage();
  page.receiveEnvelope('state', overlayState({collapsed: true}));
  assert.equal($('panel').getAttribute('data-collapsed'), 'true');
  page.receiveEnvelope('state', overlayState({collapsed: false}));
  assert.equal($('panel').getAttribute('data-collapsed'), 'false');
});

// ---- Sidebar: the chat row's toggle ----

test('D1c the sidebar shows the toggle only when chat is on and over or beside the video', () => {
  for (const [presentation, chat, expected] of [
    ['beside', {mode: 'live', state: 'connected'}, true],
    ['overlay', {mode: 'live', state: 'connected'}, true],
    ['overlay', {mode: 'replay', state: 'ready', sourceName: 'Archive', count: 3, offset: 0}, true],
    ['sidebar', {mode: 'live', state: 'connected'}, false],
    ['beside', {mode: 'off', state: 'off'}, false],
  ]) {
    const {page, $} = sidebarPage();
    page.receiveEnvelope('state', sidebarState({presentation, chat}));
    assert.equal(shown($('chat-collapse')), expected, presentation + ' ' + chat.mode);
  }
});

test('D1c the sidebar toggle posts chat-collapse with the opposite of collapsed, never chat-off', () => {
  const shownPage = sidebarPage();
  shownPage.page.receiveEnvelope('state', sidebarState({collapsed: false}));
  shownPage.$('chat-collapse').dispatch('click');
  assert.deepEqual(shownPage.page.messages('chat-collapse').map(p => p.data), [{collapsed: true}]);

  const hiddenPage = sidebarPage();
  hiddenPage.page.receiveEnvelope('state', sidebarState({collapsed: true}));
  hiddenPage.$('chat-collapse').dispatch('click');
  assert.deepEqual(hiddenPage.page.messages('chat-collapse').map(p => p.data), [{collapsed: false}]);

  for (const {page} of [shownPage, hiddenPage]) assert.equal(page.messages('chat-off').length, 0);
});

test('D1c the sidebar toggle\'s label and icon follow collapsed; a missing field is false', () => {
  const {page, $} = sidebarPage();
  page.receiveEnvelope('state', sidebarState());
  assert.equal($('chat-collapse').getAttribute('aria-label'), 'Hide Chat');
  assert.equal($('chat-collapse').getAttribute('title'), 'Hide Chat');
  assert.ok(shown($('chat-collapse-hide-icon')));
  assert.equal(shown($('chat-collapse-show-icon')), false);
  $('chat-collapse').dispatch('click');
  assert.deepEqual(page.messages('chat-collapse').map(p => p.data), [{collapsed: true}]);

  page.receiveEnvelope('state', sidebarState({collapsed: true}));
  assert.equal($('chat-collapse').getAttribute('aria-label'), 'Show Chat');
  assert.equal($('chat-collapse').getAttribute('title'), 'Show Chat');
  assert.equal(shown($('chat-collapse-hide-icon')), false);
  assert.ok(shown($('chat-collapse-show-icon')));
});

test('D1c sidebar unread shows a textless dot on the Hide/Show Chat button; a missing field is false', () => {
  const {page, $} = sidebarPage();
  page.receiveEnvelope('state', sidebarState({presentation: 'overlay', collapsed: true}));
  assert.ok(shown($('chat-collapse')), 'precondition: the button is shown');
  assert.equal(shown($('chat-collapse-unread')), false, 'a missing unread field shows no dot');
  page.receiveEnvelope('state', sidebarState({presentation: 'overlay', collapsed: true, unread: true}));
  assert.ok(shown($('chat-collapse-unread')));
  assert.equal($('chat-collapse-unread').parentNode.id, 'chat-collapse', 'the dot sits on the button');
  assert.equal($('chat-collapse-unread').textContent, '', 'no count or text');
  assert.equal($('chat-collapse').getAttribute('aria-label'), 'Show Chat', 'the label stays the action');
  page.receiveEnvelope('state', sidebarState({presentation: 'overlay', collapsed: true, unread: false}));
  assert.equal(shown($('chat-collapse-unread')), false);
});

test('D1c the on/off switch is named Chat, not Show chat', () => {
  const {$} = sidebarPage();
  assert.equal($('chat-toggle').getAttribute('aria-label'), 'Chat');
});

// ---- Sidebar: text cleanup ----

// Every element's own text, after a render, so prose in any element is found.
function renderedTexts(document) {
  const out = [];
  const walk = node => {
    for (const child of node.children) {
      if (child.nodeType !== 1) continue;
      if (child.textContent) out.push(child.textContent);
      walk(child);
    }
  };
  walk(document.documentElement);
  return out;
}

const REPLAY_CHAT = {mode: 'replay', state: 'ready', sourceName: 'Twitch chat near playback', count: 104, offset: 0};

test('D1c the sidebar renders no prose for a normal replay state, and has no #chat-status', () => {
  const {page, $, document} = sidebarPage();
  page.receiveEnvelope('state', sidebarState({presentation: 'sidebar', chat: REPLAY_CHAT}));
  assert.ok(!$('chat-status'), 'no #chat-status element');
  const prose = renderedTexts(document).filter(text => text.includes('104') || text.includes(REPLAY_CHAT.sourceName));
  assert.deepEqual(prose, [], 'neither the source name nor the count is rendered as text');
  assert.equal(shown($('chat-error')), false);
});

test('D1c the sidebar renders no prose for a normal live state', () => {
  const {page, $} = sidebarPage();
  page.receiveEnvelope('state', sidebarState({presentation: 'sidebar'}));
  assert.ok(!$('chat-status'), 'no #chat-status element');
  assert.equal(shown($('chat-error')), false);
});

test('D1c the sidebar still renders a chat error', () => {
  const {page, $} = sidebarPage();
  page.receiveEnvelope('state', sidebarState({
    presentation: 'sidebar', chat: {...REPLAY_CHAT, error: 'Chat archive could not be read.'},
  }));
  assert.ok(shown($('chat-error')));
  assert.equal($('chat-error').textContent, 'Chat archive could not be read.');
});

test('D1c the Hide inspector button is gone from the sidebar', () => {
  assert.doesNotMatch(read('sidebar.html'), /hide-for-overlay|overlay-note|Hide inspector/);
  assert.doesNotMatch(read('sidebar.js'), /hide-for-overlay|overlay-note/);
  assert.doesNotMatch(read('sidebar.css'), /overlay-note/);
  const {page, $} = sidebarPage();
  page.receiveEnvelope('state', sidebarState({presentation: 'overlay'}));
  assert.ok(!$('hide-for-overlay'), 'no #hide-for-overlay element');
});

// ---- Harness self-checks: the double sees what the host would ----

test('D1c harness: an ancestor\'s hidden attribute hides its descendants', () => {
  const {$} = overlayPage();
  $('panel').hidden = true;
  assert.equal(shown($('hide-chat')), false);
});

test('D1c harness: hidden assigned to an SVG element has no effect, as in WebKit', () => {
  const {$} = overlayPage();
  const svg = $('hide-chat-icon').children[0];
  assert.equal(svg.tagName, 'SVG');
  svg.hidden = true;
  assert.equal(svg.hasAttribute('hidden'), false, 'no attribute, so CSS [hidden] would not match');
});
