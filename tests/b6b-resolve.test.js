'use strict';

// B6b contract: definitive Twitch OFFLINE stays helper-compatible (UNAVAILABLE with a message)
// but adds error.reason = 'offline', without calling the helper. Other definitive errors keep
// their existing shape. tests/resolve.test.js still expects the old exact OFFLINE error object.

const test = require('node:test');
const assert = require('node:assert/strict');
const {createResolver} = require('../src/resolve.js');
const {parse} = require('../src/source.js');

const SOURCE = parse('fixture_offline');

function resolverFor(code) {
  const helperCalls = [];
  const resolve = createResolver({
    async resolveTwitch() { throw Object.assign(new Error('Synthetic Twitch failure'), {code}); },
    async helperResolve(...args) { helperCalls.push(args); },
  });
  return {resolve, helperCalls};
}

test('B6b resolver marks only OFFLINE as offline and skips the helper for definitive errors', async () => {
  for (const [code, reason] of [['NOT_FOUND', undefined], ['RESTRICTED', undefined], ['OFFLINE', 'offline']]) {
    const {resolve, helperCalls} = resolverFor(code);
    const result = await resolve(SOURCE, 'auto720');

    assert.deepEqual(helperCalls, [], code);
    assert.equal(result.ok, false, code);
    assert.equal(result.error.code, 'UNAVAILABLE', code);
    assert.match(result.error.message, /\S/, code);
    assert.equal(result.error.reason, reason, code);
  }
});
