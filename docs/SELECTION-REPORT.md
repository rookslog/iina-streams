# IINA Streams — candidate selection report

**Commission:** main commission of November 8, 2026, followed by its overriding addendum.

**Target:** Apollo, the existing IINA 1.5.1 build 183 installation on macOS 27.2 (26B123).

**Status:** two functioning native candidate products; stable promotion remains subject to the user's selection and the explicit gates below.

## Recommendation

**Choose Unified for the first adoption review. Keep Focus as the alternative for a quieter, contextual inspector.** Both candidates use the same playback, authorization, replay, and overlay engine. Unified earns the recommendation because stream identity, quality, chat status, and history remain together: the viewer can understand and change playback without switching away from the conversation. Focus deliberately separates Playback and Chat into two tabs and starts with the overlay presentation. It reduces the number of controls visible at once, at the cost of an extra tab change when moving between quality and chat.

This is a choice between working presentations, not a choice between complete and deliberately restricted feature sets. Both can show chat in a sidebar or over video, and either inspector can be dismissed while an overlay remains. Beneficial engineering work from the enhanced candidate has been brought into the common foundation.

The appropriate decision is **Accept for candidate evaluation, with stable promotion deferred**. Native playback, actual quality transitions, genuine YouTube replay, authorized archive import, native overlays, and the comparison workflow are implemented. A real Twitch grant and authenticated chat receipt have not been exercised. Native Keychain persistence did not pass its noncredential probe. Original Twitch VOD chat has not been obtained and validated end to end. Those limits are explicit acceptance gates, not implied successes.

## Exact candidates

| Item | Unified | Focus |
| --- | --- | --- |
| Product idea | Persistent stream identity, quality, and chat in one panel | Contextual Playback/Chat inspector with overlay-oriented defaults |
| Plugin identifier | `local.iina.streams.candidate.unified` | `local.iina.streams.candidate.focus` |
| Display name | Streams Unified Candidate | Streams Focus Candidate |
| Native sidebar label | Streams Unified | Streams Focus |
| Version | 0.5.0 | 0.5.0 |
| Archive | `iina-streams-unified-0.5.0.iinaplgz` | `iina-streams-focus-0.5.0.iinaplgz` |
| Branch | `feature/candidate-portfolio-20261108` | Same shared branch |
| Release code commit | `127f6b98587bbdb8a6f2c532ad2a97665b4a7611` | `127f6b98587bbdb8a6f2c532ad2a97665b4a7611` |

The isolated checkout is `/Users/rookslog/development/iina-streams-candidates`. The original operational checkout remains at `8140312e6df4ff48143712c6ce8b911160a17454` on `design/tnf-quiet-streams`; the original design preview remains at `a7b61e1e7e33c4e9a196f59d91bd5202532c7ac1` on `design/in-app-panel-comparison`. Their sources, installed development links, identities, and enable states are separate from the candidates. The final release archives have these SHA-256 values:

| Archive | SHA-256 |
| --- | --- |
| Unified 0.5.0 | `1ed65ddfe68d2c82066af91e7b0aa9520926fc0b02c19ffb3864cc35d0104726` |
| Focus 0.5.0 | `642b1cbace5180cc6e176b15eb82e84a1fa0371c6e20d11c6afc55ca878c0d24` |

Both final archives are installed and enabled in the existing IINA app. All 25 installed files for each candidate match its archive byte for byte. Final archive hashes and installation observations are in `dist/candidates/build-manifest.json` and `evidence/native/package-acceptance-r2.json`. A normal archive has `qa:false` and contains no QA harness. Its installation does not open a video, fetch replay, or authorize chat automatically.

## What works, and what has actually been proved

| Capability | Both candidates implement | Evidence and qualification |
| --- | --- | --- |
| Twitch live and VOD playback | Canonical source routing; direct extracted media; quality list and same-player changes | Real `hutchmf` live and VOD `2922164492` decoded H.264 video and AAC audio in IINA. Separate opens preserved the original player's paused state. |
| Quality continuity | Generation-fenced resolution, bounded native sizing settlement, restored seek/pause/speed/frame | Both candidates passed actual 720p/360p transitions. Unified's final checks also require completed seeking and no cache pause. Fullscreen transitions passed. |
| YouTube playback | Ordinary video, live source, archived livestream, quality selection and separate audio | Native source records cover `jNQXAC9IVRw`, `umLWFz4izTM`, and `92h_kU8O58M`. The ordinary 240p source is not mislabeled as 720p. |
| Twitch read-only live chat | Explicit device authorization, `chat:read`, validation/refresh, WSS IRC, bounded history, reconnect/error states, Off/Forget | Both native setup/rejection tests passed five checks. Protocol and lifecycle tests use controlled inputs. **No real OAuth grant or authenticated IRC receipt is claimed.** |
| Saved Twitch login | Native Keychain path; session-only fallback with a persistent warning if saving fails | The noncredential native write/read/clear probe returned false; exact probe cleanup found no item. **Persistence remains unverified.** |
| Twitch historical chat | Import and normalization of supported authorized archive formats; actual-player-clock replay | A clearly labeled 100,000-message synthetic Twitch archive exercised import, timing, bounds, and cancellation. **This is not original Twitch chat.** Genuine Twitch acquisition and end-to-end alignment remain open. |
| YouTube historical chat | Explicit Fetch Replay using the installed extractor; import fallback; genuine timestamped replay | Public archive `92h_kU8O58M` produced 693 normalized messages. Each candidate passed 51 native clock checks through the real Fetch control. Actual webview DOM checks confirm rendered rows and overlay identities. |
| Missing replay | Actionable unavailable/error state without breaking video | An ordinary YouTube video's native fetch correctly reported no archived live-chat replay; ordinary comments are never substituted. |
| Sidebar and overlay | Shared message source, mutually selected presentation, readable text, bounded rows | Both run in IINA's real sidebar and video overlay. Focus's final rendered-message checks also verify automatic following after revealing Chat. |
| Overlay placement | Four presets, normalized custom position, explicit Move/Done, font/opacity/line/density controls, reset | Actual drag left the player frame fixed. Normal-mode clicks reached native IINA handlers. Fullscreen and a constrained 620×440 player were observed. |
| Cleanup and isolation | Off, close, source deactivation, cancellation, stale-result fences, owner-scoped timers and temporary output deletion | Automated race tests and native import cancellation support these claims. Host-owned closed-player/WebKit retention remains a separate limitation. |

## Design comparison

### Unified

Unified keeps the high-value controls visible above the conversation. Stream titles use a bounded two-line header, source type is secondary, and quality occupies a short native-feeling row. Chat starts Off, so opening a stream does not quietly establish a chat connection. Replay controls appear only when useful. Appearance controls remain behind the small disclosure button rather than dominating ordinary viewing.

This is the stronger default when quality changes, replay navigation, and chat status need to remain observable together. It is also easier to discover: no feature requires first knowing which inspector tab owns it. Its cost is a denser panel when playback and chat are both active.

### Focus

Focus retains the stream header and separates Playback from Chat. The Playback tab is intentionally sparse; the Chat tab has the same real connection, acquisition, replay, and appearance controls as Unified. Overlay presentation is the default, and Hide Inspector leaves that overlay over the video. This suits viewers who set quality once and then want the video to dominate.

The tradeoff is context switching. Quality is not visible while Chat is selected. Hiding the inspector also reduces discoverability until Show Streams Focus is used again. Focus is a defensible choice for sustained viewing; it does not have a different or less reliable replay engine.

### Decision criteria

| Criterion | Unified | Focus | Assessment |
| --- | --- | --- | --- |
| Usability and discoverability | Quality, chat state, replay and history remain together | Shorter contextual panels; Chat controls require selecting Chat | Unified is the clearer first-use choice. |
| Visual coherence | One consistent inspector hierarchy | The same typography and controls across two tabs | Both are actual native IINA sidebars with a shared visual system. |
| Native integration | Managed IINA player, Plugin menu, real sidebar and overlay | Same integration; inspector can be hidden for overlay viewing | Neither adds a separate browser or companion window to the viewing workflow. |
| Feature completeness | Shared playback, replay, authorization and presentation engine | The same implemented capabilities | Neither candidate is intentionally missing a shared feature. External verification gates apply equally. |
| Interaction efficiency | Quality and chat can be adjusted without a tab change | Fewer simultaneous controls; extra tab change between playback and chat | Unified favors active adjustment; Focus favors setting playback and then watching. |
| Accessibility | Labeled native/web controls, keyboard-aware history intent, scalable chat | Same controls with native-exposed Playback/Chat radio tabs | Native AX roles and labels were inspected. Full VoiceOver, contrast and assistive-workflow certification remain open. |
| Technical complexity | One persistent panel composition | Adds small tab/presentation state | Most complexity is shared; the difference is limited to presentation. |
| Resources | Short measured root-process samples available | Same protocol, replay bounds and sampling method | No defensible efficiency winner; complete WebKit ownership and long-session data are missing. |
| Reliability | Real replay/quality checks and five final normal-menu cycles | Real replay/quality checks and six final normal-menu cycles | Both pass the bounded final tests. Older mixed-source interruption and native crash observations remain unresolved. |
| Maintenance | One shared engine, generated identity/configuration | Same source and tests, generated identity/configuration | A shared correction reaches both; two independent forks are unnecessary. |
| Extensibility | Provider, clock and renderer boundaries | Same boundaries; contextual presentation can evolve independently | Future providers or richer messages can use the same bounded pipeline after focused validation. |

No numerical score is assigned: the evidence supports a workflow preference and several concrete gates, not a mathematically precise product ranking.

### Refinements driven by native testing

Native evidence changed the implementation rather than merely decorating the report. Quality restoration now waits for a bounded quiet period after IINA's native sizing events. A quality reload no longer forces Streams back over a collapsed sidebar or another native inspector. Cross-context authorization uses deferred, bounded serialized messages after native object delivery proved unreliable. One-shot native timer entries are explicitly removed when they fire. The overlay is made clickable only during positioning. A fresh Focus Chat reveal follows the newest synchronized rows while preserving intentional scroll-back. A second correction distinguishes deliberate wheel/key/pointer history browsing from automatic layout/focus scrolling, so browser reflow cannot silently turn off following. Session-only authorization warnings survive normal connection-state updates.

The actual screenshots are indexed in `EVIDENCE-APPENDIX.md`. The final comparison uses genuine replay and native IINA windows, not generated mockups.

## Architecture and product decisions

The engine separates source identification, media resolution, same-player loading, authorization, acquisition/normalization, replay time, and presentation. These are modest boundaries around real failure modes: changing a renderer cannot change the source clock, and a missing replay provider cannot prevent ordinary video playback.

Managed players load only their owning candidate plugin. Unrelated players do not acquire Streams hooks from this code. Public canonical source URLs identify playback; extracted signed transport URLs stay out of the evidence. Quality replacement uses the same player with a generation marker so stale file-loaded events cannot complete a newer request. Seek, pause, speed, fullscreen, and frame preservation are checked against native properties rather than a selected label alone.

Replay uses actual mpv position plus an explicit offset. Pause freezes it; backward seeks reconstruct the relevant recent interval rather than appending future messages. Normalization streams into SQLite-backed chunks. The renderer keeps at most 150 messages; the replay reader retains two bounded chunks, with at most 1 MiB and 1,000 rows per chunk. Updates are limited to five per second. The overlay shows two to twelve recent messages, with six at the default setting. Acquisition is explicit and bounded; ordinary playback never starts an archival job.

The large Twitch fixture is useful for proving bounds and navigation, but it cannot prove original-platform alignment. The genuine YouTube archive supplies that separate real-source evidence. Deleted or unsupported message actions are handled or counted explicitly; chat is rendered as text. Image emotes, avatars, animated content, and chat sending are not part of these candidates. This keeps the default interface and network surface small, while making the remaining fidelity tradeoff visible.

Two additional improvements were selected because they improve actual viewing: clickable replay timestamps/First Message navigation, and useful presentation controls that do not require persistent extra windows. Favorites and a new navigation database were not added; there was no evidence that another persistent subsystem would improve this commission more than reliable playback, replay, and cleanup.

## Verification and resource findings

The final automated source checks pass **143 JavaScript tests and 103 Python tests** at production commit `127f6b98587bbdb8a6f2c532ad2a97665b4a7611`. Exact commands and logs are in `EVIDENCE-APPENDIX.md`; the detailed requirement matrix is `COMMISSION-AUDIT.md`. Tests cover hostile text transport, source validation, provider formats, stale generations, quality restoration, auth lifecycle, read-only protocol behavior, bounded history, replay normalization and clocks, helper cancellation/publication races, hidden-panel following, build safety, and guarded development installation.

Native tests are a separate layer. They cover real decoded media, quality changes, fullscreen, actual replay acquisition and clock behavior, native import/cancellation, webview rendering, physical overlay input, source isolation, setup/rejection states, and archive installation. A passing mock is never used to imply an authenticated session or successful Keychain storage.

The final normal archives were then exercised with the QA plugin retired. Unified completed five ordinary-menu YouTube child open/close cycles; Focus completed five matched cycles plus one smoke cycle. Each cycle passed eleven native checks, preserving the paused archive anchor, its title, frame and identity, every pre-existing window, and the same IINA process. Both final archives also fetched the genuine 693-message replay through their ordinary controls. Unified’s final native rendering check passed five assertions, including a fully visible last message and no spurious Latest control. These are bounded YouTube observations, not a claim about mixed-source or long-session stability.

Final package screenshots are `unified-r2-sidebar.png`, `focus-r2-inspector.png`, and `focus-r2-overlay.png`. The earlier matched comparison captures use the same public archive at 120 seconds; they precede the last scroll-intent correction. The final package captures show later ordinary-use states at different video times and should not be presented as a synchronized visual or resource benchmark. Capture provenance is retained in the evidence pack.

Chat was turned Off and both owned comparison players were closed with retained native-window identity checks. The final Unified close was observed at 20:54:44 UTC, with all other window identities preserved. IINA was left running with both isolated normal candidates enabled. The final preservation audit records the subsequent process, plugin, repository and window snapshot.

`RESOURCE-RESULTS.md` contains the resource table and raw-file hashes. Each candidate was characterized with a fresh IINA process and one 720p H.264/30 fps, AAC/44.1 kHz archive player at 1×. Off, sidebar replay, and overlay replay each used twenty seconds of warmup followed by twenty seconds of sampling, returning to the same video segment. The player was 1280×800 and no extraction helper was active during sampling. Actual before/after state records identify codec, geometry, timing, pause, buffering, and dropped-frame observations.

The observed medians are below. CPU percentages use the operating system process convention; resident memory is in MiB. These are the measured short samples, not a ranking of the products.

| Candidate | Chat Off CPU / RSS | Sidebar replay CPU / RSS | Overlay replay CPU / RSS |
| --- | --- | --- | --- |
| Unified | 7.30% / 174.30 MiB | 7.90% / 178.33 MiB | 13.95% / 184.31 MiB |
| Focus | 6.45% / 114.52 MiB | 8.10% / 127.36 MiB | 8.65% / 97.67 MiB |

There are ten readings in each of six conditions, sixty total. Minor UI corrections occurred between the two QA builds, and the QA control poll remained present. No matched final-archive energy comparison was performed. **No efficiency winner is established.**

These measurements are **IINA root-process CPU and resident memory**, not complete application footprint. WebKit services were parented by launchd; reliable responsible-process attribution required privileges unavailable in this run. Their data is preserved separately rather than silently attributed to IINA. RSS can double-count shared memory and is not physical footprint. Shared WindowServer load, existing applications, system swap counters, fixed mode order, short intervals, and QA polling are disclosed confounders. The measurements support a bounded characterization, not battery-life, long-session leak, or total-memory superiority claims.

A public-source Safari comparison was attempted in a separate test window. Existing Safari settings blocked JavaScript inspection, and decoded quality/codec/timing were not established through the observed UI. No global setting was changed to unblock it, and no unmatched browser figure is presented as a fair benchmark. The owned test window was closed. A window-targeting race had resized the pre-existing Safari window; its three tabs were present at that cleanup observation, but exact original geometry had not been recorded. Bounds were approximately restored from the new window's initial frame. A later read-only snapshot at 20:57:38 UTC reported a different Safari window identifier and one tab, while the Safari process remained the same. No later Safari operation by this execution is known, and the cause is not established. The final presence of the original three tabs therefore cannot be certified; neither tab loss nor responsibility is inferred. Both metadata observations and the accidental resize are disclosed in the preservation audit.

## Remaining acceptance gates and limits

1. **Real Twitch authorization and read-only receipt.** The user must provide a registered Public Client ID and personally approve the least-privilege grant. Verify token validation/refresh, actual channel receipt, reconnect, Off, Forget, and multi-window stop behavior without sending chat.
2. **Persistent login.** Resolve and verify native Keychain behavior with the real app context and explicit user participation if macOS requests access. Until then, treat session-only operation as the supported fallback and do not promise a saved login.
3. **Original Twitch VOD replay.** Import an authorized authentic archive for the matching VOD and confirm alignment, discontinuities, offsets, beginning/end, and seek behavior. The supported import path and synchronization engine are complete; the current synthetic Twitch fixture is not a substitute for this gate. No unsupported private-history API was quietly adopted.
4. **Long-session stability and resource acceptance.** Run a sustained real viewing/chat session and a valid matched browser comparison if the user wants an efficiency conclusion. Short samples do not settle that question. Earlier native JavaScriptCore crashes and an interrupted mixed-source QA cycle are retained in sanitized evidence; their exact causes are not established. The later normal-menu cycles are a separate bounded observation. A native Settings More-button Accessibility trap is independently localized in a different stack; a physical pointer click subsequently completed both candidate uninstall operations. A separate automation session remained in a native menu-tracking loop and needed an owned-process restart after bounded recovery failed. None of these findings is erased or conflated with a proven candidate playback defect.
5. **Host/API limitations.** A native outer-sidebar collapse has no reliable plugin visibility event in the pinned release; explicit Streams Hide/Off has defined cleanup behavior. Closing a managed player clears this plugin's work, but IINA may retain its player/webview objects until plugin/app cleanup. Do not interpret that as immediate RSS reclamation. VOD transport validation currently admits the observed Twitch CloudFront distribution; additional legitimate distributions require reviewed coverage. VoiceOver and the user's full accessibility setup were not formally certified.
6. **Stable promotion.** The user must choose a candidate and explicitly authorize stable deployment. The separate candidate IDs, archives, source history, and rollback instructions are prepared for that decision. No stable identifier was installed or enabled during this commission.

## Run, compare, and roll back

From IINA’s initial window, use the Plugin menu and choose **Open Stream — Unified…** or **Open Stream — Focus…**. IINA builds this menu from the active player’s loaded plugins: an existing managed player shows its own candidate. To switch, return to the existing initial window or close only the candidate’s player and choose the other menu there. Enter a Twitch channel/VOD or YouTube URL. The resulting managed window owns its candidate; the other candidate does not take over it. Chat starts Off. For the public archive used in the evidence, open `https://www.youtube.com/watch?v=92h_kU8O58M`, then choose Fetch Replay. Focus places those controls on its Chat tab.

Use Chat Appearance to choose Sidebar or Over Video. Move Overlay enters an explicit positioning mode; Done or Escape restores normal click-through. Hide Inspector is useful for overlay viewing. Use Off to end chat/replay work explicitly. Authorized Twitch sidecar archives can be selected with Import Archive; they are not fetched automatically.

`INSTALL-AND-ROLLBACK.md` supplies exact native archive installation, optional guarded development-link commands, switching, and uninstall instructions. Native installation enables only the selected candidate identity. Remove a release candidate through its exact Plugins settings row; development links use the guarded manager. Candidate source and evidence remain recoverable independently of the installed copy.

`CONTINUATION.md` is the current handoff. The inherited `HANDOFF-GPT6-PRO.md` is preserved as historical context and is not the current state description.

## Standalone build verification

The first fresh-source export exposed a reproducibility defect in the builder: filesystem enumeration changed the order of the embedded helper object, although every parsed helper value was identical. The existing reproducibility test was strengthened to simulate both forward and reverse enumeration; it failed before the correction and passed afterward. The builder now preserves the published helper order and sorts any future helper names. This is a packaging-tool correction; the candidate runtime files and installed archives are unchanged. Twenty focused build/install tests pass after the correction, and fresh builds on Linux and Apollo reproduce both final R2 archive SHA-256 values exactly. The handoff checkpoint includes this correction separately from runtime commit `127f6b98587bbdb8a6f2c532ad2a97665b4a7611`. See `evidence/tests/build-reproducibility-closeout.json`.
