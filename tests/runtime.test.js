"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const plug = path.join(__dirname, "../plugin-dev");
const exampleFormats = JSON.stringify({streams: {
  "160p30": {}, "360p30": {}, "480p30": {}, "720p60": {}, "1080p60": {}, best: {}
}});
function runtime(label) {
  const menu = [], handlers = {}, events = {}, posted = [], cores = [], extracted = [];
  const sidebar = { loadFile: (f) => posted.push(["loadFile", f]),
    show: () => posted.push(["show"]), hide: () => posted.push(["hide"]),
    onMessage: (name, f) => { handlers[name] = f; },
    postMessage: (name, data) => posted.push([name, data]) };
  const mock = {
    global: { getLabel: () => label, createPlayerInstance: (opts) => { cores.push(opts); return 1; } },
    menu: { addItem: (x) => menu.push(x), item: (label, fn) => ({label, fn}) },
    sidebar, event: { on: (name, fn) => { events[name] = fn; } },
    core: { open: (url) => cores.push({opened: url}), stop: () => { throw Error("Unexpected automatic stop"); } },
    console: {log(){}, warn(){}, error(){}},
    utils: { fileInPath: () => true, ask: () => true, prompt: () => "https://www.twitch.tv/hutchmf",
      exec: async (file, args) => {
        extracted.push({ file, args });
        if (args.includes("--json")) return {status:0, stdout:exampleFormats};
        return {status:0, stdout:"https://test.cdn.invalid/hutchmf.m3u8?token=dont-log"};
      }
    }
  };
  function run(script) {
    vm.runInNewContext(fs.readFileSync(path.join(plug, script), "utf8"), {
      iina: mock, console: mock.console, Promise, require: (p) => require(path.join(plug, p)),
      setTimeout: () => { throw Error("Unexpected timer"); }
    }, {filename:script});
  }
  return { menu, handlers, events, posted, cores, extracted, mock, run };
}
test("global launcher creates an isolated Twitch player and no external player", async () => {
  const r = runtime("");
  r.run("global.js");
  assert.equal(r.menu.length, 1);
  assert.equal(r.menu[0].label, "Open Stream…");
  await r.menu[0].fn();
  assert.equal(r.cores.length, 1);
  assert.equal(r.cores[0].label, "streams:twitch:hutchmf");
  assert.equal(r.cores[0].enablePlugins, false);
  assert.equal(r.cores[0].url.startsWith("https:"), true);
  assert.equal(r.extracted.length, 1);
  assert.equal(r.extracted[0].args.includes("--stream-url"), true);
  assert.equal(r.extracted[0].args.includes("--player"), false);
});
test("per-window sidebar is lazy; quality switching replaces only its own media", async () => {
  const a = runtime("streams:twitch:hutchmf");
  const b = runtime("streams:twitch:another_channel");
  a.run("main.js"); b.run("main.js");
  assert.equal(a.menu.length, 1);
  assert.equal(a.posted.length, 0);
  a.events["iina.window-loaded"]();
  a.menu[0].fn();
  assert.deepEqual(a.posted.slice(0,2).map(x=>x[0]), ["loadFile","show"]);
  a.handlers["ready"]();
  await Promise.resolve();
  await Promise.resolve();
  assert.ok(a.posted.some(x=>x[0] === "state" && x[1].formats.includes("1080p60")));
  await a.handlers["change-quality"]("1080p60");
  assert.equal(a.cores.length, 1);
  assert.equal(a.cores[0].opened.startsWith("https:"), true);
  assert.equal(b.cores.length, 0);
  assert.equal(b.extracted.length, 0);
  const before = a.cores.length;
  await a.handlers["change-quality"]("720p60;attack");
  assert.equal(a.cores.length, before);
});
test("unrelated player has no Stream controls, timers, or subprocesses", () => {
  const r = runtime("");
  r.run("main.js");
  assert.equal(r.menu.length,0);
  assert.equal(r.posted.length,0);
  assert.equal(r.extracted.length,0);
});
