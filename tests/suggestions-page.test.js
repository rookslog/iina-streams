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

const INCLUDE_FOLLOWS = 'Include who you follow';
const CODE = {userCode: 'WXYZ-1234', verificationUri: 'https://www.twitch.tv/activate?public=true'};

const visibleButtons = f => f.visibleNodes().filter(node => node.tagName === 'BUTTON');
const buttonNamed = (f, text) => visibleButtons(f).filter(node => node.textContent.trim() === text);

test('P4. suggestions-follows needs-sign-in shows one button below the list: an action, not an option', () => {
  const f = pageFixture();
  f.suggest();
  assert.equal(buttonNamed(f, INCLUDE_FOLLOWS).length, 0, 'nothing before the message');
  f.deliver('suggestions-follows', {state: 'needs-sign-in'});
  const found = buttonNamed(f, INCLUDE_FOLLOWS);
  assert.equal(found.length, 1, 'one button, "Include who you follow"');
  const [button] = found;
  const box = f.listbox();
  const everything = f.all();
  assert.ok(!f.all(box).includes(button), 'outside the listbox');
  assert.ok(everything.indexOf(button) > everything.lastIndexOf(f.all(box).at(-1)), 'below the list');
  assert.equal(f.options().length, 3, 'it is not a row');
  assert.ok(f.options().every(option => !option.textContent.includes(INCLUDE_FOLLOWS)));
  for (let index = 0; index < 5; index++) f.press('ArrowDown');
  assert.deepEqual(f.selected(), [f.options()[2]], 'the arrows stop at the last person');
  assert.equal(f.field.getAttribute('aria-activedescendant'), f.options()[2].id);
  f.deliver('suggestions-follows', {state: 'needs-sign-in'});
  f.suggest(ROWS, 'oh');
  assert.equal(buttonNamed(f, INCLUDE_FOLLOWS).length, 1, 'still one button after a repeat and a new list');
});

test('P4. clicking "Include who you follow" posts follows-connect', () => {
  const f = pageFixture();
  f.suggest();
  f.deliver('suggestions-follows', {state: 'needs-sign-in'});
  assert.deepEqual(f.posts('follows-connect'), [], 'nothing until the click');
  assert.equal(buttonNamed(f, INCLUDE_FOLLOWS).length, 1, 'the "Include who you follow" button is shown');
  buttonNamed(f, INCLUDE_FOLLOWS)[0].click();
  assert.deepEqual(f.posts('follows-connect'), [{}]);
});

test('P4. follows-code shows the code and a button that opens the Twitch page; connecting is not offered again', () => {
  const f = pageFixture();
  f.suggest();
  f.deliver('suggestions-follows', {state: 'needs-sign-in'});
  assert.equal(buttonNamed(f, INCLUDE_FOLLOWS).length, 1, 'the "Include who you follow" button is shown');
  buttonNamed(f, INCLUDE_FOLLOWS)[0].click();
  f.deliver('follows-code', CODE);
  const codes = f.visibleNodes().filter(node => node.ownText.trim() === CODE.userCode);
  assert.equal(codes.length, 1, 'the code is shown once');
  assert.ok(!f.all(f.listbox()).includes(codes[0]), 'outside the listbox');
  assert.equal(f.options().length, 3, 'and it is not a row');
  assert.ok(visibleButtons(f).length >= 1, 'a button is shown');
  // Every button the person could press: only the one that opens Twitch may act, and connecting must not start again,
  // since a second device flow would void the code on screen.
  for (const button of visibleButtons(f)) button.click();
  assert.deepEqual(f.posts('follows-open'), [{}], 'a button posts follows-open');
  assert.equal(f.posts('follows-connect').length, 1, 'no second follows-connect: the first click was the only one');
});

test('P4. any other suggestions-follows state takes the button and the code away', () => {
  const f = pageFixture();
  f.suggest();
  f.deliver('suggestions-follows', {state: 'needs-sign-in'});
  f.deliver('follows-code', CODE);
  assert.equal(f.visibleNodes().filter(node => node.ownText.trim() === CODE.userCode).length, 1, 'fixture: the code is showing');
  f.deliver('suggestions-follows', {state: 'ready'});
  assert.equal(f.visibleNodes().filter(node => node.ownText.trim() === CODE.userCode).length, 0, 'the code is gone');
  assert.deepEqual(visibleButtons(f), [], 'and so is every button');
  assert.equal(f.options().length, 3);
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
