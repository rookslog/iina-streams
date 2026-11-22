'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function* filesUnder(directory) {
  const entries = fs.readdirSync(path.join(root, directory), {withFileTypes: true});
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* filesUnder(file);
    if (entry.isFile()) yield file;
  }
}

test('A1.7 Streams source does not call utils.prompt or utils.ask', () => {
  const violations = [];
  const modalCall = /\butils\s*\.\s*(prompt|ask)\s*\(/g;
  for (const file of ['global.js', ...filesUnder('src'), ...filesUnder('ui')]) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of source.matchAll(modalCall)) {
      const line = source.slice(0, match.index).split('\n').length;
      violations.push(`${file}:${line}: utils.${match[1]}`);
    }
  }
  assert.deepEqual(violations, [], 'blocking IINA dialog calls remain in Streams source');
});
