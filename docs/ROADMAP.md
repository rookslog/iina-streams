# Roadmap and review gates

All gates are evidence-based. Code review is separate from user acceptance. A compile, a valid manifest and a local command-line play test do not establish a release.

| Milestone | Deliverable | Technical gate | User feedback gate | Promotion |
|---|---|---|---|---|
| M0 / diagnosis | Reproduce Bridge failure; make source baseline, preflight, logging/cleanup design | IINA log and observed click-path or documented inability to reproduce | Agree on actual failed step and desired minimal launch | No deployment |
| M1 / v0.1 usable | One Open Stream action in IINA; hutchmf playback; stop/close; offline error | 10 start/stop cycles, 5 on hutchmf when live, no orphans, 1.4.4 compatible, tested rollback | User watches a real session and accepts launch workflow | Manual dev -> v0.1 |
| M2 / v0.2 integrated | Streams sidebar and quality controls, native-looking compact UI | Quality fallback, multi-window isolation, sidebar lazy loading, keyboard behavior | Approve visual/interaction design and quality interruption | Manual v0.2 |
| M3 / v0.3 chat | Opt-in Twitch read-only chat, show/hide, bounded history, Keychain auth | Synthetic burst test; OAuth real chat; connection off when chat off; memory budget measured | Approve chat aesthetics and privacy/auth UX | Manual v0.3 |
| M4 / v0.4 routing | YouTube Live backend comparison and VOD fallback; configurable defaults | Twitch and YouTube test matrix, codecs, interruptions, offline errors | Approve automatic routing behavior | Manual v0.4 |
| M5 / v1.0 stable | Soak, documented energy/memory comparison, reproducible install and rollback | No critical known defects; stable artifact hash and changelog; restore verified | Explicit accept / revise / rollback / defer | Manual stable v1.0 |

Out of initial V1 scope: native IINA seekbar patches, video-embedded chat overlay, sending messages, uncontrolled automatic background updates, broad platform scraping. Reassess with evidence.

## REVIEW record required for each milestone

- Milestone, timestamp, git SHA, IINA/Streamlink/OS versions:
- Exact source, resolution/codec, playback topology:
- Tests passed / failed / not run with command and evidence links:
- Observed memory pressure, per-process memory, CPU, swap-in/out changes, dropped frames:
- Design feedback and accessibility notes:
- Regressions, uncertainties, known limitations, fallback:
- Decision: Accept | Revise | Roll back | Defer
- Who approved and date:
- Release or rollback artifact SHA-256:

## Gate escalation

Any crash, stuck stream process, unexpectedly exposed localhost listener, secret leakage, or repeated failure to play hutchmf blocks promotion. If the live channel is offline, technical tests may use a named backup, but hutchmf-specific acceptance is marked pending. If credentials or permissions are unavailable, omit the chat milestone and preserve working video-only deployment. Promotion always leaves an earlier working artifact available.

## 2026-11-07 implementation checkpoint (does not override technical gates)
- M0: repository, crash reports and original Bridge investigated; original exact failure still unconfirmed. IINA app startup crash is a new release blocker.
- M1: new one-shot direct URL path implemented and short IINA file-loaded proof acquired. Full real playback/audio, 10 stop cycles and rollback gate remain **not passed**.
- M2: sidebar, dynamic quality selection and window-isolation logic **implemented** with 11 Node tests, but real GUI quality change, multiple live windows, performance and VoiceOver remain **not passed**. Candidate packaged for audit only.
- M3/M4/M5: not implemented/accepted. See `HANDOFF-GPT6-PRO.md` for independent audit and onward execution brief.
No stable installation or production acceptance.
