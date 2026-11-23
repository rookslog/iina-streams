'use strict';

// Watch history (#73): who the viewer watches, how often and how recently, for typing suggestions (#74).
// Pure: storage and the clock are injected, nothing here does I/O of its own or logs a name.
// Test design: docs/design/finding-2026-11-22/history/TESTS.md (items 1-9).
//
// Privacy: a person is {provider, login, displayName, visits}; a visit is {at, seconds} plus offline:true
// for an offline open. No URL, title, token, signature or query string is ever kept: identity fields that
// look like part of a URL are rejected, and every other input field is ignored.
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
// Characters that appear in URLs and query strings, plus any whitespace.
const UNSAFE_IDENTITY_PATTERN = /[?/=\s]/;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isSafeIdentityText(value) {
  return typeof value === 'string' && value !== '' && !UNSAFE_IDENTITY_PATTERN.test(value);
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
  if (!isSafeIdentityText(input.login)) {
    return null;
  }
  const displayName = input.displayName === undefined || input.displayName === null
    ? input.login
    : input.displayName;
  if (!isSafeIdentityText(displayName)) {
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

// Returns a clean visit from stored data, or null. Unknown fields are dropped.
function cleanStoredVisit(raw) {
  if (!raw || !isFiniteNumber(raw.at)) {
    return null;
  }
  const open = raw.seconds === null;
  if (!open && !(isFiniteNumber(raw.seconds) && raw.seconds >= 0)) {
    return null;
  }
  const visit = {at: raw.at, seconds: raw.seconds};
  if (raw.offline === true) {
    visit.offline = true;
  }
  return visit;
}

function cleanStoredPerson(raw) {
  const identity = cleanIdentity(raw);
  if (!identity || !Array.isArray(raw.visits)) {
    return null;
  }
  const visits = raw.visits.map(cleanStoredVisit).filter(visit => visit !== null);
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
// display name (after any character that is not a letter or digit), null = no match.
function matchRank(person, needle) {
  const login = person.login.toLowerCase();
  const name = person.displayName.toLowerCase();
  if (login.startsWith(needle) || name.startsWith(needle)) {
    return 0;
  }
  for (let i = 1; i < name.length; i++) {
    const startsWord = !LETTER_OR_DIGIT.test(name[i - 1]);
    if (startsWord && name.startsWith(needle, i)) {
      return 1;
    }
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
function loadFile(storage) {
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
  const looksValid = data && typeof data === 'object' && Number.isInteger(data.version) &&
    data.version >= 1 && Array.isArray(data.people);
  if (!looksValid) {
    return {...empty, damaged: true};
  }

  const people = [];
  const seen = new Set();
  for (const raw of data.people) {
    const person = cleanStoredPerson(raw);
    if (person === null) {
      continue;
    }
    const key = personKey(person.provider, person.login);
    if (!seen.has(key)) {
      seen.add(key);
      people.push(person);
    }
  }
  return {
    people,
    paused: data.paused === true,
    // A newer version than this code knows: show what we can, never overwrite it.
    readOnly: data.version > FORMAT_VERSION,
    damaged: false,
  };
}

function createHistory({storage, now}) {
  const loaded = loadFile(storage);
  let people = loaded.people;
  let paused = loaded.paused;
  const readOnly = loaded.readOnly;
  let needsBackup = loaded.damaged;

  function findPerson(provider, login) {
    return people.find(person => person.provider === provider && person.login === login) || null;
  }

  function save() {
    if (readOnly) {
      return;
    }
    try {
      if (needsBackup) {
        storage.backup(HISTORY_FILE, BACKUP_FILE);
        needsBackup = false;
      }
      storage.write(HISTORY_FILE, JSON.stringify({version: FORMAT_VERSION, paused, people}));
    } catch (error) {
      // Storage trouble must not break playback; the in-memory list stays usable.
      // If the backup failed, the unreadable original is left alone (never overwritten unbacked).
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

  // record({provider, login, displayName, at, offline?}): one visit. Offline opens are stored closed with
  // zero seconds and keep their interest after a reload.
  function record(input) {
    if (paused || readOnly || !input) {
      return;
    }
    const identity = cleanIdentity(input);
    if (identity === null || !isFiniteNumber(input.at)) {
      return;
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
    save();
  }

  // finish({provider, login, at}): closes the newest open visit. No open visit means nothing changes.
  function finish(input) {
    if (paused || readOnly || !input || !isFiniteNumber(input.at)) {
      return;
    }
    const identity = cleanIdentity(input);
    if (identity === null) {
      return;
    }
    const person = findPerson(identity.provider, identity.login);
    if (person === null) {
      return;
    }
    const open = person.visits.filter(visit => visit.seconds === null);
    if (open.length === 0) {
      return;
    }
    const visit = open[open.length - 1];
    visit.seconds = Math.min(MAX_VISIT_SECONDS, Math.max(0, input.at - visit.at));
    save();
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

  function setPaused(value) {
    const next = value === true;
    if (readOnly || next === paused) {
      return;
    }
    paused = next;
    save();
  }

  // Forget and clear still work while paused: they only remove data.
  function forget(input) {
    if (readOnly || !input || !PROVIDERS.includes(input.provider) || typeof input.login !== 'string') {
      return;
    }
    const login = normalizeLogin(input.provider, input.login);
    const before = people.length;
    people = people.filter(person => !(person.provider === input.provider && person.login === login));
    if (people.length !== before) {
      save();
    }
  }

  function clear() {
    if (readOnly) {
      return;
    }
    people = [];
    save();
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
