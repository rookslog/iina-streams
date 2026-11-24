# Design brief: the plugin sidebar as a mini dashboard (2026-11-23)

**Decided by:** WAITING W-16, answered 2026-11-23. Chat lives only in the column that pushes the video over, or in the glass box over the video. The plugin sidebar becomes the place for things you check briefly and close. **Where the build lands:** WAITING W-15, still open. Designing now fits D-035, which puts every screen's design in the 0.6.0 round.

## The operator's idea, in their words (2026-11-23)
- "It would be like a mini version of the dashboard, just like what Twitch has… I could also maybe look through VODs… or switch to a VOD. There could also be some kind of search bar too… It could be even scrollable."
- "I'm in this situation where I want to switch to another channel. I click the plugin menu button, see all the different options, click it, switch, and then collapse the thing back again."
- "I might occasionally want to change the resolution, but I don't need the option… on the screen at all times."
- "We can think about what else that sidebar might serve… and how we might want to set it up."

**Reference:** Twitch's own sidebar: followed channels (live first, then "show more"), live channels, and categories.

## The surface (constraints, read from IINA 1.5.1's source)
- **Panel:** IINA's own **plugin panel** (one puzzle-piece tab per plugin), which is separate from the Video, Audio and Subtitles panel. *Correction 2026-11-23: this brief first put it in that panel, inferred from the operator's screenshots, which were of the other panel.* The style reference is today's `ui/sidebar.css`.
- **Side:** the **left** edge by default (`sidebarPluginsDisplayAtLeading: true`, IINA 1.5.1 `Preference.swift`), and the operator's IINA keeps the default. A preference moves it right. The design must not depend on the side.
- **Width:** 360 pt by default (`leadingSidebarWidth`; the operator's is 359), resizable from 300 to 500 pt (`SideBar.swift`, `widthRange`). Mock at 360 and check that 300 still works.
- **Over or beside the video:** over the video normally. With IINA's **Edge-to-Edge Video** turned off, IINA puts the panel beside the video and stops hiding it when the video is clicked ([overhaul README](../../overhaul-2026-11-22/README.md)). Both must work.
- **Collapse:** IINA draws the panel's chevron, so Streams needs no close button of its own (already removed in the overhaul).
- **The chat column** (D-028) sits on the right, made by shrinking the picture (`video-margin-ratio-right`). At IINA's defaults it doesn't overlap this panel.
- **Text:** follow "Text on screen" in `.agents/skills/streams-interaction-design/SKILL.md`. Every visible string must be a name, value, action or error.

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

## Round 2 (2026-11-23, after the operator saw A, B and C)
**The operator's words:** "if I clicked on it, it would switch and load up… information about their channel… Mainly the VODs"; "when I'm searching, I'm either searching for a channel or, within a channel, I'm searching for a VOD. And I maybe want to filter or sort them"; "I do like the continue watching thing"; "your proposal feels like it has too much text".

**Deliver one revised structure** in `revised/index.html` (not three), plus `DONE.md`. Fix the IINA strip in `lowfi.css` and the pages: draw the plugin panel's own tabs, not Video/Audio/Subtitles.
1. **The list:** start from A: what's playing, search, then Live and Offline.
2. **Continue watching:** above Live, a few VODs you started and haven't finished, newest-watched first, **with no age cutoff**, so one from a week ago still shows if it's among the latest. Each shows a progress bar (a signifier, not text). A finished VOD drops out.
3. **The channel view:** clicking or pressing Return on a person, live or offline, replaces the list with that channel, with a Back control.
   - Their live stream at the top if they're live.
   - Their VODs as rows with a small 16:9 thumbnail, length and date. Every VOD you've started shows its progress bar, however long ago, so older ones are found here.
   - The search field now searches this channel's VODs. Sort and filter are compact controls: newest or most viewed; broadcasts, highlights or uploads.
   - Optional, if it fits without text: a dot on VODs newer than your last visit.
4. **Chat settings, account, history:** at the end, as in A, but with no explanatory text.
5. **Quality:** behind the playing line, as in A.
6. **In `DONE.md`,** list every visible string with its class (name, value, action or error). Cut anything that fits none of them.

**Data notes, for honesty in the mock:**
- **Thumbnails:** Twitch's documented videos call returns a `thumbnail_url`, and Streams doesn't fetch it yet. The sidebar page already allows images from Twitch's image host, `static-cdn.jtvnw.net`, for emotes (`ui/sidebar.html`). That host is unchecked against a real VOD response.
- **Search within a channel's VODs:** filters the fetched list locally. Twitch documents no title search for videos (unchecked; re-check before the build).
- **Sort and filter:** documented `sort` (time, trending, views) and `type` (archive, highlight, upload) parameters, from Twitch's reference; re-check before the build.
- **Continue watching and progress** need each VOD and its position stored: that's resume (#78), not watch history (#73).
