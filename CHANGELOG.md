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
