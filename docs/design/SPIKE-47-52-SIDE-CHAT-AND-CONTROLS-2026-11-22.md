# Spike #47 and #52: chat beside the video, and controls near IINA's controller

Date: 2026-11-22. Base: `87d0e74` on `beta`. No product code changed; IINA was not run.
Issues: #47 (chat beside the video), #52 (Go Live / chat toggle near the on-screen controller).

**Labels.** VERIFIED = I ran it, or read the exact code path (cited). INFERRED = follows from what I read,
but depends on behaviour I could not observe (AppKit, WebKit, IINA's bundled libmpv, IINA's GL renderer).
**Nothing here was observed in native IINA**; the lead's native test at the end is what upgrades the INFERRED items.

Sources, all pinned to tags:
- IINA `v1.5.1`, commit `1bd72e660c1870b717a15f29386704e5cfa6d56a` (shallow clone of tag `v1.5.1`).
  URLs are `https://github.com/iina/iina/blob/v1.5.1/iina/<file>#L<line>`.
- mpv `v0.41.0` source (the version of the Homebrew `mpv` used for the experiments).
  URLs are `https://github.com/mpv-player/mpv/blob/v0.41.0/<path>#L<line>`.

## Answers in brief

| # | Question | Answer | Label |
|---|----------|--------|-------|
| 1a | Can a plugin shrink the picture so a column beside it covers no video? | Yes in principle: `iina.mpv.set('video-margin-ratio-right', r)`. mpv shrinks and letterboxes the picture into the remaining area. | VERIFIED for mpv and for the `vo=libmpv` render path (software renderer). INFERRED for IINA's own libmpv build and OpenGL renderer. |
| 1b | Does anything in IINA override or ignore the margins? | Nothing found: IINA never sets or reads them; the option is on the plugin-settable allow-list. | VERIFIED by grep (scope below) |
| 1c | Can a plugin resize the window? | Yes: `iina.core.window.frame = {x,y,width,height}` (no permission gate). IINA re-fits the window on every video-size change, and locks the window aspect ratio to the video, so a widened window needs re-applying and may fight a user drag-resize. | Frame setter VERIFIED; aspect-lock and drag behaviour INFERRED |
| 1d | Does the plugin overlay span the margin area? | Yes: the overlay container is pinned to the whole window content view, above both OSC views and below the title bar and sidebars. | VERIFIED by reading; on-screen result not observed |
| 2 | Can a plugin add buttons to the OSC or observe its visibility? | No. No plugin API names the OSC, toolbar, or fade state. One built-in OSC button (`plugins`, on by default) toggles the plugin sidebar. | VERIFIED by enumerating every exported API |
| 3 | Fallbacks | Plugin menu items with key bindings; `iina.input.onKeyDown`; an overlay control strip. `input.conf` cannot call into a plugin. No mouse-move hook exists for plugins. | VERIFIED (API surface); mouse-follow via the overlay INFERRED |

## 1. Side chat

### 1.1 mpv honours the margins: experiments (VERIFIED, run 2026-11-22, Homebrew `mpv v0.41.0`)

mpv documents the option: margins are a ratio of the window size, "The video is 'boxed' by these margins. The window
size is not changed... the margins will cause the video to be downscaled", and it is disabled with `--keepaspect=no`
([options.rst L1730-L1743](https://github.com/mpv-player/mpv/blob/v0.41.0/DOCS/man/options.rst#L1730)).

**Experiment A: plain mpv window.** Script: `qa/spikes/spike-47-plain-mpv.sh` (helper `qa/spikes/spike-47-bbox.py`).
It generates a 640x360 test video (solid blue, red border), runs `mpv --no-config --vo=gpu --focus-on=never --pause
--geometry=1000x600+80+80 --video-margin-ratio-<side>=<r> ...`, takes `screenshot-to-file ... window`, and prints the
bounding box of the non-black pixels. Command: `sh qa/spikes/spike-47-plain-mpv.sh <outdir>`. Output, verbatim (paths shortened):

```
baseline.png: image 1000x600; picture x 0..1000 y 19..581 (w 1000, h 562); fractions left 0.000 right 1.000 top 0.032 bottom 0.968
margin-right-0.3.png: image 1000x600; picture x 0..700 y 103..496 (w 700, h 393); fractions left 0.000 right 0.700 top 0.172 bottom 0.827
margin-left-0.3.png: image 1000x600; picture x 300..1000 y 103..496 (w 700, h 393); fractions left 0.300 right 1.000 top 0.172 bottom 0.827
margin-right-0.3-bottom-0.1.png: image 1000x600; picture x 0..700 y 73..466 (w 700, h 393); fractions left 0.000 right 0.700 top 0.122 bottom 0.777
margin-right-0.3-keepaspect-no.png: image 1000x600; picture x 0..1000 y 0..600 (w 1000, h 600); fractions left 0.000 right 1.000 top 0.000 bottom 1.000
```

Reading: a 0.3 right margin gives a 700-px-wide picture flush left, vertically centred, and the right 300 px are black
(no picture). The picture is scaled, not cropped (700x393 is 16:9). Left and bottom margins behave the same way, and
`--keepaspect=no` disables them, as documented. Caveat: the window screenshot was 1000x600 pixels, so this machine's
window was not at 2x; fractions are the portable result.

**Experiment B: the render path IINA uses.** IINA does not use mpv's window. It sets `vo=libmpv` and `keepaspect=yes`
([MPVController.swift L659-L660](https://github.com/iina/iina/blob/v1.5.1/iina/MPVController.swift#L659))
and draws into its own OpenGL layer with `mpv_render_context_render`
([ViewLayer.swift L211](https://github.com/iina/iina/blob/v1.5.1/iina/ViewLayer.swift#L211)), after a `glClear`
([L186](https://github.com/iina/iina/blob/v1.5.1/iina/ViewLayer.swift#L186)). So experiment A alone does not show IINA's
path honours the margins. I reproduced the same `vo=libmpv` configuration with the render API's **software** renderer:
`qa/spikes/spike-47-libmpv-margin.c`, built and run by `sh qa/spikes/spike-47-libmpv.sh <outdir>`. It renders into a
1000x600 buffer, then changes the margin **at runtime** with `mpv_set_property_string` and renders again. Output, verbatim:

```
1-baseline.png: image 1000x600; picture x 0..1000 y 19..581 (w 1000, h 562); fractions left 0.000 right 1.000 top 0.032 bottom 0.968
2-right-0.3-set-at-runtime.png: image 1000x600; picture x 0..700 y 103..496 (w 700, h 393); fractions left 0.000 right 0.700 top 0.172 bottom 0.827
3-right-0.3-bottom-0.1.png: image 1000x600; picture x 0..700 y 73..466 (w 700, h 393); fractions left 0.000 right 0.700 top 0.122 bottom 0.777
4-reset-to-zero.png: image 1000x600; picture x 0..1000 y 19..581 (w 1000, h 562); fractions left 0.000 right 1.000 top 0.032 bottom 0.968
```

Reading: the margins apply on the `vo=libmpv` path, apply when changed while playing (no reload), and reset cleanly.
The source explains why: `vo_libmpv.c` computes the destination rectangle with the same `mp_get_src_dst_rects`
([vo_libmpv.c L362](https://github.com/mpv-player/mpv/blob/v0.41.0/video/out/vo_libmpv.c#L362)) that applies the margins
when `keepaspect` is on ([aspect.c L145-L147](https://github.com/mpv-player/mpv/blob/v0.41.0/video/out/aspect.c#L145),
[calc_margin L116](https://github.com/mpv-player/mpv/blob/v0.41.0/video/out/aspect.c#L116)), then hands it to the
renderer, including the GL one ([libmpv_gpu.c L148-L154](https://github.com/mpv-player/mpv/blob/v0.41.0/video/out/gpu/libmpv_gpu.c#L148)).
A runtime option change reaches it through `update_opts` -> `VOCTRL_SET_PANSCAN` -> `need_resize`
([vo.c L237-L247](https://github.com/mpv-player/mpv/blob/v0.41.0/video/out/vo.c#L237),
[vo_libmpv.c L616](https://github.com/mpv-player/mpv/blob/v0.41.0/video/out/vo_libmpv.c#L616)).

What this does **not** cover (INFERRED): that IINA 1.5.1's *bundled* libmpv matches v0.41.0 (only the client API
version is comparable: `MPV_CLIENT_API_VERSION 2.5` in both
[IINA's deps/include/mpv/client.h L251](https://github.com/iina/iina/blob/v1.5.1/deps/include/mpv/client.h#L251) and
Homebrew's header), and that the OpenGL renderer draws into the rectangle the software one does (the shared code above
says it should).

### 1.2 Does IINA override or ignore them? (VERIFIED by grep; scope: all files under `iina/` at tag `v1.5.1`)

`grep -rn -i "video-margin\|videoMargin\|margin-ratio\|margin_ratio" iina/` returns only:
[AppData.swift L245](https://github.com/iina/iina/blob/v1.5.1/iina/AppData.swift#L245) (the four options are in
`safeMPVOptions`) and four constants in `MPVOption.swift`. IINA never sets, resets or reads them. Consequences:

- **A plugin may set them.** `mpv.set` is allowed for names in `safeMPVOptions` even without the file-system permission
  ([JavascriptAPIMpv.swift L49-L53](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPIMpv.swift#L49),
  [AppData.swift L231](https://github.com/iina/iina/blob/v1.5.1/iina/AppData.swift#L231)); Streams already declares
  `file-system` anyway.
- **IINA's layout does not know about them.** The video view fills the video container; the margin is applied inside
  mpv's render. So IINA's click targets, OSC, aspect lock and `window-scale` all still treat the picture as full-size.
  Clicks in the black margin land on the video view (pause toggle etc.) unless an overlay element with `data-clickable`
  is on top. (INFERRED from the layout code; not observed.)
- **IINA's own interactive-crop mode** insets the video view with `updateVideoViewConstraints`
  ([MainWindowController.swift L863](https://github.com/iina/iina/blob/v1.5.1/iina/MainWindowController.swift#L863),
  used only from [InteractiveMode.swift L99](https://github.com/iina/iina/blob/v1.5.1/iina/InteractiveMode.swift#L99) and L137);
  not reachable from a plugin.
- **Persistence.** The margin is an mpv option on the player; nothing in IINA resets it, so the plugin must reset it
  to 0 when chat closes, on `iina.window-will-close`, and on unload. (INFERRED: mpv options persist across `loadfile`;
  the native test checks it.)

### 1.3 How the existing sidebar and overlay relate to the video (VERIFIED by reading)

- **Native plugin sidebar** (`sidebar.show()` -> `sidebars.show(sidebar: .plugins, ...)`,
  [JavascriptAPISidebarView.swift L45-L52](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPISidebarView.swift#L45)).
  Sidebars are subviews of the window content view
  ([SidebarController.swift L129](https://github.com/iina/iina/blob/v1.5.1/iina/SidebarController.swift#L129)), width a
  user preference clamped to 300..500
  ([SideBar.swift L80](https://github.com/iina/iina/blob/v1.5.1/iina/SideBar.swift#L80)) and to 80% of the window
  ([SidebarController.swift L251](https://github.com/iina/iina/blob/v1.5.1/iina/SidebarController.swift#L251)); the user
  can drag it wider and the width is saved ([L226](https://github.com/iina/iina/blob/v1.5.1/iina/SidebarController.swift#L226)).
  **Whether it covers the video depends on the user's IINA preference `edgeToEdgeVideo`**: default `true`
  ([Preference.swift L1142](https://github.com/iina/iina/blob/v1.5.1/iina/Preference.swift#L1142)), where the video
  container spans the whole window and the sidebar overlays it; when `false`, the video container's leading/trailing
  edges are pinned to the sidebars' inner edges
  ([MainWindowController.swift L869-L889](https://github.com/iina/iina/blob/v1.5.1/iina/MainWindowController.swift#L869)),
  so the picture is already beside the sidebar (letterboxed in the narrower area, window not widened), and the window
  aspect lock is released ([Preference.swift L1007-L1009](https://github.com/iina/iina/blob/v1.5.1/iina/Preference.swift#L1007)).
  `defaults read com.colliderli.iina edgeToEdgeVideo` on this machine reports the key absent, so the default (`true`)
  applies for that domain (INFERRED that this is the domain the lead's IINA uses).
  When a sidebar is shown, IINA narrows the title bar and the docked bottom OSC by the sidebar width
  ([SidebarController.swift L273-L276](https://github.com/iina/iina/blob/v1.5.1/iina/SidebarController.swift#L273)),
  so the native sidebar does not cover the docked OSC.
- **A plugin cannot read the sidebar's side, width, or `edgeToEdgeVideo`.** `iina.preferences` reads only the plugin's
  own preferences ([JavascriptAPIPreferences.swift L19-L29](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPIPreferences.swift#L19)).
  The sidebar page could measure its own `innerWidth` and post it to the plugin (INFERRED to work). There is no
  sidebar-resized event; a user drag would need that page-side measurement to be live.
- **Plugin overlay** (`overlay.*`, needs `video-overlay`, which Streams has). The overlay web view is created lazily and
  attached to `pluginOverlayViewContainer`
  ([PluginOverlayView.swift L51](https://github.com/iina/iina/blob/v1.5.1/iina/PluginOverlayView.swift#L51)), a view pinned
  `H:|[v]| V:|[v]|` to the window's whole content view
  ([MainWindowController.swift L413-L416](https://github.com/iina/iina/blob/v1.5.1/iina/MainWindowController.swift#L413)),
  so it **spans the full window including any margin area**. Z-order from the subview order: inserted just below
  `bufferIndicatorView`
  ([L417](https://github.com/iina/iina/blob/v1.5.1/iina/MainWindowController.swift#L417)), which is added after
  `oscBottomView` and `oscFloatingView` ([L496-L504](https://github.com/iina/iina/blob/v1.5.1/iina/MainWindowController.swift#L496)),
  and before `titleBarView` and the sidebars ([L506-L507](https://github.com/iina/iina/blob/v1.5.1/iina/MainWindowController.swift#L506)).
  So the overlay draws **above both OSC views, below the title bar and sidebars**. It passes clicks through everywhere
  except elements with `data-clickable` once `setClickable(true)`
  ([PluginOverlayView.swift L21-L45](https://github.com/iina/iina/blob/v1.5.1/iina/PluginOverlayView.swift#L21),
  [hit-test script L145-L149](https://github.com/iina/iina/blob/v1.5.1/iina/PluginOverlayView.swift#L145)). Corollary: an
  opaque overlay column covers whatever part of the OSC lies under it.
  Default OSC is floating ([Preference.swift L1073](https://github.com/iina/iina/blob/v1.5.1/iina/Preference.swift#L1073)),
  so at a 70/30 split it likely sits clear of a 30% column (INFERRED; the native test records the overlap).

### 1.4 Resizing the window (frame APIs)

- **Get/set the frame:** `iina.core.window.frame` get returns the AppKit window frame, set calls `setFrame(..., display: true)`
  ([JavascriptAPICore.swift L242-L243, L278-L286](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPICore.swift#L278)).
  No `permitted(...)` gate: the Core window API has none (VERIFIED by reading `WindowAPI`, L232-L316). Coordinates are
  screen points, origin bottom-left. Streams already uses the setter
  ([src/player.js:759](../../src/player.js)), after a quality reload.
- **Related:** `core.window.fullscreen` get/set (L244, L287), `core.window.sidebar` set shows an IINA sidebar tab by name
  (L252, L300), `core.window.screens`; events `iina.window-resized` / `iina.window-moved` carry the frame
  ([EventController.swift L33-L34](https://github.com/iina/iina/blob/v1.5.1/iina/EventController.swift#L33)),
  `iina.window-size-adjusted` fires after IINA re-fits the window
  ([MainWindowController.swift L2609](https://github.com/iina/iina/blob/v1.5.1/iina/MainWindowController.swift#L2609)).
- **IINA re-fits the window on every video-size change**, including a `loadfile replace` such as a quality switch:
  `handleVideoSizeChange` recomputes the frame from the video size
  ([MainWindowController.swift L2467-L2609](https://github.com/iina/iina/blob/v1.5.1/iina/MainWindowController.swift#L2467)).
  A widened window is therefore reset whenever the video size changes (the same reason `src/player.js` restores the frame
  after a quality switch, L758-L759, L775). Re-apply on `iina.window-size-adjusted`.
- **Aspect lock:** `setWindowAspectRatio` sets `window.aspectRatio` to the video aspect unless the user unlocked it
  ([MainWindowController.swift L2347-L2355, L2479](https://github.com/iina/iina/blob/v1.5.1/iina/MainWindowController.swift#L2347)).
  `NSWindow.setFrame` is not bound by `aspectRatio`, but a **user drag-resize is** (AppKit behaviour: INFERRED), so a
  widened 16:9+chat window would snap back toward 16:9 on the next drag. This is step 5 of the native test.
- **Fullscreen:** no widening is possible or needed; margins alone work (the video area is the screen).

### 1.5 Option (b): a standalone chat window beside the player (VERIFIED API; behaviour INFERRED)

`iina.standaloneWindow` exists: `open/close/isOpen/loadFile/postMessage/onMessage/setProperty/setFrame`
([JavascriptAPIStandaloneWindow.swift L13-L25](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPIStandaloneWindow.swift#L13)),
no permission gate (0 `permitted(` calls in the file), one per plugin instance
([JavascriptPluginInstance.swift L30](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptPluginInstance.swift#L30)).
It is a plain titled, resizable `NSWindow`
([PluginStandaloneWindow.swift L22-L25](https://github.com/iina/iina/blob/v1.5.1/iina/PluginStandaloneWindow.swift#L22));
`setProperty` supports `title`, `resizable`, `fullSizeContentView`, `hideTitleBar`
([L102-L142](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPIStandaloneWindow.swift#L102)); `setFrame(w,h,x,y)`
takes screen points ([L144](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPIStandaloneWindow.swift#L144)).
No always-on-top, no child-window attachment, so "docking" is: follow `iina.window-moved` / `window-resized`
frames and call `setFrame` to sit at the player's right edge. It covers no video at all and needs no margins, but:
it is a separate window (separate focus, Mission Control/Spaces behaviour), a lag between player move and follow is
likely, and in macOS fullscreen it cannot sit beside the player (the player owns its own Space; INFERRED). Keep it as the
windowed-mode alternative if the native test shows the margin route is poor.

## 2. Controller buttons: every relevant plugin API in 1.5.1

Enumeration (VERIFIED): `grep -n "^@objc protocol" JavascriptAPI*.swift JavascriptPlugin*.swift` lists 22 exported
protocols: Console, Core, Event, Input, Http, Xmlrpc, GlobalController, GlobalChild, File, FileHandle, Playlist, Overlay,
StandaloneWindow, Mpv, Menu, Preferences, Subtitle, SidebarView, WebSocketController, Utils, PluginMenuItem,
PluginSubtitleItem (plus the private Core sub-APIs window/status/audio/subtitle/video). I read the bodies of Core,
Event, Input, Menu, Mpv, Overlay, Preferences, SidebarView, StandaloneWindow and the Utils protocol; I did not read the
bodies of Playlist, Subtitle, File, Http, WebSocket, Console or Global (their names and purposes are unrelated to the OSC). `grep -n -i "osc\|toolbar\|controlbar\|fadeable"`
over `JavascriptAPI*.swift JavascriptPlugin*.swift PluginManager.swift Plugin*.swift` finds one hit, an unrelated comment
in `PluginViewController.swift`. Conclusion: **no API adds an OSC button or reports OSC visibility.**

What exists, and what it is worth:

| API | Cite | Use for #52 |
|-----|------|-------------|
| Built-in OSC `plugins` toolbar button | [Preference.swift L864-L873](https://github.com/iina/iina/blob/v1.5.1/iina/Preference.swift#L864), default on at [L1072](https://github.com/iina/iina/blob/v1.5.1/iina/Preference.swift#L1072); action `sidebars.show(sidebar: .plugins)` at [MainWindowController.swift L2997-L2998](https://github.com/iina/iina/blob/v1.5.1/iina/MainWindowController.swift#L2997) | Toggles the plugin sidebar (our Streams tab) from the OSC with no plugin code. It is a fixed enum: a plugin cannot add a button or change its icon. The user can remove it in IINA's settings. |
| `iina.core.setUIVisibility(bool)` | [JavascriptAPICore.swift L104-L106](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPICore.swift#L104) | Sets `player.disableUI = visible` (inverted by name). It only stops the OSC appearing ([MainWindowController.swift L2119](https://github.com/iina/iina/blob/v1.5.1/iina/MainWindowController.swift#L2119)); it cannot read state. Do not use. |
| `iina.core.window.sidebar = name` | [L300-L304](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPICore.swift#L300) | Opens an IINA sidebar tab by name. Not an OSC control. |
| Events | [EventController.swift L31-L53](https://github.com/iina/iina/blob/v1.5.1/iina/EventController.swift#L31) | window moved/resized/fullscreen/pip/file events; **nothing for OSC show/hide**. `mpv.*` events are emitted with no payload ([MPVController.swift L1246](https://github.com/iina/iina/blob/v1.5.1/iina/MPVController.swift#L1246)). |
| `iina.input.*` | [JavascriptAPIInput.swift L13-L21](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPIInput.swift#L13) | `onKeyDown/onKeyUp/onMouseDown/onMouseUp/onMouseDrag`, `getAllKeyBindings`, `normalizeKeyCode`. **No mouse-move**. |
| `iina.menu.*` | [JavascriptAPIMenu.swift L13-L20](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPIMenu.swift#L13) | Plugin menu items; see fallback 3a. |
| `iina.overlay.*` / `iina.sidebar.*` / `iina.standaloneWindow.*` | see section 1 | Own web surfaces. |

The OSC itself reveals on `mouseMoved` of IINA's content-view tracking area
([MainWindowController.swift L1297-L1300, L1400](https://github.com/iina/iina/blob/v1.5.1/iina/MainWindowController.swift#L1297))
and hides on a timer (`hideUI`, [L2082](https://github.com/iina/iina/blob/v1.5.1/iina/MainWindowController.swift#L2082));
none of that is exposed.

## 3. Fallbacks

**3a. Plugin menu items with key bindings** (VERIFIED). `menu.item(title, action, {keyBinding:'Meta+Shift+g'})`
([JavascriptAPIMenu.swift L23-L35](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPIMenu.swift#L23)); key syntax
`Meta/Ctrl/Alt/Shift+<single char>` ([KeyCodeHelper.macOSKeyEquivalent](https://github.com/iina/iina/blob/v1.5.1/iina/KeyCodeHelper.swift#L449)),
so named keys such as `F5` are not accepted (`guard key.count == 1`, L467). A binding that equals an existing IINA key
binding is **not applied** and the menu shows "Conflicting key shortcuts…"
([MenuController.swift L732](https://github.com/iina/iina/blob/v1.5.1/iina/MenuController.swift#L732)). The menu is rebuilt
at app launch and whenever a player window becomes main
([AppDelegate.swift L439](https://github.com/iina/iina/blob/v1.5.1/iina/AppDelegate.swift#L439),
[PlayerWindowController.swift L586](https://github.com/iina/iina/blob/v1.5.1/iina/PlayerWindowController.swift#L586)), so a
shortcut works without opening the menu first (INFERRED from those call sites). **Cap:** only the first five first-level
items of global + player items show; the rest go under "More…"
([MenuController.swift L646, L660-L667](https://github.com/iina/iina/blob/v1.5.1/iina/MenuController.swift#L646)). Streams
already has 1 global item (`global.js:232`, `Open Stream…` with `Ctrl+Meta+o`) plus 5 player items
(`src/player.js:1069-1073`), global first, so "Chat over Video" is already the sixth and sits under "More…". Any new
Go Live / Toggle Chat item must replace one or be grouped as a submenu (`addSubMenuItem`).

**3b. `iina.input.onKeyDown(key, cb, priority)`** (VERIFIED). Runs from `PlayerWindowController.keyDown`; a callback at
`iina.input.PRIORITY_HIGH` runs before IINA's own binding and can stop it by returning true
([PlayerWindowController.swift L371-L384](https://github.com/iina/iina/blob/v1.5.1/iina/PlayerWindowController.swift#L371),
[PluginInputManager.swift L87-L114](https://github.com/iina/iina/blob/v1.5.1/iina/PluginInputManager.swift#L87)). Works only when
the player window has key focus. This is the way to bind a bare key with no menu entry and no conflict warning.

**3c. `mpv` key bindings via `input.conf`** (VERIFIED negative for plugin calls). IINA routes `input.conf` bindings to
mpv commands or IINA commands (`handleKeyBinding`, [PlayerWindowController.swift L290](https://github.com/iina/iina/blob/v1.5.1/iina/PlayerWindowController.swift#L290)).
A `script-message` would arrive as the payload-less `mpv.client-message` event, so a plugin could not tell which
message it was ([MPVController.swift L1246](https://github.com/iina/iina/blob/v1.5.1/iina/MPVController.swift#L1246)); the
mpv `user-data` route is untested and not worth the complexity. Not recommended: it also depends on a per-user `input.conf` edit
the plugin does not control. `iina.input.getAllKeyBindings()` lets the plugin read
the active bindings to avoid conflicts.

**3d. Overlay control strip that follows the pointer** (INFERRED). The plugin cannot be told that the mouse moved (no
mouse-move API). The overlay web view returns no hit unless `setClickable(true)` and the element has `data-clickable`
([PluginOverlayView.swift L21-L45](https://github.com/iina/iina/blob/v1.5.1/iina/PluginOverlayView.swift#L21)), so
whether DOM `mousemove`/`:hover` fire over a clickable element while the OSC is visible, and whether they fire at all
over non-clickable areas, cannot be settled from source. Test 6 below checks it. The safe design without it: a small
always-visible (or hover-over-the-chip) control cluster in a fixed corner of the overlay, not tied to the OSC, so it
cannot collide with the floating OSC (which the user can move; `controlBarPositionHorizontal/Vertical`,
[Preference.swift L1067](https://github.com/iina/iina/blob/v1.5.1/iina/Preference.swift#L1067)).

## 4. Recommendation

### #47 Chat beside the video

**Primary route: mpv margins plus a plugin-owned chat column (overlay), with an optional window-widen step.**

1. On entering "chat beside video", compute `r = columnWidthPt / windowWidthPt` and `iina.mpv.set('video-margin-ratio-right', r)`
   (or `-left`). The picture shrinks and letterboxes inside the rest; the column is drawn by the overlay into the margin.
   This works in windowed and fullscreen and needs no new permission.
2. Own the column in the overlay rather than the native sidebar. The plugin cannot read the sidebar's width, side, or the
   `edgeToEdgeVideo` preference (section 1.3), and with `edgeToEdgeVideo=false` IINA already narrows the video, so a margin
   on top would double-count. The overlay column's width is the plugin's own number. Cost: the overlay sits above the OSC
   (section 1.3), so an opaque column covers any OSC under it, and the user loses the native sidebar's width drag handle.
   The existing `overlay` presentation code (`ui/overlay.*`, `src/player.js:298-335`) is the base; it currently draws a
   floating panel, so this is a new "docked column" layout, not a rewrite of the transport.
3. **Optional, second step:** widen the window by `1/(1 - r)` through `core.window.frame` (windowed only, not fullscreen,
   clamped to the screen) so the picture keeps its size and the chat is extra window area. Re-apply on
   `iina.window-size-adjusted` (IINA re-fits on every video-size change) and give up gracefully if the user drag-resizes
   (the aspect lock). Ship step 1 first; step 3 only if the test shows the frame survives.
4. Always reset the margin to 0 when the column closes, the player window closes, or the plugin unloads.
5. Keep option (b), the standalone window, as the fallback for users who want zero overlap in windowed mode; it needs
   no margins, but it cannot dock in fullscreen.

What would flip this: the native test shows margins are ignored by IINA's GL path (then use (b) for windowed mode and
accept covering in fullscreen); or the column covers the OSC badly (then leave a bottom gutter, or use the native
sidebar plus a measured margin); or widening fights the aspect lock (then ship step 1 only).

### #52 Controls on or near IINA's controller

**No native OSC button is possible; do not promise one.** Deliver, in this order:
1. **Free and native:** the built-in OSC puzzle-piece button (on by default) toggles the Streams sidebar. Document it as the
   "chat toggle" for the sidebar presentation; no code.
2. **Menu items with key bindings** for Go Live and Show/Hide Chat, merged under one submenu so they stay inside the
   five-item cap, with `Meta+...` bindings checked against `getAllKeyBindings()`; plus `iina.input.onKeyDown` for any
   bare-key shortcut.
3. **In-overlay control cluster** (Go Live, chat toggle, maybe quality) fixed in a corner of the overlay, independent of
   OSC visibility. Treat "follows the OSC / fades with it" as unavailable until test 6 shows hover events reach the overlay.

What would flip this: a hover event reaching the overlay (then fade the cluster in/out on pointer activity); IINA adding
an OSC plugin API in a later release (re-check on upgrade).

## 5. Native test for the lead (IINA 1.5.1; one slot, one operator)

Goal: confirm the margin route works on IINA's own GL path, with the real plugin API, with no product change.
Entry point: the plugin menu's **Developer Tool** submenu runs arbitrary JS in a plugin instance
([MenuController.swift L639](https://github.com/iina/iina/blob/v1.5.1/iina/MenuController.swift#L639);
the console evaluates in the instance's JS context,
[JavascriptDevTool.swift L396-L408](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptDevTool.swift#L396), where
`iina` is a global, [JavascriptPluginInstance.swift L185](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptPluginInstance.swift#L185)).
macOS 12+ (the menu item is availability-gated). Use a development plugin identity, not the stable one.

Setup: open a local 16:9 file in a normal windowed player (not fullscreen). Plugin menu -> Developer Tool -> pick the
`Streams` entry that is **not** "(Global)" (only that instance has `iina.mpv` and `iina.core`;
[JavascriptPluginInstance.swift L164](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptPluginInstance.swift#L164)).
Record IINA's setting for extending video to the window edges (`edgeToEdgeVideo`), and the OSC position.

1. `iina.core.window.frame` -> write down `{x,y,width,height}`. Take a screenshot (baseline).
2. `iina.mpv.set('video-margin-ratio-right', 0.3)`. **Expect:** the picture moves to the left 70% of the window width,
   letterboxed, with the right 30% black; no reload. `iina.mpv.getNumber('video-margin-ratio-right')` -> `0.3`.
   Screenshot and measure the right edge of the picture (expect about 0.70 of the window width).
   **Fail** if the picture does not shrink: then IINA's path ignores the option and the route is dead for IINA 1.5.1.
3. Margin area is usable. Run: `iina.overlay.simpleMode(); iina.overlay.setContent('<div style="position:fixed;right:0;top:0;bottom:0;width:30%;background:#234;color:#fff">column</div>'); iina.overlay.show()`.
   **Expect:** a dark column exactly over the black band, nothing over the picture. (This replaces the plugin's overlay
   page in that instance; reload the plugin afterwards. Skip this step if the dev identity has the Streams overlay live.)
   Also note whether the column covers the floating OSC when you move the mouse to wake it.
4. Hover test for #52: in the same instance, before step 3's `show()`, add to the content a `data-clickable` element and a
   script that sets its text on `mousemove`/`mouseenter`; call `iina.overlay.setClickable(true)`. Move the mouse over it
   while the OSC is visible and while it is hidden. Record whether text changes. Repeat with the pointer over a
   non-clickable part of the overlay. This decides 3d.
5. Widen: `var f=iina.core.window.frame; iina.core.window.frame={x:f.x,y:f.y,width:Math.round(f.width/0.7),height:f.height}`.
   **Expect:** the picture returns to its original size, the extra width is the black band. Then drag-resize the window by
   an edge and record whether it snaps toward 16:9 (the aspect lock). Re-read `iina.core.window.frame`.
6. Reload test: change quality in Streams (a `loadfile replace`) or run `iina.mpv.command('loadfile',[<same local file>,'replace'])`.
   Record: does the margin option persist; does IINA reset the window width (`iina.window-size-adjusted`)?
7. Fullscreen (Ctrl+Cmd+F): the picture should occupy the left 70% of the screen. Exit fullscreen; record the frame.
8. Native sidebar: click the OSC puzzle-piece button on the right. Record whether the sidebar covers the black band or the
   picture, and where the picture sits. With `edgeToEdgeVideo` flipped (IINA settings), repeat once and record whether the
   picture shrinks by itself (expected when it is off). Close the sidebar.
9. PiP: reset first (step 10), then enter PiP with margin 0.3 set and record whether PiP shows the shrunken picture.
10. Reset: `iina.mpv.set('video-margin-ratio-right', 0)`. **Expect:** full picture. Close the window; reopen the file and
    confirm the margin did not leak into the next file (`getNumber` -> 0).

Record, per step: pass/fail, a screenshot path, and the measured picture x-extent as a fraction of the window width.

## 6. Unverified (not checked here)

- Anything in native IINA: the lead owns it. All "INFERRED" items above.
- IINA 1.5.1's bundled libmpv version and its OpenGL renderer drawing into the margin rectangle. Only the shared
  destination-rectangle code and the software renderer were exercised.
- AppKit: whether a user drag-resize snaps a programmatically widened window back to the video aspect; whether tracking
  areas and DOM mouse events reach a non-clickable overlay.
- Overlap of the column with the floating/bottom OSC, and clicks landing in the margin.
- PiP, music mode, and the Touch Bar/mini-player layouts with a margin set.
- The `user-data` route for `input.conf` messages (not tried).

## Files from this spike

- `qa/spikes/spike-47-plain-mpv.sh`, `qa/spikes/spike-47-libmpv.sh`, `qa/spikes/spike-47-libmpv-margin.c`,
  `qa/spikes/spike-47-bbox.py`. Outputs (PNGs, test video) were written to a scratch directory and are not committed.
