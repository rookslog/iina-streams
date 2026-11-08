# IINA Streams — evidence appendix

**Independent technical index, 2026-11-08. Updated through the final normal R2 UI/Off/close records and 20:56–20:59 UTC preservation snapshot. Both final ordinary-package Fetch and lifecycle runs have passed. The disposition is conditional candidate evaluation, not stable promotion.**

This appendix satisfies the separate evidence appendix requested in the main commission. It indexes commands, conditions, output excerpts, source contracts, screenshots, and claim limits. The detailed requirement matrix and decisions remain in [COMMISSION-AUDIT.md](COMMISSION-AUDIT.md). The product recommendation, execution journal, and continuation handoff are separate documents.

All repository-relative paths refer to `/Users/rookslog/development/iina-streams-candidates` on Apollo. The independent review used a shared working copy at `/workspace/scratch/22929406a103/candidate`. This reviewer read native artifacts but did not operate the native UI, install a plugin, alter app preferences, or launch/terminate IINA. Native observations were produced by the operator-run bounded native tests.

## 1. Interpreting the evidence

| Evidence class | What it establishes | Boundary |
| --- | --- | --- |
| Pinned primary source | Supported API syntax, implementation constraints, upstream data formats. | Does not prove this product works in the installed app. |
| Automated source tests | Deterministic state/race handling, bounds, parsing, isolation, and real local subprocess cleanup where explicitly tested. | Native APIs/WebViews are mocked in JavaScript tests. Passing counts are tied to their source cutoff. |
| Native QA | Actual IINA/libmpv state, supported bridge execution, UI controls, native screenshots, physical input when recorded. | QA has a separate identifier and command polling. It is not the final production archive. |
| Genuine replay | Public archived YouTube data acquired with installed yt-dlp, then actual native replay-clock tests. | A recognized imported format is not authenticated provenance. The Twitch 100,000-message fixture is synthetic. |
| Auth setup/rejection | Missing-client delivery, useful invalid-client error, editable retry form, video independence, Off. | No legitimate OAuth grant, authenticated IRC receipt, refresh, or real credential lifecycle was exercised. |
| Resource characterization | Short named workloads and explicitly attributed processes, with raw samples and native conditions. | Unattributed WebKit, shared WindowServer/system activity, QA overhead, and short duration prevent total-efficiency, battery, or leak conclusions. |

Files with `final` in their names identify the latest intended pass of that test, not a blanket release certificate. Some were overwritten by later repeats. The hashes below and in the audit identify the particular contents read. Earlier failures remain described so a passing replacement does not conceal the debugging history.

## 2. Runtime, source identities, and conditions

| Item | Recorded value / provenance |
| --- | --- |
| Host | Apollo; macOS `27.2`, build `26B123`; `Mac16,13`; 16 GiB RAM; 10 logical and 10 physical CPUs reported by sysctl. See `docs/RESOURCE-METHODOLOGY.md`. |
| Native app | IINA `1.5.1`, build `183`. Source inspection was pinned to tag `v1.5.1`. Embedded libmpv version was not separately captured in this audit; a standalone mpv version is not a substitute. |
| Candidate worktree | Branch `feature/candidate-portfolio-20261108`; release-code HEAD independently read: `127f6b98587bbdb8a6f2c532ad2a97665b4a7611`, also recorded by R2 package acceptance. QA/docs continue separately. Earlier 19:34 checkpoint was `ab4a00f0a1324769283275c39f3b7df3376c7a84`. |
| Selectable products | Unified: `local.iina.streams.candidate.unified`; Focus: `local.iina.streams.candidate.focus`; version `0.5.0`. Both share playback, auth, replay, and overlay code. |
| QA identity | `local.iina.streams.qa`. QA configuration selects the variant and an explicit source. Normal packages have `qa:false`; they contain no QA harness or native command-file polling. |
| Extractor | Genuine replay acquisition used installed yt-dlp `2026.08.19`. The state reviewer earlier observed Streamlink `8.6.3` and Node `26.5.0`; a separate raw version artifact was not retained for those observations. No fresh software installation was required. |
| Python | System `/usr/bin/python3` `3.9.6` was directly tested by the helper/state reviewer. Final build/test commands used the existing environment; the precise Homebrew Python patch version was not separately captured here. |
| Twitch quality fixture | Completed public VOD `2922164492`; position about `83.249667 s`, paused, speed `1.5`, one playlist entry. Windowed frame `1180×720` at `(180,170)`; fullscreen frame `1710×1074` at `(0,0)`. Tested `720p60 ↔ 360p30`; AAC at 48 kHz. |
| Real replay fixture | Public ended YouTube livestream `92h_kU8O58M`, “All Aboard (ish)”; 693 normalized messages. Native video 1280×720, H.264 at 30 fps, AAC 44.1 kHz, `videotoolbox-copy`. |
| Other playback sources | Twitch live `hutchmf`; ordinary YouTube `jNQXAC9IVRw`; current live YouTube `umLWFz4izTM`. Source records retain actual decoded dimensions rather than treating the requested quality label as proof. |
| Presentation samples | Default 14 px text, opacity 0.64, six overlay rows; comparison window 1280×800. A separate constrained test used 620×440, 24 px, 12 configured rows, compact spacing, opacity 0.9. Configured row count is a maximum, not a guarantee every row fits. |

Video/audio track metadata establishes active decoded streams, not an independent listening test. Public source availability and live content may change after this run.

## 3. Commands and test outputs

Run source commands from the candidate repository root. These are the exact runner interfaces for reproducing the checks; do not infer that every native UI operation was scripted by these commands.

### Automated checks

```sh
node --test tests/*.test.js tests_candidate/*.test.js
python3 -B -m unittest discover -s tests_candidate -p 'test_*.py'
python3 -B -m unittest tests_candidate.test_build tests_candidate.test_install
```

Latest independently read machine logs:

| Artifact | Observed result | SHA-256 |
| --- | --- | --- |
| `evidence/tests/node-final-follow.txt` | **143 passed, 0 failed**; 5,467.983667 ms. Includes the final release-code follow/control interaction regressions. Earlier `node-release-core.txt` retains the 137-test cutoff. | `491fba5bd52c9b4926dd4d4d9044a26c48defd3f0817189794c39182ff1618d6` |
| `evidence/tests/python-final-follow.txt` | **103 tests, OK**; 12.456 s. | `7c376d541fd8fd4ec176e04fb6e6c362b4029e794c53c961d4dff9d31feb06ea` |

Relevant output excerpts:

```text
ℹ tests 143
ℹ pass 143
ℹ fail 0
ℹ duration_ms 5467.983667

Ran 103 tests in 12.456s
OK
```

Focused failing-before/passing-after cases are indexed in `COMMISSION-AUDIT.md` and `CHAT-AND-HELPER-AUDIT.md`: deferred quality commit and native sizing quiescence; stale Refresh/seek/import/Connect callbacks; one-shot native timer retention; numeric serialized auth delivery and two-child Forget ordering; subprocess cancellation/publication ownership; archive/manifest symlink output safety; session-only warning retention; native-collapse sidebar continuity; and default-follow restoration without overriding deliberate history scrolling.

### Build and native QA runners

Normal deterministic build:

```sh
python3 scripts/build-candidates.py
```

It creates `dist/candidates/iina-streams-unified-0.5.0.iinaplgz`, `iina-streams-focus-0.5.0.iinaplgz`, extracted candidate folders, and `build-manifest.json`. It does not install or enable anything. The inherited `scripts/package-candidate.sh` is retired and exits 2. Use [INSTALL-AND-ROLLBACK.md](INSTALL-AND-ROLLBACK.md) for the separately tested native installation/removal path and the guarded development-link alternative.

An isolated QA build uses an explicit source configuration, for example:

```sh
python3 scripts/build-candidates.py --output dist/review-qa --qa-config qa/youtube-focus.json
```

Native scripts require the already-running, deliberately installed QA identity and its source-owned player; normal products do not expose that command-file channel. Commands are sequential because the harness has one request/response file. They may seek, pause, resize, change presentation, or open a managed test player, and therefore belong only to a bounded owned QA session. Output names do not select a variant: each Focus/Unified example requires the matching explicit QA configuration and fresh launch.

```sh
python3 qa/native-quality.py --quality 360p30 --height 360 --name focus-final-quality-360 --target-source 2922164492
python3 qa/native-quality.py --quality 720p60 --height 720 --name unified-final-fullscreen-quality-720 --target-source 2922164492 --fullscreen
python3 qa/native-real-replay.py --source 92h_kU8O58M --fetch
python3 qa/native-render-check.py
python3 qa/native-auth.py
python3 qa/native-cancel.py
```

The quality runner dispatches the production sidebar quality handler and waits for selected/decoded quality, completed seek, and absence of cache pause before capturing the result. The real replay runner uses actual mpv positions. The render runner compares actual WKWebView text/IDs with the controller's mpv-selected rows and captures the identified IINA window. The cancellation runner requires `evidence/raw/synthetic-twitch-100k.json`. The auth runner uses setup plus a deliberately invalid public client ID; its ordinary invocation is not a real grant or Keychain acceptance test. Physical drag, Done, and click-through records have separate operator observations; a DOM-only command is not substituted for physical input.

Resource commands, with the verified current owned IINA PID substituted into the task-specific variable:

```sh
python3 qa/native-resources.py --pid "$IINA_QA_PID" --warmup 20 --duration 20
python3 qa/analyze-resources.py --directory evidence/resources
```

The first command repeats Off/sidebar/overlay with 20-second warmups and 20-second samples at two-second intervals, verifying actual media conditions before and after. It records QA's 400 ms command polling as overhead. Do not reuse a historical PID or add unidentified WebKit processes by start-time coincidence.

## 4. Claim/evidence ledger

| Claim | Latest relevant evidence | Interpretation and remaining limit |
| --- | --- | --- |
| Twitch live and completed VOD open with active video/audio; opening another candidate player preserves the original. | `focus-final-twitch-live.json`, `completed-vod-initial.json`, `unified-final-open-twitch-live.json`, `unified-final-open-twitch-vod.json` under `evidence/native/`. | Six source/open checks pass in the later named records. No listening or long live-continuity claim. |
| Quality changes remain in one player and preserve time/pause/speed/frame/fullscreen. | Focus windowed eight checks each/fullscreen nine; Unified windowed/fullscreen eleven each; latest `focus-native-collapsed-quality-final.json` adds twelve passing checks on actual YouTube 720→360 with IINA's own panel collapsed. | Native properties and native-collapse preservation passed. Final installed-byte smoke remains separate. |
| Ordinary/current-live/archived YouTube sources work. | `focus-youtube-ordinary-source.json`, `focus-youtube-live-source.json`, `focus-youtube-replay-source.json`; `unified-final-initial.json` for the archive. | Actual source identity and decoded track metadata. General provider availability, quality replacement on every source class, and sustained live performance are not inferred. |
| Genuine archived YouTube chat follows actual mpv time. | `focus-real-youtube-replay.json`, `unified-real-youtube-replay.json`; **51 checks each**, `fetchButtonTested:true`, 16 native records. | 693 authentic messages; forward/backward seek, beginning/near-end, pause, 0.5×/2× rates, offset. This is stronger than a selector test supplied with an invented clock. |
| Replay DOM and native painting agree. | Latest `focus-final-render-check.json`: **five checks**, including `sidebar-follows-latest`; matching sidebar/overlay PNG/JPG captures. | Actual WKWebView text/IDs match the mpv-selected rows. Fresh default-follow defect was fixed and retested; broader keyboard/VoiceOver and final installed-byte parity remain separately scoped. |
| Overlay normally passes basic mouse clicks through. | `focus-final-click-through.json`: four checks with outside-panel physical down/up baseline and inside-overlay physical down/up; editing false, frame unchanged. | Activation click is explicitly recorded. Earlier no-event attempts were inconclusive. Do not generalize to every mouse/scroll/key gesture. |
| Explicit edit drag and constrained layout work. | `focus-full-capture-drag.json`, `focus-native-done.json`, `focus-small-window-clamp.json/.png`, `focus-fullscreen-overlay.png`. | Panel drag preserved native frame; physical Done exited edit mode; small-window fit and visible controls observed. No automatic avoidance of important video content is claimed. |
| Off cancels an active import and clears visible chat. | `focus-native-cancel.json`; four checks, 1.795 s total observed test; helper ownership/publication regression suites. | Native replay-import path observed. The runner's 50 ms marker-check interval is not end-to-end cancellation latency. Other native helper/close paths require their own evidence. |
| Native auth broker delivers useful setup/errors without disturbing video. | `focus-final-native-auth.json`, `unified-final-native-auth.json`; **five checks each**. | Missing/invalid-client states only. No real client grant or authenticated IRC session. |
| Persistent credential storage works. | `keychain-native-probe.json`: write/read-match/clear all **false**, cleanup exit code 44; dummy noncredential item only. | **Not established.** Session-only warning survives ordinary connection progress in source/tests. No plaintext fallback or real credential use. |
| Native resource use is characterized. | Six `evidence/resources/{unified,focus}-{off,sidebar,overlay}.json` runs, matching metadata/conditions, `RESOURCE-RESULTS.md`, `resource-summary.json`. | All 60 samples and condition hashes reviewed; root-process scope excludes unattributed WebKit. Evolving QA source, sequential order, shared-system changes and polling prevent an efficiency winner. |
| Both final normal candidates preserve their anchor through ordinary child cycles. | Focus smoke 1/1 + batch 5/5; Unified batch 5/5, eleven checks each. Both final normal Fetch UI records show Replay/693 messages. | Matched five-cycle batches plus one extra Focus smoke: eleven ordinary YouTube cycles total. Retained child/anchor identities, title/frame/native Resume, window set and PID are preserved. No exact mpv-clock/decoded-child claim or retroactive explanation of the earlier mixed-source QA close. |
| Original projects/plugins are preserved within the checked scope. | `pre-test-state.json`, `PRESERVATION-AUDIT.md`, `final-preservation-snapshot.json`, final R2 install and preceding native-uninstall records. | Final 20:56–20:59 UTC repeat matches original clean branches/HEADs/manifests/links/selected enablement and both R2 archive bytes. QA/stable absent; owned players closed. Safari original-tab preservation cannot be certified from the changed final inventory; see §8. |
| Final archives install with correct identity/bytes; previous ordinary candidates can be removed natively. | `evidence/native/package-acceptance-r2.json`, `unified-native-uninstall.json`, `focus-native-uninstall.json`; `evidence/tests/final-package-build-r2.json`; `INSTALL-AND-ROLLBACK.md`. | Both R2 installs have 25 files matching their archives, enabled, QA false/no harness. Both previous native installs were removed with named confirmation and row/folder absence. Focus R2 permission confirmation was observed; Unified's was unobserved after an AppleScript condition error. Final R2 Fetch and bounded lifecycle acceptance now has separate passing records for both candidates. |


The final R2 code revision is `127f6b98587bbdb8a6f2c532ad2a97665b4a7611`. Archive hashes: Unified `1ed65ddfe68d2c82066af91e7b0aa9520926fc0b02c19ffb3864cc35d0104726`; Focus `642b1cbace5180cc6e176b15eb82e84a1fa0371c6e20d11c6afc55ca878c0d24`. Package acceptance record SHA-256: `a7aa8e033cedef2b8dc9df8123be30f8d293e8b4ee055a52994817b6bb581580`. The native removal records have hashes `a80f58253716bcc4e3d72f161c5a482498c2bb86f3f51dee6fce60ad6b6020fb` (Unified) and `5f2bbaf832ee0ffd730f6e6b0c5afcdeb925a20d07fda4bf6755b15c7bf3608e` (Focus). Removal was of the preceding normal installs; it is not mislabeled as removal of the newly installed R2 bytes.

Final normal lifecycle records: `focus-r2-normal-cycle-smoke.json` SHA-256 `d1343df2a1e697a59a359b8ebe3b24c8328ab435032aeeccf42f80d88202d523`; `focus-r2-normal-cycles-batch1.json` `5397ac307bff47f1d3d36510e89cf0d52d03a21bccd47e615943ed25f9402e23`; `unified-r2-normal-cycles-batch1.json` `9f79273555932f3387349c7a2ebcfe9b8db541f84de9d321350588ff55793256`. Native UI Fetch records: Focus `e9a3d6631202d7ac98790b9ca814a78cb0aedfcc3f25221529c1ee28db6b5dac`; Unified `2394101a2bbd86665baef60629fa708d94784101284056649aa84a77007fa588`. The final normal stills show different source times—Focus about 1:34, Unified about 3:43. Earlier QA captures at 120 s remain the matched visual comparison and predate the final sidebar gesture guard.

### Final installed UI, Off, close, and capture provenance

The final Unified normal-package render record `evidence/native/unified-r2-render-check.json` passes five checks (native identity, genuine 693-message replay, Latest absent, twelve bounded AX rows, newest row fully in view); SHA-256 `f35fd16d222ce802dcbfeebe04640898a817a6e6a1f5376b4366ebf96270c6dd`. The final native Off record `unified-r2-off-check.json` passes five checks (accepted native action, Resume replay available, no rendered messages, active replay controls hidden, 720p H.264 unchanged); SHA-256 `6e84c488018d1b6adaa2c12f2bcdc2c4b38f294c8c87806cc91f8f0c0179cecf`. Initial assertions expected an unintended literal Off label and referenced an incorrect result key; their initial-assertion records are retained. The corrected aggregation uses the observed native action and intended UI, without repeating the action or claiming a product fix.

Final retained-window close records: `focus-r2-confirmed-close.json`, 20:40:16 UTC, SHA-256 `458b592a2f93018f8e4749177580888a85df934599bcc1dfd9de4af4dfe20b8a`; `unified-r2-confirmed-close.json`, 20:54:44 UTC, `488630f420f02a7962113595bdeed57f0d29657de71c87581ebeee5ddf52a88a`. Each verifies the close button belongs to the target, the target is absent afterward, and all other native window identities are preserved.

| Independently viewed final R2 original | PNG SHA-256 | Supported observation |
| --- | --- | --- |
| `evidence/native/unified-r2-sidebar.png` | `0e39c5c84492b8dddb6d7906dac830a7f593fcd7a5f3a63300af8dddc9e7be09` | Readable persistent sidebar, genuine Replay 693, fully visible latest row, no unwanted Latest button. |
| `evidence/native/focus-r2-inspector.png` | `9540fa8631a7d04c2b2281cd21a9a71e6d2e5fb6bda5f5e4a5fff6b8ff77e7d9` | Native Focus identity, contextual Playback/Chat controls, Replay 693, offset/First message, native clock 01:34. |
| `evidence/native/focus-r2-overlay.png` | `65867acbbaf31d43e8cfa7e06b9382782b0687dda0d1047ec817a3cec09a97e5` | Separate six-row overlay capture visibly paints readable chat over the actual video. |

The Focus inspector and overlay were deliberately captured separately; no simultaneous-painting claim or explanation of overlay absence in the inspector still is inferred. Final Focus and Unified stills use different source times. The earlier QA pair at 120 seconds provides the matched comparison, before the final sidebar gesture guard.

`evidence/native/capture-provenance.json` indexes ten JPEG exports: `unified-r2-sidebar`, `focus-r2-inspector`, `focus-r2-overlay`, `unified-final-comparison-sidebar`, `focus-final-render-sidebar`, `focus-final-render-overlay`, `focus-small-window-clamp`, `focus-fullscreen-overlay`, `focus-native-collapsed-quality-final`, and `overlay-opacity-probe`. The native operator records the new derivatives as `sips` JPEG quality 85, maximum dimension 1800, with no edit/crop; the two existing `focus-final-render-*.jpg` files are retained unchanged. Original PNGs remain on Apollo and the ledger preserves original/derivative provenance. These JPEGs, sanitized JSON/test/resource records, reports and both candidate archives form the review export; raw chat, full private process/crash samples, Safari images, native QA binaries and Git metadata are excluded.

## 5. Screenshots and superseded failures

Important native visuals are under `evidence/native/`:

- `unified-final-comparison-sidebar.png` and the final Unified comparison state: persistent quality/chat arrangement. Inspect the recorded source/time when comparing it to Focus.
- `focus-final-render-sidebar.png/.jpg` and `focus-final-render-overlay.png/.jpg`: current Focus contextual inspector and actual genuine replay views. These filenames were regenerated after the follow-on-reveal fix; use the associated render-check hash and time.
- `focus-small-window-clamp.png`: maximum-density constrained layout; oldest content may clip, newest content and Move/Done remain visible.
- `focus-fullscreen-overlay.png`: fullscreen native painting and control clearance.
- `overlay-opacity-probe.png`: first visibly working native overlay after the prior ready-DOM/no-paint condition. Its messages are labeled fixtures, not genuine platform chat.

Material unsuccessful observations are retained in the audit rather than erased:

| Earlier observation | Resolution / qualification |
| --- | --- |
| Growing Twitch VOD and early quality runs did not preserve pause/frame reliably. | Retested on completed VOD; restoration waits for 600 ms native-size quiet, capped at 2,500 ms, with a 1,600 ms no-size fallback. Later named quality records pass. |
| Overlay DOM was ready but no panel painted. | Later build with explicit opacity 1 plus CSS changes visibly paints. The isolated root cause was not proven. |
| Drag could also move the IINA window after leaving the handle. | Explicit editing captures the overlay viewport's deepest hit elements; normal mode returns native click-through. Later drag/frame and physical-input evidence pass. |
| Child auth state failed despite correct routing in mocked tests. | Deferred retained child listeners plus bounded JSON primitive/deferred numeric delivery now pass native setup/rejection. This does not prove an upstream VM bug. |
| Focus sidebar revealed old messages despite no history-browsing action. | DOM regressions first failed; follow-on-reveal fix now passes the fresh five-check native render record. The earlier four-check artifact hash was `604c7096dd525c1e1b6d8a9c2476451a357e13bcf3242b8cf8566a957ded8a82`. |
| Intended ten-cycle QA run lost the paused anchor during the second child opening. | One completed cycle, then timeout; no ten-cycle success claim. Child create 19:45:54.240, anchor close 56.807, child loaded 57.103, child close 59.532. AX invocation times were not separately recorded, so these events do not identify the initiator. The partial evidence is preserved; the later final normal-menu batches pass eleven ordinary YouTube cycles without retroactively establishing this earlier event's cause. |
| Native dummy Keychain probe failed. | Still failed/unverified; not reclassified as passed because the session-only fallback is useful. |
| Native crashes during evolving QA and install checks. | `native-crash-observations.json` contains five sanitized reports: historical November 7 Sidebar teardown, November 8 18:04 Objective-C release, 18:41/19:01 JSC sweeps, and 19:56 native More/Accessibility trap. More's forced current-event unwrap is a hypothesis, not an established cause; Uninstall is not in the selected latest stack. A later bounded run does not establish broad stability. |
| Ordinary-menu cycle attempt found no Focus command in a Unified-only player. | Zero completed cycles, before child opening. [Pinned menu source](https://github.com/iina/iina/blob/v1.5.1/iina/MenuController.swift#L642-L647) uses the active player's plugins. QA harness now takes explicit `--variant unified|focus` and records observed menu titles. No production visibility change. |
| Normal-package process was waiting in native menu tracking during AX automation. | `native-menu-tracking-observation.json` records the 20:26:16.229 UTC sample: 86/86 main-thread samples in the Accessibility menu action/AppKit tracking path, with no candidate JS frame in that path. Full private sample SHA-256 `c33ebfbb90bf7c33e2a5c4a5418f0c5795a8d5b522d4dc0cd6c9beb7eec71ce7`. Exact Plugin AXCancel returned zero but did not restore the subsequent bounded quit request; a physical Escape also did not. AXCancel acceptance alone did not prove recovery of the old process. The later fresh R2 process passed six Focus and five Unified normal-menu cycles with the revised exact-menu harness; those bounded results are separate from the original failure. |

## 6. Genuine archive, hashes, and reproducibility

Original acquisition: public `https://www.youtube.com/watch?v=92h_kU8O58M`; installed yt-dlp `2026.08.19`; 8.82 s; 1,008,784-byte JSONL; 701 timed wrappers. Import yields 693 records: 687 text, three membership, three paid; nine unsupported actions; zero invalid/missing-timestamp/duplicate/source-mismatch warnings in that run.

| Artifact | SHA-256 / result |
| --- | --- |
| `evidence/raw/real-youtube-replay-92h_kU8O58M/replay.jsonl` | `9034a377f9f2a1874c18f2aff3f63f8077d20917fbc6a54a0623d7a9275dee44` |
| Latest read Focus real replay record | `c3e5be4336045b25ca907e25b05be5b44ee1fbe3584a12094c52465d9f346554`; 51 checks, Fetch true. |
| Latest read Unified real replay record | `e6c0e2a8fcb2782e23ef1d29467d796e83a1cd952c6d881ee3c3e5536046be7a`; 51 checks, Fetch true. |
| Latest read Focus render check, 19:38 UTC | `4459f9d4c21c94814e79dade4e092ecab13b0af433083d6f38fbcc311f93ef34`; five checks. |
| Native collapsed-panel quality, 19:44 UTC | `focus-native-collapsed-quality-final.json`, `6abc7f4069654cd74344e7158a561cc68e133fefbe3d2ee9495d92880120eca4`; twelve checks. |
| Six-run resource analysis | `evidence/resources/resource-summary.json`, `d158e04cf9710fa96b94da052579cbb3bc5b9acb7f49dcaeedb54802ce98df13`; 60 samples, six matched condition/hash records. |
| Dummy Keychain native probe | `7c941932d3f9b0ab0a37e69d74b14ebec306a9bfaa189832ff3893107760a6f1`; all three persistence booleans false. |
| Safari comparison/cleanup record | `evidence/resources/safari-comparison-window.json`, `b3e16655cdea1adc433f318f9e1ee5c72b3e261fc9b3d8517065e94fb463f00d`. |

The original JSONL did not embed a verified source ID. The original evidence import supplied the acquisition-established ID; the normalized index still records `provenance.verified:false`. Repeated downloads need not have the same raw hash. Their records must not be relabeled as the original 8.82-second acquisition. Full helper evidence and handoff hashes are in `CHAT-AND-HELPER-AUDIT.md` and `evidence/tests/chat-helper-final-review.json`.

Additional hash ledgers: `COMMISSION-AUDIT.md`, `evidence/tests/commission-audit-summary-20261108.json`, `PRESERVATION-AUDIT.md`, per-run resource `*-conditions.json`, and final `dist/candidates/build-manifest.json`. The build manifest's `files` map hashes source inputs; generated variant identity/configuration and embedded-helper outputs differ by design. Package archive hashes identify the final bytes. `sourceCommit` alone is not proof that uncommitted working-tree code was absent.

## 7. Primary sources and release-specific conclusions

| Primary reference | Contract used / qualification |
| --- | --- |
| [IINA v1.5.1 Global API](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPIGlobal.swift) and [message hub](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptMessageHub.swift) | Managed numeric child routing, callback ownership, synchronous native delivery. The bounded serialized/deferred workaround is supported by actual native tests; its success does not prove a specific host defect. |
| [Overlay API](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPIOverlay.swift) and [native overlay hit testing](https://github.com/iina/iina/blob/v1.5.1/iina/PluginOverlayView.swift) | `video-overlay`, show/opacity/clickability, deepest-element `data-clickable`; normal native click-through and explicitly bounded edit mode. |
| [Window proxy](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPICore.swift) and [sidebar API](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPISidebarView.swift) | Native frame setter behavior and plugin-sidebar show/hide. `core.window.sidebar` reports the settings sidebar in this release, not reliable plugin visibility. Document occlusion is not explicit user Hide. |
| [MPV wrapper](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPIMpv.swift), [events](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPIEvent.swift), [hook dispatch](https://github.com/iina/iina/blob/v1.5.1/iina/MPVController.swift) | Actual time-pos/seek/pause/rate, native commands, async hook continuation. Replay derives its clock from mpv. |
| [PlayerCore](https://github.com/iina/iina/blob/v1.5.1/iina/PlayerCore.swift), [MainWindowController](https://github.com/iina/iina/blob/v1.5.1/iina/MainWindowController.swift), [URL loading window](https://github.com/iina/iina/blob/v1.5.1/iina/OpenURLWindowController.swift) | Window-will-close stops its player before emitting the plugin event; candidate teardown then removes listeners. An absent later end-file trace does not identify the close initiator. Managed creation allocates a new native PlayerCore rather than using active/reuse selection. |
| [Utilities](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPIUtils.swift), [file API](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPIFile.swift), [polyfills](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptPolyfill.swift) | Async picker, absolute `@data` resolution, subprocess limitations, Keychain binding, require resolution, fired-timer registry cleanup. External helper permissions are broader than the IINA HTTP domain allowlist. |
| [HTTP wrapper](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPIHttp.swift), [pinned dependencies](https://github.com/iina/iina/blob/v1.5.1/iina.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved), [Just form encoding](https://github.com/dduan/Just/blob/1824bf84cf52d11d69ae20cfb89f0ce5bffa5650/Sources/Just/Just.swift#L875-L940) | Dictionary `data` encodes POST form body; `params` is query data. Raw string `data` is not the wrapper's supported form path. Tokens are not placed in query strings or subprocess arguments. |
| [Twitch IRC](https://dev.twitch.tv/docs/chat/irc/), [scopes](https://dev.twitch.tv/docs/authentication/scopes/), [device flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#device-code-grant-flow), [validation](https://dev.twitch.tv/docs/authentication/validate-tokens/) | Receive-only WSS IRC with only `chat:read`; explicit authorization, validation, expiry/refresh orchestration. No messaging command/write grant. EventSub's general recommendation is disclosed; it is not silently implemented. |
| [TwitchDownloader pinned source](https://github.com/lay295/TwitchDownloader/tree/8adfd8e5d31984ae1918b1fa0273f019dc29899f) | Investigated maintained historical export format and acquisition constraints. Import support does not establish official Twitch history API access or a genuine acquired Twitch archive in this run. |
| [yt-dlp replay downloader, pinned source](https://github.com/yt-dlp/yt-dlp/blob/412e7f0a4b0588fe884a02b344ac66a06538475b/yt_dlp/downloader/youtube_live_chat.py) and [YouTube live-chat API errors](https://developers.google.com/youtube/data/live/reference/rest/v3/liveChatMessages/list#errors) | Archived replay versus live capture, timestamp interpretation, unavailable history. The researched upstream commit differs from the installed yt-dlp release used in execution; both are identified. |

Current online documentation supplements the pinned installed-release source. Research notes under the shared `research/` directory are supporting work records, not current acceptance results; the updated repository audit/appendix and actual test artifacts take precedence over their earlier pending statements.

## 8. Preservation, privacy, and open gates

`PRESERVATION-AUDIT.md` and `evidence/native/final-preservation-snapshot.json` record the final read-only repeat at 20:56:37–20:59:14 UTC. Both original clean branches/HEADs, symlink targets, six manifest hashes, selected enable preferences and IINA 1.5.1/183 match the baseline. Both R2 installs match all 25 archive files; QA link/key/fake client file and stable ID are absent, while inactive QA data is retained. The initial IINA window is identified by its native controls; no descendants or named owned QA/extractor processes remain. A predating unrelated Python process was left untouched. No newer IINA `.ips` report after 19:56:25 was found at this cutoff. No full app-bundle fingerprint, every-preference comparison, absent-failure guarantee, or clean candidate reporting-worktree claim follows. Final snapshot SHA-256: `77984ba394920cbce20c9b5b9d6e9d614eaad8ad41aa11a050b0758b445033ad`; preservation document: `201ece6c82026d722eda0f609e6a07afbe89b9c076d7d2a00c4d338e11071581`.

An unrelated Safari window was resized during optional comparison setup. The saved cleanup at 19:34:13.115469 UTC records window 55998 with three tabs and approximate replacement bounds `{0,34,1688,1107}`; owned comparison window 56467 is recorded closed. Exact original geometry is unknown. The final read-only inventory at 20:57:38.627467–20:57:38.818380 UTC instead finds only window 56800 with one tab and bounds `{139,139,1419,939}` in the same Safari process. The operator reports no later Safari actions. Cause and attribution of the changed inventory are unknown, and **current preservation of the original three tabs cannot be certified**. The earlier three-tab observation must not be carried forward as the final state. No tab URLs/titles were exported or restoration attempted from this unexplained state.

Safari's video codec/quality could not be matched with the available inspection state. No setting was changed to enable inspection. The browser attempt therefore supplies **no matched efficiency comparison**. Native resource results remain short characterization with incomplete WebKit attribution and QA overhead.

Export only sanitized evidence: canonical public source IDs/URLs, fixed errors, bounded UI text, hashes, conditions, and checks. Do not publish raw host media logs containing transport URLs, OAuth material, or full private diagnostic reports. Genuine raw chat archives are retained under the stated evidence paths and are not release package contents.

The final disposition is **Accept both for conditional candidate evaluation; Defer stable promotion**. Final normal archive installation/byte identity, genuine Fetch, bounded ordinary YouTube lifecycle batches, rendered-view/Off checks, owned-window closure, and scoped preservation closeout have results. Earlier mixed-source anchor closure, JSC crashes and native menu/More incidents remain unexplained or bounded to their recorded automation context; later passes do not erase them. Real Twitch OAuth/IRC participation and genuine Twitch archive data remain external gates. Persistent Keychain acceptance remains failed/unverified. Long-session stability, complete accessibility/gesture coverage, total-app efficiency and browser/energy advantage remain unestablished. These limitations, together with the final Safari discrepancy, are part of the decision rather than unfinished promises of this run.
