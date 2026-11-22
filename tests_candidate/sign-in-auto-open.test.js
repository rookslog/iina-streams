'use strict';
// Sign in opens Twitch's activation page by itself, but only after an explicit click (#7).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {shouldAutoOpen} = require('../src/player.js');
const uri = 'https://www.twitch.tv/activate?device-code=ABCD1234';

test('opens only when armed by a click, in the waiting phase, for a Twitch activation URL', () => {
  assert.equal(shouldAutoOpen({phase: 'waiting', verificationURI: uri}, true), true);
  assert.equal(shouldAutoOpen({phase: 'waiting', verificationURI: uri}, false), false);
  assert.equal(shouldAutoOpen({phase: 'authorizing', verificationURI: uri}, true), false);
  assert.equal(shouldAutoOpen({phase: 'waiting', verificationURI: 'https://evil.example/activate'}, true), false);
  assert.equal(shouldAutoOpen(null, true), false);
});

test('only explicit Sign in, Continue, Enter and Try again arm auto-open; the chat switch does not', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'ui', 'sidebar.js'), 'utf8');
  assert.equal((js.match(/open:true/g) || []).length, 4);
  assert.match(js, /\$\('chat-toggle'\)[^\n]*post\('connect',\{clientID:''\}\)/);
});
