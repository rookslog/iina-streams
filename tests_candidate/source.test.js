"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const source = require('../candidate-plugin/src/source.js');

test('canonicalizes supported stream and video identities without retaining tracking', () => {
  assert.deepEqual(source.parse('HutchMF'), {kind:'twitch-live',provider:'Twitch',id:'hutchmf',url:'https://www.twitch.tv/hutchmf',startSeconds:0});
  assert.deepEqual(source.parse('https://twitch.tv/videos/123456?t=1h2m3s'), {kind:'twitch-vod',provider:'Twitch',id:'123456',url:'https://www.twitch.tv/videos/123456',startSeconds:3723});
  for (const url of ['https://youtu.be/AbC_123-xYz?t=95','https://www.youtube.com/watch?v=AbC_123-xYz&t=95&list=secret','https://youtube.com/live/AbC_123-xYz?t=95']) {
    assert.deepEqual(source.parse(url), {kind:'youtube',provider:'YouTube',id:'AbC_123-xYz',url:'https://www.youtube.com/watch?v=AbC_123-xYz',startSeconds:95});
  }
});
test('rejects host confusion, unsupported paths, extra path segments, credentials and controls', () => {
  for (const url of ['https://twitch.tv.evil/a','https://twitch.tv@evil/a','https://twitch.tv/videos/123/evil','https://youtube.com/channel/x','https://youtube.com/watch?v=abc','https://youtube.com/shorts/AbC_123-xYz/extra','https://twitch.tv/hutchmf\n--proxy evil','file:///etc/passwd','https://twitch.tv/directory','']) assert.equal(source.parse(url),null,url);
});
test('player labels contain only canonical source and validated variant', () => {
  const s=source.parse('hutchmf');
  const label=source.label(s,'focus');
  assert.deepEqual(source.fromLabel(label),{source:s,variant:'focus'});
  assert.equal(source.fromLabel('streams:twitch:hutchmf'),null);
  assert.equal(source.fromLabel('streams-candidate:%7Bbad'),null);
  assert.throws(()=>source.label({kind:'twitch-live',url:'https://evil.test',id:'x'},'unified'));
});
