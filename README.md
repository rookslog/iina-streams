# IINA Streams — candidate portfolio

**Status: 2026-11-08. Unified and Focus are isolated development candidates (source version 0.5.0). Final native evidence, resource results, and the acceptance ledger are still being assembled. No stable deployment is authorized by these build/install instructions.**

This work continues the existing IINA Streams implementation. The operational `plugin-dev/` source is retained as a baseline; the current portfolio lives in `candidate-plugin/`. Native tests and source review determine acceptance, not a successful archive build alone.

## Candidates and identities

| Build | Plugin identifier | Purpose |
| --- | --- | --- |
| Unified | `local.iina.streams.candidate.unified` | Persistent playback controls and chat in a unified inspector. |
| Focus | `local.iina.streams.candidate.focus` | Contextual Playback/Chat presentation with the shared playback/replay foundation. |
| QA harness | `local.iina.streams.qa` | Explicitly configured native test players and diagnostics. Excluded from ordinary candidate archives. |
| Existing development baseline | `local.iina.streams.dev` | Retained original implementation; the candidate manager does not install or remove it. |

Both candidates share public Twitch live/VOD and YouTube video/live acquisition, Auto with a 720p H.264 preference, actual-format quality choices, synchronized imported chat replay, sidebar/overlay presentation, and optional read-only Twitch chat authorization. Availability and native behavior depend on the provider and host. YouTube live chat is not connected. Automatic archived-chat retrieval is implemented for public YouTube replays exposed by yt-dlp; Twitch replay currently uses an authorized imported archive. TwitchDownloader-format JSON, yt-dlp live-chat replay JSONL, and the project's normalized replay format are supported by the importer.

Live Twitch chat requires a registered public client ID and the user's explicit device authorization. The candidate requests read-only chat access; it does not post messages. Authorization, denied/revoked access, Keychain behavior, genuine archive playback, and lifecycle checks must be reported separately from mocked tests. No auth success is implied by this README.

## Build and offline checks

On Apollo, the isolated working tree is `/Users/rookslog/development/iina-streams-candidates`. The existing `/Users/rookslog/development/iina-streams` and adjacent design tree remain separate.

The current environment uses IINA 1.5.1 build 183. Media extraction expects `/opt/homebrew/bin/streamlink`, `/opt/homebrew/bin/yt-dlp`, and `/opt/homebrew/bin/node`. Runtime helpers select `/opt/homebrew/bin/python3` when available, otherwise `/usr/bin/python3`; the helper source supports Python 3.9. These commands do not install dependencies.

```sh
cd /Users/rookslog/development/iina-streams-candidates
/opt/homebrew/bin/node --test tests/*.test.js tests_candidate/*.test.js
/usr/bin/python3 -B -m unittest discover -s tests_candidate -p 'test_*.py'
/usr/bin/python3 -B scripts/build-candidates.py --output dist/candidates
```

The builder writes `dist/candidates/streams-unified.iinaplugin`, `streams-focus.iinaplugin`, the two versioned `.iinaplgz` ZIP archives, and `build-manifest.json`. The manifest records source-file and archive SHA-256 hashes plus the repository HEAD when available. HEAD alone does not identify uncommitted content; preserve the file hashes with the tested build. Rebuilding replaces recognized generated outputs in the selected output directory. Keep final reviewed artifacts in a separate versioned directory before another build.

Ordinary packages contain `qa:false`, use only candidate identifiers, and exclude `qa-harness.js`. `--qa-config` produces a separate QA build; it is not an ordinary installation route. Archive structure/integrity tests do not establish IINA's GUI archive-installer compatibility. Development links below provide the explicit candidate installation path.

**Retired command:** `scripts/package-candidate.sh` now fails closed with exit status 2. Its inherited implementation copied `plugin-dev/`, rewrote the identifier to `local.iina.streams`, and validated the old 0.2.0 package. Such an archive could collide with a stable plugin when installed. Use `build-candidates.py` for this portfolio. Inherited `link-dev.sh`, `unlink-dev.sh`, and `verify.sh` target the original baseline and are not candidate lifecycle/full-suite commands.

## Install, inspect, and roll back candidate links

The manager requires explicit absolute source and plugin directories. It validates candidate identities/configuration, rejects foreign destinations and duplicate installed identities, and changes only the selected candidate development links. It does not enable plugins, relaunch IINA, or change existing stable/development/design/QA installations.

Review the exact link operations first:

```sh
/usr/bin/python3 -B scripts/manage-candidates.py install --dry-run \
  --plugins-dir '/Users/rookslog/Library/Application Support/com.colliderli.iina/plugins' \
  --source-dir /Users/rookslog/development/iina-streams-candidates/dist/candidates
```

Create those candidate links:

```sh
/usr/bin/python3 -B scripts/manage-candidates.py install \
  --plugins-dir '/Users/rookslog/Library/Application Support/com.colliderli.iina/plugins' \
  --source-dir /Users/rookslog/development/iina-streams-candidates/dist/candidates
```

Add `--variant unified` or `--variant focus` to select one candidate. The default selects both. Enable the desired candidate through IINA's plugin controls when ready to test. Use **Open Stream — Unified…** or **Open Stream — Focus…** in that candidate's Plugin menu and enter a public Twitch channel/VOD or YouTube video URL. Use the candidate's **Show Streams** action to reopen its controls. Choose chat import/connect explicitly; ordinary playback starts with chat Off.

Inspect linkage by replacing `install` with `status` in the same command. Roll back using the same source directory:

```sh
/usr/bin/python3 -B scripts/manage-candidates.py rollback \
  --plugins-dir '/Users/rookslog/Library/Application Support/com.colliderli.iina/plugins' \
  --source-dir /Users/rookslog/development/iina-streams-candidates/dist/candidates
```

Rollback removes only exact, owned links to the selected candidate folders. It leaves generated packages and plugin data intact. Close any owned candidate player before unloading its plugin. Use the explicit Forget action if saved Twitch authorization should be removed/revoked; deleting a development link is not credential revocation. Stable adoption remains a separate user decision and is not implemented by the candidate manager.

## Reproducible resource observations

Read [the methodology](docs/RESOURCE-METHODOLOGY.md) before comparing runs. The sampler queries an existing process; it does not operate IINA or Safari. Replace `12345` with the observed IINA application PID and preserve the JSON output:

```sh
/usr/bin/python3 -B qa/measure-resources.py --pid 12345 --label unified-chat-off \
  --duration 20 --interval 2
```

The sampling deadline is capped at 30 seconds. Warm up playback separately and use equal durations across conditions. Output includes exact UTC timestamps, actual elapsed/collection times, sampler hash, installed app/OS/hardware metadata, native `ps` CPU/RSS readings, WindowServer, memory-free percentage, swap allocation, and VM counter deltas when available. Query failures are explicit; network overhead remains unmeasured.

Only verified descendants of the supplied app PID enter its automatic process total. WebKit processes with unclear ownership appear separately. If independent lifecycle evidence identifies an XPC WebKit helper, supply its PID with `--helper-pid`; its starting identity is checked during sampling and its operator attribution remains explicit. Never assign all WebKit processes to the candidate. The IINA process can include other players, and a Safari process can include other tabs.

Use `--app safari --pid 12345` for an existing, independently identified Safari process. A comparison requires matching the actual source/segment, decoded codec/quality/fps/audio, video viewport, and chat state. Unmatched samples do not justify an improvement claim.

Optional `--metadata-file /absolute/workload.json` accepts a small JSON object with allowlisted workload fields such as `candidate`, `pluginIdentifier`, `mode`, `sourceURL`, `quality`, `videoCodec`, `videoWidth`, `videoHeight`, `videoFps`, `audioCodec`, `hardwareDecode`, `playbackPosition`, `playbackSpeed`, `windowWidth`, `windowHeight`, `sidebarWidth`, `fullscreen`, `archiveId`, `rowLimit`, and `notes`. Supply observed public workload facts, never credentials. URLs must be canonical public Twitch/YouTube source URLs; signed media URLs and arbitrary nested data are rejected.

## Evidence and current limits

Final native screenshots, playback/quality/replay and lifecycle matrices, accessibility observations, resource readings, matched-browser conditions, archive-installer verification, and the acceptance ledger remain pending final consolidation. The QA harness and synthetic fixtures support diagnosis; they are not substitutes for genuine public media/chat or authorization evidence. No battery, energy-efficiency, long-session stability, or performance advantage is claimed here.

The media resolver restricts Twitch CloudFront access to the observed distribution `d2vi6trrdongqn.cloudfront.net`. Another legitimate distribution can fail with `UNSAFE_MEDIA_URL` until independently verified. YouTube transport is restricted to HTTPS on `googlevideo.com` and its subdomains. Provider access, formats, live availability, archived chat, and expiring media addresses can change.

Current source map:

- `candidate-plugin/src/`: playback/source state, per-player lifecycle, replay, authorization, bridge, and helper I/O.
- `candidate-plugin/helpers/`: bounded media resolution, replay import/acquisition, and owned helper supervision.
- `candidate-plugin/ui/`: local sidebar and overlay presentation.
- `tests_candidate/`: candidate contract and safety tests; `tests/`: inherited baseline tests.
- `qa/`: isolated native diagnostic controls and resource sampling.
- `scripts/build-candidates.py` / `manage-candidates.py`: candidate build and reversible link management.
- `docs/superpowers/plans/2026-11-08-candidate-portfolio.md`: implementation plan and scope.
