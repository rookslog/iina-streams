# BUG-004 — Quality switching closes the IINA playback window

**Status:** Fixed in development and tested inside IINA 1.5.1 on 2026-11-07. Not yet user accepted or stable promoted.

## User observation and impact

The user independently confirmed livestream playback and the sidebar, but reported that selecting a different quality completely closes the player and then opens it again. This loses fullscreen and disrupts the interface. They identified the official IINA Online Media plugin as a good comparison because its quality changes do not appear to close the window.

## Verified cause and implementation reference

- Our prior controller used `core.open(url)`. Read IINA v1.5.1's `PlayerCore.open(_:shouldAutoLoad:)`: if the media is a network URL and the player is not idle, it intentionally closes the current player window and queues the next URL.
- The installed official Online Media plugin (`io.iina.ytdl`, source `src/add-video.ts`) changes quality by setting its format and calling `mpv.command("loadfile", [mpv.getString("path")])`. This replaces media inside the existing player.
- Our new quality controller obtains the chosen fresh Twitch media URL through the on-demand Streamlink extraction, then calls `iina.mpv.command("loadfile", [url, "replace"])`. URL validation, bounded command arguments, and no persistent Streamlink process remain unchanged. It waits for the actual `iina.file-loaded` event before recording the new quality as selected; `mpv.end-file` during replacement is handled as transition rather than a stopped user session. The pending state has an 18-second deadline and is cleared on a window close.
- The title hook and sidebar bridge remain in the same per-player plugin instance. No IINA executable/UI changes.

## Evidence: real tests

1. **Headless mpv smoke**, `tests/qa_mpv_replace.py --live`: 160p30 (284×160) decoded, followed by 360p30 (640×360) in the same mpv PID; no orphan, exit 0.
2. **Real IINA 1.5.1 end-to-end QA**, November 7 at 15:00 Toronto time: new QA player opened hutchmf at 160p30, `sidebarReady=true`, media title `hutchmf — Twitch`, advancing playback. Streamlink extracted 360p30; `mpv.command("loadfile", [url, "replace"])` dispatched, IINA delivered a new `iina.file-loaded` for 640×360 video. After a further ~5 seconds playback had advanced again and sidebarReady was still true. Explicit test counters: **1 window-loaded event, 0 window-will-close events across the switch**; no `window-closed-during-quality` marker. The QA-only stop at 24 seconds led to `end-file`; no Streamlink orphan. See `evidence/tests/m2-same-window-quality-2026-11-07/` for sanitized records (no signed URLs).
3. **Offline tests:** `./scripts/verify.sh` passed 12 tests after switching the mock from core.open to mpv.command; checks selection remains pending until file-loaded, deadline cancellation, invalid-format rejection and no user-unrelated windows.
4. **Limitations:** the 15:00 test was in windowed mode, not confirmed fullscreen, and was a single automated switch rather than a long 10-cycle soak. The mock cannot prove actual GUI/VoiceOver behavior. The mpv command is called without a returned success code in IINA's JS wrapper, so the controller uses a timeout to surface failure. No current evidence of a leaked subprocess. Native fullscreen titlebar overlap (BUG-002) and design refinement are separate.

## User's product/visual feedback for the Pro review

The user supplied a screenshot: when maximized/fullscreen the title/titlebar area overlaps the new Streams sidebar, blocking its upper contents. They also said the current UI is functional but visually unpolished and invited the GPT-6 Pro successor to improve the interaction design. Maintain IINA-native typography and dark/light modes; avoid hard-coded global window offsets and unrelated macOS settings. Analyze the actual screenshot, fullscreen/floating/docked native IINA layout, sidebar insets and accessibility. Test the revised UI at narrow widths and in fullscreen rather than claiming acceptance from code alone.

## Deployment and promotion

At the point this note was written, only the **linked development plugin source** has the new quality controller. The original Bridge is unchanged and disabled, no accepted stable installation has been replaced, and a QA request file is absent. Running IINA processes must not be reloaded or restarted while user windows are open. The user may test a freshly launched stream after the new plugin source is loaded into IINA.

**Gate status:** same-window switching technical test passed; full M2 user visual/interaction and 10-cycle soak still pending. Record explicit Accept / Revise / Roll back / Defer before any stable promotion.
