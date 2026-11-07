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
