# 0.5.6 small fixes: test design (lead, 2026-11-24)

**Pipeline** (memory `delegation-pipeline-tests-first`, amended 2026-11-24):
1. The lead designs these tests.
2. A Sonnet agent writes them, red where a fix is needed.
3. Gemini Hydrogen High implements in the confined wrapper.
4. The lead reviews, then Codex reviews the code (`docs/REVIEW.md`).

Each item names its mutation check: the one-line product change that must turn its test red.

## #66: Cancel, then reopen Open Stream before a late broadcasts result (test only)
1. Open Stream for an offline channel A. Its `recentArchives` request is held (the shim doesn't answer yet).
2. Cancel the window. Reopen it, and submit offline channel B, whose result arrives.
3. Now release A's late result.

**Expected:** the window shows B's broadcasts only. A's never render, and they never replace B's.
**Mutation check:** ~~removing `openRun++` in `closeOpenWindow` (`global.js`) makes this test fail.~~ *Amended 2026-11-24 (lead, on writing it):* since #73 round 7, A's late result is fenced twice in `showArchives`: by the draft counter (reopening and submitting also advance it, not only closing) and by `isFormShowing(form)` (class C). Removing either alone leaves the test green; removing the whole fence turns it red. That is the check.
**No product change** is expected. Written in `tests/offline-precheck.test.js` ("#66 ..."): **green on `next` at 595639d**, so #66 is settled by the test.

## #59: an unmarked reopen keeps stale quality metadata
1. Open a Twitch live source. Confirm a switch to 360p (quality generation > 0).
2. Reopen the same source without a generation marker; the resolver returns the 720p URL.
3. On its matching `file-loaded`:
   - the sidebar's quality value reads 720p, not 360p;
   - choosing 360p then makes one new resolver call.

*Written 2026-11-24 (lead):* `tests/quality-reopen-059.test.js`, red (reports `360p30`).
**Fix (from the review):** commit the fresh unmarked load's metadata on its matching file-loaded (`src/player.js` near the first-result adoption; `src/playback.js` unmarked-load handling).
**Mutation check:** reverting the fix fails both assertions.

## #65: last-session.json can't say which window wrote it
1. Two Streams windows each write diagnostics.

**Expected:** `@data/last-session.json` lets each entry be attributed to its window: either
- one entry per window, keyed by a window or core identifier that IINA gives the plugin; or
- one file per window, with old files pruned to at most 8.

Choose whichever needs no new IINA API. Record the choice in the test's header comment.
2. A replaced context in the same window keeps that window's key, and its `instanceId` changes.
3. A test that reads the file can tell "same window, new context" from "different window".

**Mutation check:** dropping the identifier makes test 3 fail.

*Written 2026-11-24 (lead):* `tests/diagnostics-065.test.js`, plus the amended #60 lifetime probe in `tests/listener-registry.test.js`.
- **Choice:** global is the only writer, keyed by the sender's IINA label. A player can read only its stream label, which two windows of one stream share (`JavascriptAPIGlobal.swift:125`). IINA tags each message to global with the window's own label (`:62`, `:130`). File shape: `{version: 2, windows: {<label>: {instanceId, instanceStartedAt, writtenAt, steps}}}`, keeping the 8 most recently written windows.
- **Item 2 as written:** the window key surviving a replaced context is global's job (test 3). A new `instanceId` per JS context is #60's existing design, so there is no separate player test. The player test that tried to need a second script context, and the fixture couldn't give it one.

## Not in this batch
- **#64** (a promise continuation crossing the loss boundary): it needs the class-L explorer to count mpv reads and timer registrations. That's a design change to the explorer, so it gets its own test design.
- **#63** (a saved personal Client ID overriding the built-in app): it needs a visible action ("Use the built-in app") and an error split. A small UI decision, done with the sidebar work.

## Build record (lead, 2026-11-24)
- **#66:** test only, green on today's code.
- **#59 and #65:** built by Codex while Hydrogen was out of quota (logic only). The lead reviewed the diff. Removing the reopen's adopt, keying by one constant, or dropping the 8-window bound each fails tests.
- **Merged into `next`** at the merge commit "Merge feat/056-small-fixes into next" (provisional). 940 JS tests and 168 Python tests pass there.
- **Nit, not fixed:** global doesn't check the type of `instanceStartedAt` or the contents of each step. The player builds both, and the lifetime probe checks they carry no address or credential.
- **Untested natively:** both fixes. #59's native proof: switch a VOD to 360p, reopen it from Open Stream, and see 720p in the sidebar. #65's: two Streams windows, then read `last-session.json`.
- **Owed before release:** a review by a provider other than Codex.

## Explorer extension for #64 and #35 (lead's design, 2026-11-24; not yet built)
D-033 lets adoption, and re-activation after a loss, return in 0.5.6 only once the class-L explorer (`tests/class-l-explorer.test.js`) covers adopted windows and the resolver. #64 needs the same explorer to see mpv reads and timer arms. One pass does both.

**Rule to add (L5b):** work that continues an ended activation reads no mpv property and arms no timer. This covers a resolve settling late, a promise continuation, and a timer turn. Exempt:
- the loss step's own synchronous teardown;
- the turns it armed (they keep their loss attribution through `wrapSetTimeout`);
- a hook's entry read of `path` / `stream-open-filename`, which it needs to decide whether the file is its own.

**Three things to build:**
1. **See reads and arms.** In `createWorld`, before `start`, wrap `iina.mpv.getString/getNumber/getFlag` to record `{name, attr}`. `wrapSetTimeout` already tags arms; also push each arm to a list. The shim stays unchanged, so other tests don't move.
2. **Attribute continuations correctly.** The obstacle: a promise continuation runs under whatever `model.attr` is current, so after a foreign step it looks like loss teardown. Fix: a loss step holds the loss attribution only for its synchronous part, then sets `model.attr = {epoch: ended, loss: false, via: 'continuation'}`. Anything running after that, other than its own armed turns, is ended-epoch work and is checked.
3. **Lose the window between promise jobs.** `stepThenClose` already closes N jobs after a step. Add `stepThenForeign`: a foreign hook N jobs after, for N in `CLOSE_JOBS`, run on every sequence that ends in a foreign step. That's #64's sequence (settle a quality, then a foreign load three jobs later), found without being told.

**Adopted-window world (#35):**
- `createWorld({adopted: true})`: an unlabeled window (`label: ''`), with `readSettings` returning `adoptNativeWindows: true`.
- No epoch until the first own-source hook adopts. That hook begins epoch 1.
- Run the same alphabet, checks and depth.
- Assert first that this world has the two clearance-1 findings at the commit clearance 1 reviewed (named in `docs/reviews/2026-11-22-v0.5.5-release-review.md`; unchecked which SHA): the falsifier must fail there without being told the sequences (D-032 rule 3).

**Re-activation after loss (D-033's second behaviour):** the model changes from "an own-source hook after a loss begins no epoch" to "it begins a new epoch (`last + 1`)". The explorer is then red on today's code (the spec for the restore) until the player re-activates. Keep the D-033 model selectable with an environment variable, so the 0.5.5 behaviour stays checkable.

**Order:** 1 and 2 first, then 3, on today's code. Expect #64 to show up. Fixing it is a builder's job. Then the adopted world, then the model change, each run before any product change.
**What this won't settle:** native adoption through the Safari extension (J3), and timing on real hardware.

### Explorer build record (lead, 2026-11-24)
- **Built:** items 1–3 (reads and arms, continuation attribution, a loss between jobs that is a close or a foreign file). The adopted-window world and the re-activation model are not built yet.
- **Red on `next` before the fix:** `L5b: ended epoch reads mpv time-pos from work continuing after a foreign, at step 2 of [quality, settle-ok, foreign@0]`. That is #64, found from the class.
- **Fixed by Codex:** Playback checks the activation's loss signal at entry and at every continuation. The explorer is clean at K=3 (4830 sequences) and K=4 (61170). Removing the post-resolve check turns it red.
- **Merged into `next`** ("Merge test/explorer-l5b into next", provisional).
- **Side effect:** the seeded random runs now draw one extra number per step (close or foreign), so the 1000 random sequences differ from before.
