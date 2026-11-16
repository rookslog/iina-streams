# TNF principles applied to IINA Streams

**Design review and proposed direction — November 7, 2026.**

**Status:** research and design brief. No change to the active IINA plugin, no design approval inferred. The working playback/quality branch remains available at `c962f92`; this brief is on `design/tnf-quiet-streams`.

## Primary sources and their authority

1. TNF's `DESIGN-PRINCIPLES.md` v3, dated October 25 and amended November 1, 2026, in `~/Development/personal-work-ecosystem/local/2026-10-15-codex-campaign/TNF-LEAD-sol/pstack-trial/.audit/opus-design-work/`. Read in full. The rules marked **[operator]** are direct design decisions; the source explicitly allows revising a rule when applying it produces a bad result.
2. TNF's `PRODUCT.md`, `~/development/tap-n-filter/PRODUCT.md`: native Apple feel with a distinct identity; no gratuitous eyebrow labels, repetition or explanations. This describes intended quality, not proof that the repository's current UI exemplifies it.
3. TNF's actual design history: `iterations/77-names` and `iterations/82-looks/NOTES.md`, plus the design-lane records `tnf-text-and-principles-whole.md`, `tnf-surface-design-departures.md` and `tnf-faithful-is-not-finished.md`. Their relevant lesson is to distinguish *design decisions*, prototypes tried by hand, and source code that merely shipped.
4. Apollo's `~/.agents/skills/impeccable/reference/macos.md`, `~/.agents/skills/apple-design-skill/references/getting-started/designing-for-macos.md`, and `~/.claude/skills/design-craft/SKILL.md`. These are process/reference guides, not a substitute for the user's taste or IINA constraints.
5. Apple's current [Materials](https://developer.apple.com/design/human-interface-guidelines/materials) guidance: Liquid Glass is the floating functional/navigation layer; ordinary content uses standard materials. Use it sparingly.
6. IINA's [1.5 release notes](https://iina.io/blog/150-release/): sidebars resize, can coexist, and can dock with title bar/OSC. The [1.5.0 release note](https://www.iina.io/release-note/1.5.0.html) explicitly says the standard window buttons remain visible when the leading sidebar is shown. This is a native-host constraint; local HTML cannot turn it off.

## The job of the screen

**Activity:** keep a livestream playing, occasionally adjust its quality, then return attention to work or the video. When quality changes, keep the *same player window and focus*, show only the temporary transition, then settle. Chat is later and entirely optional.

**Things that matter to identify:** channel, present quality, how to change quality, a failed connection, how to dismiss/reopen controls.

**Things the video already tells us:** whether a picture is playing. IINA's native sidebar already names the selected plugin. The native player title already names `hutchmf — Twitch`.

The current panel spends most of its area announcing these facts again. The heavy eyebrow, title, permanent status, section heading, full-width menu, descriptive sentence, separator, Hide button and Chat-off notice read like a report about a media player. In the user's actual fullscreen screenshot, the glass panel takes roughly half the window, the controls are stretched across it, and IINA's native titlebar crowds the top.

## TNF principles and the cases they create in Streams

| TNF rule | Streams implication | Qualification / interaction |
|---|---|---|
| §1 — immediate feedback | Show selected/transitioning quality directly in the selector; no window tear-down | A Twitch HLS switch will buffer; indicate *the buffering* without inventing seamless playback |
| §2 — signifiers, not instructions | Channel name and chosen format are names/values; remove explanatory sentences | §3 requires a visible replacement signifier, never a mysteriously blank screen |
| §3 — state in the thing | Put spinner/progress next to the format being changed; disable selection while pending | §18 says genuine interruption and failure states must be clear |
| §4 — explanations on request | Tooltip/focus help may explain a rare quality-change interruption | A permanent sentence under every selector is unjustified |
| §7 — overview first | Video remains dominant. Streaming controls are contextual and closeable | A primary quality control must be discoverable; don't hide functionality merely to fit |
| §8 — one model | Same quality value, menu item and behavior in windowed/fullscreen | Native menu route and sidebar must not disagree |
| §9 — Mac conventions | Menu and keyboard paths, precise focus, reduced motion/transparency support | WebView does not inherit every AppKit behavior automatically; test on IINA itself |
| §10 — glass sparingly | Reuse IINA's **native** sidebar glass; local HTML stays transparent/legible | Do not stack a synthetic blur/backdrop-filter over the host glass or video |
| §11 — honest marks | Only show actual available qualities, not invented signal-strength meters | An indicator without a measured data source is decoration |
| §12 — elegance is fit | Remove padding and repeated dividers where they make the sole control look stranded | Restraint must not become an empty-looking settings panel |
| §13 — no decided feature lost | Keep Refresh and Hide reachable by mouse, menu and keyboard | Do not silently remove these to clean the screenshot |
| §15 — things stay where they are | Selector doesn't move or change identity during a quality switch | The new mpv loadfile replace path already helps preserve the player and sidebar |
| §17 — no ignored action | Format selection either takes effect or displays a precise failure state | Delayed success must not be claimed on dispatch; wait for actual file-loaded |
| §18 — interruptions are designed | Brief buffering indication and actionable offline/failure message | Ordinary success needn't be announced forever |
| §19 — same parts across built-ins | Twitch and future YouTube controls should share a reusable provider/quality structure | TNF's *user-buildable audio blocks* are domain-specific; use the consistency lesson, not literal blocks |

TNF's design history cautions against using §2 in isolation. Round 71 removed narration without replacing it with discoverable signifiers. Our review must do both halves: remove text and make the control's role and outcome clear.

## Visible-copy audit of current IINA Streams

| Current text | Role and provisional disposition |
|---|---|
| `TWITCH STREAM` | Repeated provider/eyebrow. **Remove**. The provider may instead appear as a small distinguishable icon; label retained for accessibility |
| `hutchmf` | Stream identity. **Keep**, single clear text anchor |
| `Playing` | Persistent narration. **Remove in healthy playback**. Represent actual transition or fault only when meaningful |
| `Playback quality` | Function name. **Compress** to `Quality` if a visible label aids comprehension, otherwise attach it to the selector as an accessible name and hover/focus help |
| `Auto · prefer 720p` | Value and policy. **Keep the meaning** but shorten to `Auto (720p)` if tests confirm people understand it; do not imply an absolute cap |
| `Changing quality briefly reconnects playback.` | Permanent explanatory caption. **Remove**; expose concise help on focus/hover if needed, and show buffering when a selection actually changes |
| `Hide controls` | Valid action but duplicates host navigation. **Retain the ability**, consider a discreet close icon and confirm IINA's own sidebar back/close route works reliably |
| `Chat is off` | Inert placeholder for unfinished functionality. **Remove until real chat exists**; later a compact toggle can make the off state implicit |
| Permanent divider rules | Grouping marks with little substance to group. **Remove or reduce** |
| `Could not retrieve current qualities. You can retry.` | A meaningful exceptional state. **Shorten** to `Qualities unavailable` with a distinct Retry affordance and accessible detail |
| `Switching quality`, `Reconnecting` | Real transient state. Keep as compact short-lived feedback attached to selected quality, not a separate status paragraph |

This ledger records *proposed changes*. It does not authorize a builder to silently delete previously decided functionality. Check the live UI and user's preferences before implementation.

## Proposed first direction: Quiet Streams

The native IINA sidebar shell remains. We use two compact pieces:

**Identity:** one row, a small provider glyph or accent followed by `hutchmf`. No eyebrow or second title. A small live mark may be present only if it conveys a meaningful distinction from a recording.

**Quality:** a compact selector, currently `Auto (720p)` or an actual format such as `360p30`, with a subtle disclosure arrow. Refresh is a small icon beside it or in the menu. It is discoverable via focus/tooltip and the Plugin menu. Switching temporarily occupies the same selector area with an understated progress indicator. Failure appears there with one short action.

**The rest:** video belongs to IINA. No permanent Chat off, Playing or instructional caption. No hero card, heavy gradient, fictitious spectrum, new dashboard or second fake titlebar. Native material supplies the glass. Style it with system fonts and sizes, moderate inset, accessible contrast, restrained color tied to meaning and a narrow line length. Use the currently available sidebar width; avoid stretching one selector to half the screen.

Initial resting UI, expressed as content rather than finished art:

```text
[provider glyph]  hutchmf

[ Quality / Auto (720p) ▾ ]   [ Refresh glyph ]

(no other permanent narration)
```

This is a content contract, **not** a visual mock or a substitute for real native layout. The rendered version should use one coherent typographic hierarchy, platform-level inset and strong focus states.

## An alternative worth comparing, not silently choosing

**Quality in the native Plugin menu; sidebar reserved for optional chat.** This could further reduce visual obstruction while background watching. It has one downside: quality is less visible to someone who doesn't know the menu, and the previous M2 requirement explicitly included a contextual sidebar. Present it as a design option during review rather than hiding the panel by default without notice.

## Geometry and glass

IINA 1.5's leading sidebar can keep the standard window controls visible. The user's screenshot of the titlebar obstructing the top must be tested in actual fullscreen, with left and right sidebar positions, docked and undocked layouts, narrow and wide widths. A CSS `padding-top` patch specific to one screenshot risks making the other layouts wrong.

Let the host own titlebar and material effects. The WKWebView should avoid forcing an additional blur or custom faux-liquid layer. For glass over bright/gameplay footage, verify legibility with moving video, Reduce Transparency and Increase Contrast; consider a restrained content scrim only when observed contrast requires it.

## Prototype and acceptance protocol

1. Preserve current `c962f92` playback implementation and build a separate UI-only concept first. Record any deviations from the user-shown screenshots.
2. Create at least two comparable *interaction* states, not just a static shot: healthy playing and quality-switch in progress, plus an offline/error state. Compare light/dark and left/right/native fullscreen.
3. Count each visible UI string and justify it as a **name**, **value**, **short action**, **necessary transient state**, or documented **error/exception**. A fifth class, “explanation always on,” fails by default.
4. Test actual focus and keyboard navigation, cursor hover, disclosure, quality change, Refresh and dismiss/reopen. Every command needs a menu route. Preserve readable assistive labels even when visible text is minimized.
5. Measure WebKit/UI memory and input responsiveness against the incumbent, especially with the panel hidden; no new timer or chat network activity at rest.
6. Capture real app renderings at 280, 360 and 500-point sidebar widths as available; compare geometry in fullscreen and windowed. A source diff and a test result cannot substitute for seeing and using the interface.
7. Ask for a taste/acceptance decision before replacing the existing working UI. The user has asked to improve it, but has not picked an exact visual direction.

## Design gate

**Recommendation:** build a Quiet Streams UI prototype on a feature branch, keeping the operational player and versioned candidate intact. Judge the actual visual composition and behavior, then merge after user acceptance. Pro can challenge this direction if a deeper native integration better serves the stream-first experience; record the evidence behind that departure.

**Evidence status:** TNF principles and code on Apollo inspected; Apple current Materials and IINA 1.5 documentation consulted; source and screenshot-based audit done. No new sidebar has been rendered or user-tested in this design-only pass.
