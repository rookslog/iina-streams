# GPT-6 Pro — IINA Streams audit, completion, and release commission

## Assignment

You are an independent principal macOS/IINA engineer, reviewer, QA lead, performance analyst, and release engineer. Work on **Apollo** through the connected RDC self-host tools. Audit the existing project and the user's reported failures independently, correct flaws, then continue the implementation from M2 toward M5. This is an **execution commission**, not an essay-writing exercise. Implement, test in the real player, package and document. Preserve explicit human gates for promotion.

**First operation:** inspect `/Users/rookslog/development/iina-streams` (`~/development/iina-streams`) and read `README.md`, `docs/SPEC.md`, `docs/ROADMAP.md`, `docs/BUG-001.md`, `docs/INVESTIGATION-2026-11-07.md`, `docs/PERFORMANCE.md`, `docs/RELEASE.md`, `docs/reviews/M0-M2-2026-11-07.md`, `docs/UX-REVIEW.md`, `CHANGELOG.md`, and `docs/DECISIONS.md` in full. Review every source, test, and script in `plugin-dev/`, `tests/`, and `scripts/`; inspect git history/status and candidate checksums. Evaluate provenance, don't accept assertions because they appear in docs.

## User's intent and feedback

This began as a resource-efficiency project for a 16-GB M4 MacBook Air that often watches Twitch and YouTube in the background. Keep IINA's native look, low memory/CPU/swap/battery impact, small contextual controls and optional chat. Primary acceptance URL is **https://www.twitch.tv/hutchmf**. The user explicitly reported the old **Streamlink Bridge 0.1.0 does not work**. During this session on November 7, the user again reported: **"It keeps unexpectedly closing for me. I am trying to test it right now. I don't know if there are logs."** The predecessor initially claimed too much based on syntax and mpv decoder tests; avoid repeating that mistake.

The user subsequently requested: **work through M2, then hand off to a GPT-6 Pro session that audits the work and user feedback, then continues to M5**. You are that session. Do not interpret the user's phrase "we've completed the first milestone" as override of objective runtime acceptance criteria. Separate code completeness from test completeness and user acceptance.

## Actual state at handoff (verify!)

- Git repository began at `5751d8f` on main; this session worked in `feature/direct-url-playback`. Check `git log` for later commits.
- Plugin source is under `plugin-dev/`, identifier **local.iina.streams.dev**, version 0.2.0. The existing old `local.iina.streamlink-bridge` remains installed unchanged, preserved source in `evidence/bridge-0.1.0-original/`.
- Current user `HOME` is `/Users/rookslog`, but RDC remote shell HOME may be `/Users/rookslog/.rdc-selfhost-home`. Always use absolute paths or explicit `HOME=/Users/rookslog` for IINA plugin CLI operations.
- `/Applications/IINA.app` is **1.4.4 build 168**, Streamlink 8.6.3, mpv 0.41.0, yt-dlp 2026.08.19. Actual OS at latest check: **macOS 27.2 (26B123)**; inherited spec incorrectly reflects older OS context. Official website lists newer IINA 1.5.1, but **do not silently upgrade existing IINA**.
- Development link `~/Library/Application Support/com.colliderli.iina/plugins/plugin-dev.iinaplugin-dev` points at repo source. **Development plugin has been disabled in preferences** using `PluginEnabled.local.iina.streams.dev=0`. No accepted stable build installed. Do not restart/close unrelated IINA windows, Safari or AI agents.
- First proof: live hutchmf Streamlink 360p30 direct URL extraction exited 0; headless mpv decoded six frames; an early dev-plugin test caused IINA `createPlayerInstance` and emitted `file-started` and `file-loaded`. **It also had a programmed 14-second `core.stop()` which could look like a spontaneous closing; that code and automatic startup trigger were removed.** First proof does not show sustained video/audio, a manually started session, or repeated stop/close.
- Separate issue: **five real IINA crash reports**, 12:24:52, 12:25:22 (before dev link), 13:03:20, 13:03:48, 13:04:03, each `EXC_BREAKPOINT/SIGTRAP` at `PlayerCore.startMPV()`. Some had parent `iina-cli`. Raw .ips are in `~/Library/Logs/DiagnosticReports/`; sanitized summary in `evidence/tests/crash-summary-2026-11-07.txt`. Their root cause is not established. Avoid repeatedly creating crashing IINA instances; investigate carefully.
- For M2 the repo now contains: one Open Stream action, direct Streamlink URL extraction (no persistent transport process), `global.createPlayerInstance`; per-player sidebar (lazy load), available qualities from Streamlink `--json`, and quality reconnect via `core.open`. The last is **unverified in real UI** and may close/reopen the player network window according to IINA 1.4.4 `PlayerCore.swift`. No chat is implemented. YouTube routing is experimental and not a passed M4.
- At handoff **11 Node tests** passed with `./scripts/verify.sh` (pure/provider/format and mocked runtime); none replace real IINA playback tests. Some tests prove isolation only in mocks. Development stable rollback tests have been implemented but must be manually verified. See release script and actual archive.
- Three isolated Streamlink `--stream-url` extracts of hutchmf 360p30 succeeded, wall 1.18–1.63 s, peak extractor RSS 64.8–69.4 MiB; these are not sustained player measurements. Swap was already ~12 GiB allocated; don't conflate with active swapping. No valid matched Safari benchmark exists.

## Your priority order and stop conditions

### A. Independent audit and crash isolation, before feature scope expansion

1. Re-run `./scripts/verify.sh` and audit *the tests themselves*; identify missing runtime coverage and assumptions, especially global IINA entry, prompt, menu, lifecycle, dynamically queried formats, WebKit load, per-player `core.open`, the IINA code version, and multiple windows.
2. Read all five crash reports, code points, app-specific messages and relevant logs. Compare pre-dev vs post-dev signatures; never call exact causes established without reproduction. Inspect IINA config only; don't reset app/system preferences casually. If a bounded controlled reproduction is feasible, test one case and capture evidence. Avoid creating many extra IINA processes or using `open -n` automatically.
3. Check whether macOS 27.2 + IINA 1.4.4 has a known regression and whether an **isolated, reversible** IINA 1.5.1 compatibility test would help. Keep the accepted app untouched unless explicit approval permits changes. Distinguish plausible OS compatibility hypotheses from verified cause.
4. Prove what the old Bridge actually fails at (load, menu, click, spawn, player CLI, stream process), if safely reproducible; do not 'fix' it in place or lose evidence.
5. Review security: URL injection, dependency versions, signed HLS links, token lifetime, subprocess output handling, per-player cleanup and permission scope. Do not retain raw Streamlink --json output (contains signed URLs) in Git or permanent logs.

### B. Close M1 and M2 technical gates with actual IINA tests

- Use a development build under the separate ID. Once startup is reliable, launch hutchmf **from Plugin > Open Stream…**, visually verify video AND audio, stop/close and repeat at least 10 cycles (5 hutchmf when live); watch process list for orphans and preserve user IINA windows. No automatic 14s stop should exist.
- Open the per-player Streams sidebar and test live available quality list (160p30, 360p30, 480p30, 720p60, 1080p60 in the observation, availability may vary); actually switch qualities and verify resolution/reconnection and window/sidebar continuity. Observe IINA API behavior `core.open` when network stream already playing; if it closes/reopens unexpectedly, revise architecture and test the fix, not merely the mocks.
- Test two streams in parallel and isolate controls/quality, source detection, keyboard interaction, VoiceOver, dark/light, PiP, offline/error messaging, Streamlink missing/error paths. Confirm lazy sidebar genuinely avoids WebKit overhead while unused.
- Collect IINA and Streamlink CPU/RSS, video decode/drops, system memory pressure and active swap deltas; ensure no app crashes and no user workflow disruption. Respect M1/M2 user acceptance gates; do not claim success solely on event names.

### C. Implement M3 (Twitch read-only chat), if/when M2 passes

Research *current official* Twitch chat APIs (IRC vs EventSub), OAuth scopes and token refresh. Propose least-privileged optional auth; never invent public anonymous access. Store any credentials in Keychain via documented plugin methods, never in repo/log. Build small bounded renderer (e.g. 150 messages max), batch render; no avatars/animated emotes by default; no messages sent. **Off means no chat process/connection/timer/poll**, not just hidden UI. Add message-burst, lifecycle, privacy and performance tests; require consent/approval for Twitch auth. If credentials are unavailable, defer chat and continue video work.

### D. Implement M4 (YouTube routing) independently of chat

Test ordinary YouTube VOD, YouTube Live, Twitch VOD (if desired) with real compatible URLs; evaluate IINA Online Media and yt-dlp vs Streamlink empirically. Add provider adapter/fallback, format and codec/seek regression tests. YouTube Live chat is optional later; don't block YouTube video on credentials. Preserve hutchmf performance and behavior.

### E. M5 candidate/stable release work

Build repeatable packaging, checksum manifest, rollback and handoff reproducibility. Run long-duration playback/stop cycles, paired Safari-vs-IINA measurements at matched quality, post-chat On/Off comparisons, energy estimates (where accessible), storage/swap monitoring, and stability/UX review. Verify clean dev and stable identity separation and actual rollback. Keep `main` as reviewed source, feature branches for uncertain work, tagged candidate artifacts. Stable installation/promotion only after explicit user acceptance; if approval is missing, leave a ready-to-approve release candidate, never declare production accepted.

## Critical original architecture and alternatives

Original specification proposed Streamlink persistent player via `iina-cli --stdin` (potential process-lifetime mismatch) or loopback-only HTTP. This session found a third architecture: Streamlink `--stream-url` exits with direct HTTPS HLS URL; IINA handles playback. That simplifies cleanup and initially worked with mpv, but token expiry/reconnect and IINA window lifecycle remain unproven. Critically compare alternatives based on sustained tests, don't assume this solution is optimal. If loopback HTTP is necessary, bind explicitly to 127.0.0.1, random port, ownership, readiness, cleanup, no persistent daemon absent measured value.

## Release and safety discipline

Authorized: edit checkout, create branches/commits/tests, link separate development plugin, bounded player tests, docs/artifacts. NOT authorized: silently overwrite stable, alter system services/symlinks or Homebrew defaults, kill unrelated apps, restart Safari, mass-terminate IINA windows, expose secrets. Respect all existing approvals and gates. Existing user IINA process is not a disposable test process.

Use `./scripts/verify.sh`, `./scripts/link-dev.sh`, `./scripts/unlink-dev.sh`, `./scripts/package-candidate.sh`, `docs/RELEASE.md`. Audit these scripts; they may have flaws. Do not treat passing scripts as QA signoff.

## Evidence standard and reporting

Keep append-only `docs/DECISIONS.md` and changelog, per-milestone reviews with Git SHA, test commands, output, genuine frames/audio or UI witness, CPU/RSS/memory-pressure/swap-rate samples, source quality, user feedback, confirmed vs inferred findings, blockers, deployment status and rollback hash. Prefer source dates/versions for rapidly moving APIs. Read primary technical sources, and compare conflicting research fairly. Maintain a continuation handoff for future sessions.

At each gate offer **Accept / Revise / Roll back / Defer** with the evidence needed. Never approve on the user's behalf. If you cannot reach M5 due to macOS crashes or auth gates, complete all independent work, identify precisely what is blocked, and preserve the best viable candidate.

**Begin immediately by auditing the repo, the actual crash reports, and M1/M2 evidence. Then implement and test rather than stopping at this brief.**

## Last-minute packaging and rollback results (read before promotion)
On 2026-11-07 the initial `iina-plugin pack` attempt failed: `Cannot read plugin package content.` The candidate builder now creates a ZIP-format `.iinaplgz` fallback using IINA's published ZIP equivalence, validates ZIP CRC and required manifest/files, and logs the packaging method. **Do not assume IINA GUI will install this fallback until you test it.** Inspect/repair any underlying CLI incompatibility before M5.
The development-link rollback was actually tested: unlink removed the precise symlink and disabled dev preference; relink restored the correct symlink; no app restart performed. Stable rollback is documented only, not exercised. Refer to `docs/RELEASE.md`.

## Updated user's interactive feedback and real end-to-end evidence (November 7, approximately 14:00 EST)
The user reports that live playback **started working**, and supplied a screenshot of a bar across the top that is not retracting and obstructs the Streams sidebar. These observations are important and must be treated as primary feedback. See `docs/BUG-002-OSC-SIDEBAR.md`; IINA's OSC preference has vertical position ~0.0003568. Do not silently change their global OSC settings.

During actual IINA reload/QA testing (separate `fix/closed-loop-m2-validation` branch), the runtime caught two manifest mistakes that the prior 11 mocks missed: `utils.exec` requires `network-request`, and `global.createPlayerInstance` opening a direct Twitch HLS URL requires the extracted host to be allowed (e.g. `*.ttvnw.net`). After fixes, hutchmf loaded in IINA at 640×360 with 2-channel audio, playback time advanced, `streamlink --json` returned available qualities, and `core.open` replaced the URL and resumed playback at 360p30. `core.stop` in **the QA-only labeled player** reported `end-file`. **This is genuine runtime test evidence**, not a user's unassisted 10-cycle usability test or a visual/audio witness. The QA stop at +24 s could be perceived as unexpected termination; only QA-labeled players have that stop.

Do not overclaim M2: the webview showed `sidebarLoaded=true`, but `sidebarReady=false` in the QA record; a second test was interrupted by normal IINA termination (unified log at 14:00:39, no new crash .ips), whose initiator was not established. Sidebar graphics, actual selector interaction, top OSC overlap, and repeatable interaction are still pending. The development plugin was enabled and original Bridge disabled for isolation; source files of the original remain unchanged. No stable promotion.


## Update after user usability complaint: titlebar and missing sidebar (November 7 2026)
The user confirmed Twitch video played but reported (a) an enormous signed CDN URL in the native title bar that wouldn't disappear in fullscreen, (b) no visible Streams plugin panel, and (c) macOS menu-bar preferences and an earlier shortcut did not help. Those earlier suggestions were poorly targeted; the signed URL and the panel communication needed **plugin fixes**.

Implemented on `fix/title-and-streams-sidebar`: in per-player main.js, set mpv's `file-local-options/force-media-title` to `hutchmf — Twitch` on load and file-loaded; in sidebar initialization, register `onMessage` **after** `loadFile` because the 1.5.1 implementation clears all old listeners; in webview JS send defined JSON data; auto-open controls on first playback and preserve desired open/hidden state across core.open() reconnect/window recreation. Official IINA 1.5.1 source was read, not just the API descriptions.

**Real QA evidence**: media-title/force-media-title equal `hutchmf — Twitch`, macOS Accessibility saw an actual player window named `hutchmf — Twitch`, sidebarReady true both before and after quality reconnection, 640×360 video, two audio channels and advancing time. The window-only screenshot attempt was denied by macOS, so rendered UI and native titlebar auto-hide cannot be declared accepted. 12/12 tests pass. Read `docs/BUG-003-title-and-sidebar.md` and sanitized JSON evidence. Native titlebar/window button behavior in IINA 1.5 while sidebars are open is upstream; do not change user-wide preferences without approval.

The dev plugin is still active via symlink; original Bridge is disabled, unchanged. QA auto-stop applies ONLY to specially labeled QA players started via an exact one-shot test request; normal Open Stream sessions have no auto-stop. Review and remove QA harness before production release. No stable plugin was installed.


## Critical update: same-window Twitch quality changes verified in IINA, November 7 around 15:00 EST

The user personally observed the sidebar in IINA, but reported two usability problems: fullscreen title/titlebar overlaps the upper panel, and selecting quality closes the entire playback window and reopens it. They pointed out that IINA's built-in Online Media plugin changes quality without doing this, and explicitly asked to fix the interruption. They also consider the current UI only a first iteration and invite Pro to propose a stronger visual/interaction design grounded in IINA's capabilities, while preserving its lightweight native sensibility.

**Resolution in development:** read the actual installed `io.iina.ytdl` plugin `src/add-video.ts`: it calls `mpv.command("loadfile", [mpv.getString("path")])` for quality. Read IINA v1.5.1 `PlayerCore.open(_:shouldAutoLoad:)`: its network `core.open()` deliberately closes the window. Replaced Streams' `core.open(extractedURL)` with `mpv.command("loadfile", [freshExtractedURL, "replace"])`, retained metadata/quality selection until a real `iina.file-loaded` event, treated end-file as buffering while quality is pending, and added an 18s deadline. **Actual in-app QA passed:** hutchmf 160p30 → 360p30, video resolution 284×160 → 640×360, advancing playback after replacement, same IINA window (1 `window-loaded`, 0 `window-will-close` during switch), sidebarReady remained true, title `hutchmf — Twitch` persisted, no Streamlink orphan. Compare `evidence/tests/m2-same-window-quality-2026-11-07/` and `docs/BUG-004-quality-window-recreation.md`. Independent headless mpv smoke also passed; 12 offline tests pass. The QA-only controller ran with 160p30 start and 360p30 switch, then deliberately stopped its own labeled test player at 24s. Normal user streams have no such stop. No user windows were restarted or closed during this live test; the existing app had zero windows when the test began.

**Still outstanding:** a user-initiated quality change in fullscreen, high-load stream switching and many-cycle longevity, native fullscreen titlebar overlay, screenshot/visual review, click/keyboard/VoiceOver, resources and final packaging/rollback. The earlier user's screenshot documents the titlebar blocking the upper panel; do not dismiss it because the video plays. No global macOS/IINA window preferences were changed. Fix UX with actual IINA native fullscreen behavior, not arbitrary CSS hacks. Do not promote to stable without approval.
