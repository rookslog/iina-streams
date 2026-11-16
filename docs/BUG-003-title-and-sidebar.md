# BUG-003 — Twitch title leaks signed URL; Streams sidebar messaging fails

**Status 2026-11-07: Implemented and verified in real IINA 1.5.1 (build 183), but final visual acceptance remains open.**
Branch: fix/title-and-streams-sidebar. Primary stream: https://www.twitch.tv/hutchmf.

## Observed defects

1. The user saw the long signed Twitch media URL displayed across the native IINA window title bar.
2. The user did not see a working Streams control panel. QA reported the plugin calling sidebar.loadFile(), but sidebarReady remained false.
3. Reconnecting quality called core.open(), which closed/recreated the network window and discarded sidebar state. The earlier UI would not recover.

## Confirmed causes and correction

- IINA's 1.5.1 MainWindowController.updateTitle() uses PlayerCore.getMediaTitle() for network URLs; that reads mpv's media-title. We had never assigned friendly metadata. The per-player plugin now hooks mpv on_load to set file-local-options/force-media-title to "<channel> — Twitch"; the file-loaded path also applies the title. No system-wide IINA configuration is changed, and signed transport URLs remain internal.
- **Confirmed in IINA 1.5.1 source** JavascriptAPISidebarView.loadFile(): it calls messageHub.clearListeners(). We registered sidebar.onMessage handlers before loadFile; they were discarded. Now loadFile happens before listener registration.
- IINA's JavascriptMessageHub bridge always serializes postMessage payloads with JSON.stringify(data); the prior UI passed undefined for ready, refresh, hide. The webview now sends JSON-safe explicit objects.
- We now automatically reveal Streams controls on first playback in that player; the user can hide them, and the per-player Plugin menu still has Show Streams Controls. A hidden panel remains hidden during quality reconnection. An open panel is reloaded/rebound after window recreation, using current per-player window loaded state. No continuous chat/refresh timer has been added.

## Test results

- 12 offline tests passed, including a new webview protocol simulation and a mock of the actual IINA listener-clearing behavior.
- Fresh IINA 1.5.1 run (November 7, 2026, 14:43 local). hutchmf loaded at 640x360, 2 audio channels; playback advanced. The sidebar sent "ready" and its state showed sidebarReady=true.
- Quality changed to 360p30 through core.open(), started again at 640x360, and the sidebar sent "ready" a second time, with the desired UI state preserved. The media-title and force-media-title were "hutchmf — Twitch" before and after switching.
- A subsequent QA run, with the app brought to the foreground, exposed an actual macOS Accessibility window named "hutchmf — Twitch", confirming the title reached the native window.
- The QA-labeled player was stopped by its explicitly bounded 24-second test timer; no Streamlink orphan was observed in the prior QA cycle. Normal user-created streams have no automatic stop timer.
- The window-only screenshot attempt was refused by macOS ("could not create image from window"). **The sidebar's actual rendered appearance, click handling by a human, VoiceOver, and fullscreen titlebar auto-hide are not independently established.**
- Selected sanitized QA records are in evidence/tests/m2-title-sidebar-2026-11-07/. Raw media URLs, credentials, and the user's desktop are not archived.

## Interface and remaining limitations

The IINA 1.5 UI has a plugin sidebar panel whose side is configured by the native Layout settings. Our controls are not a permanent left-hand floating app. The intended view is a small panel showing the Twitch channel name, a Playing state, quality selector, Refresh, Hide controls, and "Chat is off". It opens automatically on first stream load; can be reopened via Plugin > IINA Streams (Development) > Show Streams Controls while that player's window is focused.

The separate native titlebar/OSC hiding issue remains BUG-002; IINA 1.5 explicitly keeps standard window buttons visible in some sidebar layouts. The plugin does not rewrite native window decorations or full screen settings.

Do not promote to stable before user visual confirmation, real 10-cycle lifecycle tests, accessibility, performance and rollback acceptance. The developer QA request mechanism is not a production feature and must be reviewed/removed for final stable packaging.

## Primary implementation evidence

- IINA 1.5.1 source: iina/JavascriptAPISidebarView.swift, JavascriptMessageHub.swift, MainWindowController.swift (tag v1.5.1).
- IINA plugin docs: https://docs.iina.io/interfaces/IINA.API.SidebarView and https://docs.iina.io/interfaces/IINA.API.MPV
- User feedback: explicit report of signed URL in title, missing controls, and unsuccessful fullscreen/menu-bar attempts, November 7 2026.
