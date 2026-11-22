'use strict';
// Live chat shows Twitch's send time (tmi-sent-ts), not the moment the panel re-rendered (#10).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {safeMessage} = require('../src/player.js');

test('live records keep their Twitch send time as sentAt', () => {
  const m = safeMessage({id: 'a', timestampMs: 1763790000000, author: 'x', text: 'hi'});
  assert.equal(m.sentAt, 1763790000000);
  assert.equal(m.time, 0, 'media time stays empty for live records');
});

test('replay records keep media time and have no send time', () => {
  const m = safeMessage({id: 'b', time: 290.5, author: 'x', text: 'hi'});
  assert.equal(m.time, 290.5);
  assert.equal(m.sentAt, 0);
});

test('sidebar and overlay render live times from sentAt', () => {
  const ui = name => fs.readFileSync(path.join(__dirname, '..', 'ui', name), 'utf8');
  assert.match(ui('sidebar.js'), /liveClock\(m\.sentAt\|\|m\.time\)/);
  assert.match(ui('overlay.js'), /formatTime\(replay\?m\.time:\(m\.sentAt\|\|m\.time\),replay\)/);
});
