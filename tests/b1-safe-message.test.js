'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {safeMessage} = require('../src/player.js');

const liveMessage = {
  id: 'test-live-message',
  timestampMs: 1763790000000,
  author: 'TestViewer',
  text: 'Kappa hi'
};

test('B1 safeMessage keeps the live emotes and badges tags', () => {
  const emotes = 'emotesv2_test_only:0-4';
  const badges = 'subscriber/12,moderator/1';

  const result = safeMessage({...liveMessage, emotes, badges});

  assert.deepEqual({emotes: result.emotes, badges: result.badges}, {emotes, badges});
});

test('B1 safeMessage clips live emotes to 2048 and badges to 1024 characters', () => {
  const emoteTag = 'emotesv2_test_only:0-4';
  const emotes = (emoteTag + '/').repeat(100) + emoteTag;
  const badges = 'subscriber/12,'.repeat(100) + 'moderator/1';

  const result = safeMessage({...liveMessage, emotes, badges});

  assert.deepEqual({emotes: result.emotes?.length, badges: result.badges?.length}, {emotes: 2048, badges: 1024});
  assert.ok(result.emotes === emotes.slice(0, 2048), 'clipping should keep the emotes prefix');
  assert.ok(result.badges === badges.slice(0, 1024), 'clipping should keep the badges prefix');
});

test('B1 safeMessage leaves a replay record without tags unchanged', () => {
  const replay = {
    id: 'test-replay-message',
    time: 12.5,
    sentAt: 0,
    author: 'TestViewer',
    text: 'Kappa hi',
    color: '#123abc',
    kind: 'message'
  };

  assert.deepEqual(safeMessage({...replay}), replay);
});
