'use strict';
// An appearance change must merge into the latest persisted settings, not replace them (#43).
// Release review finding 4: a view-only write dropped chatEnabled:false, so the next window re-enabled
// chat and started automatic Twitch VOD fetches the user had turned off.
// The store below replaces the whole object on save, as src/io.js saveSettings replaces the file.
const test = require('node:test');
const assert = require('node:assert/strict');
const Sources = require('../src/source.js');
const {start} = require('../src/player.js');
const {createIina} = require('./support/iina-shim.js');

const VOD = Sources.parse('https://www.twitch.tv/videos/123');

function createStore(initial) {
  const store = {persisted: initial, saves: []};
  store.readSettings = () => JSON.parse(JSON.stringify(store.persisted)); // a fresh read, like the file
  store.saveSettings = settings => { store.saves.push(settings); store.persisted = JSON.parse(JSON.stringify(settings)); };
  return store;
}

// One player window over `store`. `acquisitions` counts automatic and manual replay fetches.
function openWindow(store, counters) {
  const shim = createIina({label: Sources.label(VOD, 'unified'), mpv: {path: VOD.url}});
  const controller = start(shim.iina, {variant: 'unified'}, {
    readSettings: store.readSettings, saveSettings: store.saveSettings, dataPath: () => '/data/placeholder',
    resolve: async () => ({ok: true, live: false, duration: 200, mediaURL: 'https://media.example/fixture'}),
    runHelper: async () => { counters.acquisitions++; return {ok: false, error: {message: 'fixture'}}; }
  });
  return {shim, controller, close: () => shim.emit('iina.window-will-close')};
}

async function loadFile(window) {
  await window.shim.mpv.runHook('on_load', () => {});
  window.shim.emit('iina.file-loaded', VOD.url);
  await new Promise(resolve => setImmediate(resolve));
}

// The settings a 0.5.3 install wrote after the user chose Chat Off, plus a field this code does not know.
const chatOffSettings = () => ({view: {timestamps: true}, chatEnabled: false, futureField: {keep: 'me'}});

test('changing appearance keeps Chat Off and every other saved field, so the next VOD does not fetch', async () => {
  const store = createStore(chatOffSettings()), counters = {acquisitions: 0};
  const first = openWindow(store, counters);
  first.controller.setView({timestampSeconds: true});
  first.close();
  assert.equal(store.persisted.chatEnabled, false, 'chatEnabled survives the view write');
  assert.deepEqual(store.persisted.futureField, {keep: 'me'}, 'unknown fields survive');
  assert.equal(store.persisted.view.timestampSeconds, true, 'the new appearance is saved');
  assert.equal(store.persisted.view.timestamps, true, 'the earlier appearance is kept');

  const second = openWindow(store, counters);
  await loadFile(second);
  assert.equal(counters.acquisitions, 0, 'no automatic fetch for a user who turned chat off');
  assert.equal(second.controller.snapshot().view.timestampSeconds, true);
  second.close();
});

test('a window opened before another window turned chat off does not bring chat back when its view changes', () => {
  const store = createStore({view: {}}), counters = {acquisitions: 0};
  const stale = openWindow(store, counters); // read chatEnabled as "on"
  const other = openWindow(store, counters);
  other.shim.sidebar.send('chat-off');
  assert.equal(store.persisted.chatEnabled, false);
  stale.controller.setView({lines: 8});
  assert.equal(store.persisted.chatEnabled, false, 'the stale window must not copy its old preference back');
  assert.equal(store.persisted.view.lines, 8);
  stale.close();
  other.close();
});

test('Chat Off and Resume save the preference and keep the saved appearance and unknown fields', () => {
  const store = createStore({view: {lines: 9}, futureField: 1}), counters = {acquisitions: 0};
  const window = openWindow(store, counters);
  window.shim.sidebar.send('chat-off');
  assert.deepEqual(store.persisted, {view: {lines: 9}, chatEnabled: false, futureField: 1});
  window.shim.sidebar.send('replay-resume');
  assert.equal(store.persisted.chatEnabled, true);
  assert.equal(store.persisted.futureField, 1);
  window.close();
});

test('control: manual Fetch replay still works while chat is off', async () => {
  const store = createStore(chatOffSettings()), counters = {acquisitions: 0};
  const window = openWindow(store, counters);
  await loadFile(window);
  assert.equal(counters.acquisitions, 0, 'precondition: chat off means no automatic fetch');
  window.shim.sidebar.send('fetch-replay');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(counters.acquisitions, 1, 'the user asked for it');
  assert.equal(store.persisted.chatEnabled, true, 'asking for chat turns the preference back on');
  window.close();
});
