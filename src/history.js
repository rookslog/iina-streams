'use strict';

// Watch history (#73): who the viewer watches, how often and how recently, for typing suggestions (#74).
// Pure: storage and the clock are injected, nothing here does I/O of its own or logs a name.
// Test design: docs/design/finding-2026-11-22/history/TESTS.md (items 1-9).
//
// Privacy: a person is {provider, login, displayName, visits}; a visit is {id, at, seconds} plus offline:true
// for an offline open. The module stores only identity fields that pass its allowlists, and never playback
// metadata: no URL, title, token, signature or query string. The login is an allowlist (a Twitch login or a
// YouTube channel id, nothing else), the display name is bounded and may not hold URL characters, and every
// other input field is ignored. It checks format, not provenance: the caller must pass identity that came
// from a resolved Twitch user or a YouTube channel record, never text taken from a URL, token or playlist.
//
// Choices beyond the test design (accepted by the lead, 2026-11-22):
// - the person just recorded is never the one evicted at the bound (otherwise a full history could never
//   admit anyone new). A file with more than 500 people is trimmed by score on load, in memory only
//   (one sort, so a huge file opens quickly);
// - a storage error never throws. The change stays in memory and the store stays "unsaved": the next
//   mutating call retries the write (query never writes), and the call that made the change returns false.
//   Nothing is overwritten after a failed backup;
// - a file that cannot be parsed (bad JSON, no version, no people array) is treated as corrupt: backed up,
//   then replaced on the next write. A file that cannot be READ (the read throws) makes the store
//   unavailable: every mutation first retries the read, then returns false and writes nothing while it still
//   fails, so a file that could not be read is never overwritten;
// - a file with a newer version is read-only, checked before its shape: it loads for query, and every
//   change is a no-op that writes and backs up nothing;
// - loaded visits are sorted by time, loaded durations are capped at 12 hours, and a loaded visit in the
//   future counts as now;
// - every visit has an id, a whole number from 1 to MAX_VISIT_ID (2^31) that only grows, and the file keeps
//   the next id to hand out (`nextId`), so forgetting the newest visit never lets its id come back. A file
//   without ids (an older one) gets them from nextId upward, in time order. An id or nextId that is not a
//   whole number, is below 1 or is above the bound makes the file corrupt (backed up, then replaced). There
//   is no renumbering: at the bound record() returns null and writes nothing;
//   A file is corrupt if any visit has an explicit id that is not valid (null included), if an id appears
//   twice anywhere in it, or if an id sits on a visit that is dropped for a bad time or duration. Load never
//   changes an id that is there; only an absent id is assigned;
// - handles belong to one createHistory instance: record() returns {provider, login, id, instance} for the
//   visit it opened (null when ignored), where `instance` is a random token drawn when the instance was
//   created (`random` can be injected, as Math.random's shape, for tests). A handle from another instance (a
//   reopen, or a reset after a corrupt file that restarts the ids) closes nothing. finish(handle, at)
//   closes exactly that visit. Finishing a visit that is already closed, or that does not
//   exist, changes nothing, so an identical retry is harmless, two windows of one person each close their
//   own visit even in the same second, and a clock that moves backwards cannot orphan a handle. The handle
//   holds no secret; the caller keeps it from player start to close, within one instance.
//
// finish, forget, clear and setPaused return true when the change is in the file (for forget, clear and
// setPaused also when it already was), and false when it was ignored or the write failed. record returns its
// handle even when the write failed: the visit is kept in memory and the next mutating call retries the write.
// record's `null` is its "false": it means the record was ignored (paused, read-only, unavailable, unsafe
// identity or bad time).
//
// A file with more than 500 people is trimmed on load in memory only. The trimmed people stay in the file
// until the next write, and forget() of one of them rewrites the file without them.
//
// Storage contract: read(path) returns text or null when the file is missing (it may throw);
// write(path, text); backup(from, to) copies the original bytes. `at` and now() are Unix seconds.

const HISTORY_FILE = '@data/history.json';
const BACKUP_FILE = HISTORY_FILE + '.bad';
const FORMAT_VERSION = 1;

const MAX_PEOPLE = 500;
// The largest visit id. At two billion visits the history stops recording rather than renumber.
const MAX_VISIT_ID = 2 ** 31;
const MAX_VISITS_PER_PERSON = 10;
const MAX_VISIT_SECONDS = 12 * 60 * 60;
// A visit that ended sooner than this is an accidental open, not interest.
const MIN_INTEREST_SECONDS = 30;

const DAY = 24 * 60 * 60;
// Age weights: a visit up to `maxAge` seconds old adds `weight`. Older visits add OLDER_WEIGHT.
const AGE_WEIGHTS = Object.freeze([
  {maxAge: 4 * DAY, weight: 100},
  {maxAge: 14 * DAY, weight: 70},
  {maxAge: 31 * DAY, weight: 50},
  {maxAge: 90 * DAY, weight: 30},
]);
const OLDER_WEIGHT = 10;

const PROVIDERS = Object.freeze(['twitch', 'youtube']);
const TWITCH_LOGIN_PATTERN = /^[A-Za-z0-9_]{1,25}$/;
const YOUTUBE_CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;
// A display name may hold spaces and any other Unicode, but not URL characters, a backslash or control characters.
const UNSAFE_DISPLAY_NAME_PATTERN = /[:?/=\\&\p{Cc}]/u;
const MAX_DISPLAY_NAME_LENGTH = 64;
// A word start follows a character that is not part of a word. Marks belong to the letter before them.
const WORD_CHARACTER = /[\p{L}\p{N}\p{M}]/u;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// An allowlist, not a blocklist: only a Twitch login or a YouTube channel id can be an identity, so a URL,
// an address or a bare token never is one.
function isSafeLogin(provider, login) {
  if (typeof login !== 'string') {
    return false;
  }
  const pattern = provider === 'twitch' ? TWITCH_LOGIN_PATTERN : YOUTUBE_CHANNEL_ID_PATTERN;
  return pattern.test(login);
}

function isSafeDisplayName(value) {
  return typeof value === 'string' && value.trim() !== '' &&
    value.length <= MAX_DISPLAY_NAME_LENGTH && !UNSAFE_DISPLAY_NAME_PATTERN.test(value);
}

// Twitch logins are case-insensitive and stored lowercase; YouTube channel IDs are case-sensitive.
function normalizeLogin(provider, login) {
  return provider === 'twitch' ? login.toLowerCase() : login;
}

// Returns {provider, login, displayName} for a safe identity, else null.
// A missing displayName falls back to the login; a present but unsafe one rejects the whole identity.
function cleanIdentity(input) {
  if (!input || !PROVIDERS.includes(input.provider)) {
    return null;
  }
  if (!isSafeLogin(input.provider, input.login)) {
    return null;
  }
  const displayName = input.displayName === undefined || input.displayName === null
    ? input.login
    : input.displayName;
  if (!isSafeDisplayName(displayName)) {
    return null;
  }
  return {
    provider: input.provider,
    login: normalizeLogin(input.provider, input.login),
    displayName,
  };
}

function personKey(provider, login) {
  return provider + '\n' + login;
}

function isValidVisitId(value) {
  return Number.isInteger(value) && value >= 1 && value <= MAX_VISIT_ID;
}

// Thrown while reading a file that this code owns but cannot trust (for example an id outside its bounds).
class CorruptHistory extends Error {}

// Judges every explicit id in the file, on every visit of every person, including those that loading will
// drop. An id that is present must be valid (null is not absent), and no id may appear twice anywhere.
function checkStoredIds(rawPeople) {
  const seen = new Set();
  for (const person of rawPeople) {
    if (!person || !Array.isArray(person.visits)) {
      continue;
    }
    for (const visit of person.visits) {
      if (!visit || visit.id === undefined) {
        continue;
      }
      if (!isValidVisitId(visit.id) || seen.has(visit.id)) {
        throw new CorruptHistory();
      }
      seen.add(visit.id);
    }
  }
}

// Returns a clean visit from stored data, or null. Unknown fields are dropped. A visit in the future (clock
// skew) counts as now, and a duration is capped like finish() caps it.
function cleanStoredVisit(raw, nowSeconds) {
  if (!raw || !isFiniteNumber(raw.at)) {
    return null;
  }
  const open = raw.seconds === null;
  if (!open && !(isFiniteNumber(raw.seconds) && raw.seconds >= 0)) {
    return null;
  }
  const seconds = open ? null : Math.min(raw.seconds, MAX_VISIT_SECONDS);
  // An absent id is null here and assigned once the whole file is known. (checkStoredIds has already judged
  // the ids of a file this code owns; in a newer, read-only file an unusable id is simply replaced.)
  const id = isValidVisitId(raw.id) ? raw.id : null;
  const visit = {id, at: Math.min(raw.at, nowSeconds), seconds};
  if (raw.offline === true) {
    visit.offline = true;
  }
  return visit;
}

function cleanStoredPerson(raw, nowSeconds) {
  const identity = cleanIdentity(raw);
  if (!identity || !Array.isArray(raw.visits)) {
    return null;
  }
  const visits = [];
  for (const rawVisit of raw.visits) {
    const visit = cleanStoredVisit(rawVisit, nowSeconds);
    if (visit !== null) {
      visits.push(visit);
    }
  }
  visits.sort((a, b) => a.at - b.at);
  return {...identity, visits};
}

// Gives every visit without an id the next number, from `floor` upward, in time order. `floor` is the highest
// id handed out before (from the file's nextId). Returns the highest id in use. In a file this code owns, ids
// are already valid and unique (checkStoredIds), so only absent ones are assigned, and running past
// MAX_VISIT_ID makes the file corrupt. In a newer, read-only file a repeated id is assigned a new one in
// memory too.
function assignVisitIds(people, floor, strict) {
  let highest = floor;
  const needing = [];
  for (const person of people) {
    const used = new Set();
    for (const visit of person.visits) {
      if (visit.id === null || used.has(visit.id)) {
        needing.push(visit);
      } else {
        highest = Math.max(highest, visit.id);
        used.add(visit.id);
      }
    }
  }
  if (strict && highest + needing.length > MAX_VISIT_ID) {
    throw new CorruptHistory();
  }
  // Array.prototype.sort is stable: visits at one time keep file order.
  needing.sort((a, b) => a.at - b.at);
  for (const visit of needing) {
    highest += 1;
    visit.id = highest;
  }
  for (const person of people) {
    person.visits = person.visits.slice(-MAX_VISITS_PER_PERSON);
  }
  return highest;
}

function ageWeight(age) {
  for (const {maxAge, weight} of AGE_WEIGHTS) {
    if (age <= maxAge) {
      return weight;
    }
  }
  return OLDER_WEIGHT;
}

function visitWeight(visit, nowSeconds) {
  const finishedQuickly = visit.seconds !== null && visit.seconds < MIN_INTEREST_SECONDS && !visit.offline;
  if (finishedQuickly) {
    return 0;
  }
  return ageWeight(Math.max(0, nowSeconds - visit.at));
}

function scorePerson(person, nowSeconds) {
  let total = 0;
  for (const visit of person.visits) {
    total += visitWeight(visit, nowSeconds);
  }
  return total;
}

function newestVisitAt(person) {
  let newest = -Infinity;
  for (const visit of person.visits) {
    newest = Math.max(newest, visit.at);
  }
  return newest;
}

function copyPerson(person) {
  return {...person, visits: person.visits.map(visit => ({...visit}))};
}

// Where the query matches a person: 0 = prefix of login or display name, 1 = start of a later word in the
// display name (after any character that is not a letter, digit or mark), null = no match.
function matchRank(person, needle) {
  const login = person.login.toLowerCase();
  const name = person.displayName.toLowerCase();
  if (login.startsWith(needle) || name.startsWith(needle)) {
    return 0;
  }
  // Walk code points, not UTF-16 units, so half of a surrogate pair is never taken for a separator.
  let previous = null;
  let offset = 0;
  for (const character of name) {
    const startsWord = previous !== null && !WORD_CHARACTER.test(previous);
    if (startsWord && name.startsWith(needle, offset)) {
      return 1;
    }
    previous = character;
    offset += character.length;
  }
  return null;
}

function compareNumbers(a, b) {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

function compareText(a, b) {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

// Orders entries by score (high first), then newest visit, then login. Entries are {person, score}.
function compareByInterest(a, b) {
  if (a.score !== b.score) {
    return b.score - a.score;
  }
  const newestA = newestVisitAt(a.person);
  const newestB = newestVisitAt(b.person);
  if (newestA !== newestB) {
    return newestB - newestA;
  }
  return compareText(a.person.login, b.person.login);
}

// Loads the file. Result: {people, paused, readOnly, damaged}. `damaged` means the file existed but could not
// be used, so the original must be backed up before anything overwrites it.
function loadFile(storage, nowSeconds) {
  const empty = {people: [], paused: false, readOnly: false, damaged: false, unavailable: false, lastId: 0};
  let text;
  try {
    text = storage.read(HISTORY_FILE);
  } catch (error) {
    // The file may be fine; it just could not be read. Never treat it as empty and overwrite it.
    return {...empty, unavailable: true};
  }
  if (text === null || text === undefined) {
    return empty;
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return {...empty, damaged: true};
  }
  if (!data || typeof data !== 'object' || typeof data.version !== 'number') {
    return {...empty, damaged: true};
  }
  // The version comes before the shape: a newer file may lay its data out differently, and it must never
  // be mistaken for a damaged one (which would be backed up and overwritten).
  const newer = data.version > FORMAT_VERSION;
  const knownShape = data.version >= 1 && Array.isArray(data.people);
  if (!newer && !knownShape) {
    return {...empty, damaged: true};
  }

  try {
    return readPeople(data, newer, nowSeconds, empty);
  } catch (error) {
    if (error instanceof CorruptHistory) {
      return {...empty, damaged: true};
    }
    throw error;
  }
}

// The part of loadFile that may find the file corrupt (and throws CorruptHistory).
function readPeople(data, newer, nowSeconds, empty) {
  const strict = !newer;
  const people = [];
  const seen = new Set();
  const rawPeople = Array.isArray(data.people) ? data.people : [];
  if (strict) {
    checkStoredIds(rawPeople);
  }
  for (const raw of rawPeople) {
    const person = cleanStoredPerson(raw, nowSeconds);
    if (person === null) {
      continue;
    }
    const key = personKey(person.provider, person.login);
    if (!seen.has(key)) {
      seen.add(key);
      people.push(person);
    }
  }
  // nextId is the id after the last one handed out; it is at most MAX_VISIT_ID + 1 once the bound is reached.
  let storedLast = 0;
  if (data.nextId !== undefined) {
    const valid = Number.isInteger(data.nextId) && data.nextId >= 1 && data.nextId <= MAX_VISIT_ID + 1;
    if (!valid && strict) {
      throw new CorruptHistory();
    }
    storedLast = valid ? data.nextId - 1 : 0;
  }
  const lastId = assignVisitIds(people, storedLast, strict);
  return {...empty, people, paused: data.paused === true, readOnly: newer, lastId};
}

// A random token naming one createHistory instance. `random` has Math.random's shape: it returns [0, 1).
function newInstanceToken(random) {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    parts.push(Math.floor(random() * 2 ** 32).toString(16).padStart(8, '0'));
  }
  return parts.join('');
}

function createHistory({storage, now, random = Math.random}) {
  const instance = newInstanceToken(random);
  let people = [];
  let paused = false;
  let readOnly = false;
  let needsBackup = false;
  // True after a read that threw: nothing is known about the file, so nothing may be written over it.
  let unavailable = false;
  let lastId = 0;
  // People the last load trimmed. The file still holds them until the next write.
  let trimmedKeys = new Set();
  // True while memory holds a change the file does not. The next mutating call retries the write.
  let unsaved = false;

  function adopt(loaded) {
    people = loaded.people;
    paused = loaded.paused;
    readOnly = loaded.readOnly;
    needsBackup = loaded.damaged;
    unavailable = loaded.unavailable;
    lastId = loaded.lastId;
    trimOversizedLoad();
  }

  // A file with more than MAX_PEOPLE people keeps the strongest. One sort, weakest first: lowest score, then
  // oldest last visit, then file order (the same order evictLowestScore would pick one at a time).
  function trimOversizedLoad() {
    trimmedKeys = new Set();
    if (people.length <= MAX_PEOPLE) {
      return;
    }
    const nowSeconds = now();
    const entries = people.map(person => ({
      person, score: scorePerson(person, nowSeconds), newest: newestVisitAt(person),
    }));
    entries.sort((a, b) => compareNumbers(a.score, b.score) || compareNumbers(a.newest, b.newest));
    const evicted = new Set(entries.slice(0, people.length - MAX_PEOPLE).map(entry => entry.person));
    for (const person of evicted) {
      trimmedKeys.add(personKey(person.provider, person.login));
    }
    people = people.filter(person => !evicted.has(person));
  }

  // Retries the read while the store is unavailable. Returns false while it still is.
  function available() {
    if (unavailable) {
      adopt(loadFile(storage, now()));
    }
    return !unavailable;
  }

  adopt(loadFile(storage, now()));

  function findPerson(provider, login) {
    return people.find(person => person.provider === provider && person.login === login) || null;
  }

  // Writes any unsaved change. Returns true when the file is current, false when it is not or cannot be.
  function flush() {
    if (readOnly) {
      return false;
    }
    if (!unsaved) {
      return true;
    }
    try {
      if (needsBackup) {
        storage.backup(HISTORY_FILE, BACKUP_FILE);
        needsBackup = false;
      }
      const nextId = lastId + 1;
      storage.write(HISTORY_FILE, JSON.stringify({version: FORMAT_VERSION, paused, nextId, people}));
      unsaved = false;
      trimmedKeys = new Set();
      return true;
    } catch (error) {
      // Storage trouble must not break playback. The change stays in memory and is retried on the next call;
      // after a failed backup the unreadable original is never overwritten.
      return false;
    }
  }

  function evictLowestScore(protectedPerson) {
    const nowSeconds = now();
    while (people.length > MAX_PEOPLE) {
      const candidates = people
        .filter(person => person !== protectedPerson)
        .map(person => ({person, score: scorePerson(person, nowSeconds)}));
      let weakest = candidates[0];
      for (const entry of candidates) {
        const lower = entry.score < weakest.score;
        const tiedButOlder = entry.score === weakest.score &&
          newestVisitAt(entry.person) < newestVisitAt(weakest.person);
        if (lower || tiedButOlder) {
          weakest = entry;
        }
      }
      people = people.filter(person => person !== weakest.person);
    }
  }

  // Adds the visit in memory. Returns its handle, or null when nothing was added.
  function addVisit(input) {
    if (paused || readOnly || !input) {
      return null;
    }
    const identity = cleanIdentity(input);
    if (identity === null || !isFiniteNumber(input.at)) {
      return null;
    }
    // Every id is above all the ids in use, so a new one is unique for its person. At the bound: no record.
    if (lastId >= MAX_VISIT_ID) {
      return null;
    }

    let person = findPerson(identity.provider, identity.login);
    if (person === null) {
      person = {...identity, visits: []};
      people.push(person);
    } else {
      person.displayName = identity.displayName;
    }
    lastId += 1;
    const id = lastId;
    const visit = input.offline === true
      ? {id, at: input.at, seconds: 0, offline: true}
      : {id, at: input.at, seconds: null};
    person.visits.push(visit);
    person.visits.sort((a, b) => a.at - b.at);
    person.visits = person.visits.slice(-MAX_VISITS_PER_PERSON);

    evictLowestScore(person);
    unsaved = true;
    return Object.freeze({provider: identity.provider, login: identity.login, id: visit.id, instance});
  }

  // record({provider, login, displayName, at, offline?}): one visit. Returns the visit's handle, or null when
  // ignored (paused, read-only, unavailable, unsafe identity, bad time, or the id bound reached). Offline opens
  // are stored closed with zero seconds and keep their interest after a reload.
  function record(input) {
    if (!available()) {
      return null;
    }
    const handle = addVisit(input);
    flush();
    return handle;
  }

  // Closes the visit a handle names. Returns 'closed', 'already' (the visit exists but is closed) or
  // 'ignored' (paused, read-only, bad input, or no such visit).
  function closeVisit(handle, at) {
    if (paused || readOnly || !handle || !isFiniteNumber(at) || !Number.isSafeInteger(handle.id)) {
      return 'ignored';
    }
    // A handle names a visit of this instance only: another instance's ids may mean other visits.
    if (handle.instance !== instance) {
      return 'ignored';
    }
    const identity = cleanIdentity(handle);
    if (identity === null) {
      return 'ignored';
    }
    const person = findPerson(identity.provider, identity.login);
    const visit = person === null ? undefined : person.visits.find(candidate => candidate.id === handle.id);
    if (visit === undefined) {
      return 'ignored';
    }
    if (visit.seconds !== null) {
      return 'already';
    }
    visit.seconds = Math.min(MAX_VISIT_SECONDS, Math.max(0, at - visit.at));
    unsaved = true;
    return 'closed';
  }

  // finish(handle, at): closes the visit record() returned the handle for. A visit that is already closed, or
  // not found, is left alone.
  function finish(handle, at) {
    if (!available()) {
      return false;
    }
    const outcome = closeVisit(handle, at);
    const saved = flush();
    return outcome !== 'ignored' && saved;
  }

  // query(text, {provider}?): people whose login or display name starts with the text, then those with a
  // later word in the display name that starts with it. Each result is a copy of the person plus `score`.
  function query(text, options = {}) {
    available();
    const needle = typeof text === 'string' ? text.trim().toLowerCase() : '';
    const nowSeconds = now();
    const groups = [[], []];
    for (const person of people) {
      if (options.provider && person.provider !== options.provider) {
        continue;
      }
      const rank = needle === '' ? 0 : matchRank(person, needle);
      if (rank !== null) {
        groups[rank].push({person, score: scorePerson(person, nowSeconds)});
      }
    }
    const ordered = [];
    for (const group of groups) {
      group.sort(compareByInterest);
      ordered.push(...group);
    }
    return ordered.map(({person, score}) => ({...copyPerson(person), score}));
  }

  // Writes only when the stored value changes.
  function setPaused(value) {
    if (!available()) {
      return false;
    }
    const next = value === true;
    if (!readOnly && next !== paused) {
      paused = next;
      unsaved = true;
    }
    return flush();
  }

  // Forget and clear still work while paused: they only remove data.
  function forget(input) {
    if (!available()) {
      return false;
    }
    const known = input && PROVIDERS.includes(input.provider) && typeof input.login === 'string';
    if (!readOnly && known) {
      const login = normalizeLogin(input.provider, input.login);
      const remaining = people.filter(person => !(person.provider === input.provider && person.login === login));
      const key = personKey(input.provider, login);
      // A person the load trimmed is gone from memory but still in the file: forgetting rewrites the file.
      if (remaining.length !== people.length || trimmedKeys.has(key)) {
        people = remaining;
        trimmedKeys.delete(key);
        unsaved = true;
      }
    }
    return flush();
  }

  function clear() {
    if (!available()) {
      return false;
    }
    if (!readOnly) {
      people = [];
      unsaved = true;
    }
    return flush();
  }

  return {
    record,
    finish,
    query,
    setPaused,
    forget,
    clear,
    get paused() {
      return paused;
    },
  };
}

module.exports = {createHistory, HISTORY_FILE, BACKUP_FILE};
