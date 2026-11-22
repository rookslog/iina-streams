'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {format} = require('node:util');
const {createIina} = require('./support/iina-shim.js');

const SETTINGS = '@data/settings.json';
const CORRUPT_MARKER = 'fake-unreadable-settings';
const CORRUPT_SETTINGS = ` {\r\n  "label": "${CORRUPT_MARKER}"\n`;
const WARNING = 'Streams: settings.json was unreadable; kept a copy and used defaults';

function setup(settings) {
  const shim = createIina();
  shim.timers.advance(1_700_000_000_000);
  if (settings !== undefined) shim.file.seed(SETTINGS, settings);
  const module = {exports: {}};
  shim.runScript(join(__dirname, '../src/io.js'), {
    require: () => ({}),
    globals: {module, Date: shim.timers.Date}
  });
  return {io: module.exports.create(shim.iina), shim};
}

test('B2a io defaults on corrupt settings and preserves the exact text through a later save', () => {
  const {io, shim} = setup(CORRUPT_SETTINGS);
  const backup = `${SETTINGS}.corrupt-${shim.timers.now}`;

  assert.deepEqual(structuredClone(io.readSettings()), {});
  assert.equal(shim.file.get(SETTINGS), CORRUPT_SETTINGS, 'reading does not change the original settings');
  assert.equal(shim.file.has(backup), true, 'readSettings must create a timestamped backup before returning');
  assert.equal(shim.file.get(backup), CORRUPT_SETTINGS, 'backup must preserve the exact text');

  const replacement = {fontSize: 16};
  io.saveSettings(replacement);
  assert.deepEqual(JSON.parse(shim.file.get(SETTINGS)), replacement);
  assert.equal(shim.file.get(backup), CORRUPT_SETTINGS, 'saving settings must not overwrite the backup');
});

test('B2a io logs a generic warning without exposing corrupt settings text', () => {
  const {io, shim} = setup(CORRUPT_SETTINGS);
  io.readSettings();

  const logs = shim.console.logs.map(args => format(...args));
  const errors = shim.console.errors.map(args => format(...args));
  assert.equal([...logs, ...errors].some(line => line.includes(CORRUPT_MARKER)), false, 'no settings in logs');
  assert.ok(logs.includes(WARNING), 'readSettings must log the generic unreadable-settings warning');
});

test('B2a io reads valid settings without creating a backup', () => {
  const settings = {fontSize: 18, timestamps: true};
  const {io, shim} = setup(JSON.stringify(settings));

  assert.deepEqual(structuredClone(io.readSettings()), settings);
  assert.equal(shim.file.writes.length, 0);
});

test('B2a io defaults on missing settings without creating a backup', () => {
  const {io, shim} = setup();

  assert.deepEqual(structuredClone(io.readSettings()), {});
  assert.equal(shim.file.writes.length, 0);
});
