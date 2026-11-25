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

// Replaced 2026-11-24 (phase 3, TESTS-74): test 11 ("each row shows only the display name and a live mark") was
// superseded by W-21 and is replaced by P1 below (P1a keeps its mark rule: live, none, ring, now on the avatar).
// ---- P1: mock A's row (docs/design/finding-2026-11-22/open-stream/direction-a/a.js rowHTML) ----

const P1_ROWS = [
  {provider: 'twitch', login: 'quillfox', displayName: 'Quillfox', live: true},
  {provider: 'twitch', login: 'brindle', displayName: 'Brindle', live: false},
  {provider: 'twitch', login: 'tidalmoss', displayName: 'tidalmoss', live: null},
];
const hoursAgo = hours => new Date(Date.now() - hours * 3600000).toISOString();
const DAY = 24;

// Global's suggestions-status {status, details}, as TESTS-74 G6 describes it.
function statusWithDetails(f, status, details) {
  f.deliver('suggestions-status', {status, details});
}

// The avatar of a row: the element that holds the display name's first letter together with the row's live mark.
function avatarOf(f, option, letter) {
  const letterNode = f.all(option).find(node => node !== option && node.ownText.trim() === letter);
  if (!letterNode) return null;
  // A letter with a mark inside it is the avatar; a bare letter directly under the row is the avatar with no mark;
  // a bare letter in a wrapper means the wrapper is the avatar.
  const avatar = letterNode.children.length || letterNode.parentNode === option ? letterNode : letterNode.parentNode;
  return {avatar, letterNode};
}

// What marks an avatar: its own classes and everything under it except the letter.
function avatarSignature({avatar, letterNode}) {
  const classes = node => String(node.className || '').split(/\s+/).filter(token => token && !STATE_CLASS.test(token)).sort().join(' ');
  const parts = [classes(avatar)];
  const walk = node => {
    for (const child of node.children) {
      if (child === letterNode) continue;
      parts.push(`${classes(child)}|${child.ownText}`);
      walk(child);
    }
  };
  walk(avatar);
  return parts;
}

function leafTexts(f, option) {
  return f.all(option).map(node => node.ownText.trim()).filter(Boolean);
}

// The text left on a row once the named pieces are taken out: anything left is text the design does not ask for.
function leftover(f, option, pieces) {
  let text = leafTexts(f, option).join(' ');
  for (const piece of [...pieces].sort((a, b) => b.length - a.length)) text = text.replace(piece, '');
  return text.replace(/\s+/g, '');
}

test('P1a. each row has an avatar with the name\'s first letter in capitals, and the live mark is on it: live, none, ring', () => {
  const f = pageFixture();
  f.suggest(P1_ROWS);
  const rows = f.options();
  assert.equal(rows.length, 3);
  const letters = ['Q', 'B', 'T'];
  const avatars = rows.map((row, index) => avatarOf(f, row, letters[index]));
  avatars.forEach((found, index) => assert.ok(found, `row ${index + 1} has an avatar holding "${letters[index]}"`));
  const signatures = avatars.map(avatarSignature);
  assert.equal(new Set(signatures.map(parts => parts.join('/'))).size, 3, 'live, offline and unknown look different on the avatar');
  assert.equal(signatures[1].length, 1, 'offline: no mark under the avatar');
});

test('P1b. a live row shows "category · title" and the viewers, and no other text (no login, no reason)', () => {
  const f = pageFixture();
  f.suggest(P1_ROWS);
  statusWithDetails(f, {quillfox: true, brindle: false, tidalmoss: null}, {
    quillfox: {title: 'Any% marathon, day 3', category: 'Hades', viewers: 12345},
  });
  const [live] = f.options();
  assert.match(live.textContent, /Hades\s*·\s*Any% marathon, day 3/, 'category · title');
  assert.ok(leafTexts(f, live).includes('12.3K'), 'viewers, compact: 12345 is 12.3K');
  assert.equal(leftover(f, live, ['Any% marathon, day 3', 'Hades', 'Quillfox', '12.3K', '·', 'Q']), '',
    'the letter, name, category, title and viewers are the whole row (the login is not shown)');
  assert.ok(!f.visibleNodes().some(node => /12345|reason|follow/i.test(node.ownText)), 'no raw count, no reason text');
});

test('P1c. viewers are compact: 950, 1.5K, 12.3K (the compact form is mock A\'s: sample-data.js compact)', () => {
  const f = pageFixture();
  const rows = [
    {provider: 'twitch', login: 'mosswick', displayName: 'Mosswick', live: true},
    {provider: 'twitch', login: 'ferngully', displayName: 'Ferngully', live: true},
    {provider: 'twitch', login: 'brookline', displayName: 'Brookline', live: true},
  ];
  f.suggest(rows);
  const stream = viewers => ({title: 'Evening stream', category: 'Chess', viewers});
  statusWithDetails(f, {mosswick: true, ferngully: true, brookline: true},
    {mosswick: stream(950), ferngully: stream(1500), brookline: stream(12345)});
  const options = f.options();
  assert.deepEqual(['950', '1.5K', '12.3K'].map((text, index) => leafTexts(f, options[index]).includes(text)), [true, true, true]);
  assert.ok(!leafTexts(f, options[1]).includes('1500'));
});

test('P1d. an offline row with lastAt shows a short age ("2d", "3w") and the broadcasts chevron; with none known it shows no age', () => {
  const f = pageFixture();
  const rows = [
    {provider: 'twitch', login: 'brindle', displayName: 'Brindle', live: false},
    {provider: 'twitch', login: 'wrenfield', displayName: 'Wrenfield', live: false},
    {provider: 'twitch', login: 'hollowell', displayName: 'Hollowell', live: false},
  ];
  f.suggest(rows);
  statusWithDetails(f, {brindle: false, wrenfield: false, hollowell: false}, {
    brindle: {lastAt: hoursAgo(2 * DAY + 1), lastTitle: 'Rhythm game requests'},
    wrenfield: {lastAt: hoursAgo(21 * DAY + 1)},
  });
  const [two, three, none] = f.options();
  // Amended 2026-11-24 (lead, phase 3b): as in mock A, an offline row shows its last broadcast's title when known.
  assert.ok(leafTexts(f, two).includes('Rhythm game requests'), 'the last broadcast title is the second line');
  assert.ok(leafTexts(f, two).includes('2d'), 'two days ago is 2d');
  assert.ok(leafTexts(f, three).includes('3w'), 'three weeks ago is 3w');
  for (const row of [two, three]) {
    assert.ok(f.all(row).some(node => /disclos|chev/i.test(String(node.className))), 'the broadcasts chevron');
  }
  assert.equal(leftover(f, two, ['2d', 'Brindle', 'B', 'Rhythm game requests']), '', 'name, last title and age, nothing else');
  assert.equal(leftover(f, three, ['3w', 'Wrenfield', 'W']), '', 'no last title known: name and age only');
  assert.equal(leftover(f, none, ['Hollowell', 'H']), '', 'no lastAt: no age, no placeholder');
});

// ---- P2: the top stays selected until the person moves ----

test('P2. before any arrow key a new list selects its first row, so Return opens the new top; after one, selection is by identity', () => {
  const f = pageFixture();
  f.suggest();
  assert.ok(f.selected()[0].textContent.includes('Ohne Pixel'));
  f.suggest([ROWS[2], ROWS[0], ROWS[1]]);
  assert.equal(f.selected().length, 1);
  assert.ok(f.selected()[0].textContent.includes('Oh Baby'), 'the new top (Oh Baby) is selected, not the person who was on top');
  assert.equal(f.field.getAttribute('aria-activedescendant'), f.options()[0].id);
  f.deliver('suggestions-status', {status: {ohbaby: false}});
  assert.ok(f.selected()[0].textContent.includes('Oh Baby'), 'a status message leaves the top selected');
  f.suggest([ROWS[1], ROWS[2], ROWS[0]]);
  assert.ok(f.selected()[0].textContent.includes('OhmWrecker'), 'and again for the next list');
  f.press('Enter');
  assert.deepEqual(f.posts('open-stream'), [{input: 'ohmwrecker'}], 'Return opens the new top');

  const g = pageFixture();
  g.suggest();
  g.press('ArrowDown');
  g.suggest([ROWS[1], ROWS[2], ROWS[0]]);
  assert.ok(g.selected()[0].textContent.includes('OhmWrecker'), 'after an arrow key the person stays selected wherever they move');
  g.suggest([ROWS[2], ROWS[0], ROWS[1]]);
  assert.ok(g.selected()[0].textContent.includes('OhmWrecker'));
  assert.equal(g.options().indexOf(g.selected()[0]), 2);
});

// ---- P3: a selected live row stays a live mark ----

function classTokens(f, node) {
  return new Set(f.all(node).flatMap(inner => String(inner.className || '').split(/\s+/)).filter(token => token && !STATE_CLASS.test(token)));
}

// The compound selector a rule ends in, without pseudo-elements, and the classes it names.
function lastClasses(selector) {
  const last = selector.trim().split(/[\s>+~]+/).pop().replace(/::?(before|after)\b/g, '');
  return Array.from(last.matchAll(/\.([\w-]+)/g), match => match[1]);
}

test('P3. a selected live row keeps its live mark as a live mark: same classes, and no selected-state rule repaints its fill', () => {
  const f = pageFixture();
  f.suggest();
  f.deliver('suggestions-status', {status: {ohnepixel: true, ohmwrecker: false}});
  const selectedLive = classTokens(f, f.selected()[0]);
  f.press('ArrowDown');
  const [live, offline] = f.options();
  assert.deepEqual([...classTokens(f, live)].sort(), [...selectedLive].sort(), 'the live row has the same classes selected or not');
  const liveOnly = [...classTokens(f, live)].filter(token => !classTokens(f, offline).has(token));
  assert.ok(liveOnly.length > 0, 'the live row carries a class its offline neighbour does not');
  const fill = {};
  const repaint = [];
  for (const [, selectors, block] of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const selector of selectors.split(',')) {
      if (!lastClasses(selector).some(token => liveOnly.includes(token))) continue;
      const declared = Object.fromEntries(Array.from(block.matchAll(/([\w-]+)\s*:\s*([^;]+)/g), match => [match[1], match[2].trim()]));
      const value = declared.background ?? declared['background-color'];
      if (value === undefined) continue;
      if (/aria-selected|\.selected/.test(selector)) repaint.push({selector: selector.trim(), value});
      else fill.base = value;
    }
  }
  assert.ok(fill.base, 'the live mark has a fill when the row is not selected');
  assert.deepEqual(repaint.filter(rule => rule.value !== fill.base), [],
    'no rule for a selected row repaints the live mark (it would read as a plain dot)');
});

// ---- P4: one action to include who you follow (phase 3c, C3) ----
// Amended 2026-11-25 (phase 3c, TESTS-74): P4's quiet line "Sign in to Twitch again to include who you follow." is
// now a button, "Include who you follow" (C3, review P3-2: a note with no way to act was a dead end). It is still
// below the list, not a row, and skipped by the arrows; it is no longer role=note, since it is an action.

// Amended 2026-11-25 (lead, operator's second try, W-21): Open Stream is only the search field and its rows. The
// follows permission belongs to sign-in, where Twitch's own consent page already asks for it; the "Include who you
// follow" button, its code display and follows-open are removed. A needs-sign-in state shows nothing here.

const visibleButtons = f => f.visibleNodes().filter(node => node.tagName === 'BUTTON');

test('P4. suggestions-follows needs-sign-in shows nothing: no button, no code, no words about following', () => {
  const f = pageFixture();
  f.suggest();
  const before = visibleButtons(f).length;
  f.deliver('suggestions-follows', {state: 'needs-sign-in'});
  f.deliver('follows-code', {userCode: 'WXYZ-1234', verificationUri: 'https://www.twitch.tv/activate'});
  assert.equal(visibleButtons(f).length, before, 'no button appears');
  assert.equal(f.visibleNodes().filter(node => /follow/i.test(node.ownText || '')).length, 0, 'no text about following');
  assert.equal(f.visibleNodes().filter(node => (node.ownText || '').includes('WXYZ-1234')).length, 0, 'no code');
  assert.equal(f.options().length, 3, 'the rows are unchanged');
  for (const button of visibleButtons(f)) button.click();
  assert.deepEqual(f.posts('follows-connect'), [], 'nothing starts a sign-in from this window');
  assert.deepEqual(f.posts('follows-open'), []);
});

// ---- P5: details arrive in place ----

test('P5. details update the rows in place: the same elements, the same selection', () => {
  const f = pageFixture();
  f.suggest(P1_ROWS);
  const before = f.options();
  const selection = f.selected()[0];
  statusWithDetails(f, {quillfox: true, brindle: false, tidalmoss: null}, {
    quillfox: {title: 'Any% marathon, day 3', category: 'Hades', viewers: 12345},
    brindle: {lastAt: hoursAgo(2 * DAY + 1)},
  });
  const after = f.options();
  assert.equal(after.length, 3);
  after.forEach((option, index) => assert.equal(option, before[index], `row ${index + 1} is the same element`));
  assert.ok(after[0].textContent.includes('Hades'), 'the live row now shows its details');
  assert.ok(leafTexts(f, after[1]).includes('2d'), 'and the offline row its age');
  assert.equal(f.selected()[0], selection, 'the selection did not move');
  assert.equal(f.field.getAttribute('aria-activedescendant'), selection.id);
});

// My reading, not stated in the design: global sends details only with status, so a page that dropped them on
// every new list would blank the rows each time the person types.
test('P5b. details already received are still shown when a new list for the typed text arrives', () => {
  const f = pageFixture();
  f.suggest(P1_ROWS);
  statusWithDetails(f, {quillfox: true, brindle: false, tidalmoss: null}, {
    quillfox: {title: 'Any% marathon, day 3', category: 'Hades', viewers: 12345},
  });
  f.type('qu');
  f.suggest([P1_ROWS[0]], 'qu');
  assert.equal(f.options().length, 1);
  assert.ok(f.options()[0].textContent.includes('Hades'), 'the category is still on the row');
  assert.ok(leafTexts(f, f.options()[0]).includes('12.3K'));
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
  // Amended 2026-11-24 ~20:50 (lead, after the design review): whenever the list has people, the first is
  // selected, at rest and while typing, so Return opens the top match (mock A, and TESTS-74's native proof:
  // "Typing 'oh' puts Ohnepixel first. Return opens it."). The first ↓ moves to the second person.
  assert.deepEqual(f.selected(), [f.options()[0]], 'the first person is selected at rest');
  assert.equal(f.field.getAttribute('aria-activedescendant'), f.options()[0].id);
  f.type('o');
  f.suggest();
  assert.deepEqual(f.selected(), [f.options()[0]], 'the top match is selected while typing');
  assert.equal(f.press('ArrowDown'), true, 'ArrowDown does not move the caret');
  assert.deepEqual(f.selected(), [f.options()[1]], 'the first ↓ moves to the second person');
  assert.equal(f.field.getAttribute('aria-activedescendant'), f.options()[1].id);
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
  // Oh Baby's status is unknown, so Return runs today's open (the live check); an offline mark skips it (below).
  assert.deepEqual(f.posts('open-stream'), [{input: 'ohbaby'}], 'one open-stream, with the selected login');
});

test('12. Return: typing "oh" then Return opens the top match, not the typed text', () => {
  const f = pageFixture();
  f.type('oh');
  f.suggest(ROWS, 'oh');
  f.press('Enter');
  assert.deepEqual(f.posts('open-stream'), [{input: 'ohnepixel'}]);
});

test('12. Return: on a person marked offline it still runs the live check; an offline answer shows their broadcasts in the list', () => {
  // Lead, 2026-11-24 ~21:25, design review round 2 (R2-1): a mark can be up to a minute old (global's status
  // cache), so Return never trusts it: someone who just went live must open live. The check's offline answer
  // shows the broadcasts under the row (round 2's behaviour), so the mark only saves a request, and is not used.
  const f = pageFixture();
  f.suggest();
  f.deliver('suggestions-status', {status: {ohnepixel: true, ohmwrecker: false}});
  f.press('ArrowDown');
  f.press('Enter');
  assert.deepEqual(f.posts('open-stream'), [{input: 'ohmwrecker'}]);
  assert.deepEqual(f.posts('open-vods'), []);
});

test('12. Return: with text and no selection it posts today\'s open-stream {input: text}', () => {
  const f = pageFixture();
  // A pasted URL or a name nobody in history matches: global answers no rows, so nothing is selected.
  f.field.value = 'https://www.twitch.tv/someone';
  f.suggest([], 'https://www.twitch.tv/someone');
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

// Amended 2026-11-24 (lead, provisional): Tab is the Mac's focus key, so only ArrowRight opens broadcasts.
test('14. broadcasts: Tab on a selected row moves focus and posts nothing', () => {
  const f = pageFixture();
  f.suggest();
  f.press('ArrowDown');
  assert.equal(f.press('Tab'), false, 'Tab keeps its default (focus moves)');
  assert.deepEqual(f.posts('open-vods'), []);
});

for (const key of ['ArrowRight']) {
  test(`14. broadcasts: ${key} on a selected row posts open-vods {login}`, () => {
    const f = pageFixture();
    f.suggest();
    f.press('ArrowDown');
    f.press(key);
    assert.deepEqual(f.posts('open-vods'), [{login: 'ohmwrecker'}]);
  });
}

test('14. broadcasts: they render as the #32 list, and Escape returns to the suggestions with the person still selected', () => {
  const f = pageFixture();
  f.suggest();
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

// ---- Phase 3d (TESTS-74, 2026-11-25), D4: a Return before the first list is not lost ----
// The re-check (P3c-2): for up to 450 ms after the window opens there is no list, and Return fell through to a form
// that ignores an empty field, so the viewer who pressed the shortcut and Return at once got nothing.

test('D4. Return on an empty field before the first list waits for it, then opens the list\'s top row', () => {
  const f = pageFixture();
  assert.equal(f.options().length, 0, 'fixture: no list has arrived');
  f.press('Enter');
  assert.deepEqual(f.posts('open-stream'), [], 'nothing is opened with no list to open from');
  assert.equal(f.field.getAttribute('aria-invalid'), null, 'and the empty field is not flagged as an error');
  f.suggest();
  assert.deepEqual(f.posts('open-stream'), [{input: ROWS[0].login}], 'the list arrives: its top row opens, once');
  f.suggest(ROWS, '');
  assert.equal(f.posts('open-stream').length, 1, 'a later list does not open anything again');
});

test('D4. an empty answer to that Return opens nothing, and a later Return still works', () => {
  const f = pageFixture();
  f.press('Enter');
  f.suggest([], '');
  assert.deepEqual(f.posts('open-stream'), [], 'no rows: nothing to open');
  f.suggest(ROWS, '');
  assert.deepEqual(f.posts('open-stream'), [], 'the Return was answered; a list that comes later is not opened by it');
  f.press('Enter');
  assert.deepEqual(f.posts('open-stream'), [{input: ROWS[0].login}], 'a Return with a list on screen opens the top row, as before');
});

test('D4. Return with text in the field and no list yet submits the text', () => {
  const f = pageFixture();
  f.field.value = 'https://www.twitch.tv/someone';
  f.press('Enter');
  assert.deepEqual(f.posts('open-stream'), [{input: 'https://www.twitch.tv/someone'}], 'the text, at once, with no list');
  f.suggest(ROWS, '');
  assert.equal(f.posts('open-stream').length, 1, 'and the list that arrives later opens nothing more');
});

// =====================================================================================================================
// Phase 2 rev 2: search (TESTS-74 "Phase 2 rev 2: search", R1-R14; the lead's answers 2026-11-25). Written 2026-11-25.
// The page half: global sends `suggestions-search {text, known, others}` and `suggestions-search-pending {text,
// pending}` (R12); the fixtures are the chosen mock's frames, mock-74-search/index.html variant 1: (b) "ri" and (c)
// "glaze". The contract names no markup for the hairline, the dimming or the group names, so these tests read them
// through the hooks listed here, and the hand-back asks the lead to confirm them:
//   hairline: a non-option node inside the listbox with role=separator, tag HR, or a class token hair, hairline,
//     separator or divider;
//   dimmed: an offline option (live false) carries a class token dim, dimmed or offline; live and unknown rows carry none;
//   group name: aria-label, or the text of the element aria-labelledby names.
// The spinner is `#search-pending` inside the form, `hidden` when no request is out, and the listbox carries
// aria-busy="true" while one is (the lead's answer on R9).
// =====================================================================================================================

const hoursBack = hours => new Date(Date.now() - hours * 3600000).toISOString();
const sr = (login, displayName, live, details) => ({provider: 'twitch', login, displayName, live, ...(details ? {details} : {})});
const SR = {
  riverlark: sr('riverlark', 'Riverlark', true, {category: 'Outer Wilds', title: 'first time through, no spoilers', viewers: 2140}),
  rimecraft: sr('rimecraft', 'Rimecraft', false, {lastAt: hoursBack(48), lastTitle: 'Frostpunk 2, the long night'}),
  rivenshade: sr('rivenshade', 'RivenShade', true, {category: 'Valorant', title: 'ranked grind to radiant', viewers: 15400}),
  riptidejoe: sr('riptidejoe', 'riptidejoe', true, {category: 'Sea of Thieves', title: 'sloop life', viewers: 880}),
  rinnyruns: sr('rinnyruns', 'rinnyruns', false, {lastAt: hoursBack(96), lastTitle: 'knitting night'}),
  glazewright: sr('glazewright', 'Glazewright', true, {category: 'Makers & Crafting', title: 'throwing a tea set live', viewers: 3420}),
  glazedgourd: sr('glazedgourd', 'glazed_gourd', true, {category: 'Just Chatting', title: 'morning coffee', viewers: 190}),
  glazier9: sr('glazier9', 'glazier9', false, {lastAt: hoursBack(24 * 14), lastTitle: 'stained glass part 2'}),
};
// Y rows as `suggestions` sends them: identity and live only (details travel in suggestions-status).
const yRow = ({details, ...row}) => row;
const searchAnswer = (f, text, known, others) => f.deliver('suggestions-search', {text, known, others});
const searchPending = (f, text, pending) => f.deliver('suggestions-search-pending', {text, pending});
const loginsShown = f => f.options().map(option => option.getAttribute('id') && optionLogin(f, option));
// The login of a shown option, read from the way the page names its rows: the aria-label starts with the display name.
const NAME_TO_LOGIN = Object.fromEntries(Object.values(SR).map(row => [row.displayName, row.login]));
function optionLogin(f, option) {
  const label = String(attr(option, 'aria-label') ?? '');
  const name = Object.keys(NAME_TO_LOGIN).sort((a, b) => b.length - a.length).find(candidate => label.startsWith(candidate));
  return name ? NAME_TO_LOGIN[name] : label;
}

function classOf(node) {
  return String(node.className || '').split(/\s+/).filter(Boolean);
}

function hairlines(f) {
  const box = f.listbox();
  if (!box) return [];
  const inOption = new Set(f.options().flatMap(option => f.all(option)));
  return f.all(box).filter(node => node !== box && !inOption.has(node)
    && (attr(node, 'role') === 'separator' || node.tagName === 'HR'
      || classOf(node).some(token => /^(hair|hairline|separator|divider)$/.test(token))));
}

function groups(f) {
  const box = f.listbox();
  return box ? f.all(box).filter(node => attr(node, 'role') === 'group') : [];
}

function groupName(f, group) {
  const label = attr(group, 'aria-label');
  if (label) return label;
  const by = attr(group, 'aria-labelledby');
  const target = by && f.document.getElementById(by);
  return target ? target.textContent.trim() : null;
}

// Text a sighted viewer sees: every node's own text, except under a visually-hidden class.
function visibleText(f) {
  const walk = node => (node.hidden || classOf(node).includes('visually-hidden') ? '' : node.ownText + node.children.map(walk).join(' '));
  return walk(f.visibleNodes()[0]);
}

function frameB(f) {
  f.type('ri');
  f.suggest([yRow(SR.riverlark), yRow(SR.rimecraft)], 'ri');
  searchAnswer(f, 'ri', [], [SR.rivenshade, SR.riptidejoe, SR.rinnyruns]);
}

function frameC(f) {
  f.type('glaze');
  f.suggest([], 'glaze');
  searchAnswer(f, 'glaze', [], [SR.glazewright, SR.glazedgourd, SR.glazier9]);
}

test('R1/R13. frame (b) "ri": Y rows, a hairline, then O rows in the order global sent; the top Y row stays selected', () => {
  const f = pageFixture();
  frameB(f);
  assert.deepEqual(loginsShown(f), ['riverlark', 'rimecraft', 'rivenshade', 'riptidejoe', 'rinnyruns']);
  const lines = hairlines(f);
  assert.equal(lines.length, 1, 'one hairline');
  const order = f.all(f.listbox());
  const [line] = lines;
  assert.ok(order.indexOf(f.options()[1]) < order.indexOf(line) && order.indexOf(line) < order.indexOf(f.options()[2]),
    'the hairline sits between the last Y row and the first O row');
  assert.deepEqual(f.selected(), [f.options()[0]], 'the selection stays on the top Y row (R5)');
});

test('R1/R13. frame (c) "glaze": O rows only, no hairline, no group, and the first O row is selected as it is drawn', () => {
  const f = pageFixture();
  frameC(f);
  assert.deepEqual(loginsShown(f), ['glazewright', 'glazedgourd', 'glazier9']);
  assert.equal(hairlines(f).length, 0, 'the hairline is drawn only when both groups show');
  assert.equal(groups(f).length, 0, 'and so are the groups');
  assert.deepEqual(f.selected(), [f.options()[0]], 'R5(c): the first row is selected');
  assert.equal(f.field.getAttribute('aria-activedescendant'), f.options()[0].id);
  f.press('Enter');
  assert.deepEqual(f.posts('open-stream'), [{input: 'glazewright'}], 'Return opens it');
});

test('R1/R13. Y alone (an answer with nothing to add) shows no hairline and no groups; known people alone are appended to Y', () => {
  const f = pageFixture();
  f.type('ri');
  f.suggest([yRow(SR.riverlark)], 'ri');
  searchAnswer(f, 'ri', [], []);
  assert.deepEqual(loginsShown(f), ['riverlark']);
  assert.equal(hairlines(f).length, 0);
  assert.equal(groups(f).length, 0);
  searchAnswer(f, 'ri', [SR.rimecraft], []);
  assert.deepEqual(loginsShown(f), ['riverlark', 'rimecraft'], 'known people are appended to Y');
  assert.equal(hairlines(f).length, 0, 'with no O there is no hairline');
  assert.equal(groups(f).length, 0, 'and no groups');
});

test('R1. known people the search found sit at the end of Y, above the hairline, in the same paint as O', () => {
  const f = pageFixture();
  f.type('ri');
  f.suggest([yRow(SR.riverlark)], 'ri');
  searchAnswer(f, 'ri', [SR.rimecraft], [SR.rivenshade]);
  assert.deepEqual(loginsShown(f), ['riverlark', 'rimecraft', 'rivenshade']);
  const order = f.all(f.listbox());
  const [line] = hairlines(f);
  assert.ok(line, 'a hairline');
  assert.ok(order.indexOf(f.options()[1]) < order.indexOf(line) && order.indexOf(line) < order.indexOf(f.options()[2]));
  const [yGroup, oGroup] = groups(f);
  assert.equal(attr(f.options()[1], 'aria-setsize'), '2', 'Y counts the appended person');
  assert.ok(f.all(yGroup).includes(f.options()[1]) && f.all(oGroup).includes(f.options()[2]));
});

test('R10. with both groups: two role=group inside the listbox named "Your channels" and "Other channels", counted within each', () => {
  const f = pageFixture();
  frameB(f);
  const found = groups(f);
  assert.equal(found.length, 2, 'two groups');
  assert.deepEqual(found.map(group => groupName(f, group)), ['Your channels', 'Other channels']);
  const [yGroup, oGroup] = found;
  const inY = f.all(yGroup).filter(node => attr(node, 'role') === 'option');
  const inO = f.all(oGroup).filter(node => attr(node, 'role') === 'option');
  assert.deepEqual(inY.map(option => optionLogin(f, option)), ['riverlark', 'rimecraft']);
  assert.deepEqual(inO.map(option => optionLogin(f, option)), ['rivenshade', 'riptidejoe', 'rinnyruns']);
  inY.forEach((option, index) => {
    assert.equal(attr(option, 'aria-posinset'), String(index + 1));
    assert.equal(attr(option, 'aria-setsize'), '2');
  });
  inO.forEach((option, index) => {
    assert.equal(attr(option, 'aria-posinset'), String(index + 1));
    assert.equal(attr(option, 'aria-setsize'), '3');
  });
  assert.ok(!/Your channels|Other channels/.test(visibleText(f)), 'the names are not visible words');
});

test('R10. with one group (Y alone, or O alone) there are no groups and the whole list is one set', () => {
  const y = pageFixture();
  y.type('ri');
  y.suggest([yRow(SR.riverlark), yRow(SR.rimecraft)], 'ri');
  assert.equal(groups(y).length, 0);
  assert.equal(attr(y.options()[0], 'aria-setsize'), '2');
  const o = pageFixture();
  frameC(o);
  assert.equal(o.options().length, 3, 'fixture: the three O rows are drawn');
  assert.equal(groups(o).length, 0);
  assert.equal(attr(o.options()[2], 'aria-setsize'), '3');
  assert.equal(attr(o.options()[2], 'aria-posinset'), '3');
});

test('R13. offline rows are dimmed, in Y and in O; live rows and rows with unknown status are not', () => {
  const f = pageFixture();
  f.type('ri');
  f.suggest([yRow(SR.riverlark), yRow(SR.rimecraft), {...yRow(SR.riverlark), login: 'unsure', displayName: 'Unsure', live: null}], 'ri');
  searchAnswer(f, 'ri', [], [SR.rivenshade, SR.rinnyruns]);
  const dimmed = option => classOf(option).some(token => /^(dim|dimmed|offline)$/.test(token));
  const byName = Object.fromEntries(f.options().map(option => [attr(option, 'aria-label').split(',')[0], option]));
  assert.ok(dimmed(byName.Rimecraft), 'offline in Y');
  assert.ok(dimmed(byName.rinnyruns), 'offline in O');
  assert.ok(!dimmed(byName.Riverlark), 'live in Y');
  assert.ok(!dimmed(byName.RivenShade), 'live in O');
  assert.ok(!dimmed(byName.Unsure), 'unknown status in Y is not dimmed');
});

test('R12/R13. O rows read from the row itself: live shows category, title and viewers; offline shows last title and age', () => {
  const f = pageFixture();
  frameB(f);
  const [, , riven, , inny] = f.options();
  const live = leafTexts(f, riven);
  assert.ok(live.includes('Valorant · ranked grind to radiant'), `live second line: ${JSON.stringify(live)}`);
  assert.ok(live.includes('15.4K'), 'viewers, compact');
  const offline = leafTexts(f, inny);
  assert.ok(offline.includes('knitting night'), `offline second line: ${JSON.stringify(offline)}`);
  assert.ok(offline.includes('4d'), 'offline age');
  assert.ok(String(attr(riven, 'aria-label')).includes('live'), 'spoken name says live');
});

test('R5. O arriving leaves the selection where it is: on the top Y row, or, after an arrow key, on the row the person chose', () => {
  const a = pageFixture();
  a.type('ri');
  a.suggest([yRow(SR.riverlark), yRow(SR.rimecraft)], 'ri');
  searchAnswer(a, 'ri', [], [SR.rivenshade]);
  assert.equal(a.options().length, 3, 'fixture: the O row is drawn');
  assert.deepEqual(a.selected().map(option => optionLogin(a, option)), ['riverlark']);
  const b = pageFixture();
  b.type('ri');
  b.suggest([yRow(SR.riverlark), yRow(SR.rimecraft)], 'ri');
  b.press('ArrowDown');
  searchAnswer(b, 'ri', [], [SR.rivenshade]);
  assert.equal(b.options().length, 3, 'fixture: the O row is drawn');
  assert.deepEqual(b.selected().map(option => optionLogin(b, option)), ['rimecraft'], 'by identity after the person moved');
});

test('R5(c). Return opens the selected O row: after arrowing from Y into O, and for the first O row when Y is empty', () => {
  const f = pageFixture();
  frameB(f);
  f.press('ArrowDown');
  f.press('ArrowDown');
  assert.deepEqual(f.selected().map(option => optionLogin(f, option)), ['rivenshade'], 'arrows move across the hairline');
  f.press('Enter');
  assert.deepEqual(f.posts('open-stream'), [{input: 'rivenshade'}]);
});

test('R5(b). Y empty and no O drawn: Return opens the typed text as a channel, and does not wait for O or open a result', () => {
  const f = pageFixture();
  f.type('glaze');
  f.suggest([], 'glaze');
  searchPending(f, 'glaze', true);
  f.press('Enter');
  assert.deepEqual(f.posts('open-stream'), [{input: 'glaze'}]);
});

test('R6. a keystroke removes the old text\'s O rows and appended known rows at once; Y\'s own rows stay until the new list', () => {
  const f = pageFixture();
  f.type('ri');
  f.suggest([yRow(SR.riverlark)], 'ri');
  searchAnswer(f, 'ri', [SR.rimecraft], [SR.rivenshade, SR.riptidejoe]);
  assert.equal(f.options().length, 4, 'fixture: Y, an appended known row and two O rows');
  f.type('riv');
  assert.deepEqual(loginsShown(f), ['riverlark'], 'only Y\'s own row is left, before any new list arrives');
  assert.equal(hairlines(f).length, 0);
  assert.equal(groups(f).length, 0);
  f.suggest([yRow(SR.riverlark)], 'riv');
  assert.deepEqual(loginsShown(f), ['riverlark']);
});

test('R6. an O row that was selected is not selectable after a keystroke (frame c, then one more letter)', () => {
  const f = pageFixture();
  frameC(f);
  assert.equal(f.selected().length, 1, 'fixture: the first O row is selected');
  f.type('glazew');
  assert.equal(f.options().length, 0, 'the O rows are gone');
  assert.equal(f.selected().length, 0);
  assert.equal(f.field.getAttribute('aria-activedescendant'), null);
});

test('R7. an answer whose text differs from the field (trimmed, case-insensitive) is dropped; one that matches is drawn', () => {
  const stale = pageFixture();
  stale.type('rix');
  stale.suggest([yRow(SR.riverlark)], 'rix');
  searchAnswer(stale, 'ri', [SR.rimecraft], [SR.rivenshade]);
  assert.deepEqual(loginsShown(stale), ['riverlark'], 'an answer for "ri" does not paint under "rix"');
  assert.equal(hairlines(stale).length, 0);
  const empty = pageFixture();
  empty.suggest([yRow(SR.riverlark)], '');
  searchAnswer(empty, 'ri', [], [SR.rivenshade]);
  assert.deepEqual(loginsShown(empty), ['riverlark'], 'nor under an empty field');
  const same = pageFixture();
  same.type(' RI ');
  same.suggest([yRow(SR.riverlark)], ' RI ');
  searchAnswer(same, 'ri', [], [SR.rivenshade]);
  assert.deepEqual(loginsShown(same), ['riverlark', 'rivenshade'], 'same text after trimming and lower-casing');
});

test('R9. the spinner #search-pending is hidden at rest, shows while a request for the field\'s text is out, and has no words', () => {
  const f = pageFixture();
  const spinner = f.document.getElementById('search-pending');
  assert.ok(spinner, 'an element #search-pending');
  assert.ok(f.all(f.form).includes(spinner), 'at the trailing end of the field: inside the form');
  assert.equal(isVisible(f, spinner), false, 'hidden at rest');
  f.type('ri');
  f.suggest([yRow(SR.riverlark)], 'ri');
  searchPending(f, 'ri', true);
  assert.equal(isVisible(f, spinner), true, 'shown while the request is out');
  assert.equal(attr(f.listbox(), 'aria-busy'), 'true', 'the listbox is busy');
  assert.equal(spinner.textContent.trim(), '', 'a signifier, not words');
  searchPending(f, 'ri', false);
  assert.equal(isVisible(f, spinner), false, 'gone when it ends');
  assert.notEqual(attr(f.listbox(), 'aria-busy'), 'true');
  assert.deepEqual(loginsShown(f), ['riverlark'], 'and nothing else changed');
});

test('R9. a pending message for other text than the field\'s is ignored, whether it starts or ends a request', () => {
  const f = pageFixture();
  const spinner = f.document.getElementById('search-pending');
  assert.ok(spinner, 'an element #search-pending');
  f.type('ri');
  f.suggest([yRow(SR.riverlark)], 'ri');
  searchPending(f, 'rx', true);
  assert.equal(isVisible(f, spinner), false, 'a start for another text does not show it');
  searchPending(f, 'ri', true);
  searchPending(f, 'r', false);
  assert.equal(isVisible(f, spinner), true, 'an end for another text does not hide it');
});

test('R10. O arriving is announced only if the selection moves: not under a selected Y row, yes when it selects the first O row', () => {
  const a = pageFixture();
  a.type('ri');
  a.suggest([yRow(SR.riverlark), yRow(SR.rimecraft)], 'ri');
  const announcer = a.document.getElementById('announce');
  const before = announcer.textContent;
  searchAnswer(a, 'ri', [], [SR.rivenshade]);
  assert.equal(announcer.textContent, before, 'Y has a selected row: nothing is announced');
  const b = pageFixture();
  b.type('glaze');
  b.suggest([], 'glaze');
  searchAnswer(b, 'glaze', [], [SR.glazewright]);
  assert.ok(b.document.getElementById('announce').textContent.includes('Glazewright'), 'the selection moved: it is announced');
});

// ---- Follow-ups on the page build (cbbbd9b), TESTS-74 "Rev 2 build notes", 2026-11-25 ----

test('R5(b)+. Y empty, a typed Return is pending, then O arrives: nothing is selected, and a second Return does not open the new first row', () => {
  const f = pageFixture();
  f.type('glaze');
  f.suggest([], 'glaze');
  f.press('Enter');
  assert.deepEqual(f.posts('open-stream'), [{input: 'glaze'}], 'fixture: the typed text was submitted');
  searchAnswer(f, 'glaze', [], [SR.glazewright, SR.glazedgourd]);
  assert.equal(f.options().length, 2, 'fixture: the O rows are drawn');
  assert.equal(f.selected().length, 0, 'nothing is selected');
  assert.equal(f.field.getAttribute('aria-activedescendant'), null);
  f.press('Enter');
  assert.deepEqual(f.posts('open-stream'), [{input: 'glaze'}], 'a second Return opens nothing new');
});

test('R5(b)+. Y empty while the broadcasts list (#32) shows, O arrives: nothing is selected', () => {
  const f = pageFixture();
  f.type('glaze');
  f.suggest([], 'glaze');
  f.press('Enter');
  f.vods({state: 'ready', items: [VOD]});
  assert.ok(f.visibleNodes().find(node => node.ownText.includes(VOD.title)), 'fixture: the broadcasts list shows');
  searchAnswer(f, 'glaze', [], [SR.glazewright, SR.glazedgourd]);
  assert.equal(f.selected().length, 0, 'nothing is selected under the broadcasts list');
  assert.equal(f.field.getAttribute('aria-activedescendant'), null);
});

test('D2/R8. a list re-sent for the same text after search drew known rows puts late follows below them; no shown row moves', () => {
  const f = pageFixture();
  f.type('ri');
  f.suggest([yRow(SR.riverlark)], 'ri');
  searchAnswer(f, 'ri', [SR.rimecraft], []);
  assert.deepEqual(loginsShown(f), ['riverlark', 'rimecraft'], 'fixture: Y, then a known row');
  f.suggest([yRow(SR.riverlark), yRow(SR.rivenshade)], 'ri');
  assert.deepEqual(loginsShown(f), ['riverlark', 'rimecraft', 'rivenshade'], 'the late follow goes below the known row');
  f.suggest([yRow(SR.riverlark), yRow(SR.rimecraft), yRow(SR.rivenshade)], 'ri');
  assert.deepEqual(loginsShown(f), ['riverlark', 'rimecraft', 'rivenshade'], 'a known person re-sent is shown once, in place');
});

test('R8. with O drawn, a re-sent list adds no follow above the hairline: rows already shown never move', () => {
  const f = pageFixture();
  f.type('ri');
  f.suggest([yRow(SR.riverlark)], 'ri');
  searchAnswer(f, 'ri', [], [SR.rivenshade, SR.riptidejoe]);
  assert.deepEqual(loginsShown(f), ['riverlark', 'rivenshade', 'riptidejoe'], 'fixture: O is drawn');
  f.suggest([yRow(SR.riverlark), yRow(SR.rimecraft)], 'ri');
  assert.deepEqual(loginsShown(f), ['riverlark', 'rivenshade', 'riptidejoe'], 'the late follow (rimecraft) is held');
  assert.equal(hairlines(f).length, 1);
  f.type('rim');
  f.suggest([yRow(SR.rimecraft)], 'rim');
  assert.deepEqual(loginsShown(f), ['rimecraft'], 'the next text lists the follow');
});

test('R8. a person drawn in O stays there when a re-sent list for the same text now lists them as a follow', () => {
  const f = pageFixture();
  f.type('ri');
  f.suggest([yRow(SR.riverlark)], 'ri');
  searchAnswer(f, 'ri', [], [SR.rivenshade, SR.riptidejoe]);
  f.suggest([yRow(SR.riverlark), yRow(SR.rivenshade)], 'ri');
  assert.deepEqual(loginsShown(f), ['riverlark', 'rivenshade', 'riptidejoe'], 'shown once, still in O');
  const [yGroup, oGroup] = groups(f);
  assert.ok(f.all(oGroup).includes(f.options()[1]) && !f.all(yGroup).includes(f.options()[1]));
});
