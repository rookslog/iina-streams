# IINA Streams Candidate Portfolio Implementation Plan

> Execute autonomously under the two attached commissions. The addendum takes precedence. Root owns native UI and integration. Independent research/review agents have disjoint scopes.

**Goal:** Two independently selectable real IINA candidates: Unified (persistent playback controls plus chat) and Focus (video-first overlay plus an inspector with Playback/Chat sections), backed by one reliable engine.
**Architecture:** Keep the operational and preview worktrees immutable. A new candidate-plugin has per-player ownership, cancellable one-shot extractor work, a shared chat model and separate presentation modes. Generated target manifests give A and B independent identities; packaging never targets local.iina.streams or local.iina.streams.dev.
**Tech:** IINA 1.5.1 JavaScriptCore, local WKWebView HTML/CSS/JS, installed Streamlink/yt-dlp, Python standard library for bounded extraction/import. No system package installation.
**Spec:** docs/commission/MAIN-COMMISSION.md, then ADDENDUM.md.

## Global constraints

- No stable promotion, IINA.app modification, global macOS/IINA setting changes, unrelated process/window termination, or system software installation.
- No chat messages sent; chat networking is off by default. Do not acquire credentials/grants without user participation.
- Signed media URLs and tokens never enter logs, screenshots or persistent source metadata.
- Native claims require native observation; synthetic fixtures and offline tests are labeled.
- Preserve original revisions 8140312 and a7b61e1 and both installed plugin identities.
- Per-player settings may change only candidate-owned state; all packages/install routes are reversible.
- User explicitly waived intermediate taste/plan approvals. Continue through routine decisions; preserve only external authorization/stable gates.

## Review focus

1. Stale extraction completing after close or newer request must never reopen media or mutate another window.
2. A file-loaded event from an earlier media generation must not commit a new quality.
3. Imported chat may be huge, malformed, out of order, offset, or have script-looking content; bound memory, sort/index safely, render as text.
4. Seek backwards/forwards, pause, speed changes and mode switching must follow mpv time and stop all live networking on Off/close.
5. Overlay must not steal player clicks; any unsupported dragging becomes accessible placement presets with documented native proof.

## Tasks

- [x] 0. Read commissions in order, all required current project docs, original commission and retrospective; inspect both original trees; baseline tests 12/12 + 8/8; create third worktree.
- [ ] 1. Shared playback contract. Create candidate-plugin/src/source.js and playback.js, helpers/media.py, global.js/main.js. Write failing URL/provider and asynchronous replacement tests first. Source exposes canonical parse and safe label metadata; helper resolve returns private transport plus public metadata/formats. Quality replaces in the same player and preserves VOD position/pause/speed, with generation/deadline fencing. Test ordinary video, live, VOD and hostile URLs. Verify real extraction without printing URLs.
- [ ] 2. Chat foundation and replay. Create src/chat.js, replay.js and helpers/replay.py. Normalize genuine TwitchDownloader and yt-dlp replay formats; imported archive becomes bounded indexed chunks. Playback-time windows use binary search and discard stale chunks. Test boundaries, offsets, seeking, paused state, bursts, deletion and malicious text. Implement native file selection and a useful import workflow.
- [ ] 3. Legitimate acquisition/live chat. Research current official auth and upstream maintained extractors. Implement explicit network opt-in and actual authorization-required/offline/error states, safe token lifecycle where feasible. Do not claim live auth tested without a grant. Implement public replay acquisition only where legitimately supported and authorized; preserve import fallback.
- [ ] 4. Two product interfaces. Implement local native sidebar plus shared renderer; Unified keeps quality above chat, Focus offers contextual Playback/Chat inspector and transparent overlay. Add only worthwhile controls: import/connect/off, offset, placement, font size, opacity, density, reset. No developer selectors, synthetic healthy states or duplicate IINA transport.
- [ ] 5. Native integration harness. A separate QA build/start path owns only explicitly labeled players. Capture sanitized per-window events, frame/audio metadata and UI acknowledgments. No auto-stop in ordinary candidates. Run real playback, quality, negative/close cycles, replay seek/pause/rate, overlay and fullscreen; iterate on observed failures.
- [ ] 6. Native design iteration. Compare A/B on identical real video, bright/dark, compact/wide, keyboard focus, loading/unavailable/error. Refine both proportionately; verify controls through the actual WKWebView bridge and native playback.
- [ ] 7. Resource characterization. Record CPU/RSS, WebKit/helpers, memory pressure and active swap deltas under specified conditions; measure off/on/hide. Use matched browser comparison only if source/codec/quality can be controlled without disturbing unrelated work. Report confounders and no energy claims from RSS.
- [ ] 8. Independent whole-product/code review. Challenge functional parity, real-versus-simulated evidence, source safety, cleanup, overlay input and completed-versus-prototype distinction. Fix material findings and repeat targeted native verification.
- [ ] 9. Deterministic packages, checksums, comparison launcher, exact rollback, report, evidence appendix, continuation handoff and final acceptance ledger. Verify original trees/installed working plugin remain unchanged. No stable deployment.

## Interface decisions

Public source: {kind: twitch-live|twitch-vod|youtube|local-test, provider, id, url, startSeconds}.
Resolution: {source, title, live, duration, quality, formats:[{id,label}], mediaURL, audioURL?, headers?}; private transport stays in memory.
Message: {id, t: seconds, author, text, color?, kind: chat|notice|deleted, emotes?}; escaped/text rendering only.
Replay index: versioned metadata, provider/source ID, optional time mapping, count and sorted bounded chunk descriptors. UI request is player position plus explicit offset, never wall-clock replay.
Chat presentation receives the same bounded message window for sidebar/overlay; live connection state and replay source state remain distinct.
Each implementation task records RED, GREEN, command, actual result and native limits before a meaningful commit. The durable execution journal and continuation note supersede any transient task state.

