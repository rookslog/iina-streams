"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

test("sidebar webview initializes bridge and handles state, controls with explicit data", () => {
  const elements = {};
  const listeners = {};
  const messages = [];
  function element() {
    return {
      textContent: "", hidden: false, disabled: false, value: "",
      children: [], events: {},
      addEventListener(name, cb) { this.events[name] = cb; },
      replaceChildren() { this.children = []; },
      appendChild(child) { this.children.push(child); }
    };
  }
  for (const id of ["quality", "refresh", "status", "error", "channel", "hide"]) {
    elements[id] = element();
  }
  const document = {
    getElementById: id => elements[id],
    createElement: () => element()
  };
  const bridge = {
    onMessage: (name, cb) => { listeners[name] = cb; },
    postMessage: (name, data) => {
      assert.notEqual(data, undefined, "WKWebView bridge must not receive undefined");
      messages.push({ name, data });
    }
  };
  const file = path.join(__dirname, "../plugin-dev/ui/streams.js");
  vm.runInNewContext(fs.readFileSync(file, "utf8"), { iina: bridge, document }, { filename: file });
  assert.deepEqual(messages.map(m => m.name), ["ready"]);
  assert.deepEqual(JSON.parse(JSON.stringify(messages[0].data)), { ready: true });
  assert.equal(typeof listeners.state, "function");
  listeners.state({
    channel:"hutchmf", status:"Playing", quality:"720p60",
    formats:["auto720","360p30","720p60"], busy:false, error:""
  });
  assert.equal(elements.channel.textContent,"hutchmf");
  assert.equal(elements.status.textContent,"Playing");
  assert.equal(elements.quality.value,"720p60");
  assert.equal(elements.quality.disabled,false);
  assert.equal(elements.quality.children.length,3);
  elements.quality.value = "360p30";
  elements.quality.events.change();
  elements.refresh.events.click();
  elements.hide.events.click();
  assert.deepEqual(messages.map(m => m.name),
    ["ready","change-quality","refresh-qualities","hide"]);
  for (const msg of messages) assert.notEqual(msg.data, undefined);
  assert.equal(messages[1].data,"360p30");
  listeners.state({
    channel:"hutchmf", status:"Reconnecting", quality:"360p30",
    formats:["auto720","360p30"], busy:true, error:"Temporary network problem"
  });
  assert.equal(elements.quality.disabled,true);
  assert.equal(elements.error.hidden,false);
  assert.equal(elements.error.textContent,"Temporary network problem");
});
