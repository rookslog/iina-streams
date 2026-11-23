# User journeys and release plan toward a public launch — 2026-11-22

**Status:** APPROVED by the user 2026-11-22 (D-026). It replaces the release slicing in [ROADMAP-RATIONALE-2026-11-22.md](ROADMAP-RATIONALE-2026-11-22.md) from 0.5.6 onward. **Timeline (user):** 0.6.0 and the Reddit launch tonight; 0.8.0 within a few days to a week.

**Trigger.** The user plans to advertise Streams on Reddit once a solid release exists, and asked for a plan built on full start-to-end journeys for different users. The bar for the advertised release is a stranger's first ten minutes.

Facts are labelled. "Observed" means checked on this Mac on 2026-11-22. Everything else is a proposal or unchecked.

## Journeys

| # | Who | Start → end | Friction today | What removes it | Issue |
|---|---|---|---|---|---|
| J1 | **Stranger from Reddit** | Finds the repo → installs → first stream with chat | No GitHub Release yet. Must `brew install streamlink yt-dlp`, and the helpers look only in `/opt/homebrew/bin` (`helpers/media.py:18-19`), so Intel Homebrew at `/usr/local` is missed. Python is required too. No LICENSE. The README has no visuals. | #14. Use IINA's bundled yt-dlp (observed: `IINA.app/Contents/MacOS/youtube-dl`, 2026.08.19). Check both Homebrew locations. One actionable missing-dependency state. Spike: drop Streamlink and/or Python. Launch kit. | #14, #36, #37, #38 |
| J2 | **Daily viewer: who's live?** | Opens IINA → watching a followed channel | Safari → twitch.tv → copy URL → ⌃⌘O → paste. Typing a bare name already works (observed: `xqc` parses as Twitch live), but nothing says so. | A Following list in Open Stream: live now, one click. Needs Twitch's `user:read:follows` scope (unchecked), so users re-approve once. | #30 |
| J3 | **Browser-first viewer** | Already on a Twitch page → watching in IINA | Copy and paste. | Hand off from the browser: IINA ships a Safari extension (observed: `OpenInIINA.appex`). Unchecked whether Streams receives URLs opened that way. | #35 |
| J4 | **Catch-up viewer** | Missed a stream → watching the VOD with chat | Find the VOD URL in a browser. An offline channel just fails. | An offline channel offers recent VODs. The Following list shows recent broadcasts. Unchecked: resuming where you left off. | #32 |
| J5 | **Time-shifted live viewer** | Paused, rewound, or behind live → chat matches the video | Chat runs ahead of the video. | Chat follows the video (As sent / With the streamer / With the viewers) and click-to-calibrate. | #2, #28, #16, #31 |
| J6 | **Chat reader** | Watching → chat that looks like Twitch | Emotes show as words. No badges or mention highlights. | Official emotes and badges first, then 7TV/BTTV/FFZ. Highlight your own name. Clickable links. | #34, #29 |
| J7 | **Lean-back / fullscreen** | Fullscreen → readable chat that stays out of the way | Overlay drag and resize is fiddly. The panel covers the video. | Overlay resizing on any edge, plus a panel layout that doesn't cover the video. | #1, #18, #20 |
| J8 | **Participant** | Watching → sending a message | Read-only. | Optional sending, an emote picker, replies. | #3 |
| J9 | **Multi-platform, multi-account** | YouTube / Kick / several accounts → one place | Twitch only for live chat. One account. | Provider seams (#19 rule), an account switcher, then YouTube live chat and Kick. Feasibility is unchecked: YouTube API quota per Google project; Kick's official API and chat. | #19, #6, #39, #40 |
| J10 | **Keyboard / VoiceOver / reduced motion** | Any journey without a pointer | Partly covered. Never audited end to end. | Acceptance criteria inside the overhaul. | #20 |

## Proposed journeys, not yet approved (2026-11-22, ~21:00)

The operator asked: "are there any other user situations… user desires… we might want to support?" "Code" means checked by searching this repo on 2026-11-22; everything else is a proposal, or marked unchecked or inferred.

| # | Who | Situation | Today | What would serve it | Fit |
|---|---|---|---|---|---|
| J11 | **Background listener** | Stream playing while working in other apps (the operator's own habit) | "Audio only" is already in the quality list (code: `src/resolve.js`). Nothing else adapts to listening. | A listening mode: audio only, a small or hidden window, chat optional, remembered per channel. Less bandwidth and power. | 0.5.6–0.6.0 |
| J12 | **Long-VOD viewer** | Watches an 8-hour broadcast over several sittings | No saved position (code: no resume found). IINA's own resume probably misses, because each VOD address is signed and changes (unchecked). | Remember the position per VOD; a "continue watching" row on the People screen; mark as watched. | 0.6.0 |
| J13 | **Skimmer** | Wants the best parts of a long VOD | Nothing. | A chat-activity strip on the timeline showing where chat spiked. Chat replay already fetches the messages, so no new requests are needed (inferred). Category changes as chapters (source unchecked). | After 0.6.0 |
| J14 | **Viewer at stream end** | The live stream they're watching ends | Nothing; no raid handling (code). | Offer to follow the raid to the next channel, open the VOD of what just ended, or show who else is live. | 0.6.0 |
| J15 | **Late joiner** | Joins a stream two hours in | J5 rewinds only within the live buffer (inferred). | "Start from the beginning", using the in-progress VOD, then "jump to live". | After 0.6.0 |
| J16 | **Multi-view** | Several points of view on one event (role-play servers, tournaments) | Several IINA windows, each with its own audio (unchecked). | Audio follows the focused window; open a group of channels together. | 0.8.0 or later |
| J17 | **"Tell me when"** | Wants to know when a favourite goes live or is scheduled | Nothing. | While IINA is open: a notice when a favourite goes live; Twitch schedules on the People screen (Helix schedule endpoint, unchecked). Alerts while IINA is closed stay out of scope. | 0.6.0–0.8.0 |
| J18 | **Subscriber or Turbo user** | Expects their account's benefits | Streams plays anonymously (code: GQL playback without the viewer's login). Subscriber-only streams and VODs fail as RESTRICTED (code: `src/twitch-playback.js`). Inferred and unchecked: ads play even for subscribers, and channel points and Drops aren't earned, because those are tied to Twitch's own player. | Say so plainly in the README and in the error message. Investigate whether the viewer's own sign-in can unlock subscriber content, and at what terms risk. | README before launch; investigation in 0.6.0 |
| J19 | **Privacy-minded viewer** | Wants suggestions from history without feeling tracked | No history recorded yet (code). | When watch history ships: pause it, forget one channel, delete everything; all local. This ships with history, not after it. | With watch history |

## Release plan (proposed)

| Release | Theme | Contents | Advertise? |
|---|---|---|---|
| **0.5.4** | Trustworthy loop | Only #14 (the release) is left | No. For you and early testers |
| **0.5.5** | Chat on your timeline | #2, #28, #16, #31, #17, #23 (+ Focus removal), #24. Unchanged | No |
| **0.5.6** | Find what to watch | Following list #30, offline VOD picker #32, browser handoff #35, official emotes + badges #34 (split from #29) | Small post to collect early feedback (optional) |
| **0.6.0** | **Public launch** | UI overhaul designed on this journey map (#20, #1, #18). Works out of the box #36, with spike #37. Launch kit #38: README with GIF, privacy note, issue templates, license, support matrix | **Yes: Reddit** |
| **0.7.0** | Talk back | Sending #3, mentions, emote picker, third-party emotes #29 | Update post |
| **0.8.0** | More platforms and accounts | Account switcher (#6), YouTube live chat and Kick (#19), after spikes #39 and #40 | Update post |

**Why the overhaul comes after the browse features.** The overhaul should design every surface at once, including the Following and VOD lists. Launch screenshots then come from the final UI. The less-text rule from #9 applies throughout: use signifiers first, and give detail on demand.

**Why chat sending moves from 0.6.0 to 0.7.0.** Getting to a stream and chat that looks right matter to every viewer. Sending matters to participants. And sending is the larger auth step: write scopes and moderation edge cases.

## Spikes before commitments

- **Out of the box (0.6.0):**
  - Can IINA's bundled yt-dlp replace Streamlink for Twitch live with comparable latency and ad handling?
  - Can the Python helpers move to plugin JS, or bundle?
  - Decide by measurement, not preference.
- **YouTube live chat (0.8.0):** quota cost per viewer-hour on a shared Google project, against per-user keys.
- **Kick (0.8.0):** official API scope for chat read and follows; terms of use.

## Not in scope

Category browsing and search, notifications while IINA is closed, clips. Revisit after launch feedback.
