'use strict';

// The Open Stream window page (ui/open.html, ui/open.js) and its global wiring (#50).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Sources = require('../src/source.js');
const {createIina, createWebViewIina} = require('./support/iina-shim.js');

const ui = path.join(__dirname, '../ui');
const config = {identifier: 'local.iina.streams.open-window-test', variant: 'unified'};

function listenerTarget() {
  const listeners = new Map();
  return {
    addEventListener(name, listener) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(listener);
    },
    dispatch(name, event) {
      for (const listener of listeners.get(name) || []) listener(event);
    }
  };
}

// A minimal page: the elements ui/open.html declares, with their attributes, and bubbling to document.
function openPage() {
  const page = createWebViewIina();
  const html = fs.readFileSync(path.join(ui, 'open.html'), 'utf8');
  const document = {...listenerTarget(), activeElement: null};
  const window = listenerTarget();
  const elements = new Map();
  for (const [, tag, raw] of html.matchAll(/<(form|input)\b([^>]*)>/gi)) {
    const attributes = {};
    for (const [, name, value] of raw.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attributes[name] = value ?? '';
    const element = {
      ...listenerTarget(),
      tagName: tag.toUpperCase(),
      value: '',
      attributes,
      getAttribute: name => attributes[name] ?? null,
      setAttribute(name, value) { attributes[name] = String(value); },
      removeAttribute(name) { delete attributes[name]; },
      focus() { document.activeElement = element; }
    };
    elements.set(attributes.id, element);
  }
  document.getElementById = id => elements.get(id) || null;
  const form = elements.get('open-form');
  const field = elements.get('open-input');

  function dispatch(target, name, extra = {}) {
    let prevented = false;
    const event = {target, ...extra, preventDefault() { prevented = true; }};
    target.dispatch(name, event);
    if (target === field) form.dispatch(name, event);
    document.dispatch(name, event);
    return prevented;
  }

  // WebKit submits a single-field form on Return unless keydown was cancelled.
  function press(key) {
    if (!dispatch(field, 'keydown', {key}) && key === 'Enter') dispatch(form, 'submit');
  }

  vm.runInNewContext(fs.readFileSync(path.join(ui, 'open.js'), 'utf8'), {document, window, iina: page.iina},
    {filename: 'open.js'});
  return {page, document, window, form, field, press, dispatch};
}

function loadGlobal() {
  const shim = createIina({role: 'global', identifier: config.identifier, rejectModalDialogs: true});
  const modules = new Map([
    ['./config.js', config],
    ['./src/source.js', Sources],
    ['./src/auth.js', require('../src/auth.js')],
    ['./src/timers.js', require('../src/timers.js')],
    ['./src/twitch-app.js', {clientID: ''}],
    ['./src/twitch-vods.js', require('../src/twitch-vods.js')],
    ['./src/bridge.js', require('../src/bridge.js')],
    ['./src/listeners.js', require('../src/listeners.js')]
  ]);
  shim.runScript(path.join(__dirname, '../global.js'), {
    require(name) {
      if (!modules.has(name)) throw new Error('Unexpected module ' + name);
      return modules.get(name);
    }
  });
  const menuItem = shim.menu.items.find(item => item.keyBinding === 'Ctrl+Meta+o');
  return {shim, menuItem};
}

test('A1 window page: named field focused on load, Return submits, blanks and Escape do not open', () => {
  const {page, document, field, press} = openPage();
  assert.equal(document.activeElement, field, 'focus lands in the field');
  assert.equal(field.getAttribute('aria-label'), 'Channel or URL');
  assert.equal(field.getAttribute('placeholder'), 'Channel or URL');

  field.value = '   ';
  press('Enter');
  // r6c (B6c, #32): the page now posts open-ready on load, so check only that a blank field does not submit.
  assert.deepEqual(page.messages('open-stream'), [], 'a blank field posts nothing');

  field.value = '  XqC ';
  press('Enter');
  assert.deepEqual(page.messages('open-stream'), [{name: 'open-stream', data: {input: '  XqC '}}]);

  press('Escape');
  assert.deepEqual(page.messages('open-cancel'), [{name: 'open-cancel', data: {}}]);
  assert.equal(page.messages('open-stream').length, 1, 'Escape does not submit');
});

test('A1 window page: open-error marks the field invalid, keeps the text, and typing clears the state', () => {
  const {page, document, field, dispatch} = openPage();
  field.value = 'not a stream';
  document.activeElement = null;
  page.receive('open-error', {});
  assert.equal(field.getAttribute('aria-invalid'), 'true');
  assert.equal(field.value, 'not a stream');
  assert.equal(document.activeElement, field, 'focus returns to the field');
  dispatch(field, 'input');
  assert.equal(field.getAttribute('aria-invalid'), null);
});

test('A1 window wiring: Escape closes, reopening reloads, and a second shortcut only focuses', async () => {
  const {shim, menuItem} = loadGlobal();
  await menuItem.action();
  assert.equal(shim.standaloneWindow.loads.length, 1);
  assert.equal(shim.standaloneWindow.visible, true);

  await menuItem.action();
  assert.equal(shim.standaloneWindow.loads.length, 1, 'an open window is brought forward, not reloaded');
  assert.equal(shim.standaloneWindow.visible, true);

  shim.standaloneWindow.send('open-cancel', {});
  assert.equal(shim.standaloneWindow.visible, false, 'Escape in the page closes the window');

  await menuItem.action();
  assert.equal(shim.standaloneWindow.loads.length, 2, 'a closed window reopens with a fresh page');
  // loadFile clears listeners in IINA 1.5.1, so the submit handler must be registered again after it.
  shim.standaloneWindow.send('open-stream', {input: 'xqc'});
  assert.equal(shim.global.opens.length, 1);
  assert.equal(shim.global.opens[0].url, 'https://www.twitch.tv/xqc');
  assert.equal(shim.standaloneWindow.visible, false);
  assert.equal(shim.utils.prompts.length + shim.utils.asks.length, 0);
});
