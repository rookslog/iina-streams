# IINA Streams

A local-first, lightweight streaming plugin project for IINA on macOS.

**STATUS: SPECIFICATION ONLY; NO FUNCTIONAL PLUGIN RELEASED FROM THIS REPO.**

Primary acceptance source: https://www.twitch.tv/hutchmf

Read [docs/SPEC.md](docs/SPEC.md) and [docs/ROADMAP.md](docs/ROADMAP.md) before writing code. The current installed Streamlink Bridge is a separate broken prototype and is not modified by this repository. No new plugin is currently linked to IINA.

## First release target

v0.1: select Open Stream in IINA, paste hutchmf, watch live Twitch video, close cleanly. No terminal; proven end-to-end. Later releases can add sidebar, quality, chat and YouTube Live.

## Local development

Code will live beneath this directory, with a separate development plugin ID. IINA supports local dev linking via its bundled iina-plugin link command; it has NOT been run yet.

Run safe read-only preflight (does not launch playback):
    ./scripts/preflight.sh

Optional network-only Streamlink channel resolution (does not launch player):
    ./scripts/preflight.sh --live

Manual packaging and stable deployment are gated on tested acceptance evidence and explicit promotion. Never overwrite an installed plugin directly.

## Files

- docs/SPEC.md — scope, architecture, UX, requirements, evidence, risks, releases.
- docs/ROADMAP.md — milestone-by-milestone completion and feedback gates.
- docs/BUG-001.md — deployed prototype failure investigation.
- docs/DECISIONS.md — dated decisions, questions and revisions.
- scripts/preflight.sh — read-only environment and optional live-availability test.
- evidence/ — test evidence without secrets.
- releases/ — local immutable package artifacts (not tracked by git).

No external GitHub repository or auto-updater has been enabled.
