'use strict';
// Contract: the Open Stream shortcut must be in IINA 1.5.1's normalized key form and must not
// collide with any bundled IINA key config or main-menu key equivalent. IINA silently drops a
// colliding plugin binding (MenuController.add(menuItemDef:)), and a non-normalized string slips
// past that check and duplicates a host shortcut instead (#4).
// The normalizer, fixtures and collision check live in tests/support/iina-shim.js (#13); this file
// loads the real global.js against the shim and asks the shim's menu what it registered.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {createIina, normalizeKeyBinding, loadBoundKeys} = require('./support/iina-shim.js');

function loadGlobalMenu() {
  const shim = createIina({role: 'global', identifier: 'local.iina.streams.menu-test'});
  shim.runScript(path.join(__dirname, '..', 'global.js'), {
    require(name) {
      if (name === './config.js') return {identifier: 'local.iina.streams.menu-test', variant: 'unified'};
      if (name === './src/source.js') return require('../src/source.js');
      if (name === './src/auth.js') return require('../src/auth.js');
      if (name === './src/timers.js') return require('../src/timers.js');
      if (name === './src/listeners.js') return require('../src/listeners.js');
      if (name === './src/twitch-app.js') return {clientID: ''};
      throw new Error('Unexpected module ' + name);
    }
  });
  return shim;
}

test('the normalizer matches IINA for known forms', () => {
  assert.equal(normalizeKeyBinding('Shift+Meta+s'), 'Meta+S');
  assert.equal(normalizeKeyBinding('Meta+Shift+S'), 'Meta+S');
  assert.equal(normalizeKeyBinding('Meta+Ctrl+o'), 'Ctrl+Meta+o');
});

test('Open Stream registers a shortcut written in IINA normalized form', () => {
  const [item] = loadGlobalMenu().menu.items;
  assert.equal(item.title, 'Open Stream…');
  assert.ok(item.keyBinding, 'Open Stream menu item must declare a keyBinding');
  assert.equal(item.keyBinding, normalizeKeyBinding(item.keyBinding));
});

test('Open Stream shortcut collides with no bundled IINA binding or main-menu item', () => {
  const shim = loadGlobalMenu();
  assert.ok(loadBoundKeys().size > 50, 'fixtures loaded');
  assert.ok(loadBoundKeys().has('Meta+S'), 'the old Cmd-Shift-S collision is detected');
  assert.deepEqual(shim.menu.problems(), []);
});
