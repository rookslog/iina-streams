# Investigation — IINA Streams, 2026-11-07

## Environment and source integrity
- Apollo Apple M4, 16 GiB unified RAM. Actual OS at 13:17: **macOS 27.2 (build 26B123)**; this supersedes the older OS description in the inherited spec.
- IINA **1.4.4 build 168**. Streamlink **8.6.3**, mpv **0.41.0**, yt-dlp **2026.08.19**.
- Existing Git source began at `5751d8f`; original installed Bridge source matches `evidence/bridge-0.1.0-original/` by `diff -ru` (empty diff).
- The remote agent shell has a different HOME (`/Users/rookslog/.rdc-selfhost-home`) from the interactive user. All plugin commands must use absolute paths or `HOME=/Users/rookslog`.
- Existing Bridge remains installed unchanged. Development plugin linked via official `iina-plugin link` as `plugin-dev.iinaplugin-dev` with identifier `local.iina.streams.dev`. **Disabled after crash report; stable not modified.**

## BUG-001: observed findings vs interpretation
1. The original Bridge is syntactically valid and enabled in preferences. **Its exact click failure remains unobserved.** Do not claim a specific Bridge runtime defect.
2. The original Bridge uses `utils.exec(streamlink, [--player=iina-cli, --player-args=--stdin...])`. IINA CLI documentation states its normal behavior is to quit immediately after launching/handing off media. This creates an unverified stdin-process-lifecycle risk. The direct-URL route avoids that dependency.
3. A new development plugin's global entry did execute, proving IINA 1.4.4 recognizes `globalEntry`. A 13:06 local test reported `playerID:1` for `hutchmf`; player main entry recorded `file-started=true`, `file-loaded=true`, `end-file=true`, and `window-will-close`. Evidence in the user's IINA plugin data directory, captured read-only. This is genuine app-level initialization evidence, **not a visual or audio assertion**.
4. The first dev test build had an **automatic `core.stop()` after 14 seconds** for a label `streams-test:twitch`. This was inappropriate for user-facing development and could explain an apparently abrupt closing. It was **removed** from the source and the pending auto-launch trigger was cleared.
5. Separate **real IINA process crashes** have crash reports dated 12:24:52, 12:25:22, 13:03:20, 13:03:48, 13:04:03. All show `EXC_BREAKPOINT/SIGTRAP`, first main-thread frame `PlayerCore.startMPV()`. The first two **predate the dev plugin link at 13:01**. Some processes were spawned by `iina-cli`. There is no evidence establishing the exact trigger. Read sanitized `evidence/tests/crash-summary-2026-11-07.txt` and originals at `~/Library/Logs/DiagnosticReports/IINA-2026-11-07-*.ips` if authorized. Do not commit raw .ips.
6. The stable IINA app was not upgraded or restarted for the final M2 candidate. The development plugin remains disabled. No new IINA crashes were observed after 13:04 through the last check at 13:21. This is only a temporal observation, not proof of causation.

## Playback architecture: evidence-based change from spec
Option A original: Streamlink persistent subprocess + IINA CLI `--stdin`. This couples player to external lifecycle, and is unverified in the plugin; retained as baseline only.
Option B proposed: Streamlink loopback HTTP server. Adds port allocation, listener security, process ownership and cleanup; no measured benefit yet.
**Chosen candidate: Option C** — on-demand `streamlink --stream-url` produces a temporary HTTPS HLS URL; subprocess exits, and IINA's official `global.createPlayerInstance` opens the URL. The IINA player window owns playback; no long-lived streaming process or listener. Evidence: live `hutchmf` URL extraction exit 0; mpv decoded six frames using that URL without a GUI window; the first IINA JS test created a player and observed file started/loaded events. This does **not** prove sustained reliability or direct URL lifetime under long pauses/reconnects.
- For quality changes, main entry extracts a new signed URL using Streamlink and calls `core.open` inside the current player. **Not yet live-verified.** The IINA 1.4.4 source suggests this may close/reopen the current network window; confirm behavior and whether the sidebar survives on real 1.4.4.
- Twitch player creation uses `enablePlugins:false` to reduce interference/overhead. Docs say the creating plugin remains available. Must test on real UI after crash diagnosis.
- YouTube URLs are provisionally handed to IINA's installed Online Media plugin with `enablePlugins:true`; it is **not** a validated YouTube feature (M4 pending).

## Actual API / compatibility evidence
Official IINA docs:
- https://docs.iina.io/pages/dev-guide (Info.json, `globalEntry`, `file-system` permission, CommonJS)
- https://docs.iina.io/interfaces/IINA.API.Global.html (`createPlayerInstance`, per-instance labels)
- https://docs.iina.io/interfaces/IINA.API.Core.html (`core.open`, `core.stop`)
- https://docs.iina.io/interfaces/IINA.API.SidebarView.html (`sidebar.loadFile`, `onMessage`, `postMessage`)
- https://docs.iina.io/pages/webviews (IINA sidebar bridge and webview isolation)
- https://docs.iina.io/interfaces/IINA.API.Utils.html (`utils.exec` resolves to exit status and stdout; no returned PID)
IINA 1.4.4 tagged source: https://raw.githubusercontent.com/iina/iina/v1.4.4/iina/PlayerCore.swift . `PlayerCore.open` explicitly closes current window before opening a network URL in certain states, and `startMPV` initializes mpv at app launch.
Official IINA website now advertises IINA 1.5.1 (November 2026); **do not upgrade stable without user approval**. A side-by-side compatibility test may help isolate platform issues.

## Scope and unresolved questions
- Why does IINA 1.4.4 crash in `PlayerCore.startMPV()` on macOS 27.2? Prioritize this before repeated GUI tests. Safe next steps: inspect the five reports and current user's settings, compare a normal IINA startup without Streamlink/Bridge in a controlled window, consider 1.5.1 side by side if user approves.
- Does manual Open Stream work and remain open with the automatic stop removed? Not yet retested because of crash interference.
- Does actual quality switching preserve window, sidebar, PiP and audio? Only mocked so far.
- Does the direct HLS URL remain valid across multi-hour playback, Streamlink token expiry or network reconnect? Unverified.
- Old Bridge exact failure mode is still unknown; no permission to silently alter it.

## Safety record
No Safari processes were killed or restarted. No system symlinks or Homebrew defaults changed. No persistent services installed. Only dedicated project repo and development link/preferences changed. The dev test trigger was removed; no app restart is needed to preserve the user’s existing windows.

## Additional real IINA evidence, approximately 13:56–14:00 EST
The runtime exposed two actual missing manifest capabilities: `network-request` for `utils.exec` and `allowedDomains` for direct Twitch HLS URL player creation. The original manifest static tests omitted these; corrected in dev. `hutchmf` then opened in real IINA: 640×360 video, two audio channels, playback time advanced from 0 to >2 seconds, live qualities populated (160p30,360p30,480p30,720p60,1080p60), and a 360p30 quality reconnect through `core.open` resumed playback; QA-labeled test-only `core.stop` triggered `end-file` and no Streamlink orphan. This tests a reconnect to the same 360p resolution, **not an actual resolution increase**. User reported that live playback worked.
The sidebar's state still showed `sidebarLoaded=true`, `sidebarReady=false` during QA; the browser-to-plugin bridge and visual controls remain unverified. User also reported top native control bar obstructing sidebar; see BUG-002.
A later IINA termination at 14:00:39 had `NSApplication terminate` in unified logs and **no new crash .ips**; no evidence identifies who initiated the quit. This is not another confirmed crash, and does not prove startup reliability.
