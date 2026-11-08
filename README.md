# IINA Streams — Unified and Focus

**Two isolated native candidates, version 0.5.0.** Unified keeps playback and chat together; Focus uses a quieter Playback/Chat inspector with overlay-oriented defaults. Both share the same playback, authorization, replay, and overlay engine. Chat starts Off, and stable promotion remains a separate user decision.

Start with the [selection report](docs/SELECTION-REPORT.md) for the comparison and recommendation, the [evidence appendix](docs/EVIDENCE-APPENDIX.md) for observed native results, and the [current continuation handoff](docs/CONTINUATION.md) for exact recovery state. The [commission audit](docs/COMMISSION-AUDIT.md), [resource results](docs/RESOURCE-RESULTS.md), and [preservation audit](docs/PRESERVATION-AUDIT.md) provide the detailed qualifications. `HANDOFF-GPT6-PRO.md` is preserved historical context.

## Current source and packages

The production-code commit is **`127f6b98587bbdb8a6f2c532ad2a97665b4a7611`** on `feature/candidate-portfolio-20261108`. Apollo's 20:21 UTC full source checks passed **143 JavaScript tests and 103 Python tests**, including the latest correction that preserves default chat following through native layout/focus scrolling without overriding deliberate history navigation. The saved logs are `evidence/tests/node-final-follow.txt` and `evidence/tests/python-final-follow.txt`; exact digests and timing are in [CONTINUATION.md](docs/CONTINUATION.md).

| Candidate | Plugin identifier | Native sidebar | Archive | SHA-256 |
| --- | --- | --- | --- | --- |
| Streams Unified Candidate | `local.iina.streams.candidate.unified` | Streams Unified | `iina-streams-unified-0.5.0.iinaplgz` | `1ed65ddfe68d2c82066af91e7b0aa9520926fc0b02c19ffb3864cc35d0104726` |
| Streams Focus Candidate | `local.iina.streams.candidate.focus` | Streams Focus | `iina-streams-focus-0.5.0.iinaplgz` | `642b1cbace5180cc6e176b15eb82e84a1fa0371c6e20d11c6afc55ca878c0d24` |

Archives and `build-manifest.json` are in `dist/candidates`. Both normal archives contain 25 runtime files, `qa:false`, their separate candidate identifiers, and no QA harness or command-file polling. The QA installation and its enable preference have been retired; inactive diagnostic data remains for evidence. No stable `local.iina.streams` plugin was installed.

**Both final R2 archives are installed and enabled on Apollo.** Each installed candidate's 25 files match its exact archive above; both have `qa:false` and no QA harness. Normal-menu testing completed six Focus child open/close cycles, including the smoke cycle, and five Unified cycles. Every cycle passed eleven checks preserving its paused anchor's identity, frame, title, window set, and IINA process `55428`. These are bounded ordinary-YouTube observations. Older `b3b5f07` archives and their manifest remain preserved in `dist/checkpoints/b3b5f07`.

**Final native disposition:** both candidate test windows are closed, both normal plugins remain enabled, QA is absent, and IINA process `55428` remains with its initial window ready for comparison. Focus's exact owned window closed at 20:40:16 UTC. Unified's actual Off button passed five native checks at 20:54:14, followed by confirmed closure of its exact retained window at 20:54:44; every other IINA native window identity was preserved. The 20:57:38 UTC read-only audit independently confirmed IINA's untitled 560×440 initial window with IINA/Open/Open URL controls, no descendant processes or owned helpers observed, and matching original repository/plugin preservation fields. Its separate Safari qualification is recorded below.

## What the candidates do

Both support public Twitch live/VOD and YouTube ordinary/live/archived video, available-format quality choices, Auto with a 720p H.264 preference, same-player quality restoration, imported or acquired synchronized replay, and sidebar/overlay presentation. Native evidence covers real decoded video/audio, quality transitions, fullscreen, overlay placement, cancellation, and genuine YouTube replay. Provider availability and current formats remain external conditions.

**Replay uses the player's actual mpv clock.** The public ended YouTube archive `92h_kU8O58M` yielded 693 normalized messages. Both candidates' QA-native Fetch/replay runs passed 51 clock checks covering forward/backward seeking, pause, rate, and offset, with separate WKWebView row/overlay checks. Both final normal R2 installations subsequently completed Fetch Replay with the same 693-message source; final native screenshots document their presentation. The full clock matrix and final installed-archive smoke are distinct evidence layers. YouTube Fetch Replay is explicit and bounded, uses the installed yt-dlp without credentials/configuration, and reports unavailable replay rather than substituting ordinary comments.

Unified's final normal rendering passed five checks, including an absent Latest Messages button and the newest row inside the visible message box; its PNG was captured at 20:53:43 UTC. The subsequent Off check confirmed Resume Replay remained available, visible rows were cleared, active replay controls were hidden, and 720p H.264 playback was preserved. Focus's final inspector and overlay PNGs document its normal presentation separately.

Authorized imports support TwitchDownloader JSON, yt-dlp live-chat replay JSONL, and the project's versioned normalized format. Import streams into bounded chunks; the reader retains two chunks and the renderer at most 150 messages. Genuine Twitch VOD history has not been obtained in this run. Its 100,000-message stress archive is explicitly synthetic and proves parser/bounds/timing behavior only.

**Twitch live chat is optional and receive-only.** Connect requires a registered public Client ID and the user's explicit device authorization, requesting `chat:read`. The plugin sends no chat messages. Native missing/invalid-client and Off behavior was exercised, but no real OAuth grant or authenticated IRC receipt was performed. The dummy native Keychain persistence probe failed; session-only operation has an explicit warning. YouTube live chat is not connected. These are separate acceptance gates in the selection report.

## Open and compare in IINA

Use **Plugin → Open Stream — Unified…** or **Open Stream — Focus…** under the corresponding candidate. The initial IINA window exposes both enabled candidates. **A managed player exposes only its owning candidate's menu:** Unified in a Unified player, Focus in a Focus player. To choose the other product, return to an existing initial window or close only the owned candidate player and return to the initial window. Absence of the other menu inside a managed player is expected host scoping.

Enter a public Twitch channel/VOD or YouTube URL. **Show Streams Unified** or **Show Streams Focus** reopens that player's controls. For the genuine archive sample, enter `https://www.youtube.com/watch?v=92h_kU8O58M`, then choose **Fetch Replay**; in Focus, open Chat first. **Import Chat Archive…** selects an authorized local archive. Chat **Off** ends replay/connection work.

Choose **Sidebar** or **Over Video** in chat appearance. **Move Overlay** permits positioning; **Done** or **Escape** restores normal click-through. Font, opacity, density, row limit, presets, and reset are shared. Unified keeps quality and chat together; Focus adds an inspector tab change when moving between them.

## Build and source checks on Apollo

The isolated worktree is `/Users/rookslog/development/iina-streams-candidates`. The preserved operational and preview checkouts are `/Users/rookslog/development/iina-streams` and `/Users/rookslog/development/iina-streams-design`; their exact branches, clean-state observations, and baseline HEADs are in the continuation and preservation reports.

The native environment is `/Applications/IINA.app`, IINA 1.5.1 build 183. Media helpers use the existing `/opt/homebrew/bin/streamlink`, `/opt/homebrew/bin/yt-dlp`, and `/opt/homebrew/bin/node`. Runtime Python is `/opt/homebrew/bin/python3` when available, otherwise `/usr/bin/python3`; helper source supports Python 3.9. These commands install nothing:

```sh
cd /Users/rookslog/development/iina-streams-candidates
/opt/homebrew/bin/node --test tests/*.test.js tests_candidate/*.test.js
/usr/bin/python3 -B -m unittest discover -s tests_candidate -p 'test_*.py'
/usr/bin/python3 -B scripts/build-candidates.py --output dist/candidates
/usr/bin/shasum -a 256 dist/candidates/*.iinaplgz
```

The builder produces extracted candidate folders, both archives, and a manifest of source-file/package hashes and repository HEAD. It preflights selected outputs, refuses foreign or unsafe paths, and atomically replaces recognized files. Preserve reviewed artifacts before another build. A commit alone does not identify uncommitted source; retain the manifest's file hashes. A successful build is separate from native acceptance.

`scripts/package-candidate.sh` is retired and exits 2 because the inherited route targeted the stable identity. Original `link-dev.sh`, `unlink-dev.sh`, and `verify.sh` remain baseline tools. Use the candidate builder and the full source commands above.

## Native installation and rollback

Follow [INSTALL-AND-ROLLBACK.md](docs/INSTALL-AND-ROLLBACK.md) for exact archive identities, permission rows, expected enablement, and development-link alternatives. Native installation is **IINA → Settings… → Plugins → Install Local Package…**, or opening the reviewed `.iinaplgz` with IINA. The warning lists filesystem access, alerts, network requests, and video overlays. Choosing Install automatically enables that candidate. Installation starts no video, replay acquisition, or authorization.

Before removal, turn chat Off and close only the candidate's managed windows. In Plugins settings, identify its exact **Streams Unified Candidate** or **Streams Focus Candidate** row, disable it, choose **More/ellipsis → Uninstall**, and confirm only the dialog naming that candidate. Verify the installed directory and row are gone. Source, archives, candidate data/preferences, and saved grants are separate; use **Forget** first if a real grant was later created and revocation is intended.

**Native automation caution:** AXPress on IINA's Plugins More button triggered a native settings-handler crash during this run. Use a physical pointer click on the freshly identified More control. The stack and pinned source's `NSApp.currentEvent!` call support a concrete hypothesis, not a proved cause; this incident is distinct from earlier JavaScriptCore crashes and the separate anchor-close observation. See [CONTINUATION.md](docs/CONTINUATION.md) and the sanitized `evidence/native/native-crash-observations.json`.

The guarded manager handles **development links only**, never archive-installed directories:

```sh
/usr/bin/python3 -B scripts/manage-candidates.py status \
  --plugins-dir '/Users/rookslog/Library/Application Support/com.colliderli.iina/plugins' \
  --source-dir /Users/rookslog/development/iina-streams-candidates/dist/candidates
/usr/bin/python3 -B scripts/manage-candidates.py rollback --variant unified \
  --plugins-dir '/Users/rookslog/Library/Application Support/com.colliderli.iina/plugins' \
  --source-dir /Users/rookslog/development/iina-streams-candidates/dist/candidates
```

Select `focus` for that owned link, or omit `--variant` for both. The manager does not enable plugins, launch/quit IINA, reset preferences, remove foreign paths, or modify stable/original/preview identities.

## Evidence limits and resource observations

[RESOURCE-RESULTS.md](docs/RESOURCE-RESULTS.md) reports six 20-second QA captures after 20-second warmups, using the genuine replay source at matched selected media settings. The figures cover the **IINA main process**, with WebKit ownership unresolved and shared system activity disclosed. They do not establish total application footprint, battery life, long-session stability, or a performance winner. Safari's decoded quality/codec/timing could not be matched with the available inspection state, so no browser-efficiency comparison is claimed.

The optional Safari attempt accidentally resized a pre-existing window. At the earlier cleanup observation, window `55998` still contained three tabs and had approximately restored bounds; exact pre-incident geometry was unavailable, and the owned comparison window had been closed. The later 20:57:38 UTC audit instead observed Safari process `57089` with window `56800`, one tab, and different bounds. The operator reports no Safari operation after the earlier cleanup; the cause of the later metadata change is unattributed. Current preservation of the original tabs is **not established**. These observations do not establish tab loss or identify who or what caused the change. The preservation report keeps both observations separate from the verified original repository/plugin state.

Real Twitch grant/receipt, successful Keychain persistence, genuine Twitch VOD replay, sustained ordinary viewing, formal accessibility acceptance, and user-authorized stable promotion remain distinct gates. The eleven successful normal-menu cycles establish bounded child-window isolation; they do not establish long-session stability or explain the earlier interrupted mixed/QA cycle. That interruption, the earlier JavaScriptCore crashes, and the separate native More-button trap remain in the evidence with their individual limits.

The resolver accepts the observed Twitch CloudFront distribution `d2vi6trrdongqn.cloudfront.net`; another legitimate distribution can produce `UNSAFE_MEDIA_URL` pending reviewed support. YouTube transport is restricted to HTTPS on `googlevideo.com` and its subdomains. The IINA manifest domain list does not sandbox extractor subprocesses or mpv network traffic.

## Repository map

- `candidate-plugin/src/`: playback/source state, authorization, replay, bridge, and per-player/helper lifecycle.
- `candidate-plugin/helpers/`: bounded media resolution, archive import/acquisition, and cancellation supervision.
- `candidate-plugin/ui/`: local sidebar and overlay presentation.
- `tests_candidate/` and `tests/`: current candidate contracts and retained baseline tests.
- `scripts/build-candidates.py` and `scripts/manage-candidates.py`: isolated build and guarded development-link management.
- `qa/`: explicitly operated native diagnostics and resource tooling; excluded from normal runtime packages.
- `docs/`: selection, audits, evidence, installation, continuation, resource results, and the implementation plan.

The delivery set comprises the two `.iinaplgz` archives, a clean source ZIP, a review/evidence ZIP, the Markdown selection report, the Markdown evidence appendix, and checksums. The source snapshot excludes Git history, raw downloads, private diagnostic payloads, runtime credentials, and machine-specific compiled QA binaries. The delivery manifest records exact filenames, checksums, and the final documentation commit separately from the fixed production-code commit.

The final source export also includes a packaging-only reproducibility correction: embedded-helper ordering is stable across filesystems, and fresh builds reproduce both installed R2 archives byte for byte. Runtime code stays at the production commit above; the delivery manifest identifies the later handoff/build-tool checkpoint. The existing reproducibility regression was strengthened and the 20 focused build/install tests passed.
