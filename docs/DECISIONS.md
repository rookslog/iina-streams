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
