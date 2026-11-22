'use strict';

// v0.5.5 release review r1 #12 (docs/reviews/2026-11-22-v0.5.5-release-review.md): IINA loads every enabled
// plugin on a native core (PlayerCore.swift L367-374, v1.5.1, as cited by the review), so stable and an
// isolated beta or dev build would both claim the same Open URL load. Lead decision: native adoption is on
// for the stable identifier; for any other identifier only with config.qa or the setting
// adoptNativeWindows: true. v0.5.5 descope (operator, 2026-11-22): stable is no longer special, so every
// identifier adopts only with config.qa or the setting. When it is off, no on_load hook is registered at all.
// Windows Streams created itself (a stream label) keep their own hook in every build.

const test = require('node:test');
const assert = require('node:assert/strict');
const Sources = require('../src/source.js');
const {start} = require('../src/player.js');
const {createIina} = require('./support/iina-shim.js');

const STABLE = 'local.iina.streams';
const BETA = 'local.iina.streams.beta';
const DEV = 'local.iina.streams.dev';

function nativeCore(config, readSettings = () => ({})) {
  const shim = createIina({label: '', identifier: config.identifier, mpv: {path: 'https://www.twitch.tv/xqc'}});
  const services = {readSettings, resolve: async () => assert.fail('no resolve at start')};
  assert.equal(start(shim.iina, config, services), null);
  return shim;
}

const hooked = shim => shim.mpv.hooks.has('on_load');
const addHookCalls = shim => shim.log.filter(entry => entry.api === 'mpv.addHook').length;

test('r1 #12: beta and dev without qa register no on_load hook on a native core', () => {
  for (const identifier of [BETA, DEV]) {
    const shim = nativeCore({identifier, variant: 'unified', qa: false});
    assert.equal(hooked(shim), false, identifier);
    assert.equal(addHookCalls(shim), 0, identifier);
  }
});

test('r1 #12: a missing identifier is not treated as stable', () => {
  const shim = nativeCore({variant: 'unified'});
  assert.equal(hooked(shim), false);
});

test('v0.5.5 descope: hooks per core for stable, default beta, default dev, QA dev and opted-in beta', () => {
  const cores = [
    nativeCore({identifier: STABLE, variant: 'unified', qa: false}),
    nativeCore({identifier: BETA, variant: 'unified', qa: false}),
    nativeCore({identifier: DEV, variant: 'unified', qa: false}),
    nativeCore({identifier: DEV, variant: 'unified', qa: {variant: 'unified'}}),
    nativeCore({identifier: BETA, variant: 'unified', qa: false}, () => ({adoptNativeWindows: true}))
  ];
  assert.deepEqual(cores.map(addHookCalls), [0, 0, 0, 1, 1]);
});

test('v0.5.5 descope: stable adopts when settings opt in', () => {
  const stable = nativeCore({identifier: STABLE, variant: 'unified', qa: false}, () => ({adoptNativeWindows: true}));
  assert.equal(addHookCalls(stable), 1, 'exactly one hook per core');
});

test('r1 #12: beta adopts when settings opt in, and an unreadable settings file means off', () => {
  const optedIn = nativeCore({identifier: BETA, variant: 'unified', qa: false}, () => ({adoptNativeWindows: true}));
  assert.equal(hooked(optedIn), true);
  const truthyOnly = nativeCore({identifier: BETA, variant: 'unified', qa: false}, () => ({adoptNativeWindows: 'yes'}));
  assert.equal(hooked(truthyOnly), false, 'only the boolean true opts in');
  const unreadable = nativeCore({identifier: BETA, variant: 'unified', qa: false}, () => { throw new Error('unreadable'); });
  assert.equal(hooked(unreadable), false);
});

test('r1 #12: a window Streams opened keeps its hook in a beta build', () => {
  const source = Sources.parse('https://www.twitch.tv/videos/100000004');
  const shim = createIina({label: Sources.label(source, 'unified'), identifier: BETA, mpv: {path: source.url}});
  const controller = start(shim.iina, {identifier: BETA, variant: 'unified', qa: false},
    {readSettings: () => ({chatEnabled: false}), resolve: async () => ({ok: false})});
  assert.ok(controller);
  assert.equal(hooked(shim), true);
  shim.emit('iina.window-will-close');
});
