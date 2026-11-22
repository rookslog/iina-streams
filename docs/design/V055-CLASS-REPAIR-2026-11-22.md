# v0.5.5 class repair: controller authority (L) and Auto timing (A)

Written 2026-11-22 by the lead, after the round-6 recurrence triage (`docs/reviews/2026-11-22-v0.5.5-release-review.md`, section "Recurrence triage"). The operator chose option A: repair each recurring class against written invariants, check it with a class-level falsifier, then run one clearance review. Base: `release/0.5.5` at `04fe12f`. `eb3bb4a` (the round-6 point fixes) is input, not a base.

The rule for both classes: **the falsifier is written first and must fail at `04fe12f` on a known finding**, so it is shown to see the class. The reviewer's probes become regression examples, not the test design.

## Class L: controller authority

**The problem.** Authority is spread over `closed`, `retiring`, `sourceActive`, `liveRun`/`liveSessions`, the close epoch, the quality generation, `replacement`, `authBindSkipped` and global's auth sessions. Every timer (15), await (14) and listener (34) in `run()` has to check the right combination. Each round found one that didn't.

**Invariants.**
- **L1. One authority token.** A controller has one current activation. Every async continuation (timer callback, code after an `await`, a promise settlement, a host or page listener) captures the activation when its work starts, and does nothing once that activation is no longer current or the window has closed.
- **L2. Loss is one-way.** When the controller loses authority (a foreign file loads, or it retires), the activation ends and never becomes current again. If its own source loads again, even before the deferred cleanup turn, that is a **new activation** with fresh per-activation state. It is not a resumption. This removes the regain path behind R5 #1, R5 #2 and R6 #2.
- **L3. Per-activation state lives with the activation.** Anything that belongs to one load lives in an object owned by the activation and is dropped with it: replay, the live run and credential, the clock, the inbox and reveal timer, Go Live, the replacement, staged, the quality request, the Twitch window and the auth bind. The controller keeps only window-scoped state: view, page readiness, `closed` and preferences.
- **L4. Every `on_load` hook continues exactly once.**
- **L5. After a loss, the old activation emits nothing** (no mpv command or property, OSD, sidebar, overlay or global post, HTTP request or file write), except **one** final inactive snapshot.
- **L6. No abandoned work leaves the current activation busy.** Once every timer has run and every promise has settled, the current activation is not busy, unless a replacement it issued itself is still loading.

**Enforcement, structural rather than remembered.**
- **A guarded API.** Raw `timers.setTimeout`, listener registration and post-`await` code in `run()` go through activation-aware helpers.
- **A source-scan test** fails if `src/player.js` uses a raw form outside the helpers' own definitions.

**Falsifier: bounded exhaustive exploration of the real code.**
- `tests/class-l-explorer.test.js` drives the real controller in the shim through every event sequence up to length K, plus seeded random sequences of length 8–12. It checks L4–L6 after every step and at quiescence.
- **Alphabet:**
  - own-source load, foreign load, own-source reopen, close;
  - quality request, settle ok, settle error;
  - Go Live, settle Go Live;
  - file-loaded, end-file, main-thread turn (timers);
  - auth-ready, chat batch, pause, fullscreen.
- **Size:** choose K so the exhaustive part finishes in under about 30 s in `npm test`. A deeper run goes in a separate script.
- **Required RED:** at `04fe12f` the explorer finds R6 #2 (a late quality settlement after a reopen) without being told the sequence.

## Class A: Auto chat timing

**The problem.** Auto has no written invariants, and each rule was tuned to the last trace. The round-6 threshold, 0.5 s since the last sample, made the outcome depend on how often the player samples. That happens on chat arrival and on a 100 ms timer, and it measured about 40 s to close a 19.9 s gap.

**Invariants.** "Progress" means forward playhead movement while unpaused; movement within the jitter tolerance J counts as none.
- **A1. Rate cap.** Between any two samples, the reveal cutoff moves forward by at most 1.5 times the playhead's progress, including a forward seek's jump. A rebase (A4) is the only exception.
- **A2. No progress, no forward motion,** whether paused, stalled or jittering.
- **A3. Backward motion is free.**
- **A4. Rebase eligibility.** The mapping is corroborated by two distinct estimator updates agreeing within 1 s. Then, **accumulated** progress since corroboration reaches P. Accumulated means summed across samples, never measured per sample.
- **A5. Cadence independence.** The same underlying playback, sampled every 0.1 s, 0.5 s or 2 s, gives the same cutoff at shared instants, within one sample period's capped motion.
- **A6. Convergence.**
  - With corroboration and steady playback, the rebase fires once accumulated progress reaches P.
  - Without corroboration, the clamp alone closes a gap G within G / 0.5 s of playback.
- **A7. A timeline change** (reload, new file or mode change) keeps the previous cutoff and waits; nothing moves forward until A4 is met. **A seek is not a timeline change.**

The implementer chooses J and P, states the reason for each, and records them as named constants.

**Falsifier: property tests over generated traces.**
- `tests/class-a-properties.test.js` uses a seeded generator, with no new dependency.
- **Trace segments:**
  - playback at 1x, pause, stall with ±J jitter;
  - forward and backward seeks, reloads;
  - estimator updates with noise, repeats and disagreement;
  - random sampling cadence between 0.05 and 2 s.
- **Checks:** A1–A7. On failure, the failing seed and the trace are reported.
- **Required RED:** at `04fe12f`, or with `eb3bb4a`'s rule, the generator finds a violation of A2 or A5 without being told the sequence.

## Ownership and order

- **L:** `src/player.js`, `src/playback.js`, new `src/authority.js`, `tests/class-l-*`. It may edit existing non-Auto tests that reach the controller.
- **A:** `src/chat-timing.js`, `tests/class-a-*`, and the Auto test files `tests/r3-auto-cutoff.test.js`, `tests/r4-auto-seek.test.js` and `tests/r5-auto-stalled-tick.test.js`.
  - If A needs a different call from the player, A reports the interface; it does not edit `src/player.js`.
- **The lead:** `CHANGELOG.md`, the merges, and the clearance review.
- **Order:** L and A run in parallel. The lead merges L, then A, runs both suites and the explorer, then sends one clearance review seeded with the triage table.

## What this does not claim

- **The falsifiers' reach.** The explorer is exhaustive only up to K, over its alphabet, in the shim, so it is a bounded check of the real code, not a proof. The property tests sample traces; they don't enumerate them.
- **IINA itself is outside both.** A native run is still the top of the evidence hierarchy (`AGENTS.md`).
