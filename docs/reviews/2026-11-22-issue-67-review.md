# Review: #67 offline fall-through fix (2026-11-22)

Branch `fix/67-offline-fallthrough` (0f518cb, 648905c, 342658c, on beta 11c0d62). Reviewer: Codex gpt-6.2-sol xhigh, read-only, 22:46–22:52. Verbatim below. Protocol: docs/REVIEW.md (D-032).

## Round 1 (verbatim)

**FIX FIRST.** The stop prevents mpv from opening the offline page, but it can discard a newer file and leave IINA’s native Open URL panel spinning.

- **Important (P1, class L) — Stops more than the failed load.** [src/player.js:2067](/Users/rookslog/Development/iina-streams/.claude/worktrees/agent-aec062fe0655b2fd1/src/player.js:2067): Open a local file in the same player while Twitch resolution is pending. The replacement can be queued in mpv before its own `on_load` runs, so the old activation and load counter still pass. In IINA’s bundled mpv **0.41.0**, I reproduced `stop []` deleting that replacement and clearing appended playlist items. `keep-playlist` retained the replacement but still prevented it from starting. [mpv `cmd_stop`](https://github.com/mpv-player/mpv/blob/v0.41.0/player/command.c)

- **Important (P1, class H) — The likely leftover is a loading panel, not just a blank player.** [src/player.js:1939](/Users/rookslog/Development/iina-streams/.claude/worktrees/agent-aec062fe0655b2fd1/src/player.js:1939): IINA shows its native Open URL loading panel for the network load. `END_FILE(STOP)` doesn’t set the failed-open flag, and `idleActiveChanged` won’t close a merely `.starting` player. With no successful load either, the source indicates the panel can keep spinning behind Streams’ VOD picker until dismissed. There’s no exported player-window `close`; `standaloneWindow.close()` targets the plugin’s own window, `core.stop()` after idle won’t close the player, and raw `quit` can terminate IINA. **Safest fix:** resolve before creating the managed player; for offline, show recent broadcasts without creating a player at all. [IINA MPVController](https://github.com/iina/iina/blob/v1.5.1/iina/MPVController.swift), [PlayerCore](https://github.com/iina/iina/blob/v1.5.1/iina/PlayerCore.swift), [OpenURLWindowController](https://github.com/iina/iina/blob/v1.5.1/iina/OpenURLWindowController.swift), [plugin core API](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPICore.swift)

- **Medium (P2, class H) — The test catches missing or late stops, not rejected commands.** [tests/offline-fallthrough.test.js:49](/Users/rookslog/Development/iina-streams/.claude/worktrees/agent-aec062fe0655b2fd1/tests/offline-fallthrough.test.js:49): The three definitive cases failed against both the base and a stop-after-`next` mutation. All five tests still passed with invalid stop arguments or an added NETWORK stop. The underlying ordering is sound: `process_hooks` waits for continuation, then `play_current_file` checks `stop_play` before demuxing. The bundled-library probe confirmed `STOP` with valid arguments and an open failure with invalid ones. [mpv `loadfile.c`](https://github.com/mpv-player/mpv/blob/v0.41.0/player/loadfile.c)

- **Nit — Remove the blanket native-close assumption** in [tests/b6b-player.test.js:6](/Users/rookslog/Development/iina-streams/.claude/worktrees/agent-aec062fe0655b2fd1/tests/b6b-player.test.js:6), [tests/b6b-sidebar.test.js:3](/Users/rookslog/Development/iina-streams/.claude/worktrees/agent-aec062fe0655b2fd1/tests/b6b-sidebar.test.js:3), and [global.js:244](/Users/rookslog/Development/iina-streams/.claude/worktrees/agent-aec062fe0655b2fd1/global.js:244). An aborted load is not a failed open.

**L1–L4:** The JS activation guard is intact, with no `await` between the final checks and `stop`; L2/L3 are unchanged, and the hook releases `next` exactly once. The gap is that JS authority doesn’t see a replacement already queued in mpv. Adopted windows are unchanged. **Keep TIMEOUT and NETWORK fallthrough** for #67: neither is a definitive refusal, and a configured native extractor can still recover.

`npm test`: **835 passed**. The bundled libmpv was exercised directly; the IINA window behavior was checked in source, not in the running app.
## Lead disposition (round 1)

- **Both Importants accepted.** The direction changes to the reviewer's "resolve before creating the managed player":
  - for an Open Stream request, global checks whether the channel is live first;
  - offline: the VOD list appears and no player is created;
  - live: the player is created as today.
- **The in-player `stop` is removed** because of the class-L finding: it can delete a newer queued file.
- **Residual race:** a channel that goes offline between the check and the load falls back to today's behaviour. It's rare, and it's recorded.
- The Medium finding becomes moot with the stop removed; the new tests must discriminate on the pre-check.
- The nits (stale comments) are fixed in round 2.

## Round 2 (verbatim; Codex gpt-6.2-sol xhigh, 23:14–23:20, on d338d4d)

**FIX FIRST** — `d338d4d` removes the destructive stop, but introduces an off-main-thread IINA call and can incorrectly block live playback.

- **P1 · Class H — The HTTP reply can trigger IINA UI work off the main thread.** [global.js:209](/Users/rookslog/Development/iina-streams/.claude/worktrees/agent-aec062fe0655b2fd1/global.js:209): When Twitch replies before the timeout, the continuation can call `createPlayerInstance` off-main; that path opens IINA’s native loading panel. The offline branch also calls standalone-window APIs that synchronously dispatch to main, risking deadlock. A standalone JavaScriptCore probe reproduced `post-await main=false`; the Node shim cannot catch this. [IINA HTTP callback](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPIHttp.swift#L87-L105), [native loading panel](https://github.com/iina/iina/blob/v1.5.1/iina/OpenURLWindowController.swift#L51-L64)
- **P1 — A valid live URL can be sent to the VOD picker.** [src/twitch-helix.js:303](/Users/rookslog/Development/iina-streams/.claude/worktrees/agent-aec062fe0655b2fd1/src/twitch-helix.js:303): The parameters and `data` arrays match the docs, but Get Streams explicitly omits discovery-restricted live streams. Get Users can still find the account, so the code declares it offline and never attempts playback. Separately, [src/twitch-vods.js:202](/Users/rookslog/Development/iina-streams/.claude/worktrees/agent-aec062fe0655b2fd1/src/twitch-vods.js:202) treats HTTP 200 with `errors` and `stream:null` as offline; I reproduced that with a fixture. A field execution failure must be `unknown`. [Get Streams](https://dev.twitch.tv/docs/api/reference/streams#get-streams), [Get Users](https://dev.twitch.tv/docs/api/reference/users#get-users), [GraphQL execution errors](https://spec.graphql.org/September2025/#sec-Handling-Execution-Errors)
- **P1 · Class L — A stale check can overwrite a fresh Open Stream form.** [global.js:216](/Users/rookslog/Development/iina-streams/.claude/worktrees/agent-aec062fe0655b2fd1/global.js:216): Submit A, reopen the form and enter an invalid B. A’s late offline reply replaces B with A and shows A’s VODs; reproduced in the shim. The fence only rejects an old **offline** reply after a newer **valid** input. An old live or timed-out request can still open after B. Preserve intentionally separate opens, but fence updates to the shared form against its current session.
- **P2 — The deadline clears the timer, not the authenticated follow-up.** [src/twitch-helix.js:307](/Users/rookslog/Development/iina-streams/.claude/worktrees/agent-aec062fe0655b2fd1/src/twitch-helix.js:307): If `/streams` returns empty after Sign out and the 1.5 s deadline, `/users` still starts with the old bearer. Reproduced with a synthetic credential. The new path logs status only; the anonymous query sends no viewer credential. The signed-in **VOD list** still uses GQL, the pre-existing [D-034/#49 gap](/Users/rookslog/Development/iina-streams/.claude/worktrees/agent-aec062fe0655b2fd1/docs/DECISIONS.md:132).
- **P2 — The form disappears before there is anything to show.** [global.js:253](/Users/rookslog/Development/iina-streams/.claude/worktrees/agent-aec062fe0655b2fd1/global.js:253): Enter closes Open Stream immediately. Neither a player nor a checking indicator is visible for up to 1.5 s. Both Helix status calls share that deadline; a confirmed offline result then gets a separate 5 s archive lookup, with loading feedback only during that second phase.

**Fixture audit.** The canonical managed-player test no longer means “no HTTP on open”; it means “no HTTP other than the routed status call.” The same accounting change affects `global.test.js`’s native-label, rejected-label, explicit-opt-in, failed-creation and unrelated-Forget tests; B2a’s probe/connect tests; R1’s rejected-label test; and B6c’s unknown-label, invalid-login and repeat tests. The `r.timers` filter narrows the rejected-label and explicit-opt-in tests to non-status timers. Their auth checks still work, but **all 96 affected tests passed** with an in-memory mutation that left the status timer armed and added a synthetic bearer to anonymous GQL. The other fixture edits preserve their assertions after settling.

**Round 1:** The queued-file loss path is gone: the plugin no longer stops mpv. A confirmed offline managed open creates no player, so it cannot trigger IINA’s Open URL panel. `unknown`, a channel going offline after the check, and native/adopted opens can still take the old path.

`npm test`: **840 passed**. The exact anonymous Twitch query returned a live ID, `stream:null`, and `user:null` in direct probes. No native IINA or authenticated Twitch session was exercised. D-032 calls for a step-back now that class H has recurred.
## Step-back after round 2 (lead, D-032: class H recurred)

**What keeps going wrong:** every fix so far crosses an IINA host boundary the shim can't see (mpv's queue in round 1; thread affinity and form state in round 2).

**Written invariants for round 3:**

- **H-main:** any IINA call that touches the interface (`createPlayerInstance`, `standaloneWindow.*`, menus) runs on the main thread. A continuation after `iina.http` must hop back to main before it makes such a call. The hop mechanism must be cited from IINA v1.5.1 source, not assumed.
- **D-offline:** a channel is "offline" only on an answer that positively says so: anonymous GQL `user{stream}` = null **with no `errors`**. Helix Get Streams can't decide this, because it omits discovery-restricted streams. D-034 allows GQL wherever the documented API can't deliver. Anything else is "unknown", which creates the player.
- **F-session:** every update to the shared Open Stream form carries the form session it was started from, and is dropped if the form has moved on. Separate opens stay independent.
- **U-feedback:** the Open Stream window stays open, showing a checking state, until a player exists or the VOD list is shown.
- **A-auth:** no authenticated request starts after its deadline or after sign-out.

**Decision:** one more round, against these invariants. If IINA v1.5.1 offers no citable main-thread hop, stop the pre-check design and park #67. A native experiment with an in-player alternative would then come first.
