# 0.6.0 overhaul: two directions (#20) — 2026-11-22

**Status:** proposal for the user to judge. Not approved; nothing here is built. Base: `beta` at `a5ad195`.

**Evidence level.** These are static mockups and source reading. No frame shows native IINA behaviour. Host facts below come from IINA's v1.5.1 source (the installed app reports 1.5.1) and from `strings` on the installed binary. Per `AGENTS.md`, source reading ranks below a native observation, so each host fact is a hypothesis until the lead checks it in IINA.

Open the pages in a browser. Each page has a light/dark/auto switch at the top. A dashed outline marks what IINA draws, not Streams.

- [direction-a-column.html](direction-a-column.html) — **A: Column.** Chat is a column in the IINA sidebar, beside the video.
- [direction-b-stage.html](direction-b-stage.html) — **B: Stage.** Chat sits on the picture, docked or floating. The sidebar shrinks to a settings form.

All names in the mocks are placeholders.

## What both directions share

These follow from the #9 text pass, `TWITCH-SIGN-IN-2026-11-22.md` and the issues, whichever direction is chosen.

- **One state signifier per thing.** Each slider shows its value. The busy state is a ring or spinner, with the step in a tooltip. The reason a control is disabled is its tooltip. The ↓ jump appears wherever chat scrolls, so the overlay gets one too (#20's open question).
- **Device-code step (#20).** **Approve on Twitch** becomes a filled primary button under a large code that has a copy affordance. Today it is a plain button the user didn't notice.
- **Behind live (#51).** The LIVE badge turns into the time behind live (`−0:42`), and clicking it goes live. The A4 spike owns the DVR window ("go further back"). Neither direction designs that part.
- **Open Stream (⌃⌘O).** A standalone window replaces `utils.prompt`. It offers Following (#30), opted into through one button that requests `user:read:follows`. An offline channel shows its recent broadcasts instead of an error (#32).
- **Menu with shortcuts (#52).**
  - Plugins › Streams carries Open Stream, Go Live, Chat, and the chat layout.
  - ⌃⌘L, ⌃⌘C and ⌃⌘B are proposals. They don't collide with IINA's default ⌃⌘ bindings: `Contents/Resources/config/iina-default-input.conf` binds V, S, A, P, F and T.
  - Unchecked: collisions with users' custom bindings.
- **Removed:** the separate Chat heading, "Signed in as…", the plugin's own × and **Hide inspector** (IINA's ‹ already hides the sidebar), and the permanent ↻ (it becomes a menu item).

## Comparison

| | **A: Column** | **B: Stage** |
|---|---|---|
| Side chat (#47) | IINA's own layout. With IINA's **Edge-to-Edge Video** turned off, IINA puts the plugin sidebar beside the video and stops hiding it when the video is clicked. | Streams' own layout. The overlay draws a full-height strip, and Streams sets mpv's `video-margin-ratio-right` so the picture is drawn beside it. |
| Where controls live | One toolbar row in the column: quality value, chat, layout, appearance, account avatar. | A small on-video cluster beside IINA's controller (LIVE, chat, Dock/Float, settings), plus a settings form in the sidebar. |
| Open Stream | Quick open, keyboard first: a list, like Spotlight. | Browse: a grid of thumbnails, like Twitch's home page. |
| **Buys** | Builds on the surface that already has keyboard hooks. Read in `ui/sidebar.*`: chat is a focusable `role=log`, and `sidebar.js` treats arrow, Page, Home and End keys there as scrolling. VoiceOver has never been audited there (J10). The side layout is IINA's own behaviour, seen in source, with no new Streams mechanics. Fewer moving parts to ship tonight. | Works without changing any IINA setting, in a window or fullscreen. The picture-first look fits J7. Quick actions sit near the controller, as #52 asks. |
| **Costs** | Side chat needs the user to turn off Edge-to-Edge Video. That is an **app-wide** IINA preference, so it changes every video and every IINA sidebar, not only streams. It also unlocks the window's aspect ratio (`Preference.swift:1007-1009`), so letterbox bars may appear. The original commission (`docs/archive/commission/HANDOFF-SOL61-HIGH-2026-11-09.md`) cautions against altering global IINA settings to force a placement. No plugin API reads or sets the preference; indirect detection is unchecked. A fresh install gets today's behaviour: the column over the picture, closing on a video click (§1b). The sidebar starts on the left by default. | Three unverified host behaviours carry the layout: mpv margins under IINA's renderer, how the overlay stacks against IINA's controller and title bar, and overlay pointer delivery (#18). Keyboard and VoiceOver access to chat depends on the overlay webview taking focus, which is unknown. Thumbnails need a CSP and `Info.json` change. |
| Journeys served best | J2 (type-ahead to a followed channel), J4 (VODs inline), J5 (sync and behind-live in the column), J10 | J7 (lean-back and fullscreen), J1 (no setting to change), J2 and J4 visually |
| Journeys it strains | J1: a stranger must change an app-wide IINA setting to get side chat. Until then the column covers the picture and closes on a click. | J10: possibly unreadable with VoiceOver. J5: offset controls live in a hover cluster. |

### Coverage (the brief's six areas)

| Area | A | B |
|---|---|---|
| Sidebar: hierarchy, controls, sign-in and account, quality, chat on/off, appearance | §1, §1b, §2, §3; every control is disposed of below | §5 (settings form), §4 (sign-in in the card) |
| Over the video versus beside it (#47) | §1 beside, §3 layout menu, §4 over | §1 dock, §2 float |
| Open Stream, Following (#30), offline VODs (#32) | §5 | §6 |
| Live controls (#51, #52) | §2 behind-live, §6 menu | §3 cluster |
| Loading, empty, error | §2 (signed out, code, connecting, connected with nothing said, chat error, playback error, YouTube, off), §5 (loading, nobody live, not granted, not found) | §3–6 (same set, plus quality loading) |
| Keyboard and VoiceOver (J10) | §7 | §7 |

### Every control in today's `ui/sidebar.html`

| Today (id) | A: Column | B: Stage |
|---|---|---|
| `title`, `source` | Header: channel name, LIVE or behind-live badge, title on one line | IINA's window title |
| `open` (＋) | ＋ in the header opens Open Stream | Menu and ⌃⌘O only |
| `hide` (×), `hide-for-overlay` | Removed; IINA's ‹ hides the sidebar | Removed |
| `quality`, `refresh` | Quality menu button showing the value; Refresh is a menu item | Quality row in the form; Refresh in its menu |
| `transition`, `playback-error` | Spinner in the quality button; one error row with retry | Same, in the form and on the video |
| `chat-kind`, `chat-busy`, `chat-status` | Removed; the chat button's state and ring, step in its tooltip | Same, on the cluster's chat button |
| `chat-toggle` | Chat toggle button in the toolbar | Cluster button plus a switch in the form |
| `appearance-toggle` and its popover | Aa button opens the Appearance popover | Merged into the settings form |
| `connect` | Primary button where chat would be | Primary button in the card and in the form |
| `import` (Import archive…) | Menu item only | Menu item only |
| `fetch` (Fetch replay), `resume` (Resume replay) | Folded into the chat button: on a VOD, turning chat on fetches the replay or resumes it. One user action, as today. | Same |
| `auth-panel` (Client ID setup), `retry`, `use-other-id` | Unchanged sheet, shown only without a Client ID; "Use a different Twitch app…" moves to the account menu | Same; the item moves to the form's Twitch group |
| `auth-code-panel`, `authorize-open` | Large code with copy, filled **Approve on Twitch** | Same, inside the card |
| `account-row`, `forget` | Avatar menu: @login, Sign out | Twitch group in the form |
| `presentation` | Layout button: Sidebar or Over video | Placement: Dock or Float |
| `font-size`, `spacing`, `timestamps`, `opacity` | Appearance popover, values shown | Form, values shown |
| `placement` (Snap corner) | Position corner picker under Over video | Float position corner picker |
| `reset` | Reset in the Appearance popover | Reset Chat Position in the form |
| `replay-controls` (`offset`, `first`) | Sync button opens an m:ss stepper and First message; a hover glyph on a message syncs to it | Stepper in the cluster; same hover glyph |
| `messages`, `follow` (↓) | Column; ↓ jump | Strip or card; ↓ jump |

Gaps: neither page draws the first-run Client ID setup sheet. It is unchanged from the sign-in design and appears only when no Client ID is known. Neither page draws a missing-dependency state either, because #36 aims to remove it.

## Recommendation

> **2026-11-22 update:** the lead chose the margin-docked overlay column instead of A, pending the native margin test. See D-028 in `docs/DECISIONS.md`.


**What you're deciding.** You're choosing which interaction model 0.6.0 builds. That is a judgement about what the launch audience values: chat as a dependable column, or chat that stays out of the way of the picture. It's yours because it sets the launch screenshots and the native tests that follow.

| Option | Buys | Costs |
|---|---|---|
| **A: Column** | Builds on existing keyboard hooks; the side-by-side layout is IINA's own; least new code | Side chat needs an app-wide IINA setting change; fresh installs get today's covering, click-to-close sidebar |
| **B: Stage** | No setting needed. Works the same in fullscreen. Controls sit near IINA's controller. | Rests on three unverified host behaviours; accessibility risk. |
| **A, with B's dock as a fallback** | A's strengths, plus side chat when Edge-to-Edge stays on | Two layout mechanisms to test and maintain |
| **Defer: keep today's panel, apply only #9** | Zero risk tonight | #20, #47 and #52 stay open at launch |

**My pick: A.** The column already has keyboard hooks, and the webview sidebar is the likeliest place for VoiceOver to work, though that is unaudited. Its side-by-side layout is behaviour IINA ships, not something Streams has to make work. B's dock rests on three host behaviours nobody has observed. A's real weakness is the first ten minutes: side chat needs an app-wide setting that the commission advises against changing for users. That is why the hybrid row exists.

**The assumption A rests on:** with Edge-to-Edge Video off, IINA 1.5.1 keeps the plugin sidebar beside the picture and open when the video is clicked. The source says so (below). Nobody has seen it natively.

**What would flip it.** I'd switch to B, or to the hybrid, if any of these happens:
- the native check shows the sidebar still covering the video or closing on a click;
- the aspect-ratio unlock leaves bars you find unacceptable;
- you won't ask launch users to change an app-wide IINA preference. Then the hybrid wins, provided B's mpv-margin check passes.

The check takes about two minutes in the lead's IINA slot:
1. Turn off Edge-to-Edge Video in IINA's sidebar settings.
2. Show Streams.
3. Click the video, then resize the window.

If B is chosen instead, first check that setting `video-margin-ratio-right` from the plugin moves the picture in IINA.

## Host facts and their sources

From IINA's GitHub source at tag `v1.5.1`. "Read" means I read the passage. Unless stated otherwise, none of it was observed natively.

| Fact | Source |
|---|---|
| A plugin's sidebar API is only `loadFile`, `show`, `hide`, `postMessage` and `onMessage`. It has no width, side or placement control. | `iina/JavascriptAPISidebarView.swift:14-20` |
| Edge-to-Edge Video (`edgeToEdgeVideo`, default `true`) is a user toggle in IINA's sidebar Layout pane. | `Preference.swift:175`, `:1142`; `SidebarLayoutPane.swift:100-102`; installed `en.lproj/Localizable.strings:556` "Edge-to-Edge Video" |
| With it off, the video container is constrained between the leading and trailing sidebars, so they sit beside the video. | `MainWindowController.swift:873-889` |
| With it on, one click on the video hides all sidebars. | `SidebarController.swift:230-232` |
| Showing a sidebar doesn't resize the window. The video area shrinks instead. Inferred from the absence of any window-frame call in the controller, by grep. | `SidebarController.swift` |
| The plugin sidebar defaults to the leading (left) side, and the user can switch it. Default width is 360 pt, and the user can resize it. That plugins use this key is inferred from its name. | `Preference.swift:180`, `:1147`, `:1076-1077` |
| Edge-to-Edge off also unlocks the window's aspect ratio. | `Preference.swift:1007-1009` |
| A plugin can't read or set IINA's own preferences. `preferences.get/set` use the plugin's own store. | `JavascriptAPIPreferences.swift:19-32` |
| `standaloneWindow` (`open`, `close`, `loadFile`, `setProperty`, `setFrame`, messages) exists in both the global and the player entry. `core`, `overlay` and `sidebar` exist only in the player entry. | `JavascriptPluginInstance.swift:155`, `:163-168`; `JavascriptAPIStandaloneWindow.swift:14-24` |
| `core.window.frame` is settable. Streams already sets it. | `JavascriptAPICore.swift:274-286`; `src/player.js` |
| The plugin API has no call that adds controller (OSC) buttons. Checked: Core, Overlay, Input, Sidebar, StandaloneWindow, Menu, Event, Utils. Not checked: Mpv, Playlist, Subtitle, File, Http, WebSocket, Console. No `iina.*` event reports controller visibility: the binary's event names cover file, window, fullscreen, PiP, music mode, menu and thumbnails. | those files at `v1.5.1`; `strings` on the binary |
| `video-margin-ratio-right` and its siblings appear in the installed IINA binary's strings, meaning IINA knows the mpv option names. This doesn't show that setting them from a plugin moves the picture under IINA's renderer. | `strings /Applications/IINA.app/Contents/MacOS/IINA` |

## Unverified API assumptions

1. **A:** Edge-to-Edge off puts the plugin sidebar beside the video and keeps it open on video clicks, natively, windowed and fullscreen. Fullscreen is the less certain case.
2. **A:** the IINA tab that holds the Edge-to-Edge toggle can be named in a tooltip. I didn't check which tab shows `SidebarLayoutPane`.
3. **B:** `mpv.set('video-margin-ratio-right', x)` from a plugin moves the picture at runtime under IINA 1.5.1.
4. **B:** IINA's controller and title bar stack predictably against the plugin overlay. B needs the controller above the strip, or the strip clear of it.
5. **B:** the overlay receives the pointer events needed to drag, resize and scroll (#18), and enough mouse movement to show and hide the cluster without a controller-visibility event.
6. **B:** the cluster can sit "beside the controller". The controller's position is a user preference (floating and draggable, bottom, or top). The binary has `oscPosition` and `osc.floating` strings, but the plugin can't read the preference.
7. **B:** the overlay webview can take keyboard focus and is in the accessibility tree.
8. **Both:** a standalone window may load the Following list and VOD data through `iina.http`, and in B load remote thumbnails, under IINA's plugin URL policy and `Info.json` `allowedDomains`.
9. **Both:** the `user:read:follows` scope can be added through a re-run of device-code sign-in (#30). The scope itself is unchecked.
10. **Both:** ⌃⌘L, ⌃⌘C and ⌃⌘B are free in practice.
11. **A:** Streams can tell whether Edge-to-Edge is off by some indirect signal, such as mpv `osd-width` against `core.window.frame` while the sidebar shows. If not, the layout button's dot and popover are the only guidance.

## Decision ledger (streams-interaction-design)

| User task | Observed failure | Alternatives | Proposed | Native proof needed | Remaining uncertainty |
|---|---|---|---|---|---|
| Read chat without covering the video (#47, J7) | The sidebar is drawn over the video (user's screenshot, 2026-11-22) | A: IINA's Edge-to-Edge off. B: overlay strip plus mpv margins. Separate window (not drawn). | A | The picture stays fully visible beside the sidebar; clicking the video leaves the sidebar open | Fullscreen; letterboxing |
| Sign in (#20) | The device-code action went unnoticed | Filled primary button under a large code | Both | A fresh identity signs in with no outside help | None new |
| Get to the live edge (#51) | The counter shows time since joining | Badge becomes behind-live time and acts as a button | Both | The badge value matches the live edge within about 2 s | The A4 spike sets the method |
| Quick actions near the controller (#52) | They live in the plugin menu | A: badge plus menu shortcuts. B: on-video cluster | A | Shortcuts work while the video is focused | User-defined key bindings |
| Find a followed channel (#30, J2) | Must type a name or URL | A: quick-open list. B: thumbnail grid | A | Live list loads after granting the scope; Return opens it | The scope grant flow |
| Watch an offline channel's VOD (#32, J4) | Fails with an error | Recent broadcasts in place | Both | Picking a VOD plays it with chat | None new |

## Not done

- I didn't open or control IINA. The lead owns that slot.
- I didn't build or test product code, and didn't measure contrast in a tool. Text colours use macOS system label opacities.
- `docs/DECISIONS.md`, `docs/ROADMAP.md` and the issue tracker aren't updated. Other writers are active, and the choice isn't made. Once the user picks, D-0xx and #20, #47 and #52 need a line each.
- **Gesture record.** Both directions add one gesture: hovering a replay message shows a sync glyph, and the context menu has the same action. Recovery is the offset stepper or First message. Neither direction captures player input outside the column, card or strip. The overlay's click-through outside the card is #18's to prove.
- I read `ui/sidebar.html` and `ui/sidebar.css` in full. I read only the render, keyboard and replay-control parts of `ui/sidebar.js`, and searched the commission handoff rather than reading all of it.
