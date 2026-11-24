'use strict';

// #74 phase 1 (docs/design/finding-2026-11-22/open-stream/TESTS-74.md in the main checkout): the page half of
// typing suggestions. ui/open.html and ui/open.js run in the same kind of DOM double as tests/b6c-open-page.test.js,
// extended with keyboard events (field first, then document, as a browser bubbles them), a document-level
// getElementById that finds elements created later, and stubs for classList, style and scrollIntoView.
// Not covered: real layout, focus rings, scrolling. Enter is modelled as a browser does it: keydown, then, unless
// the handler called preventDefault, the form's submit.
// Global-to-page messages are sent carrying both the plain fields and a src/bridge.js `encoded` envelope, so the page
// may read either. The row mark (dot, none, ring) is checked as three distinct signatures, not as a particular glyph.

const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const {createWebViewIina} = require('./support/iina-shim.js');

const UI = join(__dirname, '../ui');
const HTML = readFileSync(join(UI, 'open.html'), 'utf8');
const SCRIPT = readFileSync(join(UI, 'open.js'), 'utf8');
const CSS = readFileSync(join(UI, 'open.css'), 'utf8');
const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'link', 'meta']);
const GLYPHS = /[●○•◯⬤◉◎·]/g;
const STATE_CLASS = /^(selected|active|current|highlight|highlighted|focus|focused)$/;
const ROWS = [
  {provider: 'twitch', login: 'ohnepixel', displayName: 'Ohne Pixel', live: true},
  {provider: 'twitch', login: 'ohmwrecker', displayName: 'OhmWrecker', live: false},
  {provider: 'twitch', login: 'ohbaby', displayName: 'Oh Baby', live: null},
];
const VOD = {title: 'Fixture archive', createdAt: '2026-11-20T10:31:57Z', lengthSeconds: 3600, url: 'https://www.twitch.tv/videos/1234567890'};

function pageFixture() {
  const page = createWebViewIina();
  const byId = new Map();
  const documentListeners = new Map();

  function element(tag, attributes = {}) {
    const listeners = new Map();
    const node = {
      tagName: tag.toUpperCase(), id: attributes.id || '', className: attributes.class || '',
      hidden: Object.hasOwn(attributes, 'hidden'), ownText: '', children: [], parentNode: null, value: '',
      style: {}, dataset: {}, scrollTop: 0,
      get textContent() { return this.ownText + this.children.map(child => child.textContent).join(''); },
      set textContent(value) {
        this.replaceChildren();
        this.ownText = String(value ?? '');
      },
      set innerHTML(value) { this.replaceChildren(); },
      insertAdjacentHTML() {},
      getAttribute(name) { return attributes[name] ?? null; },
      setAttribute(name, value) {
        attributes[name] = String(value);
        if (name === 'hidden') this.hidden = true;
        if (name === 'class') this.className = String(value);
        if (name === 'id') this.id = String(value);
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
      classList: {
        add: (...names) => { node.className = [...new Set([...node.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
        remove: (...names) => { node.className = node.className.split(/\s+/).filter(name => name && !names.includes(name)).join(' '); },
        toggle: (name, force) => {
          const has = node.className.split(/\s+/).includes(name);
          const on = force === undefined ? !has : !!force;
          node.classList[on ? 'add' : 'remove'](name);
          return on;
        },
        contains: name => node.className.split(/\s+/).includes(name),
      },
      scrollIntoView() {},
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
  const body = byId.get(':body');

  function all(root = body) {
    return [root, ...root.children.flatMap(child => all(child))];
  }

  const document = {
    activeElement: null,
    addEventListener(name, callback) {
      if (!documentListeners.has(name)) documentListeners.set(name, []);
      documentListeners.get(name).push(callback);
    },
    getElementById: id => all().find(node => node.id === id) ?? null,
    createElement: element, createTextNode: textNode,
  };
  vm.runInNewContext(SCRIPT, {document, window: {addEventListener() {}}, iina: page.iina}, {filename: 'open.js'});

  const field = byId.get('open-input');
  const form = byId.get('open-form');

  function visibleNodes(node = body) {
    if (node.hidden) return [];
    return [node, ...node.children.flatMap(child => visibleNodes(child))];
  }

  // A key press as a browser does it. Returns whether the handler called preventDefault.
  function press(key) {
    let prevented = false, stopped = false;
    const event = {key, preventDefault: () => { prevented = true; }, stopPropagation: () => { stopped = true; }};
    field.dispatch('keydown', event);
    if (!stopped) for (const callback of documentListeners.get('keydown') || []) callback({target: field, ...event});
    if (key === 'Enter' && !prevented) form.dispatch('submit');
    return prevented;
  }

  function deliver(name, value) {
    page.receive(name, {...value, encoded: encodeURIComponent(JSON.stringify(value))});
  }

  const suggest = (rows = ROWS, text = '') => deliver('suggestions', {text, rows});
  const vods = value => page.receiveEnvelope('offline-vods', value);
  const posts = name => page.messages(name).map(post => post.data);
  const listbox = () => all().find(node => attr(node, 'role') === 'listbox');
  const options = () => (listbox() ? all(listbox()).filter(node => attr(node, 'role') === 'option') : []);
  const selected = () => options().filter(node => attr(node, 'aria-selected') === 'true');
  const type = text => { field.value = text; field.dispatch('input'); };

  return {
    page, field, form, press, deliver, suggest, vods, posts, listbox, options, selected, type,
    all, visibleNodes, document,
  };
}

// An attribute, or the ARIA reflection property of the same name (role, ariaSelected).
function attr(node, name) {
  const value = node.getAttribute(name);
  if (value !== null && value !== undefined) return value;
  const reflected = node[name.replace(/^aria-/, 'aria').replace(/-(\w)/g, (_, c) => c.toUpperCase())];
  return typeof reflected === 'string' ? reflected : null;
}

function isVisible(f, node) {
  return f.visibleNodes().includes(node);
}

// The row's mark: everything under the option except its name text and the option's selection classes.
function markSignature(option, name) {
  const classes = node => String(node.className || '').split(/\s+/).filter(token => token && !STATE_CLASS.test(token)).sort().join(' ');
  const parts = [classes(option)];
  const walk = node => {
    for (const child of node.children) {
      if (child.ownText.replace(GLYPHS, '').trim() === name && !child.children.length) continue;
      parts.push(`${classes(child)}|${child.ownText}`);
      walk(child);
    }
  };
  walk(option);
  return parts.join('/');
}

// ---- tests ----

test('11. rows show only the display name and a live mark: dot when live, none when offline, ring when unknown', () => {
  const f = pageFixture();
  f.suggest();
  const rows = f.options();
  assert.equal(rows.length, 3, 'one option per row');
  assert.ok(rows.every(row => isVisible(f, row)), 'the options are visible');
  const texts = f.visibleNodes().map(node => node.ownText.replace(GLYPHS, '').trim()).filter(Boolean);
  assert.deepEqual(texts, ROWS.map(row => row.displayName), 'no text but the names: no login, reason, count or label');
  const marks = rows.map((row, index) => markSignature(row, ROWS[index].displayName));
  assert.equal(new Set(marks).size, 3, 'live, offline and unknown each look different');
});

test('12a. typing posts open-query {text}', () => {
  const f = pageFixture();
  f.type('oh');
  assert.deepEqual(f.posts('open-query'), [{text: 'oh'}]);
  f.type('ohn');
  assert.deepEqual(f.posts('open-query'), [{text: 'oh'}, {text: 'ohn'}]);
});

test('12. combobox: the field keeps focus; arrows move the selection with aria-activedescendant and aria-selected', () => {
  const f = pageFixture();
  f.suggest();
  assert.equal(f.selected().length, 0, 'no selection before an arrow key');
  assert.equal(f.press('ArrowDown'), true, 'ArrowDown does not move the caret');
  assert.deepEqual(f.selected(), [f.options()[0]]);
  assert.equal(f.field.getAttribute('aria-activedescendant'), f.options()[0].id);
  f.press('ArrowDown');
  assert.deepEqual(f.selected(), [f.options()[1]]);
  assert.equal(f.field.getAttribute('aria-activedescendant'), f.options()[1].id);
  assert.equal(f.press('ArrowUp'), true);
  assert.deepEqual(f.selected(), [f.options()[0]]);
  assert.equal(f.field.getAttribute('aria-activedescendant'), f.options()[0].id);
  assert.equal(f.document.activeElement, f.field, 'focus stays in the field');
  assert.equal(new Set(f.options().map(option => option.id)).size, 3, 'option ids are unique and set');
  assert.ok(f.options().every(option => option.id));
});

test('12. Return: with a selection it posts open-stream {input: login}', () => {
  const f = pageFixture();
  f.suggest();
  f.press('ArrowDown');
  f.press('ArrowDown');
  f.press('Enter');
  assert.deepEqual(f.posts('open-stream'), [{input: 'ohmwrecker'}], 'one open-stream, with the selected login');
});

test('12. Return: with text and no selection it posts today\'s open-stream {input: text}', () => {
  const f = pageFixture();
  f.suggest(ROWS, 'oh');
  f.field.value = 'https://www.twitch.tv/someone';
  f.press('Enter');
  assert.deepEqual(f.posts('open-stream'), [{input: 'https://www.twitch.tv/someone'}]);
});

test('12. Escape: with an empty field it closes (open-cancel), as today', () => {
  const f = pageFixture();
  f.press('Escape');
  assert.equal(f.posts('open-cancel').length, 1);
});

test('12. Escape: with text it clears the field first, and the next Escape closes', () => {
  const f = pageFixture();
  f.field.value = 'oh';
  f.press('Escape');
  assert.equal(f.field.value, '', 'the first Escape clears the field');
  assert.equal(f.posts('open-cancel').length, 0, 'and does not close yet');
  f.press('Escape');
  assert.equal(f.posts('open-cancel').length, 1, 'the second Escape closes');
});

test('13. selection by identity: status and a new list that still has the login keep it; a list without it selects the first row', () => {
  const f = pageFixture();
  f.suggest();
  f.press('ArrowDown');
  f.press('ArrowDown');
  const keeps = login => {
    const [only] = f.selected();
    assert.ok(only, 'something is selected');
    assert.equal(f.options().indexOf(only), f.options().findIndex(option => option === only));
    assert.equal(f.field.getAttribute('aria-activedescendant'), only.id);
    assert.ok(only.textContent.includes(ROWS.find(row => row.login === login).displayName), `${login} is selected`);
  };
  keeps('ohmwrecker');

  f.deliver('suggestions-status', {status: {ohnepixel: false, ohmwrecker: true, ohbaby: true}});
  keeps('ohmwrecker');

  f.suggest([ROWS[2], ROWS[1], ROWS[0]], 'oh');
  keeps('ohmwrecker');
  assert.equal(f.selected().length, 1);

  f.suggest([ROWS[2], ROWS[0]], 'oh');
  assert.equal(f.selected().length, 1);
  assert.ok(f.selected()[0].textContent.includes('Oh Baby'), 'the login is gone, so the first row is selected');
  assert.equal(f.options().indexOf(f.selected()[0]), 0);
  assert.equal(f.field.getAttribute('aria-activedescendant'), f.options()[0].id);
});

for (const key of ['ArrowRight', 'Tab']) {
  test(`14. broadcasts: ${key} on a selected row posts open-vods {login}`, () => {
    const f = pageFixture();
    f.suggest();
    f.press('ArrowDown');
    f.press('ArrowDown');
    f.press(key);
    assert.deepEqual(f.posts('open-vods'), [{login: 'ohmwrecker'}]);
  });
}

test('14. broadcasts: they render as the #32 list, and Escape returns to the suggestions with the person still selected', () => {
  const f = pageFixture();
  f.suggest();
  f.press('ArrowDown');
  f.press('ArrowDown');
  f.press('ArrowRight');
  f.vods({state: 'ready', items: [VOD]});
  const title = f.visibleNodes().find(node => node.ownText.includes(VOD.title));
  assert.ok(title, 'the broadcast title is visible');
  f.press('Escape');
  assert.equal(f.posts('open-cancel').length, 0, 'Escape goes back; it does not close');
  assert.equal(f.visibleNodes().find(node => node.ownText.includes(VOD.title)), undefined, 'the broadcasts are gone');
  assert.ok(f.options().every(option => isVisible(f, option)), 'the suggestions are back');
  assert.equal(f.selected().length, 1);
  assert.ok(f.selected()[0].textContent.includes('OhmWrecker'), 'the same person is still selected');
});

// ---- 15: CSS ----

function declarationsFor(selectorMatches) {
  const declarations = {};
  for (const [, selectors, block] of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectors.split(',').some(selector => selectorMatches(selector.trim()))) continue;
    for (const [, name, value] of block.matchAll(/([\w-]+)\s*:\s*([^;]+)/g)) declarations[name] = value.trim();
  }
  return declarations;
}

function matcherFor(node) {
  const classes = String(node.className || '').split(/\s+/).filter(Boolean);
  const role = attr(node, 'role');
  return selector => (node.id && selector === '#' + node.id)
    || classes.some(name => selector === '.' + name)
    || (role && (selector === `[role=${role}]` || selector === `[role="${role}"]`));
}

test('15. fixed height: the list container has a set height and scrolls (overflow-y: auto)', () => {
  const f = pageFixture();
  f.suggest(Array.from({length: 12}, (_, index) => ({provider: 'twitch', login: `p${index}`, displayName: `P ${index}`, live: null})));
  const box = f.listbox();
  assert.ok(box, 'a role=listbox container exists');
  const css = declarationsFor(matcherFor(box));
  assert.match(css.height ?? '', /^\d+(\.\d+)?(px|rem|em|vh)$/, 'a fixed height, not auto and not only a max-height');
  assert.ok(parseFloat(css.height) > 0);
  const overflowY = css['overflow-y'] ?? css.overflow ?? '';
  assert.match(overflowY, /\b(auto|scroll)\b/, 'it scrolls');
  const row = f.options()[0];
  const rowHeight = declarationsFor(matcherFor(row)).height;
  if (/px$/.test(rowHeight ?? '') && /px$/.test(css.height)) {
    assert.ok(parseFloat(css.height) >= 8 * parseFloat(rowHeight), 'the container fits 8 rows');
  }
  assert.equal(f.options().length, 12, 'all 12 rows are in the list; it scrolls');
});

test('16. VoiceOver: combobox field with aria-controls on a listbox; options named and numbered', () => {
  const f = pageFixture();
  f.suggest();
  assert.equal(attr(f.field, 'role'), 'combobox');
  const box = f.listbox();
  assert.ok(box, 'a role=listbox element');
  assert.ok(box.id, 'the listbox has an id');
  assert.equal(f.field.getAttribute('aria-controls'), box.id);
  const names = f.options().map(option => attr(option, 'aria-label'));
  assert.deepEqual(names, ['Ohne Pixel, live', 'OhmWrecker, offline', 'Oh Baby']);
  f.options().forEach((option, index) => {
    assert.equal(attr(option, 'aria-posinset'), String(index + 1), 'aria-posinset');
    assert.equal(attr(option, 'aria-setsize'), '3', 'aria-setsize');
  });
});
