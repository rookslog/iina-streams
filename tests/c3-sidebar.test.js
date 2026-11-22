'use strict';

// Assumed sidebar bridge: state.behindLive is seconds or null; the header's #live-pill is
// hidden when uncertain or not on Twitch live. Its data-state is "live" for the red style or
// "behind" for the grey style. Clicking the behind pill posts 'go-live' with {}.
// This tests rendered state and the click message, not WebKit paint or the CSS color itself.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const {createWebViewIina} = require('./support/iina-shim.js');

const ui = join(__dirname, '../ui');
const html = fs.readFileSync(join(ui, 'sidebar.html'), 'utf8');
const script = fs.readFileSync(join(ui, 'sidebar.js'), 'utf8');

function element({id = '', hidden = false} = {}) {
  const attributes = new Map();
  const listeners = new Map();
  const node = {
    id, hidden, value: '', textContent: '', dataset: {}, clientHeight: 0, children: [],
    style: {setProperty() {}},
    addEventListener(name, fn) { listeners.set(name, fn); },
    setAttribute(name, value) {
      attributes.set(name, String(value));
      if (name === 'data-state') this.dataset.state = String(value);
    },
    getAttribute(name) { return attributes.get(name) ?? null; },
    replaceChildren() { this.children = []; },
    appendChild(child) { this.children.push(child); },
    click() { listeners.get('click')?.({target: this, preventDefault() {}, stopPropagation() {}}); },
  };
  // Basic classList support for a pill that also toggles an appearance class.
  const classes = new Set();
  node.classList = {
    toggle(name, force = !classes.has(name)) {
      if (force) classes.add(name);
      else classes.delete(name);
      return force;
    },
  };
  return node;
}

function sidebarFixture() {
  const page = createWebViewIina();
  const elements = new Map();
  for (const [tag, id] of html.matchAll(/<[^<>]+\bid="([^"]+)"[^<>]*>/g)) {
    elements.set(id, element({id, hidden: /\s+hidden(?:\s|=|>)/.test(tag)}));
  }
  const document = {
    documentElement: element(),
    activeElement: null,
    addEventListener() {},
    getElementById: id => elements.get(id) ?? null,
    createElement: () => element(),
  };
  vm.runInNewContext(script, {
    document,
    window: {addEventListener() {}},
    iina: page.iina,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
  }, {filename: 'sidebar.js'});

  function render(behindLive, kind = 'twitch-live', atLiveEdge = false) {
    page.receiveEnvelope('state', {
      title: 'Synthetic stream',
      source: {kind, provider: 'Twitch'},
      live: kind === 'twitch-live',
      behindLive,
      atLiveEdge,
      phase: 'playing',
      chat: {mode: 'off', state: 'off'},
      chatTiming: {mode: 'manual', manualDelay: 10, fineTune: 0, delay: 10, state: 'manual'},
      auth: {phase: 'off'},
      view: {presentation: 'sidebar', fontSize: 14, spacing: 4, opacity: 0.6, x: 1, y: 0},
      messages: [],
    });
    assert.equal(elements.get('title').textContent, 'Synthetic stream',
      'the sidebar consumes the real state envelope');
    const pill = elements.get('live-pill');
    assert.ok(pill, 'the sidebar header is missing its Live pill');
    return pill;
  }

  return {render, posts: page.posts};
}

test('sidebar Live pill changes from hidden to Live to behind using behindLive', () => {
  const {render} = sidebarFixture();
  assert.equal(render(null).hidden, true, 'no confident estimate means no pill');
  const live = render(5, 'twitch-live', true);
  assert.equal(live.hidden, false);
  assert.equal(live.dataset.state, 'live', 'atLiveEdge from the player gives the red Live state (#51)');
  assert.equal(live.textContent.trim(), 'Live');
  const behind = render(12);
  assert.equal(behind.hidden, false);
  assert.equal(behind.dataset.state, 'behind', 'without atLiveEdge the pill is the grey behind state');
  assert.equal(behind.textContent.trim().replace(/\s+/g, ' '), '−12 s');
  assert.equal(render(null).hidden, true, 'hide the pill again when confidence drops');
  assert.equal(render(12, 'twitch-vod').hidden, true, 'VOD does not display a live pill');
});

test('clicking the behind-live pill posts the Go Live action', () => {
  const {render, posts} = sidebarFixture();
  render(12).click();
  assert.deepEqual(posts.filter(post => post.name === 'go-live'), [{name: 'go-live', data: {}}]);
});
