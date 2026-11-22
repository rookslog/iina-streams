# Changelog

## 0.5.5-beta (unreleased) — chat on your timeline
- **Open Stream without a modal (#50).** ⌃⌘O opens a small Open Stream window, and **＋** in the sidebar shows an inline field. Invalid input is marked in place. The old blocking prompt, which crashed IINA about 5 s after it opened, is gone.
- **Adopted loads are held correctly (#35):** IINA continues a non-async `on_load` hook by itself, so the first adoption code never held the load and called `next` twice. The hook is now async, the controller is built off the hook's thread, and a 10 s watchdog hands a stuck load back to IINA. The sidebar's open field closes on × (the + turns into it) or when focus moves elsewhere. Escape doesn't reach the page in IINA 1.5.1 (observed).
- **Twitch and YouTube URLs opened in IINA itself** (Open URL, `open -a IINA <url>`) are adopted by Streams, which brings quality, chat and replay (#35, part 1).
- **QA mode on the dev identity (#33):** `npm run qa:deploy` stages a dev build with a request/response harness, driven by `qa/control.py` (open, click, state, wait). Release and beta builds never contain it.
- **VOD chat acquisition is pinned by recorded Twitch fixtures and property tests (#17).** An empty page that claims more follow is retried once, then the window ends with a diagnostic.
- **Swallowed errors surfaced (#24, part 1):** an unreadable Keychain item, client file or saved login is logged as a code, never its text. A corrupt `settings.json` is kept as `settings.json.corrupt-<time>` before the defaults apply.
- **Twitch opens without Streamlink (#36):** live channels and VODs resolve in plugin JS (GQL access token, then usher), with the title fetched in parallel. Observed: a live channel resolved in 349 ms in IINA. Network or parse failures fall back to the Python helper; offline, not-found and restricted answers don't.
- **Official Twitch emotes in live chat (#34):** images from Twitch's CDN (`static-cdn.jtvnw.net`, the only image source the CSP allows), in the sidebar and the overlay. Observed natively in the overlay. Badges aren't rendered yet.
- **Live chat on your timeline (#2, #28):**
  - **Modes:** Auto, Manual and Live, in Chat settings. Auto delays chat by how far the video is behind live. That's estimated from the playlist's program date-time against mpv's cache (`src/live-latency.js`, `src/chat-timing.js`, `src/live-clock.js`). A hollow dot means not yet confident; Auto then uses the manual delay.
  - **Calibrate (#28):** in Manual, ⌥-click a message to set the delay to its age.
- **Live pill and Go Live (#51):** the sidebar header shows a red Live pill at the edge, or `−N s` behind. Clicking it, **Plugin › Go Live** (⌃⌘G) or the pill seeks to 2 s before the cache end, and reloads when there's nothing to seek to. Chat items moved into a **Chat** submenu.
- **Groundwork, not yet wired:**
  - a Twitch Helix client for Following and recent VODs (`src/twitch-helix.js`, #30/#32).
- Docs: README rewritten for first-time visitors (#38); spikes on live latency, Go Live and the DVR window (#16/#31/#51) and on side chat (#47/#52); D-028, side chat docked beside the video with an mpv margin.

## 0.5.4 (2026-11-22) — development workflow, CI and the first GitHub Release
- Release-review fixes: Sign out never claims a revocation it didn't make (#41). The sign-in button is now "Approve on Twitch": it opens Twitch, which autofills the code; there is no auto-open (#42). Appearance changes keep Chat Off (#43). A seek during a failed first VOD chat fetch is still fetched (#44). Twitch VODs on any Twitch CloudFront distribution play (#45). YouTube videos with large metadata open (#46). Readability rewrite, Focus layout removed, and the sidebar keeps its scroll position after Over video (#23).
- Sign in no longer needs a Twitch Client ID. Streams ships the public Client ID of its own Twitch app, a Public client with no secret. An ID the user entered or saved still takes precedence, and only a user's own ID is saved (#8, D-025).
- Sign out now erases the saved login. Clearing it with an empty Keychain write left the old login in place, because macOS keeps an item's contents when it is updated with empty data. The next Sign in then silently refreshed the old login (#7).
- Repo cleanup (#12): removed the unshipped `plugin-dev/` 0.2.0 plugin and its 12 tests, the candidate builder/manager scripts with their tests (8 of them could never run), `verify.sh`, `export-review.py` and `releases/`. Renamed `tests_candidate/` → `tests/`. Moved 85 candidate-era docs and the old README to `docs/archive/`. New user-facing README. AGENTS.md and the project skills now point to current paths.
- Live chat timestamps show Twitch's send time (`tmi-sent-ts`) instead of the panel's render time, which also made older messages jump to the current minute (#10). Normalized messages gain `sentAt`.
- Removed `npm run install-local`, which deleted the installed stable plugin without a backup (#21).
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
