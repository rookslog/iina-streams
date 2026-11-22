'use strict';

// v0.5.5 class A falsifier (docs/design/V055-CLASS-REPAIR-2026-11-22.md, "Class A: Auto chat timing"):
// properties A1-A7 of Auto's reveal cutoff, checked over seeded generated playback traces, each sampled at
// 0.1 s, 0.5 s and 2 s and at two random cadences between 0.05 and 2 s. The generator, driver and oracle are in
// tests/class-a-model.js.
//
// CLASS_A_CHAT_TIMING=<path> checks another copy of the policy (an old revision written out with git show).
// CLASS_A_SEEDS=<n> changes the number of seeds (default 120). CLASS_A_REPORT=1 prints counts per invariant.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const model = require('./class-a-model.js');

const modulePath = process.env.CLASS_A_CHAT_TIMING
  ? path.resolve(process.env.CLASS_A_CHAT_TIMING)
  : path.join(__dirname, '../src/chat-timing.js');
const {createChatTiming} = require(modulePath);

const SEED_COUNT = Number(process.env.CLASS_A_SEEDS) || 120;
const SEEDS = Array.from({length: SEED_COUNT}, (_, i) => i + 1);
const INVARIANTS = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'];

// Every seed's violations, grouped by invariant: {count, seeds, first: {seed, violation}}.
const results = new Map(INVARIANTS.map(inv => [inv, {count: 0, seeds: new Set(), first: null}]));
const cadenceStats = {compared: 0, ambiguous: 0};
const PROFILES = Object.keys(model.PROFILES);
for (const profile of PROFILES) {
  for (const seed of SEEDS) {
    const trace = model.generateTrace(seed, profile);
    for (const violation of model.checkTrace(createChatTiming, trace, cadenceStats)) {
      const entry = results.get(violation.inv);
      entry.count += 1;
      entry.seeds.add(profile + ':' + seed);
      if (entry.first === null) {
        entry.first = {seed, profile, violation};
      }
    }
  }
}
const TRACES = SEEDS.length * PROFILES.length;

if (process.env.CLASS_A_REPORT) {
  for (const [inv, entry] of results) {
    console.log(`${inv}: ${entry.count} violations in ${entry.seeds.size} of ${TRACES} traces`);
  }
  console.log(`A5 compared ${cadenceStats.compared} shared instants and skipped ${cadenceStats.ambiguous} as ambiguous`);
}

// The failing seed, its first violation, and the trace shrunk by deleting segments while it still fails.
function describe(inv, first) {
  const shrunk = model.shrink(createChatTiming, model.generateTrace(first.seed, first.profile), inv);
  const again = model.checkTrace(createChatTiming, shrunk).find(violation => violation.inv === inv);
  return [
    `${inv} failed: ${first.profile} seed ${first.seed}, ${first.violation.cadence}, at ${first.violation.ms} ms: ` +
      first.violation.detail,
    `shrunk trace: ${JSON.stringify(shrunk)}`,
    `shrunk violation: ${again ? `${again.cadence}, at ${again.ms} ms: ${again.detail}` : 'none'}`,
  ].join('\n');
}

const STATEMENTS = {
  A1: 'between samples the cutoff moves forward at most 1.5x the progress, a rebase excepted',
  A2: 'no progress, no forward motion (paused, stalled or jittering)',
  A3: 'backward motion is free: the cutoff never stays above its target',
  A4: 'a rebase needs corroboration, then accumulated progress P since it',
  A5: 'cadence independence at shared instants',
  A6: 'convergence: the rebase fires by P, and the clamp closes a gap at 0.5 s per second',
  A7: 'a timeline change keeps the cutoff and waits; nothing moves uncapped until A4',
};

for (const inv of INVARIANTS) {
  test(`class A ${inv}: ${STATEMENTS[inv]} (${TRACES} traces)`, () => {
    const entry = results.get(inv);
    if (entry.first !== null) {
      assert.fail(describe(inv, entry.first) +
        `\n${entry.count} violations in ${entry.seeds.size} of ${TRACES} traces`);
    }
  });
}

test('class A: the generator produces the segments the checks need', () => {
  const kinds = new Map();
  for (const seed of SEEDS) {
    for (const segment of model.generateTrace(seed).segments) {
      const key = segment.kind + (segment.est ? ':' + segment.est : '');
      kinds.set(key, (kinds.get(key) || 0) + 1);
    }
  }
  for (const key of ['play:ok', 'pause:ok', 'stall:ok', 'stall:outlier', 'seek', 'jump', 'reload', 'manual:ok',
    'play:disagree', 'play:null']) {
    assert.ok((kinds.get(key) || 0) >= 3, `${key}: ${kinds.get(key) || 0}`);
  }
});

test('class A: A5 compares most shared instants rather than skipping them as ambiguous', () => {
  const total = cadenceStats.compared + cadenceStats.ambiguous;
  assert.ok(cadenceStats.compared >= 0.5 * total, `compared ${cadenceStats.compared} of ${total}`);
});

test('class A: the oracle sees rebases and stalls with a target ahead, so A2, A4 and A6 are not vacuous', () => {
  let rebases = 0;
  let stalledBehind = 0;
  for (const seed of SEEDS.slice(0, 40)) {
    const world = model.buildWorld(model.generateTrace(seed));
    const samples = model.drive(createChatTiming, world, model.fixedTimes(world.durationMs, 100));
    rebases += model.checkRun(samples).rebases.length;
    stalledBehind += samples.filter(s => s.mode === 'auto' && s.kind === 'stall' && s.target > s.cutoff + 2000).length;
  }
  assert.ok(rebases >= 10, `visible rebases in 40 seeds at 0.1 s: ${rebases}`);
  assert.ok(stalledBehind >= 100, `stalled samples 2 s or more behind the target: ${stalledBehind}`);
});
