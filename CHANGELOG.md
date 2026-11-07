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
