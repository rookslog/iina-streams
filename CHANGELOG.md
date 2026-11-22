# Changelog

## 0.5.4-beta (unreleased, 2026-11-22) — development workflow and CI
- Linked **Streams Dev** identity (`local.iina.streams.dev`, version `0.5.4-dev+g<sha>`): `npm run dev:deploy` runs both suites and stages a tested build outside the worktree; `npm run dev:link` creates one `.iinaplugin-dev` symlink; `dev:status`, `dev:rollback`, `dev:unlink`. Reload by relaunching IINA (Plugin › Reload All Plugins crashed IINA 1.5.1 on first native use).
- Removed `scripts/link-dev.sh`/`unlink-dev.sh` (targeted the deleted `candidate-plugin/`; unlink disabled the stable plugin's preference). `npm run link-dev`/`unlink-dev` now alias the new commands.
- CI runs on every branch and PR: version-metadata check, both suites, and a commit-stamped beta artifact; only `v*` tags build stable and publish the GitHub Release. Fixed two host-dependent Python tests (yt-dlp path; Python 3.13 `rglob`).
- Rewrote docs/RELEASE.md (old version archived) and docs/ROADMAP.md (proposed); DECISIONS D-022–D-024.

## 0.5.4-beta (unreleased, 2026-11-17) — on-demand VOD chat, regression correction
- Reproduced the initial full-history downloader failure on Twitch VOD 2930971003, page 50: requested 290 s, final comment at 290 s, hasNextPage true; error was misclassified as malformed archive.
- Fetch bounded windows near the current mpv timestamp instead of full-history all-or-nothing archives; request additional windows during playback, distant seeks and chat offset changes.
- Advance offset requests past repeated timestamps; deduplicate known message IDs; disclose that the public API can miss messages in very dense same-second bursts.
- Preserve replay and video on background refresh failures, retain explicit Off and manual archive import, and coalesce stale seek requests.
- Real-source helper+import tests completed at 0, 290, 500, 20,000 and 32,000 seconds of the nine-hour VOD; 168 JavaScript tests and 120 Python tests (nine legacy-layout skips) pass. Native IINA acceptance remains open.
- See docs/TWITCH-VOD-ON-DEMAND-2026-11-17.md for exact limits, evidence and rollback.
- The development target stays 0.5.4-beta; individual builds are commit-identified (`0.5.4-beta+g<commit>`). The latest stable release remains v0.5.3. Stable builds require a clean checkout at the matching v0.5.4 tag.

## Earlier unreleased experiment (2026-11-17) — initial automatic Twitch VOD chat
- On first successful public Twitch VOD load, fetch archived chat automatically, normalize it, and synchronize it to mpv playback through the existing replay engine.
- Use public GraphQL time-offset pagination with overlap; no cookies, user OAuth, or extra CLI needed. Cursor pagination failed an integrity check during development.
- Keep manual Fetch retry, authorized archive import, Off/cancellation, private staging and limits; do not interrupt video when chat is unavailable.
- Genuine end-to-end retrieval/import verified on two public short VODs (54 and 83 messages) and an eight-page partial sample from a longer one (365 distinct messages). Native installation and long VOD acceptance are not yet claimed.
- See docs/AUTO-TWITCH-VOD-INITIAL-2026-11-17.md for scope and release gates.

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
