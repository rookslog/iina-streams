'use strict';

// B6c contract (#32): the Open Stream page (ui/open.html, ui/open.js) sets its field on `prefill` {input}
// and renders `offline-vods` (an envelope, as src/bridge.js sends untrusted text) under the field: a spinner
// while loading, up to ten rows of title, short date and h:mm:ss length when ready, and one muted line for
// none or error. Rows are built from text, never markup. A row click posts open-stream {input: url}; typing
// in the field clears the list.
// The real page markup and script in a DOM double built from open.html; not CSS layout or ellipsis.

const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const {createWebViewIina} = require('./support/iina-shim.js');

const UI = join(__dirname, '../ui');
const HTML = readFileSync(join(UI, 'open.html'), 'utf8');
const SCRIPT = readFileSync(join(UI, 'open.js'), 'utf8');
const TITLE = '<img src=x onerror="void(0)"> B6c fixture title & archive';
const VOD = {
  title: TITLE, createdAt: '2026-11-20T10:31:57Z', lengthSeconds: 171258,
  url: 'https://www.twitch.tv/videos/1234567890',
};
const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'link', 'meta']);

function pageFixture() {
  const page = createWebViewIina();
  const markupWrites = [];
  const byId = new Map();

  function element(tag, attributes = {}) {
    const listeners = new Map();
    const node = {
      tagName: tag.toUpperCase(), id: attributes.id || '', className: attributes.class || '',
      hidden: Object.hasOwn(attributes, 'hidden'), ownText: '', children: [], parentNode: null, value: '',
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
      addEventListener(name, callback) {
        if (!listeners.has(name)) listeners.set(name, []);
        listeners.get(name).push(callback);
      },
      dispatch(name, event = {}) {
        for (const callback of listeners.get(name) || []) callback({target: node, preventDefault() {}, ...event});
      },
      click() {
        for (let current = node; current; current = current.parentNode) current.dispatch?.('click', {target: node});
      },
      focus() { document.activeElement = node; },
    };
    return node;
  }

  function textNode(value) {
    return {nodeType: 3, ownText: String(value), textContent: String(value), children: []};
  }

  const stack = [];
  for (const [, closing, tag, raw] of HTML.matchAll(/<(\/?)([a-z][\w-]*)\b([^>]*)>/gi)) {
    if (closing) {
      stack.pop();
      continue;
    }
    const attributes = {};
    for (const [, key, quoted, bare] of raw.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|([^\s>"]+)))?/g)) {
      attributes[key] = quoted ?? bare ?? '';
    }
    const node = element(tag, attributes);
    if (node.id) byId.set(node.id, node);
    stack.at(-1)?.appendChild(node);
    if (!VOID_TAGS.has(tag.toLowerCase())) stack.push(node);
    if (tag === 'body') byId.set(':body', node);
  }

  const document = {
    activeElement: null, addEventListener() {},
    getElementById: id => byId.get(id) ?? null, createElement: element, createTextNode: textNode,
  };
  vm.runInNewContext(SCRIPT, {document, window: {addEventListener() {}}, iina: page.iina}, {filename: 'open.js'});

  function visibleNodes(node = byId.get(':body')) {
    if (node.hidden) return [];
    return [node, ...node.children.flatMap(child => visibleNodes(child))];
  }

  function visibleText(text) {
    return visibleNodes().find(node => node.ownText.includes(text));
  }

  function list(value) {
    page.receiveEnvelope('offline-vods', value);
  }

  return {page, field: byId.get('open-input'), list, visibleNodes, visibleText, markupWrites};
}

function spinner(nodes) {
  return nodes.find(node => /\bbusy-indicator\b/.test(node.className || ''));
}

test('B6c page: announces open-ready once its listeners exist, and prefill sets the field', () => {
  const {page, field} = pageFixture();
  assert.deepEqual(page.posts.map(post => post.name), ['open-ready']);
  assert.ok(page.listeners.has('prefill') && page.listeners.has('offline-vods'), 'listeners precede open-ready');
  page.receive('prefill', {input: 'fixture_offline'});
  assert.equal(field.value, 'fixture_offline');
});

test('B6c page: loading shows a spinner and no text', () => {
  const {list, visibleNodes} = pageFixture();
  assert.equal(spinner(visibleNodes()), undefined, 'no spinner before a list arrives');
  list({state: 'loading'});
  assert.ok(spinner(visibleNodes()), 'a visible spinner while loading');
  assert.ok(visibleNodes().every(node => node.ownText === ''), 'loading carries no visible text');
});

test('B6c page: ready renders up to ten rows of literal title, short date and h:mm:ss length', () => {
  const {list, visibleNodes, visibleText, markupWrites} = pageFixture();
  const items = [VOD, ...Array.from({length: 10}, (_, index) => ({
    ...VOD, title: `Archive item ${index}`, url: `https://www.twitch.tv/videos/${1234567891 + index}`,
  }))];
  list({state: 'ready', items});

  assert.ok(!markupWrites.some(markup => markup.includes('B6c fixture title')), 'no title is rendered as markup');
  assert.ok(visibleText(TITLE), 'the untrusted title is visible as literal text');
  for (const row of items.slice(1, 10)) assert.ok(visibleText(row.title), `missing ${row.title}`);
  assert.equal(visibleText(items[10].title), undefined, 'only ten rows are shown');
  assert.ok(visibleText('47:34:18'), 'h:mm:ss with hours past 24');
  assert.ok(visibleNodes().some(node => /\b20\b/.test(node.ownText)), 'a short date, in the viewer locale');
  assert.equal(spinner(visibleNodes()), undefined, 'the spinner is gone once ready');
});

test('B6c page: clicking a row posts open-stream with its URL', () => {
  const {page, list, visibleText} = pageFixture();
  const other = {...VOD, title: 'Other archive', url: 'https://www.twitch.tv/videos/1234567891'};
  list({state: 'ready', items: [other, VOD]});
  visibleText(TITLE).click();
  assert.deepEqual(page.messages('open-stream'), [{name: 'open-stream', data: {input: VOD.url}}]);
});

test('B6c page: typing in the field clears the list', () => {
  const {field, list, visibleNodes, visibleText} = pageFixture();
  list({state: 'ready', items: [VOD]});
  assert.ok(visibleText(TITLE));
  field.dispatch('input');
  assert.equal(visibleText(TITLE), undefined, 'no row is left visible');
  assert.deepEqual(visibleNodes().filter(node => node.ownText), [], 'no text is left visible');

  list({state: 'loading'});
  field.dispatch('input');
  assert.equal(spinner(visibleNodes()), undefined, 'typing hides the spinner too');
});

for (const state of ['none', 'error']) {
  test(`B6c page: ${state} shows one muted line and no rows`, () => {
    const {list, visibleNodes, visibleText} = pageFixture();
    list({state: 'ready', items: [VOD]});
    list({state});
    assert.equal(visibleText(TITLE), undefined, 'no stale row is left');
    const lines = visibleNodes().filter(node => node.ownText);
    assert.equal(lines.length, 1, 'exactly one line of text');
    assert.match(lines[0].className, /\bmuted\b/);
    assert.equal(spinner(visibleNodes()), undefined);
  });
}

test('B6c page: none and error read differently', () => {
  const none = pageFixture();
  none.list({state: 'none'});
  const error = pageFixture();
  error.list({state: 'error'});
  const text = fixture => fixture.visibleNodes().filter(node => node.ownText)[0].ownText;
  assert.notEqual(text(none), text(error));
});
