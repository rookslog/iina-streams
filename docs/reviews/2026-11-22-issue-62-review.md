# Review: #62 automatic chat timing, stricter oracle (2026-11-22)

Commit 6285959 on base a004eea, merged onto beta in a scratch worktree (`merge/62-into-beta`, 80bcd9a).

Lead checks: 842/842 pass; `PLAYHEAD_JITTER_SECONDS` = 0 → 26 fail; `REBASE_PROGRESS_SECONDS` = 0 → 18 fail. Reviewer: Codex gpt-6.2-sol xhigh, read-only, 23:54–23:58.

## Review (verbatim)

**FIX FIRST** for [#62](https://github.com/rookslog/iina-streams/issues/62). A1, A2 and A4’s exact fixtures fail on `a004eea` and pass on the merge. A5’s exact counterexample still fails the written invariant.

- **P2 — The oracle still skips failures and allows slack.** [tests/class-a-model.js:829](/Users/rookslog/Development/iina-streams-wt/m62/tests/class-a-model.js:829) adds tolerance for timeline changes, seeks and target spread, and skips **437 of 11,358** shared instants. That includes the reported 4 s comparison: the 2 s sampler is **18.6 s behind** the finer samplers, up from **18.0 s** on the base and well outside the **3 s** bound.
- **P2 — J still lets chat advance during a stall.** [src/chat-timing.js:284](/Users/rookslog/Development/iina-streams-wt/m62/src/chat-timing.js:284): after two 1 s playback steps, a stationary playhead reading **+200 ms** advances the cutoff **300 ms**; the base held. The oracle accepts this as earlier playback released late, but written A1/A2 do not.
- **P2 — P prevents pre-corroboration credit but delays convergence.** [src/chat-timing.js:321](/Users/rookslog/Development/iina-streams-wt/m62/src/chat-timing.js:321): at 1×, the new count needs **1.4 s** of steady play to credit P. With the player’s 1 s status cadence, the base rebases at 4 s; the merge is still **18.6 s behind**. Without corroboration, a 20 s gap is still **600 ms** open at A6’s 40 s deadline, and the oracle accepts it. Both are regressions against the pre-merge code.
- **P2 — The A5 deferral is sound for the exact trace, not sufficient to close A5.** Sampling on estimator updates fixes the steady trace and avoids guessing when corroboration arrived. But with that callback simulated, stalling at 3.35 s and varying readings within ±J still leaves the 2 s sampler **19.025 s behind** at 4 s. The oracle skips that comparison too. [tests/class-a-counterexamples.test.js:221](/Users/rookslog/Development/iina-streams-wt/m62/tests/class-a-counterexamples.test.js:221)

Fresh checks: **842/842** pass; `J=0` causes **26** failures and `P=0` causes **18**. Native mpv jitter was not measured.
## Lead disposition

**Not merged; held.** All findings are Medium (D-032: not blocking on their own), but two are regressions against beta: slower convergence under P, and stall advance under J. A fix for Medium counterexamples that adds Medium regressions isn't a net gain.

**Order of work, 0.5.6:**
1. The player samples on each estimator update (the A5 player-side change).
2. Measure real mpv playhead jitter natively, so J comes from data, not the 0.2 s guess.
3. Revisit J and P against the strict oracle, with no skipped instants or slack, and with the reviewer's stall-at-3.35 s trace as a fixture.

The branch `fix/auto-oracle` stays as is.
