'use strict';

// #73 module API choices:
// - CommonJS createHistory({storage, now}); now() and at are Unix seconds.
// - Storage uses read(path) (null if missing), write(path, text), and backup(from, to)
//   (preserve the original bytes even if read() throws). Paths are @data/history.json[.bad].
// - JSON v1 is {version, paused, people}; visits are oldest first, with seconds:null
//   while open. record({...person, at, offline:true}) stores a closed zero-second
//   visit with offline:true so it retains interest after reload; an ordinary zero
//   from finish() is still an accidental open. No other visit metadata is stored.
// - history.paused is readable; setPaused(boolean) persists it. query(text, {provider}?)
//   returns person records with score. Twitch logins fold case; YouTube IDs keep case.
//   An internal word can start after punctuation (e.g. DJ-Ohne), without spaces.

const test = require('node:test');
const assert = require('node:assert/strict');

const FILE = '@data/history.json';
const BACKUP = FILE + '.bad';
const NOW = 1800000000;
const DAY = 24 * 60 * 60;
const OHNE = {provider: 'twitch', login: 'ohnepixel', displayName: 'Ohnepixel'};

// Surface the missing module once, not one loader error per test or a file-level abort.
let historyModule, missingHistory;
try {
  historyModule = require('../src/history.js');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND' ||
      !error.message.startsWith("Cannot find module '../src/history.js'\n")) throw error;
  missingHistory = error;
}

function fakeDisk(initial = null, {unreadable = false} = {}) {
  const files = new Map();
  if (initial !== null) files.set(FILE, initial);
  const changes = [];
  return {
    changes,
    files,
    storage: {
      read(path) {
        if (path === FILE && unreadable && !files.has(BACKUP)) throw new Error('unreadable history');
        return files.get(path) ?? null;
      },
      write(path, text) {
        assert.equal(typeof text, 'string', 'storage writes JSON text');
        changes.push(['write', path]);
        files.set(path, text);
      },
      backup(from, to) {
        assert.ok(files.has(from), 'the original still exists when backed up');
        changes.push(['backup', from, to]);
        files.set(to, files.get(from));
      },
    },
    snapshot: () => JSON.parse(files.get(FILE)),
  };
}

function openHistory(disk = fakeDisk()) {
  assert.equal(typeof historyModule?.createHistory, 'function', 'src/history.js must export createHistory');
  return historyModule.createHistory({storage: disk.storage, now: () => NOW});
}

const snapshot = (people, paused = false) => JSON.stringify({version: 1, paused, people});
const twitch = (login, displayName = login) => ({provider: 'twitch', login, displayName});
const ranks = (history, text = '', options) => history.query(text, options).map(({login, score}) => [login, score]);

function watch(history, person, at, seconds = 60) {
  history.record({...person, at});
  history.finish({provider: person.provider, login: person.login, at: at + seconds});
}

test('1. record folds Twitch case, merges visits, and keeps only the ten newest', () => {
  if (missingHistory) throw missingHistory;
  const disk = fakeDisk();
  const history = openHistory(disk);

  history.record({...OHNE, login: 'Ohnepixel', at: NOW - 200});
  history.record({...OHNE, at: NOW - 100});
  assert.deepEqual(disk.snapshot().people, [{...OHNE, visits: [
    {at: NOW - 200, seconds: null}, {at: NOW - 100, seconds: null},
  ]}]);

  for (let age = 9; age > 0; age--) history.record({...OHNE, at: NOW - age});
  const people = disk.snapshot().people;
  assert.equal(people.length, 1);
  assert.deepEqual(people[0].visits.map(({at}) => at),
    [NOW - 100, ...Array.from({length: 9}, (_, i) => NOW - 9 + i)]);
});

test('2. finish updates the newest open visit, caps it at 12 hours, and ignores a duplicate finish', () => {
  const disk = fakeDisk();
  const history = openHistory(disk);
  const first = NOW - 3 * DAY;
  const second = NOW - 2 * DAY;
  history.record({...OHNE, at: first});
  history.record({...OHNE, at: second});

  history.finish({...OHNE, at: second + 75});
  assert.deepEqual(disk.snapshot().people[0].visits, [
    {at: first, seconds: null}, {at: second, seconds: 75},
  ]);
  history.finish({...OHNE, at: NOW});
  assert.deepEqual(disk.snapshot().people[0].visits, [
    {at: first, seconds: 43200}, {at: second, seconds: 75},
  ]);

  const writes = disk.changes.length;
  history.finish({...OHNE, at: NOW + 1});
  assert.equal(disk.changes.length, writes, 'no open visit means no write');
});

test('3. frecency favors recent visits and ignores accidental opens after they finish', () => {
  const history = openHistory();
  for (let i = 0; i < 5; i++) watch(history, twitch('thisweek'), NOW - 2 * DAY - i);
  for (let i = 0; i < 20; i++) watch(history, twitch('fourmonths'), NOW - 120 * DAY - i);
  watch(history, twitch('today'), NOW - 60);
  watch(history, twitch('twentydays'), NOW - 20 * DAY);
  watch(history, twitch('today'), NOW - 10, 10);

  assert.deepEqual(ranks(history), [
    ['thisweek', 500], ['today', 100], ['fourmonths', 100], ['twentydays', 50],
  ]);

  for (const [age, score] of [
    [4 * DAY, 100], [4 * DAY + 1, 70], [14 * DAY, 70], [14 * DAY + 1, 50],
    [31 * DAY, 50], [31 * DAY + 1, 30], [90 * DAY, 30], [90 * DAY + 1, 10],
  ]) {
    const login = 'age' + age;
    history.record({...twitch(login), at: NOW - age});
    assert.deepEqual(ranks(history, login), [[login, score]], 'open visit at age ' + age);
  }

  watch(history, twitch('threshold'), NOW - 30, 30);
  watch(history, twitch('instant'), NOW, 0);
  assert.deepEqual(ranks(history, 'threshold'), [['threshold', 100]]);
  assert.equal(ranks(history).find(([login]) => login === 'instant')?.[1] ?? 0, 0);
});

test('4. the 501st person evicts the lowest score, breaking ties by oldest last visit', () => {
  const regulars = Array.from({length: 497}, (_, i) => ({
    ...twitch('regular' + i), visits: [{at: NOW - DAY, seconds: 60}],
  }));
  const disk = fakeDisk(snapshot([
    ...regulars,
    {...twitch('alpha'), visits: [{at: NOW - 95 * DAY, seconds: 60}]},
    {...twitch('zulu'), visits: [{at: NOW - 100 * DAY, seconds: 60}]},
    {...twitch('olderbutstronger'), visits: [
      {at: NOW - 120 * DAY, seconds: 60}, {at: NOW - 110 * DAY, seconds: 60},
    ]},
  ]));
  const history = openHistory(disk);
  history.record({...OHNE, at: NOW});

  const logins = disk.snapshot().people.map(({login}) => login);
  assert.equal(logins.length, 500);
  assert.ok(logins.includes('ohnepixel'));
  assert.ok(logins.includes('olderbutstronger'), 'score wins even over an older last visit');
  assert.ok(logins.includes('alpha'), 'keep the newer of the lowest-score people');
  assert.ok(!logins.includes('zulu'));
});

test('5. query ranks prefixes before display-name word starts, with score, recency and login ties', () => {
  const history = openHistory();
  watch(history, twitch('zulu', 'OH-Zulu'), NOW - DAY);
  watch(history, twitch('alpha', 'Oh-Alpha'), NOW - DAY);
  watch(history, twitch('oholder'), NOW - 2 * DAY);
  watch(history, twitch('ohlow'), NOW - 20 * DAY);
  watch(history, twitch('ohrepeat'), NOW - 3 * DAY - 60);
  watch(history, twitch('ohrepeat'), NOW - 3 * DAY);
  watch(history, twitch('dj', 'DJ-Ohne'), NOW - DAY);
  watch(history, twitch('dj', 'DJ-Ohne'), NOW - 60);
  watch(history, twitch('mc', 'MC-Ohne'), NOW - 30, 30);
  watch(history, twitch('choir', 'ChOhr'), NOW - DAY); // substring, not a word start
  watch(history, {provider: 'youtube', login: 'UCaBcD001234567890xyzPQ', displayName: 'OhTube'}, NOW - 50, 50);

  assert.deepEqual(history.query('oH').map(({login}) => login), [
    'ohrepeat', 'UCaBcD001234567890xyzPQ', 'alpha', 'zulu', 'oholder', 'ohlow', 'dj', 'mc',
  ]);
  assert.deepEqual(ranks(history, 'OH', {provider: 'twitch'}), [
    ['ohrepeat', 200], ['alpha', 100], ['zulu', 100], ['oholder', 100], ['ohlow', 50],
    ['dj', 200], ['mc', 100],
  ]);
  assert.deepEqual(ranks(history, 'oh', {provider: 'youtube'}), [['UCaBcD001234567890xyzPQ', 100]]);
  assert.deepEqual(ranks(history)[0], ['dj', 200], 'an empty query ranks by score alone first');
});

test('6. pause survives a reload and prevents both record and finish until resumed', () => {
  const disk = fakeDisk();
  const history = openHistory(disk);
  history.record({...OHNE, at: NOW - 60});
  history.setPaused(true);
  assert.equal(disk.snapshot().paused, true);
  const reopened = openHistory(disk);
  assert.equal(reopened.paused, true);
  const before = disk.files.get(FILE);
  const writes = disk.changes.length;

  reopened.record({...twitch('ignored'), at: NOW});
  reopened.finish({...OHNE, at: NOW});
  assert.equal(disk.files.get(FILE), before);
  assert.equal(disk.changes.length, writes);
  assert.deepEqual(reopened.query('').map(({login, visits}) => [login, visits]), [
    ['ohnepixel', [{at: NOW - 60, seconds: null}]],
  ]);

  reopened.setPaused(false);
  reopened.finish({...OHNE, at: NOW});
  assert.equal(disk.snapshot().paused, false);
  assert.equal(disk.snapshot().people[0].visits[0].seconds, 60);
});

test('7. forget and clear write immediately while paused; forget is provider scoped', () => {
  const disk = fakeDisk();
  const history = openHistory(disk);
  history.record({...OHNE, at: NOW});
  history.record({...OHNE, provider: 'youtube', at: NOW});
  history.setPaused(true);

  history.forget({provider: 'twitch', login: 'OHNEPIXEL'});
  assert.deepEqual(disk.snapshot().people.map(({provider, login}) => [provider, login]), [
    ['youtube', 'ohnepixel'],
  ]);
  assert.deepEqual(openHistory(disk).query('').map(({provider}) => provider), ['youtube']);

  history.clear();
  assert.deepEqual(disk.snapshot(), {version: 1, paused: true, people: []});
  assert.deepEqual(openHistory(disk).query(''), []);
});

test('8. loads v1, ignores unknown fields, recovers bad data, and never overwrites a newer version', () => {
  const seeded = {...OHNE, visits: [{at: NOW - 60, seconds: 60}]};
  const disk = fakeDisk(JSON.stringify({
    version: 1, paused: false, unknown: 'file',
    people: [{...seeded, unknown: 'person', visits: [{...seeded.visits[0], unknown: 'visit'}]}],
  }));
  const history = openHistory(disk);
  assert.deepEqual(history.query('oh'), [{...seeded, score: 100}]);
  history.setPaused(true);
  assert.deepEqual(disk.snapshot(), {version: 1, paused: true, people: [seeded]});

  for (const [raw, unreadable] of [['{truncated', false], [snapshot([seeded]), true]]) {
    const broken = fakeDisk(raw, {unreadable});
    const recovered = openHistory(broken);
    assert.deepEqual(recovered.query(''), []);
    recovered.record({...OHNE, at: NOW});
    assert.equal(broken.files.get(BACKUP), raw);
    assert.deepEqual(broken.changes.slice(0, 2), [['backup', FILE, BACKUP], ['write', FILE]]);
    assert.deepEqual(broken.snapshot().people, [{...OHNE, visits: [{at: NOW, seconds: null}]}]);
  }

  const futureRaw = JSON.stringify({version: 2, paused: false, people: [seeded], newData: [1]});
  const future = fakeDisk(futureRaw);
  const readOnly = openHistory(future);
  const before = readOnly.query('');
  readOnly.record({...twitch('another'), at: NOW});
  readOnly.finish({...OHNE, at: NOW});
  readOnly.forget(OHNE);
  readOnly.clear();
  readOnly.setPaused(true);
  assert.deepEqual(readOnly.query(''), before);
  assert.equal(future.files.get(FILE), futureRaw);
  assert.deepEqual(future.changes, []);
});

test('9. unsafe identity fields are rejected and unknown playback metadata never reaches disk', () => {
  const disk = fakeDisk();
  const history = openHistory(disk);
  for (const ch of ['?', '/', '=', ' ', '\t', '\n']) {
    history.record({...OHNE, login: 'bad' + ch + 'value', at: NOW});
  }
  // Display names may hold spaces, but not URL characters, a backslash, control characters or 65+ characters.
  for (const ch of ['?', '/', '=', '\\', '\t', '\n', '\u0000']) {
    history.record({...OHNE, displayName: 'bad' + ch + 'value', at: NOW});
  }
  history.record({...OHNE, displayName: 'x'.repeat(65), at: NOW});
  history.record({...OHNE, displayName: '   ', at: NOW});
  // An unknown provider is rejected on its own, with an otherwise valid identity.
  history.record({...OHNE, provider: 'vimeo', at: NOW});
  const signed = 'https://invalid.example/playlist.m3u8?token=fixture-secret&sig=fixture-signature';
  const metadata = {url: signed, mediaURL: signed, title: signed, token: signed, signature: signed, query: signed};
  history.record({provider: signed, login: signed, displayName: signed, at: signed, ...metadata});
  history.record({...OHNE, displayName: signed, at: NOW});
  history.record({provider: 'youtube', login: signed, displayName: 'Linus Tech Tips', at: NOW});
  assert.deepEqual(history.query(''), []);
  assert.deepEqual(disk.changes, [], 'reject without storing anything');

  history.record({...OHNE, at: NOW, ...metadata});
  const channel = {provider: 'youtube', login: 'UCaBcD001234567890xyzPQ', displayName: 'Linus Tech Tips'};
  history.record({...channel, at: NOW, ...metadata});
  assert.deepEqual(disk.snapshot(), {
    version: 1, paused: false, people: [
      {...OHNE, visits: [{at: NOW, seconds: null}]},
      {...channel, visits: [{at: NOW, seconds: null}]},
    ],
  });
  assert.doesNotMatch(disk.files.get(FILE), /fixture-secret|fixture-signature|invalid\.example|https?:/);
});
