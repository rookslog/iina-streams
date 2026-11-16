# Roadmap

This document tracks the release plan for **Streams** (`local.iina.streams`). Completed releases are recorded in [CHANGELOG.md](../CHANGELOG.md); items below are scoped by semantic version and risk rather than fixed calendar dates.

## Current Baseline — `0.5.3` (Shipped)
- **Playback & Quality:** Direct Streamlink HLS extraction for Twitch live/VOD and YouTube, with in-window `mpv` quality switching (`loadfile … replace`).
- **Chat Overlay & Sidebar:** Directly draggable, edge-snappable, bottom-right corner-resizable glassy overlay with top fade mask, scrollable history, `0%–90%` glass opacity, `2–10px` message spacing slider, and `Timestamps` toggle.
- **Quiet UI & Auth:** Anchored `⚙` settings popover, contextual VOD-only **Import archive…** button, persistent macOS-style On/Off chat switch separated from Twitch Keychain auth (with automatic connect on stream open when signed in).
- **Distribution & Beta Staging:** Repo-root plugin layout (`Info.json` with `ghRepo` / `ghVersion: 2`), `beta` staging build (`npm run install-beta`), and tag-triggered (`v*`) GitHub Release CI.

---

## `0.5.4+` — Reliability, Persistence & Resource Tuning
*Hardening existing features without expanding permissions or platform scope.*

- **Quick `Open Stream…` shortcut:** Built-in `⌥⌘S` (`Meta+Alt+S`) key binding on the global `Open Stream…` menu item (staged in `0.5.4-beta`).
- **Known Issue — Multi-edge & directional overlay resizing:** Support independent top, bottom, left, and right edge dragging (e.g., resizing upward/leftward when snapped to the bottom-right corner, or adjusting width/height independently along a single axis) without `data-clickable` hover-leave or cursor-sticking glitches in IINA's click-through overlay webview.
- **Auth & multi-window resilience:** Verify Twitch Keychain token refresh across long-running sessions and multiple simultaneous player windows.
- **Display & fullscreen geometry:** Clamp saved overlay coordinates and dimensions cleanly across windowed/fullscreen transitions and external display DPI changes.
- **Resource efficiency:** Measure and minimize background WebKit CPU/memory when chat is `Off` or the inspector is collapsed.
- **Repo & docs cleanup:** Retire remaining legacy `candidate` references in `docs/` and `README.md`.

**Gate:** Multi-hour soak check with no orphaned helper processes, verified Keychain persistence across app restarts, and no off-screen overlay drift.

---

## `0.6.0` — New Platform & Chat Capabilities
*Larger features introducing new acquisition pipelines, CSP rules, or rendering paths.*

- **Automatic stream URL interception:** Hook `on_load` at higher priority than IINA's built-in Online Media (`io.iina.ytdl`) plugin so Twitch and YouTube URLs opened via `File → Open URL…` (`⌘⇧O`), drag-and-drop, or CLI automatically launch in Streams without racing Online Media.
- **Automatic Twitch VOD chat:** Integrate a maintained acquisition path (e.g., `TwitchDownloaderCLI` or GraphQL comment replay) so Twitch VODs auto-load chat like YouTube VODs.
- **YouTube Live chat:** Add live chat streaming/polling for active YouTube livestreams (separate from archived VOD replay).
- **Emotes & badges:** Bounded, cached image rendering for official Twitch emotes (and optionally 7TV/BTTV/FFZ) with clean text fallback if images fail.

**Gate:** Real-source integration tests for each new provider, bounded memory/cache limits, and explicit permission/CSP review before release.

---

## Out of Scope / Non-Goals
- Sending chat messages or moderation actions (Streams is strictly read-only).
- Modifying IINA's native seekbar/OSC or patching IINA binaries.
- Unbounded background polling when chat is turned `Off`.
