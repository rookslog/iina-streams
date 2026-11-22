'use strict';

// #60: IINA 1.5.1 holds each onMessage callback as a JSManagedValue (JavascriptMessageHub.swift, addListener), a
// weak reference. When nothing in JS reaches the callback, JSC may collect it, and a later page message calls a
// nil value and crashes IINA (JavascriptMessageHub.swift L64, L94). Every plugin-side onMessage registration goes
// through listen(), which keeps the callback, and the API object it was given to, reachable from the context's
// global object. This covers garbage collection only; it does nothing when the JS context itself is freed.
//
// The registry keeps one callback per API and name, as IINA's hub does (a second addListener for a name replaces
// the first), so registering again on every page load replaces entries instead of adding them.

const REGISTRY = '__streamsListeners';

// The fixed keys of the API objects the registry holds: iina.overlay, iina.sidebar, iina.global (the global
// controller in global.js, the child API in a player), and iina.standaloneWindow (global.js's Open Stream window).
const API_KEYS = ['overlay', 'sidebar', 'global', 'standaloneWindow'];

// The registry on this JS context's global object, created on first use. A key with no ':' holds an API object;
// '<apiKey>:<name>' holds the callback registered for that name.
function registry() {
  let entries = globalThis[REGISTRY];
  if (!entries) {
    entries = new Map();
    Object.defineProperty(globalThis, REGISTRY, {value: entries, writable: false, enumerable: false});
  }
  return entries;
}

// Registers fn for messages called `name` on `api` and keeps the same function object reachable.
function listen(api, apiKey, name, fn) {
  if (!API_KEYS.includes(apiKey)) throw new Error('listen: unknown API key ' + apiKey);
  const entries = registry();
  entries.set(apiKey, api);
  entries.set(apiKey + ':' + name, fn);
  api.onMessage(name, fn);
}

module.exports = {listen, registry, API_KEYS, REGISTRY};
