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
    - "Forget This Channel" is enabled only in a window playing a recorded person.
16. **No network.** History never causes an HTTP request.

## Native IINA proof (lead, after the build)
- Open Ohnepixel twice for over 30 s and another channel once. `@data/history.json` holds both, with Ohnepixel scored higher.
- Pause, then open: no change.
- Clear: an empty list.
- Grep the file for `token`, `sig` and `http`: nothing.
