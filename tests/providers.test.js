"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const p = require("../plugin-dev/src/providers.js");

test("accepts channel, URL, and mixed case, canonicalizes", () => {
  for (const x of ["hutchmf", "https://www.twitch.tv/hutchmf", "www.twitch.tv/HUTCHMF?ref=home"]) {
    const r = p.parseInput(x);
    assert.equal(r.kind, "twitch-live"); assert.equal(r.channel, "hutchmf");
  }
});
test("distinguishes Twitch VOD and reserved paths", () => {
  assert.deepEqual(p.parseInput("https://www.twitch.tv/videos/123456"), {kind: "twitch-vod", url:"https://www.twitch.tv/videos/123456"});
  assert.equal(p.parseInput("twitch.tv/directory").kind, "unsupported");
});
test("routes YouTube through IINA", () => {
  assert.equal(p.parseInput("https://www.youtube.com/watch?v=dQw4w9WgXcQ").kind, "youtube");
  assert.equal(p.parseInput("https://youtu.be/dQw4w9WgXcQ").kind, "youtube");
  assert.equal(p.parseInput("https://www.youtube.com/live/dQw4w9WgXcQ").kind, "youtube");
});
test("rejects host confusion, malformed, and injection inputs", () => {
  for (const x of ["twitch.tv.evil.example/foo", "https://www.twitch.tv@evil.test/hutchmf", "https://example.com/", "https://twitch.tv/hutchmf;touch /tmp/pwn", "https://www.twitch.tv/../../etc/passwd", "", "twitch.tv/hutchmf\n--other", "https://youtu.be/x;rm -rf"]) {
    assert.equal(p.parseInput(x).kind, "unsupported", x);
  }
});
test("quality presets and URL validation", () => {
  assert.match(p.selectedQuality(), /720p60/);
  assert.match(p.selectedQuality("test-360"), /360p30/);
  assert.equal(p.selectedQuality("best"), "best");
  assert.equal(p.validExtractedUrl("https://video.example.test/v.m3u8?token=abc"), true);
  for (const x of ["http://example.test/x", "file:///etc/passwd", "https://one.test/x\nhttps://two.test/y", "garbage"]) {
    assert.equal(p.validExtractedUrl(x), false, x);
  }
});
