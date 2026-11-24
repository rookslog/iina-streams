'use strict';
// #65 (0.5.6, lead, 2026-11-24): @data/last-session.json says which window wrote each entry.
//
// Choice (no new IINA API): global is the only writer, keyed by the sender's IINA label. A player's own code can
// read only its stream label (getLabel returns userLabel, JavascriptAPIGlobal.swift:125), and two windows of one
// stream share it. But IINA tags every message a player posts to global with that PlayerCore's own label, unique
// per window: "N-<identifier>" for a window Streams created, a bare number for IINA's own (JavascriptAPIGlobal.swift
// :62 and :130). A window keeps its label when its plugin context is replaced, and the context's instanceId changes.
//
// Protocol: the player posts `diag` {instanceId, instanceStartedAt, steps} and writes no file. Global writes
// {version: 2, windows: {<label>: {instanceId, instanceStartedAt, writtenAt, steps}}} and keeps the 8 most recently
// written windows.
// Mutation check: keying by anything but the sender's label (or writing one record) fails test 3.
const test = require('node:test');
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const {join} = require('node:path');
const {createIina} = require('./support/iina-shim.js');

const SCRIPT = join(__dirname, '../global.js');
const requireFromGlobal = createRequire(SCRIPT);
const ID = 'local.iina.streams.diag-test';
const FILE = '@data/last-session.json';
const settle = () => new Promise(resolve => setImmediate(resolve));

function loadGlobal() {
  const shim = createIina({role: 'global', identifier: ID});
  shim.runScript(SCRIPT, {
    require(name) {
      if (name === './config.js') return {identifier: ID, variant: 'unified', qa: false};
      return requireFromGlobal(name);
    },
  });
  const file = () => {
    const text = shim.file.get(FILE);
    return text === undefined ? undefined : JSON.parse(text);
  };
  const diag = (label, instanceId, steps = [{step: 'x', t: 1}]) =>
    shim.global.send('diag', {instanceId, instanceStartedAt: '2026-11-24T22:00:00.000Z', steps}, label);
  return {shim, file, diag};
}

// The player half is the amended #60 lifetime probe in tests/listener-registry.test.js, whose overlay fixture reaches
// a diagnostics step. A new instanceId per JS context is #60's existing design (a module-level constant).

test('#65 3. global keys entries by window, so same window with a new context differs from a different window', async () => {
  const g = loadGlobal();
  g.diag('1-' + ID, 'aaaa1111');
  g.diag('2-' + ID, 'bbbb2222');
  await settle();
  assert.deepEqual(Object.keys(g.file().windows).sort(), ['1-' + ID, '2-' + ID], 'one entry per window');
  assert.equal(g.file().version, 2);

  g.diag('1-' + ID, 'cccc3333');
  await settle();
  const windows = g.file().windows;
  assert.deepEqual(Object.keys(windows).sort(), ['1-' + ID, '2-' + ID], 'same window, new context: the key stays');
  assert.equal(windows['1-' + ID].instanceId, 'cccc3333', 'and its instanceId changes');
  assert.equal(windows['2-' + ID].instanceId, 'bbbb2222', 'the other window is untouched');
  assert.equal(typeof windows['1-' + ID].writtenAt, 'string');
});

test('#65 4. at most 8 windows are kept: the least recently written goes', async () => {
  const g = loadGlobal();
  for (let n = 1; n <= 9; n++) g.diag(String(n), 'id' + n);
  await settle();
  const keys = Object.keys(g.file().windows);
  assert.equal(keys.length, 8);
  assert.ok(!keys.includes('1'), 'the oldest window is dropped');
});

test('#65 5. malformed diag messages and messages with no window label write nothing', async () => {
  const g = loadGlobal();
  g.shim.global.send('diag', {instanceId: 'x'.repeat(200), steps: []}, '1-' + ID);
  g.shim.global.send('diag', {instanceId: 'ok1', steps: 'nope'}, '1-' + ID);
  g.shim.global.send('diag', ['array'], '1-' + ID);
  g.shim.global.send('diag', {instanceId: 'ok2', steps: []}, null);
  await settle();
  assert.equal(g.file(), undefined);
  g.diag('1-' + ID, 'ok3', Array.from({length: 60}, (_, i) => ({step: 's' + i, t: i})));
  await settle();
  assert.equal(g.file().windows['1-' + ID].steps.length, 40, 'steps are capped at 40');
});
