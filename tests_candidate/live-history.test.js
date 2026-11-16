'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {reduce} = require('../candidate-plugin/ui/live-history.js');
const message = (id, extra = {}) => ({type: 'message', id, channel: 'example', author: 'Alice', login: 'alice', userId: '7', text: 'Hello', ...extra});

test('the reducer is pure and preserves identity for later moderation', () => {
  const input = Object.freeze([Object.freeze(message('old'))]);
  const batch = Object.freeze([Object.freeze(message('new', {text: '<script>alert(1)</script> 😀', badges: 'moderator/1', action: true}))]);
  const output = reduce(input, batch);
  assert.deepEqual(input.map(m => m.id), ['old']); assert.equal(batch[0].type, 'message');
  assert.deepEqual(output.map(m => m.id), ['old', 'new']);
  assert.notEqual(output[0], input[0]); assert.equal(output[1].login, 'alice'); assert.equal(output[1].userId, '7');
  assert.equal(output[1].text, '<script>alert(1)</script> 😀'); assert.equal(output[1].kind, 'message');
  assert.equal(output[1].badges, 'moderator/1'); assert.equal(output[1].action, true);
});

test('message deletion, user deletion, and clearing apply in received order', () => {
  const output = reduce([message('one'), message('two', {login: 'bob', userId: '8'})], [
    {type: 'clear-message', channel: 'example', id: 'one'},
    message('three'),
    {type: 'clear-user', channel: 'example', userId: '8', login: 'bob'},
    message('four', {login: 'carol', userId: '9'})
  ]);
  assert.deepEqual(output.map(m => m.id), ['three', 'four']);
  assert.deepEqual(reduce(output, [{type: 'clear-all', channel: 'example'}, message('after')]).map(m => m.id), ['after']);
});

test('user deletion supports either user id or login without removing other rooms', () => {
  const input = [message('id'), message('login', {userId: ''}), message('other', {channel: 'other'})];
  const byId = reduce(input, [{type: 'clear-user', channel: 'example', userId: '7', login: ''}]);
  assert.deepEqual(byId.map(m => m.id), ['login', 'other']);
  const byLogin = reduce(input, [{type: 'clear-user', channel: '#EXAMPLE', userId: '', login: 'ALICE'}]);
  assert.deepEqual(byLogin.map(m => m.id), ['other']);
  assert.deepEqual(reduce(input, [{type: 'clear-all', channel: 'unrelated'}]).map(m => m.id), ['id', 'login', 'other']);
});

test('notices have display kind and do not collide with message IDs or user moderation', () => {
  const history = reduce([], [message('same'), {type: 'notice', channel: 'example', id: 'same', text: 'Read-only notice'}]);
  assert.equal(history[1].kind, 'notice'); assert.equal(history[1].author, '');
  const remaining = reduce(history, [{type: 'clear-message', channel: 'example', id: 'same'}, {type: 'clear-user', channel: 'example', userId: '7'}]);
  assert.equal(remaining.length, 1); assert.equal(remaining[0].kind, 'notice');
  assert.deepEqual(reduce(remaining, [{type: 'clear-all', channel: 'example'}]), []);
});

test('the latest messages stay bounded for every requested limit including an oversized history', () => {
  const events = Array.from({length: 1000}, (_, n) => message(String(n)));
  const full = reduce([], events); assert.equal(full.length, 150); assert.equal(full[0].id, '850');
  assert.equal(reduce(events, [], 100000).length, 150);
  const small = reduce(full, [message('last')], 3); assert.deepEqual(small.map(m => m.id), ['998', '999', 'last']);
  assert.deepEqual(reduce(full, events, 0), []);
  assert.equal(reduce([], events, NaN).length, 150);
});

test('repeated message ids deduplicate by room while repeated generic notices remain visible', () => {
  const output = reduce([message('same')], [message('same'), message('same', {channel: 'other'}),
    {type: 'notice', channel: 'example', id: 'generic', text: 'First'},
    {type: 'notice', channel: 'example', id: 'generic', text: 'Second'}]);
  assert.equal(output.length, 4); assert.deepEqual(output.slice(-2).map(m => m.text), ['First', 'Second']);
});

test('unknown records cannot copy secrets or arbitrary properties into history', () => {
  const output = reduce(null, [null, {}, {type: 'unknown'}, message('safe', {token: 'secret', html: '<bad>', color: 'url(evil)', text: 'x'.repeat(5000), timestampMs: Infinity})]);
  assert.equal(output.length, 1); assert.equal(output[0].text.length, 2000); assert.equal(output[0].color, '');
  assert.equal(output[0].timestampMs, 0); assert.equal('token' in output[0], false); assert.equal('html' in output[0], false);
  assert.deepEqual(reduce(output, null), output);
});

test('empty moderation targets cannot remove unrelated history', () => {
  const input = [message('safe')];
  const output = reduce(input, [{type: 'clear-message', channel: 'example', id: ''},
    {type: 'clear-user', channel: 'example', userId: '', login: ''}, {type: 'clear-all'}]);
  assert.deepEqual(output.map(m => m.id), ['safe']);
});
