# BUG-002 — Top control bar overlaps Streams sidebar

**Reported:** 2026-11-07, during the user's first successful interactive video test, with a screenshot.
**Status:** Open — native OSC/layout interaction; affected visual region witnessed by user; no screenshot copied into Git.
**Priority:** M2 UX acceptance blocker.

## User feedback

The user reported that the bar across the top stays down rather than auto-hiding, obscuring the sidebar UI. The user also said the new stream began working. Their report supersedes the earlier assumption that every unexpected closure represented a plugin crash.

Earlier in the session a specifically labeled QA test player intentionally called `core.stop()` after 24 seconds. It may have explained some unexpectedly stopped test streams. User-initiated normal playback does not have this timer. **Never run a QA test that stops their user-owned player.**

## Evidence and diagnosis

- IINA 1.4.4 build 168 on macOS 27.2 (26B123) was the installed app during this round of tests.
- Read-only preferences show `controlBarPositionHorizontal=0.5064327485380117` and `controlBarPositionVertical=0.00035676840633737183`. These correspond to a floating control bar positioned at the very top of the player; they support an overlap hypothesis, but **do not by themselves prove whether the auto-hide checkbox is enabled**.
- This is probably IINA's **On-Screen Controller (OSC)**, which is independently positioned and timed by IINA itself, rather than HTML from our plugin. The image should be examined before finalizing exact layering conclusions.
- Official IINA 1.5 release notes document an overhaul of sidebar/OSC layouts, docking, and avoiding obstruction, and issue #5715 records a fixed top OSC misalignment on macOS 26/IINA 1.4.1. Sources: https://github.com/iina/iina/releases and https://github.com/iina/iina/issues/5715 . These support a version-sensitive native UI risk but do not establish that the user's exact screenshot represents the same defect.
- IINA's public plugin sidebar API provides `loadFile`, `show`, `hide`, and messaging; it does **not** document moving the native OSC or controlling its auto-hide timer: https://docs.iina.io/interfaces/IINA.API.SidebarView .
- The current M2 test also recorded `sidebarLoaded=true` but `sidebarReady=false`. That is a **separate failure to prove the webview bridge**, and must be tested even if the native OSC moves out of the way.

## UX requirement and minimally invasive workaround

1. Confirm whether the visible bar is the OSC or macOS fullscreen menu/title bar. If OSC, check IINA Settings → UI → On Screen Controller, the *Layout* choice and *Auto hide after* control. A floating OSC can be dragged away from the sidebar; switching its layout to Bottom is another reversible user-level option. **Do not silently change the user's global IINA preferences**. The user may wish to keep top layout for normal video.
2. Independently verify plugin sidebar HTML actually loads and sends `ready`, populates hutchmf metadata, lists available qualities, responds to click, and hides cleanly; capture real app-level evidence.
3. Prefer an upstream-supported non-overlap layout. If 1.4.4 cannot maintain usable sidebar interaction, trial a **conditional, version-sensitive top inset within the plugin sidebar only**, measure visually, and drop it when native layout is correct; do not blindly add large padding or fork IINA.
4. A possible side-by-side 1.5.1 compatibility test may help, but the existing 1.4.4 app must not be replaced without user approval. Another 1.5.1 crash in DiagnosticReports at 13:36 has a different `JavascriptAPISidebarView.cleanUp` signature; investigate separately.
5. Test normal OSC auto-hide during user mouse movement and sidebar focus, light/dark, fullscreen and ordinary window; ensure top controls never prevent operating the quality dropdown.

## Gate status

M2 visual/interaction acceptance remains **open**. Correct native control behavior and an operating/sidebar bridge must both pass. No stable promotion. Do not treat a correctly functioning stream URL or mock tests as evidence that this visual defect is resolved.
