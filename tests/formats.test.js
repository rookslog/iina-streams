"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const f = require("../plugin-dev/src/formats.js");
test("parses Streamlink JSON keys but never exposes signed media URLs", () => {
  const data = JSON.stringify({streams: {
    "160p30": {url: "https://private.invalid/video?token=secret"},
    "360p30": {}, "720p60": {}, "1080p60": {}, best: {}, worst: {}
  }});
  const parsed = f.parseFormats(data);
  assert.deepEqual(parsed, ["auto720", "160p30", "360p30", "720p60", "1080p60"]);
  assert.equal(parsed.join("|").includes("secret"), false);
});
test("rejects malformed and empty JSON", () => {
  for (const v of ["not-json", "{}", '{"streams":{}}', '{"streams": []}']) {
    assert.throws(() => f.parseFormats(v));
  }
});
test("quality command limited to advertised formats", () => {
  assert.match(f.commandQuality("auto720", []), /720p60/);
  assert.equal(f.commandQuality("1080p60", ["auto720", "1080p60"]), "1080p60");
  assert.equal(f.commandQuality("1080p60", ["720p60"]), null);
  assert.equal(f.commandQuality("720p60;touch /tmp/attack", ["720p60;touch /tmp/attack"]), null);
});
