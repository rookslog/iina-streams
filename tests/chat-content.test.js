'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const CC = require('../ui/chat-content.js');
const tw = CC.twitch;
const T = text => ({type: 'text', text});
const E = (id, name) => ({type: 'emote', name, provider: 'twitch', url: `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/1.0`, url2x: `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`});

test('single emote splits text around it', () => {
  assert.deepEqual(tw.segments('hi Kappa there', '25:3-7'), [T('hi '), E('25', 'Kappa'), T(' there')]);
});
test('emote at start and end, and repeated emote', () => {
  assert.deepEqual(tw.segments('Kappa', '25:0-4'), [E('25', 'Kappa')]);
  assert.deepEqual(tw.segments('Kappa x Kappa', '25:0-4,8-12'), [E('25', 'Kappa'), T(' x '), E('25', 'Kappa')]);
});
test('multiple different emotes, tag order does not matter', () => {
  assert.deepEqual(tw.segments('Kappa LUL', '425618:6-8/25:0-4'), [E('25', 'Kappa'), T(' '), E('425618', 'LUL')]);
});
test('v2 style ids with underscores are accepted', () => {
  assert.equal(tw.segments('hey', 'emotesv2_abc123:0-2')[0].url, 'https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_abc123/default/dark/1.0');
});
test('positions count code points: emoji before an emote', () => {
  assert.deepEqual(tw.segments('😀 Kappa', '25:2-6'), [T('😀 '), E('25', 'Kappa')]);
  assert.deepEqual(tw.segments('😀😀 Kappa 😀 Kappa', '25:3-7,11-15'), [T('😀😀 '), E('25', 'Kappa'), T(' 😀 '), E('25', 'Kappa')]);
});
test('astral character after emote', () => {
  assert.deepEqual(tw.segments('Kappa 𝒳', '25:0-4'), [E('25', 'Kappa'), T(' 𝒳')]);
});
test('empty or absent tag and empty text', () => {
  assert.deepEqual(tw.segments('hello', ''), [T('hello')]);
  assert.deepEqual(tw.segments('hello', undefined), [T('hello')]);
  assert.deepEqual(tw.segments('', '25:0-4'), []);
  assert.deepEqual(tw.segments('', ''), []);
  assert.deepEqual(tw.segments(undefined, undefined), []);
  assert.deepEqual(tw.segments(null, null), []);
});
test('malformed, overlapping, reversed and out-of-range tags fall back to plain text without throwing', () => {
  const bad = ['garbage', '25', '25:', ':0-4', '25:a-b', '25:0-', '25:-1-3', '25:4-0', '25:0-99', '25:0-4,3-6', '25:0-4/1:2-3', '25:0-4,,6-7', '25:0-4/', 'a b:0-1', '25:0-4:1', '25:99999999-99999999', 5, {}, ['25:0-4']];
  for (const tag of bad) assert.deepEqual(tw.segments('Kappa test', tag), [T('Kappa test')], String(tag));
});
test('positions valid in UTF-16 units but not code points are rejected', () => {
  assert.deepEqual(tw.segments('😀', '25:0-1'), [T('😀')]);
});
test('badges parse to set/version pairs and skip junk', () => {
  assert.deepEqual(tw.badges('broadcaster/1,subscriber/12,bits/100'), [{set: 'broadcaster', version: '1'}, {set: 'subscriber', version: '12'}, {set: 'bits', version: '100'}]);
  assert.deepEqual(tw.badges('moderator/1,bad,/2,x y/1,<b>/1'), [{set: 'moderator', version: '1'}]);
  assert.deepEqual(tw.badges(''), []); assert.deepEqual(tw.badges(undefined), []); assert.deepEqual(tw.badges(7), []);
});
test('emote url helper', () => {
  assert.equal(tw.emoteUrl('25', 2), 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0');
  assert.equal(tw.emoteUrl('25'), 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0');
});

// Minimal DOM double; any innerHTML/outerHTML assignment throws.
function fakeDoc() {
  class El {
    constructor(tag) { this.tag = tag; this.listeners = {}; this.parentNode = null; }
    set innerHTML(_) { throw new Error('innerHTML used'); }
    set outerHTML(_) { throw new Error('outerHTML used'); }
    addEventListener(n, f) { this.listeners[n] = f; }
    replaceWith(n) { this.replaced = n; }
  }
  return {createElement: tag => new El(tag), createTextNode: text => ({nodeType: 3, text})};
}

test('renderSegments builds img with alt/title/size and text nodes', () => {
  const nodes = CC.renderSegments(tw.segments('hi Kappa', '25:3-7'), {document: fakeDoc(), size: 20});
  assert.equal(nodes.length, 2);
  assert.deepEqual(nodes[0], {nodeType: 3, text: 'hi '});
  const img = nodes[1];
  assert.equal(img.tag, 'img'); assert.equal(img.alt, 'Kappa'); assert.equal(img.title, 'Kappa');
  assert.equal(img.width, 20); assert.equal(img.height, 20);
  assert.equal(img.src, E('25', 'Kappa').url); assert.equal(img.srcset, E('25', 'Kappa').url2x + ' 2x');
});
test('failed image falls back to the emote name as text', () => {
  const img = CC.renderSegments(tw.segments('Kappa', '25:0-4'), {document: fakeDoc()})[0];
  img.parentNode = {}; img.listeners.error();
  assert.equal(img.replaced.tag, 'span'); assert.equal(img.replaced.textContent, 'Kappa');
});
test('text is never interpreted as HTML', () => {
  const evil = '<img src=x onerror=alert(1)> <script>x</script>';
  assert.deepEqual(CC.renderSegments(tw.segments(evil, ''), {document: fakeDoc()}), [{nodeType: 3, text: evil}]);
  const hostile = '<b onclick=x>';
  const [img] = CC.renderSegments(tw.segments(hostile, '25:0-12'), {document: fakeDoc()});
  assert.equal(img.tag, 'img'); assert.equal(img.alt, hostile);
});
test('renderSegments refuses non-CDN image urls and tolerates junk input', () => {
  const doc = fakeDoc();
  const nodes = CC.renderSegments([{type: 'emote', name: 'x', url: 'https://evil.example/a.png', provider: 'twitch'}, null, {type: 'emote', name: 'y', url: 'javascript:alert(1)'}], {document: doc});
  assert.deepEqual(nodes.map(n => n.text), ['x', 'y']);
  assert.deepEqual(CC.renderSegments(null, {document: doc}), []);
  assert.deepEqual(CC.renderSegments([T('a')], {}), []);
});
