# Roadmap

This document tracks the release plan for **Streams** (`local.iina.streams`). Completed releases are recorded in [CHANGELOG.md](../CHANGELOG.md); items below are scoped by semantic version and risk rather than fixed calendar dates.

## Current Baseline — `0.5.2` (Shipped)
- **Playback & Quality:** Direct Streamlink HLS extraction for Twitch live/VOD and YouTube, with in-window `mpv` quality switching (`loadfile … replace`).
- **Chat Overlay & Sidebar:** Directly draggable, edge-snappable, corner-resizable glassy overlay with colored usernames; persistent macOS-style On/Off chat switch in the sidebar.
- **Auth & Replay:** Twitch device-code OAuth with Keychain persistence, and automatic live-chat replay loading for YouTube VODs via `yt-dlp`.
- **Distribution:** Repo-root plugin layout (`Info.json` with `ghRepo` / `ghVersion` for IINA in-app auto-updates) and GitHub Actions CI (`npm test`, `npm run test:py`, `npm run build`).

---

## `0.5.3` — UI Polish & Release Automation
*Small, low-risk fixes from live `0.5.2` testing.*

- **Contextual VOD actions:** Hide **Import archive…** on live streams so it only appears for VODs and recordings.
- **Settings popover:** Replace `•••` with a gear (`⚙`) icon that opens an anchored popover beneath the button (click-outside or `Escape` to dismiss, no layout shift in the sidebar).
- **Overlay legibility & controls:**
  - Lower **Glass opacity** floor from `20%` to `0%` (`0%–90%`).
  - Add a top fade `mask-image` on overlay messages to prevent hard-clipped lines at the top edge.
  - Replace the `Compact / Comfortable` dropdown with a **Message spacing** slider (`2px–10px` gap).
  - Add a **Timestamps** toggle (default off for live chat, on for VOD replay).
  - Support trackpad/mouse-wheel scrolling inside the overlay while preserving click-and-drag movement.
- **Release workflow:** Add a tag-triggered (`v*`) GitHub Release job in `.github/workflows/ci.yml` that attaches `iina-streams-<version>.iinaplgz`, and bump `ghVersion` in `Info.json` on each release.

**Gate:** Visual check in live IINA (windowed + fullscreen, light + dark, narrow sidebar) and all JS/Python unit tests green.

---

## `0.5.4+` — Reliability, Persistence & Resource Tuning
*Hardening existing features without expanding permissions or platform scope.*

- **Auth & multi-window resilience:** Verify Twitch Keychain token refresh across long-running sessions and multiple simultaneous player windows.
- **Display & fullscreen geometry:** Clamp saved overlay coordinates and dimensions cleanly across windowed/fullscreen transitions and external display DPI changes.
- **Resource efficiency:** Measure and minimize background WebKit CPU/memory when chat is `Off` or the inspector is collapsed.
- **Repo & docs cleanup:** Retire remaining legacy `candidate` references in `docs/` and `README.md`.

**Gate:** Multi-hour soak check with no orphaned helper processes, verified Keychain persistence across app restarts, and no off-screen overlay drift.

---

## `0.6.0` — New Platform & Chat Capabilities
*Larger features introducing new acquisition pipelines, CSP rules, or rendering paths.*

- **Automatic Twitch VOD chat:** Integrate a maintained acquisition path (e.g., `TwitchDownloaderCLI` or GraphQL comment replay) so Twitch VODs auto-load chat like YouTube VODs.
- **YouTube Live chat:** Add live chat streaming/polling for active YouTube livestreams (separate from archived VOD replay).
- **Emotes & badges:** Bounded, cached image rendering for official Twitch emotes (and optionally 7TV/BTTV/FFZ) with clean text fallback if images fail.

**Gate:** Real-source integration tests for each new provider, bounded memory/cache limits, and explicit permission/CSP review before release.

---

## Out of Scope / Non-Goals
- Sending chat messages or moderation actions (Streams is strictly read-only).
- Modifying IINA's native seekbar/OSC or patching IINA binaries.
- Unbounded background polling when chat is turned `Off`.
