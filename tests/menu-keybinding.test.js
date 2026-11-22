'use strict';
// Contract: the Open Stream shortcut must be in IINA 1.5.1's normalized key form and must not
// collide with any bundled IINA key config or main-menu key equivalent. IINA silently drops a
// colliding plugin binding (MenuController.add(menuItemDef:)), and a non-normalized string slips
// past that check and duplicates a host shortcut instead (#4).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'];
const FIX = path.join(__dirname, 'fixtures', 'iina-1.5.1');

// Port of KeyCodeHelper.normalizeSingleMpvKeystroke for single printable keys.
function normalize(raw) {
  const parts = raw.split('+');
  let key = parts.pop();
  const mods = new Set();
  for (const m of parts) {
    const mod = ORDER.find(o => o.toLowerCase() === m.toLowerCase()) || m.toUpperCase();
    if (mod === 'Shift' && key.length === 1 && key.toLowerCase() !== key.toUpperCase()) key = key.toUpperCase();
    else mods.add(mod);
  }
  if (key.length > 1) key = key.toUpperCase();
  return [...ORDER.filter(o => mods.has(o)), key].join('+');
}

function boundKeys() {
  const keys = new Map();
  for (const name of fs.readdirSync(FIX).filter(n => n.endsWith('.conf'))) {
    for (const line of fs.readFileSync(path.join(FIX, name), 'utf8').split('\n')) {
      const m = /^(?:#@iina\s+)?(\S+)\s+\S/.exec(line.trim());
      if (!m || (line.trim().startsWith('#') && !line.trim().startsWith('#@iina'))) continue;
      keys.set(normalize(m[1]), name + ': ' + line.trim());
    }
  }
  for (const line of fs.readFileSync(path.join(FIX, 'mainmenu-keys.txt'), 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const [combo, title] = line.split('\t');
    const parts = combo.split('+'); let key = parts.pop();
    if (key.length === 1 && key !== key.toLowerCase()) parts.push('Shift'), key = key.toLowerCase();
    keys.set(normalize([...parts, key].join('+')), 'main menu: ' + title);
  }
  return keys;
}

const source = fs.readFileSync(path.join(__dirname, '..', 'global.js'), 'utf8');
const binding = (/menu\.item\('Open Stream…'[^;]*keyBinding:'([^']+)'/.exec(source) || [])[1];

test('the normalizer matches IINA for known forms', () => {
  assert.equal(normalize('Shift+Meta+s'), 'Meta+S');
  assert.equal(normalize('Meta+Shift+S'), 'Meta+S');
  assert.equal(normalize('Meta+Ctrl+o'), 'Ctrl+Meta+o');
});

test('Open Stream has a shortcut written in IINA normalized form', () => {
  assert.ok(binding, 'Open Stream menu item must declare a keyBinding');
  assert.equal(binding, normalize(binding));
});

test('Open Stream shortcut collides with no bundled IINA binding or main-menu item', () => {
  const keys = boundKeys();
  assert.ok(keys.size > 50, 'fixtures loaded');
  assert.ok(keys.has('Meta+S'), 'the old Cmd-Shift-S collision is detected');
  assert.equal(keys.get(normalize(binding)), undefined);
});
