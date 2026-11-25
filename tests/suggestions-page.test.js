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

// Fake timers for the vm, only when asked for (Rev 2 page round 3, P-D): the page then sees setTimeout and clearTimeout.
function fakeTimers() {
  let now = 0, nextId = 1;
  const pending = new Map();
  return {
    setTimeout(fn, delay = 0) { const id = nextId++; pending.set(id, {fn, due: now + Number(delay)}); return id; },
    clearTimeout(id) { pending.delete(id); },
    advance(ms) {
      const target = now + ms;
      for (;;) {
        const next = [...pending.entries()].filter(([, t]) => t.due <= target).sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
        if (!next) break;
        now = Math.max(now, next[1].due);
        pending.delete(next[0]);
        next[1].fn();
      }
      now = target;
    },
  };
}

function pageFixture(config = {}) {
  const timers = config.timers ? fakeTimers() : null;
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
  vm.runInNewContext(SCRIPT, {document, window: {addEventListener() {}}, iina: page.iina,
    ...(timers ? {setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout} : {})}, {filename: 'open.js'});

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
    page, field, form, press, deliver, suggest, vods, posts, listbox, options, selected, type, timers,
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
  // Amended 2026-11-25 (phase 2 rev 3, TESTS-74, O2): it no longer does; an offline row shows no title text.
  assert.ok(!leafTexts(f, two).includes('Rhythm game requests'), 'no last broadcast title on an offline row');
  assert.ok(leafTexts(f, two).includes('2d'), 'two days ago is 2d');
  assert.ok(leafTexts(f, three).includes('3w'), 'three weeks ago is 3w');
  for (const row of [two, three]) {
    assert.ok(f.all(row).some(node => /disclos|chev/i.test(String(node.className))), 'the broadcasts chevron');
  }
  // Amended 2026-11-25 (phase 2 rev 3, TESTS-74, O2): the last title is no longer one of the pieces.
  assert.equal(leftover(f, two, ['2d', 'Brindle', 'B']), '', 'name and age, nothing else (the last title is not shown)');
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
  // Names the step-back tests use (B2, B3).
  rip: sr('rip', 'rip', false), rivulet: sr('rivulet', 'Rivulet', true), rivendell: sr('rivendell', 'Rivendell', true),
};
// Y rows as `suggestions` sends them: identity and live only (details travel in suggestions-status).
const yRow = ({details, ...row}) => row;
const searchAnswer = (f, text, known, others) => f.deliver('suggestions-search', {text, known, others});
const searchPending = (f, text, pending) => f.deliver('suggestions-search-pending', {text, pending});
const loginsShown = f => f.options().map(option => option.getAttribute('id') && optionLogin(f, option));
// The login of a shown option, read from the way the page names its rows: the aria-label starts with the display name.
const NAME_TO_LOGIN = Object.fromEntries(Object.values(SR).map(row => [row.displayName, row.login]));
// Amended 2026-11-25 (lead; the page builder found the gap): names used only by the P-B tests.
Object.assign(NAME_TO_LOGIN, {'Rivendell': 'rivendell', 'Tidal Wave': 'xk1'});
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

// Amended 2026-11-25 (phase 2 rev 3, TESTS-74, O2): offline rows show name and age, no title.
test('R12/R13/O2. O rows read from the row itself: live shows category, title and viewers; offline shows age and no title', () => {
  const f = pageFixture();
  frameB(f);
  const [, , riven, , inny] = f.options();
  const live = leafTexts(f, riven);
  assert.ok(live.includes('Valorant · ranked grind to radiant'), `live second line: ${JSON.stringify(live)}`);
  assert.ok(live.includes('15.4K'), 'viewers, compact');
  const offline = leafTexts(f, inny);
  assert.ok(!offline.includes('knitting night'), `offline row has no title: ${JSON.stringify(offline)}`);
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

// Amended 2026-11-25 (page round 3, P-B, TESTS-74): O rows that still match the new text now stay (tested in P-B below),
// so these two R6 tests type a text that matches no drawn O row ('rix', 'glazx'); known rows still go at the keystroke.
test('R6. a keystroke removes the old text\'s O rows and appended known rows at once; Y\'s own rows stay until the new list', () => {
  const f = pageFixture();
  f.type('ri');
  f.suggest([yRow(SR.riverlark)], 'ri');
  searchAnswer(f, 'ri', [SR.rimecraft], [SR.rivenshade, SR.riptidejoe]);
  assert.equal(f.options().length, 4, 'fixture: Y, an appended known row and two O rows');
  f.type('rix');
  assert.deepEqual(loginsShown(f), ['riverlark'], 'only Y\'s own row is left, before any new list arrives');
  assert.equal(hairlines(f).length, 0);
  assert.equal(groups(f).length, 0);
  f.suggest([yRow(SR.riverlark)], 'rix');
  assert.deepEqual(loginsShown(f), ['riverlark']);
});

test('R6. an O row that was selected is not selectable after a keystroke (frame c, then one more letter)', () => {
  const f = pageFixture();
  frameC(f);
  assert.equal(f.selected().length, 1, 'fixture: the first O row is selected');
  f.type('glazx');
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

// Amended 2026-11-25 (page round 3, P-D, TESTS-74): the spinner shows only once a request has been out 150 ms, so the
// two R9 tests run on fake timers and let 150 ms pass; the delay itself is tested under P-D.
test('R9. the spinner #search-pending is hidden at rest, shows while a request for the field\'s text is out, and has no words', () => {
  const f = pageFixture({timers: true});
  const spinner = f.document.getElementById('search-pending');
  assert.ok(spinner, 'an element #search-pending');
  assert.ok(f.all(f.form).includes(spinner), 'at the trailing end of the field: inside the form');
  assert.equal(isVisible(f, spinner), false, 'hidden at rest');
  f.type('ri');
  f.suggest([yRow(SR.riverlark)], 'ri');
  searchPending(f, 'ri', true);
  f.timers.advance(150);
  assert.equal(isVisible(f, spinner), true, 'shown while the request is out');
  assert.equal(attr(f.listbox(), 'aria-busy'), 'true', 'the listbox is busy');
  assert.equal(spinner.textContent.trim(), '', 'a signifier, not words');
  searchPending(f, 'ri', false);
  assert.equal(isVisible(f, spinner), false, 'gone when it ends');
  assert.notEqual(attr(f.listbox(), 'aria-busy'), 'true');
  assert.deepEqual(loginsShown(f), ['riverlark'], 'and nothing else changed');
});

test('R9. a pending message for other text than the field\'s is ignored, whether it starts or ends a request', () => {
  const f = pageFixture({timers: true});
  const spinner = f.document.getElementById('search-pending');
  assert.ok(spinner, 'an element #search-pending');
  f.type('ri');
  f.suggest([yRow(SR.riverlark)], 'ri');
  searchPending(f, 'rx', true);
  f.timers.advance(150);
  assert.equal(isVisible(f, spinner), false, 'a start for another text does not show it');
  searchPending(f, 'ri', true);
  f.timers.advance(150);
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

// ---- F2 page side (TESTS-74, backend review fix F2, 2026-11-25) ----

test('F2. an edit that leaves the trimmed, lower-cased text unchanged keeps the drawn search rows and the selection', () => {
  for (const edit of ['ri ', 'RI', ' Ri ']) {
    const f = pageFixture();
    frameB(f);
    f.press('ArrowDown');
    assert.deepEqual(f.selected().map(option => optionLogin(f, option)), ['rimecraft'], 'fixture: the person moved to the second row');
    f.type(edit);
    assert.deepEqual(loginsShown(f), ['riverlark', 'rimecraft', 'rivenshade', 'riptidejoe', 'rinnyruns'], `"${edit}": rows kept at once`);
    assert.equal(hairlines(f).length, 1, 'the hairline stays');
    assert.deepEqual(f.selected().map(option => optionLogin(f, option)), ['rimecraft'], 'and so does the selection');
    f.suggest([yRow(SR.riverlark), yRow(SR.rimecraft)], edit);
    assert.deepEqual(loginsShown(f), ['riverlark', 'rimecraft', 'rivenshade', 'riptidejoe', 'rinnyruns'], 'still kept when the list for it arrives');
    assert.deepEqual(f.selected().map(option => optionLogin(f, option)), ['rimecraft']);
  }
});

// F4 protocol (TESTS-74, lead, 2026-11-25): `suggestions {text, rows, reset:true}` for the same text drops every drawn
// search row (known and others) and draws the new Y; without `reset` a re-sent list never moves drawn rows (R8).
test('F4 protocol. suggestions with reset:true for the same text removes the drawn search rows and draws the new Y; the next answer draws fresh', () => {
  const f = pageFixture();
  f.type('ri');
  f.suggest([yRow(SR.riverlark)], 'ri');
  searchAnswer(f, 'ri', [SR.rimecraft], [SR.rivenshade, SR.riptidejoe]);
  assert.deepEqual(loginsShown(f), ['riverlark', 'rimecraft', 'rivenshade', 'riptidejoe'], 'fixture: known and O are drawn');
  f.deliver('suggestions', {text: 'ri', rows: [yRow(SR.riverlark), yRow(SR.rimecraft), yRow(SR.rinnyruns)], reset: true});
  assert.deepEqual(loginsShown(f), ['riverlark', 'rimecraft', 'rinnyruns'], 'only the new Y is drawn');
  assert.equal(hairlines(f).length, 0, 'no hairline without O');
  assert.equal(groups(f).length, 0);
  searchAnswer(f, 'ri', [], [SR.rivenshade, SR.riptidejoe]);
  assert.deepEqual(loginsShown(f), ['riverlark', 'rimecraft', 'rinnyruns', 'rivenshade', 'riptidejoe'], 'the next answer draws fresh');
  assert.equal(hairlines(f).length, 1);
});

test('F4 protocol. the same re-sent list without reset keeps the drawn search rows (R8)', () => {
  const f = pageFixture();
  f.type('ri');
  f.suggest([yRow(SR.riverlark)], 'ri');
  searchAnswer(f, 'ri', [SR.rimecraft], [SR.rivenshade, SR.riptidejoe]);
  f.deliver('suggestions', {text: 'ri', rows: [yRow(SR.riverlark), yRow(SR.rimecraft), yRow(SR.rinnyruns)]});
  assert.ok(loginsShown(f).includes('rivenshade') && loginsShown(f).includes('riptidejoe'), 'O rows stay');
  assert.deepEqual(loginsShown(f).slice(0, 2), ['riverlark', 'rimecraft'], 'Y rows already shown do not move');
});

// =====================================================================================================================
// Rev 2 page round 3 (TESTS-74, lead 2026-11-25 ~03:25, from the independent design review): P-A, P-B, P-C, P-D and N3.
// The contract names no markup for the typed-name row, so P-A reads it as the only option on the list: its leaf texts are
// exactly the typed text (name only, no avatar letter, no age, no detail), no .mark element, selected.
// =====================================================================================================================

const leafTextsOf = (f, option) => leafTexts(f, option);
const hasMark = (f, option) => f.all(option).some(node => classOf(node).includes('mark'));

// ---- P-A: a name nobody matches shows itself ----

test('P-A. Y empty and the search answered with nothing: one row with the typed text, name only, no live mark, selected; Return opens it', () => {
  const f = pageFixture();
  f.type('zzq');
  f.suggest([], 'zzq');
  searchPending(f, 'zzq', true);
  searchPending(f, 'zzq', false);
  searchAnswer(f, 'zzq', [], []);
  assert.equal(f.options().length, 1, 'one row');
  const [row] = f.options();
  assert.deepEqual(leafTextsOf(f, row), ['zzq'], 'the typed text as a name, nothing else (the Twitch mark carries no text)');
  assert.equal(hasMark(f, row), false, 'no live mark');
  assert.deepEqual(f.selected(), [row], 'selected');
  f.press('Enter');
  assert.deepEqual(f.posts('open-stream'), [{input: 'zzq'}], 'Return opens it as a channel');
});

test('P-A. text the search is never sent (R4), with Y empty: the same single row, and Return opens it', () => {
  for (const text of ['zq.tv', 'zq/clips', 'https://zq.example/a?b=c']) {
    const f = pageFixture();
    f.type(text);
    f.suggest([], text);
    assert.equal(f.options().length, 1, `"${text}": one row`);
    assert.deepEqual(leafTextsOf(f, f.options()[0]), [text], 'the typed text only');
    assert.deepEqual(f.selected(), [f.options()[0]]);
    f.press('Enter');
    assert.deepEqual(f.posts('open-stream'), [{input: text}]);
  }
});

// Amended 2026-11-25 (step-back, P-A′, TESTS-74): the typed-name row also shows while a search is pending (it is what
// Return opens at that moment) and is replaced when selectable results land (I1's exception: it is a placeholder).
test('P-A′. the typed-name row shows while a search is pending, is selected, and gives way to results; none when Y or O has rows', () => {
  const pending = pageFixture();
  pending.type('zzq');
  pending.suggest([], 'zzq');
  searchPending(pending, 'zzq', true);
  assert.equal(pending.options().length, 1, 'pending: the typed-name row shows');
  assert.deepEqual(leafTextsOf(pending, pending.options()[0]), ['zzq']);
  assert.deepEqual(pending.selected(), [pending.options()[0]], 'and is selected');
  pending.press('Enter');
  assert.deepEqual(pending.posts('open-stream'), [{input: 'zzq'}], 'Return opens the typed text, never a result not yet seen');
  const landing = pageFixture();
  landing.type('glaze');
  landing.suggest([], 'glaze');
  searchPending(landing, 'glaze', true);
  searchAnswer(landing, 'glaze', [], [SR.glazewright, SR.glazedgourd]);
  assert.deepEqual(loginsShown(landing), ['glazewright', 'glazedgourd'], 'results replace the placeholder');
  assert.deepEqual(landing.selected().map(option => optionLogin(landing, option)), ['glazewright'], 'and the first result is selected');
  const withY = pageFixture();
  withY.type('ri');
  withY.suggest([yRow(SR.riverlark)], 'ri');
  searchAnswer(withY, 'ri', [], []);
  assert.deepEqual(loginsShown(withY), ['riverlark'], 'Y has rows: no typed row');
  const withO = pageFixture();
  frameC(withO);
  assert.deepEqual(loginsShown(withO), ['glazewright', 'glazedgourd', 'glazier9'], 'O has rows: no typed row');
  const known = pageFixture();
  known.type('ri');
  known.suggest([], 'ri');
  searchAnswer(known, 'ri', [SR.rimecraft], []);
  assert.deepEqual(loginsShown(known), ['rimecraft'], 'known rows count as rows: no typed row');
});

// ---- P-B: other channels don't blink ----

const matchRow = (login, displayName, live = true) => ({provider: 'twitch', login, displayName, live});

test('P-B. a keystroke keeps drawn O rows whose login or display name still matches the new text, drops the rest', () => {
  const f = pageFixture();
  f.type('ri');
  f.suggest([yRow(SR.riverlark)], 'ri');
  const tidal = matchRow('xk1', 'Tidal Wave');
  searchAnswer(f, 'ri', [], [SR.rivenshade, SR.riptidejoe, SR.rinnyruns, tidal]);
  f.type('riv');
  assert.deepEqual(loginsShown(f), ['riverlark', 'rivenshade'], 'login prefix kept, the rest dropped');
  f.type('RIP');
  assert.deepEqual(loginsShown(f), ['riverlark', 'riptidejoe'], 'case-insensitive');
  f.type('wav');
  assert.ok(loginsShown(f).includes('xk1'), 'a word of the display name that starts with the text is a match');
  assert.ok(!loginsShown(f).includes('riptidejoe'));
});

// Amended 2026-11-25 (step-back, P-B′, TESTS-74): kept O rows are shown but not selectable until the answer for the
// current text lands: arrows, the pointer and Return skip them. This replaces "kept rows stay selectable".
test('P-B′. kept O rows are shown but arrows, the pointer and Return skip them; the hairline stays', () => {
  const f = pageFixture();
  f.type('ri');
  f.suggest([yRow(SR.riverlark)], 'ri');
  searchAnswer(f, 'ri', [], [SR.rivenshade, SR.riptidejoe]);
  f.type('riv');
  f.suggest([yRow(SR.riverlark)], 'riv');
  assert.deepEqual(loginsShown(f), ['riverlark', 'rivenshade'], 'fixture: rivenshade is kept');
  assert.equal(hairlines(f).length, 1, 'the hairline stays');
  assert.deepEqual(f.selected().map(option => optionLogin(f, option)), ['riverlark'], 'the top row is selected');
  f.press('ArrowDown');
  assert.deepEqual(f.selected().map(option => optionLogin(f, option)), ['riverlark'], 'ArrowDown skips the kept row');
  f.options()[1].click();
  assert.deepEqual(f.posts('open-stream'), [], 'a click on a kept row opens nothing');
  assert.deepEqual(f.selected().map(option => optionLogin(f, option)), ['riverlark'], 'and selects nothing');
  f.press('Enter');
  assert.deepEqual(f.posts('open-stream'), [{input: 'riverlark'}], 'Return opens the selected row');
});

test('P-B′. with nothing selectable but a kept row, Return opens the typed text, never the kept row (B2)', () => {
  const f = pageFixture();
  f.type('ri');
  f.suggest([yRow(SR.riverlark)], 'ri');
  searchAnswer(f, 'ri', [], [SR.rivenshade, SR.riptidejoe]);
  f.type('rip');
  f.suggest([], 'rip');
  assert.ok(loginsShown(f).includes('riptidejoe'), 'fixture: riptidejoe is kept');
  assert.ok(!f.selected().some(option => optionLogin(f, option) === 'riptidejoe'), 'the kept row is not selected');
  f.press('Enter');
  assert.deepEqual(f.posts('open-stream'), [{input: 'rip'}]);
});

test('P-B′. B2: the exact match lands above a kept row: the first selectable row, not the kept one, is selected', () => {
  const f = pageFixture();
  f.type('ri');
  f.suggest([yRow(SR.riverlark)], 'ri');
  searchAnswer(f, 'ri', [], [SR.rivenshade, SR.riptidejoe]);
  f.type('rip');
  f.suggest([], 'rip');
  searchAnswer(f, 'rip', [], [SR.rip, SR.riptidejoe]);
  assert.deepEqual(loginsShown(f), ['rip', 'riptidejoe'], 'the answer replaces the kept rows in its order');
  assert.deepEqual(f.selected().map(option => optionLogin(f, option)), ['rip'], 'the exact match is selected');
});

test('P-B′. B3: arrows never land on a kept row, so a row the person picked is never removed by the answer', () => {
  const rivulet = SR.rivulet;
  const f = pageFixture();
  f.type('ri');
  f.suggest([yRow(SR.riverlark)], 'ri');
  searchAnswer(f, 'ri', [], [SR.rivenshade, rivulet]);
  f.type('riv');
  f.suggest([yRow(SR.riverlark)], 'riv');
  f.press('ArrowDown');
  f.press('ArrowDown');
  assert.deepEqual(f.selected().map(option => optionLogin(f, option)), ['riverlark'], 'the selection never reaches the kept rows');
  searchAnswer(f, 'riv', [], [SR.rivenshade]);
  assert.deepEqual(f.selected().map(option => optionLogin(f, option)), ['riverlark'], 'the answer drops Rivulet; the selection stays');
  assert.deepEqual(loginsShown(f), ['riverlark', 'rivenshade']);
});

test('P-B′. when the answer lands the selection stays on a selectable row; with none selectable its first row is selected', () => {
  const stays = pageFixture();
  stays.type('ri');
  stays.suggest([yRow(SR.riverlark), yRow(SR.rimecraft)], 'ri');
  searchAnswer(stays, 'ri', [], [SR.rivenshade]);
  stays.type('riv');
  stays.suggest([yRow(SR.riverlark), yRow(SR.rimecraft)], 'riv');
  stays.press('ArrowDown');
  searchAnswer(stays, 'riv', [], [SR.rivendell, SR.rivenshade]);
  assert.deepEqual(stays.selected().map(option => optionLogin(stays, option)), ['rimecraft'], 'the picked Y row stays');
  const none = pageFixture();
  none.type('ri');
  none.suggest([], 'ri');
  searchAnswer(none, 'ri', [], [SR.rivenshade]);
  none.type('riv');
  none.suggest([], 'riv');
  searchAnswer(none, 'riv', [], [SR.rivendell, SR.rivenshade]);
  assert.deepEqual(none.selected().map(option => optionLogin(none, option)), ['rivendell'], 'nothing was selectable: the first row is');
});

test('P-B. appended known rows still go at the keystroke, even when they match the new text', () => {
  const f = pageFixture();
  f.type('ri');
  f.suggest([yRow(SR.riverlark)], 'ri');
  searchAnswer(f, 'ri', [SR.rimecraft], [SR.rivenshade]);
  f.type('rim');
  assert.deepEqual(loginsShown(f), ['riverlark'], 'rimecraft (known) is gone; rivenshade does not match "rim"');
});

// (Two earlier P-B tests, "the new answer replaces O in its order, selection stays on the same person" and "if the selected kept
// person is not in the new answer", were superseded 2026-11-25 by the P-B′ tests above: a kept row can no longer be selected.)

// ---- P-C: dimmed names reach 4.5:1 ----

function tokensFor(scheme) {
  const light = CSS.match(/:root\s*\{([^}]*)\}/)[1];
  const tokens = {};
  const read = block => { for (const [, name, value] of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) tokens[name] = value.trim(); };
  read(light);
  if (scheme === 'dark') {
    const dark = CSS.match(/@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{\s*:root\s*\{([^}]*)\}/);
    assert.ok(dark, 'the CSS has a dark scheme block');
    read(dark[1]);
  }
  return tokens;
}

function colour(value, tokens) {
  const text = String(value).trim();
  const variable = text.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (variable) return colour(tokens[variable[1]], tokens);
  const hex = text.match(/^#([0-9a-f]{6})$/i);
  if (hex) return {r: parseInt(hex[1].slice(0, 2), 16), g: parseInt(hex[1].slice(2, 4), 16), b: parseInt(hex[1].slice(4, 6), 16), a: 1};
  const rgb = text.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  assert.ok(rgb, `a colour the test can read (hex, rgb, rgba or a token of those): ${text}`);
  return {r: +rgb[1], g: +rgb[2], b: +rgb[3], a: rgb[4] === undefined ? 1 : +rgb[4]};
}

const channel = v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = ({r, g, b}) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

// The dimmed name's colour: its text colour (alpha included) times the element's opacity, over the window colour.
function dimmedContrast(scheme) {
  const tokens = tokensFor(scheme);
  const rule = {};
  for (const [, selectors, block] of CSS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectors.split(',').some(selector => selector.trim() === '.person.dim .name')) continue;
    for (const [, name, value] of block.matchAll(/([\w-]+)\s*:\s*([^;]+)/g)) rule[name] = value.trim();
  }
  const ink = colour(rule.color ?? tokens['--fg'], tokens);
  const opacity = rule.opacity === undefined ? 1 : Number(rule.opacity);
  const window = colour(tokens['--window'], tokens);
  const alpha = ink.a * opacity;
  const mixed = {r: window.r * (1 - alpha) + ink.r * alpha, g: window.g * (1 - alpha) + ink.g * alpha, b: window.b * (1 - alpha) + ink.b * alpha};
  const [hi, lo] = [luminance(mixed), luminance(window)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

for (const scheme of ['light', 'dark']) {
  test(`P-C. a dimmed row's name reaches 4.5:1 against the window in ${scheme} (from the CSS tokens and the .person.dim .name rule)`, () => {
    const ratio = dimmedContrast(scheme);
    assert.ok(ratio >= 4.5, `contrast ${ratio.toFixed(2)}:1 is below 4.5:1`);
  });
}

// ---- P-D: the spinner waits 150 ms ----

test('P-D. #search-pending stays hidden until a request has been out 150 ms, and never shows for one that ends sooner', () => {
  const f = pageFixture({timers: true});
  const spinner = f.document.getElementById('search-pending');
  assert.ok(spinner, 'an element #search-pending');
  f.type('ri');
  f.suggest([yRow(SR.riverlark)], 'ri');
  searchPending(f, 'ri', true);
  assert.equal(isVisible(f, spinner), false, 'hidden when the request starts');
  f.timers.advance(149);
  assert.equal(isVisible(f, spinner), false, 'hidden at 149 ms');
  f.timers.advance(1);
  assert.equal(isVisible(f, spinner), true, 'shown at 150 ms');
  searchPending(f, 'ri', false);
  assert.equal(isVisible(f, spinner), false, 'gone when it ends');
  searchPending(f, 'ri', true);
  f.timers.advance(100);
  searchPending(f, 'ri', false);
  f.timers.advance(1000);
  assert.equal(isVisible(f, spinner), false, 'a request that ended within 150 ms never showed it');
});

// Removed 2026-11-25 (step-back, P-D′, TESTS-74): the test that the spinner has a prefers-reduced-motion rule with no
// rotation. Under Reduce Motion the spinner keeps its normal look (feedback, not decorative motion).

// =====================================================================================================================
// Step-back (D-032), TESTS-74 "the selection class": invariant I1, driven over seeded pseudo-random message sequences.
// I1: the selected row changes only by the person's own input (typing, arrows, the pointer), with one exception: when
// nothing is selectable, the first selectable row that appears becomes selected. Return opens the selected row, or the
// typed text when nothing is selectable. A row the person selected is never removed or moved except by their own edit.
// Readings this test makes where I1 meets older rules (listed in the hand-back): an unmoved default selection follows
// the top when a list arrives (P2); the typed-name row is a placeholder that gives way to results; a reset:true list
// (an account change) may remove a person-selected search row; kept rows (P-B′) are never selected. The model only
// sends what global may send: a list for the current text, re-sent lists that only append, answers for the current or an
// older text, pending messages for either, status, and timer ticks.
// =====================================================================================================================

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const I1_POOL = ['pa1', 'pa2', 'pb1', 'pb2', 'pc1', 'qa1', 'qa2', 'qb1'];
const I1_TEXTS = ['', 'p', 'pa', 'pb', 'pc', 'q', 'qa', 'PA ', 'zz', 'a.b', 'pa ', 'Q'];

function rowName(f, option) {
  const node = f.all(option).find(inner => classOf(inner).includes('name'));
  return node ? node.textContent.trim() : String(attr(option, 'aria-label') ?? '').split(',')[0];
}

function i1Snapshot(f) {
  const options = f.options();
  const selected = f.selected();
  return {
    rows: options.map(option => rowName(f, option)),
    sel: selected.length ? rowName(f, selected[0]) : null,
    selCount: selected.length,
    active: f.field.getAttribute('aria-activedescendant'),
    selectedId: selected.length ? selected[0].id : null,
  };
}

function runI1Sequence(seed, steps) {
  const rnd = mulberry32(seed);
  const pick = list => list[Math.floor(rnd() * list.length)];
  const subset = (list, max) => {
    const chosen = [];
    for (const item of list) if (rnd() < 0.4 && chosen.length < max) chosen.push(item);
    return chosen;
  };
  const row = (login, live = pick([true, false, null])) => ({provider: 'twitch', login, displayName: login, live});
  const f = pageFixture({timers: true});
  const log = [];
  let text = '';
  let yList = subset(I1_POOL, 4);
  f.suggest(yList.map(login => row(login)), '');
  let personMoved = false;
  let chosen = null;
  let needList = false;
  let lastOthers = new Set();
  let kept = new Set();
  let posted = new Set();
  const cache = new Map();
  let prev = i1Snapshot(f);
  const norm = value => String(value).trim().toLowerCase();
  const isTyped = id => id !== null && text.trim() !== '' && norm(id) === norm(text) && !I1_POOL.includes(id);
  const fail = message => {
    throw new Error(`seed ${seed}: ${message}\n  steps: ${log.join(' | ')}\n  before ${JSON.stringify(prev)}\n  after ${JSON.stringify(i1Snapshot(f))}`);
  };

  for (let step = 0; step < steps; step++) {
    const roll = rnd();
    let kind = 'message';
    let name;
    let reset = false;
    let returned = null;
    let editResponse = false;
    if (roll < 0.17) {
      kind = 'person'; name = 'type';
      const before = text;
      text = pick(I1_TEXTS);
      f.type(text);
      if (norm(text) === norm(before)) {
        // F2: an edit that leaves the trimmed, lower-cased text unchanged changes no rows and no selection; typing
        // still resets "the person has moved" (phase 3 decision 9), so the next list follows the top again.
        personMoved = false; posted = new Set();
      } else {
        personMoved = false; chosen = null; needList = true; posted = new Set();
        kept = new Set(i1Snapshot(f).rows.filter(id => lastOthers.has(id) && !yList.includes(id)));
      }
      log.push(`type ${JSON.stringify(text)}`);
    } else if (roll < 0.27) {
      kind = 'person'; name = 'arrow';
      const key = pick(['ArrowDown', 'ArrowDown', 'ArrowUp']);
      // Amended 2026-11-25 (lead, from the page builder's report): an arrow the page ignores (not prevented) is no move.
      if (f.press(key)) { personMoved = true; chosen = i1Snapshot(f).sel; }
      log.push(key);
    } else if (roll < 0.31) {
      kind = 'person'; name = 'click';
      const options = f.options();
      if (options.length) {
        const index = Math.floor(rnd() * options.length);
        const target = rowName(f, options[index]);
        const before = f.posts('open-stream').length;
        options[index].click();
        log.push(`click ${target}`);
        for (const post of f.posts('open-stream').slice(before)) posted.add(norm(post.input));
        const after = i1Snapshot(f);
        if (after.sel !== null && after.sel === target) { personMoved = true; chosen = after.sel; }
        if (kept.has(target) && norm(target) !== norm(text) && f.posts('open-stream').length > before) fail(`a click opened kept row ${target}`);
      } else {
        log.push('click (no rows)');
      }
    } else if (roll < 0.37 && text.trim() !== '') {
      kind = 'person'; name = 'return';
      const sel = i1Snapshot(f).sel;
      const before = f.posts('open-stream').length;
      f.press('Enter');
      f.timers.advance(400);
      const fresh = f.posts('open-stream').slice(before);
      const expected = sel === null || isTyped(sel) ? text : sel;
      log.push(`return (selected ${sel})`);
      returned = {sel, expected, fresh};
      if (fresh.length > 1) fail('Return posted more than one open-stream');
      if (fresh.length === 1 && norm(fresh[0].input) !== norm(expected)) {
        fail(`Return opened ${JSON.stringify(fresh[0].input)} but the selected row or typed text is ${JSON.stringify(expected)}`);
      }
      if (fresh.length === 0 && !posted.has(norm(expected))) fail(`Return opened nothing; expected ${JSON.stringify(expected)}`);
      for (const post of fresh) posted.add(norm(post.input));
    } else {
      const kindRoll = rnd();
      if (kindRoll < 0.3) {
        name = 'suggestions';
        editResponse = needList;
        let rows;
        if (needList || rnd() < 0.12) {
          reset = !needList;
          rows = subset(I1_POOL, 4);
        } else {
          rows = yList.concat(subset(I1_POOL.filter(login => !yList.includes(login)), 2));
        }
        yList = rows;
        for (const login of rows) kept.delete(login); // Amended 2026-11-25 (lead): a kept login listed in your channels is no longer kept.
        f.deliver('suggestions', {text, rows: rows.map(login => row(login)), ...(reset ? {reset: true} : {})});
        if (reset) { kept = new Set(); lastOthers = new Set(); }
        needList = false;
        log.push(`suggestions ${JSON.stringify(rows)}${reset ? ' reset' : ''}`);
      } else if (kindRoll < 0.6) {
        name = 'answer';
        const current = rnd() < 0.8;
        const answerText = current ? text : pick(I1_TEXTS);
        // Global answers a text once (and from its cache after that): a repeat is the same answer.
        const free = I1_POOL.filter(login => !yList.includes(login));
        if (!cache.has(norm(answerText))) {
          const knownNew = subset(free, 2);
          cache.set(norm(answerText), {known: knownNew, others: subset(free.filter(login => !knownNew.includes(login)), 5)});
        }
        const {known, others} = cache.get(norm(answerText));
        f.deliver('suggestions-search', {text: answerText, known: known.map(login => row(login)), others: others.map(login => row(login))});
        if (norm(answerText) === norm(text) && text.trim() !== '') { kept = new Set(); lastOthers = new Set(others); }
        log.push(`answer ${JSON.stringify(answerText)} known ${JSON.stringify(known)} others ${JSON.stringify(others)}`);
      } else if (kindRoll < 0.75) {
        name = 'pending';
        const pendingText = rnd() < 0.8 ? text : pick(I1_TEXTS);
        const value = rnd() < 0.5;
        searchPending(f, pendingText, value);
        log.push(`pending ${JSON.stringify(pendingText)} ${value}`);
      } else if (kindRoll < 0.85) {
        name = 'status';
        const status = {};
        for (const login of subset(I1_POOL, 3)) status[login] = pick([true, false, null]);
        f.deliver('suggestions-status', {status, details: {}});
        log.push('status');
      } else {
        kind = 'timer'; name = 'tick';
        const ms = pick([0, 100, 150, 250]);
        f.timers.advance(ms);
        log.push(`tick ${ms}`);
      }
    }

    const now = i1Snapshot(f);
    if (now.selCount > 1) fail('more than one row is selected');
    // At most one row carries the selected look (aria-selected or a selected-state class), and it is the activedescendant.
    const looks = f.options().filter(option => attr(option, 'aria-selected') === 'true' || classOf(option).some(token => STATE_CLASS.test(token)));
    if (looks.length > 1) fail(`${looks.length} rows carry the selected look`);
    if (looks.length === 1 && looks[0].id !== now.active) fail('the row with the selected look is not the aria-activedescendant');
    if (now.sel === null && now.active !== null) fail('aria-activedescendant names a row but none is selected');
    if (now.sel !== null && now.active !== now.selectedId) fail('aria-activedescendant is not the selected row');
    // A kept row whose login equals the typed text is the typed-name placeholder drawn in full, and may be selected as
    // that placeholder; any other kept row is never selected. (The pool never equals a typed text, so this stays strict.)
    if (kept.size && now.sel !== null && kept.has(now.sel) && norm(now.sel) !== norm(text)) fail(`kept row ${now.sel} is selected (kept rows are not selectable)`);
    // The first list after an edit is the answer to that edit: it may remove what the person had picked meanwhile.
    if (editResponse) {
      if (chosen !== null && !now.rows.includes(chosen)) chosen = null;
      prev = now;
      continue;
    }
    if (kind !== 'person' && now.sel !== prev.sel) {
      const placeholder = prev.sel !== null && isTyped(prev.sel);
      const followsTop = !personMoved && name === 'suggestions';
      const firstSelectable = prev.sel === null;
      const removedByReset = reset && prev.sel !== null && !now.rows.includes(prev.sel);
      if (!(firstSelectable || placeholder || followsTop || removedByReset || (!personMoved && name === 'answer'))) {
        fail(`the selection changed from ${prev.sel} to ${now.sel} on a ${name} step the person did not make`);
      }
    }
    // Amended 2026-11-25 (lead): the typed-name row is a placeholder (TESTS-74 step-back readings), never a pick.
    if (kind !== 'person' && personMoved && chosen !== null && !reset && !isTyped(chosen)) {
      const was = prev.rows.indexOf(chosen);
      const is = now.rows.indexOf(chosen);
      if (prev.sel === chosen && (is === -1 || is !== was)) {
        fail(`the row the person selected (${chosen}) was ${is === -1 ? 'removed' : 'moved'} by a ${name} step`);
      }
    }
    if (returned === null && kind === 'person' && name === 'type') { /* the edit itself may change anything */ }
    prev = now;
  }
}

test('I1. the selection invariant holds over seeded pseudo-random message and input sequences (300 sequences of 30 steps)', t => {
  const started = Date.now();
  const sequences = 1000;
  const steps = 30;
  for (let seed = 1; seed <= sequences; seed++) runI1Sequence(seed, steps);
  t.diagnostic(`I1: ${sequences} sequences, ${sequences * steps} steps, ${Date.now() - started} ms`);
});


// ---- Final design clearance (TESTS-74, probes DUP and BLINK in search-review/r4.mjs), 2026-11-25 ----

// Amended 2026-11-25 (lead's point fix, TESTS-74): a kept row whose login equals the typed text (case-insensitive) is the
// typed-name placeholder drawn in full: its display name, live mark and details, as the one selected row.
test('DUP. typing the last letter of the name of a kept row: that person is drawn once, in full, as the one selected row', () => {
  const f = pageFixture();
  f.type('rivenshad');
  f.suggest([], 'rivenshad');
  searchAnswer(f, 'rivenshad', [], [SR.rivenshade]);
  f.type('rivenshade');
  f.suggest([], 'rivenshade');
  assert.equal(f.options().length, 1, `one row, not ${f.options().map(option => rowName(f, option)).join(', ')}`);
  const [row] = f.options();
  assert.equal(rowName(f, row), 'RivenShade', 'it shows the display name, not the typed text');
  assert.ok(f.all(row).some(node => classOf(node).includes('mark') && classOf(node).includes('live')), 'with its live mark');
  const texts = leafTexts(f, row);
  assert.ok(texts.includes('Valorant · ranked grind to radiant'), `and its details: ${JSON.stringify(texts)}`);
  assert.ok(texts.includes('15.4K'), 'and its viewers');
  const looks = f.options().filter(option => attr(option, 'aria-selected') === 'true');
  assert.deepEqual(looks, [row], 'it is the one selected row');
  assert.equal(f.field.getAttribute('aria-activedescendant'), row.id, 'and the aria-activedescendant');
  f.press('Enter');
  assert.deepEqual(f.posts('open-stream'), [{input: 'rivenshade'}], 'Return opens "rivenshade"');
  const landed = pageFixture();
  landed.type('rivenshad');
  landed.suggest([], 'rivenshad');
  searchAnswer(landed, 'rivenshad', [], [SR.rivenshade]);
  landed.type('rivenshade');
  landed.suggest([], 'rivenshade');
  searchAnswer(landed, 'rivenshade', [], [SR.rivenshade]);
  assert.deepEqual(landed.options().map(option => rowName(landed, option)), ['RivenShade'], 'when the answer lands: still one row');
  assert.deepEqual(landed.selected(), landed.options(), 'the same person stays the selected first row');
});

test('BLINK. with your channels empty, an extending edit draws the typed-name row for the new text at once, before the list answers', () => {
  const f = pageFixture();
  f.type('zzq');
  f.suggest([], 'zzq');
  assert.deepEqual(f.options().map(option => rowName(f, option)), ['zzq'], 'fixture: the typed-name row is drawn');
  f.type('zzqx');
  assert.deepEqual(f.options().map(option => rowName(f, option)), ['zzqx'], 'drawn for "zzqx" at the keystroke');
  assert.deepEqual(f.selected(), f.options(), 'and selected');
  f.type('zzqxy');
  assert.deepEqual(f.options().map(option => rowName(f, option)), ['zzqxy'], 'again for the next extending letter');
  f.suggest([], 'zzqxy');
  assert.deepEqual(f.options().map(option => rowName(f, option)), ['zzqxy'], 'and it stays when the list answers');
});


// Phase 2 rev 3 (TESTS-74, "Phase 2 rev 3", O2; operator's third try). An offline row shows its name, its age and the
// broadcasts chevron, and no title text, in your channels and in other channels alike. A live row keeps
// "category · title" and the viewer count. Row data still carries lastTitle (global's contract is unchanged); the page
// must not draw it.
const hasChevron = (f, option) => f.all(option).some(node => /disclos|chev/i.test(String(node.className)));
const noTitleText = (f, option, titles) => {
  const texts = leafTexts(f, option).join(' | ');
  for (const title of titles) assert.ok(!texts.includes(title), `no "${title}" on an offline row: ${texts}`);
};

test('O2. offline row in your channels: name, age and the broadcasts chevron, no title; live row keeps category, title, viewers', () => {
  const f = pageFixture();
  f.type('ri');
  f.suggest([yRow(SR.riverlark), yRow(SR.rimecraft)], 'ri');
  f.deliver('suggestions-status', {status: {riverlark: true, rimecraft: false},
    details: {riverlark: SR.riverlark.details, rimecraft: SR.rimecraft.details}});
  const [live, offline] = f.options();
  assert.ok(leafTexts(f, live).includes('Outer Wilds · first time through, no spoilers'), 'live: category · title');
  assert.ok(leafTexts(f, live).includes('2.1K'), 'live: viewers');
  noTitleText(f, offline, ['Frostpunk 2, the long night', 'Frostpunk']);
  assert.ok(leafTexts(f, offline).includes('2d'), 'offline: age');
  assert.ok(hasChevron(f, offline), 'offline: the broadcasts chevron');
  assert.equal(leftover(f, offline, ['2d', 'Rimecraft', 'R']), '', 'name and age, nothing else');
});

test('O2. offline row in other channels: name, age and the broadcasts chevron, no title; live row keeps category, title, viewers', () => {
  const f = pageFixture();
  frameB(f);
  const byName = Object.fromEntries(f.options().map(option => [attr(option, 'aria-label').split(',')[0], option]));
  const [riven, inny] = [byName.RivenShade, byName.rinnyruns];
  assert.ok(riven && inny, 'fixture: a live and an offline other-channel row');
  assert.ok(leafTexts(f, riven).includes('Valorant · ranked grind to radiant'), 'live: category · title');
  assert.ok(leafTexts(f, riven).includes('15.4K'), 'live: viewers');
  noTitleText(f, inny, ['knitting night', 'knitting']);
  assert.ok(leafTexts(f, inny).includes('4d'), 'offline: age');
  assert.ok(hasChevron(f, inny), 'offline: the broadcasts chevron');
  assert.equal(leftover(f, inny, ['4d', 'rinnyruns', 'R', 'r']), '', 'name and age, nothing else');
});

test('O2. a known person the search appends to Y (offline) is drawn without a title as well', () => {
  const f = pageFixture();
  f.type('ri');
  f.suggest([yRow(SR.riverlark)], 'ri');
  searchAnswer(f, 'ri', [SR.rimecraft], []);
  const rime = f.options().find(option => String(attr(option, 'aria-label')).startsWith('Rimecraft'));
  assert.ok(rime, 'fixture: the appended known row');
  noTitleText(f, rime, ['Frostpunk 2, the long night']);
  assert.ok(leafTexts(f, rime).includes('2d'));
  assert.ok(hasChevron(f, rime));
});
