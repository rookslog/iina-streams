# #73 watch history wiring: review record (2026-11-24)

**Under review:** branch `feat/73-history`, `5ca015d..e163279` (the wiring of the reviewed module into global.js and src/player.js).
- **Implementation:** Gemini Hydrogen High, rounds 1 and 2.
- **Tests:** designed by the lead, written by Claude Sonnet.
- **Reviewer:** Codex gpt-6.2-sol at high effort, independent, read-only, run under `docs/REVIEW.md`. Brief: scratchpad `codex-73-wiring-review-brief.md`.
- **Lead's own checks before review:**
  - both suites green: 911 JS, 168 Python;
  - a mutation check of the player half failed at first (deleting `history-start` passed every test). Sonnet then added `tests/history-player.test.js`, and four mutations now fail it;
  - the first focus event name was wrong (`iina.window-did-become-key` doesn't exist in IINA 1.5.1). The shim now rejects names IINA never sends (class H repair).

## Round 1: Codex's report, verbatim

**FIX FIRST.** The review of `5ca015d..e163279` found paths that record cancelled or failed opens, delete the wrong channel, and can trap in IINA’s native menu code. I ran both suites and read the tagged IINA 1.5.1 source; I did not run native playback or query live Twitch or YouTube. No files were edited.

### Important (P1)

1. **H — The deferred rebuild does not protect the native menu setters.** [global.js:643](/Users/rookslog/Development/iina-streams-wt/h73/global.js:643) writes `selected` and `enabled` *before* the timer. Those setters dereference an `unowned` `NSMenuItem`. Switch from a stable Streams window to a beta-managed window that loads only its own plugin, then let the stable window finish loading or close: its old native items have been removed without being rebound. The next setter can trap. This is source-supported, not a reproduced crash. The four global items also push the existing Go Live and Chat items under **More…**, because IINA places only the first five at the top level. **Fix:** replace definitions without mutating mounted items; group the history commands to retain the existing menu positions. [Native setters](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptPluginMenuItem.swift#L23-L43), [managed player setup](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPIGlobal.swift#L74-L82), [menu rebuild](https://github.com/iina/iina/blob/v1.5.1/iina/MenuController.swift#L634-L670).

2. **H/L — Forget can delete a different channel.** [src/player.js:2109](/Users/rookslog/Development/iina-streams-wt/h73/src/player.js:2109) treats *no focus event* as *focused*. A controller installed in an already-open background window can report itself as focused without a main-window transition. Separately, [global.js:616](/Users/rookslog/Development/iina-streams-wt/h73/global.js:616) resolves the target at click time: invoking A’s retained action after focus changes to B deleted **B** in the shim. Native stale-click delivery was not tested. **Fix:** use IINA’s active player at `iina.menu-update` to bind Forget to a specific activation and visit. Reject an obsolete action rather than retargeting it. [Main-window event emitters](https://raw.githubusercontent.com/iina/iina/v1.5.1/iina/MainWindowController.swift), [menu-open dispatch](https://raw.githubusercontent.com/iina/iina/v1.5.1/iina/MenuController.swift).

3. **L — Cancellation fences the archive UI, not the history write.** [global.js:345](/Users/rookslog/Development/iina-streams-wt/h73/global.js:345) records before `showArchives` checks the run and window. I deferred the archive reply, cancelled, then released it: the window stayed closed and history gained a visit. Also, the existing [live precheck](/Users/rookslog/Development/iina-streams-wt/h73/global.js:228) still opens a player after explicit cancellation; successful playback now records it. **Fix:** check authority before recording offline interest, and distinguish explicit cancellation from edits or independent submissions.

4. **H — A failed Streams resolve can still count as a live visit.** [src/player.js:2089](/Users/rookslog/Development/iina-streams-wt/h73/src/player.js:2089) accepts an unmarked load as generation `0`, which is also the initial value before any successful resolve. A failed resolve followed by a matching `iina.file-loaded` posted `history-start` with `source.id` in my probe. IINA does **not** emit `file-loaded` merely because the hook failed; it forwards mpv’s successful load. But the failed hook releases the original URL, and IINA can leave mpv’s yt-dlp loader enabled, so native fallback can succeed after Streams fails. A genuinely unknown user that remains unplayable does not produce this event; the offline archive path also rejects a null user. **Fix:** require successful resolution and handoff for the specific load, not a generation match alone. [IINA event dispatch and yt-dlp option](https://raw.githubusercontent.com/iina/iina/v1.5.1/iina/MPVController.swift), [mpv loader](https://github.com/mpv-player/mpv/blob/master/player/lua/ytdl_hook.lua).

5. **Privacy — Unvalidated channel metadata crosses the bridge.** [src/player.js:2108](/Users/rookslog/Development/iina-streams-wt/h73/src/player.js:2108) posts the whole `channel` object. A synthetic channel display name containing an absolute URL and query reached `history-start` unchanged. [Global’s projection](/Users/rookslog/Development/iina-streams-wt/h73/global.js:581) and the store reject that value on disk. I found no normal flow from the media title, playback URL, OAuth token, or Usher signature into history; the disk allowlist checks format, not provenance, and can accept domain-like or token-shaped identity text. **Fix:** validate and project the three identity fields before posting; fall back to the validated login or channel ID for an unsafe display name.

### Medium (P2)

- **L — Retirement and resolver metadata do not share one lifetime boundary.** [src/player.js:2187](/Users/rookslog/Development/iina-streams-wt/h73/src/player.js:2187) intentionally posts `history-end` after authority ends; the [managed foreign-load path](/Users/rookslog/Development/iina-streams-wt/h73/src/player.js:1983) sends no end, leaving the visit open until window close. Start and focus listeners are activation-guarded; I did not reproduce either posting after loss. Separately, [src/resolve.js:204](/Users/rookslog/Development/iina-streams-wt/h73/src/resolve.js:204) invoked `onChannel` after signal loss in a probe, writing a URL-keyed slot a later same-source load can consume. **Fix:** return identity in the resolve result and send one window-owned terminal message keyed to the visit on every loss path.
- **Twitch VOD fallback silently omits history.** [src/resolve.js:202](/Users/rookslog/Development/iina-streams-wt/h73/src/resolve.js:202) can fall back to Streamlink and play without owner metadata. **Fix:** carry a trusted owner if the existing response provides one; otherwise document the omission rather than guessing or adding a request.

### Verification

- `npm test`: **911 passed**. `npm run test:py`: **168 passed**. The embedded helper matches its source.
- **Network / A:** Live and VOD resolve fixtures made the same **POST, POST, GET** as the base; the existing title POST carries the added fields. No history-specific HTTP path or Auto chat sampling change found.
- **Test strength:** Positive tests catch missing posts and writes, duplicate starts, and wrong durations. But the [failure test](/Users/rookslog/Development/iina-streams-wt/h73/tests/history-player.test.js:108) never delivers a late load; [global cancellation](/Users/rookslog/Development/iina-streams-wt/h73/tests/history-global.test.js:192) cancels before submitting; and identity fixtures bypass the production resolver. Add the failing interleavings above and an entry-point test that asserts both metadata propagation and exact request counts.
## Round 1: lead's dispositions

| Finding | Class | Disposition |
|---|---|---|
| P1-1 menu setters on mounted items; four items push Go Live and Chat under More… | H | **Fix.** Rebuild definitions, never write `selected` or `enabled` on a mounted item. Group the history commands in one "Watch History" submenu, so the top-level items keep their places. Tests 17–18. |
| P1-2 Forget can delete another channel; "no focus event = focused" | H, L | **Fix.** Bind Forget when the Plugin menu opens: IINA 1.5.1 emits `iina.menu-update` only to `PlayerCore.active` (`MenuController.swift:847`), and the global API has no active-player accessor (`JavascriptAPIGlobal.swift`). Remove the assume-focused fallback. An obsolete action does nothing. Test 19. |
| P1-3 cancelled offline open records; the live precheck opens after explicit cancel | L | **Fix both.** Test 20 for history, test 21 for the precheck. The precheck half is #67's, fixed here because it now records. |
| P1-4 a failed resolve, then IINA's native fallback load, counts as a visit | H | **Fix.** A visit starts only for a load this activation resolved and handed off. Test 22. |
| P1-5 unvalidated channel object posted | privacy | **Fix.** The player validates and posts only `{provider, login, displayName}`; an unsafe display name falls back to the login. Test 23. |
| P2 retirement and resolver metadata don't share one lifetime; `onChannel` after loss | L | **Fix.** The identity comes back in the resolve result, so the URL-keyed slot goes. Exactly one `history-end` per visit on every loss path. Test 24. |
| P2 VOD fallback without owner silently omits history | — | **Accept and document.** No visit, and no extra request. Test 25 pins it. |

**Class note (D-032 rule 3):** H and L recur here. The repair is by class, through the test table in `docs/design/finding-2026-11-22/history/TESTS.md`, round 2 (items 17–25), each taken from IINA's source where it mirrors a host rule.

## Round 2 (narrow check): Codex's report, verbatim

# Verdict: FIX FIRST

Reviewed `e163279..d2e0345`. Two P1 findings remain unresolved. Both suites pass, but additional shim probes reproduced incorrect history deletion and playback after cancellation.

## Round-1 findings

| Finding | Disposition | Evidence |
|---|---|---|
| P1-1 — Native menu setters and placement | **Fixed** | [global.js:645](global.js:645). One submenu, no mounted-item writes, coalesced rebuild. Tests 17–18 cover both requirements. |
| P1-2 — Forget targets the wrong channel | **Not fixed** | [global.js:608](global.js:608). The focus assumption is removed, but the shared `boundVisit` still permits incorrect deletion. See below. |
| P1-3 — Cancelled opens | **Partially fixed** | [global.js:361](global.js:361) correctly fences offline recording. [global.js:274](global.js:274) protects only the latest unchanged submission. |
| P1-4 — Failed resolve counts as playback | **Fixed for the reported failure** | [src/player.js:2035](src/player.js:2035) invalidates the generation before resolving; failed resolution cannot match generation zero. Tests 22 demonstrate the negative and positive cases. |
| P1-5 — Unvalidated identity crosses bridge | **Fixed** | [src/player.js:2179](src/player.js:2179) validates and projects identity, with display-name fallback. Tests 23 cover invalid identities and additional fields. |
| P2 — Retirement and resolver lifetime | **Fixed** | [src/player.js:1928](src/player.js:1928), `:1988`, `:2200`; [src/resolve.js:133](src/resolve.js:133). Terminal messages are consumed once, and the URL-keyed metadata slot is gone. |
| P2 — VOD fallback omits history | **Accepted and documented** | `TESTS.md` item 25 and [tests/history-player.test.js:344](tests/history-player.test.js:344) pin the omission without additional requests. |

## Important findings (P1)

### 1. H/L — Forget can still delete another channel

[global.js:626](global.js:626), [src/player.js:134](src/player.js:134).

Two independent failures:

- **Obsolete action:** I retained A's Forget action, bound B, then invoked the retained action. **B was deleted.** Test 19 at `tests/history-global.test.js:407` expects precisely this outcome, contradicting the surviving stale-action requirement in amended item 19.
- **Native window without a Streams controller:** Bind A, dismiss the menu, switch to a local-file window with adoption disabled, and open its Plugin menu. There is no `history-menu` listener to replace A's binding, but the global Watch History submenu remains available. My shim probe confirmed that clicking Forget deletes A.

The latter is a realistic wrong-channel deletion path, not merely a theoretical stale-action delivery concern.

**Host-rule correction:** IINA 1.5.1's `MenuController.swift:847–848` emits the event **before** rebuilding the menu. `EventController.swift:75–79` calls listeners synchronously. The amendment's rationale that binding arrives after menu construction does not match those sources.

Repair the binding contract against windows with and without controllers, and obsolete actions. Native stale-click delivery remains untested.

### 2. L — Explicit cancellation still permits unwanted playback

[global.js:213](global.js:213), `:234`, `:274`, `:285`.

I reproduced both sequences using held status responses:

- Submit A, edit the field, cancel, release A.
- Submit A, edit and submit B, cancel, release both.

**One player opened in each case.**

The lead's residual matters. An edit changes `openRun`, which prevents cancellation even when A is the only outstanding submission. A second submission replaces the cancellation handle entirely.

Preserve independent opens, but distinguish them from pending requests belonging to the same explicitly cancelled form instance. Otherwise unwanted playback can also create history, contrary to item 13.

## Lead's test changes

All four changes are individually justified:

- **Class-L explorer:** Correct. `tests/class-l-explorer.test.js:97` permits terminal history messages without removing the once-per-loss and newer-epoch restrictions at `:408–416`.
- **Startup:** Correct. `tests/global.test.js:69` matches item 17's submenu contract.
- **19b:** Correct. `tests/history-global.test.js:443` ends a visit without closing the window, making its subsequent visit legitimate.
- **#67 F-session:** Correct. `tests/offline-precheck.test.js:341` enforces item 21 while retaining the newer-form isolation assertion. It needs additional cancellation interleavings, not reversal.

## Verification

| Command | Result |
|---|---|
| `npm test` | **929/929 passed** |
| `npm run test:py` | **168 passed** |

The initial sandboxed run failed solely because a shim test could not create a temporary directory. The unrestricted rerun completed successfully.

No repository edits; worktree clean. Native IINA and live provider behavior were not exercised.

**D-032:** H and L recur. Step back and repair their written invariants before the next review rather than applying another sequence-specific patch.
## Round 2: lead's dispositions (step back, D-032; recurring classes H and L)

- **P1-2 Forget (H/L), not fixed for the second time** (corrected from "P1-1": Codex's table numbers it P1-2). Global can't know which window is active: `JavascriptAPIGlobal.swift` has no accessor, and any binding global keeps goes stale. A local-file window has no controller to replace it. The host does scope a player's own menu items to the active window (`MenuController.swift:646`). But a player-side Forget would be the sixth top-level item, which IINA moves under More… (`MenuController.swift:660`).
  - **Decision (lead, provisional, reversible):** per-channel Forget leaves 0.5.6 and goes to the People screen (#76), where the person is named on screen. Pause and Clear stay. The binding code and its tests are removed.
  - **The exclusion is recorded** in PRODUCT.md §Users, "How we prioritize and exclude".
  - **Codex's host-rule correction is accepted.** `menu-update` is emitted before the rebuild, and listeners run synchronously. Item 19's amendment was wrong on timing.
- **P1-3 cancellation (L), partly fixed.** (Round 3 adds the close-button and broadcast-link rows; class C reworded to one predicate, "its own form instance is still showing".) One rule replaces the counters: an explicit cancel covers every unanswered live check that this form instance started. A form instance runs from `openStream()` until its window closes; edits and second submissions stay inside it. Tested as a table in `tests/offline-precheck.test.js` (round 3).
- **Lead's four test changes:** judged correct by Codex.
- **Known classes:** both invariants are added to `docs/REVIEW.md`.

## Recurrence triage (D-032 rule 2; lead, 2026-11-24, written at round 3)

| Class | Round 1 (Codex, `5ca015d..e163279`) | Round 2 (Codex narrow check, `e163279..d2e0345`) | Repair (round 3) |
|---|---|---|---|
| **H: host rule mirrored by guesswork** | P1-1 menu setters and placement; P1-2 Forget's focus guess; P1-4 failed resolve counted as playback | P1-2 again: `menu-update` timing guessed wrong (emitted before the rebuild, listeners synchronous) | Rules taken from source with file:line (items 17–18, 22). Per-channel Forget removed (item 26, class M). |
| **L: authority across async boundaries** | P1-2 Forget retargeted at click; P1-3 cancelled opens; P2 retirement and resolver lifetime | P1-3 again: an edit or a second submission escaped the cancel | One predicate, "its own form instance is still showing" (class C), tested as a table of the ways a form ends (item 27), including the close button IINA doesn't report. |
| **M: which window (new)** | — | P1-2: global has no active-player accessor | Class written; Forget waits for #76. |

**Next review is clearance (rule 4):** one review, seeded with this table and both reports, verifying the current source. Codex built rounds 5–7, so the clearance reviewer is another provider: Gemini Hydrogen when its quota returns, or an Opus gate. At most two clearance reviews. A class that survives goes to the operator as redesign, descope, or ship with the risk accepted.
