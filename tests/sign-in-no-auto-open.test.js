'use strict';
// Twitch's activation page opens only when the user clicks "Approve on Twitch" (#42, changed from the
// original auto-open design after the user's native check: the page autofills the code, so the user
// presses Activate and Authorize). Sign in itself, the chat switch, Continue, Enter and Try again never
// open a browser. The button still copies the code as a silent fallback if autofill fails.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createBridge} = require('./support/auth-bridge.js');
const {createWebViewIina} = require('./support/iina-shim.js');

const ui = path.join(__dirname, '..', 'ui');
const ACTIVATION = 'https://www.twitch.tv/activate?device-code=ABCDEFGH'; // what auth-bridge.js serves

// ---- plugin side: real player + global.js + broker ----

test('a Sign in click leaves the browser alone, even one that still carries the old open flag', async () => {
  for (const payload of [{clientID: ''}, {clientID: '', open: true}]) {
    const bridge = await createBridge();
    await bridge.settle();
    await bridge.click('connect', payload);
    assert.equal(bridge.player.snapshot().auth.phase, 'waiting', 'precondition: the code is showing');
    assert.equal(bridge.player.snapshot().auth.verificationURI, ACTIVATION);
    assert.deepEqual(bridge.opened, [], 'waiting must not open Twitch');
    bridge.close();
  }
});

test('Approve on Twitch opens the activation page, and only on the click', async () => {
  const bridge = await createBridge();
  await bridge.settle();
  await bridge.click('connect', {clientID: ''});
  assert.deepEqual(bridge.opened, []);
  await bridge.click('authorize-open');
  assert.deepEqual(bridge.opened, [ACTIVATION]);
  bridge.close();
});

test('control: Approve on Twitch does nothing before a code is waiting', async () => {
  const bridge = await createBridge();
  await bridge.settle();
  await bridge.click('authorize-open');
  assert.deepEqual(bridge.opened, []);
  bridge.close();
});

// ---- page side: the sidebar's real script against a minimal DOM ----

function sidebarPage() {
  const page = createWebViewIina();
  const elements = {}, clipboard = [];
  const element = id => ({
    id, hidden: false, disabled: false, value: '', children: [], dataset: {}, events: {}, attributes: {}, _text: '',
    classList: {toggle() {}}, style: {setProperty() {}}, scrollTop: 0, clientHeight: 200, scrollHeight: 0, checked: false,
    addEventListener(name, fn) { this.events[name] = fn; }, setAttribute(name, value) { this.attributes[name] = value; },
    appendChild(child) { this.children.push(child); }, append(...kids) { this.children.push(...kids); },
    replaceChildren() { this.children = []; }, focus() {}, click() { this.events.click?.({target: this}); },
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); },
    set textContent(value) { this._text = String(value); this.children = []; }
  });
  for (const match of fs.readFileSync(path.join(ui, 'sidebar.html'), 'utf8').matchAll(/\bid="([^"]+)"/g)) {
    elements[match[1]] = element(match[1]);
  }
  const document = {body: element('body'), documentElement: element('html'), hidden: false,
    getElementById: id => elements[id], createElement: () => element(), addEventListener() {}};
  const window = {addEventListener() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {}};
  const navigator = {clipboard: {writeText: text => clipboard.push(text)}};
  vm.runInNewContext(fs.readFileSync(path.join(ui, 'sidebar.js'), 'utf8'), {
    document, window, navigator, iina: page.iina, requestAnimationFrame: () => 0, cancelAnimationFrame() {}, Date
  }, {filename: 'sidebar.js'});
  const waiting = {variant: 'unified', source: {kind: 'twitch-live', provider: 'twitch', id: 'test_channel'}, title: 'x',
    live: true, formats: [], quality: 'auto720', phase: 'playing', busy: false, error: '',
    auth: {phase: 'waiting', userCode: 'ABCD-EFGH', verificationURI: ACTIVATION},
    chat: {mode: 'live', state: 'waiting', available: false, count: 0, sourceName: 'x', offset: 0, error: ''},
    view: {presentation: 'sidebar', fontSize: 14, opacity: .64, lines: 6, x: 1, y: 0, density: 'comfortable', editing: false},
    messages: [], qa: false};
  return {elements, clipboard, posts: page.posts, state: value => page.receiveEnvelope('state', value), waiting};
}

test('every sign-in control posts a plain connect request with no open flag', () => {
  const page = sidebarPage();
  page.state(page.waiting);
  page.elements['client-id'].value = 'c'.repeat(30);
  page.elements.authorize.events.input?.({target: page.elements.authorize});
  page.elements['client-id'].events.input({target: page.elements['client-id']});
  for (const click of ['connect', 'authorize', 'retry']) page.elements[click].click();
  page.elements['client-id'].events.keydown({key: 'Enter', target: page.elements['client-id']});
  const connects = page.posts.filter(post => post.name === 'connect');
  assert.equal(connects.length, 4, 'Sign in, Continue, Try again and Enter each posted once');
  for (const post of connects) assert.equal(Object.hasOwn(post.data, 'open'), false, JSON.stringify(post.data));
});

test('the button is labelled Approve on Twitch and still copies the code silently', () => {
  const html = fs.readFileSync(path.join(ui, 'sidebar.html'), 'utf8');
  assert.match(html, /<button id="authorize-open">Approve on Twitch<\/button>/);
  assert.doesNotMatch(html, /Copy code/);
  const page = sidebarPage();
  page.state(page.waiting);
  page.elements['authorize-open'].click();
  assert.deepEqual(page.clipboard, ['ABCD-EFGH']);
  assert.equal(page.posts.filter(post => post.name === 'authorize-open').length, 1);
});

test('the auto-open plumbing stays removed', () => {
  const player = fs.readFileSync(path.join(__dirname, '..', 'src', 'player.js'), 'utf8');
  assert.doesNotMatch(player, /shouldAutoOpen|autoOpen/);
  assert.equal(Object.hasOwn(require('../src/player.js'), 'shouldAutoOpen'), false);
});
