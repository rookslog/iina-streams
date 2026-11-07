# IINA Streams

Lightweight Twitch/YouTube playback integration for the native IINA macOS player.

**STATUS (2026-11-07): M2 development candidate implemented; runtime release gates NOT met due unresolved IINA startup crashes. No stable plugin promoted.** The original Streamlink Bridge remains unchanged.

Primary acceptance stream: https://www.twitch.tv/hutchmf

## Project layout

- `plugin-dev/` — development IINA plugin, separate identity `local.iina.streams.dev`.
- `plugin-dev/global.js` — one Open Stream action; short Streamlink extraction; isolated IINA player creation.
- `plugin-dev/main.js` — per-player quality and lazy sidebar controller.
- `plugin-dev/ui/` — local CSS/HTML/JS sidebar; no framework, no chat connection.
- `plugin-dev/src/` — provider routing and Streamlink JSON format selection.
- `tests/` — pure helpers and mocked plugin-runtime interaction tests.
- `scripts/verify.sh` — offline checks.
- `scripts/preflight.sh --live` — channel availability, no playback.
- `scripts/link-dev.sh` / `scripts/unlink-dev.sh` — safe dev lifecycle, no app restart.
- `scripts/package-candidate.sh` — candidate archive and checksum, no install.
- `scripts/resource-snapshot.sh` — read-only resource snapshot.
- `docs/INVESTIGATION-2026-11-07.md` — crash signatures, Bridge forensic analysis, architectural rationale.
- `docs/RELEASE.md` — manual testing, gates and rollback.
- `docs/PERFORMANCE.md` — what was measured, and what was not.
- `docs/reviews/M0-M2-2026-11-07.md` — milestone decision record.
- `HANDOFF-GPT6-PRO.md` — full next-session execution and audit brief.
- `evidence/bridge-0.1.0-original/` — unchanged failed plugin.
- `releases/` — candidate archives, ignored by Git.

## Reproducible checks

```sh
cd ~/development/iina-streams
./scripts/verify.sh
./scripts/preflight.sh --live
```

For development install after resolving the IINA startup-crash issue: `./scripts/link-dev.sh`; manually enable the development plugin and relaunch IINA. To roll back development linkage: `./scripts/unlink-dev.sh`. These operations do not touch stable IINA, existing Bridge or Safari. See [docs/RELEASE.md](docs/RELEASE.md) before GUI testing.

The critical missing evidence is **real extended UI playback and repeated quality switching with no IINA crash**. Static unit tests, a short real IINA file-loaded test, and an mpv headless decoder check do not establish M1/M2 acceptance.

## Latest November 7 runtime update
The new `fix/closed-loop-m2-validation` branch corrected IINA's real `network-request` and `allowedDomains` permission errors and demonstrated 360p30 Twitch playback initialization and a same-resolution quality reconnect inside IINA. **The user reported that the stream began working.** The user's latest screenshot also shows native top-bar interference with the sidebar; tracked in `docs/BUG-002-OSC-SIDEBAR.md`. Full M2 acceptance still requires the sidebar bridge, visual controls, normal 10 start/stop cycles, isolation, and performance validation. The prior rc1 archive is missing essential permissions and must not be deployed.


## November 7 usability fix — native title and working sidebar
Current development source on `fix/title-and-streams-sidebar` opens Twitch with **hutchmf — Twitch** as the native IINA media title. IINA Streams controls appear automatically on the first file load in a new Twitch player; use **Hide controls** to dismiss them and **Plugin > IINA Streams (Development) > Show Streams Controls** to reopen. The panel can be on either side depending on IINA's Layout settings.

Verified on IINA **1.5.1 build 183** with real hutchmf playback: sidebar's webview now sends its ready signal, available qualities populate, quality reconnection reattaches the sidebar, and the title remains friendly. macOS Accessibility saw an actual player window named `hutchmf — Twitch`. See [BUG-003](docs/BUG-003-title-and-sidebar.md) and its sanitized QA evidence. A rendered screenshot / human interaction test is still outstanding because window capture was denied.

The full-screen **native title bar** may remain visible while IINA 1.5's sidebars are displayed. That behavior belongs to IINA's layout; hiding the controls sidebar is a reversible way to compare. No global macOS/IINA UI preferences were modified.


## Same-window quality switching update (November 7)
**The current development branch changes Twitch quality without recreating IINA's window.** The official Online Media plugin uses the same mpv-level loadfile mechanism. Confirmed in a real IINA 1.5.1 run: hutchmf 160p30 switched to 360p30; resolution changed, playback resumed, sidebar remained connected, and no window-close event was observed. See `docs/BUG-004-quality-window-recreation.md`.

For interactive use, start a fresh Twitch stream with the currently linked development plugin, show the Streams panel, and change quality there. Do not use the old rc1/rc2 release archives: they predate the fix. The native titlebar overlap in fullscreen and the aesthetics of the first M2 panel remain user-reported defects for the Pro continuation. No accepted stable plugin was promoted.
