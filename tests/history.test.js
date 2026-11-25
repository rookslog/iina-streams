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
// - Round 2b (lead): record() returns a visit handle {provider, login, at} (null when ignored), and
//   finish(handle, at) closes exactly that visit. Finishing a closed or unknown visit is a no-op.

const test = require('node:test');
const assert = require('node:assert/strict');

const FILE = '@data/history.json';
const BACKUP = FILE + '.bad';
const NOW = 1800000000;
const DAY = 24 * 60 * 60;
const OHNE = {provider: 'twitch', login: 'ohnepixel', displayName: 'Ohnepixel'};
// A YouTube channel id is "UC" and 22 more characters (round 2: logins are an allowlist).
const CHANNEL_ID = 'UCaBcD0123456789xyzPQrst';

// Surface the missing module once, not one loader error per test or a file-level abort.
let historyModule, missingHistory;
try {
  historyModule = require('../src/history.js');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND' ||
      !error.message.startsWith("Cannot find module '../src/history.js'\n")) throw error;
  missingHistory = error;
}

function withoutIds(file) {
  const people = file.people.map(person => ({
    ...person, visits: person.visits.map(({id, ...visit}) => visit),
  }));
  const {nextId, ...rest} = file;
  return {...rest, people};
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
    // The file as parsed, without visit ids: most assertions are about times and durations.
    snapshot: () => withoutIds(JSON.parse(files.get(FILE))),
    // The file as parsed, ids included.
    rawSnapshot: () => JSON.parse(files.get(FILE)),
  };
}

function openHistory(disk = fakeDisk(), random = Math.random) {
  assert.equal(typeof historyModule?.createHistory, 'function', 'src/history.js must export createHistory');
  return historyModule.createHistory({storage: disk.storage, now: () => NOW, random});
}

// Round 6: a handle belongs to one instance, named by a token drawn from `random` (Math.random's shape).
// Two instances given the same random share a token, so a test can forge a valid handle for a loaded visit.
const FIXED_RANDOM = () => 0.25;
const FIXED_INSTANCE = openHistory(fakeDisk(), FIXED_RANDOM).record({...OHNE, at: NOW}).instance;

const snapshot = (people, paused = false) => JSON.stringify({version: 1, paused, people});
const twitch = (login, displayName = login) => ({provider: 'twitch', login, displayName});
function ranks(history, text = '', options) {
  const people = history.query(text, options);
  return people.map(person => [person.login, person.score]);
}

function watch(history, person, at, seconds = 60) {
  const handle = history.record({...person, at});
  history.finish(handle, at + seconds);
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
  const firstVisit = history.record({...OHNE, at: first});
  const secondVisit = history.record({...OHNE, at: second});

  history.finish(secondVisit, second + 75);
  assert.deepEqual(disk.snapshot().people[0].visits, [
    {at: first, seconds: null}, {at: second, seconds: 75},
  ]);
  history.finish(firstVisit, NOW);
  assert.deepEqual(disk.snapshot().people[0].visits, [
    {at: first, seconds: 43200}, {at: second, seconds: 75},
  ]);

  const writes = disk.changes.length;
  history.finish(firstVisit, NOW + 1);
  assert.equal(disk.changes.length, writes, 'a closed visit means no write');
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

  watch(history, twitch('almost'), NOW - 30, 29);
  assert.deepEqual(ranks(history, 'almost'), [['almost', 0]], 'a 29 second visit is an accidental open');
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
  watch(history, {provider: 'youtube', login: CHANNEL_ID, displayName: 'OhTube'}, NOW - 50, 50);

  assert.deepEqual(history.query('oH').map(({login}) => login), [
    'ohrepeat', CHANNEL_ID, 'alpha', 'zulu', 'oholder', 'ohlow', 'dj', 'mc',
  ]);
  assert.deepEqual(ranks(history, 'OH', {provider: 'twitch'}), [
    ['ohrepeat', 200], ['alpha', 100], ['zulu', 100], ['oholder', 100], ['ohlow', 50],
    ['dj', 200], ['mc', 100],
  ]);
  assert.deepEqual(ranks(history, 'oh', {provider: 'youtube'}), [[CHANNEL_ID, 100]]);
  assert.deepEqual(ranks(history)[0], ['dj', 200], 'an empty query ranks by score alone first');
});

test('6. pause survives a reload and prevents both record and finish until resumed', () => {
  const disk = fakeDisk();
  const history = openHistory(disk);
  const visit = history.record({...OHNE, at: NOW - 60});
  history.setPaused(true);
  assert.equal(disk.snapshot().paused, true);
  const reopened = openHistory(disk);
  assert.equal(reopened.paused, true);
  const before = disk.files.get(FILE);
  const writes = disk.changes.length;

  reopened.record({...twitch('ignored'), at: NOW});
  history.finish(visit, NOW);
  assert.equal(disk.files.get(FILE), before);
  assert.equal(disk.changes.length, writes);
  assert.deepEqual(reopened.query('').map(({login, visits}) => [login, visits]), [
    ['ohnepixel', [{id: 1, at: NOW - 60, seconds: null}]],
  ]);

  // A handle is good for the instance that made it, so the same instance finishes once pause is off.
  history.setPaused(false);
  history.finish(visit, NOW);
  assert.equal(disk.snapshot().paused, false);
  assert.equal(disk.snapshot().people[0].visits[0].seconds, 60);
});

test('7. forget and clear write immediately while paused; forget is provider scoped', () => {
  const disk = fakeDisk();
  const history = openHistory(disk);
  history.record({...OHNE, at: NOW});
  history.record({...OHNE, provider: 'youtube', login: CHANNEL_ID, at: NOW});
  history.setPaused(true);

  history.forget({provider: 'twitch', login: 'OHNEPIXEL'});
  assert.deepEqual(disk.snapshot().people.map(({provider, login}) => [provider, login]), [
    ['youtube', CHANNEL_ID],
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
  assert.deepEqual(history.query('oh'), [{...seeded, visits: [{id: 1, ...seeded.visits[0]}], score: 100}]);
  history.setPaused(true);
  assert.deepEqual(disk.snapshot(), {version: 1, paused: true, people: [seeded]});

  // Round 3: a file that parses badly is backed up and replaced. (A read that throws is a different case:
  // the file may be fine, so it is never overwritten; see r3-1.)
  const corrupt = ['{truncated', JSON.stringify({people: []}), JSON.stringify({version: 0, people: []}),
    JSON.stringify({version: 1, people: {}}), 'null'];
  for (const raw of corrupt) {
    const broken = fakeDisk(raw);
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
  readOnly.finish({...OHNE, id: 1}, NOW);
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
  for (const ch of ['?', '/', '=', '\\', '&', ':', '\t', '\n', '\u0000']) {
    history.record({...OHNE, displayName: 'bad' + ch + 'value', at: NOW});
  }
  // Round 2: a login is an allowlist. Twitch: 1-25 of a-z, 0-9, _. YouTube: "UC" plus 22 of A-Z, a-z, 0-9, _, -.
  const badLogins = [
    ['twitch', 'mailto:fixture@example.invalid'], ['twitch', 'a'.repeat(26)], ['twitch', 'ohne-pixel'],
    ['twitch', 'ohne.pixel'], ['twitch', ''], ['twitch', CHANNEL_ID + '.'],
    ['youtube', 'ohnepixel'], ['youtube', CHANNEL_ID.slice(1)], ['youtube', CHANNEL_ID + 'x'],
    ['youtube', 'UC' + 'a'.repeat(21) + '.'], ['youtube', 'uc' + CHANNEL_ID.slice(2)],
  ];
  for (const [provider, login] of badLogins) {
    history.record({provider, login, displayName: 'Nobody', at: NOW});
  }
  // Providers match exactly.
  for (const provider of ['Twitch', 'TWITCH', 'YouTube', 'YOUTUBE', ' twitch', 'youtube ']) {
    history.record({...OHNE, provider, at: NOW});
    history.record({...OHNE, provider, login: CHANNEL_ID, at: NOW});
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
  const channel = {provider: 'youtube', login: CHANNEL_ID, displayName: 'Linus Tech Tips'};
  history.record({...channel, at: NOW, ...metadata});
  assert.deepEqual(disk.snapshot(), {
    version: 1, paused: false, people: [
      {...OHNE, visits: [{at: NOW, seconds: null}]},
      {...channel, visits: [{at: NOW, seconds: null}]},
    ],
  });
  assert.doesNotMatch(disk.files.get(FILE), /fixture-secret|fixture-signature|invalid\.example|https?:/);
});

// Round 2 (Codex review of d790bff/bae776d, lead disposition): regressions the first nine tests missed.

// A disk whose writes or backups can be switched to fail, like a full or read-only volume.
function failingDisk(initial = null, {unreadable = false} = {}) {
  const disk = fakeDisk(initial, {unreadable});
  const faults = {read: false, write: false, backup: false};
  const storage = {
    read(path) {
      if (faults.read) throw new Error('cannot read');
      return disk.storage.read(path);
    },
    write(path, text) {
      if (faults.write) throw new Error('disk full');
      disk.storage.write(path, text);
    },
    backup(from, to) {
      if (faults.backup) throw new Error('cannot back up');
      disk.storage.backup(from, to);
    },
  };
  const open = (random = Math.random) => historyModule.createHistory({storage, now: () => NOW, random});
  return {disk, faults, open};
}

function visitsOf(history, login) {
  const person = history.query(login).find(candidate => candidate.login === login);
  return person.visits.map(({id, ...visit}) => visit);
}

test('r2-1. a failed write is reported, never thrown, and an identical retry writes it', () => {
  const {disk, faults, open} = failingDisk(snapshot([{...OHNE, visits: [{at: NOW - 60, seconds: 60}]}]));
  const history = open();
  const stored = disk.files.get(FILE);

  faults.write = true;
  assert.equal(history.forget(OHNE), false, 'forget reports the failure');
  assert.equal(disk.files.get(FILE), stored, 'the file still has the person');
  faults.write = false;
  assert.equal(history.forget(OHNE), true, 'the identical retry writes');
  assert.deepEqual(disk.snapshot().people, []);

  faults.write = true;
  assert.equal(history.setPaused(true), false);
  assert.equal(disk.snapshot().paused, false);
  faults.write = false;
  assert.equal(history.setPaused(true), true);
  assert.equal(disk.snapshot().paused, true);

  history.setPaused(false);
  history.record({...OHNE, at: NOW});
  faults.write = true;
  assert.equal(history.clear(), false);
  assert.equal(disk.snapshot().people.length, 1);
  faults.write = false;
  assert.equal(history.clear(), true);
  assert.deepEqual(disk.snapshot().people, []);
  assert.deepEqual(open().query(''), [], 'a reload sees the cleared list');
});

test('r2-2. any later call flushes an unsaved change, and a failed record or finish is reported', () => {
  const {disk, faults, open} = failingDisk();
  const history = open();

  faults.write = true;
  const visit = history.record({...OHNE, at: NOW - 100});
  const {instance, ...fields} = visit;
  assert.deepEqual(fields, {provider: 'twitch', login: 'ohnepixel', id: 1}, 'the handle survives a failed write');
  assert.match(instance, /^[0-9a-f]{32}$/);
  assert.equal(disk.files.has(FILE), false);
  assert.equal(history.finish(visit, NOW - 40), false);
  faults.write = false;
  history.record({...twitch('other'), at: NOW});
  assert.deepEqual(disk.snapshot().people.map(({login, visits}) => [login, visits]), [
    ['ohnepixel', [{at: NOW - 100, seconds: 60}]], ['other', [{at: NOW, seconds: null}]],
  ]);
  assert.equal(history.finish(visit, NOW), true, 'a good finish reports success');
  assert.equal(history.finish({provider: 'vimeo', login: 'x', at: NOW}, NOW), false, 'an ignored call reports false');
  assert.equal(history.record({provider: 'vimeo', login: 'x', at: NOW}), null, 'an ignored record has no handle');
});

test('r2-3. a failed backup never lets the unreadable original be overwritten', () => {
  const raw = '{truncated';
  const {disk, faults, open} = failingDisk(raw);
  const history = open();

  faults.backup = true;
  history.record({...OHNE, at: NOW});
  assert.equal(disk.files.get(FILE), raw, 'no write after a failed backup');
  assert.equal(disk.files.has(BACKUP), false);
  faults.backup = false;
  history.record({...twitch('other'), at: NOW});
  assert.equal(disk.files.get(BACKUP), raw);
  assert.deepEqual(disk.snapshot().people.map(({login}) => login), ['ohnepixel', 'other']);
});

test('r2-4. a newer file is read-only whatever its layout: no write, no backup, no memory change', () => {
  const open = {at: NOW - 3600, seconds: null};
  const layouts = [
    {version: 2, paused: false, people: [{...OHNE, visits: [open]}]},
    {version: 2, people: {}},
    {version: 3, anything: ['else']},
    {version: 1.5, people: 'x'},
  ];
  for (const layout of layouts) {
    const raw = JSON.stringify(layout);
    const disk = fakeDisk(raw);
    const history = openHistory(disk, FIXED_RANDOM);
    const before = history.query('');

    assert.equal(history.record({...twitch('another'), at: NOW}), null);
    assert.equal(history.finish({...OHNE, id: 1, instance: FIXED_INSTANCE}, NOW), false);
    assert.equal(history.setPaused(true), false);
    assert.equal(history.forget(OHNE), false);
    assert.equal(history.clear(), false);
    assert.equal(history.paused, false, 'pause did not change in memory');
    assert.deepEqual(history.query(''), before, 'nothing changed in memory');
    assert.equal(disk.files.get(FILE), raw);
    assert.equal(disk.files.has(BACKUP), false, 'a newer file is not damaged, so it is not backed up');
    assert.deepEqual(disk.changes, []);
  }
  const stillOpen = openHistory(fakeDisk(JSON.stringify(layouts[0])), FIXED_RANDOM);
  assert.equal(stillOpen.finish({...OHNE, id: 1, instance: FIXED_INSTANCE}, NOW), false);
  assert.deepEqual(visitsOf(stillOpen, 'ohnepixel'), [open], 'finish did not close the visit in memory');
});

test('r2-5. loaded visits are sorted, durations capped, future times clamped, and a pause toggle is cheap', () => {
  const disk = fakeDisk(snapshot([
    {...OHNE, visits: [
      {at: NOW - DAY, seconds: 60},
      {at: NOW - 3 * DAY, seconds: 1e300},
      {at: NOW + DAY, seconds: null},
      {at: NOW - 2 * DAY, seconds: -5},
    ]},
    {...twitch('unsorted'), visits: [{at: NOW - 60, seconds: null}, {at: NOW - 3600, seconds: null}]},
  ]));
  const history = openHistory(disk, FIXED_RANDOM);

  assert.deepEqual(visitsOf(history, 'ohnepixel'), [
    {at: NOW - 3 * DAY, seconds: 43200}, {at: NOW - DAY, seconds: 60}, {at: NOW, seconds: null},
  ]);
  assert.deepEqual(ranks(history, 'ohnepixel'), [['ohnepixel', 300]], 'a future visit weighs as today, not more');

  // Visits without ids get them in time order across the file: ohnepixel's 3 days ago and 1 day ago are 1 and 2,
  // then the unsorted person's older visit is 3 and newer is 4, then ohnepixel's visit that counts as now is 5.
  history.finish({...twitch('unsorted'), id: 3, instance: FIXED_INSTANCE}, NOW);
  assert.deepEqual(disk.snapshot().people[1].visits, [
    {at: NOW - 3600, seconds: 3600}, {at: NOW - 60, seconds: null},
  ], 'the visit the handle names is finished, whatever its place in the file');

  const writes = disk.changes.length;
  history.setPaused(false);
  assert.equal(disk.changes.length, writes, 'pause already off: no write');
});

test('r2-6. invalid timestamps are rejected; a finish closes the visit its handle names, once', () => {
  const disk = fakeDisk();
  const history = openHistory(disk);
  for (const at of [NaN, Infinity, -Infinity, '1800000000', null, undefined, {}]) {
    assert.equal(history.record({...OHNE, at}), null);
  }
  assert.deepEqual(disk.changes, []);

  const older = history.record({...OHNE, at: NOW - 200});
  const newer = history.record({...OHNE, at: NOW - 100});
  const writes = disk.changes.length;
  for (const at of [NaN, Infinity, '1800000000', null, undefined]) {
    history.finish(newer, at);
  }
  for (const handle of [null, undefined, {}, {...newer, id: NaN}, {...newer, id: 99}, {...newer, id: String(newer.id)},
    {...newer, id: undefined}, {...newer, login: 'nobody'}, {...newer, provider: 'youtube'},
    {...newer, provider: 'vimeo'}, {...newer, instance: undefined}, {...newer, instance: 'other'},
    {...newer, instance: 7}]) {
    assert.equal(history.finish(handle, NOW), false);
  }
  assert.equal(disk.changes.length, writes, 'a bad time or an unknown visit changes nothing');

  assert.equal(history.finish(newer, NOW), true);
  assert.equal(history.finish(newer, NOW), true, 'an identical retry reports the visit as stored');
  assert.equal(disk.changes.length, writes + 1, 'the retry writes nothing');
  assert.deepEqual(disk.snapshot().people[0].visits, [
    {at: NOW - 200, seconds: null}, {at: NOW - 100, seconds: 100},
  ], 'the retry did not close the older open visit');

  history.finish(older, NOW + 5);
  assert.deepEqual(visitsOf(history, 'ohnepixel')[0], {at: NOW - 200, seconds: 205}, 'the other visit still closes');
});

test('r2-6b. two windows of one person closing in the same second both close', () => {
  const disk = fakeDisk();
  const history = openHistory(disk);
  const windowA = history.record({...OHNE, at: NOW - 300});
  const windowB = history.record({...OHNE, at: NOW - 100});

  history.finish(windowA, NOW);
  history.finish(windowB, NOW);
  assert.deepEqual(disk.snapshot().people[0].visits, [
    {at: NOW - 300, seconds: 300}, {at: NOW - 100, seconds: 100},
  ]);

  // Opened in the same second, each still has its own handle.
  const sameSecond = openHistory(fakeDisk());
  const first = sameSecond.record({...OHNE, at: NOW - 50});
  const second = sameSecond.record({...OHNE, at: NOW - 50});
  assert.notDeepEqual(first, second);
  sameSecond.finish(first, NOW - 20);
  assert.deepEqual(visitsOf(sameSecond, 'ohnepixel'), [{at: NOW - 50, seconds: 30}, {at: NOW - 50, seconds: null}]);
  sameSecond.finish(first, NOW);
  assert.deepEqual(visitsOf(sameSecond, 'ohnepixel'), [{at: NOW - 50, seconds: 30}, {at: NOW - 50, seconds: null}],
    'a retry does not close the other window');
  sameSecond.finish(second, NOW);
  assert.deepEqual(visitsOf(sameSecond, 'ohnepixel'), [{at: NOW - 50, seconds: 30}, {at: NOW - 50, seconds: 50}]);
});

test('r2-7. word starts are judged on code points, not UTF-16 units', () => {
  const history = openHistory();
  const mathBoldO = '\u{1D40E}'; // a letter outside the Basic Multilingual Plane
  watch(history, twitch('inside', mathBoldO + 'oh'), NOW - 60);
  watch(history, twitch('spaced', mathBoldO + ' oh'), NOW - 60);
  watch(history, twitch('combining', 'éoh'), NOW - 60);
  watch(history, twitch('astral', '\u{1F600} oh'), NOW - 60);

  assert.deepEqual(history.query('oh').map(({login}) => login), ['astral', 'spaced']);
});

test('r2-8. a full history of strong regulars still admits the newcomer, who is never the one evicted', () => {
  const regulars = Array.from({length: 500}, (_, i) => ({
    ...twitch('regular' + i), visits: [{at: NOW - DAY, seconds: 60}, {at: NOW - 2 * DAY, seconds: 60}],
  }));
  const disk = fakeDisk(snapshot(regulars));
  const history = openHistory(disk);

  history.record({...OHNE, at: NOW});

  const logins = disk.snapshot().people.map(({login}) => login);
  assert.equal(logins.length, 500);
  assert.ok(logins.includes('ohnepixel'), 'the newcomer (score 100) outlives regulars scoring 200');
  assert.equal(logins.filter(login => login.startsWith('regular')).length, 499, 'one regular made room');
});

// Round 3 (Codex final clearance of 8f83b2c, lead disposition).

test('r3-1. a read that throws makes the store unavailable: nothing is written until it can be read', () => {
  const raw = snapshot([{...OHNE, visits: [{at: NOW - 60, seconds: 60}]}]);
  const {disk, faults, open} = failingDisk(raw);

  faults.read = true;
  const history = open();
  assert.deepEqual(history.query(''), []);
  assert.equal(history.forget(OHNE), false, 'forget cannot claim to have forgotten what it could not read');
  assert.equal(history.clear(), false);
  assert.equal(history.setPaused(true), false);
  assert.equal(history.record({...twitch('another'), at: NOW}), null);
  assert.equal(history.finish({...OHNE, id: 1}, NOW), false);
  assert.deepEqual(disk.changes, [], 'no write and no backup while unavailable');
  assert.equal(disk.files.get(FILE), raw);
  assert.equal(history.paused, false);

  faults.read = false;
  assert.equal(history.forget(OHNE), true, 'the next mutation reads the file first, then works');
  assert.deepEqual(disk.snapshot().people, []);
  assert.deepEqual(disk.changes, [['write', FILE]], 'no backup: the file was readable');
});

test('r3-2. an unavailable store recovers on a read, and recovers its pause setting and people', () => {
  const raw = snapshot([{...OHNE, visits: [{at: NOW - 60, seconds: 60}]}], true);
  const {disk, faults, open} = failingDisk(raw);
  faults.read = true;
  const history = open();

  faults.read = false;
  assert.deepEqual(history.query('').map(({login}) => login), ['ohnepixel'], 'query reads again, and writes nothing');
  assert.equal(history.paused, true);
  assert.deepEqual(disk.changes, []);
  assert.equal(history.record({...twitch('another'), at: NOW}), null, 'the recovered pause setting holds');
});

test('r3-3. visit ids are stored, only grow, and are given in time order to a file without them', () => {
  const disk = fakeDisk();
  const history = openHistory(disk);
  const first = history.record({...OHNE, at: NOW - 30});
  const other = history.record({...twitch('other'), at: NOW - 20});
  const third = history.record({...OHNE, at: NOW - 10});
  assert.deepEqual([first.id, other.id, third.id], [1, 2, 3]);
  assert.deepEqual(disk.rawSnapshot().people.map(({visits}) => visits.map(({id}) => id)), [[1, 3], [2]]);

  history.forget(twitch('other'));
  const next = history.record({...twitch('another'), at: NOW});
  assert.equal(next.id, 4, 'an id is never reused after a forget');
  assert.equal(openHistory(disk).record({...OHNE, at: NOW}).id, 5, 'a reload continues after the highest id');

  const legacy = openHistory(fakeDisk(snapshot([{...OHNE, visits: [
    {at: NOW - 10, seconds: 5}, {at: NOW - 30, seconds: 5}, {at: NOW - 20, id: 9, seconds: 5},
    {at: NOW - 15, seconds: 5}, {at: NOW - 25, seconds: 5},
  ]}])));
  const loaded = legacy.query('')[0].visits.map(({id, at}) => [at - NOW, id]);
  assert.deepEqual(loaded, [[-30, 10], [-25, 11], [-20, 9], [-15, 12], [-10, 13]],
    'a kept id stays; an absent one gets the next number, in time order');
});

test('r3-4. a handle still closes its visit when the clock has gone backwards', () => {
  let clock = NOW;
  const disk = fakeDisk();
  const history = historyModule.createHistory({storage: disk.storage, now: () => clock});
  const handle = history.record({...OHNE, at: NOW - 10});

  clock = NOW - 50;
  assert.equal(history.finish(handle, NOW - 40), true, 'ids do not depend on the clock');
  assert.deepEqual(disk.snapshot().people[0].visits, [{at: NOW - 10, seconds: 0}], 'a negative span counts as 0');

  // A reopen with the earlier clock counts the loaded visit as now; the old handle belongs to the old instance.
  const open = historyModule.createHistory({storage: fakeDisk(JSON.stringify({version: 1, paused: false,
    people: [{...OHNE, visits: [{id: 1, at: NOW - 10, seconds: null}]}]})).storage, now: () => NOW - 50});
  assert.deepEqual(open.query('')[0].visits.map(({at}) => at), [NOW - 50], 'the loaded visit counts as now');
  assert.equal(open.finish(handle, NOW - 40), false);
});

test('r3-5. a retry after a failed write cannot close the other window of the same second', () => {
  const {disk, faults, open} = failingDisk();
  const history = open();
  const windowA = history.record({...OHNE, at: NOW - 50});
  const windowB = history.record({...OHNE, at: NOW - 50});

  faults.write = true;
  assert.equal(history.finish(windowA, NOW), false);
  faults.write = false;
  assert.equal(history.finish(windowA, NOW), true, 'the identical retry persists window A only');
  assert.deepEqual(disk.snapshot().people[0].visits, [{at: NOW - 50, seconds: 50}, {at: NOW - 50, seconds: null}]);
  assert.equal(history.finish(windowB, NOW + 5), true);
  assert.deepEqual(disk.snapshot().people[0].visits, [{at: NOW - 50, seconds: 50}, {at: NOW - 50, seconds: 55}]);
});

test('r3-6. over 500 people in a file are trimmed by score on load, and written trimmed on the next change', () => {
  const regulars = Array.from({length: 500}, (_, i) => ({
    ...twitch('regular' + i), visits: [{at: NOW - DAY, seconds: 60}, {at: NOW - 2 * DAY, seconds: 60}],
  }));
  const weak = {...twitch('weak'), visits: [{at: NOW - 100 * DAY, seconds: 60}]};
  const disk = fakeDisk(snapshot([weak, ...regulars]));
  const history = openHistory(disk);

  const loaded = history.query('').map(({login}) => login);
  assert.equal(loaded.length, 500);
  assert.ok(!loaded.includes('weak'));
  assert.deepEqual(disk.changes, [], 'loading writes nothing');

  history.setPaused(true);
  assert.equal(disk.snapshot().people.length, 500);
  assert.ok(!disk.snapshot().people.some(({login}) => login === 'weak'));
});

test('r3-7. a failed forget, clear or pause keeps its change in memory and the next mutating call writes it', () => {
  const {disk, faults, open} = failingDisk(snapshot([
    {...OHNE, visits: [{at: NOW - 60, seconds: 60}]}, {...twitch('other'), visits: [{at: NOW - 60, seconds: 60}]},
  ]));
  const history = open();
  faults.write = true;

  assert.equal(history.forget(OHNE), false);
  assert.deepEqual(history.query('').map(({login}) => login), ['other'], 'forgotten in memory');
  assert.equal(history.setPaused(true), false);
  assert.equal(history.paused, true, 'paused in memory');
  assert.equal(history.clear(), false);
  assert.deepEqual(history.query(''), [], 'cleared in memory');
  assert.equal(disk.snapshot().people.length, 2, 'the file is untouched');
  assert.equal(history.query('').length, 0, 'query does not write');

  faults.write = false;
  assert.equal(history.query('').length, 0);
  assert.equal(disk.snapshot().people.length, 2, 'query never writes, even when the disk is back');
  assert.equal(history.setPaused(true), true, 'any mutating call, even one with nothing to change, flushes');
  assert.deepEqual(disk.snapshot(), {version: 1, paused: true, people: []});
});

test('r3-8. a call that changes nothing still retries a pending write', () => {
  const noChange = {
    'record with a bad provider': (history) => history.record({provider: 'vimeo', login: 'x', at: NOW}),
    'record while paused': (history) => history.record({...twitch('another'), at: NOW}),
    'finish with an unknown handle': (history) => history.finish({...OHNE, id: 99}, NOW),
    'finish of a closed visit': (history, closed) => history.finish(closed, NOW),
    'forget of an unknown person': (history) => history.forget(twitch('nobody')),
  };
  for (const [name, call] of Object.entries(noChange)) {
    const {disk, faults, open} = failingDisk();
    const history = open();
    const closed = history.record({...OHNE, at: NOW - 100});
    history.finish(closed, NOW - 40);
    history.record({...twitch('other'), at: NOW - 90});
    if (name === 'record while paused') history.setPaused(true);
    faults.write = true;
    history.forget(twitch('other'));
    assert.equal(disk.snapshot().people.length, 2, name + ': the forget did not reach the file');

    faults.write = false;
    call(history, closed);
    const logins = disk.snapshot().people.map(({login}) => login);
    assert.deepEqual(logins, ['ohnepixel'], name + ': the pending write was retried');
  }
});

test('r3-9. stored timestamps, durations and ids that are not usable numbers are rejected on load', () => {
  const good = '{"id":1,"at":' + (NOW - 60) + ',"seconds":60}';
  const bad = [
    '"at":"' + (NOW - 60) + '","seconds":60', '"at":null,"seconds":60', '"at":true,"seconds":60',
    '"at":{},"seconds":60', '"at":[],"seconds":60', '"seconds":60', '"at":1e999,"seconds":60',
    '"at":' + (NOW - 60) + ',"seconds":"60"', '"at":' + (NOW - 60) + ',"seconds":-1',
    '"at":' + (NOW - 60) + ',"seconds":1e999', '"at":' + (NOW - 60) + ',"seconds":true',
    '"at":' + (NOW - 60) + ',"seconds":{}', '"at":' + (NOW - 60),
  ];
  const raw = '{"version":1,"paused":false,"people":[{"provider":"twitch","login":"ohnepixel",' +
    '"displayName":"Ohnepixel","visits":[' + [good, ...bad.map(fields => '{' + fields + '}')].join(',') + ']}]}';
  const history = openHistory(fakeDisk(raw));

  assert.deepEqual(visitsOf(history, 'ohnepixel'), [{at: NOW - 60, seconds: 60}]);
});

// Round 4 (Codex narrow check of 777052a, lead disposition).

test('r4-1. the next id is stored, so forgetting the newest visit never lets its id, or its handle, come back', () => {
  const disk = fakeDisk();
  const history = openHistory(disk);
  history.record({...OHNE, at: NOW - 30});
  const staleHandle = history.record({...twitch('other'), at: NOW - 20});
  assert.equal(staleHandle.id, 2);
  assert.equal(disk.rawSnapshot().nextId, 3);

  history.forget(twitch('other'));
  const reopened = openHistory(disk);
  const fresh = reopened.record({...twitch('other'), at: NOW - 10});
  assert.equal(fresh.id, 3, 'the forgotten visit\'s id is not reused');
  assert.equal(reopened.finish(staleHandle, NOW), false, 'the stale handle matches nothing');
  assert.deepEqual(visitsOf(reopened, 'other'), [{at: NOW - 10, seconds: null}], 'and the new visit stays open');
  assert.equal(reopened.finish(fresh, NOW), true);
});

test('r4-2. the stored next id is a floor for ids a file lacks, and a file without one uses its highest id', () => {
  const visit = {id: 7, at: NOW - 60, seconds: 60};
  const bare = {at: NOW - 30, seconds: 30};
  const file = nextId => JSON.stringify({version: 1, paused: false, nextId,
    people: [{...OHNE, visits: [visit, bare]}]});

  const without = openHistory(fakeDisk(file(undefined)));
  assert.deepEqual(without.query('')[0].visits.map(({id}) => id), [7, 8]);
  assert.equal(without.record({...twitch('another'), at: NOW}).id, 9);

  const lower = openHistory(fakeDisk(file(3)));
  assert.deepEqual(lower.query('')[0].visits.map(({id}) => id), [7, 8], 'a lower nextId does not lower the floor');

  const higher = openHistory(fakeDisk(file(50)));
  assert.deepEqual(higher.query('')[0].visits.map(({id}) => id), [7, 50], 'missing ids start at nextId');
  assert.equal(higher.record({...twitch('another'), at: NOW}).id, 51);
});

test('r4-3. forgetting a person the load trimmed also removes them from the file', () => {
  const regulars = Array.from({length: 500}, (_, i) => ({
    ...twitch('regular' + i), visits: [{at: NOW - DAY, seconds: 60}, {at: NOW - 2 * DAY, seconds: 60}],
  }));
  const weak = {...twitch('weak'), visits: [{at: NOW - 100 * DAY, seconds: 60}]};
  const raw = snapshot([weak, ...regulars]);
  const disk = fakeDisk(raw);
  const history = openHistory(disk);
  assert.ok(!history.query('').some(({login}) => login === 'weak'), 'trimmed in memory');

  assert.equal(history.forget(twitch('nobody')), true);
  assert.equal(disk.files.get(FILE), raw, 'forgetting a stranger writes nothing');
  assert.deepEqual(disk.changes, []);

  assert.equal(history.forget(twitch('WEAK')), true);
  assert.equal(disk.snapshot().people.length, 500);
  assert.ok(!disk.snapshot().people.some(({login}) => login === 'weak'), 'gone from the file too');

  // A failed write is retried and still removes them.
  const {disk: failing, faults, open} = failingDisk(raw);
  const retried = open();
  faults.write = true;
  assert.equal(retried.forget(twitch('weak')), false);
  faults.write = false;
  assert.equal(retried.forget(twitch('weak')), true);
  assert.ok(!failing.snapshot().people.some(({login}) => login === 'weak'));
});

// Amended 2026-11-25 (phase 3c, TESTS-74; the backend reviewer's likely flake): the bound used the wall clock, which
// counts time the process spent waiting for a CPU when the whole suite runs in parallel. It now measures the CPU time
// this process used (process.cpuUsage, user plus system) and takes the least of five loads, so a descheduled or
// contended run cannot fail it, while a quadratic trim, which costs seconds of CPU, still does. The 200 ms bound and
// the assertions on the result are unchanged. Measured here: about 10-25 ms of CPU for one load (13 ms wall).
test('r4-6. a 10,000-person file is trimmed to the 500 strongest by one sort, quickly', () => {
  const people = Array.from({length: 10000}, (_, i) => ({
    ...twitch('p' + i), visits: [{at: NOW - 10 * i, seconds: 60}],
  }));
  people.push({...twitch('veryfrequent'), visits: [1, 2, 3].map(n => ({at: NOW - n, seconds: 60}))});
  const text = snapshot(people);

  let history;
  let disk;
  let leastCpuMs = Infinity;
  for (let run = 0; run < 5; run++) {
    disk = fakeDisk(text);
    const before = process.cpuUsage();
    history = openHistory(disk);
    const used = process.cpuUsage(before);
    leastCpuMs = Math.min(leastCpuMs, (used.user + used.system) / 1000);
  }

  const kept = history.query('').map(({login}) => login);
  assert.equal(kept.length, 500);
  assert.equal(kept[0], 'veryfrequent');
  assert.deepEqual(new Set(kept), new Set(['veryfrequent', ...Array.from({length: 499}, (_, i) => 'p' + i)]),
    'equal scores: the newest visits stay');
  assert.ok(leastCpuMs < 200, 'loading took at least ' + leastCpuMs.toFixed(1) + ' ms of CPU');
  assert.deepEqual(disk.changes, []);
});

test('r4-7. record returns null, the sentinel for ignored, in every case where it adds nothing', () => {
  const {faults, open} = failingDisk();
  const history = open();
  assert.equal(history.record({provider: 'vimeo', login: 'x', at: NOW}), null);
  assert.equal(history.record({...OHNE, at: NaN}), null);
  history.setPaused(true);
  assert.equal(history.record({...OHNE, at: NOW}), null);
  history.setPaused(false);
  assert.notEqual(history.record({...OHNE, at: NOW}), null);
  faults.read = true;
  assert.equal(open().record({...OHNE, at: NOW}), null, 'unavailable');
});

// Round 5 (step-back, lead): ids are bounded at 2^31 and nothing is renumbered.

const BOUND = 2 ** 31;

test('r5-1. an id, or a nextId, that is not a whole number from 1 to 2^31 makes the file corrupt', () => {
  const visit = id => ({id, at: NOW - 60, seconds: 60});
  const withVisitId = id => JSON.stringify({version: 1, paused: false, people: [{...OHNE, visits: [visit(id)]}]});
  const withNextId = nextId => JSON.stringify({version: 1, paused: false, nextId, people: []});
  const bad = [
    withVisitId(0), withVisitId(-1), withVisitId(1.5), withVisitId('3'), withVisitId(true), withVisitId([]),
    withVisitId({}), withVisitId(BOUND + 1), withVisitId(2 ** 53), withVisitId(Number.MAX_SAFE_INTEGER),
    withVisitId(null).replace('"id":null', '"id":1e999'),
    withNextId(0), withNextId(-4), withNextId(1.5), withNextId('x'), withNextId(null), withNextId(BOUND + 2),
    withNextId(2 ** 53),
  ];
  for (const raw of bad) {
    const disk = fakeDisk(raw);
    const history = openHistory(disk);
    assert.deepEqual(history.query(''), [], raw);
    assert.deepEqual(disk.changes, [], 'reading writes nothing');
    const handle = history.record({...OHNE, at: NOW});
    assert.equal(handle.id, 1, 'history starts empty: ' + raw);
    assert.equal(disk.files.get(BACKUP), raw, 'the file is kept as .bad: ' + raw);
    assert.deepEqual(disk.changes.slice(0, 2), [['backup', FILE, BACKUP], ['write', FILE]]);
  }

  const fine = [withVisitId(1), withVisitId(BOUND), withNextId(1), withNextId(BOUND), withNextId(BOUND + 1)];
  for (const raw of fine) {
    const disk = fakeDisk(raw);
    openHistory(disk).query('');
    assert.equal(disk.files.has(BACKUP), false, raw);
  }
  assert.equal(openHistory(fakeDisk(withVisitId(BOUND))).query('').length, 1);
});

test('r5-2. a newer file is never judged by its ids: it stays read-only, with no backup', () => {
  const raw = JSON.stringify({version: 2, nextId: -1, people: [
    {...OHNE, visits: [{id: -5, at: NOW - 60, seconds: 60}, {id: 2 ** 60, at: NOW - 30, seconds: 30}]},
  ]});
  const disk = fakeDisk(raw);
  const history = openHistory(disk);

  assert.equal(history.query('').length, 1);
  assert.equal(history.record({...twitch('another'), at: NOW}), null);
  assert.equal(disk.files.get(FILE), raw);
  assert.equal(disk.files.has(BACKUP), false);
  assert.deepEqual(disk.changes, []);
});

test('r5-3. at the bound record returns null and writes nothing; the last id is handed out first', () => {
  for (const raw of [
    JSON.stringify({version: 1, paused: false, people: [{...OHNE, visits: [{id: BOUND, at: NOW - 60, seconds: 60}]}]}),
    JSON.stringify({version: 1, paused: false, nextId: BOUND + 1, people: []}),
  ]) {
    const disk = fakeDisk(raw);
    const history = openHistory(disk);
    assert.equal(history.record({...twitch('another'), at: NOW}), null);
    assert.equal(history.record({...OHNE, at: NOW}), null);
    assert.equal(disk.files.get(FILE), raw, 'nothing written');
    assert.deepEqual(disk.changes, []);
    assert.equal(history.forget(twitch('another')), true, 'other calls still work');
  }

  const disk = fakeDisk(JSON.stringify({version: 1, paused: false, nextId: BOUND, people: []}));
  const history = openHistory(disk);
  const last = history.record({...OHNE, at: NOW});
  assert.notEqual(last, null, 'the last id is still handed out');
  assert.equal(last.id, BOUND);
  assert.equal(disk.rawSnapshot().nextId, BOUND + 1);
  const writes = disk.changes.length;
  assert.equal(history.record({...twitch('another'), at: NOW}), null);
  assert.equal(disk.changes.length, writes);
  assert.equal(openHistory(disk).record({...twitch('another'), at: NOW}), null, 'and after a reload');
  assert.equal(history.finish(last, NOW + 1), true, 'finishing still works at the bound');
});

test('r5-4. ids a file lacks are given from nextId upward in time order, across people', () => {
  const raw = JSON.stringify({version: 1, paused: false, nextId: 20, people: [
    {...twitch('later'), visits: [{at: NOW - 10, seconds: 60}, {at: NOW - 40, seconds: 60}]},
    {...twitch('earlier'), visits: [{at: NOW - 30, seconds: 60}, {id: 5, at: NOW - 20, seconds: 60}]},
  ]});
  const history = openHistory(fakeDisk(raw));

  const idsByLogin = Object.fromEntries(history.query('').map(({login, visits}) => [login, visits.map(({id}) => id)]));
  // Missing ids in time order: later@-40 gets 20, earlier@-30 gets 21, later@-10 gets 22. The id 5 stays.
  assert.deepEqual(idsByLogin, {later: [20, 22], earlier: [21, 5]});
});

test('r5-5. a handle from before a reopen closes nothing once its visit is gone', () => {
  const disk = fakeDisk();
  const history = openHistory(disk);
  const stale = history.record({...OHNE, at: NOW - 100});
  history.forget(OHNE);

  const reopened = openHistory(disk);
  const fresh = reopened.record({...OHNE, at: NOW - 50});
  assert.notEqual(fresh.id, stale.id);
  assert.equal(reopened.finish(stale, NOW), false);
  assert.deepEqual(visitsOf(reopened, 'ohnepixel'), [{at: NOW - 50, seconds: null}]);
  assert.equal(reopened.finish(fresh, NOW), true);
});

test('r5-6. a file whose missing ids cannot be given without passing the bound is corrupt', () => {
  const raw = JSON.stringify({version: 1, paused: false, people: [{...OHNE, visits: [
    {id: BOUND, at: NOW - 60, seconds: 60}, {at: NOW - 30, seconds: 30},
  ]}]});
  const disk = fakeDisk(raw);

  assert.deepEqual(openHistory(disk).query(''), []);
  openHistory(disk).record({...OHNE, at: NOW});
  assert.equal(disk.files.get(BACKUP), raw);

  const fits = JSON.stringify({version: 1, paused: false, people: [{...OHNE, visits: [
    {id: BOUND - 1, at: NOW - 60, seconds: 60}, {at: NOW - 30, seconds: 30},
  ]}]});
  assert.deepEqual(openHistory(fakeDisk(fits)).query('')[0].visits.map(({id}) => id), [BOUND - 1, BOUND]);
});

// Round 6 (Codex narrow check of 8f37230, lead disposition).

test('r6-1. a handle closes visits of its own instance only', () => {
  const disk = fakeDisk();
  const first = openHistory(disk, () => 0.25);
  const handle = first.record({...OHNE, at: NOW - 100});
  assert.equal(first.finish({...handle}, NOW), true, 'the same instance still works');
  assert.deepEqual(visitsOf(first, 'ohnepixel'), [{at: NOW - 100, seconds: 100}]);

  // A normal reopen: ids continue, and a handle from before it closes nothing.
  const openVisit = first.record({...OHNE, at: NOW - 50});
  const reopened = openHistory(disk, () => 0.75);
  const writes = disk.changes.length;
  assert.equal(reopened.finish(openVisit, NOW), false);
  assert.equal(disk.changes.length, writes, 'and writes nothing');
  assert.deepEqual(visitsOf(reopened, 'ohnepixel'), [{at: NOW - 100, seconds: 100}, {at: NOW - 50, seconds: null}]);
  const next = reopened.record({...OHNE, at: NOW - 20});
  assert.equal(reopened.finish(next, NOW), true);
  assert.notEqual(next.instance, openVisit.instance);
});

test('r6-2. after a corrupt reset restarts the ids, a handle from before the reset closes nothing', () => {
  const disk = fakeDisk();
  const before = openHistory(disk, () => 0.25);
  const stale = before.record({...OHNE, at: NOW - 100});
  disk.files.set(FILE, '{truncated');

  const after = openHistory(disk, () => 0.75);
  const fresh = after.record({...OHNE, at: NOW - 60});
  assert.equal(stale.id, fresh.id, 'the ids restarted, so only the instance tells the handles apart');
  assert.equal(after.finish(stale, NOW), false);
  assert.deepEqual(visitsOf(after, 'ohnepixel'), [{at: NOW - 60, seconds: null}], 'the new visit stays open');
  assert.equal(after.finish(fresh, NOW), true);
});

test('r6-3. the instance token comes from random: injected for tests, different by default', () => {
  const draws = [];
  const history = openHistory(fakeDisk(), () => {
    draws.push(draws.length);
    return 0.5;
  });
  assert.ok(draws.length > 0, 'random was used');
  assert.equal(history.record({...OHNE, at: NOW}).instance, '80000000'.repeat(4));

  const one = openHistory(fakeDisk()).record({...OHNE, at: NOW}).instance;
  const two = openHistory(fakeDisk()).record({...OHNE, at: NOW}).instance;
  assert.notEqual(one, two);
});

// Ids the file holds are checked strictly; any failure is a corrupt file: backed up, history starts empty.
const idsFile = people => JSON.stringify({version: 1, paused: false, people});
const personWith = (login, visits) => ({...twitch(login), visits});
const timed = (id, at = NOW - 60, seconds = 60) => ({id, at, seconds});

test('r6-4. a duplicate id anywhere, an explicit null id, or a bad id on any visit makes the file corrupt', () => {
  const dropped = [
    {id: 3, at: 'not a time', seconds: 60}, {id: 3, at: NOW - 60, seconds: -1}, {id: 3, seconds: 60},
    {id: 3, at: NOW - 60, seconds: 'x'},
  ];
  const corrupt = {
    'same id twice on one person': idsFile([personWith('a', [timed(1), timed(1, NOW - 30)])]),
    'same id on two people': idsFile([personWith('a', [timed(1)]), personWith('b', [timed(1)])]),
    'a null id': idsFile([personWith('a', [{id: null, at: NOW - 60, seconds: 60}])]),
    'a null id on a dropped visit': idsFile([personWith('a', [{id: null, at: 'x', seconds: 60}])]),
    'a bad id on a visit dropped for its time': idsFile([personWith('a', [{id: -2, at: 'x', seconds: 60}])]),
    'a bad id on a visit dropped for its duration': idsFile([personWith('a', [{id: 1.5, at: NOW - 60, seconds: -1}])]),
    'a bad id on a person dropped for its login': idsFile([{...twitch('bad login'), visits: [timed('7')]}]),
    'a bad id on a visit beyond the newest ten': idsFile([personWith('a', [
      timed(0, NOW - 200), ...Array.from({length: 11}, (_, i) => timed(i + 1, NOW - 100 + i))])]),
    'a kept id repeated on a dropped visit': idsFile([personWith('a', [timed(5), {...dropped[0], id: 5}])]),
    'a dropped visit repeated in another person': idsFile([personWith('a', [{...dropped[1], id: 6}]),
      personWith('b', [timed(6)])]),
    'a repeated person with the same id': idsFile([personWith('a', [timed(1)]), personWith('a', [timed(1)])]),
  };
  for (const [name, raw] of Object.entries(corrupt)) {
    const disk = fakeDisk(raw);
    const history = openHistory(disk);
    assert.deepEqual(history.query(''), [], name);
    assert.deepEqual(disk.changes, [], name + ': reading writes nothing');
    history.record({...OHNE, at: NOW});
    assert.equal(disk.files.get(BACKUP), raw, name + ': kept as .bad');
    assert.deepEqual(disk.changes.slice(0, 2), [['backup', FILE, BACKUP], ['write', FILE]], name);
  }
});

test('r6-5. load never changes an id the file has; only absent ids are assigned', () => {
  const raw = idsFile([
    personWith('a', [timed(40, NOW - 90), {at: NOW - 80, seconds: 5}, timed(3, NOW - 70)]),
    personWith('b', [timed(1, NOW - 60), timed(2, NOW - 50)]),
  ]);
  const disk = fakeDisk(raw);
  const history = openHistory(disk);

  const ids = Object.fromEntries(history.query('').map(({login, visits}) => [login, visits.map(({id}) => id)]));
  assert.deepEqual(ids, {a: [40, 41, 3], b: [1, 2]}, 'the absent id is 41, above the highest');
  assert.deepEqual(disk.changes, []);
});

test('r6-6. a newer file is not judged by its ids: repeats and bad ids are replaced in memory only', () => {
  const raw = JSON.stringify({version: 2, people: [
    personWith('a', [timed(1), timed(1, NOW - 30), {id: null, at: NOW - 20, seconds: 20}, timed(-3, NOW - 10)]),
  ]});
  const disk = fakeDisk(raw);
  const history = openHistory(disk);

  const ids = history.query('')[0].visits.map(({id}) => id);
  assert.equal(new Set(ids).size, 4, 'four distinct ids in memory');
  assert.equal(disk.files.has(BACKUP), false);
  assert.equal(history.record({...OHNE, at: NOW}), null);
  assert.deepEqual(disk.changes, []);
});
