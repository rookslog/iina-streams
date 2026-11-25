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

11. **Rows.** *(Superseded 2026-11-24 ~22:00, W-21: this rule over-read the operator's "drop the why-it's-here text"; mock A's values return: avatar with live dot, name, category and title, viewers or last-streamed age.)* Each row shows only the display name and a live mark: a filled dot when live, none when offline, a hollow ring when unknown. No other visible text, so no reasons, counts or labels.
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

## Round 3 step-back (D-032; lead, 2026-11-24 ~21:30)
- **Recurring class:** twice in a row the lead's own test amendments, made quickly from one review finding, encoded the wrong behaviour: at 20:00 "no selection while typing" (against this file's native proof and mock A), and at 21:05 "any offline mark skips the live check" (against the status cache's one-minute age, global.js's 60 s rule). The builder's code was right to the tests both times.
- **Repair:** before amending a test, the lead checks the amendment against this file's earlier rules and native proof and against the data's freshness (where a mark comes from, and how old it can be), and writes that check into the amendment's comment. Return now always runs the live check (R2-1); pointer opens never scroll (R2-2, working choice, Finder's disclosure-triangle behaviour; the operator may flip it).

## Phase 3: your follows and mock A's rows (lead, 2026-11-24 ~22:15; W-21)
**Why:** the operator tried the list (W-21): one person, bare names, "doesn't show all my people who are online". Mock A, which they liked, put follows in the list when signed in and showed values on each row. Rule 11 is superseded; rule 1 ("live status never reorders") is flipped by the operator's ask (W-21 reading 2).

**Checked facts:** sign-in asks only `chat:read` (`src/auth.js` SCOPE) and `validate` rejects any other scope set, so follows need `user:read:follows` and one new sign-in. `/oauth2/validate` returns `user_id`. `src/twitch-helix.js` already has `followedLive({userID})` (GET /streams/followed). Anonymous GQL answers `user(login){stream{title viewersCount game{displayName}} lastBroadcast{startedAt}}` (checked live, 2026-11-24).

### Auth (tests/auth*.test.js or a new file)
A1. The device flow asks for `chat:read user:read:follows`.
A2. `validate` accepts a token whose scopes include `chat:read`, with or without `user:read:follows`; rejects one without `chat:read`. `onReady` also receives `userID` (validate's `user_id`) and `scopes`.

### Global (tests/suggestions-global.test.js harness, extended)
G1. Signed in with `user:read:follows`: when Open Stream is ready, global makes one followed-live request (Helix /streams/followed, user_id from validate) and one followed-channels request (Helix /channels/followed, first page of 100). Both are cached with the 60 s rule; reopening within 60 s makes neither.
G2. Signed in without `user:read:follows` (an old token): no follow requests; global posts `suggestions-follows {state:'needs-sign-in'}` once per open. Signed out: no follow requests and no such message.
G3. **Rows** (`suggestions {text, rows}`): the people from history and from follows, each once (a login in both is one row). Row keys: `provider, login, displayName, live` (as before). Nothing from history's visits or scores.
G4. **Order at rest:** live people first; within live, people in history by history order, then follows by viewers (desc). Then not-live history people in history order, then offline follows newest `lastAt` first, then follows with no known `lastAt` by display name. Up to 50 rows.
G5. **Order while typing:** only people whose login or display name matches (history.query's prefix and word-start rules, applied to follows too). Prefix matches before word-start matches; within each, the G4 order.
G6. **Details** (`suggestions-status {status, details}`): `status` as before (`login: true|false`). `details[login]` is `{title, category, viewers}` for a live person and `{lastAt}` (ISO string) for an offline person when known. Follows' live details come from the followed-live answer (no extra request). History people's details come from the existing batched status request(s): no request per person, and still none per keystroke.
G7. When status or follows change who is live, global posts a new `suggestions` for the current text in G4/G5 order.
G8. Privacy: no follow request or detail request carries anything but logins/user id and the token in Authorization; a failed follow request leaves history rows and status working (no throw, no stale follows posted as live).

### Page (tests/suggestions-page.test.js)
P1. **Row content** (mock A, `direction-a/a.js`/`a.css`): an avatar showing the display name's first letter; the live mark on the avatar (live, offline = none, unknown = ring); the name; for a live person "category · title" and the viewer count in compact form (12345 → "12.3K"); for an offline person with `lastAt`, a short age ("2d", "3w") and the broadcasts chevron. No reason text.
P2. **Selection follows the top until the person moves:** before any arrow key, a new `suggestions` list leaves the first row selected (so Return opens the new top); after an arrow key, selection is by identity (test 13).
P3. A selected live row keeps its live mark as a live mark (the element keeps its live state/class); it is not restyled as a plain dot.
P4. `suggestions-follows {state:'needs-sign-in'}` shows one quiet line below the list: "Sign in to Twitch again to include who you follow." It is not an option (arrows skip it; VoiceOver reads it as a note).
P5. Details arriving update the row in place (same element), as status does.

### Phase 3 decisions on the test writer's questions (lead, 2026-11-24 ~22:40)
1. **Follows' `lastAt`:** GQL `user(login){lastBroadcast{startedAt}}`, aliased, up to 50 logins per request, for the offline people on the first page of follows (100). Helix has no batched equivalent. This is the one undocumented lookup used while signed in, and only for ages; if it fails, ages are simply absent. Record in PRIVACY.md at merge.
2. **History people's `lastAt` signed in:** the same GQL batch (test 5b's "no GQL signed in" holds for live status, not for ages).
3. **Offline follows are `live: false`** once the followed-live answer is in (that list is complete).
4. **Carrier:** follows' live details travel in `suggestions-status` like any other.
5. **Accepted scope sets are exactly** `{chat:read}` or `{chat:read, user:read:follows}`, in any order; anything else is rejected (the broad-token test stands).
6. **Players still get `{token, login, clientID}`;** global keeps `userID` and `scopes` to itself.
7. Rows past the first status batch may stay unknown (ring) for now; a later batch is a follow-up.
8. One cap of 50 rows for every list.
9. Typing resets "the person has moved": after typing, selection follows the top again. The P4 note takes one row's height inside the fixed window. P1's formats follow mock A's sample data.
10. A login in both history and follows shows Twitch's display name from follows.

### Phase 3b (lead, 2026-11-24 ~23:00)
Offline details gain `lastTitle` (GQL `lastBroadcast{title}`, checked live tonight), and an offline row shows it as its second line, as mock A did. P1d's earlier "age and name, nothing else" was a third drift from mock A by the lead's contract (after rule 11 and the follows); G6 and P1d amended.
