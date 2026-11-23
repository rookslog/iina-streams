# Waiting on the operator

Each item is written once, in full, here. Chat links to an item's line instead of repeating it. When an item is answered, its answer is recorded under it and it moves to **Answered**. Last updated 2026-11-22 19:20.

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

### W-7. Change the output style so replies stop using unexplained labels
- **What it is:** a change to the "scan-first" style (`~/.claude/output-styles/scan-first.md`). It applies in every project.
- **How it arose:** your feedback on 2026-11-22, plus 10 earlier signals on the same problem (bare labels, missing context).
- **Proposal:** in chat, 2026-11-22 ~19:20.
- **What your answer changes:** how every reply, in every project, presents pending items and coined terms.

### W-8. How Streams helps you find what to watch, across platforms
- **What it is:** the model behind suggestions as you type, "who's on", multiple platforms and merged chat. It sets whether Streams is organised around the **people you watch** or around each platform's own pages, and how much undocumented-API risk the product carries.
- **How it arose:** your requests on 2026-11-22 for suggestions as you type, the Twitch-style "likely to watch" ordering, YouTube/Kick, creators who use different names on each platform, and merged chats. Research: `docs/design/DISCOVERY-AND-PLATFORMS-2026-11-22.md`. Its "what you're really after" table is at line 28; the options and recommendation are at line 238.
- **Options:**
  - **A. People-first:** your own viewing history plus creator records you can edit (linking one person's accounts across platforms) rank everything, and each platform adds search, live status, VODs and chat where it can;
  - **B. Mirror each platform:** copy each platform's own pages and recommendations through their private interfaces;
  - **C. Documented APIs only;**
  - **D. Defer:** just Following (#30) and the offline VOD list (#32).
- **Recommendation:** A. Most opens are you reopening someone you already watch, and your history answers that instantly, signed in or out, with no cookies. Twitch's own "likely to watch" ordering isn't available to outside apps anyway.
- **What it rests on:** most of what you open are repeat visits to a small set of people. This is unmeasured.
- **What would flip it:** if you mostly want to discover new channels, B; if you'd rather use only documented APIs, C.
- **Platform facts that constrain it:**
  - Twitch search and popular lists work only when you're signed in, through the documented API;
  - Kick chat needs a server we'd host;
  - YouTube live chat has a daily quota;
  - no public service links one creator's accounts across platforms.
- **What your answer changes:** what 0.5.6 builds (suggestions from history and Following), and the shape of 0.6.0's People view and 0.8.0's platforms.

## Answered

- **D-033** (2026-11-22, 16:30): 0.5.5 ships with adoption off and no same-window reopen. "Okay, let's go with your recommendation."
