# Waiting on the operator

Each item is written once, in full, here. Chat links to an item's line instead of repeating it. When an item is answered, its answer is recorded under it and it moves to **Answered**. Last updated 2026-11-24 15:50.

**Night run 2026-11-24 (operator asleep):** all work is on branch `next`, which starts at `beta`'s tip (3ec70d8) and adds to it; the main checkout now sits on `next`. `beta` is frozen as your daily copy, and the installed Streams Beta is not refreshed. Each finished version will wait on its own release branch with a one-command release written here. Nothing is tagged, released or posted. If you'd rather have it all on `beta`, it's one fast-forward: `git switch beta && git merge --ff-only next`. Run plan: `.kickoff.json` (local).

## Open

### W-1. Watch-test the 0.5.5 build before release (the "soak")
- **What it is:** watch Twitch with chat in IINA for about 3 hours in total, using **Streams Beta**. That's the copy switched on in IINA → Settings → Plugins. It now holds `0.5.5-beta+g0805b780`, a build of today's `beta` branch: everything in 0.5.5, plus the 0.5.6 work in progress (chat beside the video, the offline-channel page). A clean soak on it covers the 0.5.5 code too, because `beta` contains all of it; a crash could come from 0.5.6-only code. If IINA doesn't crash, the crash fix probably works.
- **How it arose:** IINA crashed three times today, after 31, 43 and 65 minutes of ordinary viewing (#60). The 0.5.5 build holds chat's message listeners so IINA can't lose them, which is one of two suspected causes. Our tests can't reproduce the crash, so only real viewing can show whether the fix works.
- **Options:**
  - about 3 h before tagging;
  - 1 h;
  - none (tag after the IINA checks in W-3).
- **Recommendation:** about 3 h. Before the fix, three crash-free hours would happen by chance only about 2% of the time (a rough estimate from three samples).
- **What your answer changes:** whether the release (W-3) waits for your viewing.
- **If it crashes:** tell the lead roughly when you started watching. Streams' diagnostics file records an ID for each plugin start, which shows whether the plugin had been torn down.

### W-2. Signed stream addresses in IINA's debug log (#57)
- **What it is:** when Streams hands IINA a Twitch stream, IINA 1.5.1 writes the stream's address into its own log. The address carries a time-limited access signature, and IINA writes this line only at debug level. Streams can't stop IINA from logging it.
- **How it arose:** found during the 0.5.5 review. 0.5.4 behaves the same way. Issue: https://github.com/rookslog/iina-streams/issues/57
- **Options:**
  - **accept for 0.5.5:** same as 0.5.4. IINA's file logging is off on this Mac, checked today with `defaults read`;
  - **hold the release** until there's a workaround.
- **Recommendation:** accept. It isn't new in 0.5.5, logging is off by default, and the signature expires (how fast is unchecked).
- **What your answer changes:** whether the release (W-3) is blocked.

### W-3. Release 0.5.5
- **What it is:** tag `v0.5.5`. GitHub then publishes the release, and anyone who installed Streams from GitHub gets an update offer in IINA.
- **How it arose:** the 0.5.5 code is finished and passed its final review: [docs/reviews/2026-11-22-v0.5.5-release-review.md](reviews/2026-11-22-v0.5.5-release-review.md), sections "Clearance 2" and "Narrow check".
- **Still to do first:**
  - the IINA checks listed in the same review file, under "Native acceptance for 0.5.5";
  - W-1;
  - W-2.
- **Recommendation:** release once those are done. Steps are in [docs/RELEASE.md](RELEASE.md), "Releasing vX.Y.Z".
- **What your answer changes:** a public release; this one is yours alone.

### W-4. Report IINA's crash bug to the IINA project
- **What it is:** a public GitHub issue on IINA's repository, under your account. It shows that IINA crashes when a plugin page messages a listener it has lost, and gives the one-line fix.
- **How it arose:** research for #60 found the missing check in IINA's own source (`JavascriptMessageHub.swift`, lines 64 and 94). The draft is at `/private/tmp/claude-501/-Users-rookslog-Development-iina-streams/4aa00c72-182b-4323-9888-04796f3ca308/scratchpad/iina-upstream-draft.md`, which is temporary and lost on reboot. The lead copies it into the repo if you want it kept.
- **Options:**
  - post now;
  - post after the soak shows which cause it is;
  - don't post.
- **Recommendation:** post now. The missing check is visible in IINA's source whatever our diagnosis turns out to be.
- **What your answer changes:** a public post under your name.

### W-5. A separate test account so the lead's tests never touch your IINA
- **What it is:** a second macOS user on this Mac, where the lead runs IINA tests over ssh. Your IINA, plugin switches and Twitch sign-in are never touched, and a test crash can't kill your stream.
- **How it arose:** today you had to hand IINA over, and switch plugins by hand, for every test. Scoping: [docs/design/TEST-MACHINE-2026-11-22.md](design/TEST-MACHINE-2026-11-22.md).
- **What it needs from you:** about 15 minutes. Your admin password to create the user, one login as that user, and later a Twitch sign-in for it.
- **Recommendation:** before the 0.6.0 Reddit launch, not tonight.
- **What your answer changes:** whether native testing stops interrupting you.

### W-6. The stop gate runs twice every turn
- **What it is:** the "STOP GATE" check is registered twice: once in `~/.claude/settings.json` (lines 210 and 305) and once by the stop-rule plugin. You see its message twice, and its log has double-counted since Aug 23.
- **Options:**
  - **the gate ignores its second run:** a code change, with your OK;
  - **remove the settings copy:** you run one command, with a backup;
  - **leave it.**
- **Recommendation:** the gate ignores its second run. It stays correct whichever copies a session loads. The lead's attempt to edit settings was blocked by Claude Code's permission check, so this needs your yes.
- **What your answer changes:** the doubled messages, and the gate's log counts.

### W-7. Output style: trial a revised style in two projects
- **What it is:** the review session found that the global "scan-first" style **isn't loaded** (checked 2026-11-22; whether it ever loaded before is unchecked, so not "never"). Settings ask for `scan-first`, but the style file is named `Scan-first`, and style names are case-sensitive. So tonight's unexplained lists came from habit, not from the style.
- **The proposal:** [docs/design/OUTPUT-STYLE-PROPOSAL-2026-11-22.md](design/OUTPUT-STYLE-PROPOSAL-2026-11-22.md). Its decisions start at "Decisions for you":
  - **D1, answered:** see the update below;
  - **D2:** leave the inactive global setting alone until the trial ends (recommended), fix its letter case now, or remove it;
  - **D3:** your global decision rule asks for all five decision points in chat when a decision is asked, which you rejected on 2026-11-22. I recommend amending it to one line plus a link to the waiting entry.
- **What your answer changes:** how replies read to you in those two projects for a week, and later everywhere.
- **Updates:**
  - 2026-11-22 22:25 EST: D1 answered, "Yes, switch the trial on." The draft style is installed as local, uncommitted files in both projects, and a fresh session in each quoted it back. It reaches a lead only after a restart.
  - 2026-11-23: still waiting on you:
    - **restart** the IINA Streams and sonic-affinity-lab leads, so the style takes effect;
    - **yes or no to a transcript survey**: count your confused or frustrated messages, reported or not, from the last month's transcripts (about 520,000 tokens of agent reading);
    - **yes or no to a first plugin build**: auto-linking plus a `/waiting` command, proposal section 6;
    - **D3** above.
  - 2026-11-23: a link test in Ovis showed it resolves a link by file name. It asked which `WAITING.md` to open, this one or a worktree copy under `.claude/worktrees/`. The plugin's links will have to avoid that.

### W-13. Merge the watch-history module (#73) after its last fixes, or hold it
- **What it is:** whether the history module may merge into `beta` once its last small fixes pass their tests, or must wait for another Codex check. It's yours because our review rule (D-032 rule 4) sends any finding that survives the final review to you.
- **How it arose:** Codex's narrow check of the module, on a branch not yet in `beta`, found five small problems:
  - the visit counter isn't saved;
  - forgetting a channel trimmed on load doesn't remove it from disk;
  - an extreme visit number breaks closing visits;
  - loading a huge history file is slow;
  - one return value is inconsistent.

  Details: [docs/reviews/2026-11-22-issue-73-module-review.md](reviews/2026-11-22-issue-73-module-review.md), the "Narrow check" section at the end. The fixes are being made on the branch now.
- **Options:**

  | Option | What it buys | What it costs |
  |---|---|---|
  | **Merge once the fixes pass tests and the lead's review** | History wiring and typing suggestions (#74) can start | Nobody independent checks these last fixes |
  | **One more narrow Codex check, then merge** | An independent check of the last fixes | About 15 minutes more |
  | **Hold** until you look | Nothing changes | #73's wiring and #74 wait |
- **Recommendation:** one more narrow Codex check, then merge. It's cheap, and it keeps "the fix author never closes its own gate".
- **What it rests on:** the five findings are mechanical, not a sign the design is wrong.
- **What would flip it:** if that check finds anything new, park the module and step back on the storage design.
- **What your answer changes:** when history is wired in, and so when #74 can start.
- **Update 2026-11-23 00:07:** four narrow Codex checks later, the module is at `f3c5826` (44 module tests pass). The last check left only a test-only collision and an intended retry: nothing that would change behaviour in real use. Recommendation is now **merge**. Record: [docs/reviews/2026-11-22-issue-73-module-review.md](reviews/2026-11-22-issue-73-module-review.md), last section.

- **Update 2026-11-24 night (operator asleep):** the module is unchanged. Its wiring into the plugin was built tonight on branch `feat/73-history` (worktree `../iina-streams-wt/h73`).
  - **Built and tested:**
    - Hydrogen built rounds 1–4, and Codex rounds 5–7 while Hydrogen was out of quota (16:46 to about 19:39).
    - The tests were designed by the lead and written by Sonnet and the lead. Each round's suite passed after its fixes, and the lead's mutation checks failed tests as they should.
    - **Untested in native IINA:** the new "Watch History" submenu in the Plugin menu, and every other path. Shim only.
  - **Reviews:** two Codex reviews, both "fix first". The two findings that recurred led to a step back, which `docs/REVIEW.md` calls for at round 3. Its triage table and dispositions are in [reviews/2026-11-24-issue-73-wiring-review.md](reviews/2026-11-24-issue-73-wiring-review.md):
    - **Forget This Channel is out of 0.5.6** (decision below);
    - **cancelling follows one rule:** a check started from Open Stream acts only while that same form is still showing. This covers Cancel, the window's close button and a later form.
  - **Still owed before any release:** one clearance review by a provider other than the builder, since Codex built rounds 5–7. Gemini Hydrogen does it when its quota returns. The merge into `next` is provisional and landed at `b36f006` (rounds 1–7; 935 JS tests and 168 Python tests pass on `next`). To undo it: `git switch next && git revert -m 1 b36f006`.
  - **Decision for you: per-channel "Forget This Channel".**
    - **What it is:** whether 0.5.6 ships a way to forget one person from watch history. It's yours because it trades a privacy control against a menu that can delete the wrong person.
    - **Options:**

      | Option | What it buys | What it costs |
      |---|---|---|
      | **Defer to the People screen (#76)** (done tonight, reversible) | No wrong-person deletion; the menu stays small | No way to forget one person until #76. Pause and Clear remain. |
      | **A Forget item in each player window** | Forget one person now. IINA shows only the active window's items, so it can't hit the wrong one. | It would be the sixth item, so IINA puts it under More… (`MenuController.swift:660`). Streams windows only. A new native menu path, untested. |
      | **Keep tonight's earlier version** (global binds at menu-open) | Forget one person now, at the top of Watch History | Codex reproduced it deleting the wrong person in the shim (a local-file window; an old click). Not offered. |

    - **Recommendation:** defer to #76. The People screen names the person on screen, so there is no question of which window is meant.
    - **Rests on:** Clear and Pause covering the privacy need until #76 ships.
    - **What would flip it:** if you want per-person forgetting in 0.5.6, the per-window item under More… is next best. A few lines on the round-3 tests.
    - **Recorded in:** `PRODUCT.md` §Users, exclusion record of 2026-11-24.

### W-14. Merge the offline-channel fix (#67) with its known edge cases, or park it
- **What it is:** whether to merge the fix that checks a Twitch channel before opening a window. Offline: you get the VOD list and no window, so IINA's "Cannot open file" and login panel are gone. Four small findings remain after the final review, so our review rule (D-032 rule 4) sends it to you.
- **How it arose:** five Codex reviews tonight. The record, verbatim: [docs/reviews/2026-11-22-issue-67-review.md](reviews/2026-11-22-issue-67-review.md). Branch `fix/67-resolve-first` at `3cfe7fd`; all 846 tests pass.
- **The remaining edge cases, in plain words:**
  - an offline answer arriving at the same moment as the 1.5 s timeout opens a player instead of the VOD list, which is today's behaviour;
  - a VOD list arriving in the same instant you edit the text can overwrite your edit;
  - Codex flags that a timer is started from a network callback; IINA's own source hands timers to the main thread, so the lead reads this as safe (inferred);
  - one test helper can misattribute a timer.
- **Options:**

  | Option | What it buys | What it costs |
  |---|---|---|
  | **Merge; file the edge cases as one issue; check in IINA** | The error panel is gone for the common case now | The rare races stay until fixed |
  | **One more targeted pass first** | Fewer known edge cases | Each pass so far has surfaced new, smaller ones |
  | **Park** | No risk added to `beta` | The error panel stays |
- **Recommendation:** merge, file the edge cases, and check it in IINA when you hand it over. Every remaining case is no worse than `beta` today, and the next real evidence has to come from IINA, not another review.
- **What it rests on:** none of the edge cases can make IINA hang or crash. The timer point is the one to confirm in IINA.
- **What would flip it:** an IINA test showing a hang or crash in the offline path, which means revert and park.
- **What your answer changes:** whether the fix is in your next Streams Beta refresh.
- **Update 2026-11-24 15:40 (decided provisionally on your behalf, operator asleep):** merged into `next` on the recommendation above, as merge commit `022473b`. Both suites pass after the merge (846 and 168 tests). Not yet checked in IINA, and the edge cases are not yet filed as one issue. **Undo:** `git switch next && git revert -m 1 022473b`. Your answer still decides whether it stays.

### W-15. Grow the plan: a fuller dashboard, and a mini dashboard in the plugin sidebar (amends D-035)
- **What it is:** your 2026-11-23 ideas go beyond what D-035 mapped to releases:
  - a **dashboard** like "a miniature version of the Twitch website that's more fully featured": search across VODs, categories, live channels;
  - a **mini dashboard in the plugin sidebar**, like Twitch's own sidebar, to move to another channel or one of its VODs, search and scroll. It changes the stream in the *same* window instead of opening another.

  It's yours because it changes what 0.6.0 promises, and its order.
- **What's possible (checked):**
  - Twitch's documented API offers category search, top categories by viewers, and live streams filtered by category. None is personalised; checked against Twitch's API index only.
  - Twitch's own "recommended categories" need your twitch.tv login, which D-034 makes a separate decision.
  - "Categories you watch" can come from Streams' own history, if each visit also stores the category. Today's history design doesn't store it ([TESTS.md](design/finding-2026-11-22/history/TESTS.md), "What's stored").
  - Per W-16 (answered): the mini dashboard, VODs and quality live in the plugin sidebar, the panel that slides in over the video and is closed again, and chat leaves it.
  - **Switching streams in the same window** is exactly what D-033 switched off for 0.5.5, "a window whose player loads a different file stays inactive", because of two serious review findings. D-033 plans to restore it in 0.5.6. The sidebar's mini dashboard depends on that.
- **Options:**

  | Option | What it buys | What it costs |
  |---|---|---|
  | **Amend D-035: same-window switching first (0.5.6, as D-033 planned), then the sidebar's mini dashboard and a fuller dashboard in 0.6.0** | Switching in place, the way you watch | 0.6.0 grows; the launch moves later |
  | **Dashboard in 0.6.0 as planned; the sidebar's mini dashboard and VOD and category search after launch** | A sooner launch | You keep using Open Stream to switch until then |
  | **Defer both until after launch** | The smallest 0.6.0 | The launch shows no dashboard |
- **Recommendation:** the first option, but in order: restore same-window switching in 0.5.6 with its tests, because both the mini dashboard's channel changes and adoption need it. Store the category with each visit (a small addition before the history wiring). Design the dashboard and the sidebar's mini dashboard together in the 0.6.0 round (design under way: [plugin-sidebar/BRIEF.md](design/finding-2026-11-22/plugin-sidebar/BRIEF.md)).
- **What it rests on:** same-window switching can be made safe with the class-L rules that already passed review. Unproven until its review.
- **What would flip it:** if restoring same-window switching takes another multi-round review like tonight's, ship the dashboard first and the sidebar's channel changes after launch.
- **Naming:** "People" came from the research note's idea that a *person* is the unit across platforms. No other names were weighed. The quick list shows no label, so the name only matters for the dashboard: "Following", "Channels", "Watch" or "Browse" are alternatives.
- **What your answer changes:**
  - D-035 and the ROADMAP rows for 0.5.6 and 0.6.0;
  - #76 (People or dashboard), a new issue for the sidebar's mini dashboard, and #73's stored fields;
  - the spec, §2 and §6.
- **Update 2026-11-23:** continue watching (liked, W-17) needs each VOD you started and your position in it to be stored. Watch history (#73) stores visits per person only. Resume is #78, mapped to 0.7.0. Added question for this decision: does resume (#78) move earlier, alongside the sidebar's mini dashboard? It doesn't change the #73 merge.

### W-17. Pick a layout for the plugin sidebar's mini dashboard
- **What it is:** three rough layouts (structure only, no styling) for the plugin sidebar as a mini dashboard, from the 2026-11-23 design round ([BRIEF.md](design/finding-2026-11-22/plugin-sidebar/BRIEF.md), comparison in [README.md](design/finding-2026-11-22/plugin-sidebar/README.md)). It's yours because it's a judgment about how you use the panel.
- **Options:**

  | Option | What it buys | What it costs |
  |---|---|---|
  | **A: one list, like Twitch's sidebar** | Closest to Twitch's sidebar; one scroll; fewest new ideas | Chat and account controls sit at the bottom of a long list |
  | **B: what's playing first** | Shows at a glance what's playing and how it's set; continue watching is prominent | Quality is always on screen, which you said you don't need; the channel list starts lower |
  | **C: search and tabs** | The most to browse in 360 pt; a home for categories | Three tabs to learn, and a second place to look (the bottom strip) |
  | **Mix, or none yet** | Take pieces (for example A plus B's continue watching) | Another rough round |
- **Recommendation:** A, with B's continue-watching section added above Live.
- **What it rests on:** you open this panel mostly to switch channel or VOD, and only sometimes for quality or chat.
- **What would flip it:** if you also open it to check how the stream is set, B. If you want to browse categories here rather than in the bigger dashboard, C.
- **Also wanted:** strike any of the brief's candidates you don't want in this panel: continue watching, categories, this channel's other VODs, chat on/off and settings, account, history controls.
- **What your answer changes:** the polished design round, then the build issue for the mini dashboard.
- **Update 2026-11-23 (operator, after seeing A, B and C):**
  - likes continue watching, including VODs left half-watched long ago;
  - wants a click on a person to open a channel view in this panel (VODs, ideally with thumbnails, a search field, filter and sort) instead of a dropdown;
  - less text: "Reload stream" beside a reload button is a redundant label.

  The lead's "panel covers the chat" line was wrong: the plugin panel opens on the left, and the chat column on the right. **Next:** one revised structure (A's list, continue watching, a channel view, far less text), drawn under the text rule now in the project design skill. No pick is needed until it's ready.
- **Update 2026-11-23 02:20:** round 2 is ready: one revised layout, [revised/index.html](design/finding-2026-11-22/plugin-sidebar/revised/index.html). It has continue watching, a channel view with VOD thumbnails, VOD search, sort and filter, and far less text. Every visible string is listed with its class in [DONE.md](design/finding-2026-11-22/plugin-sidebar/DONE.md). **Needed now:** keep it, or say what to change.
- **Update 2026-11-23 (operator, on round 2):** rejected. In their words:
  - "we need a better way of splitting between live and offline";
  - "not 100% sure of showing the thumbnails in this already overcrowded space";
  - "I don't necessarily like the UI, the spacing and stuff when we click in";
  - "the search bar should be like above all the channels, because we're searching through channels in that search bar, not through VODs";
  - "maybe we put Continue Watching at the bottom";
  - "what are these… weird collapsible menus like history, forget Ohnepixel? This is all terrible."

  **Next:** an independent Impeccable critique, run as a check of the Impeccable setup too (the reviewer isn't told these complaints, to see whether the critique finds them). Then one round at real fidelity. No pick is needed until then.
- **Update 2026-11-23 02:45: the critique, as a check of the Impeccable setup.** It ran properly: two separate assessment agents, real browser inspection, and no knowledge of the operator's complaints. Score 22/40, "Acceptable"; the operator called the same page "trash". Full report: [CRITIQUE.md](design/finding-2026-11-22/plugin-sidebar/CRITIQUE.md).

  | The operator's complaint | Did the critique find it? |
  |---|---|
  | History and "Forget Ohnepixel" groups don't belong | No. It flagged only their place at the bottom; the brief had asked for them, which was the lead's error. |
  | The search field reads as VOD search | No. It found only the channel view's search problems. |
  | A better live/offline split | Barely: "the headings repeat the live dot" was a minor point. |
  | Thumbnails crowd the panel | Partly: Continue watching's thumbnails are the heaviest block. |
  | Channel view spacing | Partly: controls sit above a card they don't affect. |

  It also found things the operator didn't raise: what's playing has no home in the panel, blank empty states, a two-click switch, keyboard focus lost, and "Most viewed" against Product Principle 3. **Reading:** the critique judges against the brief, and catches generic failures but not wrong product calls the brief itself made. Fixing the inputs (PRODUCT.md, a DESIGN.md, the brief) comes before the next round.
- **Update 2026-11-23 (operator, on the comparison above):** the operator's complaints aren't the standard the critique should be scored against: "what gives my complaints authority? … I'm not sovereign." They are evidence that something is wrong, conditioned by the situation: a rough mock read as finished UI, after several misses. The lead's reading is that the complaints and the critique point at one underlying problem from two sides. The panel has no clear main job: thumbnails, settings, history and search all carry the same weight, so "switch channel" doesn't stand out. The next round answers that through hierarchy, not by moving each item where a complaint put it.
- **Update 2026-11-23 (operator: "what justifies that reading, and what other readings might we have?"):** the lead's hierarchy reading is one of several, held open:
  1. **Hierarchy:** no clear main job; everything carries the same weight. *For:* the critique found that the heaviest block isn't the main task, and "overcrowded". *Against:* the operator never said switching was hard to find.
  2. **Scope:** settings, history and account don't belong in a quick panel at all. *For:* "weird collapsible menus… terrible", and "things I want to quickly check". This means removing them, not re-weighting.
  3. **Fidelity:** a crude browser mock read as finished UI. *For:* "the spacing and stuff". A properly drawn version might be judged differently.
  4. **Trust:** reactions shaped by a run of lead errors that day (the panel's side, ads, text, who the users are). *For:* the timing. This one measures the process as much as the design.
  5. **The reference:** Twitch's sidebar was the starting point, but the goal is "beyond the browser". The reference itself may be the wrong model.
  6. **Thinking aloud:** "maybe… I don't know". The suggestions are probes, not verdicts.
  7. **About the lead:** the lead favoured reading 1 because it's a design problem it can fix, rather than reading 4, its own errors.

  **Next round:** draw it at real fidelity (tests 3). Show settings both removed from the panel and present at low weight (tests 2 against 1). Try a non-Twitch structure alongside (tests 5).

- **Update 2026-11-24, night (operator asleep): restarted, with five directions to try in use.**
  - **Why restarted:** your words to the planning lead: rounds 1 and 2 took "the most literal sort of interpretation". So I wrote down what I think you want underneath them, signed, with your words beside it: [READING.md](design/sidebar-2026-11-24/READING.md). Its section 1 lists your located faults, which every direction obeys.
  - **The five directions:** each opens in Safari as an IINA window with the panel on the left. Buttons along the top switch the width between 300 and 360 and change the state (signed out, new user, many people). The data is real public Twitch channels; the watch history is invented.

    | Direction | What it is for | What picking it would show about my reading |
    |---|---|---|
    | [R: the quiet list of people](design/sidebar-2026-11-24/r/index.html) | Get to the next person in one click, then out of the way. No headings; live above a hairline. | You want the short moment I read |
    | [P: the timeline](design/sidebar-2026-11-24/p/index.html) | Keep up with your people over time; scroll back to find a half-watched VOD | The content you want is time, not people |
    | [T: this channel](design/sidebar-2026-11-24/t/index.html) | The panel is about the stream you're in: its broadcasts, then a strip of who else is on | The panel's job is the current channel, not a directory |
    | [S: the switcher](design/sidebar-2026-11-24/s/index.html) | Press Tab over the video for a ⌘-Tab-style switcher; the panel holds only one person's broadcasts | "Beyond the browser" matters most |
    | [Q: round 2, rebuilt at the same polish](design/sidebar-2026-11-24/q/index.html) | The control: is polish alone enough? | The problem was finish and trust, not the layout |
    | **None of these** | | Next, I'd ask to watch you switch channels, rather than read more words |
  - **Judges** (theirs, not yours; both are Claude models, so their agreement isn't independent; details in [JUDGES.md](design/sidebar-2026-11-24/process/JUDGES.md)):
    - **Opus judge** (separate context; given your words, not my reading): R, T, P, S, Q.
    - **The advisor** (has read my reading): R, then P, then T, then Q, with S as an add-on.
    - **Both:** R's weak spot is continue watching, which shows only as an arc on the avatar. P's thumbnails crowd.
  - **Recommendation on how to look:** open R, T and P first, and switch a channel in each the way you would. S works as an addition to any of them, if you like the key.
  - **Needed from you:** a pick, a mix, or "none". Anything you say about them is read as evidence, not as a list of changes.
  - **Unchecked:**
    - Nothing ran in IINA itself; these were checked in Chrome only.
    - Whether IINA's default keys already use Tab.

### W-18. Live marks in Open Stream: may Streams ask Twitch about the people in your watch history? (#74)
- **What it is:** when Open Stream opens, at most once a minute, Streams asks Twitch whether up to 20 people from your local watch history are live, to draw the live dot beside their names. Signed out, the request is anonymous. Signed in, it goes through Twitch's documented API with your sign-in, so Twitch can link those names to your account. Nothing is sent while you type. It's yours because it trades a useful sign (who is live) against the promise that history stays on your Mac (PRODUCT.md, the privacy-minded viewer, journey J19). Raised by the lead on 2026-11-24 night, from the advisor's check.
- **Options:**

  | Option | What it buys | What it costs |
  |---|---|---|
  | **Ask, as built** (provisional, on the #74 branch) | Live marks for your people; anonymous when signed out | Up to 20 of your history names reach Twitch once a minute while Open Stream is open, tied to your account when signed in |
  | **Ask only when signed out** (anonymous) | Live marks, never tied to your account | Signed in gives fewer marks than signed out, which goes against "signing in adds" |
  | **Ask only for people you follow on Twitch** (needs #30) | Twitch already knows your follows | No marks until #30 and its new Twitch permission |
  | **Don't ask; no live marks** | History never leaves the Mac | The quick list can't show who is live |

- **Recommendation:** ask, as built, and say so in the privacy note. The live dot is what makes the quick list useful to the daily viewer. Twitch already sees which channels you open.
- **Rests on:** viewers caring more about seeing who's live than about Twitch knowing which channels they look up. That's unchecked with any user but you.
- **What would flip it:** if you'd rather history never leave the Mac, take "ask only when signed out" or "don't ask". The code change is small either way.
- **Docs to change at merge:** `docs/PRIVACY.md` gains this request under `api.twitch.tv` and `gql.twitch.tv`. Its last line ("only when you open a stream or sign in") gains "or open Open Stream". Its watch-history row ("Nothing leaves your Mac") becomes "names in it are sent to Twitch for live marks".

### W-19. Switch Streams Dev on so the lead can check tonight's work in IINA
- **What it is:** nothing built tonight has run in IINA yet. That covers watch history (#73), the reopen quality fix (#59), the per-window diagnostics (#65) and the signed-in broadcast list (#75). A QA build of `next` (`0.5.5-dev+g0708d0a9`, with the test harness) is staged in **Streams Dev**. The lead can drive it from the command line, with no clicking, once Dev is switched on. At night the lead may not change IINA's plugin switches: the request was refused when tried, shortly before 17:55 (from `date`).
- **What's needed from you** (about a minute):
  1. In IINA → Settings → Plugins, switch **Streams Dev** on and **Streams Beta** off.
  2. Quit and reopen IINA.
  3. Tell the lead.
  4. When the lead is done, switch Beta back on and Dev off. Found tonight: Beta on, Dev off.
- **What the lead then checks:**
  - a live channel and a broadcast play, and `history.json` in Dev's data folder lists them with no address or title;
  - the Plugin menu shows one "Watch History" submenu (Pause, Clear), with Go Live and Chat still at the top level;
  - two windows give two entries in `last-session.json`;
  - after switching a broadcast to 360p and reopening it, the sidebar says 720p;
  - signed in, an offline channel lists its broadcasts. That needs a Dev sign-in, which only you can approve, so it may stay unchecked.
- **Done at night, for the record:** the stage folder `~/Library/Application Support/iina-streams-dev` held two Beta backups, `beta-backup-0.5.4-*` and `beta-backup-0.5.5-*`, which blocked staging. They were moved unchanged to `~/Library/Application Support/iina-streams-beta-backups/`. Nothing referred to their old path, and the installed Streams Beta is its own folder.
- **What your answer changes:** the release branch for 0.5.6 waits on these checks. The merges into `next` don't.

- **Update 2026-11-24 19:46:** done by the lead at the operator's request in chat (`defaults write` with IINA closed; read back: Dev 1, Beta 0). The operator then took over testing for a while. The lead puts Beta back on and Dev off when testing ends, unless told to leave them.

### W-20. Your first look at tonight's Dev build: where each point goes
- **What it is:** at about 20:00 on 2026-11-24 you looked at Streams Dev (a build of `next` at 0708d0a9) and raised the points below. Each is now an issue with a proposed release. The one thing to decide is whether dragging chat to dock it (#85) comes before 0.6.0.
- **Your words (as said):**
  - "Weren't we supposed to do a UI overhaul kind of deal? Because, I mean, it's still atrocious, and then I'm seeing this terrible "hide chat" kind of button. And then it's mixed with a really shitty legacy setting system where it's like "display over video," "sidebar beside video," and then I'm seeing this hide thing."
  - "I guess the hide button isn't great, but I don't even remember asking for it. I feel like there's a better way to do this. Thinking about it design-wise, the fact that I have to go into this menu and then click this to hide it, when there's probably a better way to do that? Like, what if I wanted to just maybe right-click it? There should be more right-clicking options."
  - "What's the difference between hide chat and toggling chat on or off? I guess it deloads it, but I don't know, it feels a bit weird to have these two things. The hide thing really only makes sense to me for the side panel. It squishes it [...] but I don't know why it's in the [...] stream plugin menu."
  - "what about the sidebar drag thing? I feel like that's important and that needs to be done. Is that issue on the roadmap?"
  - "when I press the options thing, then I close the panel and reopen that left panel, it reopens with the option still open, which just seems a bit silly."
  - "there's just something wrong with the process, like thinking about users and what they might want, and there's a failure of attention to detail [...] how do we handle their differences elegantly, right? So that each user feels like the app was made for them in a certain sense."
  - "I think the stuff we have for 0.5.6 is good, but I also want to fix some of the window stuff, like dragging to the side [...] I kind of want that, but maybe I can wait for a different release."
- **Where each point went (milestones are the lead's proposal):**

  | Point | Issue | Release |
  |---|---|---|
  | Options still open when the plugin panel reopens | #86 | 0.5.6 |
  | Emotes missing in past-broadcast chat | #87 (part of #34) | 0.5.6 |
  | Hide Chat vs Turn Chat Off vs the over/beside setting; hiding belongs on the side column, not the plugin menu | #88 | 0.6.0 |
  | Right-click on chat for its common actions | #89 | 0.6.0 |
  | Drag the chat box to the edge to dock it, drag out to float; the setting goes | #85 (existing; had no release) | 0.6.0, first of the overhaul |
  | The whole UI: plugin panel, overlay, Open Stream | #20, #1, #18, #52 (existing) | 0.6.0 |

- **Lead's reading (mine):** the controls were added one issue at a time (D1c made hiding a view state after your #47 feedback; #52 put Show/Hide Chat in the menu because IINA has no playback-bar API) and nobody looked at them together, as a person meets them. The overhaul has to start with an inventory of every control, where it lives and who reaches for it, before anything is redrawn.
- **The decision: when does drag-to-dock (#85) come?**

  | Option | Buys | Costs |
  |---|---|---|
  | **0.6.0, first of the overhaul** | Built with the pointer measurements (#18) it depends on, and with #88's control cleanup | You wait until 0.5.6 ships |
  | **Pull into 0.5.6** | Sooner on your screen | Delays 0.5.6; dragging over IINA's video without #18's measurements may misbehave |
  | **Leave unslotted** | Nothing | No date |

  - **Recommendation:** 0.6.0, first. It is the visible change you asked for and fixes the setting you dislike, but done before #18 it would likely be redone.
  - **Rests on:** a drag over IINA's video depends on how the overlay receives the pointer, which #18 exists to measure and hasn't yet (unchecked how far it differs from a browser).
  - **Would flip it:** if you'd rather have a rough drag sooner and accept a redo, it can start as soon as 0.5.6's remaining items are built.

### W-21. Open Stream's quick list, your first try: what it should show and how it looks (#74)
- **What it is:** at about 21:35 on 2026-11-24 you tried the new list in Streams Dev (fe99b0c) and it showed one person. Nothing is asked of you yet; this records your words and the lead's readings, and the next step.
- **Your words (as said):** "Honestly, like, why? Is it purposely not working? Because it doesn't show all my, you know, people who are online. It doesn't order them properly. Like, what's going on there? Because I should be signed in. I am signed in. It's barely showing anyone. I'm also just not a big fan of the UI. I don't know, there's just something off about it. It doesn't remind me of what you proposed to me with regards to the quick bar. You know, I'm kind of hesitating on the click-to-show-VOD kind of thing. I feel like maybe it should be another kind of window: you click on it if they're offline, and then it opens up maybe another window to give you VODs or something like that. I mean, that can come later. But yeah, I'm just not the biggest fan of the UI. I don't know, can we not improve it?" Screenshot: `.ovis/paste-20261125-023236-886a22da.png`.
- **What the lead checked:** the list is built only from Streams Dev's own watch history, which began tonight and holds one person (summit1g, opened by the lead at 19:55). Streams Dev does hold a Twitch sign-in (a Keychain item exists; validity unchecked). Mock A, which you liked on 2026-11-23, put your followed channels in the list when signed in (`direction-a/a.js`, `followsOnly` and `D.local(q, signedIn)`); the build left follows out because #30 isn't wired. So the list you saw is not the list you were shown.
- **Lead's readings (mine, not settled):**
  1. **Working choice:** "all my people who are online" means your Twitch follows, live ones first; the list must include follows when signed in, as mock A did. What would show it wrong: with follows in, you still find it empty or wrongly ordered.
  2. "doesn't order them properly" asks for live people first (TESTS-74 rule 1 said live status never reorders, flippable if you asked for live-first). With one row the order couldn't be seen, so this is a reading of what you expect, not of what you saw.
  3. "something off about it": unknown yet. Candidates: the near-empty window dominating; the heavy blue selection on the first row at rest; drift from mock A's look. The next step puts the build and mock A side by side with the same real data so you can point.
  4. Broadcasts inline vs a separate window: on 2026-11-23 you liked "reachable inline"; tonight you lean toward a separate window for an offline person's broadcasts, "later". Kept as is for now; to decide with the People screen (#76).
- **Next (lead):** add followed channels to the quick list when signed in, live first (test-first; part of #30), then the side-by-side.
- **Also said:** automatic Dev updates, go ahead.
- **Update 2026-11-24 ~22:00 (lead):** compared the build with mock A as you liked it (independent Opus reviewer, headless Chrome, same data; side by side at scratchpad `compare-74/index.html`). The main difference is the row: mock A shows an avatar with the live dot, a bold name, category and title, viewers or how long ago they streamed; the build shows a bare name. That came from the lead's own test plan (TESTS-74 rule 11, "only the display name and a live mark... no reasons, counts or labels"), which over-read your 2026-11-23 "drop the why-it's-here text" and the minimize-text rule: titles, categories, viewers and ages are values, not reasons. Also drift: follows missing; the live dot turns white when selected; lighter type; no clear button. **Lead's working choice:** restore mock A's row and your follows (live first, reading 2 above), keep the fixed height, the keyboard model and the review fixes. Reversible; you can redirect at any point.

- **Update 2026-11-25 ~01:54 (operator's second try; the paste file is stamped 06:54 UTC, Streams Dev at 80e22b5):** one row (summit1g) and the "Include who you follow" button at the bottom. Their words (as said): "immediately the button seems like a violation of one of our design principles. It just seems like too much text. The button plus the text just seems like a bit too much, like it's not a good UI... this doesn't seem like the place to have that setting. It should just be the search bar. That sort of permission, like us using information about their data, should happen at login, right? And they already do say, 'Do you authorize this application to use XYZ?'... I don't know why we have a button there for that." And: "shouldn't it also include not just who we follow but who we don't? It should prioritize the list by first looking at, okay, here's who you follow, and here's people you don't follow who you might be talking about or searching up. Like, if it doesn't match anyone from your followers list, then we go to people you don't follow or something like that. And maybe we can have a filter, sort of like a search bar thing, where it's like, okay, include those who are offline or whatever. Or just, like, this is still no good."
  - **Lead's readings (mine, not settled):** (1) taken as an instruction: Open Stream is only the search field and its rows; the follows permission belongs to sign-in, where Twitch's consent page already lists it (sign-in asks for both since phase 3). The button came from the lead's phase-3c contract (C3), which took the design review's "one action from this window" over where the permission belongs. Removing it now (fix/74-no-button). Their own grant predates the follows permission, so Sign out and Sign in once in a player's Streams panel. (2) Working reading of the second part: when typing, follows match first, then people you don't follow, from Twitch's search (TESTS-74's unbuilt phase 2, which sends the typed text to Twitch: a PRIVACY line). The offline filter is a "maybe": shown as variants, not decided. (3) "still no good" is unplaced: the near-empty window, the look, or the model. The mocks below let them point.
  - **Next (lead):** button removed (Claude page builder, lead's test 30c968c); mocks of follows-first search with people you don't follow and two or three ways to handle offline people, for the operator to react to before any build.

### W-22. Open Stream: late-arriving follows versus a list that never moves (#74; before release, not before your try)
- **What it is:** a decision before #74's follows ship in a release. The list now settles once (it waits up to 450 ms for live status and your follows, then never reorders while open), because a re-sorting list changed what Return opened. Anything that answers after 450 ms is added below the rows already shown. Two reviews found the cost of that choice: live follows that answer late sit below offline people from your history, and once a history holds 50 people (the row cap) late follows are not added at all. D-032 sends a class that survives clearance to you: redesign, descope, or ship with the risk accepted.
- **How it arose:** Opus design clearance of phase 3d ("worth watching": a cold open with no player runs the sign-in check, then follows, possibly past 450 ms) and Opus backend clearance (MAJOR at the 50-row cap, probe N4), 2026-11-25 ~01:05. Same class as P3-1 and the 3c late-follows finding: late answers versus a settled order. Merged into next anyway (80e22b5, Dev only, revertible) because it cannot bite your try: Streams Dev's history holds 1 person (counted 2026-11-25, names not read).
- **Options:**

  | Option | What it buys | What it costs |
  |---|---|---|
  | **A. Remember the last follows answer** on this Mac, so the first list already has your follows in live-first order; marks then update in place | live follows on top on every open, no waiting | stores who you follow locally (one PRIVACY line); a stale "live" person can sit on top until the mark updates |
  | **B. Wait longer when signed in** (up to ~1.2 s with a spinner) | correct order without storing anything | a slower open, every time |
  | **C. Point-fix the cap only** (late live follows appended even past 50) | closes the backend finding cheaply | late live follows still sit below offline history |
  | **D. Ship as is, risk accepted** | nothing more to build | the W-21 complaint can return for people with slow connections or long histories |

- **Recommendation (lead):** A, plus C's cap rule, after your native try measures how late follows really answer on your Mac. A matches what you asked for in W-21 (everyone online, in order) without slowing every open. Load-bearing assumption: on real connections follows often answer after 450 ms when no player is open. What would flip it: if your try (and a timing line in the QA log) shows follows answering well inside 450 ms, C alone is enough.
- **What the answer changes:** A adds a local follows cache and a PRIVACY line before the 0.6.0 People screen; C alone is a small backend round.

### W-23. Open Stream search: how to show offline people and people you don't follow (#74 phase 2)
- **What it is:** a choice of layout before the lead writes tests for search across your follows and the rest of Twitch, which you asked for on your second try (W-21 update 2026-11-25 ~01:54). Yours because it is how the window reads to you every day.
- **Mocks:** `scratchpad/mock-74-search/index.html` in the lead's session scratchpad (Claude Opus page builder, made-up names, light and dark, rendered in Chrome; not IINA). Each variant shows the field empty, "ri" (two follows, then people you don't follow) and "glaze" (no follow matches).
- **Options:**

  | Option | What it buys | What it costs |
  |---|---|---|
  | **1. Offline below live, dimmed; a hairline before people you don't follow** | every follow one glance away, nothing to learn | a long list at rest if you follow many people |
  | **2. Live only, with a small filter control in the field to add offline** | a short list at rest; your filter idea | a control to discover and remember |
  | **3. Live only until you type, then offline too** | short at rest, complete when searching | offline follows hidden at rest with no sign why |
  | **4. Like 1, with small "Following" / "Other channels" labels** | the split is explicit | words that are neither names nor values; the eighth row drops out of the window |
  | **Defer** | nothing built | the window stays as on your second try |

- **Recommendation (lead, and the builder's pick):** 1, with the split also given to VoiceOver as hidden group names. Load-bearing assumption: with live people first, an offline tail below them reads as "more", not clutter. What would flip it: after your follows load (sign out and in once), if the offline tail feels like noise, 2.
- **Decided by the lead unless you say otherwise:** Twitch-wide search starts at two typed characters after a short pause; people you don't follow are ordered live first by viewers; the typed text goes to Twitch's search (a PRIVACY line).
- **What the answer changes:** the tests and build of #74 phase 2; the backend's now-unused follows sign-in path is removed in the same round.
- **Answered 2026-11-25 (operator):** "I'll go with your recommended approach, and then we'll see." Option 1, provisional; revisit after their real follows load.

### W-24. People upgrading from an older Streams sign-in get no follows, with no sign why (#74; before release)
- **What it is:** a decision before #74's follows ship. Sign-in now asks Twitch for chat and follows. Anyone who signed in before (beta testers, you) keeps a chat-only grant, and Twitch keeps its permissions on refresh, so their Open Stream silently shows no follows until they sign out and in. The Open Stream button that fixed this is gone (W-21, your second try), rightly; nothing replaces it yet. Raised by the lead's advisor, 2026-11-25.
- **Options:**

  | Option | What it buys | What it costs |
  |---|---|---|
  | **A. The player's Streams panel offers the renewal** where Sign out is, only while the grant lacks follows | the account place you named; one click | one control in the panel, shown to upgraders only |
  | **B. A release note** ("sign out and in once to see who you follow") | nothing to build | most people won't read it |
  | **C. Ask once, automatically,** at the next sign-in check | no new control | an unasked Twitch page appearing |

- **Recommendation (lead):** A, with B in the release notes. Load-bearing assumption: few people hold the old grant (beta testers), so a control shown only to them costs little. What would flip it: if you'd rather keep the panel unchanged, B alone.
- **What the answer changes:** a small panel change and its tests before 0.6.0; Streams Dev on your Mac is unaffected once you renew.

### W-25. Open Stream search while typing: a name nobody matches, and results that blink (#74 phase 2)
- **What it is:** two behaviours the independent design review of the built search page (2026-11-25 ~03:20) traced to the lead's spec, not the build. The lead has taken working choices (reversible) so the build can continue; you can overrule either. Both show on your next try.
- **1. A name nobody matches.** As specified, typing a name with no match showed a spinner, then the field over an empty window; Return then opened the typed name, unseen. **Working choice:** one row showing the typed name (name and Twitch mark only), which is what Return opens. Alternative: keep the window empty. Cost of the choice: a row that is not a search result; it uses only the name you typed, no added words.
- **2. Other channels blinked on every keystroke.** As specified (so a stale row could never be opened), typing one more letter removed every other-channel row, and they came back a quarter-second plus the network time later. **Working choice:** rows that still match what you typed stay; the rest go; the new answer then replaces them. Alternative: keep the blink. Cost: the order of other channels can change when the answer lands, while you're typing.
- **Recommendation (lead):** both working choices. Load-bearing assumption: an empty window and blinking rows read as broken, which matches your W-21 "this is still no good". What would flip it: if, on your try, the typed-name row looks like clutter, drop it.
- **Full rules:** `docs/design/finding-2026-11-22/open-stream/TESTS-74.md`, "Rev 2 page round 3" (P-A, P-B).
- **Update 2026-11-25 ~03:45 (lead):** both built on feat/74-search (4b2a53c; 1114 tests pass). A pasted link shows as its text alone, without the Twitch mark; the row also shows when the search fails. Not merged: the merge waits for your follows to load natively once (sign out and in once).

## Answered

- **W-16, where chat lives** (2026-11-23, operator): **two places only**: the side column that pushes the video over ("beside"), and the movable glass box over the video. Chat leaves the plugin sidebar: the panel that slides in over the **left** side of the video from the plugin button. It's IINA's own plugin panel, separate from the Video, Audio and Subtitles panel on the right (IINA 1.5.1 `Preference.swift`: `sidebarPluginsDisplayAtLeading: true` by default; the operator's IINA keeps the default). *Correction 2026-11-23: the lead's change to "right" was wrong; it read the Video/Audio/Subtitles panel's setting.* That sidebar becomes the place for things you check briefly and then close: switching channel, an offline person's VODs, quality. The operator's words: "No one's going to want to watch the video with the chat bar in the left sidebar that's drawn over… The things that go in that plugin side menu bar… are things I want to quickly check and focus on." **Sequencing:** the plugin sidebar is today's default chat place, so it can stop offering chat only once "beside" has shipped and passed in IINA.
  - **Update 2026-11-24 ~19:50 (operator, awake, in chat; their words):** "what about the side window and the feature for transferring the chat window to the collapsible sidebar on the right, not the sidebar that draws over? Moving easily from the right sidebar back to the window without having to go into options. I honestly feel like we should remove that as a setting. I feel like we should just have the ability to move back and forth between a window and the side thing as a macOS native kind of gesture."
    - **Lead's working reading (mine, not settled):** the floating chat box over the video and the side column on the right should swap by direct manipulation, with no setting: drag the box to the right edge to dock it into the column, and drag the column's chat out to float it.
    - **Other readings kept:** a dock/undock control on the chat itself rather than a drag; or "window" meaning a separate macOS chat window rather than the box over the video.
    - **Next:** a small mock of the drag, with what would show this reading wrong: you reach for a button, or for a separate window. It goes with #85 ("switched directly").

- **W-12, Open Stream design** (2026-11-23, operator after trying both mocks in Safari): **A's quick list, one fixed height that scrolls**, no "why it's here" text, and no "your people" label. Typing searches the list. VODs must be reachable for live people too: mock A expands only offline rows (`a.js:112`), so this needs changing. B's list-and-detail ideas move to the bigger dashboard, and a jump links the two. The operator's words: "I'd also keep it to a fixed height that scrolls"; "the quick list doesn't have a 'your people' indicator, which I like". Feedback: [README.md](design/finding-2026-11-22/open-stream/README.md).
- **W-9, Twitch's internal interface** (2026-11-22, 21:25): **D-034.** Use the documented API where it can deliver a feature; otherwise twitch.tv's internal interface, anonymously, as Streams already does. New uses are allowed. Anything needing your own twitch.tv session is a separate decision.
- **W-10, Impeccable** (2026-11-22, 21:25): run the detector first, then install for this project only, with no hook and telemetry off. Recorded in [AGENTS.md](../AGENTS.md).
- **W-11, release mapping** (2026-11-22, 21:25): **D-035**, option A. If the history and suggestions work is sized over 6 hours, the People screen's build moves after launch without asking again.
- **W-8, discovery model** (2026-11-22, 20:53): **A, people-first**: Streams' own ranking, with Twitch's data as extra inputs when signed in, and no sponsored ordering. Operator's words: "maybe we can have our own kind of customized sort of algorithm"; "logging in should give us better recommendations, not worse"; "I don't want sponsored live channels". Full write-up: [docs/design/DISCOVERY-AND-PLATFORMS-2026-11-22.md](design/DISCOVERY-AND-PLATFORMS-2026-11-22.md) §6–§8.

- **D-033** (2026-11-22, 16:30): 0.5.5 ships with adoption off and no same-window reopen. "Okay, let's go with your recommendation."
