'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');

const SOURCES = ['src/auth.js', 'global.js', 'src/io.js'];
const STRINGS_OR_COMMENTS = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g;
// Cover the empty and single-return forms used in these files, including `return {}`.
const SWALLOWED_CATCH = /\bcatch\s*\(\s*_\s*\)\s*\{\s*(?:return\b(?:[^;{}]|\{\s*\})*;?\s*)?\}/g;

function lineAt(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

function uncommentedCatches(file) {
  const source = readFileSync(join(__dirname, '..', file), 'utf8');
  const commentLines = new Set();
  const code = source.replace(STRINGS_OR_COMMENTS, (token, offset) => {
    // Preserve positions and keep comment-like text inside strings from counting as a comment.
    if (!token.startsWith('/')) return token.replace(/[^\r\n]/g, 'x');
    const start = lineAt(source, offset);
    const end = lineAt(source, offset + token.length);
    for (let line = start; line <= end; line++) commentLines.add(line);
    return token.replace(/[^\r\n]/g, ' ');
  });

  const missing = [];
  for (const match of code.matchAll(SWALLOWED_CATCH)) {
    const line = lineAt(source, match.index);
    if (!commentLines.has(line) && !commentLines.has(line - 1)) missing.push(`${file}:${line}`);
  }
  return missing;
}

test('B2a source scan requires a nearby comment for catches that do nothing or only return', () => {
  assert.deepEqual(SOURCES.flatMap(uncommentedCatches), [], 'swallowed catches must explain why ignoring is safe');
});
