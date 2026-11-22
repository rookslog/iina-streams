'use strict';
// v0.5.5 review r1 #11: when settings.json is unreadable and the recovery copy cannot be written, src/io.js
// must say so with its own code and must not overwrite settings.json, which is then the only copy.
// The shim's file.write either throws (as a failed IINA write may) or, in the second mode, drops the write
// without an error; the IINA v1.5.1 failure mode was not checked, so both are covered.
const test = require('node:test');
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {format} = require('node:util');
const {createIina} = require('./support/iina-shim.js');

const SETTINGS = '@data/settings.json';
const MARKER = 'fake-unreadable-settings-r1';
const CORRUPT = ` {\r\n  "label": "${MARKER}"\n`;
const KEPT = 'Streams: settings.json was unreadable; kept a copy and used defaults';

function setup(failMode) {
  const shim = createIina();
  shim.timers.advance(1_700_000_000_000);
  shim.file.seed(SETTINGS, CORRUPT);
  const write = shim.iina.file.write;
  const failed = [];
  if (failMode !== 'none') shim.iina.file.write = (path, content) => {
    if (String(path).includes('.corrupt-')) {
      failed.push(path);
      if (failMode === 'throw') throw new Error('write failed');
      return;
    }
    write(path, content);
  };
  const module = {exports: {}};
  shim.runScript(join(__dirname, '../src/io.js'), {
    require: () => ({}),
    globals: {module, Date: shim.timers.Date}
  });
  return {io: module.exports.create(shim.iina), shim, failed};
}

function lines(shim) {
  return [...shim.console.logs, ...shim.console.errors].map(args => format(...args));
}

for (const failMode of ['throw', 'drop']) {
  test(`a backup that fails (${failMode}) is reported and the unreadable settings.json survives later saves`, () => {
    const {io, shim, failed} = setup(failMode);
    assert.deepEqual(structuredClone(io.readSettings()), {});
    assert.equal(failed.length, 1, 'the backup write was attempted');
    const logged = lines(shim);
    assert.ok(logged.some(line => line.includes('settings-backup-failed')), 'the failure has its own code');
    assert.equal(logged.includes(KEPT), false, 'a failed backup is never reported as kept');
    assert.equal(logged.some(line => line.includes(MARKER)), false, 'no settings text in logs');

    // player.js reads, merges one change and saves the whole object (src/player.js saveSetting).
    io.saveSettings(Object.assign({}, io.readSettings(), {fontSize: 16}));
    io.saveSettings(Object.assign({}, io.readSettings(), {timestamps: true}));
    assert.equal(shim.file.get(SETTINGS), CORRUPT, 'the only copy of the unreadable settings is kept');
    assert.deepEqual(structuredClone(io.readSettings()), {fontSize: 16, timestamps: true},
      'changes last for the session');
    assert.equal(failed.length, 1, 'held settings are not re-read, so the backup is not retried on every read');
  });
}

test('a successful backup still reports a kept copy and lets settings.json be replaced', () => {
  const {io, shim, failed} = setup('none');
  assert.deepEqual(structuredClone(io.readSettings()), {});
  assert.equal(failed.length, 0);
  const backup = `${SETTINGS}.corrupt-${shim.timers.now}`;
  assert.equal(shim.file.get(backup), CORRUPT);
  const logged = lines(shim);
  assert.ok(logged.includes(KEPT));
  assert.equal(logged.some(line => line.includes('settings-backup-failed')), false);
  io.saveSettings({fontSize: 16});
  assert.deepEqual(JSON.parse(shim.file.get(SETTINGS)), {fontSize: 16});
});

// Lead request (same data-loss class as r1 #11): a settings.json that exists but cannot be read must not be
// overwritten either. No text can be copied, so settings are held in memory for the session.
for (const readMode of ['throw', 'non-string']) {
  test(`an existing settings.json whose read fails (${readMode}) is never overwritten by a later save`, () => {
    const shim = createIina();
    shim.file.seed(SETTINGS, CORRUPT);
    const read = shim.iina.file.read;
    shim.iina.file.read = path => {
      if (path === SETTINGS) {
        if (readMode === 'throw') throw new Error('read failed');
        return undefined;
      }
      return read(path);
    };
    const module = {exports: {}};
    shim.runScript(join(__dirname, '../src/io.js'), {require: () => ({}), globals: {module}});
    const io = module.exports.create(shim.iina);
    assert.deepEqual(structuredClone(io.readSettings()), {});
    io.saveSettings(Object.assign({}, io.readSettings(), {fontSize: 16}));
    assert.equal(shim.file.get(SETTINGS), CORRUPT, 'the unreadable file is left as is');
    assert.deepEqual(structuredClone(io.readSettings()), {fontSize: 16}, 'changes last for the session');
    const logged = lines(shim);
    assert.ok(logged.some(line => line.includes('settings-backup-failed')));
    assert.equal(logged.some(line => line.includes(MARKER)), false);
  });
}

test('a missing settings.json still reads as defaults and the first save writes it', () => {
  const shim = createIina();
  const module = {exports: {}};
  shim.runScript(join(__dirname, '../src/io.js'), {require: () => ({}), globals: {module}});
  const io = module.exports.create(shim.iina);
  assert.deepEqual(structuredClone(io.readSettings()), {});
  io.saveSettings({fontSize: 16});
  assert.deepEqual(JSON.parse(shim.file.get(SETTINGS)), {fontSize: 16});
  assert.equal(lines(shim).length, 0, 'a missing file is not an error');
});
