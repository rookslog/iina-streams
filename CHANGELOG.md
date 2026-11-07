# Changelog

## 0.2.0-rc1 (2026-11-07) — development only / promotion blocked
- New Twitch URL extraction architecture, no long-lived Streamlink process or local listener.
- A single global Open Stream… action; Twitch channel URL validation.
- Per-window, lazily loaded Streams sidebar using documented IINA sidebar messaging.
- Dynamic quality discovery from Streamlink JSON and per-player quality reconnect.
- Pure provider and format modules, 11 Node tests covering safety, mocking and window isolation.
- Development link/unlink scripts, isolated stable-identity candidate packaging and SHA-256.
- Research/diagnostics: IINA 1.4.4 crash reports found on macOS 27.2, with two crashes predating new plugin.
- Removed earlier debug-only automatic 14-second `core.stop()`; no launch-trigger files in current code.
- YouTube URLs provisional via IINA's Online Media plugin; unsupported Twitch VOD shows message.
- Stable release **not installed or accepted**.

## 0.1.0-spike (2026-11-07) — development proof only
- IINA plugin global entry successfully created a test Twitch player for hutchmf.
- File-started and file-loaded observed in test player; auto-stop after 14s later judged inappropriate.
- Direct URL decoded in headless mpv at 360p30.
- Five startup crash reports were discovered during testing; no stable release claim.

## Baseline 5751d8f
- Inherited specification, roadmap, and preserved original Bridge 0.1.0 code.

- Candidate packaging: IINA 1.4.4 pack command failed; ZIP-compatible fallback passed integrity only. Development unlink/relink was tested; plugin remained disabled.

## 0.2.0-rc2 (2026-11-07) — development, tested partial runtime
- Fixed real IINA API permission failures: added `network-request` and scoped Twitch CDN `allowedDomains`. These were missed by earlier mocks.
- Added opt-in, single-use automated IINA integration QA mode using `qa-request.json`, with recorded nonsecret player state and time-bounded stop affecting QA-labeled player only.
- Reproduced hutchmf 360p30 IINA playback initialization, format discovery and same-resolution quality reconnect, tested in real IINA.
- Recorded user feedback and BUG-002 regarding top on-screen controller obscuring Streams sidebar; avoid system-wide layout changes without approval.
- Kept old rc1 candidate as forensic record; rc2 must not be promoted until real sidebar and release gates pass.


## 0.2.0-rc3 / usability fixes (2026-11-07) — development review
- Set the real mpv media title from Twitch channel label at the file-load hook; verified actual IINA window title `hutchmf — Twitch`, including after quality switching.
- Fixed the missing Streams panel by registering message listeners after sidebar.loadFile() (which clears them in IINA 1.5.1), and providing defined JSON payloads for webview messages.
- Revealed Streams controls automatically on first playback, with Hide / Show behavior preserved across the player window being recreated on quality change.
- Added 12th runtime test for sidebar webview state/commands and improved the lifecycle test to catch regressions.
- Verified two real short hutchmf cycles with loaded frames/audio tracks, sidebarReady and title retained across quality switches. No screenshots due macOS capture refusal. See docs/BUG-003-title-and-sidebar.md. No stable promotion.


## 0.2.0-rc4 (2026-11-07) — same-window Twitch quality switching
- Removed `core.open(extractedURL)` from the quality controller. Use `iina.mpv.command("loadfile", [url, "replace"])`, matching the established IINA Online Media plugin's mpv-level reload pattern.
- Quality remains pending through transport extraction and player buffering; selected value updates after actual `iina.file-loaded`. A bounded 18s timeout handles a stalled switch.
- Treat `mpv.end-file` during a replacement as a transition, keeping sidebar and metadata alive.
- Added independent headless mpv replacement probe and real IINA 1.5.1 QA records: hutchmf 160p30 → 360p30 in one window, sidebar ready, playback advanced and title preserved. Verified no window-will-close event across quality change.
- Captured user feedback about fullscreen titlebar overlap and first-pass UI styling. Native overlap and overall UX remain open for Pro audit.
