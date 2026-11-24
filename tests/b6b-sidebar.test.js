'use strict';

// B6c contract (#32): the sidebar no longer lists an offline channel's broadcasts; that list lives in the
// Open Stream window (global checks a channel before creating its player, #67). The sidebar keeps the plain
// playback error line. Check the real sidebar markup and script in a DOM double.

const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const {createWebViewIina} = require('./support/iina-shim.js');

const UI = join(__dirname, '../ui');
const HTML = readFileSync(join(UI, 'sidebar.html'), 'utf8');
const SCRIPT = readFileSync(join(UI, 'sidebar.js'), 'utf8');
const MESSAGE = 'That channel is offline.';
const TITLE = '<img src=x onerror="void(0)"> B6b fixture title & archive';
const VOD = {
  id: '1234567890', title: TITLE, createdAt: '2026-11-20T10:31:57Z', lengthSeconds: 171258,
  url: 'https://www.twitch.tv/videos/1234567890',
};
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr']);

function sidebarFixture() {
  const page = createWebViewIina();
  const markupWrites = [];
  const byId = new Map();

  function element(tag, attributes = {}) {
    const listeners = new Map();
    const node = {
      tagName: tag.toUpperCase(), id: attributes.id || '', className: attributes.class || '',
      hidden: Object.hasOwn(attributes, 'hidden'), ownText: '', children: [], parentNode: null,
      dataset: {}, value: '', clientHeight: 0, style: {setProperty() {}},
      get parentElement() { return this.parentNode; },
      get textContent() { return this.ownText + this.children.map(child => child.textContent).join(''); },
      set textContent(value) {
        this.replaceChildren();
        this.ownText = String(value ?? '');
      },
      set innerHTML(value) {
        markupWrites.push(String(value));
        this.replaceChildren();
      },
      insertAdjacentHTML(_where, value) { markupWrites.push(String(value)); },
      getAttribute(name) { return attributes[name] ?? null; },
      setAttribute(name, value) {
        attributes[name] = String(value);
        if (name === 'hidden') this.hidden = true;
        if (name === 'class') this.className = String(value);
        if (name.startsWith('data-')) this.dataset[name.slice(5)] = String(value);
      },
      removeAttribute(name) {
        delete attributes[name];
        if (name === 'hidden') this.hidden = false;
      },
      appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
      },
      append(...values) {
        for (const value of values) this.appendChild(typeof value === 'string' ? textNode(value) : value);
      },
      replaceChildren(...children) {
        for (const child of this.children) child.parentNode = null;
        this.children = [];
        this.ownText = '';
        this.append(...children);
      },
      contains(candidate) {
        for (let current = candidate; current; current = current.parentNode) {
          if (current === this) return true;
        }
        return false;
      },
      addEventListener(name, callback) {
        if (!listeners.has(name)) listeners.set(name, []);
        listeners.get(name).push(callback);
      },
      click() {
        let stopped = false;
        const event = {target: this, preventDefault() {}, stopPropagation() { stopped = true; }};
        for (let current = this; current && !stopped; current = current.parentNode) {
          event.currentTarget = current;
          current.dispatchClick(event);
        }
      },
      dispatchClick(event) {
        this.onclick?.(event);
        for (const callback of listeners.get('click') || []) callback(event);
      },
    };
    return node;
  }

  function textNode(value) {
    return {nodeType: 3, ownText: String(value), textContent: String(value), children: []};
  }

  // Read the actual HTML so the double knows which elements exist and when an ancestor hides a row.
  const stack = [];
  for (const [, closing, tag, raw] of HTML.matchAll(/<(\/?)([a-z][\w-]*)\b([^>]*)>/gi)) {
    if (closing) {
      stack.pop();
      continue;
    }
    const attributes = {};
    for (const [, key, quoted, singleQuoted, bare] of raw.matchAll(
      /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g,
    )) {
      attributes[key] = quoted ?? singleQuoted ?? bare ?? '';
    }
    const node = element(tag, attributes);
    if (node.id) byId.set(node.id, node);
    stack.at(-1)?.appendChild(node);
    if (!VOID_TAGS.has(tag)) stack.push(node);
    if (tag === 'html') byId.set(':root', node);
    if (tag === 'body') byId.set(':body', node);
  }

  const document = {
    documentElement: byId.get(':root'), activeElement: null, addEventListener() {},
    getElementById: id => byId.get(id) ?? null, createElement: element, createTextNode: textNode,
  };
  vm.runInNewContext(SCRIPT, {
    document, window: {addEventListener() {}}, iina: page.iina,
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  }, {filename: 'sidebar.js'});

  // `extra` lets a test send a field an older player sent (offlineVods) to prove the sidebar ignores it.
  function render(extra = {}) {
    page.receiveEnvelope('state', {
      title: 'Synthetic offline channel', source: {kind: 'twitch-live', provider: 'Twitch'},
      phase: 'loading', error: MESSAGE, ...extra,
      chat: {mode: 'off', state: 'off'}, auth: {phase: 'off'},
      view: {presentation: 'sidebar', fontSize: 14, spacing: 4, x: 1, y: 0}, messages: [],
    });
    assert.equal(byId.get('title').textContent, 'Synthetic offline channel', 'the state envelope was rendered');
  }

  function visibleNodes(node = byId.get(':body')) {
    if (node.hidden || node.style?.display === 'none') return [];
    return [node, ...node.children.flatMap(child => visibleNodes(child))];
  }

  function visibleText(text) {
    return visibleNodes().find(node => node.ownText.includes(text));
  }

  return {page, render, visibleNodes, visibleText, markupWrites};
}

test('B6c sidebar markup has no broadcast list', () => {
  for (const removed of ['offline-vods', 'offline-busy', 'offline-list', 'vod-row', 'vod-list']) {
    assert.ok(!HTML.includes(removed), `sidebar.html still contains ${removed}`);
    assert.ok(!SCRIPT.includes(removed), `sidebar.js still contains ${removed}`);
  }
  assert.ok(!SCRIPT.includes('offlineVods'), 'sidebar.js no longer reads offlineVods');
});

test('B6c sidebar shows the plain error line and no rows, even if a state carries offlineVods', () => {
  const {render, visibleText, markupWrites} = sidebarFixture();
  render({offlineVods: {state: 'ready', items: [VOD]}});
  assert.ok(visibleText(MESSAGE), 'the plain error line is visible');
  assert.equal(visibleText(TITLE), undefined, 'no broadcast row is rendered');
  assert.ok(!markupWrites.some(markup => markup.includes('B6b fixture title')));

  render({offlineVods: {state: 'loading', items: []}});
  assert.ok(visibleText(MESSAGE), 'loading no longer hides the error line');
});
