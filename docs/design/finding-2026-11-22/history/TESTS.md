# Watch history (#73): test design (lead, 2026-11-22)

**For:** issue #73 (watch history and its controls, 0.5.6), decided by D-035. Spec: `docs/design/FINDING-AND-WATCHING-SPEC-2026-11-22.md` §2.5 (history and preference controls) and §3 (ranking). The ranking consumer is #74 (typing suggestions).

**Pipeline** (memory `delegation-pipeline-tests-first`):
1. The lead designs these tests.
2. The lead or a Sonnet agent writes them, red, in a worktree (amended 2026-11-24: never Codex).
3. An implementer makes them pass (Gemini Hydrogen High in the confined wrapper, 2026-11-24).
4. The lead reviews, then Codex reviews per `docs/REVIEW.md`.

These are behaviours, not code. Where a number is a choice, the choice is recorded here, so the implementer doesn't invent one.

## Module `src/history.js` (pure; storage injected)

**What's stored** (privacy, J19, the privacy-minded viewer):
- per person: `{provider, login, displayName, visits: [{at, seconds}]}`;
- at most the 10 newest visits per person;
- never a URL, title, token, signature or query string.

1. **Record and merge.** `record({provider:'twitch', login:'Ohnepixel', displayName, at})` stores login `ohnepixel` (lowercased). A second record for the same provider and login appends a visit; it never creates a second person.
2. **Duration.** `finish({provider, login, at})` sets the newest open visit's `seconds` = `at − visit.at`, capped at 12 h. A `finish` with no open visit is a no-op.
3. **Frecency** (how often and how recently). Score = Σ over visits of an age weight:

   | Visit age | Weight |
   |---|---|
   | up to 4 days | 100 |
   | up to 14 days | 70 |
   | up to 31 days | 50 |
   | up to 90 days | 30 |
   | older | 10 |

   - A visit with `seconds` < 30, once finished, weighs 0: an accidental open isn't interest.
   - An unfinished visit (still playing) weighs as if it were long.
   - **Tests:**
     - five visits this week outrank twenty visits four months ago;
     - one visit today outranks one visit 20 days ago;
     - a 10-second visit adds nothing.
4. **Bound.** At most 500 people. Recording a 501st evicts the lowest score; ties go to the oldest last visit.
5. **Query, for #74.** `query('oh')`:
   - matches are case-insensitive prefix matches of `login` or `displayName`, then word-start matches inside `displayName`;
   - prefix matches come before word-start matches; within each group, by score; then by newest visit; then by login;
   - `query('')` returns the top people by score;
   - a provider filter is optional.
6. **Pause.** While `paused` is true, `record` and `finish` change nothing. The paused flag persists.
7. **Forget and clear.**
   - `forget({provider, login})` removes that one person.
   - `clear()` removes everyone but keeps `paused`.
   - Both write to storage immediately.
8. **Persistence.**
   - It loads from the injected storage (in production, `@data/history.json`).
   - **Corrupt or unreadable file:** it starts empty, doesn't throw, and keeps the bad file as `history.json.bad` before the next write.
   - **Unknown fields:** ignored.
   - **Version:** the file has a `version`; a newer version than the code knows means read-only, with no overwrite.
9. **Privacy guard.** A `displayName` or `login` containing `?`, `/`, `=` or whitespace is rejected; nothing is stored. Feed a signed playlist URL in every field: the stored file contains none of it.

## Wiring in `global.js` (shim tests)

10. **Live open.** Opening a Twitch channel that plays records one visit when the player starts playing, not when the request is made. Closing the window finishes it.
11. **Offline open** (#67's path): offline, recent broadcasts shown, no player. It records a visit with `seconds: 0`, which counts as interest at the full age weight: the viewer asked for this person.
12. **VOD.** Opening a VOD records its channel owner. **YouTube:** its channel id and name are stored with `provider:'youtube'`.
13. **Failures.** Unknown users, resolve errors and cancelled opens record nothing.
14. **Adopted windows** (D-033; off by default) record only when adoption is on.
15. **Menu controls,** in the Streams plugin menu, with no dialogs and no extra text ([memory `minimize-ui-text`]):
    - "Pause Watch History" is a checkmark item that toggles `paused`;
    - "Clear Watch History" clears everything;
    - ~~"Forget This Channel" is enabled only in a window playing a recorded person.~~ *Superseded by item 26 (2026-11-24): no per-channel Forget in 0.5.6; it moves to #76.*
16. **No network.** History never causes an HTTP request.

## Native IINA proof (lead, after the build)
- Open Ohnepixel twice for over 30 s and another channel once. `@data/history.json` holds both, with Ohnepixel scored higher.
- Pause, then open: no change.
- Clear: an empty list.
- The Plugin menu shows Streams' items as before, plus one "Watch History" submenu holding Pause and Clear only; Go Live and Chat stay at the top level (item 17, untested natively).
- Grep the file for `token`, `sig` and `http`: nothing.

## Round 2: the wiring after Codex's review (lead, 2026-11-24)

Record: `docs/reviews/2026-11-24-issue-73-wiring-review.md`. Classes H (a host rule mirrored by guesswork) and L (authority across async boundaries) recur, so each test below is a class rule, not a replay of the reviewer's probe. **For every H test, the shim's behaviour is taken from IINA 1.5.1's source, cited in the test.**

17. **Menu placement (H).**
    - History's three commands live in one Streams submenu, "Watch History":
      - "Pause Watch History", a checkmark item;
      - ~~"Forget This Channel";~~ (removed by item 26)
      - "Clear Watch History".
    - The top-level Streams items are as before history, plus that one submenu. Go Live and the Chat items stay at the top level.
    - IINA shows only the first five plugin items at the top level and puts the rest under More… (`MenuController.swift`, the plugin menu rebuild). The shim models that limit.
18. **No writes to mounted items (H).**
    - IINA's `JavascriptPluginMenuItem` holds an `unowned` NSMenuItem, and its `selected`, `enabled` and `title` setters write through it (`JavascriptPluginMenuItem.swift`). Model that in the shim: after `menu.removeAllItems()`, writing any of those on an old item throws "IINA 1.5.1 would trap".
    - Toggling pause and clearing rebuild the definitions (binding Forget went with item 26): remove all, add, then `forceUpdate()` on the main thread, coalesced. No test may pass by writing to a mounted item.
19. *Withdrawn by item 26 (2026-11-24): per-channel Forget left 0.5.6. Codex's round-2 check also showed this item's timing reason was wrong: `menu-update` is emitted before the rebuild, and listeners run synchronously.* **Forget targets the window that was active when the menu opened (H, L).** *Amended 2026-11-24 after the advisor's check: `history-focus` is removed altogether, since nothing consumes it once Forget binds at menu-open. The bind is plain state in global; the menu is not rebuilt on bind, because the bind arrives after IINA has built the open menu. Forget This Channel is always enabled. Rebuilds happen only for pause and clear, after a click.*
    - IINA emits `iina.menu-update` only to `PlayerCore.active` when the Plugin menu opens (`MenuController.swift:847`), and the global API has no active-player accessor (`JavascriptAPIGlobal.swift`).
    - On `iina.menu-update`, the player posts `history-menu {visit}`, identifying its own open visit or none. Global binds Forget to that visit.
    - **Forget acts:**
      - on a bound visit that is still open: it forgets that person;
      - with no bound visit, or a visit that has ended or been replaced: it does nothing, with no dialog.
    - **Test:** bind A, then send B's `history-menu`, then invoke the action built for A. A is not forgotten wrongly, and B is not forgotten at all. The old "no focus event means focused" fallback is removed.
20. **Offline interest respects cancellation (L).** Hold the archive reply, cancel the window, then release the reply. No visit is recorded, and the window stays closed. An edit or an independent new submission isn't a cancellation, so the newer run's reply still records.
21. **The live precheck respects explicit cancellation (L).** Hold the status reply, cancel, then release a "live" answer. No player opens, and nothing is recorded.
22. **Only Streams' own loads count (H).**
    - Resolve fails, so IINA's hook releases the original URL. Then an unmarked `iina.file-loaded` for that URL arrives (IINA's yt-dlp fallback succeeded). No `history-start` is sent.
    - A visit starts only for a load this activation resolved and handed off. Generation 0 is not a match.
23. **Identity is validated before it's posted (privacy).**
    - The player posts exactly `{provider, login, displayName}`.
    - `login`:
      - Twitch: `^[a-z0-9_]{1,25}$`;
      - YouTube: `^UC[A-Za-z0-9_-]{22}$`;
      - otherwise, no post.
    - `displayName`: at most 64 characters, and containing none of `/ ? = & #`, `://` or whitespace other than single spaces. Otherwise it is replaced by `login`.
    - **Test:** a display name holding an absolute URL with a query reaches neither the message nor disk.
24. **One end per visit, on every loss path (L).**
    - Retire, a managed foreign load and window close each send exactly one `history-end` for that visit, keyed by the visit, not the window.
    - The resolver returns the channel identity in its result. An `onChannel` callback after signal loss can't affect a later same-source load, because the URL-keyed slot is gone.
25. **A Twitch VOD that falls back to Streamlink without owner metadata** records no visit and makes no extra request. This is the documented omission.

## Round 3: step back after Codex's narrow check (lead, 2026-11-24)
Record: `docs/reviews/2026-11-24-issue-73-wiring-review.md`, round 2. Known classes M and C in `docs/REVIEW.md`.

26. **No per-channel Forget in 0.5.6.** It is deferred to #76. The Watch History submenu holds Pause and Clear. The player posts no `history-menu` and no `history-focus`. Global ignores both. Item 19 and its amendment are withdrawn.
27. **One cancellation rule, as a table** (`tests/offline-precheck.test.js`, "round 3 cancel table"):
    - submit, then cancel: 0 opens;
    - submit, edit, then cancel: 0 opens;
    - submit A, submit B, then cancel: 0 opens;
    - a sidebar open pending, the form opened and cancelled: 1 open;
    - a cancelled instance, then a later instance's submission: the cancelled answer opens nothing, the later one opens;
    - submit, then the window's close button (no message reaches the plugin): 0 opens, and the window isn't reopened;
    - submit A, then a broadcast link that opens at once and closes the form, then A answers live: no second player.
    The predicate (class C, reworded): a form-started answer acts only while its own form instance is still showing.
