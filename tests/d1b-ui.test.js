'use strict';

// D1 follow-ups (#47): the overlay cluster sits below IINA's title-bar band, and the sidebar's presentation
// select has a Beside video option. The overlay check reads the stylesheet's rules; WebKit layout is not run
// (a native check covers the pixels). The sidebar check runs sidebar.js in a vm with a minimal DOM.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const {createWebViewIina} = require('./support/iina-shim.js');

const ui = join(__dirname, '../ui');
const css = fs.readFileSync(join(ui, 'overlay.css'), 'utf8');
const html = fs.readFileSync(join(ui, 'sidebar.html'), 'utf8');

// The declarations of every rule whose selector list contains `selector`, outside @media blocks.
function declarations(selector) {
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, '');
  const found = [];
  for (const [, selectors, body] of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selectors.split(',').map(s => s.trim()).includes(selector)) found.push(body);
  }
  return found.join(';');
}

test('D1b the cluster is offset by the title-bar height from a custom property', () => {
  const property = /--title-bar-height:\s*(\d+)px/.exec(declarations('body[data-layout="column"]'));
  assert.ok(property, 'the column layout defines --title-bar-height');
  assert.equal(Number(property[1]), 28, "IINA's title bar is about 28 px tall");
  assert.match(
    declarations('body[data-layout="column"] #column-tools'),
    /margin-top:\s*var\(--title-bar-height\)/,
    'the cluster is pushed below the band',
  );
});

test('D1b the cluster offset applies to the element that holds Go Live and Hide Chat', () => {
  const overlayHtml = fs.readFileSync(join(ui, 'overlay.html'), 'utf8');
  const tools = /<div id="column-tools"[^>]*>([\s\S]*?)<\/div>\s*<div id="messages"/.exec(overlayHtml);
  assert.ok(tools, 'column-tools is a div before the message list');
  assert.ok(tools[1].includes('id="go-live"') && tools[1].includes('id="hide-chat"'));
});

function presentationOptions() {
  const select = /<select id="presentation">([\s\S]*?)<\/select>/.exec(html);
  assert.ok(select, 'sidebar.html has the presentation select');
  return [...select[1].matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)].map(m => [m[1], m[2]]);
}

test('D1b the presentation select offers Beside video next to the other two', () => {
  assert.deepEqual(presentationOptions(), [
    ['sidebar', 'Sidebar'], ['overlay', 'Over video'], ['beside', 'Beside video'],
  ]);
});

function element(id = '') {
  const listeners = new Map();
  return {
    id, hidden: false, value: '', title: '', textContent: '', dataset: {}, style: {setProperty() {}},
    children: [], clientHeight: 0, scrollHeight: 0, scrollTop: 0, classList: {toggle() {}},
    addEventListener(name, fn) { listeners.set(name, fn); },
    dispatch(name, event) { listeners.get(name)?.(event); },
    setAttribute() {}, getAttribute() { return null; },
    replaceChildren() { this.children = []; },
    appendChild(child) { this.children.push(child); return child; },
    append(...nodes) { for (const node of nodes) this.appendChild(node); },
  };
}

function sidebarPage() {
  const page = createWebViewIina();
  const elements = new Map();
  for (const [, id] of html.matchAll(/<[^<>]+\bid="([^"]+)"[^<>]*>/g)) elements.set(id, element(id));
  const document = {
    documentElement: element(), activeElement: null, addEventListener() {},
    getElementById: id => elements.get(id) ?? null, createElement: () => element(),
  };
  vm.runInNewContext(fs.readFileSync(join(ui, 'sidebar.js'), 'utf8'), {
    document, iina: page.iina, window: {addEventListener() {}},
    requestAnimationFrame: () => 1, cancelAnimationFrame() {}, setTimeout() {},
  }, {filename: 'sidebar.js'});
  return {page, $: id => elements.get(id)};
}

test('D1b the select reflects beside, to a value one of its options has, and posts it on change', () => {
  const {page, $} = sidebarPage();
  page.receiveEnvelope('state', {
    title: 'Synthetic stream', source: {kind: 'twitch-live', provider: 'Twitch'}, live: true, behindLive: null,
    phase: 'playing', formats: [], quality: 'auto720', chat: {mode: 'live', state: 'connected'},
    auth: {phase: 'off'}, messages: [],
    view: {presentation: 'beside', fontSize: 14, spacing: 4, opacity: 0.6, x: 1, y: 0, columnWidth: 320},
  });
  const values = presentationOptions().map(([value]) => value);
  assert.equal($('presentation').value, 'beside');
  assert.ok(values.includes($('presentation').value), 'a real select would show blank otherwise');

  $('presentation').value = 'beside';
  $('presentation').dispatch('change', {});
  assert.deepEqual(page.posts.filter(post => post.name === 'view').map(post => post.data), [{presentation: 'beside'}]);
});
