'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createWebViewIina} = require('./support/iina-shim.js');

const ui = path.join(__dirname, '..', 'ui');
const emoteID = 'emotesv2_test_only';
const emoteOrigin = 'https://static-cdn.jtvnw.net';
const readUI = file => fs.readFileSync(path.join(ui, file), 'utf8');

function textNode(text) {
  const value = String(text);
  return {nodeType: 3, nodeName: '#text', nodeValue: value, textContent: value, childNodes: []};
}

function element(tag) {
  return {
    nodeType: 1,
    nodeName: tag.toUpperCase(),
    tagName: tag.toUpperCase(),
    className: '',
    childNodes: [],
    dataset: {},
    attributes: {},
    style: {setProperty() {}},
    hidden: false,
    scrollTop: 0,
    scrollHeight: 0,
    clientHeight: 200,
    addEventListener() {},
    get children() { return this.childNodes.filter(node => node.nodeType === 1); },
    append(...nodes) { for (const node of nodes) this.appendChild(node); },
    appendChild(node) {
      this.childNodes.push(typeof node === 'string' ? textNode(node) : node);
      return node;
    },
    replaceChildren(...nodes) {
      this.childNodes = [];
      this.append(...nodes);
    },
    get textContent() { return this.childNodes.map(node => node.textContent).join(''); },
    set textContent(value) { this.replaceChildren(...(value === '' ? [] : [textNode(value)])); },
    set innerHTML(_) { throw new Error('Chat must not assign innerHTML'); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name] ?? this[name]?.toString() ?? null; },
    hasAttribute(name) { return this.getAttribute(name) !== null; },
    querySelectorAll(selector) {
      const descendants = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
      if (selector === '*') return descendants;
      const [tag, className] = selector.split('.');
      return descendants.filter(node => (!tag || node.tagName === tag.toUpperCase()) &&
        (!className || node.className.split(/\s+/).includes(className)));
    }
  };
}

function chatPage(surface, message) {
  const page = createWebViewIina();
  const html = readUI(surface + '.html');
  const elements = Object.fromEntries(
    Array.from(html.matchAll(/\bid="([^"]+)"/g), ([, id]) => [id, element('div')])
  );
  // The overlay marks its descendants clickable; make its message list part of that tree.
  elements.panel?.append(elements.messages, elements['resize-handle']);
  const document = {
    body: element('body'),
    documentElement: element('html'),
    hidden: false,
    getElementById: id => elements[id],
    createElement: element,
    createTextNode: textNode,
    addEventListener() {}
  };
  const context = vm.createContext({
    document,
    iina: page.iina,
    Node: {ELEMENT_NODE: 1, TEXT_NODE: 3},
    innerWidth: 1280,
    innerHeight: 800,
    getComputedStyle: node => node.style,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
    addEventListener() {}
  });
  context.window = context;
  // Run the scripts the page actually loads, without WebKit or image/network loading.
  for (const [, file] of html.matchAll(/<script\s+src="([^"]+)"/g)) {
    vm.runInContext(readUI(file), context, {filename: file});
  }
  page.receiveEnvelope('state', {
    variant: 'unified',
    source: {kind: 'twitch-live', provider: 'twitch', id: 'test_channel'},
    title: 'Test stream',
    live: true,
    formats: [],
    quality: 'auto720',
    phase: 'playing',
    busy: false,
    error: '',
    auth: {phase: 'ready'},
    chat: {mode: 'live', state: 'connected', count: 1},
    view: {presentation: surface, fontSize: 14, opacity: 0.58, timestamps: false},
    messages: [{id: 'test-message', kind: 'message', author: 'TestViewer', ...message}],
    qa: true
  });

  const rows = elements.messages.children;
  assert.equal(rows.length, 1, 'the page should render the state message');
  const body = rows[0].children.at(-1);
  return {
    body,
    document,
    inspect() {
      page.receiveEnvelope('qa-action', {name: 'inspect'});
      const result = page.messages('qa-result').at(-1)?.data;
      assert.ok(result, 'QA inspect should post a result');
      assert.equal(result.error, undefined, 'QA inspect should succeed');
      return result;
    }
  };
}

function imageDirectives(html) {
  const meta = html.match(/<meta\b[^>]*\bhttp-equiv=["']Content-Security-Policy["'][^>]*>/i);
  assert.ok(meta, 'the page should declare a Content-Security-Policy');
  const content = meta[0].match(/\bcontent=(?:"([^"]*)"|'([^']*)')/i);
  assert.ok(content, 'the CSP meta tag should have a content attribute');
  return (content[1] ?? content[2]).split(';')
    .map(directive => directive.trim().split(/\s+/))
    .filter(([name]) => name.toLowerCase() === 'img-src');
}

for (const surface of ['sidebar', 'overlay']) {
  test('B1 ' + surface + ' renders a Twitch emote image followed by the remaining text', () => {
    const {body} = chatPage(surface, {text: 'Kappa hi', emotes: emoteID + ':0-4'});

    const [img, tail] = body.childNodes;
    assert.equal(img?.tagName, 'IMG', 'the emote should be rendered as an image, not as text');
    assert.ok(img.className.split(/\s+/).includes('emote'));
    assert.equal(img.getAttribute('alt'), 'Kappa');
    assert.equal(img.getAttribute('title'), 'Kappa');
    const src = new URL(img.getAttribute('src'));
    assert.equal(src.origin, emoteOrigin);
    assert.ok(src.pathname.startsWith('/emoticons/v2/' + emoteID + '/'), 'the CDN path should use the tag ID');
    for (const dimension of ['width', 'height']) {
      assert.match(img.getAttribute(dimension) ?? '', /^[1-9]\d*$/, dimension + ' should be fixed in pixels');
    }
    assert.equal(tail?.nodeType, 3);
    assert.equal(tail.textContent, ' hi');
    assert.equal(body.childNodes.length, 2);
  });

  test('B1 ' + surface + ' renders a message without emotes as literal text only', () => {
    const text = 'Kappa hi <b>plain text</b>';
    const {body, inspect} = chatPage(surface, {text});

    assert.equal(body.textContent, text);
    assert.equal(body.children.length, 0);
    assert.deepEqual(inspect().renderedMessages, ['TestViewer' + text]);
  });

  test('B1 ' + surface + ' does not assign innerHTML in its chat script', () => {
    assert.doesNotMatch(readUI(surface + '.js'), /(?:\.\s*innerHTML|\[\s*['"]innerHTML['"]\s*\])\s*\+?=(?!=)/);
  });

  test('B1 ' + surface + ' CSP allows images only from the Twitch emote CDN', () => {
    assert.deepEqual(imageDirectives(readUI(surface + '.html')), [['img-src', emoteOrigin]]);
  });

  test('B1 ' + surface + ' QA renderedMessages includes the image alt text in order', () => {
    const page = chatPage(surface, {text: 'before and after'});
    // Isolate the digest from renderer wiring: this name exists only in the DOM image's alt.
    const img = page.document.createElement('img');
    img.className = 'emote';
    img.alt = 'Kappa';
    page.body.replaceChildren(page.document.createTextNode('before '), img, page.document.createTextNode(' after'));

    assert.deepEqual(page.inspect().renderedMessages, ['TestViewerbefore Kappa after']);
  });
}
