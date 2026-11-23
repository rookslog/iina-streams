# Waiting on the operator

Each item is written once, in full, here. Chat links to an item's line instead of repeating it. When an item is answered, its answer is recorded under it and it moves to **Answered**. Last updated 2026-11-22 21:25.

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
- **How it arose:** the 0.5.5 code is finished and passed its final review: `docs/reviews/2026-11-22-v0.5.5-release-review.md`, sections "Clearance 2" and "Narrow check".
- **Still to do first:**
  - the IINA checks listed in the same review file, under "Native acceptance for 0.5.5";
  - W-1;
  - W-2.
- **Recommendation:** release once those are done. Steps are in `docs/RELEASE.md`, "Releasing vX.Y.Z".
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
- **How it arose:** today you had to hand IINA over, and switch plugins by hand, for every test. Scoping: `docs/design/TEST-MACHINE-2026-11-22.md`.
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
- **What it is:** the review session found that the global "scan-first" style has **never been loaded**. Settings ask for `scan-first`, but the style file is named `Scan-first`, and style names are case-sensitive. So tonight's unexplained lists came from habit, not from the style.
- **The proposal:** `docs/design/OUTPUT-STYLE-PROPOSAL-2026-11-22.md`. Its two decisions start at "Decisions for you":
  - **D1:** trial the revised draft for a week in `iina-streams` and `sonic-affinity-lab`, as an uncommitted local setting (recommended), committed, globally, or not at all;
  - **D2:** leave the inactive global setting alone until the trial ends (recommended), fix its letter case now, or remove it.
- **What your answer changes:** how replies read to you in those two projects for a week, and later everywhere.

### W-12. Open Stream with suggestions: pick the design direction and the window's sizing
- **What it is:** which mock becomes the Open Stream window with suggestions (#74) and the person row shared with the People screen (#76), and whether the window stays one fixed size or hugs its results. It's yours because it's how the product looks and feels every day.
- **How it arose:**
  - the designer's two mocks: `docs/design/finding-2026-11-22/open-stream/direction-a/index.html` (A, Quick list) and `direction-b/index.html` (B, List and detail);
  - their comparison in the same folder's `README.md`;
  - the independent review: `REVIEW.md` in the same folder.
- **Options:**

  | Option | What it buys | What it costs |
  |---|---|---|
  | **Hybrid of A, hugging its results, top edge pinned** (like Spotlight) | A's compact one-line rows; the window is as big as its content | IINA 1.5.1 can't read the window's position, so the top edge moves unless an unchecked web-view trick works |
  | **Hybrid of A, one fixed size** | The field and rows never move; the simplest build | Empty space when there are few matches |
  | **B, fixed size, fixed per the review** | A detail pane per person | Busier, more text; two review majors to fix |
  | **Decide after a native test** | Evidence first | The design round waits |
- **Recommendation (updated after checking IINA's source):** the hybrid of A, **one fixed size**. IINA 1.5.1's plugin window API can set the window's frame but has no way to read it (`setFrame` exists; there is no frame getter in `JavascriptAPIStandaloneWindow.swift` at tag v1.5.1, lines 14–24 and 144–157, read by the lead). A plugin therefore can't keep the top edge in place after you've moved the window: every resize grows from the bottom-left corner, and the field jumps. Today's Open Stream window already resizes when it shows offline broadcasts, so it has this jump now.
- **What it rests on:** a fixed size with empty space looks acceptable to you. That's a taste question, which is why it's yours.
- **What would flip it:** if you'd rather it hug its results, one unchecked route remains: the page reads its own screen position (`window.screenY` inside IINA's web view) and passes it to `setFrame`. If a native test shows that works, the hugging option comes back.
- **What your answer changes:** the second design round (the hybrid drawn, with the review's fixes), then the #74 build.

### W-13. Merge the watch-history module (#73) after its last fixes, or hold it
- **What it is:** whether the history module may merge into `beta` once its last small fixes pass their tests, or must wait for another Codex check. It's yours because our review rule (D-032 rule 4) sends any finding that survives the final review to you.
- **How it arose:** Codex's narrow check of the module, on a branch not yet in `beta`, found five small problems:
  - the visit counter isn't saved;
  - forgetting a channel trimmed on load doesn't remove it from disk;
  - an extreme visit number breaks closing visits;
  - loading a huge history file is slow;
  - one return value is inconsistent.

  Details: `docs/reviews/2026-11-22-issue-73-module-review.md`, the "Narrow check" section at the end. The fixes are being made on the branch now.
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

### W-14. Merge the offline-channel fix (#67) with its known edge cases, or park it
- **What it is:** whether to merge the fix that checks a Twitch channel before opening a window. Offline: you get the VOD list and no window, so IINA's "Cannot open file" and login panel are gone. Four small findings remain after the final review, so our review rule (D-032 rule 4) sends it to you.
- **How it arose:** five Codex reviews tonight. The record, verbatim: `docs/reviews/2026-11-22-issue-67-review.md`. Branch `fix/67-resolve-first` at `3cfe7fd`; all 846 tests pass.
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

## Answered

- **W-9, Twitch's internal interface** (2026-11-22, 21:25): **D-034.** Use the documented API where it can deliver a feature; otherwise twitch.tv's internal interface, anonymously, as Streams already does. New uses are allowed. Anything needing your own twitch.tv session is a separate decision.
- **W-10, Impeccable** (2026-11-22, 21:25): run the detector first, then install for this project only, with no hook and telemetry off. Recorded in `AGENTS.md`.
- **W-11, release mapping** (2026-11-22, 21:25): **D-035**, option A. If the history and suggestions work is sized over 6 hours, the People screen's build moves after launch without asking again.
- **W-8, discovery model** (2026-11-22, 20:53): **A, people-first**: Streams' own ranking, with Twitch's data as extra inputs when signed in, and no sponsored ordering. Operator's words: "maybe we can have our own kind of customized sort of algorithm"; "logging in should give us better recommendations, not worse"; "I don't want sponsored live channels". Full write-up: `docs/design/DISCOVERY-AND-PLATFORMS-2026-11-22.md` §6–§8.

- **D-033** (2026-11-22, 16:30): 0.5.5 ships with adoption off and no same-window reopen. "Okay, let's go with your recommendation."
