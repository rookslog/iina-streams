# Design brief: the plugin sidebar as a mini dashboard (2026-11-23)

**Decided by:** WAITING W-16, answered 2026-11-23. Chat lives only in the column that pushes the video over, or in the glass box over the video. The plugin sidebar becomes the place for things you check briefly and close. **Where the build lands:** WAITING W-15, still open. Designing now fits D-035, which puts every screen's design in the 0.6.0 round.

## The operator's idea, in their words (2026-11-23)
- "It would be like a mini version of the dashboard, just like what Twitch has… I could also maybe look through VODs… or switch to a VOD. There could also be some kind of search bar too… It could be even scrollable."
- "I'm in this situation where I want to switch to another channel. I click the plugin menu button, see all the different options, click it, switch, and then collapse the thing back again."
- "I might occasionally want to change the resolution, but I don't need the option… on the screen at all times."
- "We can think about what else that sidebar might serve… and how we might want to set it up."

**Reference:** Twitch's own sidebar: followed channels (live first, then "show more"), live channels, and categories.

## The surface (constraints, read from IINA 1.5.1's source)
- **Panel:** IINA's plugin tab sits in the same panel and tab strip as IINA's Video, Audio and Subtitles tabs (the operator's screenshots, 2026-11-23). Mock in that card style: rounded grouped cards on a translucent dark material, and the system font.
- **Side:** the right edge by default. IINA's preference `sidebarSettingsDisplayAtLeading` (default `false`, `Preference.swift`) moves it to the left. The design must not depend on the side.
- **Width:** 360 pt by default (`trailingSidebarWidth`), and the viewer can resize it from 300 to 500 pt (`SideBar.swift`, `widthRange`). Mock at 360 and check that 300 still works.
- **Over or beside the video:** over the video normally. With IINA's **Edge-to-Edge Video** turned off, IINA puts the panel beside the video and stops hiding it when the video is clicked ([overhaul README](../../overhaul-2026-11-22/README.md)). Both must work.
- **Collapse:** IINA draws the panel's chevron, so Streams needs no close button of its own (already removed in the overhaul).
- **The chat column** (D-028) also sits on the right, made by shrinking the picture (`video-margin-ratio-right`). Say what happens when both are open.

## Earlier decisions and feedback on this panel
- **D-028** (2026-11-22) already moved chat into the overlay, with the picture shrunk, and left the native sidebar for the controls and settings. The overhaul's **direction B, "Stage"** ([direction-b-stage.html](../../overhaul-2026-11-22/direction-b-stage.html)) drew that sidebar as a settings form. Start from it rather than from today's panel.
- **#20** (operator feedback, 2026-11-22): the sign-in step's **Copy code & open Twitch** button went unnoticed ("I wasn't expecting that as an option, as a button"), though the operator likes what it does. Wherever sign-in lands, it must read as a button.

## What's in the sidebar today (`ui/sidebar.html`), and where it goes

| Today | Proposed |
|---|---|
| Title, source, live pill | Stays (what's playing) |
| "+" Open another stream field | Becomes the mini dashboard's search |
| Quality menu and refresh | Stays: change quality here |
| Chat panel: toggle, hide, chat settings gear | **Open question:** chat leaves this panel, so where do chat on/off and chat settings live? |
| Sign in with Twitch, Client ID setup | **Open question:** needs a home. Candidates: the bottom of this panel, the plugin's settings, the menu. |
| Import archive, fetch or resume replay | **Open question:** goes with chat's settings? |

## Tasks to design for
1. Move to another channel: live ones first, ranked by the shared ranking (spec §3), with viewers shown.
2. Look through someone's VODs and move to one (live or offline person).
3. Search: type a name, the same matching as Quick Open.
4. Change quality.
5. Scroll a long list.

**Candidates for "what else" — the operator strikes what they don't want:**
- continue watching (half-watched VODs);
- categories you watch, and live channels in them;
- this channel's other VODs;
- chat on/off and its settings;
- account (signed in as…, sign out);
- the history controls (pause, forget this channel).

## Reuse
The **person row** from the Quick Open brief (`../open-stream/BRIEF.md`, with the operator's feedback in `../open-stream/README.md`) is reused as is: no reason text, and VODs reachable for live people too. This round designs what differs: the panel's sections, search, VOD browsing, quality, and where chat's controls go. It doesn't design a third kind of list.

## Process
1. Run `/impeccable doctor` first; the last designer session ended with a setup warning.
2. **Structure before polish:** Impeccable `shape` gives two or three **low-fidelity structures**: sections, order, what's shown first, what's behind a tap. Plain HTML at 360 pt wide, in `structure-a/`, `structure-b/` (and `structure-c/`), using the sample data in `../open-stream/sample-data.js`. No network and no styling effort. Add a short `README.md` comparing them, then write `DONE.md` listing the files and what `doctor` reported.
3. The operator looks at them in Safari, then one is chosen, then polish.

## What counts as working (later, in IINA)
- Open the plugin sidebar, find a channel or VOD in at most two actions, move to it, close the panel.
- The video keeps playing until the new stream starts.
- Keyboard and VoiceOver reach everything.
