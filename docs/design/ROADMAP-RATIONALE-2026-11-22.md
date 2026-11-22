# Roadmap rationale (2026-11-22)

> **Superseded from 0.5.6 onward** by [USER-JOURNEYS-2026-11-22.md](USER-JOURNEYS-2026-11-22.md) (D-026, 2026-11-22). The sections on 0.5.4 and 0.5.5 still apply.

> Detail behind the issues and milestones. The live plan is the one-screen index in [../ROADMAP.md](../ROADMAP.md) and the GitHub milestones. This file records why each slice exists and its evidence; it is not updated as work moves.

**Status: PROPOSED 2026-11-22, awaiting the user's approval (D-024).** It replaces the 2026-11-15 roadmap, which is in git history. Shipped work is recorded in [CHANGELOG.md](../../CHANGELOG.md), and how a build reaches IINA is in [RELEASE.md](../RELEASE.md). Each release lists its gate by evidence level: **native** = observed in installed IINA, **real-source** = real Twitch/YouTube data through the real code, **unit** = mocks/synthetic. A unit pass never closes a native gate.

Sources: three read-only audit lanes on `ded1d0e` (code/test health, chat/auth pipeline, docs staleness; 2026-11-22), the user briefing in `.ovis/`, and IINA v1.5.1 source.

## Baseline — 0.5.3 (tagged, never published as a GitHub Release)

Same-window quality switching, a draggable and corner-resizable chat overlay, read-only Twitch live chat, YouTube replay, and imported Twitch replay. CI failed on the `v0.5.3` tag, so the release job never ran.

## 0.5.4 — a loop you can trust

*Theme: anything testable is tested before a build reaches you. Ship the first real GitHub Release.*

| Item | Evidence today | Work left |
| --- | --- | --- |
| On-demand Twitch VOD chat windows (`ded1d0e`): fixes VOD `2930971003` being rejected as an invalid archive | real-source acquisitions reported by the prior session (historical); unit | Native: play 2930971003 at 0 s, 290 s, 20 000 s and 32 000 s, then seek back and forth |
| Linked Streams Dev workflow + CI on every branch (`chore/dev-workflow-20261122`, D-022/D-023) | unit; clean-clone CI simulation | Native: link → relaunch → deploy → relaunch, once. Reload All Plugins **crashed IINA** on first native use (D-022 update), so relaunch is the reload path. (First GitHub CI run passed: run 44989552465 on `5d80e36`.) |
| **Open Stream shortcut (#4).** `⇧⌘S` is the Subtitles-panel binding in IINA's own default key config (`#@iina Shift+Meta+s sub-panel`, `iina-default-input.conf` v1.5.1). The plugin passes the non-normalized `Meta+Shift+S`, so IINA's conflict check (a lookup by normalized key in `MenuController.add(menuItemDef:)`) misses it, and the duplicate loses to the Subtitles menu | source reading; matches your report | Use a binding free in every bundled config and the main menu, passed in IINA's normalized form. `⌃⌘O` is the lead candidate (free by a rough parser). Add a contract test that normalizes keys IINA's way against vendored v1.5.1 configs. Native: item visible and key works in a Streams window and in an ordinary window |
| **Live timestamps are render time.** `safeMessage` in `src/player.js` reads `time`, but live records carry `timestampMs` | source | One-line fix plus a unit test. Prerequisite for 0.5.5 |
| **Onboarding and UI copy** (user report 2026-11-22). Connecting Twitch asks for a "Twitch Public Client ID" with no route to get one. The panel carries explanatory text the user doesn't need ("Saved locally for future sessions with read-only chat scope.", "Approve read-only access in Twitch.", "Chat is displayed over the video.", the always-on drag/resize sentence) | source inventory of `ui/sidebar.html` and `ui/sidebar.js` | Connect becomes one action: no Client ID → **Open Twitch Developer Console** button plus three short steps and a paste field that validates as you type, then straight into the device code. Better still, ship one project-registered public Client ID so nobody pastes anything (needs a decision). Copy pass under TNF §2–§4: classify every visible string as name, value, action, transient state or error, and remove any "explanation always on" string, giving its function a signifier or on-demand help instead. Native: a fresh identity goes from nothing to live chat with no outside instructions |
| Repo hygiene | audit | Delete `plugin-dev/` and the 12 tests that only exercise it (keep their "loadFile clears listeners" mock rule); delete the 9 never-running skipped tests and `build-candidates.py`; `manage-candidates.py` still backs the non-skipped tests in `test_install.py`, so retire it together with those tests or keep both; rename `tests_candidate/` → `tests/`; rewrite README; archive the candidate-era docs; trim AGENTS.md and fix skill paths that still say `candidate-plugin/` |
| Release | — | Independent review of `beta`→`main`; tag `v0.5.4`; confirm IINA's *Install from GitHub* gets the Release asset |

**Gate:** CI green on GitHub; the three native checks above pass; independent review before `main`.

## 0.5.5 — chat on your timeline (#2: Live and Manual; Auto spike)

*Theme: chat stops spoiling the video. Ship the parts that are certain; measure before promising Auto.*

- **Delay queue at the single junction** that feeds both sidebar and overlay: the overlay's `live-messages` handler in `src/player.js`. The overlay WebView may be hidden and has no video clock, so the queue doesn't belong there. The payload is a full-history snapshot, so either diff by `id` or post raw events from `ui/overlay-live.js`. Release each message on `tmi-sent-ts + delay`.
- **Bounded by time, not count.** Twenty seconds of a busy channel can exceed today's 150-message cap.
- **Modes:** *Live* (0 s, today's behaviour) and *Manual* (N s, persisted, fine-adjustable, with no hard-coded 20 s default). Moderation clears already apply upstream, so a message deleted while held is never shown. Decide and test what pause, seek, rebuffer and reconnect do to held messages.
- **Control:** one compact control that shows its own state (TNF §3 "state in the thing"), reachable from sidebar and overlay without becoming a settings panel. Prototype it natively before deciding its form.
- **Auto spike** (about 10 minutes of native logging on a live channel): every second, log `Date.now()`, `time-pos`, `demuxer-cache-state` (`reader-pts`, `cache-end`) and `paused-for-cache`. Every ~2 s, fetch the media playlist and log the newest `#EXT-X-PROGRAM-DATE-TIME`. Compare against `tmi-sent-ts` for a visible cue, and stress with pause, seek, quality change and an ad break. mpv appears not to expose PDT: FFmpeg master's HLS demuxer doesn't parse it, but IINA's bundled FFmpeg is unchecked. Assume Auto has to fetch the playlist itself. **Auto is viable only if the estimate holds within about 1 s outside those events.** The same run should identify which IINA element showed "~4 s". The code-level explanation for it is still open.
- **Gate:** native: a Manual delay matching what you perceive on a live channel; Live unchanged; one transport across sidebar and overlay. Unit: synthetic bursts, pause, seek and reconnect.

## 0.6.0 — participate (#3: send chat), plus Auto if the spike passed

- **Scope escalation that leaves read-only users untouched.** "Enable sending" is a separate, explicit device-code grant. Today's token validator in `src/auth.js` demands exactly `['chat:read']`, so it must become "has the required scopes". Store the write-capable grant under its own Keychain service, not `twitch-readonly`. A refresh probably cannot add scopes (inference, unchecked).
- **Transport:** Helix `POST /helix/chat/messages` gives `is_sent`/`drop_reason`, but IINA's `http` may only send form-encoded bodies and exposes no rate-limit headers. IRC `PRIVMSG` reuses the socket but reports failures only as NOTICEs, and it needs the IRC command whitelist in `ui/live.js` widened. Both need `sender_id` (from `/validate`) and the broadcaster ID (IRC `room-id`, not kept today). Pick one after a 30-minute probe of Helix through `iina.http`.
- **Composer:** contextual rather than always present. 500-character limit and self-throttling. Outgoing messages bypass the delay queue and appear immediately as a local echo, marked so it's clear the video is behind. Shared Chat propagation is called out where it applies.
- **Gate:** a user-authorized real grant and real send to a channel you own, with you present; refusal, revocation and rate-limit paths covered by unit tests.

## 0.5.6 — an overlay you can shape (#1), designed together with 0.6.0's composer

*User report, 2026-11-22: drag, resize and layout never felt right. Each agent iteration was buggy, and resize works but isn't intuitive. Not urgent, but wanted. The composer will need the same click-through overlay surface, so design both together and ship the overlay first.*

- **Why earlier attempts churned** (inferred from git history `bf0f8d7` → `e4dfdf6` → `e5af2f2`): 4-edge resize was added, then reduced to a 10 px edge band, then cut back to drag plus corner, each time chasing hover-leave and stuck-cursor glitches in IINA's click-through overlay. No test could see those states.
- **Measure the host before designing.** Run a native probe of what IINA 1.5.1's overlay WebView actually delivers: pointer events at the edges and outside `data-clickable` regions, capture during a drag, cursor changes, and the OSC region. Record what is impossible, so design stays within it.
- **Real-WebKit interaction tests** of `ui/overlay.html` behind the IINA test shim, replaying pointer sequences (drag, edge resize, release outside, leave mid-drag). Run them in CI before any build reaches you. They catch "stuck in resize" mechanically. Feel stays your call.
- **Then design:** direct manipulation with no mode (Handoff §3A), discoverable resize affordances, and a precise non-drag route with visible values. Prototype natively and compare at least two variants.
- **Gate:** native: drag to every edge, resize from the offered affordances, release anywhere, with nothing stuck; position holds across fullscreen and window resize; clicks outside the overlay still reach IINA.

## Later (re-prioritise after 0.6.0)

Twitch emotes and badges (bounded cache, text fallback). Automatic URL interception ahead of Online Media. YouTube live chat. Measured resource cost of Off, sidebar and overlay on a 16 GB Mac. Stable Twitch VOD acquisition beyond the undocumented offset GraphQL.

## Engineering track (every release)

- **Shared IINA-contract test shim** to replace the per-test ad-hoc `iina` mocks. It should record menu options including `keyBinding` (today's `menu.item` mock in `global.test.js` drops them), normalize bindings IINA's way, clear sidebar listeners on `loadFile`, and reject non-JSON `postMessage`. This is the structural gap behind the shortcut bug.
- **Recorded Twitch GraphQL fixtures** (bursty, quiet, end of VOD, nine-hour VOD) plus a property test over `twitch_acquire`: termination, increasing offsets, no `INVALID_ARCHIVE` on well-formed pages. Decide the empty-page-with-more behaviour in `twitch_acquire`. This is the gap behind the VOD bug.
- **Readability:** extract one `readSavedAuth()` (the Keychain read is repeated three times in `global.js`), split the hand-minified lines (the `file-loaded` handler in `src/player.js` is one line of about 1 000 characters), and move all timers onto `src/timers.js`.

## Non-goals

Moderation actions. Patching IINA or its OSC. Background polling while chat is Off. Mandatory Twitch authorization for anything beyond chat.
