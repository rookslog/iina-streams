# Watch history (#73): test design (lead, 2026-11-22)

**For:** issue #73 (watch history and its controls, 0.5.6), decided by D-035. Spec: `docs/design/FINDING-AND-WATCHING-SPEC-2026-11-22.md` §2.5 (history and preference controls) and §3 (ranking). The ranking consumer is #74 (typing suggestions).

**Pipeline** (memory `delegation-pipeline-tests-first`):
1. The lead designs these tests.
2. Codex writes them, red, in a worktree.
3. An implementer makes them pass.
4. The lead reviews, then Codex reviews per `docs/REVIEW.md`.

These are behaviours, not code. Where a number is a choice, the choice is recorded here, so the implementer doesn't invent one.

## Module `src/history.js` (pure; storage injected)

**What's stored** (privacy, J19, the privacy-minded viewer):
- per person: `{provider, login, displayName, visits: [{id, at, seconds}]}`;
- at most the 10 newest visits per person;
- never playback metadata: the module stores only identity fields that pass its allowlists (item 9), and nothing else from its input.

1. **Record and merge.** `record({provider:'twitch', login:'Ohnepixel', displayName, at})` stores login `ohnepixel` (lowercased). A second record for the same provider and login appends a visit; it never creates a second person.
2. **Duration.** `record(...)` returns a visit handle `{provider, login, id, instance}`, or `null` when the record is ignored. `finish(handle, at)` sets that visit's `seconds` = `at − visit.at`, capped at 12 h.
   - Finishing a visit that is already closed, or doesn't exist, is a no-op, so an identical retry does nothing.
   - Amended 2026-11-22 round 2b (lead): `finish` closes the visit its handle names, not "the newest open visit of the person" and not "the same as the last finish". Two windows of one person closing in the same second each close their own visit.
   - Amended 2026-11-22 round 3 (lead): every visit has a stored `id` that only grows, and the handle carries the id, not the time. So a clock that moves backwards can't orphan a handle, and two visits opened in the same second are closed independently, also across a retry after a failed write. A file without ids gets them in time order.
   - Amended 2026-11-22 round 4 (lead):
     - **`null` is `record`'s false:** it means the record was ignored (paused, read-only, unavailable, unsafe identity or bad time). `finish`, `forget`, `clear` and `setPaused` return `false` instead.
     - **The next id is stored** in the file (`nextId`), so forgetting the newest visit and reopening never lets its id, or a stale handle, come back.
     - **Ids are bounded, and nothing is renumbered** (step-back, lead): an id is a whole number from 1 to 2^31. An id, or a `nextId` (at most 2^31 + 1), that isn't one makes the file corrupt: it is backed up to `.bad` and history starts empty. A newer file is never judged by its ids. At the bound `record` returns `null` and writes nothing; `finish`, `forget`, `clear` and pause still work.
     - **Ids a file lacks** (an older file) are given from `nextId` upward, in time order across the file.
     - **Strict id check on load** (round 6, lead): in a file this code owns, a repeated id anywhere, an explicit `null` id, or an invalid id on any visit (including visits and people that loading would drop) makes the file corrupt. Load never changes an id that is there; only absent ids are assigned. A newer file isn't judged: it is read-only, and unusable ids are replaced in memory only.
   - Amended 2026-11-22 round 6 (lead): handles belong to one `createHistory` instance. `instance` is a random token drawn at creation (`random`, Math.random's shape, can be injected for tests). A handle from another instance (after a reopen, or after a corrupt-file reset that restarts the ids) closes nothing and writes nothing.
   - A `finish` with a non-finite or non-number `at` is ignored. The handle holds no secret, and the caller keeps it from player start to close.
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
   - Amended 2026-11-22 round 2 (lead): the person just recorded is never the one evicted. Otherwise a full history of strong regulars could never admit anyone new.
   - Amended 2026-11-22 round 3 (lead): a file with more than 500 people is trimmed by score on load, in memory only. Nothing is written until the next mutating call.
   - Amended 2026-11-22 round 4 (lead): the trim is one sort (a 10,000-person file opens in well under 200 ms), and `forget` of a person the trim removed also removes them from the file; the trimmed logins are kept until the next write.
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
   - **Corrupt file** (it parses badly, has no usable version or shape, or fails the id checks below): it starts empty, doesn't throw, and keeps the bad file as `history.json.bad` before the next write.
   - **Unknown fields:** ignored.
   - **Version:** the file has a `version`; a newer version than the code knows means read-only, with no overwrite.
   - Amended 2026-11-22 round 2 (lead):
     - **The version is checked before the shape.** A newer file with any layout (`{version: 2, people: {}}`) is read-only: nothing is written and nothing is backed up. Only a file with no usable version, or a v1 file with the wrong shape, is "corrupt".
     - **Loaded data is normalised:** visits sorted by time, durations capped at 12 h, a visit in the future counted as now.
     - **A failed write** doesn't throw. The change stays in memory, and `finish`, `forget`, `clear` and `setPaused` return whether the change is in the file (`record` still returns its handle). The next call, including an identical retry, writes again. After a failed backup the unreadable original is never overwritten.
     - **Pause** writes only when its stored value changes.
   - Amended 2026-11-22 round 3 (lead):
     - **A read that throws** (not a parse failure) makes the store *unavailable*. Every mutating call first retries the read; while it still fails, it returns false and writes and backs up nothing, so a file that couldn't be read is never overwritten. `query` retries the read too but never writes.
     - **A pending write** is retried by the next *mutating* call, including one that changes nothing (a paused `record`, a `finish` of a closed visit). A failed `forget`, `clear` or pause keeps its change in memory.
     - **Stored values that aren't usable numbers** (a time, a duration or an id) reject the visit on load.
9. **Privacy guard.**
   - **Login, an allowlist** (amended 2026-11-22 round 2, lead): a Twitch login matches `^[a-z0-9_]{1,25}$` after lowercasing; a YouTube channel id matches `^UC[A-Za-z0-9_-]{22}$`. Anything else (an address, a URL, a bare token) is rejected.
   - A `displayName` containing `:`, `?`, `/`, `=`, `\`, `&` or a control character, or longer than 64 characters, is rejected. Spaces and any other Unicode are allowed ("Linus Tech Tips" records). (Amended 2026-11-22 (lead): spaces allowed in display names.)
   - The `provider` must be exactly `twitch` or `youtube`.
   - A rejected record stores nothing. Feed a signed playlist URL in every field: the stored file contains none of it.
   - Amended 2026-11-22 round 3 (lead): the claim is narrowed. The module stores only identity fields that pass the allowlists, and never playback metadata. It checks format, not provenance (a token that happens to fit the login or display-name rules would be stored), so the wiring (items 10-12) must pass only identity from a resolved Twitch user or a YouTube channel record, and a wiring test asserts that nothing from a URL, token or playlist reaches `record`.

## Wiring in `global.js` (shim tests)

10. **Live open.** Opening a Twitch channel that plays records one visit when the player starts playing, not when the request is made. Closing the window finishes it.
11. **Offline open** (#67's path): offline, recent broadcasts shown, no player. It records a visit with `seconds: 0`, which counts as interest at the full age weight: the viewer asked for this person.
12. **VOD.** Opening a VOD records its channel owner. **YouTube:** its channel id and name are stored with `provider:'youtube'`.
13. **Failures.** Unknown users, resolve errors and cancelled opens record nothing.
14. **Adopted windows** (D-033; off by default) record only when adoption is on.
15. **Menu controls,** in the Streams plugin menu, with no dialogs and no extra text ([memory `minimize-ui-text`]):
    - "Pause Watch History" is a checkmark item that toggles `paused`;
    - "Clear Watch History" clears everything;
    - "Forget This Channel" is enabled only in a window playing a recorded person.
16. **No network.** History never causes an HTTP request.

## Native IINA proof (lead, after the build)
- Open Ohnepixel twice for over 30 s and another channel once. `@data/history.json` holds both, with Ohnepixel scored higher.
- Pause, then open: no change.
- Clear: an empty list.
- Grep the file for `token`, `sig` and `http`: nothing.
