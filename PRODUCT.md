# Product

<!-- impeccable:product-schema 1 -->

Written 2026-11-22 by the Open Stream designer from `README.md`, `AGENTS.md`, `docs/DECISIONS.md` and `docs/design/FINDING-AND-WATCHING-SPEC-2026-11-22.md`, with no interview: the operator asked that only uninferable questions be put to them, and none arose. Unconfirmed by the operator until they read it.

## Platform

web

## Users
*Draft 2026-11-23, from the operator's own words in chat that day. Awaiting their confirmation through Impeccable's setup interview. It replaces the first version, which was inferred from docs and listed only J1–J10.*

- **Who:** Mac viewers who would rather watch Twitch in IINA than in a browser tab (YouTube too, other platforms later). The first and main user is the operator, who watches daily. *Open: why IINA rather than the browser, and who else (the Reddit launch audience).*
- **How they watch** (the operator, 2026-11-23):
  - **One stream at a time.** To change, they switch rather than open another window: "Usually I find myself not wanting to open up multiple streams… I just want to switch to this person."
  - **They usually know who they want:** "I'm thinking of this person and I know they're not online, but I want their VODs. Or even if they are online, you may still want to watch their VODs."
  - **They catch up on VODs,** often over several sittings, and come back to half-finished ones, sometimes a week later (J12).
  - **Often in the background,** while working in other apps (J11, the operator's own habit).
  - **Chat** sits beside the video (pushing it over), floats over it, or is off. It never sits in a panel that covers the picture.
  - **The plugin panel is opened briefly**, to switch channel, pick a VOD or change quality, and then closed: "things I want to quickly check and focus on."
- **What they don't want:**
  - text that explains: reason text, status sentences, labels that repeat an icon;
  - sponsored ordering;
  - feeling tracked: they can pause or forget history (J19).
- **Journeys:**
  - approved in D-026: J1–J10 (`docs/design/USER-JOURNEYS-2026-11-22.md`), mainly J1 a stranger, J2 the daily viewer, J4 the catch-up viewer, and J10 keyboard and VoiceOver;
  - approved in D-035: J11 the background listener, J12 the long-VOD viewer, J14 the viewer at stream end, and J19 the privacy-minded viewer.

## Product Purpose
IINA Streams is an IINA plugin. It opens Twitch live channels, Twitch VODs and YouTube videos or livestreams in native IINA windows, and shows their chat:
- Twitch live chat, after a read-only Twitch sign-in (`chat:read`);
- Twitch VOD chat replay, with no sign-in;
- YouTube replay chat, where a video has it.

Success means a usable native IINA streaming and chat experience, judged in IINA rather than in a browser or a plan (AGENTS.md).

## Positioning
- **A native player, not a browser tab.** The stream plays in IINA, with chat drawn by the plugin.
- **The viewer's own ranking.** Who appears first is decided by Streams from local watch history, pins and hides. Twitch data is an extra input when signed in, never a replacement. There is no sponsored or paid ordering (the spec's "Decided" list, `docs/design/FINDING-AND-WATCHING-SPEC-2026-11-22.md` §1 and §3).
- **Local by default.** It runs on the Mac, with no servers of its own and no telemetry. Saved preferences and history stay on the Mac (README, Privacy).

## Operating Context
- **Host.** A macOS IINA plugin (tested only on IINA 1.5.1) whose interface is web pages inside native IINA windows:
  - the Streams sidebar in IINA's sidebar;
  - an overlay on the video;
  - standalone windows, such as Open Stream (⌃⌘O).
- **Look.** Apple's macOS guidelines and IINA's own look win over web defaults. Use the system font, native-feeling controls, light and dark appearance, and increased contrast.
- **Typical session (INFERRED from J2 and J4).** The viewer presses ⌃⌘O, types a few letters of a name or pastes a URL, presses Return, and watches. An offline channel offers its recent broadcasts instead.
- **Tools beside it.** Streamlink and yt-dlp (installed with Homebrew), python3, Twitch's documented API (Helix), and twitch.tv's internal interface (GQL), the latter used anonymously only (D-034).

## Surfaces in IINA (where each piece of Streams appears)
Checked 2026-11-23 against IINA 1.5.1's source and the operator's own IINA settings (`defaults read com.colliderli.iina`). Re-check after an IINA update.
- **The plugin panel** (IINA's plugin sidebar: one puzzle-piece tab per plugin, opened from the plugin button) slides in over the **left** of the video. `sidebarPluginsDisplayAtLeading` defaults to `true`, and the operator keeps the default. It is 360 pt wide by default (`leadingSidebarWidth`; the operator's is 359), resizable from 300 to 500 pt. With IINA's Edge-to-Edge Video turned off, it sits beside the video instead of over it. **Planned use** (WAITING W-16): the mini dashboard, VODs and quality. Chat leaves it.
- **IINA's own panels are separate.** Video, Audio and Subtitles (plus layout) form a panel on the **right** (`sidebarSettingsDisplayAtLeading: false`). Playlist and chapters form a panel on the left (`sidebarPlaylistDisplayAtLeading: true`). Whether the playlist and plugin panels can be open together is unchecked.
- **The overlay** is a transparent page over the video. It holds the floating glass chat box (a CSS backdrop blur, `ui/overlay.css`) and the side chat column ("beside"), which shrinks the picture from the **right** (`video-margin-ratio-right`).
- **Open Stream** is a standalone window, 380 px wide, sized from `global.js` with `setFrame`. IINA has no frame getter.
- **The Streams menu** is IINA's plugin menu for Streams.

**When the operator describes their own IINA, that's an observation.** Find the setting that explains it, and never "correct" it from a screenshot or a source default.

## Capabilities and Constraints
- **Twitch data sources (D-034).** Helix, the documented API with the viewer's token, comes first. GQL, twitch.tv's internal interface, is allowed where Helix can't deliver, including for new features. It is called anonymously with twitch.tv's public web client ID, never with the viewer's token or cookies.
- **Release plan (D-035).**
  - 0.5.6: watch history and its controls, and typing suggestions in Open Stream;
  - 0.6.0: the People screen and listening mode;
  - 0.7.0: VOD resume and stream end;
  - 0.8.0: other platforms, creator records and merged chat.

  All screens are designed together with the 0.6.0 overhaul (#20).
- **Chat is read-only.** Sending is not built. Emotes and badges are not shown yet.
- **Plugin web pages run under a strict Content Security Policy** (`default-src 'none'` in `ui/open.html`). Remote images such as avatars need a CSP and `Info.json` change. INFERRED from the CSP; not tried.
- **Window size.** IINA's standalone window is set by global code (`global.js`, `setFrame`). Open Stream is a fixed 380 px wide and grows by one row height per row.
- **Undecided:**
  - J11–J19 (proposed journeys) are not approved;
  - where watch history persists, and which process owns it;
  - whether today's `chat:read` token works for Helix Search Channels.

## Brand Commitments
- **Name:** IINA Streams (the product); "Streams" in the UI.
- **Platform marks:** Twitch and YouTube are named and marked as sources. Whether a Streams logo asset exists is Unchecked.

## Evidence on Hand
- **Existing UI:** `ui/` (sidebar, overlay, Open Stream window).
- **Design work:** `docs/design/` holds the overhaul directions (`docs/design/overhaul-2026-11-22/`), the journeys, the finding-and-watching spec and the per-screen briefs.
- **Decisions:** `docs/DECISIONS.md`.
- **Security (AGENTS.md):** never expose tokens, Keychain values, device codes or signed URLs in logs.
- **Missing, so never fabricate it:**
  - real usage data or viewer counts;
  - testimonials;
  - a supported-version matrix beyond IINA 1.5.1 on Apple silicon.

  Every channel name in a mock is a placeholder or a public streamer used as sample data only.

## Product Principles
1. **State through signifiers, not reworded text.** A live dot, a spinner, an icon or a disabled state carries state. Text is for names, values, actions and real errors. Detail is on demand, in a tooltip or a VoiceOver label (operator feedback, memory `minimize-ui-text`).
2. **Signing in supplements, never degrades.** Signed in shows at least what signed out shows, and in the same order for people both already know (spec §3).
3. **The viewer's attention isn't for sale.** Viewer counts are shown, never used as a sort key, and there is no sponsored placement.
4. **Native first.** Prefer IINA's own behaviour and macOS conventions. Never force an app-wide IINA setting to get a layout.
5. **Proof is native.** A feature works when it is observed working in IINA. Mocks and browser tests are exploration, not proof (AGENTS.md evidence hierarchy).

## Accessibility & Inclusion
- **J10:** every journey works by keyboard and VoiceOver, and respects reduced motion and increased contrast.
- VoiceOver announces each list row's name, live state and position.
