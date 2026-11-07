# IINA Streams — Executable Product & Engineering Specification
Version: draft 0.1 | 2026-11-07 | Status: proposal / pre-implementation | Primary OS: macOS on Apple M4

## 0. Status and evidence discipline
This is a versioned specification, not a claim that working plugin code has been shipped. The existing separate Streamlink Bridge 0.1.0 on Apollo was reported broken by the user. It was syntactically validated, but no IINA-level end-to-end verification was recorded. Root cause remains UNCONFIRMED. Never silently reuse unverified code. Inspect IINA Window > Log Viewer and Plugin > Developer Tool first. IINA's dev guide calls the global manifest key globalEntry; a separate documentation example uses global; bundled working plugins contain both variants. Verify against IINA 1.4.4 rather than assuming either is the cause.

Verified 2026-11-07 on Apollo: IINA 1.4.4, Streamlink 8.6.3, mpv 0.41.0, yt-dlp 2026.08.19. Streamlink lists the live Twitch channel https://www.twitch.tv/hutchmf with formats 160p30, 360p30, 480p30, 720p60, 1080p60 at the time checked. Availability may change. Read-only command-line Streamlink playback tests with other Twitch channels previously worked, but that does not validate the IINA plugin.

## 1. Product intent
Make IINA a practical lightweight desktop player for public Twitch streams and YouTube live/video URLs, with an optional read-only chat pane. The experience should feel like IINA: minimal controls until needed, fast keyboard interaction, system typography, restrained separators, dark/light appearance, sensible focus behavior, and no mandatory Electron app, browser tab, full Twitch embed, or terminal invocation. The user can watch YouTube and Twitch at the same time in separate IINA windows without unnecessary duplication of controllers.

Primary acceptance channel: https://www.twitch.tv/hutchmf. If offline, use a transparently identified live backup for technical tests, then re-verify against hutchmf when available.

## 2. Core user flows
A. Fresh IINA launch, no media: single action Plugin > Streams > Open Stream… opens URL entry; paste twitch.tv/hutchmf; playback begins in a normal IINA player window. No requirement to run Streamlink manually.
B. Repeat use: re-open most recent stream or paste a URL; optional keyboard shortcut. Saving history locally requires clear consent in preferences.
C. Playback: regular IINA controls, PiP if supported, hardware decoder auto; stream-specific quality and latency settings appear contextually in one Streams sidebar tab.
D. Chat: off by default; optional Show Chat toggle; first use explains necessary platform authorization; chat remains read-only; turning off closes chat connection and halts updates. Emotes optional and disabled by default in low-memory mode.
E. Failure: actionable UI for offline channel, missing binary, network interruption, account/permission requirement or unsupported content; no stuck spinner; no ghost helper after closing.
F. Closing: stopping or closing a specific stream cleans up only its own resources, never other IINA windows or Safari.
G. Unsupported URL: fall back to IINA's Online Media/yt-dlp behavior or show a clear unsupported message, never invoke a shell on untrusted input.

## 3. UI and visual contract
Use one Streams plugin, not three menu entries for essentially the same action. Global menu has at most Open Stream… and optional Open Recent; active player gets a sidebar tab titled Streams. First playable release can use native IINA prompt while a richer entry panel is developed.
Sidebar content is a small local HTML/CSS/JS webview embedded through the official iina.sidebar API. Use a vertical, compact layout:
  Header: channel title, provider, live badge, connection state.
  Controls: quality [Auto / available formats], latency mode [later], Chat [On/Off].
  Chat region: bounded text messages, color-coded usernames, no avatars by default, reduced motion, fast hide.
Avoid touching the built-in seek scrubber or modifying IINA's native toolbar: injection points are not documented in the stable public plugin API. Contextual quality controls belong in the sidebar or a small custom overlay, with keyboard shortcuts if justified. A different quality may force a brief stream reconnect; describe the interruption.
Match sidebar spacing, native vibrancy where possible, dark/light palettes, typography, accessibility contrast, focus ring, VoiceOver labels; aim for a narrow panel without horizontal scrolling. Use a simple implementation before considering React/Vue: a framework-heavy webview adds bytes and complexity for little benefit.

## 4. Provider routing / format
Twitch live -> Streamlink (Twitch-specific plugin, HLS, quality/codec options).
YouTube Live -> evaluate Streamlink first and yt-dlp fallback only after empirical compatibility testing. Streamlink supports YouTube Live, but not ordinary YouTube VOD.
YouTube VOD -> IINA's yt-dlp Online Media path.
Twitch VOD -> benchmark Streamlink and yt-dlp for seeking; choose on observed reliability.
Local media -> leave to IINA without interception.
Keep provider detection separate from stream transport, playback state, chat source, and UI. The user interacts with Streams, not with extractor brand names. Do not claim Streamlink intrinsically uses less RAM than yt-dlp: extractor overhead and playback topology differ.

## 5. Architecture and high-risk spike
Plugin:
  global entry: one launch action, preferences, optional window creation via iina.global.
  main entry: per-player state, core/open, events, sidebar, per-session quality/chat state.
  UI webview: local assets, minimal JS; communicate via sidebar postMessage/onMessage.
  provider adapters: URL normalization, service detection, safe quality availability.
  process controller: explicit session id, child lifecycle, stderr parsing, redacted logs, cleanup.
  chat adapters: Twitch first, YouTube later; no provider calls if chat off.
  quality controller: change quality with reconnect and retained player state.

Transport option A, bootstrap: Streamlink --player IINA's iina-cli --player-args="--stdin --mpv-hwdec=auto". This is known to play Twitch in a terminal test, but may create a separate IINA process/window and obscure lifecycle control.
Transport option B, integration spike: Streamlink's localhost-only HTTP server mode (explicit 127.0.0.1 interface, random unused port) and open the loopback URL in an IINA-managed player. Requires a robust process supervisor, readiness handshake, port ownership, session-to-window mapping, safe shutdown, and no broad network bind. Streamlink's external HTTP defaults can expose listeners beyond loopback; explicitly constrain the interface.
Choose A for first release only if actual IINA-plugin launch and close tests pass. Prefer B only if lifecycle and quality switching tests justify its extra engineering and process overhead.
IMPORTANT: iina.utils.exec returns a Promise for completion, but not a straightforward subprocess handle. Do not build quality switching or cleanup on assumptions about child PID control; demonstrate the controller prototype first. Never use killall IINA, pgrep-based mass kill, a shell command built from URLs, or a fixed global local port.

## 6. Chat: smallest credible implementation
Twitch official EventSub is preferred for new integrations; Twitch IRC is documented but limited and requires OAuth chat:read. A read-only chat client still needs authorization under the documented IRC flow. Provide an explicit Connect Twitch interaction, documented OAuth scopes, secure Keychain storage, refresh/revoke UX, no token in logs or configuration files, and no messaging capability in V1. Do not scrape Twitch webpages or invent anonymous endpoints.
The renderer holds at most 150 recent messages by default (configurable cap 50–250); batch UI updates up to 5 Hz, stop timers when hidden, discard old DOM nodes, avoid avatars and animated emotes in minimal mode. Disconnect fully on Off and on stream close. Webview process overhead must be measured; don't claim memory instantly returns just because it is hidden.
YouTube Live chat requires a distinct adapter to Google's Live Chat API, credentials/quota checks, and mapping the live broadcast to its liveChatId. Treat as a later gated feature. No chat for recorded VOD in V1.
If API credentials cannot be obtained, chat is deferred, but the video release remains usable. Never pressure the user to grant broader permissions than necessary.

## 7. Quality, decoder, latency, energy
Default quality Auto or a configurable 720p60 cap. Offer only currently available formats; no hardcoded 1080p promise. Changing quality may reconnect. User-set quality persists per session; a preference may set the default.
Request hardware video decoding via mpv/IINA Auto/VideoToolbox when supported; verify actual decoder path where possible. Safari also uses hardware decoding: battery savings must be measured, not inferred from low CPU samples alone.
Advanced options such as low-latency HLS and non-h264 Twitch codecs must be opt-in, guarded by compatibility tests and reverted on failure. Prefer stable buffer behavior over maximum freshness for background watching.

## 8. Reliability, performance and security requirements
- Exact primary functional requirement: paste https://www.twitch.tv/hutchmf, start without Terminal, get video/audio, close normally with no orphan Streamlink process. Repeat after relaunch.
- Handle offline channel, interrupted network, unavailable format, Twitch token/rate limit, IINA relaunch, simultaneous streams, stale port, plugin disable.
- Validate URL scheme and service hostname, restrict to accepted patterns; never interpolate untrusted input into a shell; use argv.
- Use only local packaged UI assets; no analytics, telemetry, or external fonts; no network calls while chat off except video source.
- Authentication optional, permission requests explicit, Keychain storage for credentials; no secret logging; include redaction tests.
- Do not modify IINA executable or other applications. Disable/unlink must restore previous behavior.
- Performance benchmarking: compare matched hutchmf in Safari and IINA at same stream codec, quality and frame rate, if feasible. Warm 2 minutes, sample 5-minute periods, repeat at least three times in comparable conditions. Report app plus helper + WebKit memory footprint, resident RAM with caveats, system memory pressure, swap in/out rate, CPU, dropped frames, optional Energy Impact/battery when safe and measurable. Do not equate accumulated swap used with active swapping.
- Initial provisional chat budget: <=100 MiB incremental median process footprint and <=2 percentage points incremental sustained CPU at 720p60 relative to video-only. Gate targets may change once observed baseline is collected; report evidence and approval of any change. Video must not be substantially worse than Safari in total resource impact; quantify rather than assume.
- Avoid sustained multiple 1080p experiments on 16-GB Apollo. Never restart Safari or close unrelated browser tabs during tests.

## 9. Test strategy and release gates
Tests:
  T0 static: manifest schema (both IINA-1.4-relevant fields), syntax/types, code format, no secret patterns.
  T1 provider fixtures: Twitch URL normalization, offline/invalid URLs, duplicate channels, quality matching and fallback.
  T2 plugin load: real IINA 1.4.4 log viewer shows plugin loaded, correct permission prompt, single menu action; log/screenshots retained.
  T3 real playback: at least 10 start/stop cycles on a live source; 5 on hutchmf when live; clean player/session ownership, audio/video, no process leakage; test both empty player and existing IINA windows.
  T4 failure injection: unplug/reconnect network temporarily only in an isolated test context, or use controlled invalid/mock endpoints instead of changing Apollo's overall network; offline/timeout/quality errors; coherent feedback.
  T5 UI: light/dark, keyboard and VoiceOver, sidebar hide/show, no phantom webview background work.
  T6 chat: use a prerecorded synthetic message fixture first; then authorized real Twitch chat; high-message burst test (bounded DOM and capped queue), chat off produces zero chat network activity.
  T7 release comparison: matched Safari versus IINA measurements with source/codec/method/time annotated; retain raw sample summary and analytical interpretation.
  T8 package/rollback: install signed/identified package if relevant, restart, play, uninstall/rollback to last known good, retain user preferences safely.
Use reproducible tests that don't rely on a live channel being online in CI; keep live checks as optional manual integration tests. Evidence is not a test title: store command, result, timestamp, version, failure, and comparison.

## 10. Release ladder and explicit decision gates
M0 Diagnosis / groundwork (no release): record how deployed Bridge fails, preserve a baseline copy, isolate loading/launch bug, test transport design, set up local Git repo and quality gates. Exit: observed failure with evidence OR a bounded diagnosis record saying why reproducing was impossible.
M1 v0.1 First genuinely usable release: installable Streams plugin with one Open Stream action and real Twitch playback via hutchmf, stop/close cleanup, offline message; 720p default or Auto; no chat. Gate: user sees working playback, T0–T4 pass, simple rollback demonstrated. This is the earliest 'ship something useful' milestone.
M2 v0.2 IINA-native player integration: sidebar appears, quality controls, selection/fallback, persistent setting, keyboard ergonomics. Gate: quality switch and multiwindow isolation; user UX feedback captured; no significant idle cost.
M3 v0.3 Optional Twitch read-only chat: hide/show, auth/Keychain, minimal chat renderer and message cap. Gate: user consents to Twitch OAuth; T5/T6 pass; off means no chat network activity; budget measured.
M4 v0.4 Unified YouTube Live/VOD routing: Streamlink vs yt-dlp tested by live/recorded behavior, fallback; YouTube chat deferred if credentials/quota not available. Gate: regression matrix, no extra burden for Twitch-only use.
M5 v1.0 Stable candidate: reliability soak, memory and energy characterization, docs/install/rollback, archival of evidence and release notes, no severe unresolved bugs. Gate: user accepts evidence and explicitly promotes release candidate to stable. Optional v1.1 YouTube chat, emotes, overlay, provider expansion only if measured/justified.
No milestone can promote because compilation or syntactic validation alone succeeded.

## 11. Feedback and decision protocol
At each milestone create a short REVIEW record with date, git SHA, versions, screen/state description, what passed/failed, limitations, memory samples, four explicit choices: Accept / Revise / Roll Back / Defer. Capture feedback as issue-like markdown files; do not overwrite previous decisions. Each user-visible change gets a CHANGELOG note, rollback reference and test evidence. If the user doesn't approve promotion, keep stable installed version unchanged. If blocked, preserve partial tests and state exact missing credential, permission, reproduction or comparison.

## 12. Development and distribution workflow
Local source: /Users/rookslog/development/iina-streams (same folder as ~/Development on the case-insensitive volume). Git repo starts private and local; no GitHub remote or OAuth credentials created without explicit request. Branches main (reviewed source), feature/*, release/*, hotfix/*. Commit small changes with linked acceptance evidence; never code directly inside the installed plugin package.
Dev installation: IINA's documented iina-plugin link <plugin-dir> command creates a .iinaplugin-dev symlink; reload IINA for plugin source updates. Keep distinct identifiers for development and stable builds, and preserve the old Bridge separately for forensic comparison. Dev install is manual/controlled to avoid sudden application restarts.
Release: run checks; pack into .iinaplgz using iina-plugin pack; create immutable artifact and SHA-256 hash; smoke test; record evidence; manual gate for stable install. Back up stable package and settings before replacement. Disable development build after release. GitHub releases and automated update checks (ghRepo / ghVersion) can come later but should propose updates rather than silently update active playback.
Rollback: disable the new package, restore the previous package/version and local prefs, verify playback; do not affect Safari, IINA binaries or existing user files. Versioned releases are retained.

## 13. Decisions & open questions
D-001: first deliverable is real live playback, not chat or full UI; accepted by project spec, subject to user review.
D-002: avoid iframe/whole Twitch chat website due to unverified memory overhead; build lean chat adapter after M1.
D-003: do not fork IINA or manipulate native scrubber until plugin API proves insufficient and user approves larger scope.
OPEN: is the current Bridge missing menu items, failing after click, or failing during startup? Needs reproduction.
OPEN: best transport for reliable controlled quality changes (external player versus loopback HTTP). Prototype and compare.
OPEN: quality default Auto vs 720p60; user preference.
OPEN: preferred Twitch OAuth setup and token expiry UX; required only when chat enabled.
OPEN: acceptable initial memory/energy budgets after controlled measurement.
OPEN: IINA 1.5 upgrade compatibility; target 1.4.4 first, test separately.
OPEN: YouTube Live chat authorization and API quota before promising delivery.

## 14. Source and version evidence
IINA plugin API: https://docs.iina.io/
IINA Creating Plugins, dev symlinks: https://docs.iina.io/pages/creating-plugins
IINA Development Guide, manifest/perms/debugging: https://docs.iina.io/pages/dev-guide
IINA SidebarView: https://docs.iina.io/interfaces/IINA.API.SidebarView
IINA Global plugin entry: https://docs.iina.io/pages/global-entry.html
Streamlink player support and stdin: https://streamlink.github.io/latest/players.html
Streamlink CLI modes incl external HTTP: https://streamlink.github.io/cli.html
Streamlink Twitch codecs: https://streamlink.github.io/cli/plugins/twitch.html
Twitch chat IRC auth: https://dev.twitch.tv/docs/chat/irc
Twitch chat guidance: https://dev.twitch.tv/docs/chat/
YouTube Live Chat streaming API: https://developers.google.com/youtube/data/live/reference/rest/v3/liveChatMessages/streamList
Evidence confidence: official docs and actual Apollo package versions checked 2026-11-07. Proposed compatibility and resource budgets remain hypotheses until IINA-level tests.
