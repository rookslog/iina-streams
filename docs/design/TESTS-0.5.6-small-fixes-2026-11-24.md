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
