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
