# Design decision log

2026-11-07 D-001 PROPOSED: Local git source at ~/development/iina-streams; do not overwrite old Bridge while investigating it.
2026-11-07 D-002 PROPOSED: v0.1 must play hutchmf from IINA without a terminal; video-only is acceptable first working release.
2026-11-07 D-003 PROPOSED: no heavyweight frontend framework for initial sidebar; light local HTML/CSS/JS and gated chat.
2026-11-07 D-004 OPEN: prefer external Streamlink-to-iina-cli for bootstrap if its lifecycle is proven; evaluate loopback Streamlink HTTP for integrated player/quality control. Localhost-only bind mandatory.
2026-11-07 D-005 OPEN: default quality Auto vs 720p60 cap; choose after measurement.
2026-11-07 D-006 OPEN: developer/stable plugin naming and update policy; develop separate ID and user-gated promotion.
2026-11-07 D-007 OPEN: whether user wants a private GitHub remote / CI automation after local tests and first working release.

Update this append-only log when actual decisions are made, with evidence and rollback references; don't silently rewrite historical conclusions.

2026-11-07 D-008 CHOSEN (candidate): prefer Streamlink one-shot --stream-url direct HLS extraction + IINA-managed player over persistent Streamlink-to-iina-cli or localhost HTTP, subject to long-run/reconnect tests. Evidence: real extraction + headless decoder + IINA file-loaded event; ongoing behavior unverified.
2026-11-07 D-009 CHOSEN: separate dev plugin ID local.iina.streams.dev and prospective stable ID local.iina.streams; do not overwrite original Bridge or installed IINA.
2026-11-07 D-010 CHOSEN: lazy sidebar and dynamic live Streamlink quality list, no chat processes/timers in M2. Per-window quality switch via core.open requires GUI lifecycle tests.
2026-11-07 D-011 CRITICAL: user reported unexpected IINA closures. Predecessor test had 14-second core.stop and was corrected. Five real IINA app startup SIGTRAP reports, two predating development link; investigate before repeating launches. Dev plugin disabled; stable promotion deferred.
2026-11-07 D-012 OPEN: consider isolated IINA 1.5.1 compatibility testing after approval; do not change existing IINA 1.4.4 automatically.

2026-11-07 D-013 M2 UX BLOCKER: user shared screenshot of top on-screen controller not hiding and obstructing Streams sidebar. Read-only IINA pref places floating control bar near top (vertical 0.0003568). Do not silently move global controls. Investigate native OSC layout/auto-hide and sidebar readiness; see BUG-002.


2026-11-07 D-014 CONFIRMED: IINA 1.5.1 network window title reads mpv media-title; use file-local-options/force-media-title from on_load, not native window patches. hutchmf title seen in actual AX player window.
2026-11-07 D-015 CONFIRMED: JavascriptAPISidebarView.loadFile clears message listeners; register sidebar.onMessage handlers afterward. JavascriptMessageHub requires JSON-serializable data; send explicit objects for ready/refresh/hide.
2026-11-07 D-016 IMPLEMENTED: reveal Twitch Streams controls on first playback; honor hide through quality reconnect and reinitialize after IINA recreates window. Pending user visual acceptance; no global titlebar/OSC setting modifications.


2026-11-07 D-017 CONFIRMED: the official installed Online Media plugin changes quality with mpv.command("loadfile"), whereas PlayerCore.open in IINA v1.5.1 deliberately closes the network window. The Streams quality controller now uses mpv.loadfile replace with pre-extracted new Twitch URL; preserve title and sidebar. Real 160p30→360p30 QA: 1 window load, 0 window-close events, new video resolution, playback advanced.
2026-11-07 D-018 M2 VISUAL REVIEW OPEN: user screenshot shows fullscreen native titlebar overlapping Streams panel; UI looks unpolished to user. Pro should improve layout, responsiveness, native UI integration and accessibility with evidence rather than ad-hoc global settings.

2026-11-07 D-019 PROPOSED, NOT IMPLEMENTED: user requests a TNF-principles-informed redesign of Streams, calling out superfluous visible text. Design source read in full: TNF DESIGN-PRINCIPLES v3 and amendments, product record and design-lane feedback. Draft a 'Quiet Streams' control surface: keep channel and actual quality, reduce repetitive eyebrows/status/captions, state attached to control, glass via IINA host rather than faux blur. See docs/design/TNF-INHERITANCE-QUIET-STREAMS.md. Preserve accepted playback code; design taste gate remains open.

2026-11-17 D-020 CHOSEN (development-build identity, not release promotion): Keep the source and package release version at the latest actually tagged release (`v0.5.3`) until a deliberate release. Build experimental beta artifacts under isolated plugin ID `local.iina.streams.beta`, identified by Git commit (`0.5.3-dev.g<sha>`, with `.dirty` for uncommitted work), not by incrementing release versions for each experiment. Stable packaging requires a clean checkout at its matching release tag. The prematurely labeled `0.5.5-beta` and `0.5.6-beta` packages were local experiments, not released versions. Evidence: `scripts/build.py`, `tests_candidate/test_build_current.py`, and the on-demand Twitch VOD regression report. This policy does not grant merge or stable-promotion approval.

2026-11-17 D-021 CORRECTION TO D-020 (user-confirmed versioning): The last released tag is `v0.5.3`; the active development target is `0.5.4-beta` until an intentional `v0.5.4` release. Give each beta artifact the exact commit identifier as build metadata (`0.5.4-beta+g<sha>`), while retaining beta plugin identity `local.iina.streams.beta`. Do not increment to 0.5.5, 0.5.6, etc. for experiments on this same beta. Retain D-020 for historical context but supersede its mistaken `0.5.3-dev` convention. Stable packaging remains blocked until the matching release tag and a clean source tree.

2026-11-22 D-022 CHOSEN on branch `chore/dev-workflow-20261122` (not merged; not natively verified): daily iteration uses a linked **Streams Dev** identity `local.iina.streams.dev` (as D-009 proposed), built by `scripts/build.py --dev` and staged by `scripts/dev.py deploy` into a fixed `~/Library/Application Support/iina-streams-dev/current`. The stage is refused unless both suites pass. A single `.iinaplugin-dev` symlink in IINA's plugins folder points at it, so redeploys from any worktree need no relink or archive install. The previous stage is kept for `dev.py rollback`. The tool never enables, reloads, launches or quits IINA, and it refuses foreign links, foreign stage content and duplicate identities. Reload is IINA 1.5.1's *Plugin › Reload All Plugins*, which per source rebuilds every plugin instance in every window: a restart, not hot reload. The Dev identity has its own Keychain entry and needs one Twitch sign-in. Replaces the obsolete `scripts/link-dev.sh`/`unlink-dev.sh`, which targeted the removed `candidate-plugin/` and whose unlink disabled the **stable** plugin preference. Evidence: `tests_candidate/test_dev_workflow.py`; IINA v1.5.1 `JavascriptPlugin.loadPlugins`, `AppDelegate.reloadAllPlugins`, `JavascriptAPIUtils.keychainRead`. Rollback: `npm run dev:unlink`. Open: first native run of link → reload → deploy → reload.

2026-11-22 D-023 CHOSEN on the same branch (resolves D-006 update policy and D-007 remote/CI): `main` carries released code only, because IINA's GitHub installer takes the latest Release asset (else `main.zip`) and its updater compares `main/Info.json` `ghVersion`. `beta` integrates the next version. CI runs on every branch and PR (version check, both suites, commit-stamped beta artifact). Only `v*` tags build the stable package and publish the Release. The old workflow ran the stable build on every main push, which `build.py` now refuses off-tag, and its tests had failed since commit 3435062 removed `candidate-plugin/`. Evidence: clean-clone simulation under Python 3.12 (168 JS pass; 135 Python OK, 9 skipped; tag `v0.5.4` simulation builds stable with ghVersion 3); `actionlint` clean. Not yet run on GitHub.

2026-11-22 D-024 PROPOSED, awaiting user approval: adopt the release sequence in `docs/ROADMAP.md`. 0.5.4 trustworthy loop (VOD windows, dev workflow and CI, Open Stream shortcut, live timestamp fix, repo hygiene, first published GitHub Release). 0.5.5 chat delay: Live and Manual, plus an Auto measurement spike. 0.6.0 optional chat sending, plus Auto only if the spike shows a stable estimate. This **reverses** the 2026-11-15 roadmap's non-goal "Sending chat messages … strictly read-only" at the user's request (issue #3); read-only remains the default grant. Evidence: three read-only audit lanes on `ded1d0e` (2026-11-22) and IINA v1.5.1 source. Supersedes the 2026-11-15 ROADMAP content (kept in git history).

2026-11-22 D-023 UPDATE: the user approved committing, fast-forwarding `beta` to `5d80e36` and pushing it. The first GitHub run of the new CI, run 44989552465 on `beta` at `5d80e36`, passed: version check, JS suite, Python 136 OK with 9 skipped, and beta artifact `0.5.4-beta+g5d80e364`. The release job was skipped as designed (not a tag). `main` is unchanged.

2026-11-22 D-022 UPDATE (observed native failure): on first native use, Plugin › Reload All Plugins crashed IINA 1.5.1. Crash report `~/Library/Logs/DiagnosticReports/IINA-2026-11-22-005118.ips` shows an `EXC_BREAKPOINT` on the main thread in `JavascriptAPISidebarView.loadFile`, called from a plugin JS event handler re-emitted by `AppDelegate.reloadAllPlugins`. The calling plugin is unconfirmed: Streams Beta and the built-in OpenSubtitles plugin both call `sidebar.loadFile`. A nil weak force-unwrapped reference (`player!` or `pluginInstance`) is inferred from source and unproven. The dev loop's reload step is now **quit and relaunch IINA**; `dev.py` hints, RELEASE.md and ROADMAP are updated to match.

2026-11-22 D-024 UPDATE (user-approved): tracking moved to GitHub. Milestones 0.5.4, 0.5.5, 0.5.6 and 0.6.0 hold the release slices. Issues #6–#18 were filed from the roadmap, with parents #6 (account and sign-in), #2 (chat timing) and #1 (overlay), and area/type labels. `docs/ROADMAP.md` is now a one-screen index with an intake rule. The detailed plan moved to `docs/design/ROADMAP-RATIONALE-2026-11-22.md`.

2026-11-22 D-025 CHOSEN (user-approved, issue #8, pulled into 0.5.4): Streams ships a built-in Twitch Client ID, the maintainer's "IINA Streams" application, in `src/twitch-app.js`.
- **Why it is safe to publish:** the application is the Public client type. Twitch's device-code flow uses no client secret for public clients, and they refresh without one (Twitch "Getting OAuth Access Tokens" docs), so the ID names the app and cannot act as it.
- **Rate limits:** Twitch publishes no per-app limit for its authorization endpoints. A staff forum reply says apps need to worry only if they misbehave, and each user token has its own request pool.
- **Resolution order, in `global.js` auth-connect:**
  1. the ID just entered in setup;
  2. the user's own saved ID (`@data/twitch-client.json`);
  3. the saved login's ID;
  4. the built-in ID;
  5. otherwise, setup.
- **Not saved as the user's own:** the built-in ID is never written to that file, so a future change to the built-in ID reaches every user who never chose their own.
- **Fallback:** the setup sheet stays reachable through "Use a different Client ID" when Twitch rejects the built-in app.
- **Amends:** `docs/design/TWITCH-SIGN-IN-2026-11-22.md` "Client ID sources", which had put the built-in ID first.

2026-11-22 D-022/#7 UPDATE (observed native bug, fixed in 85998a5): Sign out cleared the Keychain grant by writing `''`. macOS `SecItemUpdate` keeps an item's contents when given empty data, though it reports success, so the refresh token survived and the next Sign in refreshed silently. Sign out now writes a non-empty signed-out marker. Test doubles now model the host behaviour.

2026-11-22 D-026 CHOSEN (user-approved): plan the releases around user journeys toward a public launch. The plan is in `docs/design/USER-JOURNEYS-2026-11-22.md`.
- **Releases:**
  - 0.5.5: chat on your timeline (unchanged).
  - 0.5.6: find what to watch (#30, #32, #35, #34).
  - 0.6.0: **public launch on Reddit**, with the UI overhaul (#20, #1, #18), out of the box (#36, spike #37) and the launch kit (#38).
  - 0.7.0: talk back (#3, #29).
  - 0.8.0: more platforms and accounts (#6, #19, spikes #39 and #40).
- **Timeline (user):** 0.6.0 tonight; 0.8.0 within a few days to a week.
- **Changes from D-024:** chat sending moves from 0.6.0 to 0.7.0; the overlay and panel work moves from 0.5.6 to 0.6.0, so the overhaul covers every screen at once; emotes split, with official ones in 0.5.6 (#34) and third-party ones in 0.7.0 (#29).
- **Supersedes:** `ROADMAP-RATIONALE-2026-11-22.md` from 0.5.6 onward.
- **Rust helpers:** the user asked about rewriting the helpers in Rust to save memory and CPU. That was deferred to measurement in spike #37. A 2026-11-22 snapshot during live playback found no Streams helper processes, with IINA at 102 MB and 15% CPU, so a compiled helper saves nothing in steady state.

