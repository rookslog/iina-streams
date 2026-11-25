# Typing suggestions in Open Stream (#74), phase 1: test design (lead, 2026-11-24)

**For:** issue #74, 0.5.6 (D-035). **Built on:** watch history (#73, `src/history.js`, `query()`), and the offline precheck and recent-broadcasts list (#67, #32).
**Design:** quick list A, answered in WAITING W-12:
- a fixed-height list that scrolls;
- no reason text and no "your people" label;
- a person's VODs reachable whether they're live or not.

**Pipeline** (memory `delegation-pipeline-tests-first`, amended 2026-11-24):
1. The lead designs these tests.
2. A Sonnet agent writes them, red.
3. Gemini Hydrogen High implements in the confined wrapper.
4. The lead reviews, then Codex reviews the code per `docs/REVIEW.md`.

**Phase 1 is local only.** Suggestions come from watch history; the one network request is a batched live-status lookup when the window opens. Remote search (Twitch's search for people not in history) is phase 2, and the typed text is never sent anywhere in phase 1.

## Choices made here (the lead's, provisional; the operator may overrule)

1. **Live status never reorders the list.** Order is exactly `history.query()`'s: prefix matches, then word-start matches; then score, newest visit and login. The live dot arrives later and changes only the dot.
   - **Why:** "remote results never move the selected row" (#74 brief). Frecency already puts the people watched most at the top.
   - **What would flip it:** the operator asking for live-first.
2. **Eight rows show,** and the list scrolls beyond that. The window doesn't change height while typing (W-12, "fixed height that scrolls").
3. **The empty field shows the top people** (`query('')`). This is the quick list.

## Protocol

| Direction | Message | Payload |
|---|---|---|
| page → global | `open-query` | `{text}`, on every input |
| global → page | `suggestions` | `{text, rows: [{provider, login, displayName, live}]}`, where `live` is `true`, `false` or `null` (unknown) |
| global → page | `suggestions-status` | `{status: {<login>: true\|false\|null}}` |
| page → global | `open-vods` | `{login}`; asks for that person's recent broadcasts, live or not |

- **Opening a row** reuses the existing `open-stream` message with `{input: login}`, so #67's precheck applies unchanged.
- **The answer to `open-vods`** is the existing `offline-vods` message (#32), now also for live people.

## Global tests (`tests/suggestions-global.test.js`, shim)

1. **Empty field.** When the Open Stream page sends `open-ready`, global answers `suggestions` for text `""` with the top 8 people from history, in `query('')` order.
2. **Typing.** With 12 people in history, `open-query {text:"oh"}` answers with `query("oh")`'s rows, in that order, and at most 8 of them. Each row carries `provider`, `login` and `displayName`, and nothing else from history: no visits and no scores.
3. **A pasted URL** (`https://www.twitch.tv/ohnepixel`, `twitch.tv/videos/123`, a YouTube URL) answers `rows: []`.
4. **No match** answers `rows: []`.
5. **Live status:**
   - **one batched request when the window opens,** for up to 20 people from history:
     - signed out, one GQL request listing the logins;
     - signed in, one Helix `GET /helix/streams` with repeated `user_login` (D-034: the documented API first);
   - **the answer** maps each login to `true` or `false` and arrives as `suggestions-status`;
   - **a failed request** gives `null` for those logins and nothing else: no retry storm, and no further request within 60 s of the last one, whether it worked or not;
   - **later `suggestions` messages** carry the cached `live` value;
   - **the request** contains only logins from history, never the typed text.
6. **No network for typing.** Ten `open-query` messages cause zero HTTP requests beyond the one status batch.
7. **Opening.** `open-stream {input:"ohnepixel"}` behaves exactly as today, including the precheck. This is a regression guard and needs no new behaviour.
8. **A person's broadcasts.** `open-vods {login:"ohnepixel"}` answers `offline-vods` with that person's recent broadcasts (the same shape as #32), whether they're live or offline.
9. **Paused history** still serves suggestions: pausing stops recording, not reading. **Cleared history** serves `rows: []`.
10. **Speed.** Answering `open-query` with 500 people in history takes under 20 ms of global time (`performance.now()` around the handler; a loose bound against accidental O(n²)).

## Page tests (`tests/suggestions-page.test.js`, the fake DOM used by `tests/b6c-open-page.test.js`)

11. **Rows.** Each row shows only the display name and a live mark: a filled dot when live, none when offline, a hollow ring when unknown. No other visible text, so no reasons, counts or labels.
12. **Combobox.** The field keeps focus. ↓ and ↑ move the selection, which is shown with `aria-activedescendant` and `aria-selected`.
    - **Return:**
      - with a selection, sends `open-stream {input: login}`;
      - with no selection and text, sends today's `open-stream {input: text}`.
    - **Escape** clears the field, then closes, as today.
13. **Selection by identity.** A `suggestions-status` message, or a new `suggestions` message that still contains the selected login, keeps that login selected. If the login is gone, the selection moves to the first row.
14. **Broadcasts.** → or Tab on a selected row sends `open-vods {login}`. The broadcasts render with today's #32 list; Escape returns to the suggestions with the person still selected.
15. **Fixed height.** The list container has a fixed height that fits 8 rows and scrolls (`overflow-y: auto`). The window height doesn't change between 0 and 12 rows.
16. **VoiceOver.**
    - The field is `role=combobox` with `aria-controls` pointing at a `role=listbox`.
    - Each option's accessible name is "Name, live", "Name, offline" or "Name".
    - Each option has `aria-posinset` and `aria-setsize`.

## Native IINA proof (lead, after the build)
- After opening three channels, ⌃⌘O shows them in frecency order with live dots.
- Typing "oh" puts Ohnepixel first.
- Return opens it.
- → shows their broadcasts while they're live.
- Reading the request log shows one status request and nothing per keystroke.

## Build record (lead, 2026-11-24)
- **Global half** built by Codex while Hydrogen was out of quota (logic only; the operator rules Codex out of design work). Commit on `feat/74-suggestions`.
- **Lead's test changes:** test 9 searches the Watch History submenu (#73 moved Clear there). Two #32 tests (`tests/b6c-global-offline.test.js`) now allow a fresh page's `suggestions`, and a plain open holds the list (height above 84 px). New test **5e**: a status answer that arrives after the form closed posts nothing to it, and is still cached for a reopen within 60 s.
- **Mutation checks:** removing the form check, the 60 s rule or the 20-login batch bound each fails tests. **Untested guard:** dropping a status batch that was pending when the person cleared their history. Without it, a cleared person's live mark could come back if they're recorded again within 60 s.
- **For the page half (Hydrogen, design):** a plain open is 84 + 8 × 28 = 308 px tall (`SUGGESTION_HEIGHT` in `global.js`). An offline broadcast list from a typed submission still sizes the window by its row count, so it can shrink from 308 px. Choose deliberately whether it should.
- **Privacy, at merge:** `docs/PRIVACY.md` must add `api.twitch.tv` (signed-in live status), and say that opening Open Stream sends up to 20 logins from watch history to Twitch for live marks.

## Round 2 test amendments (lead, 2026-11-24 ~21:00, after the Opus design review)
Review: scratchpad `opus-74-design-review.md` (verdict fix first; findings 1–3 traced to the lead's tests and global.js).
- **Selection:** whenever the list has people, the first is selected, at rest and while typing; Return opens the top match (this file's native proof; mock A). The 20:00 amendment ("no automatic selection while typing") was wrong and is reverted. The first ↓ moves to the second person.
- **Offline person + Return:** opens their broadcasts inline (`open-vods`), not the live check and the #32 list.
- **Global sends up to 20 people** (one status batch, W-18's disclosed 20); the page shows 8 and scrolls (item 2).
- **Fixed height through every state:** the live check and the offline list keep the 308 px window (W-12); b6c's growth expectations amended.
- Red on 6c5da18: 11 tests, each for these reasons.
