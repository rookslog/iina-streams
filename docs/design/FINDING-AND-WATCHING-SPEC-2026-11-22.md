# Finding and watching: end-state spec and phasing (2026-11-22)

**Status: proposal.** Nothing here is approved or built unless a line says so. This is the entry point for "how a viewer finds something and watches it" in IINA Streams: the end-state product, the ranking, where each piece of data comes from, the build phases, and a proposed fit onto the releases. The research lives in the files it links; this page doesn't repeat it.

Written by a Claude agent (Opus 5.5, high effort as requested by the lead), in answer to the operator's 2026-11-22 question: "Is there a design doc that lays out the whole proposal and specifications?" Started 21:05 EST, finished 21:12 EST (both from `date` on this Mac). This spec cites answers stamped ~21:30 and 21:45 in WAITING, later than that clock; the clocks disagree, cause unconfirmed. No code changed, nothing committed, no `gh` call made.

**Labels.**
- **READ** means a file or page was read for this spec; the path or URL follows.
- **CODE** means a line of this repository, at `beta` commit `f8f13a6`, given as `path:line` plus the symbol, so the reference survives line drift.
- **INFERRED** means my reasoning; nobody ran it.
- **UNCHECKED** means nobody has looked yet.

**Terms.**
- **Helix** is Twitch's documented API (`api.twitch.tv/helix`).
- **GQL** is the undocumented interface twitch.tv's own pages call (`gql.twitch.tv`).
- **Frecency** is a score that combines how often and how recently a viewer opened someone.
- **Adoption** (#35) is Streams taking over a window that IINA opened itself, for example from the browser.
- **People** is Streams' local list of the creators a viewer watches.
- **J-numbers** are the user journeys in `docs/design/USER-JOURNEYS-2026-11-22.md`. J1–J10 are approved (D-026); J11–J19 are proposed, not approved.
- **W-numbers** are items in `docs/WAITING.md`; **D-numbers** are entries in `docs/DECISIONS.md`.

## 1. Purpose and status

> **Decided 2026-11-22, 21:25:** W-9 became D-034 (documented API first; the internal interface, used anonymously, where the documented API can't deliver; new uses allowed). Read each "depends on W-9" row with that rule. W-11 became D-035 (option A, with the 6-hour flip), and W-10 Impeccable was approved (detector first, project-only install, no hook).

**Decided** (READ: `docs/WAITING.md`, Answered, W-8; `docs/design/DISCOVERY-AND-PLATFORMS-2026-11-22.md` §7–§8):
- **People first** (W-8, answer A). Streams' own ranking decides the order. In the operator's words: "maybe we can have our own kind of customized sort of algorithm".
- **Signing in supplements, never degrades.** "logging in should give us better recommendations, not worse." Twitch's data is an extra input to Streams' ranking, not a replacement for it.
- **No sponsored ordering.** "I don't want sponsored live channels."
- **Signed in is the default experience.** Signed-out viewers get suggestions from local history.
- **Saved preferences stay on the Mac.** That covers pins, hides, per-channel settings and watch history. Anything that would leave the Mac is opt-in, and none is planned.
- **Two ways in:** "I know who" (typing) and "show me what's on" (exploring).
- **J1–J10** are approved journeys (D-026).

**Open:**
- **W-9: which interface new Twitch features may use.** "Keep today's GQL uses and add no new ones" is the lead's *recommendation* (WAITING W-9; DISCOVERY §6, amendment of ~21:15), not a decision. §4 marks each row the answer would flip.
- **W-10: whether to use Impeccable** (a third-party design-review tool) in §7's review step.
- **The release mapping** in §6, drafted as W-11 for the lead to paste into WAITING.
- **J11–J19.** Several surfaces below serve unapproved journeys. §6's cascade includes approving them.

## 2. The end-state product

These are the six surfaces a viewer meets, in the order they would usually meet them. "Serves" names the journeys. "Today" says what exists at `f8f13a6`.

### 2.1 Open Stream, with suggestions as you type ("I know who")
- **Serves:** J2 (the daily viewer asking who's live), J4 (the catch-up viewer who missed a stream), J10 (keyboard and VoiceOver use), J1 (a stranger's first stream).
- **Today:** a standalone window opened from global (CODE `global.js:213`, `listen(openWindow,'standaloneWindow','open-stream',…)`). An offline channel shows its recent broadcasts (CODE `ui/open.js:33`, `onOfflineVods`). There are no suggestions; a bare name parses as a Twitch live channel (READ: DISCOVERY §2.1).
- **The viewer can:**
  - type one or two letters and see their People ranked by §3, each with a live dot;
  - press Return to open the top match with chat;
  - see remote matches arrive below the local ones without reordering the row under the pointer;
  - open an offline match's recent broadcast directly from the list;
  - paste any URL, as today.

### 2.2 The People screen ("show me what's on")
- **Serves:** J2, J4, J12 (the long-VOD viewer, unapproved: "continue watching"), J17 (the viewer who wants to know when someone goes live, unapproved: live-while-open notices and schedules).
- **Today:** nothing.
- **The viewer can:**
  - see **live now**: People who are live, ranked by §3, with viewers shown beside each name;
  - see **new and unfinished**: People with VODs since they last watched, and VODs they started;
  - see **everyone else**: offline People, each with a "last streamed" date;
  - see **popular now** (signed in): a short shelf, ranked last (READ: DISCOVERY §1);
  - later, browse **by category**, which D-026 currently excludes (§6);
  - pin, hide or open anyone from any row.

  It is the opening view of Open Stream, not a separate app. The typing box stays the fastest path (READ: DISCOVERY §7 item 2).

### 2.3 Listening mode
- **Serves:** J11 (the background listener who plays a stream while working in other apps; the operator's own habit; unapproved).
- **Today:** "Audio only" is in the quality list (CODE `src/resolve.js:18`, `AUDIO_ONLY`). Nothing else adapts.
- **The viewer can:** switch to audio only with a small or hidden window and optional chat, and have Streams remember that choice per channel.

### 2.4 Stream end and resume
- **Serves:**
  - J14 (the viewer whose live stream ends; unapproved);
  - J12 (resume a long VOD; unapproved);
  - J15 (the late joiner who wants to start from the beginning; unapproved; later).
- **Today:** no raid handling and no saved VOD position (READ: USER-JOURNEYS, the J12 and J14 rows).
- **The viewer can:**
  - at stream end: follow the raid, open the VOD of what just ended, or see who else is live;
  - reopen a VOD at the position where they stopped;
  - mark a VOD as watched.

### 2.5 History and preference controls
- **Serves:** J19 (the privacy-minded viewer; unapproved). Every ranked surface depends on these controls.
- **Today:** no watch history is recorded (READ: DISCOVERY §7 item 1, grep of `src/`, `global.js` and `ui/`).
- **The viewer can:**
  - pause history;
  - delete everything (forgetting one person comes with the People screen, #76: PRODUCT.md's exclusion record of 2026-11-24);
  - pin and hide people;
  - set per-channel preferences: listening mode, chat placement and quality.

  All of it is local (READ: DISCOVERY §8). The controls ship with history, not after it (READ: USER-JOURNEYS, the J19 row).

### 2.6 Later: other platforms, creator records, multi-source chat
- **Serves:** J9 (multi-platform and multi-account viewers), and J16 (multi-view, unapproved).
- **The viewer can:**
  - add YouTube (and Kick, if spike #40 finds a route) accounts to one **creator** record, so a person is one row wherever they stream (READ: DISCOVERY §2.6);
  - see "live anywhere" for that person;
  - read several chats in one column, with a platform mark and an on/off switch per source (READ: DISCOVERY §2.7).

## 3. The ranking model

INFERRED design, from the operator's directions (READ: DISCOVERY §7 item 1, §8).

| Input | Where it comes from | Needs sign-in? | Role |
| --- | --- | --- | --- |
| Open history (frecency) | Local, recorded from phase 1 | No | The main sort key within a section; it grows stronger with use |
| Pins and hides | Local | No | Pins go first within their section. Hides remove the person everywhere except typed search |
| Live status | Helix when signed in; signed out depends on W-9 (§4) | Partly | Splits **live now** from the rest |
| New VODs since last watched | VOD lists plus the local last-watched time | Partly | Orders the **new and unfinished** section; a tie-breaker elsewhere |
| Follows | Helix, `user:read:follows` | Yes | Adds people who aren't in history yet |
| Follow date | Helix Get Followed Channels | Yes | Tie-breaker. It also orders a new viewer's list before any history exists (a question for the design brief) |
| Viewer count | Helix or GQL stream data | Partly | **Shown, never a sort key** (READ: DISCOVERY §7) |
| Sponsored or paid placement | none | — | **Not an input.** Helix exposes none, and Streams adds none (INFERRED) |

**What signing in adds:**
- follows and follow dates;
- live status for everyone, through Helix Get Streams;
- remote search;
- popular now;
- categories, later.

**"Better, never worse," as a testable invariant** (INFERRED; proposed for the tests in phase 3):
- the signed-in candidate set contains the signed-out one;
- for two people who are both in local history and in the same live state, signing in never reverses their order.

**Each row explains itself on demand.** The reason ("you watch most evenings", "new VOD since Tuesday", "followed last week") shows in a tooltip and VoiceOver label, not as permanent text (READ: memory `minimize-ui-text`; the #9 text rule in USER-JOURNEYS).

## 4. Data sources

> **Decided 2026-11-22, 21:25:** W-9 became D-034 (documented API first; the internal interface, used anonymously, where the documented API can't deliver; new uses allowed). Read each "depends on W-9" row with that rule. W-11 became D-035 (option A, with the 6-hour flip), and W-10 Impeccable was approved (detector first, project-only install, no hook).

The class is one of: **documented** (Helix), **GQL**, **local**, or **other platform**. A row marked **W-9** changes with the answer, and the W-9 option that flips it is named (option names from `docs/WAITING.md` W-9).

| Feature | Class | Permission or scope | Status (`f8f13a6`) | Note |
| --- | --- | --- | --- | --- |
| Playback, live and VOD | GQL `PlaybackAccessToken` | none; twitch.tv's public client ID | **exists** (CODE `src/twitch-playback.js:137`) | In W-9's scope. Every W-9 option keeps it, since nothing documented replaces it |
| VOD chat replay | GQL `VideoCommentsByOffsetOrCursor` | none | **exists** (CODE `helpers/acquire.py:439`; #26, the backlog issue on this undocumented query) | In W-9's scope; no option drops it |
| Offline channel's recent broadcasts (#32) | GQL `user.videos` today; Helix Get Videos is the alternative | none (GQL); user token (Helix) | **exists** as GQL (CODE `src/twitch-vods.js:13`; D-030, awaiting the operator's confirmation in #49); Helix **half-built** (CODE `src/twitch-helix.js:273`, `recentVODs`) | **W-9:** "also move VOD lists" switches it to Helix, signed-in only |
| Open history | local | none | **new** | Storage location and owning process UNCHECKED (phase 1) |
| Pins, hides, per-channel preferences | local | none | **new** | |
| Suggestions, local part | local | none | **new** | |
| Suggestions, remote, signed in | documented: Helix Search Channels | no scope listed (READ: https://dev.twitch.tv/docs/api/reference/search#search-channels) | **new** | Whether today's `chat:read` token works is UNCHECKED (phase 2) |
| Suggestions, remote, signed out | GQL `SearchTray_SearchSuggestions`, or none | none | **new** | **W-9:** "keep, no new" and "move VOD lists" mean none (local only); "no limit" allows GQL after a one-request probe, which goes beyond §1's "signed out gets local history" |
| Live follows | documented: Get Followed Streams | `user:read:follows` | **half-built** (CODE `src/twitch-helix.js:224`, `followedLive`; no caller found in `global.js` or `src/*.js`) | `ui/` not searched |
| All follows, with follow date | documented: Get Followed Channels | `user:read:follows` | **new** | Has no live field, so it is joined with Get Streams (READ: DISCOVERY §2.2) |
| Live status of People, signed in | documented: Get Streams by login | any user token | **new** | |
| Live status of People, signed out | GQL, or none | none | **new** | **W-9:** with no new uses, signed-out People rows show no live dot; "no limit" allows GQL |
| New VODs since last watched | the VOD-list rows above, plus local last-watched | as those rows | **half-built** (both fetchers exist) | Signed out, **W-9** as for recent broadcasts |
| Popular now, signed in | documented: Get Streams, unfiltered | any user token | **new** | |
| Popular now, signed out | GQL, or absent | none | **new** | **W-9:** absent under every option except "no limit" |
| By category | documented: Get Streams `game_id` filter; the category list's source is unread | UNCHECKED | **new** | Excluded by D-026 (§6) |
| Stream end (raid, ended) | Twitch chat notices, probably | UNCHECKED | **new** | Source UNCHECKED; not in any research read |
| VOD resume position | local | none | **new** | IINA's own resume UNCHECKED (phase 5) |
| Listening mode | local, plus the existing audio-only variant | none | **half-built** (CODE `src/resolve.js:18`) | |
| Live-while-open notices and schedules (J17) | Helix schedule endpoint, page unread | UNCHECKED | **new** | Waits on J17's approval |
| Browser hand-off | IINA's "Open in IINA" extension, then adoption (#35) | none | **exists**, off by default (CODE `src/player.js:162`, `adoptNativeWindows`; D-033) | Hand-off from the extension is UNCHECKED (phase 1) |
| Send chat (0.7.0, #3) | documented: a chat write scope | write-scope name UNCHECKED | **new** | A second re-sign-in (phase 3) |
| YouTube live status and chat | other platform: Data API key, or yt-dlp `/live` | Google project quota | **new**; spike #39 | READ: DISCOVERY §2.4 |
| Kick | other platform | a client secret, so a hosted relay | **new**; spike #40 | READ: DISCOVERY §2.5 |
| Creator records, multi-source chat | local, plus per-provider adapters | per provider | **new** | READ: DISCOVERY §2.6, §2.7, §4 |

**Out under every option:**
- Twitch's own personalised sidebar order: it needs a first-party token or GQL, and no source shows the order is reachable (READ: `docs/design/TWITCH-FOLLOWS-BEYOND-DOCS-2026-11-22.md`, the Recommendation section);
- reading browser cookies (READ: DISCOVERY §2.3).

## 5. Phases, in dependency order

Each phase ends with something a viewer can do in native IINA. "Rests on" names the one unchecked fact that phase depends on most.

**Phase 1: local history and its controls.** Serves J2 and J19.
- **The viewer can:** see what they opened before, in Open Stream; pause history; delete everything; pin and hide. Forgetting one person moved to #76 (exclusion record in PRODUCT.md, 2026-11-24).
- **Depends on:** adoption (#35) switched on for the proof step. It is off by default in 0.5.5 (D-033) and has two open bugs (READ: DISCOVERY §7 item 4).
- **Permission:** none.
- **Rests on:** that the "Open in IINA" extension's hand-off reaches adoption (INFERRED: DISCOVERY §7 item 4). If it doesn't, browser-first opens (J3) never reach history, and the ranking undercounts them. Also UNCHECKED, my addition: where history persists, and whether global or each player window owns it.
- **Native-IINA proof:**
  1. open three channels, one of them from Safari through the extension with adoption on;
  2. quit and reopen IINA, and see all three in order;
  3. ~~forget one, and see it gone after another restart~~ (moved to #76); instead, Clear, and see the list empty after another restart.

**Phase 2: suggestions as you type.** Serves J2, J4 and J10.
- **The viewer can:** type "oh" and get their most-watched match first, with a live dot when signed in, and remote matches below.
- **Depends on:** phase 1.
- **Permission:** today's `chat:read` sign-in, for the remote matches.
- **Rests on:** that the `chat:read` token works for Helix Search Channels. The reference lists no scope; nobody has tried it (READ: DISCOVERY §2.1). One signed-in request, made with the operator's grant, would settle it.
- **Native-IINA proof:** type two letters with VoiceOver on, hear the top match, press Return, and see the stream play with chat. Then repeat signed out, with local matches only.

**Phase 3: follows and the re-sign-in** (#30). Serves J2.
- **The viewer can:** see followed channels, live and offline, merged into People by §3.
- **Depends on:** phase 1 (it can run beside phase 2), and the §3 invariant tests.
- **Permission:** `user:read:follows`.
- **Rests on:** that #30 forces every signed-in viewer to sign in again.
  - The CODE part: `src/auth.js:2` (`SCOPE='chat:read'`), and `src/auth.js:66` in `validate`, which rejects any token whose scope list is not exactly that one.
  - The INFERRED part: an old grant can't gain a scope.
  - Sending chat in 0.7.0 needs a write scope, so a second re-sign-in follows unless it is requested now. Requesting it now goes against least privilege (READ: DISCOVERY §5, the 0.7.0 row).
- **Native-IINA proof:**
  1. the operator, present, signs in at twitch.tv/activate;
  2. Following shows their live follows;
  3. an old `chat:read` token produces one clear "sign in again" state, not a silent failure.

**Phase 4: the People screen.** Serves J2, J4, and J12 or J17 if approved.
- **The viewer can:** open Open Stream and see live now, new and unfinished, everyone else, and popular now.
- **Depends on:** phases 1–3, #32 (exists), and the 0.6.0 overhaul direction (#20).
- **Permission:** as phase 3.
- **Rests on:** that Open Stream's layout is chosen first: a quick list (direction A) or a thumbnail grid (direction B) (READ: `docs/design/overhaul-2026-11-22/README.md`, Comparison). D-028 settled side-chat placement, not this; no entry in `docs/DECISIONS.md` picks it (grep, 21:12). Also UNCHECKED: where the category list comes from.
- **Native-IINA proof:** with five People in mixed states, every row's reason reads correctly on hover and in VoiceOver, and opening a live row and an offline VOD row both play with chat.

**Phase 5: listening, resume, stream end.** Serves J11, J12 and J14, all unapproved.
- **The viewer can:**
  - listen to a channel audio-only, remembered for next time;
  - reopen a VOD where they stopped;
  - choose what to do when a stream ends.
- **Depends on:** phase 1 for per-channel preferences and last position; phase 4 for "continue watching" and "who else is live".
- **Permission:** none new.
- **Rests on:** that IINA's own resume misses VODs, because each VOD address is signed and changes (UNCHECKED: USER-JOURNEYS, the J12 row). If IINA's resume does catch them, resume is mostly free. Also UNCHECKED: how a raid or a stream's end is signalled.
- **Native-IINA proof:**
  1. stop an 8-hour VOD at 2:10:00, quit IINA, reopen it from People, and see it resume at about 2:10:00 with chat aligned;
  2. watch a live stream end, and see the end-of-stream choice.

**Phase 6: other platforms.** Serves J9, and J16 if approved.
- **The viewer can:** link a creator's YouTube channel to their Twitch channel, see "live anywhere", and read both chats in one column.
- **Depends on:** phases 1–4, accounts (#6), providers (#19), and spikes #39 and #40.
- **Permission:** a Google project key or OAuth; Kick needs a relay.
- **Rests on:** these UNCHECKED facts, all mine:
  - the wording of YouTube developer policy III.E.4.h, which governs showing YouTube API data beside other platforms' data;
  - how `liveChatMessages.streamList` is billed;
  - Kick's secret-only token grants, which make a hosted relay necessary (READ: DISCOVERY §2.4, §2.5).
- **Native-IINA proof:** one YouTube live stream and one Twitch stream by the same creator, each with its own chat, in one column, each source marked.

## 6. Proposed release mapping

"Already holds" is READ from `docs/ROADMAP.md`. "Adds" is my proposal.

| Release | Already holds | Adds from this spec | Re-sign-ins |
| --- | --- | --- | --- |
| **0.5.6** "Find what to watch" | Following #30, offline VOD picker #32, open from the browser #35, emotes and badges #34 | Phase 1 (history and controls), phase 2 (suggestions), phase 3 (which is #30) | One (#30) |
| **0.6.0** public launch | Overhaul #20 (panel), #1 (overlay), #18 (pointer tests); out of the box #36 and spike #37; launch kit #38 | Phase 4 (People screen, inside #20); listening mode from phase 5, which is small because audio-only exists | none |
| **0.7.0** "Talk back" | Send chat #3, third-party emotes #29 | Phase 5's resume and stream end | One (write scope) |
| **0.8.0** platforms and accounts | Accounts #6, multi-provider #19, spikes #39 and #40 | Phase 6 | per provider |
| **Later** | Backlog | Category browsing, J13 (the skimmer), J15 (the late joiner), J16 (multi-view), J17 (notices), browser-history import, a Streams browser extension | — |

**Conflicts to settle:**
- **D-026's timeline is already past.** D-026 said 0.6.0 would launch "tonight" (READ: `docs/DECISIONS.md` D-026; USER-JOURNEYS, Status). Yet 0.5.5 is untagged: `git tag` lists nothing after `v0.5.4`, while `Info.json` says `0.5.5`, and W-1 to W-3 (soak, log signatures, release) are open. This mapping therefore proposes an order, not dates.
- **D-026 excludes "category browsing and search"** (READ: USER-JOURNEYS, Not in scope). Phase 2 is search. The proposal removes "search" from that list and keeps category browsing out until after launch. The operator's later direction lists "by game or category" (READ: DISCOVERY §7 item 2), so this item is theirs to settle.
- **0.5.6 grows.** Phases 1–2 are new issues on top of four.
- **Unapproved journeys.** The mapping relies on J11, J12, J14 and J19.
- **Journey fit moves.** USER-JOURNEYS' Fit column puts J12 and J14 at 0.6.0 and J17 at 0.6.0–0.8.0; this mapping moves J12 and J14 to 0.7.0 and J17 to later, to keep the launch small.
- **J18** (subscriber and Turbo benefits) is outside this spec and keeps its own Fit.

**The full cascade if the operator accepts.** The lead executes all of it [per: propagation]:
- **`docs/ROADMAP.md`:**
  - the 0.5.6 row gains the new history-and-controls and suggestions issues;
  - the 0.6.0 row gains the People screen (as a sub-issue of #20) and listening mode;
  - the 0.7.0 row gains resume and stream end;
  - the 0.8.0 row gains creator records and multi-source chat, as sub-issues of #19;
  - the backlog line gains category browsing, J13, J15, J16 and J17.
- **GitHub milestones 3–6:** new issues, numbers unassigned:
  - history and controls;
  - suggestions as you type;
  - the People screen;
  - listening mode;
  - VOD resume;
  - stream end;
  - creator records;
  - multi-source chat.

  The five backlog items above also need issues under ROADMAP's own rule; they stay unfiled until then. #30's body gains the re-sign-in note, and #20's body gains the People screen.
- **`docs/design/USER-JOURNEYS-2026-11-22.md`:**
  - J11, J12, J14 and J19 move to approved;
  - J13, J15, J16 and J17 stay proposed, marked "later";
  - "search" leaves Not in scope;
  - the Fit column for J12, J14 and J17 changes as above;
  - the Status line's timeline is replaced by a pointer to this spec.
- **`docs/DECISIONS.md`:** a new D-034 (free: the last entry is D-033, grep 21:12) records the mapping and amends D-026, with both ends of the link updated.
- **`docs/design/DISCOVERY-AND-PLATFORMS-2026-11-22.md` §5:** a note that this spec's §6 supersedes it.
- **`docs/WAITING.md`:** W-11 moves to Answered.
- **This spec:** the status line, set to the approved state.

### Draft WAITING item (for the lead to paste)

```markdown
### W-11. Fit the finding-and-watching work onto the releases
- **What it is:** where history, suggestions as you type, the People screen, listening, resume and stream end go among 0.5.6–0.8.0. It's yours because it trades launch scope against what a stranger finds on day one, and because it approves journeys J11 (background listening), J12 (long VODs), J14 (stream end) and J19 (history privacy), which you haven't approved yet. Full proposal: `docs/design/FINDING-AND-WATCHING-SPEC-2026-11-22.md` §6.
- **How it arose:** you asked on 2026-11-22 for the whole proposal, phased alongside the releases.
- **Options:**

  | Option | What it buys | What it costs |
  | --- | --- | --- |
  | **A. Spec mapping:** history and suggestions in 0.5.6; People screen and listening in 0.6.0; resume and stream end in 0.7.0; platforms in 0.8.0 | Typing names, your main complaint, is fixed before launch; launch screenshots show the People screen; ranking has history by launch day | 0.5.6 grows by two issues; two re-sign-ins (0.5.6, 0.7.0) |
  | **B. People screen after launch:** history and suggestions in 0.5.6; People screen in 0.7.0 | Smaller launch overhaul | The overhaul is designed twice; launch shows no "what's on" view |
  | **C. Ask for the write scope in 0.5.6** too, on top of A | One re-sign-in instead of two | Asks for a write permission a release before anything uses it |
  | **D. Keep ROADMAP as is:** 0.5.6 keeps only the Following list (#30), the offline VOD picker (#32), opening from the browser (#35) and emotes (#34); everything else unscheduled | No scope growth | No history, so no ranking data when People ships; typing whole names stays at launch |

- **Recommendation:** A. History has to start recording before ranking can use it, and suggestions are small once history exists; the People screen belongs in the overhaul because the overhaul designs every surface at once (D-026).
- **What it rests on:** history and suggestions are small enough to land in 0.5.6 without pushing the 0.6.0 launch back, because the Helix client and the Open Stream window already exist. Inferred; nobody has sized the two new issues.
- **What would flip it:** if sizing the two issues shows they'd delay the launch, choose B and ship suggestions alone in 0.5.6. If you'd rather sign in once than keep least privilege, choose C. Test: the lead sizes both issues from their tests before 0.5.6 starts.
- **What your answer changes:** ROADMAP rows 0.5.6–0.8.0, eight new issues (five backlog ones later), J11/J12/J14/J19 status, D-026's not-in-scope line (search), and a new D-034.
```

## 7. Design process

1. **One brief per surface** (§2.1–§2.5), written by the lead. Each brief states:
   - the journeys served, glossed;
   - the §3 inputs it shows;
   - its states: signed in, signed out, empty, loading, error, and live and offline rows;
   - what the viewer must be able to do with the keyboard and VoiceOver (J10).

   One shared brief defines the **People row** (name, live dot, viewers, reason on demand), so Open Stream and the People screen don't invent two different rows (INFERRED).
2. **One designer subagent per surface.** Each writes only its own folder, `docs/design/finding-2026-11-22/<surface>/`, containing two HTML mock directions and a README, in the shape of `docs/design/overhaul-2026-11-22/`.
   - Design Open Stream and the People row first; the People screen builds on them.
   - Listening and stream end can run in parallel.
   - At most 4 agents at once (the lead's brief for this spec; memory `delegation-pipeline-tests-first` allows 4–5). No two agents write a shared file (AGENTS.md).
3. **Independent review** of each surface's mocks by a reviewer who didn't design them, using `.agents/skills/streams-interaction-design/SKILL.md`. Add Impeccable's `critique` only if W-10 is approved.
4. **The operator picks one direction per surface.**
5. **Build:**
   1. the lead designs tests;
   2. Codex writes them;
   3. an implementer builds against them;
   4. the lead reviews (READ: memory `delegation-pipeline-tests-first`);
   5. multi-round review follows `docs/REVIEW.md` (D-032).
6. **Native IINA check:** the lead holds the single IINA testing slot and runs the phase's proof from §5. It is recorded with what was not tested.
