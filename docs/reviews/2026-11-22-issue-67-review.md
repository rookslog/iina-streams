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
