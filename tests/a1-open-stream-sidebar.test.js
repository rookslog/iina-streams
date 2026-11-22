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
  const focusState = {pageFocused: true};
  const document = {
    ...eventTarget(),
    activeElement: null,
    hidden: false,
    getElementById: id => elements.get(id) || null,
    createElement: tag => makeElement(tag),
    hasFocus: () => focusState.pageFocused
  };

  // Browser focus rules the open field depends on: focusing an element fires focusout on the previous one,
  // and hiding an ancestor of the focused element removes focus (focus fixup), with no relatedTarget.
  function moveFocus(next) {
    const previous = document.activeElement;
    if (previous === next) return;
    document.activeElement = next;
    if (previous) dispatch(previous, 'focusout', {relatedTarget: next});
  }
  const window = eventTarget();

  function makeElement(tag, attributes = {}) {
    let hidden = Object.hasOwn(attributes, 'hidden');
    return {
      ...eventTarget(),
      tagName: tag.toUpperCase(),
      get hidden() { return hidden; },
      set hidden(value) {
        hidden = !!value;
        if (hidden && document.activeElement && this.contains(document.activeElement)) moveFocus(null);
      },
      contains(node) {
        for (let current = node; current; current = current.parentElement) if (current === this) return true;
        return false;
      },
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
        if (isVisible(this)) moveFocus(this);
      },
      blur() {
        if (document.activeElement === this) moveFocus(null);
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

  // A key goes to the focused element, or to the body when nothing has focus.
  function pressFocused(key) {
    return dispatch(document.activeElement || document.body, 'keydown', {key});
  }

  // A pointer press on a button. WebKit on macOS does not focus a clicked button, so unless mousedown is
  // prevented, focus leaves the focused element for the body (relatedTarget null).
  function pointerClick(element) {
    if (!dispatch(element, 'mousedown')) moveFocus(null);
    dispatch(element, 'click');
  }

  return {
    page, document, inputs, press, pressFocused, pointerClick, focusState, moveFocus,
    element: id => elements.get(id),
    clickOpen: () => dispatch(elements.get('open'), 'click')
  };
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

// Observed natively (2026-11-22): invalid text, Return, then Escape left the field open. Which link fails in
// IINA's WKWebView is INFERRED, not observed: after Return hides the field, focus leaves it, and if showing it
// for open-error does not bring focus back, Escape reaches the body, not the field. Staged here by hand.
test('A1.4 Escape hides the field after an inline error even when focus did not return to it', () => {
  const {page, document, press, pressFocused, clickOpen} = sidebarPage();
  clickOpen();
  const field = document.activeElement;
  field.value = 'not a stream';
  press(field, 'Enter');
  assert.equal(isVisible(field), false, 'Return hides the field while global parses');
  assert.equal(document.activeElement, null, 'hiding the field removed its focus');
  page.receiveEnvelope('open-error', {});
  assert.equal(isVisible(field), true);
  assert.equal(field.getAttribute('aria-invalid'), 'true');
  document.activeElement = null;
  const posts = page.posts.length;
  pressFocused('Escape');
  assert.equal(isVisible(field), false, 'Escape must hide the field wherever focus is');
  assert.equal(page.posts.length, posts, 'Escape must not post');
});

test('A1.4 the open field hides when focus moves elsewhere in the sidebar, not when the page loses focus', () => {
  const {document, focusState, moveFocus, element, clickOpen} = sidebarPage();
  clickOpen();
  const field = document.activeElement;
  field.value = 'xqc';
  moveFocus(element('quality'));
  assert.equal(isVisible(field), false, 'focus moving to another control hides the field');

  clickOpen();
  assert.equal(isVisible(field), true);
  focusState.pageFocused = false;
  moveFocus(null);
  assert.equal(isVisible(field), true, 'switching apps to copy a URL keeps the field');
});

test('A1.4 pressing + while the field has focus closes it rather than reopening it', () => {
  const {document, pointerClick, element} = sidebarPage();
  pointerClick(element('open'));
  const field = document.activeElement;
  assert.equal(field?.tagName, 'INPUT');
  assert.equal(element('open').getAttribute('aria-expanded'), 'true');
  pointerClick(element('open'));
  assert.equal(isVisible(field), false);
  assert.equal(element('open').getAttribute('aria-expanded'), 'false');
});

test('A1.4 an inline error after Return shows the field again with its text and focus', () => {
  const {page, document, press, clickOpen} = sidebarPage();
  clickOpen();
  const field = document.activeElement;
  field.value = 'not a stream';
  press(field, 'Enter');
  page.receiveEnvelope('open-error', {});
  assert.equal(isVisible(field), true, 'focusout from the submit must not hide the re-shown field');
  assert.equal(document.activeElement, field);
  assert.equal(field.value, 'not a stream');
});
