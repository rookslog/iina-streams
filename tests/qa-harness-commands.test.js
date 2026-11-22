'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {createIina} = require('./support/iina-shim.js');

const HARNESS = path.join(__dirname, '../qa/qa-harness.js');

function start(snapshot) {
  const shim = createIina({identifier: 'local.iina.streams.dev'});
  const module = {exports: {}};
  shim.runScript(HARNESS, {globals: {module}});
  const commands = [];
  // The harness runs in a vm context; copy through JSON so deepEqual compares plain objects.
  const record = (name, data) => commands.push(JSON.parse(JSON.stringify({name, data})));
  const controller = {snapshot: () => snapshot, qaCommand: record};
  module.exports.run(shim.iina, controller, {variant: 'unified'}, {trace() {}});

  async function request(id, command, data = {}, raw) {
    shim.file.seed('@data/qa-request.json', raw === undefined ? JSON.stringify({id, command, data}) : raw);
    await Promise.all(shim.timers.pending().map(timer => shim.timers.fire(timer)));
    return JSON.parse(shim.file.get('@data/qa-response.json'));
  }
  return {shim, commands, request, stop: () => shim.emit('iina.window-will-close')};
}

const plain = {phase: 'playing', source: {id: 'fixture'}, chat: {mode: 'live'}, messages: []};

test('click goes to the sidebar qa hook by element id and rejects anything else', async t => {
  const qa = start(plain);
  t.after(qa.stop);

  const ok = await qa.request('c1', 'click', {id: '#refresh'});
  assert.equal(ok.result, true);
  assert.deepEqual(qa.commands, [{name: 'click', data: {id: 'refresh'}}]);

  const bad = await qa.request('c2', 'click', {id: 'a b; drop'});
  assert.match(bad.result.error, /element id/);
  const overlay = await qa.request('c3', 'click', {id: 'panel', target: 'overlay'});
  assert.match(overlay.result.error, /sidebar/);
  assert.equal(qa.commands.length, 1, 'rejected clicks must not reach the hook');
});

test('open without a url is an error response and posts nothing', async t => {
  const qa = start(plain);
  t.after(qa.stop);
  const response = await qa.request('o1', 'open', {});
  assert.match(response.result.error, /url/);
  assert.deepEqual(qa.shim.global.messages('qa-open'), []);
});

test('a malformed request file gets an error response, not a throw', async t => {
  const qa = start(plain);
  t.after(qa.stop);
  const response = await qa.request('ignored', 'state', {}, '{not json');
  assert.match(response.result.error, /failed/);
});

test('state redacts credential-shaped values under innocent keys but keeps message ids', async t => {
  const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
  const opaque = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7';
  const qa = start({
    ...plain,
    messages: [{id: uuid, author: 'viewer', text: 'hello'}],
    notes: {header: 'Bearer ' + opaque, line: opaque, url: 'https://x.test/a?sig=' + opaque, oauth: 'oauth:' + opaque},
  });
  t.after(qa.stop);
  const response = await qa.request('s1', 'state');
  const serialized = JSON.stringify(response.state);
  assert.equal(serialized.includes(opaque), false, 'no credential-shaped value may survive');
  assert.equal(response.state.controller.messages[0].id, uuid);
  assert.equal(response.state.redactedFields, 4);
});
