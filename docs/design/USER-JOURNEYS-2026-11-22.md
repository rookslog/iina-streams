# User journeys and release plan toward a public launch — 2026-11-22

**Status:** PROPOSED and awaiting user approval (D-026). If approved, it replaces the release slicing in [ROADMAP-RATIONALE-2026-11-22.md](ROADMAP-RATIONALE-2026-11-22.md) from 0.5.6 onward.

**Trigger.** The user plans to advertise Streams on Reddit once a solid release exists, and asked for a plan built on full start-to-end journeys for different users. The bar for the advertised release is a stranger's first ten minutes.

Facts are labelled. "Observed" means checked on this Mac on 2026-11-22. Everything else is a proposal or unchecked.

## Journeys

| # | Who | Start → end | Friction today | What removes it | Issue |
|---|---|---|---|---|---|
| J1 | **Stranger from Reddit** | Finds the repo → installs → first stream with chat | No GitHub Release yet. Must `brew install streamlink yt-dlp`, and the helpers look only in `/opt/homebrew/bin` (`helpers/media.py:18-19`), so Intel Homebrew at `/usr/local` is missed. Python is required too. No LICENSE. The README has no visuals. | #14. Use IINA's bundled yt-dlp (observed: `IINA.app/Contents/MacOS/youtube-dl`, 2026.08.19). Check both Homebrew locations. One actionable missing-dependency state. Spike: drop Streamlink and/or Python. Launch kit. | #14, NEW |
| J2 | **Daily viewer: who's live?** | Opens IINA → watching a followed channel | Safari → twitch.tv → copy URL → ⌃⌘O → paste. Typing a bare name already works (observed: `xqc` parses as Twitch live), but nothing says so. | A Following list in Open Stream: live now, one click. Needs Twitch's `user:read:follows` scope (unchecked), so users re-approve once. | #30 |
| J3 | **Browser-first viewer** | Already on a Twitch page → watching in IINA | Copy and paste. | Hand off from the browser: IINA ships a Safari extension (observed: `OpenInIINA.appex`). Unchecked whether Streams receives URLs opened that way. | NEW (backlog "URL interception") |
| J4 | **Catch-up viewer** | Missed a stream → watching the VOD with chat | Find the VOD URL in a browser. An offline channel just fails. | An offline channel offers recent VODs. The Following list shows recent broadcasts. Unchecked: resuming where you left off. | #32 |
| J5 | **Time-shifted live viewer** | Paused, rewound, or behind live → chat matches the video | Chat runs ahead of the video. | Chat follows the video (As sent / With the streamer / With the viewers) and click-to-calibrate. | #2, #28, #16, #31 |
| J6 | **Chat reader** | Watching → chat that looks like Twitch | Emotes show as words. No badges or mention highlights. | Official emotes and badges first, then 7TV/BTTV/FFZ. Highlight your own name. Clickable links. | #29 (split) |
| J7 | **Lean-back / fullscreen** | Fullscreen → readable chat that stays out of the way | Overlay drag and resize is fiddly. The panel covers the video. | Overlay resizing on any edge, plus a panel layout that doesn't cover the video. | #1, #18, #20 |
| J8 | **Participant** | Watching → sending a message | Read-only. | Optional sending, an emote picker, replies. | #3 |
| J9 | **Multi-platform, multi-account** | YouTube / Kick / several accounts → one place | Twitch only for live chat. One account. | Provider seams (#19 rule), an account switcher, then YouTube live chat and Kick. Feasibility is unchecked: YouTube API quota per Google project; Kick's official API and chat. | #19, #6, NEW spikes |
| J10 | **Keyboard / VoiceOver / reduced motion** | Any journey without a pointer | Partly covered. Never audited end to end. | Acceptance criteria inside the overhaul. | #20 |

## Release plan (proposed)

| Release | Theme | Contents | Advertise? |
|---|---|---|---|
| **0.5.4** | Trustworthy loop | Only #14 (the release) is left | No. For you and early testers |
| **0.5.5** | Chat on your timeline | #2, #28, #16, #31, #17, #23 (+ Focus removal), #24. Unchanged | No |
| **0.5.6** | Find what to watch | Following list #30, offline VOD picker #32, browser handoff (NEW), official emotes + badges (NEW, split from #29) | Small post to collect early feedback (optional) |
| **0.6.0** | **Public launch** | UI overhaul designed on this journey map (#20, #1, #18). Works out of the box (NEW + spike). Launch kit (NEW): README with GIF, privacy note, issue templates, license, support matrix | **Yes: Reddit** |
| **0.7.0** | Talk back | Sending #3, mentions, emote picker, third-party emotes (#29) | Update post |
| **0.8.0** | More platforms and accounts | Account switcher (#6), YouTube live chat and Kick (#19), after feasibility spikes | Update post |

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
