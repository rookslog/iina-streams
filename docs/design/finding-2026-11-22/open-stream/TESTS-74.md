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

## Phase 3c (lead, 2026-11-25 ~00:10): fixes from the Opus design review (P3-1, P3-2) and the Opus backend review (B1–B8)
Reviews: scratchpad `opus-74-design-review.md` ("Phase 3") and the backend reviewer's report (probe harness at scratchpad `probe74/`).
- **C1 (P3-1) The order settles once.** For each open, global posts the first `suggestions` only after status (and, with the follows scope, follows) have answered or 450 ms have passed, whichever is first; cached answers count. After that first post the rows' order never changes while the window shows the same text: later answers travel only in `suggestions-status` (marks and details). A new text or a reopen gets the fresh G4/G5 order. Supersedes G7's repost.
- **C2 (B1) Open Stream reads the saved sign-in itself.** Opening Open Stream with a saved Keychain grant and no player connected validates it and, with the follows scope, fetches follows. Global may hold the credentials while Open Stream is showing or a player uses them; it drops them as before when neither does.
- **[Removed 2026-11-25: the Open Stream sign-in is gone (operator, W-21 update); branch fix/74-no-follows-connect]** **C3 (P3-2, B5) One action to include follows.** When the grant lacks `user:read:follows` (or no grant exists), the note is a button, "Include who you follow". It posts `follows-connect`; global forgets the old grant (as Sign out does), starts the device flow with both scopes, and posts `follows-code {userCode, verificationUri}` to the page, which shows the code with a button that opens the Twitch page. The person completes sign-in on Twitch; on success the follows load in the open window. The lead never completes an authorization.
- **C4 (B2, B3) Account and late answers.** A sign-in, sign-out or reopen while Open Stream shows refreshes status and follows for the showing form; a still-current cache refresh is published to whichever form is showing and ready.
- **C5 (B4) A detail or age error never wipes live status.** Live status and details/ages are separate queries (or errors are scoped by path): an error on `lastBroadcast` or a title loses only that.
- **C6 (B6) `user_id` must match `/^\d+$/`;** otherwise follows are treated as needs-sign-in.
- **C7 (B8) `suggestions-status` carries status and details only for the logins in the rows sent** (≤50).
- **C8 (B7):** record in CHANGELOG/release notes that rolling back to an older build asks for a new sign-in.
- **3c decisions on the writer's questions (lead):** the writer's readings 1, 3, 4, 5, 6, 8, 9, 10, 11 are adopted as written in the tests. (2) Typing before the first list: the first list is posted for whatever text is current when it posts. (7) A device flow still pending when Open Stream closes is cancelled; global then drops credentials as C2 says.

## Phase 3d (lead, 2026-11-25 ~01:00): fixes from both 3c re-checks
Design re-check P3c-1 and backend re-check MAJOR 1–2 (scratchpad `opus-74-design-review.md` "Phase 3c"; probes `probe74r2/`). The lead's C3 ("forgets the old grant, as Sign out does") caused D1; D-032 step-back: the recurring class is still the lead's own contract text, so each rule below names what must stay unchanged.
- **[Removed 2026-11-25: the Open Stream sign-in is gone (operator, W-21 update); branch fix/74-no-follows-connect]** **D1 Adding follows never signs anyone out.** follows-connect keeps the old grant and every player's chat as they are. Only when the new grant validates with both scopes is it saved, sent as `auth-ready` ({token, login, clientID}) to every player that had the old one, and the old token revoked. Cancel, close, expiry or failure leave Keychain, players and chat exactly as before. Supersedes C3's "forgets".
- **D2 A late follows answer still reaches the list.** After the first list, follow-only people from a late answer are appended below the rows already shown (rows above never move; the selected row and the row under the pointer stay); their marks and details follow in `suggestions-status`.
- **D3 Caches outlive the window for 60 s without a player.** Closing Open Stream drops the credentials as before but keeps the status and follows caches for 60 s, so a reopen within 60 s shows them at once (then refreshes per G1).
- **D4 Return before the first list is not lost:** with typed text it submits the text; with an empty field it opens the first list's top when the list arrives.
- **D5 A slow validate is a late answer, not an account change:** no re-sort; D2 applies.
- **3d decisions (lead):** the writer's readings 1–3, 5, 6 adopted as pinned. (4) Appended follow-only people keep the G4 order among themselves (live by viewers, then offline by newest lastAt, then name).

## Phase 2: search across your channels and the rest of Twitch (lead, 2026-11-25; W-21 update, W-23 option 1)
**Rev 1, superseded by rev 2 below** (an independent Opus critique found one BLOCKER and six MAJORs in this wording, 2026-11-25).
**Source of truth:** the chosen mock, variant 1 ("Offline below live, dimmed, hairline"), kept at `mock-74-search/index.html` beside this file (render `shot.png`). Its frames are the fixtures: (a) field empty, (b) "ri", (c) "glaze". Where this text and the frames disagree, the frames win and the disagreement is reported. The operator's words are in WAITING W-21 (update 2026-11-25 ~01:54); the choice is W-23. Each rule names what must stay unchanged, because every earlier round's fault was this contract's own wording (D-032 class).
- **S1 Two groups, one person once.** Group Y, "your channels": people you follow (signed in with the follows permission) and people in your watch history. Group O, "other channels": Twitch search results not in Y. A person is in Y if known, else O; never both. Signed out, Y is history only. Order inside Y is the existing G4/G5 order (live first; offline dimmed below). Order inside O: an exact login match for the typed text first, then live by viewers, then offline in Twitch's order.
- **S2 At rest (empty field): Y only.** No search request. Unchanged from today apart from dimming offline rows.
- **S3 Typing:** Y is filtered locally (as today). O comes from Twitch search after the text has been still for 250 ms, only if the text is 2–40 characters of letters, digits, underscore and spaces. O is drawn below Y after a hairline; at most 10 rows; Y keeps its 50 cap.
- **S4 Never sent to Twitch search:** anything else, including any text containing `/`, `:`, `.`, `?`, `=`, `&`, `@` or `#` (URLs, signed URLs, addresses). Such text is handled as today (Return opens it).
- **S5 Return's target never changes unseen.** Rows already shown never move (the settle-once rule, extended to search): O is only ever appended below Y. If Y has rows, the selection stays where it is when O arrives. If Y is empty (frame c), the first O row becomes selected when it is drawn. A Return before O arrives does what it does today with typed text (opens the text as a channel; D4's guard).
- **S6 Superseded answers never paint.** A search answer for text other than what the field holds now is dropped; so is any answer after the window closed.
- **S7 One late-answer rule.** Status, follows and search answers that arrive after the first list update marks in place or append below; none re-sorts rows already shown. (Compatible with either W-22 answer, which only changes what is known at first paint.)
- **S8 The split is heard, not only seen.** The hairline is drawn; VoiceOver hears the two groups by name ("Your channels", "Other channels", not visible). No other new visible words.
- **S9 Requests.** Twitch search is the anonymous GQL `searchFor(userQuery, platform:"web")` `channels.edges.item` on User with `login displayName stream{viewersCount title game{displayName}}` (shape checked live 2026-11-25: 10 results, viewer counts on live ones), sent with the public web client id and no token, signed in or out. One request per settled text; answers cached per text for 60 s. Status for O rows comes from the search answer itself (no second lookup). A failed search adds nothing and shows no error; Y and Return are unaffected.
- **S10 Privacy.** The typed text (only text passing S3/S4) goes to gql.twitch.tv; PRIVACY.md gains that line.
- **Out of scope here:** removing the old follows sign-in path (its own round, fix/74-no-follows-connect); W-22 and W-24.

## Phase 2 rev 2: search (lead, 2026-11-25; answers the rev 1 critique, findings 1–12)
Same source of truth (the chosen mock, `mock-74-search/`, variant 1) but **R13 says what the frames bind**. Each rule names what must stay unchanged.
- **R1 Groups; one person once.** Y ("your channels") = people you follow (signed in with the follows permission) and your watch history. O ("other channels") = search results whose login is not among all known people (follows and history). Known people that the search finds but that are not among the Y rows shown for this text are appended to the end of Y, above the hairline, in the same paint as O. Order in O: an exact login match for the typed text (trimmed, case-insensitive) first, then live by viewers, then offline in Twitch's order.
- **R2 At rest:** Y only; no search request; no hairline.
- **R3 When search runs:** in global, after the trimmed text has been unchanged for 250 ms, only for 2–40 characters of Unicode letters or digits, underscore and spaces. A cached answer (same trimmed, lower-cased text, under 60 s old) is posted after the same pause without a request. At most 10 O rows, plus at most 10 known people appended to Y; Y's own 50 cap is unchanged.
- **R4 Never sent:** any other text, including anything containing `/ : . ? = & @ #`. Supersedes line 15's "the typed text is never sent anywhere", test 6 (`tests/suggestions-global.test.js:577`) and G8's assertion (`:942`): they now read "never sent, except as R3 allows".
- **R5 Return, by state.** (a) Y has rows: as today (waits up to 400 ms for Y's answer for that text, then opens the selected row). (b) Y is empty and no O row is drawn: opens the typed text as a channel, as today; never waits for O; never opens a result the person has not seen. (c) O rows are drawn: opens the selected row; when Y is empty, the first row is selected as it is drawn. D4 (Return on an empty field before the first list) is unchanged.
- **R6 Edits:** on any edit, the previous text's O rows and appended known rows go when the new text's Y list is drawn; selection follows the existing new-text rules. Text that fails R3/R4 gets no search and no O.
- **R7 Superseded answers never paint:** the page drops a search answer whose text (trimmed, case-insensitive) differs from the field's; global drops answers after the window closed.
- **R8 One late-answer rule:** rows already shown never move. Status updates marks in place. Late follows: with no O drawn, appended below Y (D2); while O is drawn, held until the next text, and a person already drawn in O stays there until then.
- **R9 Pending:** while a search request is out, a small spinner shows at the trailing end of the field; it is the only sign. On failure or an empty answer it goes and nothing else changes. (Lead's decision, after the operator's minimal-text rule: a signifier, not words.)
- **R10 VoiceOver:** only when both groups show, two `role=group` inside the listbox, named "Your channels" and "Other channels" (not visible); `aria-posinset`/`aria-setsize` count within each group; O's arrival is announced only if the selection moves.
- **R11 Requests (D-034, Helix first).** Signed in: Helix `GET /search/channels?query=…&first=10` with the viewer's token; viewer counts for live results from one Helix `/streams` request; offline age and last title from the existing anonymous GQL `lastBroadcast` batch (phase 3 decision 1), because Helix Search Channels has no viewer count and no last-stream time (fields read from dev.twitch.tv/docs/api/reference/search, 2026-11-25). Signed out: anonymous GQL `searchFor(userQuery, platform:"web") { channels { edges { item { ... on User { login displayName stream{viewersCount title game{displayName}} lastBroadcast{startedAt title} } } } } }` (run live 2026-11-25: 10 results, viewer counts on live ones, lastBroadcast on all 10). A failed part loses only what it carried (C5); a failed search adds nothing. Nothing else is requested for O.
- **R12 Messages:**

  | Message | Direction | Payload | When |
  |---|---|---|---|
  | `open-query` | page → global | `{text}` | every input (existing) |
  | `suggestions` | global → page | `{text, rows}` | Y for a text (existing) |
  | `suggestions-search-pending` | global → page | `{text, pending}` | when a request starts (`true`) and ends (`false`) |
  | `suggestions-search` | global → page | `{text, known:[row], others:[row]}` | once per settled text passing R3, from the answer or the cache |

  Rows keep the existing shape (provider, login, displayName, live, details). `suggestions-status` (C7) still covers Y's own rows only (≤50); `known` and `others` rows carry their status and details and are not updated later.
- **R13 What the frames bind:** row content and layout, group order, the hairline (drawn only when both groups show), offline rows dimmed as drawn (name and avatar), live first. Not bound: offline order inside Y (G4: newest first), the made-up data; rows with unknown status are not dimmed.
- **R14 Privacy:** PRIVACY.md gains: typed text that passes R3/R4 goes to api.twitch.tv (signed in) or gql.twitch.tv (signed out).
- **Native proof (after the build):** N1 a real channel you don't follow appears under the hairline with live data, signed in and out; N2 a pasted URL makes no search request (QA log); N3 Return straight after typing a full login opens that channel; N4 VoiceOver hears the two group names; N5 the spinner while searching (if observable). The backend build waits for follows to load natively once (advisor, 2026-11-25).
- **Rev 2 decisions on the test writer's questions (lead, 2026-11-25):** its readings are adopted as stated, except: **R6** old O rows (and appended known rows) go at the keystroke (`onInput`), not when the new Y list is drawn, so no stale result is ever selectable. **R9** the spinner is an element `#search-pending`, `hidden` when no request is out; while one is, the listbox carries `aria-busy="true"`. **G8/test 6/G4** are amended as the writer listed: no request before 250 ms; nothing ever for R4 text; Helix `/streams` and GQL may name logins from a search answer.
- **Follow-up (review of the removal, MINOR):** one test should run a real validate that returns userID and scopes and check that `auth-ready` to players is exactly {token, login, clientID}; the removed D1 test was the only one doing so.
- **Rev 2 test choices adopted (lead, 2026-11-25):** the test writer's choices for page hooks (hairline as a non-option node with `role=separator`, `HR` or a hairline/separator/divider class; dimmed rows by a `dim`/`dimmed`/`offline` class; group names by `aria-label`/`aria-labelledby`), inline `details` on `known`/`others` rows, signed-in `/streams` only for live search results, Helix `is_live` kept when `/streams` fails, `pending:false` after a failure, no pending messages on a cache hit, exact match leading O, the 10-row cut after ordering, and R8's "nothing re-sent for the same text" are adopted. Tests at 020d276 on feat/74-search.
- **Rev 2 build notes (lead, 2026-11-25 03:10):** the page builder (cbbbd9b) chose, beyond R13, that a selected offline row is drawn undimmed and that dimming is off under Increase Contrast; adopted as the lead's decision (R13 bound only rows as drawn, and the mock draws no selected offline row). It also added two guards no test pins: with Y empty, an O answer arriving while a typed submit is pending (or the broadcasts list shows) selects nothing; and late follows re-sent for the same text go below known rows. Tests for both, a page-side R8 test, and the auth-ready payload follow-up are next.
