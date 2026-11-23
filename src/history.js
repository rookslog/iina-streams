'use strict';

// Watch history (#73): who the viewer watches, how often and how recently, for typing suggestions (#74).
// Pure: storage and the clock are injected, nothing here does I/O of its own or logs a name.
// Test design: docs/design/finding-2026-11-22/history/TESTS.md (items 1-9).
//
// Privacy: a person is {provider, login, displayName, visits}; a visit is {at, seconds} plus offline:true
// for an offline open. No URL, title, token, signature or query string is ever kept. The login is an
// allowlist (a Twitch login or a YouTube channel id, nothing else), the display name is bounded and may not
// hold URL characters, and every other input field is ignored.
//
// Choices beyond the test design (accepted by the lead, 2026-11-22):
// - the person just recorded is never the one evicted at the bound (otherwise a full history could never
//   admit anyone new);
// - a storage error never throws. The change stays in memory and the store stays "unsaved": the next call
//   to any method retries the write, and the call that made the change returns false. Nothing is
//   overwritten after a failed backup;
// - a file that cannot be used (bad JSON, no version, no people array) is treated as corrupt;
// - a file with a newer version is read-only, checked before its shape: it loads for query, and every
//   change is a no-op that writes and backs up nothing;
// - loaded visits are sorted by time, loaded durations are capped at 12 hours, and a loaded visit in the
//   future counts as now;
// - a visit is finished by its handle, not by person: record() returns {provider, login, at} for the visit
//   it opened (null when ignored), and finish(handle, at) closes exactly that visit. Finishing a visit that is
//   already closed, or that does not exist, changes nothing, so an identical retry is harmless and two windows
//   of one person closing in the same second each close their own visit. The handle holds no secret and
//   survives a reload; the caller keeps it from player start to close. (Two visits of one person opened in the
//   same second share a handle: each finish still closes one open visit of that second.)
//
// finish, forget, clear and setPaused return true when the change is in the file (for forget, clear and
// setPaused also when it already was), and false when it was ignored or the write failed. record returns its
// handle even when the write failed: the visit is kept in memory and the next call retries the write.
//
// Storage contract: read(path) returns text or null when the file is missing (it may throw);
// write(path, text); backup(from, to) copies the original bytes. `at` and now() are Unix seconds.

const HISTORY_FILE = '@data/history.json';
const BACKUP_FILE = HISTORY_FILE + '.bad';
const FORMAT_VERSION = 1;

const MAX_PEOPLE = 500;
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
  const visit = {at: Math.min(raw.at, nowSeconds), seconds};
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
  return {...identity, visits: visits.slice(-MAX_VISITS_PER_PERSON)};
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
  const empty = {people: [], paused: false, readOnly: false, damaged: false};
  let text;
  try {
    text = storage.read(HISTORY_FILE);
  } catch (error) {
    return {...empty, damaged: true};
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

  const people = [];
  const seen = new Set();
  const rawPeople = Array.isArray(data.people) ? data.people : [];
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
  return {people, paused: data.paused === true, readOnly: newer, damaged: false};
}

function createHistory({storage, now}) {
  const loaded = loadFile(storage, now());
  let people = loaded.people;
  let paused = loaded.paused;
  const readOnly = loaded.readOnly;
  let needsBackup = loaded.damaged;
  // True while memory holds a change the file does not. Any later call retries the write.
  let unsaved = false;

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
      storage.write(HISTORY_FILE, JSON.stringify({version: FORMAT_VERSION, paused, people}));
      unsaved = false;
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

    const visit = input.offline === true
      ? {at: input.at, seconds: 0, offline: true}
      : {at: input.at, seconds: null};

    let person = findPerson(identity.provider, identity.login);
    if (person === null) {
      person = {...identity, visits: []};
      people.push(person);
    } else {
      person.displayName = identity.displayName;
    }
    person.visits.push(visit);
    person.visits.sort((a, b) => a.at - b.at);
    person.visits = person.visits.slice(-MAX_VISITS_PER_PERSON);

    evictLowestScore(person);
    unsaved = true;
    return Object.freeze({provider: identity.provider, login: identity.login, at: input.at});
  }

  // record({provider, login, displayName, at, offline?}): one visit. Returns the visit's handle, or null when
  // ignored (paused, read-only, unsafe identity, bad time). Offline opens are stored closed with zero seconds
  // and keep their interest after a reload.
  function record(input) {
    const handle = addVisit(input);
    flush();
    return handle;
  }

  // Closes the visit a handle names. Returns 'closed', 'already' (the visit exists but is closed) or
  // 'ignored' (paused, read-only, bad input, or no such visit).
  function closeVisit(handle, at) {
    if (paused || readOnly || !handle || !isFiniteNumber(at) || !isFiniteNumber(handle.at)) {
      return 'ignored';
    }
    const identity = cleanIdentity(handle);
    if (identity === null) {
      return 'ignored';
    }
    const person = findPerson(identity.provider, identity.login);
    if (person === null) {
      return 'ignored';
    }
    const sameTime = person.visits.filter(visit => visit.at === handle.at);
    if (sameTime.length === 0) {
      return 'ignored';
    }
    const visit = sameTime.find(candidate => candidate.seconds === null);
    if (visit === undefined) {
      return 'already';
    }
    visit.seconds = Math.min(MAX_VISIT_SECONDS, Math.max(0, at - visit.at));
    unsaved = true;
    return 'closed';
  }

  // finish(handle, at): closes the visit record() returned the handle for. A visit that is already closed, or
  // not found, is left alone.
  function finish(handle, at) {
    const outcome = closeVisit(handle, at);
    const saved = flush();
    return outcome !== 'ignored' && saved;
  }

  // query(text, {provider}?): people whose login or display name starts with the text, then those with a
  // later word in the display name that starts with it. Each result is a copy of the person plus `score`.
  function query(text, options = {}) {
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
    const next = value === true;
    if (!readOnly && next !== paused) {
      paused = next;
      unsaved = true;
    }
    return flush();
  }

  // Forget and clear still work while paused: they only remove data.
  function forget(input) {
    const known = input && PROVIDERS.includes(input.provider) && typeof input.login === 'string';
    if (!readOnly && known) {
      const login = normalizeLogin(input.provider, input.login);
      const remaining = people.filter(person => !(person.provider === input.provider && person.login === login));
      if (remaining.length !== people.length) {
        people = remaining;
        unsaved = true;
      }
    }
    return flush();
  }

  function clear() {
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
