'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createWebViewIina} = require('./support/iina-shim.js');

const ui = path.join(__dirname, '../ui');
const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param',
  'source', 'track', 'wbr']);

function eventTarget() {
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

function isVisible(element) {
  for (let node = element; node; node = node.parentElement) {
    if (node.hidden || node.style.display === 'none') return false;
  }
  return true;
}

function sidebarPage() {
  const page = createWebViewIina();
  const elements = new Map();
  const inputs = [];
  const document = {
    ...eventTarget(),
    activeElement: null,
    hidden: false,
    getElementById: id => elements.get(id) || null,
    createElement: tag => makeElement(tag)
  };
  const window = eventTarget();

  function makeElement(tag, attributes = {}) {
    return {
      ...eventTarget(),
      tagName: tag.toUpperCase(),
      hidden: Object.hasOwn(attributes, 'hidden'),
      disabled: Object.hasOwn(attributes, 'disabled'),
      value: '',
      children: [],
      parentElement: null,
      dataset: {},
      style: {setProperty() {}},
      classList: {add() {}, remove() {}, toggle() {}},
      getAttribute(name) {
        return attributes[name] ?? null;
      },
      setAttribute(name, value) {
        attributes[name] = String(value);
        if (name === 'hidden') this.hidden = true;
      },
      removeAttribute(name) {
        delete attributes[name];
        if (name === 'hidden') this.hidden = false;
      },
      appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
      },
      focus() {
        if (isVisible(this)) document.activeElement = this;
      },
      blur() {
        if (document.activeElement === this) document.activeElement = null;
      }
    };
  }

  // Read the real HTML so the fixture sees hidden ancestors and the actual form (if there is one).
  function loadMarkup() {
    const stack = [];
    const html = fs.readFileSync(path.join(ui, 'sidebar.html'), 'utf8');
    for (const [, closing, tag, raw] of html.matchAll(/<(\/?)([a-z][\w-]*)\b([^>]*)>/gi)) {
      if (closing) {
        stack.pop();
        continue;
      }
      const attributes = {};
      for (const [, name, doubleQuoted, singleQuoted, unquoted] of raw.matchAll(
        /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
      )) {
        attributes[name] = doubleQuoted ?? singleQuoted ?? unquoted ?? '';
      }
      const element = makeElement(tag, attributes);
      stack.at(-1)?.appendChild(element);
      if (attributes.id) elements.set(attributes.id, element);
      if (tag === 'input') inputs.push(element);
      if (tag === 'html') document.documentElement = element;
      if (tag === 'body') document.body = element;
      if (!voidTags.has(tag)) stack.push(element);
    }
  }

  function dispatch(target, name, extra = {}) {
    let stopped = false;
    let prevented = false;
    const event = {
      target,
      ...extra,
      preventDefault() { prevented = true; },
      stopPropagation() { stopped = true; }
    };
    for (let node = target; node && !stopped; node = node.parentElement) {
      node.dispatch(name, {...event, currentTarget: node});
    }
    if (!stopped) document.dispatch(name, {...event, currentTarget: document});
    if (!stopped) window.dispatch(name, {...event, currentTarget: window});
    return prevented;
  }

  function press(field, key) {
    const prevented = dispatch(field, 'keydown', {key});
    if (key !== 'Enter' || prevented) return;
    for (let node = field.parentElement; node; node = node.parentElement) {
      if (node.tagName !== 'FORM') continue;
      dispatch(node, 'submit');
      return;
    }
  }

  loadMarkup();
  vm.runInNewContext(fs.readFileSync(path.join(ui, 'sidebar.js'), 'utf8'), {
    document, window, iina: page.iina, requestAnimationFrame: () => 0, cancelAnimationFrame() {}
  }, {filename: 'sidebar.js'});

  return {page, document, inputs, press, clickOpen: () => dispatch(elements.get('open'), 'click')};
}

test('A1.4 sidebar plus reveals a focused field with Return, Escape, and inline errors', () => {
  const {page, document, inputs, press, clickOpen} = sidebarPage();
  const initiallyVisible = new Set(inputs.filter(isVisible));
  const initialPosts = page.posts.length;

  clickOpen();
  assert.equal(page.posts.length, initialPosts, 'plus should reveal a local field without posting a message');
  const field = document.activeElement;
  assert.equal(field?.tagName, 'INPUT', 'plus should focus the stream input');
  assert.equal(initiallyVisible.has(field), false, 'the stream input should start hidden');
  assert.equal(isVisible(field), true, 'the stream input should be visible after plus');

  field.value = 'not a stream';
  press(field, 'Enter');
  assert.deepEqual(page.messages('open'), [{name: 'open', data: {input: 'not a stream'}}]);

  page.receiveEnvelope('open-error', {message: 'Invalid stream'});
  assert.equal(field.getAttribute('aria-invalid'), 'true');
  assert.equal(field.value, 'not a stream', 'invalid text should be kept for correction');

  const submittedPosts = page.posts.length;
  press(field, 'Escape');
  assert.equal(isVisible(field), false, 'Escape should hide the field');
  assert.equal(page.posts.length, submittedPosts, 'Escape must not post a message');

  clickOpen();
  assert.equal(isVisible(field), true, 'plus should reopen the field');
  clickOpen();
  assert.equal(isVisible(field), false, 'a second plus click should hide the field');
  assert.equal(page.posts.length, submittedPosts, 'toggling the field must not post a message');
});
