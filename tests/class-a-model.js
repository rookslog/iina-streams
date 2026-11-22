'use strict';

// v0.5.5 class A falsifier support (docs/design/V055-CLASS-REPAIR-2026-11-22.md, "Class A: Auto chat timing").
// A seeded generator of playback traces, a driver that feeds them to a chat timing policy the way src/player.js
// does, and an oracle that checks A1-A7 against the trace's ground truth (not against the policy's own state).
//
// All times are integer milliseconds on a 50 ms grid, so samples at different cadences meet at exact instants.
//
// What the driver mirrors from src/player.js (read at 04fe12f):
// - sampleCutoff: {nowMs, timePos: mpv time-pos, paused, offset: the estimator offset or null, behindLive,
//   estimateId: estimator.updates()}; offset is null exactly when behindLive is.
// - A reload: on_load calls stopLiveClock (forgetMapping + resyncCutoff); the clock is stopped while the file
//   loads, so behindLive is null; file-loaded calls startLiveClock, whose stopLiveClock resyncs again.
// - A mode change calls resyncCutoff. A seek calls nothing on the timing.
// - Besides its cadence, the player samples on a pause change and on a seek; so does the driver.
// - The estimator updates on a 2 s playlist poll; its update count never resets.
//
// What it does not model: playback speed other than 1x, a fine tune, jitter while playing, mpv returning a stale
// time-pos after file-loaded, or estimator states shorter than one 2 s poll.

// The specification's constants, kept here rather than read from the policy so the oracle stays independent.
const SPEC = {
  rate: 1.5,
  // J, the jitter tolerance (src/chat-timing.js PLAYHEAD_JITTER_SECONDS).
  jitterMs: 200,
  // P, the progress a rebase needs after corroboration (src/chat-timing.js REBASE_PROGRESS_SECONDS).
  rebaseProgressMs: 1000,
  agreementMs: 1000,
};

// A stall's playhead wanders up to J either side of the stopped position (design: "stall with +/-J jitter").
// CLASS_A_STALL_JITTER_MS overrides it (0 isolates the checks from jitter).
const STALL_JITTER_MS = process.env.CLASS_A_STALL_JITTER_MS === undefined
  ? SPEC.jitterMs
  : Number(process.env.CLASS_A_STALL_JITTER_MS);
// How far counted progress may trail or lead the truth over a stretch: up to J of playback not yet counted, an
// anchor taken at a wandering playhead up to J off, and up to J of wander counted at the end.
const SLACK_PROGRESS_MS = 3 * SPEC.jitterMs;
const SLACK_CUTOFF_MS = SPEC.rate * SLACK_PROGRESS_MS;
const EPS_MS = 1;
const POLL_MS = 2000;
const GRID_MS = 50;
const WALL_START_MS = 1_800_000_000_000;
// Twitch's floor on the live path is 6-8 s behind live (src/player.js); the generator keeps at least 3 s.
const LIVE_FLOOR_MS = 3000;

// mulberry32: a small seeded generator, enough for test traces.
function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A deterministic value in [0, 1) for (seed, n), so jitter and noise do not depend on who asks or how often.
function hashUnit(seed, n) {
  return rng((seed * 2654435761 + n * 40503 + 12345) >>> 0)();
}

function pick(rand, weighted) {
  const total = weighted.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rand() * total;
  for (const [value, weight] of weighted) {
    roll -= weight;
    if (roll < 0) {
      return value;
    }
  }
  return weighted[weighted.length - 1][0];
}

function between(rand, min, max) {
  return min + Math.floor(rand() * (max - min + 1));
}

function gridMs(rand, minMs, maxMs) {
  return GRID_MS * between(rand, minMs / GRID_MS, maxMs / GRID_MS);
}

// Two mixes. 'rich' exercises every segment and estimator state; 'calm' has fewer estimator disruptions and no
// mode changes, so more of A5's shared instants are free of the ambiguity checkCadence must skip.
const PROFILES = {
  rich: {
    kinds: [['play', 34], ['pause', 10], ['stall', 16], ['seek', 9], ['jump', 11], ['reload', 7], ['manual', 3]],
    estimates: [['ok', 6], ['null', 1.5], ['outlier', 1], ['disagree', 1.5]],
  },
  calm: {
    kinds: [['play', 50], ['pause', 8], ['stall', 10], ['seek', 8], ['jump', 12], ['reload', 6], ['manual', 0]],
    estimates: [['ok', 18], ['null', 0.5], ['outlier', 0.5], ['disagree', 0.5]],
  },
};

function timedSegment(rand, kind, profile) {
  return {kind, ms: gridMs(rand, 2000, 12_000), est: pick(rand, profile.estimates)};
}

/**
 * A trace: a start state and a list of segments. Timed segments (play, pause, stall, manual) last at least
 * 2 s; seek and jump are instantaneous; reload has a loading phase and a stretch without an estimate.
 */
function generateTrace(seed, profileName = 'rich') {
  const profile = PROFILES[profileName];
  const rand = rng(profileName === 'rich' ? seed : seed + 1_000_003);
  const segments = [];
  const lengthMs = gridMs(rand, 60_000, 120_000);
  let total = 0;
  while (total < lengthMs) {
    const kind = pick(rand, profile.kinds);
    let segment;
    if (kind === 'seek') {
      const sign = rand() < 0.5 ? -1 : 1;
      segment = {kind, byMs: sign * gridMs(rand, 2000, 90_000)};
    } else if (kind === 'jump') {
      const sign = rand() < 0.6 ? 1 : -1;
      segment = {kind, byMs: sign * gridMs(rand, 3000, 40_000)};
    } else if (kind === 'reload') {
      segment = {
        kind,
        loadMs: gridMs(rand, 300, 2000),
        newPosMs: gridMs(rand, 0, 300_000),
        shiftMs: gridMs(rand, 0, 40_000) - 10_000,
        nullMs: gridMs(rand, 2000, 20_000),
      };
    } else {
      segment = timedSegment(rand, kind, profile);
    }
    segments.push(segment);
    total += segment.ms || segment.loadMs || 0;
  }
  return {
    seed,
    profile: profileName,
    startPosMs: gridMs(rand, 0, 600_000),
    behindMs: gridMs(rand, LIVE_FLOOR_MS, 40_000),
    phaseMs: gridMs(rand, 0, POLL_MS - GRID_MS),
    segments,
  };
}

/**
 * The ground truth of a trace: timed pieces with the true playhead, the observed one, pause state and the true
 * progress so far, the timeline events, and the estimator's updates.
 *
 * Progress (design, Class A): forward playhead movement while unpaused, a forward seek's jump included. A jump
 * made while paused counts when playing resumes, and only the part beyond the lowest position seen while
 * paused. A stall moves the true playhead not at all. A reload's jump to a new raw timeline is not progress.
 */
function buildWorld(trace) {
  const pieces = [];
  const events = [];
  let t = 0;
  let pos = trace.startPosMs;
  let offset = -trace.startPosMs - trace.behindMs;
  let progress = 0;
  let paused = false;
  let ref = pos;
  let nullUntil = 0;
  let epoch = 0;
  // The player also samples on a pause change and on a seek (onPauseChanged, onSeek).
  const marks = [];
  // Instants of a seek (or chain of seeks) that landed behind where it started.
  const backSeeks = [];

  // A seek, an offset jump or a reload never puts the video less than LIVE_FLOOR_MS behind live.
  function latestPos(atOffset) {
    return t - atOffset - LIVE_FLOOR_MS;
  }

  function addPiece(kind, ms, extra) {
    const pausedNow = kind === 'pause';
    // The player samples on a seek and again on a pause change, so a pause right after a seek made while
    // playing comes one grid step later, after the seek's own sample.
    const last = pieces[pieces.length - 1];
    if (pausedNow && !paused && last && marks[marks.length - 1] === t) {
      addPiece(last.kind === 'loading' ? 'stall' : last.kind, GRID_MS, {est: last.est, nullUntil: last.nullUntil});
    }
    if (pausedNow !== paused && t > 0) {
      marks.push(t);
    }
    if (paused && !pausedNow) {
      progress += Math.max(0, pos - ref);
      ref = pos;
    }
    if (pausedNow) {
      ref = paused ? Math.min(ref, pos) : pos;
    }
    paused = pausedNow;
    pieces.push(Object.assign({kind, start: t, end: t + ms, pos, progress, offset, epoch, paused}, extra));
    t += ms;
    if (kind === 'play' || kind === 'manual') {
      pos += ms;
      progress += ms;
      ref = pos;
    }
  }

  // Seeks with no time between them reach the player as one (it samples after each), so they count as one:
  // the chain's net jump from where it started.
  let beforeSeek = null;
  for (const segment of trace.segments) {
    if (segment.kind === 'seek') {
      if (beforeSeek === null) {
        beforeSeek = {pos, ref, progress, landing: pos};
      }
      ({pos, ref, progress} = beforeSeek);
      beforeSeek.landing = Math.max(0, Math.min(beforeSeek.landing + segment.byMs, latestPos(offset)));
      const next = beforeSeek.landing;
      if (paused) {
        ref = Math.min(ref, next);
      } else {
        progress += Math.max(0, next - pos);
        ref = next;
      }
      if (next < pos) {
        backSeeks.push(t);
      } else if (backSeeks[backSeeks.length - 1] === t) {
        backSeeks.pop();
      }
      pos = next;
      marks.push(t);
      continue;
    }
    if (segment.kind !== 'jump') {
      beforeSeek = null;
    }
    if (segment.kind === 'jump') {
      offset = Math.min(offset + segment.byMs, t - pos - LIVE_FLOOR_MS);
    } else if (segment.kind === 'reload') {
      events.push({t, type: 'timeline'});
      addPiece('loading', segment.loadMs, {est: 'null'});
      events.push({t, type: 'timeline'});
      const videoMs = Math.min(pos + offset + segment.shiftMs, t - LIVE_FLOOR_MS);
      pos = segment.newPosMs;
      offset = videoMs - pos;
      ref = pos;
      epoch += 1;
      nullUntil = t + segment.nullMs;
    } else if (segment.kind === 'manual') {
      events.push({t, type: 'mode', mode: 'manual'});
      addPiece('manual', segment.ms, {est: segment.est, nullUntil});
      events.push({t, type: 'mode', mode: 'auto'});
    } else {
      addPiece(segment.kind, segment.ms, {est: segment.est, nullUntil});
    }
  }
  const durationMs = t;

  function pieceAt(ms) {
    let low = 0;
    let high = pieces.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (pieces[mid].start <= ms) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return pieces[low];
  }

  function stateAt(ms) {
    const piece = pieceAt(ms);
    const moving = piece.kind === 'play' || piece.kind === 'manual';
    const truePos = moving ? piece.pos + (ms - piece.start) : piece.pos;
    let observed = truePos;
    if (piece.kind === 'stall') {
      observed = truePos + Math.round((hashUnit(trace.seed, ms) * 2 - 1) * STALL_JITTER_MS);
    }
    return {
      piece,
      kind: piece.kind,
      paused: piece.paused,
      truePos,
      observed,
      progress: moving ? piece.progress + (ms - piece.start) : piece.progress,
    };
  }

  // Update n lands at phase + 2000 n. Its id is n + 1; ids keep counting through updates without an estimate.
  function estimateAt(ms) {
    const n = Math.floor((ms - trace.phaseMs) / POLL_MS);
    if (n < 0) {
      return {id: 0, offsetMs: null};
    }
    // The player resets the estimator when a new file loads, so no update from before it is readable after.
    const sameFile = pieceAt(trace.phaseMs + n * POLL_MS).epoch === pieceAt(ms).epoch;
    return {id: n + 1, offsetMs: sameFile ? updateOffset(n) : null};
  }

  function updateOffset(n) {
    const at = trace.phaseMs + n * POLL_MS;
    const piece = pieceAt(at);
    if (piece.kind === 'loading' || at < piece.nullUntil || piece.est === 'null') {
      return null;
    }
    const noise = Math.round((hashUnit(trace.seed + 7, n) * 2 - 1) * 300);
    if (piece.est === 'disagree') {
      return piece.offset + (n % 2 === 0 ? 800 : -800);
    }
    const firstUpdate = Math.ceil((piece.start - trace.phaseMs) / POLL_MS);
    if (piece.est === 'outlier' && n === firstUpdate) {
      return piece.offset + (hashUnit(trace.seed + 11, n) < 0.5 ? 20_000 : -20_000);
    }
    return piece.offset + noise;
  }

  const sampledMarks = [...new Set(marks)].filter(ms => ms < durationMs);
  return {trace, pieces, events, marks: sampledMarks, backSeeks, durationMs, stateAt, estimateAt};
}

function fixedTimes(durationMs, cadenceMs) {
  const times = [];
  for (let ms = 0; ms < durationMs; ms += cadenceMs) {
    times.push(ms);
  }
  return times;
}

function randomTimes(durationMs, seed) {
  const rand = rng(seed);
  const times = [];
  for (let ms = 0; ms < durationMs; ms += gridMs(rand, GRID_MS, 2000)) {
    times.push(ms);
  }
  return times;
}

/**
 * Feed a world to a fresh policy at the given instants, applying timeline and mode events first, as the player
 * does. Returns one record per sample with the inputs, the cutoff, and the truth at that instant.
 */
function drive(createChatTiming, world, cadenceTimes) {
  // CLASS_A_NO_MARKS=1 drops the pause-change and seek samples, to see what the policy does without them.
  const marks = process.env.CLASS_A_NO_MARKS ? [] : world.marks;
  const times = [...new Set([...cadenceTimes, ...marks])].sort((a, b) => a - b);
  const timing = createChatTiming();
  const samples = [];
  let next = 0;
  let mode = 'auto';
  let previousMs = -Infinity;
  // The target the policy aims at, recomputed from the same inputs (autoClockMs and effective()).
  let lastConfidentOffsetMs = null;
  let lastConfidentDelayMs = null;
  for (const ms of times) {
    let timeline = false;
    let modeEntered = false;
    while (next < world.events.length && world.events[next].t <= ms) {
      const event = world.events[next];
      next += 1;
      if (event.type === 'timeline') {
        timing.forgetMapping();
        timing.resyncCutoff();
        lastConfidentOffsetMs = null;
        timeline = true;
      } else {
        timing.update({mode: event.mode});
        timing.resyncCutoff();
        modeEntered = modeEntered || event.mode === 'auto';
        mode = event.mode;
      }
    }
    const state = world.stateAt(ms);
    const estimate = world.estimateAt(ms);
    const nowMs = WALL_START_MS + ms;
    const observedMs = state.kind === 'loading' ? null : state.observed;
    const confident = estimate.offsetMs !== null && observedMs !== null;
    const reading = {
      nowMs,
      timePos: observedMs === null ? null : observedMs / 1000,
      paused: state.paused,
      offset: confident ? (WALL_START_MS + estimate.offsetMs) / 1000 : null,
      behindLive: confident ? (nowMs - (WALL_START_MS + observedMs + estimate.offsetMs)) / 1000 : null,
      estimateId: estimate.id,
    };
    const cutoff = timing.revealCutoffMs(reading);
    let target = null;
    // autoClockMs remembers an offset in every mode; effective() remembers a delay only in Auto.
    if (confident) {
      lastConfidentOffsetMs = estimate.offsetMs;
    }
    if (confident && mode === 'auto') {
      lastConfidentDelayMs = Math.max(0, reading.behindLive * 1000);
    }
    if (lastConfidentOffsetMs !== null && observedMs !== null) {
      target = Math.min(nowMs, WALL_START_MS + observedMs + lastConfidentOffsetMs);
    } else {
      target = nowMs - (lastConfidentDelayMs === null ? 0 : lastConfidentDelayMs);
    }
    const seekedBack = world.backSeeks.some(at => at > previousMs && at <= ms);
    previousMs = ms;
    samples.push({
      ms, nowMs, mode, timeline, modeEntered, seekedBack, cutoff, target, confident,
      estimateId: estimate.id, offsetMs: confident ? estimate.offsetMs : null,
      kind: state.kind, paused: state.paused, observedMs, progress: state.progress,
    });
  }
  return samples;
}

/**
 * Check A1-A4, A6 and A7 on one sampled run. A5 needs several runs: see checkCadence.
 * Returns violations {inv, ms, detail} and the instants of uncapped motion accepted as rebases.
 */
function checkRun(samples) {
  const violations = [];
  const rebases = [];
  const flagged = new Set();
  function fail(inv, sample, detail) {
    const key = inv + '@' + sample.ms;
    if (!flagged.has(key)) {
      flagged.add(key);
      violations.push({inv, ms: sample.ms, detail});
    }
  }

  let awaiting = true;
  let afterTimeline = false;
  let candidate = null;
  let corroboratedAt = null;
  // A1: the lowest (cutoff - 1.5 x progress) since the window opened.
  let capBase = null;
  // A6 floor: what the clamp alone must have reached.
  let floor = null;
  let noProgressRise = 0;
  let noProgressSteps = 0;
  let noProgressBackSeeks = 0;
  // Whether the cutoff met the target on a sample where a rebase was allowed since the last timeline change. A
  // rebase there may have been silent, so the policy may no longer be awaiting, and A6 asks nothing more of it.
  let metWhileEligible = false;
  // The last Auto sample, and the last sample in any mode (A7 compares a return to Auto with the latter).
  let previous = null;
  let last = null;

  // Backward seeks since the A1 window opened: each re-anchors on an observed playhead, which in a stall can sit
  // up to the wander below the true one, so each may add that much credit.
  let backSeeksInWindow = 0;

  function openWindow(sample) {
    capBase = sample.cutoff - SPEC.rate * sample.progress;
    floor = sample.cutoff;
    backSeeksInWindow = 0;
  }

  function resetCorroboration() {
    candidate = null;
    corroboratedAt = null;
  }

  // A4's corroboration, from the samples the policy saw: consecutive confident samples, two of them from
  // distinct estimator updates agreeing within 1 s. A reread of one update neither confirms nor breaks it.
  function noteCorroboration(sample) {
    if (!sample.confident) {
      resetCorroboration();
      return;
    }
    if (candidate !== null && sample.estimateId === candidate.id) {
      return;
    }
    const agrees = candidate !== null && Math.abs(sample.offsetMs - candidate.offsetMs) <= SPEC.agreementMs;
    if (agrees && corroboratedAt === null) {
      corroboratedAt = sample.progress;
    } else if (!agrees) {
      corroboratedAt = null;
    }
    candidate = {id: sample.estimateId, offsetMs: sample.offsetMs};
  }

  for (const sample of samples) {
    const before = last;
    last = sample;
    if (sample.mode !== 'auto') {
      previous = null;
      continue;
    }
    if (sample.cutoff > sample.target + EPS_MS) {
      fail('A3', sample, `cutoff ${fmt(sample.cutoff - sample.target)} ms above the target: a lower target is followed at once`);
    }
    if (previous === null || sample.timeline || sample.modeEntered) {
      if (before !== null && sample.cutoff > before.cutoff + EPS_MS) {
        fail('A7', sample, `moved ${fmt(sample.cutoff - before.cutoff)} ms forward on the first sample after a timeline change`);
      }
      if (before === null) {
        // The first sample of a timing takes its target; a confident one is the mapping.
        awaiting = !sample.confident;
        afterTimeline = false;
      } else {
        awaiting = true;
        afterTimeline = true;
      }
      resetCorroboration();
      metWhileEligible = false;
      if (awaiting) {
        noteCorroboration(sample);
      }
      openWindow(sample);
      noProgressRise = 0;
      noProgressSteps = 0;
      noProgressBackSeeks = 0;
      previous = sample;
      continue;
    }

    // A sample taken after a backward seek cannot see the playback between the previous sample and the seek,
    // so that progress does not count toward A6's deadline or A4's eligibility.
    const progressed = sample.progress - previous.progress;
    const seekedBack = sample.seekedBack;
    if (seekedBack && corroboratedAt !== null) {
      corroboratedAt += progressed;
    }
    if (awaiting) {
      noteCorroboration(sample);
    }
    const sinceCorroboration = corroboratedAt === null ? null : sample.progress - corroboratedAt;
    const eligible = awaiting && sinceCorroboration !== null &&
      sinceCorroboration >= SPEC.rebaseProgressMs - SLACK_PROGRESS_MS;
    if (seekedBack) {
      backSeeksInWindow += 1;
    }
    const capMs = capBase + SPEC.rate * sample.progress + SLACK_CUTOFF_MS +
      SPEC.rate * STALL_JITTER_MS * backSeeksInWindow;
    const uncapped = sample.cutoff > capMs + EPS_MS;
    // Where a rebase is allowed and the cutoff moved forward onto its target, it may be one: a rebase that lands
    // within the cap looks like the clamp. Only one past the cap is surely a rebase.
    const mayRebase = eligible && Math.abs(sample.cutoff - sample.target) <= EPS_MS;
    if (mayRebase) {
      metWhileEligible = true;
    }
    const silentRebase = mayRebase && !uncapped && sample.cutoff > previous.cutoff + EPS_MS;
    let rebased = false;
    if (uncapped) {
      if (mayRebase) {
        rebased = true;
        rebases.push(sample.ms);
      } else {
        const why = !awaiting ? 'not awaiting a mapping' :
          sinceCorroboration === null ? 'no corroboration' : `${fmt(sinceCorroboration)} ms progress since corroboration`;
        fail('A1', sample, `${fmt(sample.cutoff - capMs)} ms past the 1.5x cap (${why})`);
        if (awaiting) {
          fail('A4', sample, `uncapped motion while ineligible: ${why}`);
        }
        if (awaiting && afterTimeline) {
          fail('A7', sample, `uncapped motion after a timeline change before A4 was met: ${why}`);
        }
      }
    }

    // A2: no progress, no forward motion. While paused not at all; in a stall, only the playback still due from
    // before it plus the wander (in all, the slack), in at most two steps: wander within J counts as none.
    const noProgress = progressed === 0 && (sample.paused || sample.kind === 'stall' || sample.kind === 'loading');
    if (noProgress && !rebased && !silentRebase) {
      const rise = Math.max(0, sample.cutoff - previous.cutoff);
      noProgressRise += rise;
      noProgressSteps += rise > EPS_MS ? 1 : 0;
      noProgressBackSeeks += seekedBack ? 1 : 0;
      // The sample at a pause change reports the time before it, which was not paused.
      if (sample.paused && previous.paused && rise > EPS_MS) {
        fail('A2', sample, `moved ${fmt(rise)} ms forward while paused`);
      }
      // A backward seek re-anchors on a wandering playhead, which may give up to J more.
      const allowanceMs = SLACK_CUTOFF_MS + SPEC.rate * STALL_JITTER_MS * noProgressBackSeeks;
      if (noProgressRise > allowanceMs + EPS_MS) {
        fail('A2', sample, `moved ${fmt(noProgressRise)} ms forward in a ${sample.kind} with no progress`);
      }
      // Each counted step is more than J of movement, and a stall has at most 3J to give (SLACK_PROGRESS_MS).
      if (noProgressSteps > 2 + noProgressBackSeeks) {
        fail('A2', sample, `moved forward on ${noProgressSteps} samples in a ${sample.kind} with no progress`);
      }
    } else if (!noProgress) {
      noProgressRise = 0;
      noProgressSteps = 0;
      noProgressBackSeeks = 0;
    }

    // A6, first bullet: with corroboration, the rebase has fired once progress reached P (plus the slack).
    const due = awaiting && sinceCorroboration !== null &&
      sinceCorroboration >= SPEC.rebaseProgressMs + SLACK_PROGRESS_MS;
    if (rebased || due) {
      if (due && !rebased && !metWhileEligible && sample.cutoff < sample.target - EPS_MS) {
        fail('A6', sample, `no rebase after ${fmt(sinceCorroboration)} ms progress since corroboration ` +
          `(${fmt(sample.target - sample.cutoff)} ms behind the target)`);
      }
      awaiting = false;
      resetCorroboration();
      openWindow(sample);
      noProgressRise = 0;
      noProgressSteps = 0;
      noProgressBackSeeks = 0;
      previous = sample;
      continue;
    }

    // A6, second bullet and the seek floor: the clamp advances at its full rate toward the target.
    // Across a backward seek the policy cannot see the playback before it, nor credit still due from before it.
    const base = seekedBack ? previous.cutoff : Math.max(floor, previous.cutoff);
    floor = Math.min(sample.target, base + SPEC.rate * (seekedBack ? 0 : progressed));
    if (sample.cutoff < floor - SLACK_CUTOFF_MS - EPS_MS) {
      fail('A6', sample, `${fmt(floor - sample.cutoff)} ms below what the 1.5x clamp must have reached`);
    }
    capBase = Math.min(capBase, sample.cutoff - SPEC.rate * sample.progress);
    if (silentRebase) {
      openWindow(sample);
    }
    previous = sample;
  }
  return {violations, rebases};
}

/**
 * A5: runs of one world at different cadences agree at shared instants within the coarser period's capped
 * motion plus the jitter allowance, outside the window around any rebase (a rebase is a jump of the whole gap,
 * and each cadence sees corroboration up to one period apart).
 *
 * Each timeline or mode change re-anchors the playhead on the next sample, so the progress since the sample
 * before it is lost, up to one period per change. The tolerance grows by one period's capped motion for each
 * change since the last rebase.
 */
function checkCadence(runs, world, stats) {
  const events = world.events;
  const violations = [];
  const coarseMs = Math.max(...runs.map(run => run.cadenceMs));
  const periodMs = SPEC.rate * coarseMs;
  const windowMs = 2 * coarseMs;
  const excluded = runs.flatMap(run => run.rebases);
  const {windows: ambiguous, decisive} = ambiguousWindows(world, coarseMs);
  let ambiguousEffect = false;
  let triggeredMs = null;
  let previousMs = -Infinity;
  let changes = 0;
  const byInstant = runs.map(run => new Map(run.samples.map(sample => [sample.ms, sample])));
  const cursors = runs.map(() => 0);
  // The lowest Auto target run i sampled in (fromMs, toMs]; samples are read in order, once.
  function lowestTarget(i, fromMs, toMs) {
    const samples = runs[i].samples;
    let lowest = Infinity;
    while (cursors[i] < samples.length && samples[cursors[i]].ms <= toMs) {
      const other = samples[cursors[i]];
      cursors[i] += 1;
      if (other.ms > fromMs && other.mode === 'auto') {
        lowest = Math.min(lowest, other.target);
      }
    }
    return lowest;
  }
  for (const sample of runs[0].samples) {
    if (sample.ms % coarseMs !== 0) {
      continue;
    }
    const shared = byInstant.map(map => map.get(sample.ms));
    if (shared.some(other => !other || other.mode !== 'auto')) {
      continue;
    }
    // Each change since every run last met its target may have cost each run up to a period of progress.
    changes += events.filter(event => event.t > previousMs && event.t <= sample.ms).length;
    const baseToleranceMs = periodMs + SLACK_CUTOFF_MS;
    const toleranceMs = periodMs * (1 + changes) + SLACK_CUTOFF_MS;
    // A resync keeps the cutoff (A7), so an ambiguous stretch's effect outlasts its window: it ends once every
    // run meets its target again.
    const sinceMs = previousMs;
    previousMs = sample.ms;
    // effective() keeps the last confident delay it sampled, so an estimate shorter than a period can leave the
    // runs with different fallback targets: the cutoffs cannot agree there either.
    // Likewise a lower target that lasts less than a period (an outlier, or one moved by a seek) is followed at
    // once by the runs that sample it (A3) and missed by the others: compare each run's lowest target since the
    // previous shared instant.
    const targets = shared.map(other => other.target);
    const lowest = runs.map((run, i) => lowestTarget(i, sinceMs, sample.ms));
    const targetsDiffer = Math.max(...targets) - Math.min(...targets) > baseToleranceMs ||
      Math.max(...lowest) - Math.min(...lowest) > baseToleranceMs;
    // Entering Auto from Manual starts from Manual's wall-clock cutoff, which is ahead of the video, so Auto starts
    // from whatever target its first sample reads, at a cadence-dependent instant.
    const enteredAuto = events.some(event => event.type === 'mode' && event.mode === 'auto' &&
      event.t > sinceMs && event.t <= sample.ms);
    // The effect ends once every run meets its target, or once a later timeline or mode change has put every
    // run back to awaiting and a decisive stretch since has made every A4-abiding run rebase.
    const resynchronized = triggeredMs !== null &&
      decisive.some(stretch => stretch.startedMs > triggeredMs && stretch.endMs <= sample.ms);
    if (targetsDiffer || enteredAuto || ambiguous.some(([from, to]) => from <= sample.ms && to > sinceMs)) {
      ambiguousEffect = true;
      triggeredMs = sample.ms;
    } else if (ambiguousEffect &&
      (resynchronized || shared.every(other => other.target - other.cutoff <= baseToleranceMs))) {
      ambiguousEffect = false;
      triggeredMs = null;
    }
    if (ambiguousEffect) {
      stats.ambiguous += 1;
      continue;
    }
    if (excluded.some(ms => Math.abs(ms - sample.ms) <= windowMs)) {
      continue;
    }
    stats.compared += 1;
    const cutoffs = shared.map(other => other.cutoff);
    const spread = Math.max(...cutoffs) - Math.min(...cutoffs);
    // Once every run has met its target, what a change cost them no longer matters.
    if (shared.every(other => other.target - other.cutoff <= EPS_MS)) {
      changes = 0;
    }
    if (spread > toleranceMs + EPS_MS) {
      const detail = runs.map((run, i) => `${run.cadenceMs} ms: ${fmt(cutoffs[i] - shared[i].target)}`).join(', ');
      violations.push({inv: 'A5', ms: sample.ms, detail: `cutoffs ${fmt(spread)} ms apart (vs target: ${detail})`});
    }
  }
  return violations;
}

/**
 * Where A4's outcome itself depends on cadence, for any policy that counts progress after corroboration: from
 * the first corroborated stretch of a timeline that does not decide it at every cadence alike, to the next
 * timeline or mode change. A stretch is the run of agreeing confident estimator updates; it is corroborated
 * from its second update. Returns the [fromMs, toMs) windows, and the decisive stretches {startedMs, endMs}: by
 * endMs every cadence has completed A4 in a stretch whose timeline or mode began at startedMs.
 */
function ambiguousWindows(world, coarseMs) {
  const windows = [];
  const decisive = [];
  const progressAt = ms => world.stateAt(Math.max(0, Math.min(ms, world.durationMs - 1))).progress;
  const changes = world.events.map(event => event.t);
  const nextChange = ms => Math.min(world.durationMs, ...changes.filter(t => t > ms));
  let stretch = null;
  let decidedUntil = -1;

  // The first instant from fromMs (on the grid, before limitMs) at which progress since sinceMs reaches neededMs.
  function reaches(sinceMs, fromMs, neededMs, limitMs) {
    const base = progressAt(sinceMs);
    for (let ms = fromMs; ms < limitMs; ms += GRID_MS) {
      if (progressAt(ms) - base >= neededMs) {
        return ms;
      }
    }
    return null;
  }

  // A stretch decides A4 the same way at every cadence when the earliest any cadence can complete it and the
  // latest one must have are within the window A5 already leaves around a rebase. A cadence reads the
  // corroborating update up to one period late (and counts no progress before it), and needs one more sample
  // after reaching P; it cannot complete after reading the breaking update. Progress may come from a seek, all
  // at one instant, or stop for a stall.
  function close(endMs) {
    if (stretch !== null && stretch.corroboratedAt !== null && stretch.corroboratedAt.ms > decidedUntil) {
      const fromMs = stretch.corroboratedAt.ms;
      const earliest = reaches(fromMs, fromMs, SPEC.rebaseProgressMs - SLACK_PROGRESS_MS, endMs + coarseMs);
      const reached = reaches(fromMs + coarseMs, fromMs + coarseMs, SPEC.rebaseProgressMs + SLACK_PROGRESS_MS,
        endMs - coarseMs);
      const latest = reached === null ? null : reached + coarseMs;
      const until = nextChange(fromMs);
      if (earliest !== null && (latest === null || latest - earliest > 2 * coarseMs)) {
        windows.push([earliest, latest === null ? until : latest + coarseMs]);
      }
      if (latest !== null) {
        decidedUntil = until;
        const startedMs = Math.max(-Infinity, ...changes.filter(t => t <= fromMs));
        decisive.push({startedMs, endMs: latest + coarseMs});
      }
    }
    stretch = null;
  }

  // The estimate a sample at ms reads, if it is confident and in Auto.
  function reading(ms, mode) {
    const offsetMs = world.estimateAt(ms).offsetMs;
    const confident = offsetMs !== null && world.stateAt(ms).kind !== 'loading' && mode === 'auto';
    return confident ? offsetMs : null;
  }

  // Update arrivals, and timeline and mode changes, in time order. After a change, the update current then is
  // the first a sample can read, so it starts the next stretch.
  const steps = world.events.map(event => ({ms: event.t, event}));
  for (let at = world.trace.phaseMs; at < world.durationMs; at += POLL_MS) {
    steps.push({ms: at, event: null});
  }
  steps.sort((x, y) => x.ms - y.ms || (x.event ? 0 : 1) - (y.event ? 0 : 1));
  let mode = 'auto';
  for (const step of steps) {
    if (step.event !== null) {
      if (step.event.type === 'mode') {
        mode = step.event.mode;
      }
      close(step.ms);
      const offsetMs = reading(step.ms, mode);
      if (offsetMs !== null) {
        stretch = {offsetMs, corroboratedAt: null};
      }
      continue;
    }
    const offsetMs = reading(step.ms, mode);
    const agrees = stretch !== null && offsetMs !== null && Math.abs(offsetMs - stretch.offsetMs) <= SPEC.agreementMs;
    if (!agrees) {
      close(step.ms);
      if (offsetMs !== null) {
        stretch = {offsetMs, corroboratedAt: null};
      }
      continue;
    }
    if (stretch.corroboratedAt === null) {
      stretch.corroboratedAt = {ms: step.ms, progress: world.stateAt(step.ms).progress};
    }
    stretch.offsetMs = offsetMs;
  }
  close(world.durationMs);
  return {windows, decisive};
}

const FIXED_CADENCES = [100, 500, 2000];

/**
 * Every check for one trace. Returns violations tagged with the cadence that showed them. stats, if given,
 * counts the shared instants A5 compared and those it skipped as ambiguous.
 */
function checkTrace(createChatTiming, trace, stats = {compared: 0, ambiguous: 0}) {
  const world = buildWorld(trace);
  const violations = [];
  const fixedRuns = FIXED_CADENCES.map(cadenceMs => {
    const samples = drive(createChatTiming, world, fixedTimes(world.durationMs, cadenceMs));
    const result = checkRun(samples);
    for (const violation of result.violations) {
      violations.push(Object.assign({cadence: cadenceMs + ' ms'}, violation));
    }
    return {cadenceMs, samples, rebases: result.rebases};
  });
  for (const violation of checkCadence(fixedRuns, world, stats)) {
    violations.push(Object.assign({cadence: FIXED_CADENCES.join('/') + ' ms'}, violation));
  }
  for (const cadenceSeed of [1, 2]) {
    const salt = trace.profile === 'calm' ? 17 : 0;
    const samples = drive(createChatTiming, world, randomTimes(world.durationMs, trace.seed * 31 + cadenceSeed + salt));
    for (const violation of checkRun(samples).violations) {
      violations.push(Object.assign({cadence: 'random#' + cadenceSeed}, violation));
    }
  }
  return violations;
}

// Delete segments while the same invariant still fails, to report a small trace.
function shrink(createChatTiming, trace, inv) {
  let current = trace;
  let progress = true;
  while (progress) {
    progress = false;
    for (let i = 0; i < current.segments.length; i++) {
      const segments = current.segments.filter((_, j) => j !== i);
      if (segments.length === 0) {
        continue;
      }
      const candidate = Object.assign({}, current, {segments});
      if (checkTrace(createChatTiming, candidate).some(violation => violation.inv === inv)) {
        current = candidate;
        progress = true;
        break;
      }
    }
  }
  return current;
}

function fmt(ms) {
  return String(Math.round(ms));
}

module.exports = {
  SPEC, STALL_JITTER_MS, SLACK_CUTOFF_MS, FIXED_CADENCES, PROFILES,
  generateTrace, buildWorld, drive, fixedTimes, randomTimes, checkRun, checkCadence, checkTrace, shrink,
};
