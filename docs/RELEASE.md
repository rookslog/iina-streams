# Release, development, and rollback

This repo uses a separate dev plugin identity `local.iina.streams.dev` and candidate-stable identity `local.iina.streams`. Bridge identity `local.iina.streamlink-bridge` remains untouched.

## Daily work
1. Work within `~/development/iina-streams`; use branches and commits.
2. `./scripts/verify.sh` — offline tests, syntax and manifest checks.
3. `./scripts/preflight.sh --live` — live format check; no playback.
4. `./scripts/link-dev.sh` — link dev source only, no relaunch or enable.
5. When startup crash is under control, manually enable **IINA Streams (Development)** in IINA Preferences > Plugins and manually relaunch IINA after closing test windows. Existing IINA windows belong to user; never automate this without permission.
6. In IINA, Plugin > IINA Streams (Development) > Open Stream… > `https://www.twitch.tv/hutchmf`. To show controls in a created Twitch player, use its Plugin > IINA Streams (Development) > Show Streams Controls entry. **Test actual quality change.**

## Packaging candidate
`./scripts/package-candidate.sh` builds `releases/iina-streams-<version>-rc1.iinaplgz`, associated SHA-256 and source commit. The staged manifest changes only name/identifier to stable. The script refuses to overwrite an existing candidate, so output is immutable. It **does not install anything**. Artifacts under `releases/` are deliberately gitignored; back them up outside of Git when promoting.

## Rollback
- Dev rollback: `./scripts/unlink-dev.sh`; checks exact symlink target before removal, disables dev plugin in preferences. It never force-quits IINA or touches Bridge/stable. A manual application relaunch is needed to completely unload any already-running plugin.
- For a stable deployment **after explicit user approval**: back up previous stable package and preferences, verify artifact hash and identity, install through IINA UI, test startup, playback, clean stop and quality; retain previous package. If regression occurs, disable new stable plugin, restore backed-up package in UI and run acceptance tests. No stable version has been installed by this programme, so a stable rollback is documented but **not yet end-to-end tested**.
- To compare unchanged original Bridge, source is in `evidence/bridge-0.1.0-original/`. Do not edit the installed Bridge while diagnosing.

## Current gate
**NO STABLE PROMOTION APPROVED.** IINA startup crashes remain unresolved. Candidate packaging is not proof of installation, runtime quality, GUI behavior, or user acceptance. No auto updater/CI/GitHub remote exists.

## Manual test matrix after crash triage
- Fresh IINA launch, one Twitch Open Stream, normal window and audio.
- 10 start/stop cycles and 5 on hutchmf live, verify no Streamlink orphans.
- 360p30 → 720p60 → 360p30 within one window; track window/sidebar continuity, PiP, dropped frames.
- Two concurrent Twitch windows with distinct channels; changing one does not alter the other.
- Side bar show/hide, keyboard, VoiceOver, light/dark and no chat connections.
- Offline channel and invalid quality (no app crash), no timer or auto stop.
- Repeat after manual restart, check clean rollback.
