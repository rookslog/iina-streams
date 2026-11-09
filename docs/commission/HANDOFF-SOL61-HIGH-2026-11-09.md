# IINA Streams — Codex Lead Handoff
## GPT-6.1 Sol · High effort · November 9, 2026

**Purpose:** Give a new Codex lead enough reliable project context to carry out critical design work, implementation, and genuine native IINA quality testing without repeating the recent misunderstandings or discarding working code.

**Status:** This is a new commission/handoff, not evidence that the proposed redesign has been implemented. The original operational plugin and existing experimental candidates remain user-owned. Stable deployment is not authorized.

## 1. The actual goal and the way to work

Build an IINA Streams experience that is pleasant to operate, not merely a feature-complete plugin with green unit tests. The user finds the current interface seriously unsatisfactory. A previous GPT-6 Pro commission produced substantial working functionality, but its functional and QA checklists did not sufficiently account for direct manipulation, conceptual clarity, authorization ergonomics, update friction, or everyday use.

You are the engineering/design lead, not a mechanical executor of a prescriptive spec. Independently inspect, question and improve the architecture. Commission an independent **Claude Opus 5.5** interaction-design critique if accessible, ideally once before design convergence and again after there is an actual native implementation to inspect. Give Opus the original design sources, actual IINA screenshots, code, and precise complaints. Instruct Opus to challenge the current information architecture and even the inherited principles, not just spacing or visual styles. Preserve its independent findings, then explicitly adjudicate agreements, tensions and rejected recommendations with reasons. A written review or visual mock-up is not the end product.

Prefer small reversible iterations and real use inside IINA. Every important claim needs a provenance label: **observed in installed native IINA**, **source/test evidence**, **reported by user or prior agent**, or **proposed/untested**. Resolve contradictions by inspecting current runtime and source, not by trusting the newest-sounding prose. Keep the user informed with useful checkpoints; do not ask for routine micro-decisions, but do not perform an external OAuth grant on the user's behalf or promote stable without explicit approval.

## 2. Where to begin on Apollo — verified snapshot

Device: **Apollo**, with the Codex lead launched by the operator locally **inside Herdr**. Earlier handoff preparation used RDC-selfhost from ChatGPT; a Codex process already on Apollo should use local tools and verify `HERDR_ENV=1`. The baseline below was read on November 9, 2026; verify again at entry. macOS approximately 27.2; IINA.app **1.5.1**.

| Role | Path | Last known Git state |
| --- | --- | --- |
| Latest candidate source | /Users/rookslog/development/iina-streams-candidates | clean; branch fix/live-overlay-independent-20261108 at 05eba8d |
| Preserved operational M2 | /Users/rookslog/Development/iina-streams | clean; branch design/tnf-quiet-streams at 8140312 |
| Preserved earlier native design preview | /Users/rookslog/development/iina-streams-design | clean; branch design/in-app-panel-comparison at a7b61e1 |
| IINA installed plugins | /Users/rookslog/Library/Application Support/com.colliderli.iina/plugins | contains separate candidate IDs |

Installed candidate identities on last inspection:
- **Unified Candidate**, local.iina.streams.candidate.unified, **v0.5.1** enabled. Its files matched the built v0.5.1 overlay-fix directory on November 9.
- **Focus Candidate**, local.iina.streams.candidate.focus, **v0.5.0** enabled. Its files matched the earlier v0.5.0 candidate package.
- v0.5.1 Focus and Unified archives also exist in dist/live-overlay-fix-20261108; do not assume Focus 0.5.1 is installed.
- Neither a new stable deployment nor an installation of a new design-lab plugin is authorized by this handoff.

Latest test run observed on Apollo, Nov 9: **150 JavaScript tests passed** (node --test tests/*.test.js tests_candidate/*.test.js), **103 Python tests passed** (python3 -B -m unittest discover -s tests_candidate -p 'test_*.py'). These establish automated/source behavior only. They do not establish end-to-end Twitch login persistence, native direct manipulation, authentic Twitch VOD history or long-session resource stability.

**Review lane:** The operator launches the Codex lead inside Herdr. A genuinely independent Opus review should run as Claude Code in a **separate Herdr pane**, not as a Codex subagent. Codex's `streams_ux_critic` is an optional *internal* Sol reviewer, not Opus. Herdr's own skill requires `HERDR_ENV=1` before pane control; do not manipulate Herdr from an unrelated RDC shell. Separate model configuration, skill/hook visibility and reviewer access must be checked. No reviewer pane has yet been started by this document's author.

**Read first, in this order:**
1. This document, then the live Git status, installed identities, and candidate source.
2. docs/CONTINUATION.md, docs/SELECTION-REPORT.md, docs/COMMISSION-AUDIT.md, docs/PRESERVATION-AUDIT.md, docs/EVIDENCE-APPENDIX.md and docs/RESOURCE-RESULTS.md in the candidate worktree.
3. docs/BUG-005-twitch-device-code-poll-rejected-400.md and docs/BUG-006-overlay-sidebar-live-freeze.md, then corresponding source/tests; the former records a corrected OAuth polling bug, the latter a source-level chat freeze fix not yet natively accepted.
4. candidate-plugin/ui/{sidebar.html,sidebar.css,sidebar.js,overlay.html,overlay.css,overlay.js,live.js,live-history.js,overlay-live.js}; candidate-plugin/src/{player.js,auth.js,replay.js,playback.js}; candidate-plugin/global.js; candidate-plugin/helpers/{acquire.py,replay.py}.
5. The two historical project commissions at docs/commission/MAIN-COMMISSION.md and ADDENDUM.md. Their original preference for explicit move mode and reserved control-bar regions is **superseded by the user's newer direct-manipulation feedback below**. Their preservation, genuine-acquisition, and test rigor requirements remain relevant.
6. The **original** Tap and Filter design sources, not just the earlier Streams summary:
   /Users/rookslog/Development/personal-work-ecosystem/local/2026-10-15-codex-campaign/TNF-LEAD-sol/pstack-trial/.audit/opus-design-work/DESIGN-PRINCIPLES.md
   alongside GESTURES.md, INTERACTION-MODEL.md, WORKFLOWS.md and relevant design reviews there. Also read /Users/rookslog/Development/tap-n-filter/PRODUCT.md.
7. Actual native screenshots: dist/delivery/unified-r2-sidebar.jpg, focus-r2-inspector.jpg and focus-r2-overlay.jpg; older images have different build/clock provenance. For new reviews, make fresh screenshots inside IINA.

Prior docs are often historical; prefer exact current bytes, timestamps and native observations. The old selection report recommends Unified for first adoption review but is **not user acceptance of that UI**. The existing Focus design is not entitled to preservation as a product concept.

## 3. User feedback — concrete and authoritative

### A. Chat overlay should feel like a draggable Mac control

The user wants to **grab chat directly on the video and move it freely**, like IINA's floating playback bar, without opening Appearance, pressing Move Overlay, using a special temporary handle, or pressing Done. Chat should also be **resizable on the video itself**. It should be possible to position it anywhere in the video area, including underneath/over the region ordinarily occupied by IINA's playback controls, rather than hitting weird arbitrary limits. It should retain position and dimensions reasonably across messages, window changes and fullscreen, with recovery/reset and precise non-drag accessibility routes.

Current code has hardcoded 16px horizontal margins, 56px top exclusion, up to 120px bottom exclusion, a nonresizable width min(340px,38vw), height indirectly controlled through line count, and a view.editing mode gating drag. Coordinates are fractions of the **remaining free movement range**, so changing panel dimensions can itself move the panel. The page currently broadens clickable elements during editing, risking interference with the player. These are source observations; native consequences still require reproduction.

**Interaction requirement, not a predetermined technical solution:** identify what IINA 1.5.1 actually permits. The overlay normally needs click-through to the video outside interactive regions. Test whether drag can start from the chat surface without a special mode, whether resizing edges or a subtle corner grip can coexist with IINA's input routing, and whether the host intercepts clicks over the OSC. Minimize mode changes, avoid full-screen click interception, preserve accessibility. Placement beneath the control bar may be obscured when host controls are visible; do not alter global IINA settings or patch binaries merely to force it. Document any proven host limit and the best usable alternative.

### B. The information architecture and settings are wrong

Focus's Playback tab contains essentially quality, refresh, loading and error state, while Chat contains most controls; the tab spends its own navigation on almost nothing. Unified is a more promising starting point, but its resting face, density, text, and settings still need critical review. The user does not want another narrowly aesthetic critique; question why the whole interface is composed this way. Native IINA already owns transport controls.

Review a compact persistent stream identity/quality area, contextual chat display, an overlay-first presentation when appropriate, and a coherent separation between routine adjustments, appearance, replay, and account management. Do not just strip away useful information to achieve minimalism. The existing appearance disclosure contains too many unrelated controls; **Forget Twitch login** is buried next to Reset appearance. Text size, opacity and visible-line sliders do not show precise values; placement is redundantly split between presets and Move. Raw replay offset is in seconds. Prefer state in the objects, direct manipulation, shortcuts and controls with discernible outcomes; use explanations on demand. Host glass is sufficient; fake glossy styling is not a priority.

The original TNF critique includes a crucial warning: agents often count widgets or write UI narration for reviewers rather than test whether the person can complete their task. Also follow TNF's corrective lesson that removing narrative text *without a discoverable signifier* is another failure. Keep reusable design principles, challenge misapplications, and compare genuinely different interaction philosophies if alternatives remain worthwhile.

### C. Twitch account lifecycle must make sense

User reports repeated device-code prompts, apparently successful approval followed by another prompt or no loaded chat, and confusion after restart. User is **not certain** whether Keychain persistence works. Absence of a second error message is not proof of persistence.

The source has a global TwitchAuth, intended Keychain read/write and refresh, and a saved public Client ID. IINA namespaces Keychain storage by plugin ID; Unified and Focus may not share grants. BUG-005 documented an actual IINA HTTP rejection normalization defect: expected authorization_pending HTTP 400 was being misread as refusal. Commit 146ab72 corrected this in the source/tests. Commit 05eba8d moved the single live IRC transport to the overlay WebView to avoid sidebar-collapse freezes. **Neither correction proves that a real grant persists after a clean restart or that a live overlay stays updated when hidden.**

Review the auth state machine and its user-facing meaning. Design one clear account/authorization surface separate from chat presentation. A successfully stored grant should be reused and refreshed; chat Off must mean disconnect, **not** Forget. A new device code should only appear for a genuinely absent, revoked, expired/unrefreshable, or incompatible grant, with intelligible error/diagnostic state. Test device-code pending/approved/rejected paths, repeated Connect, source/window changes, close/restart, session-only fallback, and cross-variant isolation. Never echo tokens, secrets, device codes or credentials into audit artifacts. Do not claim an OAuth end-to-end pass without a user-authorized real grant.

One configuration clue: the Unified candidate data path has a twitch-client.json file; Focus's corresponding file was not observed in the earlier inspection. This is non-secret Client ID storage, not evidence of a valid Keychain token.

### D. Make iteration practical

The user dislikes installing a .iinaplgz every time a small design correction is made. Investigate IINA's supported **development plugin .iinaplugin-dev links**, which are already used by earlier project work. Create a deliberate, independently named design-lab identity and safe development-link/reload workflow, after checking existing identifiers and collisions. A link may support quick webview CSS/JS reloads; main/global runtime changes may still require plugin/app restart. **Prove actual iteration behavior in IINA**, do not promise instant hot reload without testing.

The current candidate manager guards candidate links and **refuses collisions with installed copies**. Do not overwrite installed plugins to make development convenient, and do not touch original operational/development/preview links. Maintain source/test/build separation, rollback, and a repeatable simple testing route.

### E. Genuine Twitch VOD historical chat

The current Fetch Replay flow handles YouTube archives; a genuine YouTube archive with **693 messages** was tested. Twitch VOD import/synchronization handles TwitchDownloader-style JSON; a **100,000-message synthetic** archive stress-tested bounds. That is **not** an end-to-end authentic Twitch VOD acquisition. Investigate maintained, legitimately accessible tools such as TwitchDownloader for **public or otherwise authorized** VODs, their availability, licensing/maintenance/API restrictions, and a user-initiated Fetch Replay pathway. Do not bypass private-history access or falsely claim an official Twitch historic-chat API.

Accept only real-source evidence of acquisition, matching VOD identity, timeline alignment, pause, forward/backward seeks, speed, offsets, cancellation and unavailable states. Preserve the existing bounded replay engine and import fallback. Do not make ordinary video playback depend on replay availability. Distinguish synthetic data, previously captured genuine YouTube replay, and new genuine Twitch replay observations.

### F. Small chat readability improvements

**Colored usernames: high-priority, small feature.** Twitch IRC parser already accepts per-user color; replay importer retains color; player safeMessage retains validated hex color. Both sidebar and overlay currently render every author with one hardcoded color. Honor actual Twitch color when supplied, and produce a stable user-identity-based fallback when absent; maintain contrast on bright/dark/translucent backgrounds. Ensure consistent colors in live sidebar, overlay and historic replay without introducing high rendering cost.

**Emoji and emotes: secondary.** Unicode emoji should render as normal WebKit/macOS text; verify real messages and fonts. Twitch-specific emotes require image metadata, secure retrieval, CSP/repository review, bounded loading/cache and text fallback. Prefer static official Twitch emotes if justified; animated and third-party BTTV/FFZ/7TV emotes are low priority. Never discard message text because an image fails. Do not delay core overlay and auth corrections for emote work.

### G. Resource efficiency matters

Apollo is a 16 GB MacBook Air and the user has experienced excessive WebKit and swap load. Keeping a WebView active to maintain live IRC in sidebar mode was a purposeful v0.5.1 fix, but may cost background memory/energy. The existing resource report contains limited IINA root-process CPU/RSS samples and cannot establish full WebKit footprint, battery efficiency or a fair browser comparison. Compare Off, sidebar, floating overlay, hidden inspector, login/reconnect, replay, and sustained chat; collect attributed helper processes, WebKit, real CPU/RSS, memory pressure, swap *rates*, frame drops and energy indicators when feasible. Declare confounders; don't invent a win.

## 4. Design review and implementation protocol

This is an iterative research/engineering commission, **not a frozen feature checklist**. Suggested order:

1. **Recover and observe** actual currently installed behavior, local repository, latest tests, and proper evidence. Keep a short ledger of observed defects versus reports/assumptions. Identify candidate identities and clean starting point.
2. **Independent critique**: commission Opus to inspect all relevant native states/screens and complete user journeys, critique TNF transfer, identify root causes and conflicting constraints. Its output must remain distinguishable from the Sol lead's view. If unavailable, record that clearly and continue a documented independent self-review.
3. **Design synthesis**: compare credible arrangements. Do not automatically retain Focus's Playback/Chat tabs or accept the current Unified panel unchanged. State reasons and conflicts. Privilege actual task flows: open video; connect once; receive chat; move/resize overlay; quality-switch; watch VOD with synced original chat; return another day without reauth.
4. **Fast native development loop**, with isolated reversible source and dedicated dev identity; distinguish UI reload from plugin lifecycle; maintain two serious alternatives only if each is actually viable. First useful implementation should make direct overlay repositioning and resizing work, with click-through outside the overlay.
5. **Close the native test loop**: actual mouse gestures, normal/fullscreen, title/OSC overlap, narrow player, window resize, changed message height, multiple simultaneous messages, keyboard, theme/contrast, multiple sources, reconnect and hidden-sidebar live updates. Capture before/after screenshots and actionable traces, not solely DOM/mock tests.
6. **Functional work**: account persistence, genuine VOD history acquisition, username colors, Unicode emoji; do emote-image support only if complexity/resource costs are justified and time remains. Correct defects encountered and re-test previously verified YouTube replay and quality transitions.
7. **Independent post-build Opus review** of the *actual working UI*, including screenshots/gesture observations, then an engineering reconciliation, iteration and reproducible evidence-based comparison.

A preview or screenshot is not a working candidate. Mark unsolved matters explicitly rather than interpreting a green source test as user acceptance. Avoid a long report as a substitute for a working design. Existing engineering behavior (same-player quality switching, provider routing, replay clocks, helper cleanup, bounded live history, Off) should not regress.

### Minimum native acceptance journeys

- Drag chat directly to each edge and the OSC area, resize it, release; position remains stable as messages change, player resizes and fullscreen toggles; a reset/recovery route exists. Outside-chat clicks still reach IINA. Verify UI isn't stuck in interaction mode.
- Quality selection changes in the same player and retains paused/seek state where applicable; title/sidebar/other windows remain intact.
- Chat connection uses existing saved grant after a clean authorized restart **if** Keychain persistence is available. A failed storage attempt is an explicit state, not inferred success. No duplicate authorization prompt on ordinary sidebar hide/show, source changes or Overlay/Sidebar switching.
- Live Twitch messages continue arriving after native sidebar collapse; transport doesn't duplicate after switching presentations; Off stops live/replay work.
- Genuine Twitch VOD chat acquisition, if provider works, is traced end-to-end separately from import/synthetic tests. If blocked, explain exact external gate with a useful authorized fallback.
- Colored names are stable/readable; Unicode emoji remain intact; image-emote failure leaves text. Keyboard/focus and Reduce Transparency/Increase Contrast retain readable content.
- Repeat normal-menu player open/close, quality, replay and chat cycles; check resource overhead and dangling helpers. Don't touch unrelated windows.

## 5. Evidence and safety boundaries

- The exact user-controlled stable plugin must not be overwritten, renamed, enabled, or deployed without fresh explicit user approval. A working candidate is **not** stable-promotion authorization.
- Preserve the three existing worktrees/branches, candidate archives, installed candidate identities, dev links, evidence, rollback paths and original IINA settings. Do not git reset/clean/rebase away historical work. Start a clean separate worktree/branch or an explicitly isolated source checkpoint before implementation.
- Before any native install/replacement/uninstall, check exact plugin identifier, path, version and active player ownership. Existing IINA tests observed an Accessibility-triggered crash when AXPress was used on Settings > Plugins > More; prefer verified physical clicks if that control must be used. Do not quit/restart IINA, change system-wide settings, close unrelated players/tabs or remove existing plugin preferences casually.
- Any authenticated Twitch test needs user cooperation. Never dump raw tokens, Keychain contents, credential-bearing URLs, or private data into reports or logs. Use public authorized sources, minimal permissions and local redaction.
- Prefer isolated dev deployment over repetitive .iinaplgz installs. Production packages need versioned source, exact hashes, rollback and visible verification in native IINA.
- Benchmark claims require matched workload and attribution; WebKit sub-processes and swap must not be silently excluded. Retain failed tests and uncertainty, not only clean screenshots.
- The lead owns the outcome but remains free to challenge and improve these recommendations. If a proposed UX is demonstrably impossible under the supported IINA API, present the evidence and the best working alternative; do not pretend implementation occurred.

## 6. Deliverables and continuity

Keep a short current-state/handoff file in the new worktree; append an evidence ledger with test provenance, actual screenshot paths, design decisions, rejected alternatives, known regressions and owner-specific changes. Record the independent Opus critique as an attributable input, not as a binding spec. Deliver at least one substantially improved, working native candidate and, if meaningful, a second distinct functional experience with fair comparison. Include exact Git branch/commit, changed plugin ID, build/install or reload instructions, tested IINA version, user-facing behavior, remaining gates, and explicit rollback.

**Success:** the user can directly move and resize chat inside IINA; control visibility/quality and chat presentation without fighting the settings hierarchy; understand and retain Twitch authorization where supported; view genuine synchronized replay where legally available; and evaluate the result through real native tests rather than trusting an agent's assurances.

**Reminder:** The priority is a good, functioning experience. It is acceptable—and desirable—to revise this handoff where actual evidence warrants it. Record the departure and its reason.
