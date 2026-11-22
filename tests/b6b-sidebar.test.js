'use strict';

// B6b contract: the state envelope carries a plain playback error and offlineVods: {state, items}.
// Ready replaces the error line with up to ten rows. Loading shows a busy indicator; none and
// error fall back to the original error line. A row click posts open with {input: item.url}.
// Check the real sidebar markup and script in a DOM double, not CSS layout, clipping, or animation.

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

  function render(state, items = []) {
    page.receiveEnvelope('state', {
      title: 'Synthetic offline channel', source: {kind: 'twitch-live', provider: 'Twitch'},
      phase: 'loading', error: MESSAGE, offlineVods: {state, items},
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

test('B6b sidebar renders up to ten archive rows with literal titles, date, and duration', () => {
  const {render, visibleText, visibleNodes, markupWrites} = sidebarFixture();
  const items = [VOD, ...Array.from({length: 10}, (_, offset) => {
    const id = String(1234567891 + offset);
    return {...VOD, id, title: `Archive item ${id}`, url: `https://www.twitch.tv/videos/${id}`};
  })];
  render('ready', items);

  assert.ok(!markupWrites.some(markup => markup.includes('B6b fixture title')), 'do not render a title as HTML');
  assert.ok(visibleText(TITLE), 'the untrusted title is visible as literal text');
  for (const item of items.slice(1, 10)) assert.ok(visibleText(item.title), `missing ${item.title}`);
  assert.equal(visibleText(items[10].title), undefined, 'only ten rows are shown');
  assert.ok(visibleText('47:34:18'), 'long durations use h:mm:ss without wrapping at 24 hours');
  assert.ok(visibleNodes().some(node => /\b20\b/.test(node.ownText)), 'show the date without fixing its locale');
  assert.equal(visibleText(MESSAGE), undefined, 'ready rows replace the plain error');
});

test('B6b sidebar clicking a VOD title posts the existing open payload with its URL', () => {
  const {page, render, visibleText} = sidebarFixture();
  const other = {...VOD, title: 'Other archive', id: '1234567891', url: 'https://www.twitch.tv/videos/1234567891'};
  render('ready', [other, VOD]);

  const title = visibleText(TITLE);
  assert.ok(title, 'the selected VOD title must be visible before clicking it');
  (title.nodeType === 3 ? title.parentNode : title).click();
  assert.deepEqual(page.messages('open'), [{name: 'open', data: {input: VOD.url}}]);
});

test('B6b sidebar shows a busy indicator while the archive request is loading', () => {
  const {render, visibleNodes, visibleText} = sidebarFixture();
  render('loading');

  const indicator = visibleNodes().find(node => node.tagName === 'PROGRESS' ||
    node.getAttribute?.('role') === 'progressbar' || /\b(?:busy-indicator|spinner)\b/.test(node.className || ''));
  assert.ok(indicator, 'show a visible spinner or progress indicator');
  assert.equal(visibleText(TITLE), undefined);
});

for (const fallback of ['none', 'error']) {
  test(`B6b sidebar restores the plain playback error from ready to ${fallback}`, () => {
    const {render, visibleText} = sidebarFixture();
    render('ready', [VOD]);
    assert.ok(visibleText(TITLE), 'the ready row must exist before testing its removal');

    render(fallback);
    assert.equal(visibleText(TITLE), undefined, 'no stale archive row is left visible');
    assert.ok(visibleText(MESSAGE), 'the original error line is visible');
  });
}
