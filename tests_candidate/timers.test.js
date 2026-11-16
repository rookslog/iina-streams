'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {create} = require('../src/timers.js');

// IINA's native polyfill leaves fired one-shots in this map until clearTimeout.
function nativeTimers() {
  let next = 0;
  const retained = new Map(), calls = [];
  return {
    retained, calls,
    setTimeout(fn, delay) { const id = ++next; retained.set(id, {fn, delay}); return id; },
    clearTimeout(id) { calls.push(id); retained.delete(id); },
    fire(id) { return retained.get(id).fn(); }
  };
}

test('a native one-shot is removed before its user callback executes', () => {
  const native = nativeTimers(), timers = create(native.setTimeout, native.clearTimeout);
  let invoked = 0;
  const id = timers.setTimeout(() => { invoked++; assert.equal(native.retained.size, 0); }, 200);
  assert.equal(native.retained.get(id).delay, 200);
  native.fire(id);
  assert.equal(invoked, 1); assert.deepEqual(native.calls, [id]);
});

test('a throwing callback cannot strand its native timer entry', () => {
  const native = nativeTimers(), timers = create(native.setTimeout, native.clearTimeout);
  const id = timers.setTimeout(() => { throw new Error('test failure'); }, 0);
  assert.throws(() => native.fire(id), /test failure/);
  assert.equal(native.retained.size, 0);
});

test('self-scheduling work retains only its next owned native timer', () => {
  const native = nativeTimers(), timers = create(native.setTimeout, native.clearTimeout);
  let count = 0, id;
  function callback() {
    assert.equal(native.retained.size, 0);
    if (++count < 100) id = timers.setTimeout(callback, 200);
  }
  id = timers.setTimeout(callback, 200);
  for (let i = 0; i < 100; i++) { assert.equal(native.retained.size, 1); native.fire(id); }
  assert.equal(count, 100); assert.equal(native.retained.size, 0);
});

test('cancel prevents a captured native callback from invoking user work', () => {
  const native = nativeTimers(), timers = create(native.setTimeout, native.clearTimeout);
  let invoked = 0;
  const id = timers.setTimeout(() => invoked++, 0), queued = native.retained.get(id).fn;
  timers.clearTimeout(id); queued();
  assert.equal(invoked, 0); assert.equal(native.retained.size, 0);
});

test('late native registration after cancellation is cleaned when its guarded callback fires', () => {
  const native = nativeTimers(); let pending;
  const timers = create((fn, delay) => { pending = {fn, delay}; return 7; }, native.clearTimeout);
  let invoked = 0;
  const id = timers.setTimeout(() => invoked++, 0);
  timers.clearTimeout(id);
  native.retained.set(id, pending); native.fire(id);
  assert.equal(invoked, 0); assert.equal(native.retained.size, 0);
});

test('clearAll removes this owner’s timers and leaves a different owner alone', () => {
  const native = nativeTimers(), first = create(native.setTimeout, native.clearTimeout), second = create(native.setTimeout, native.clearTimeout);
  let invoked = 0;
  const a = first.setTimeout(() => invoked++, 10), b = first.setTimeout(() => invoked++, 20);
  const queued = [native.retained.get(a).fn, native.retained.get(b).fn];
  const other = second.setTimeout(() => invoked++, 30);
  first.clearAll();
  assert.deepEqual([...native.retained.keys()], [other]);
  for (const callback of queued) callback();
  assert.equal(invoked, 0); assert.deepEqual([...native.retained.keys()], [other]);
  native.fire(other); assert.equal(invoked, 1); assert.equal(native.retained.size, 0);
});

test('clearing an unowned timer does not cancel another scope’s native work', () => {
  const native = nativeTimers(), first = create(native.setTimeout, native.clearTimeout), second = create(native.setTimeout, native.clearTimeout);
  const id = second.setTimeout(() => {}, 5);
  first.clearTimeout(id);
  assert.equal(native.retained.size, 1);
  second.clearAll(); assert.equal(native.retained.size, 0);
});
