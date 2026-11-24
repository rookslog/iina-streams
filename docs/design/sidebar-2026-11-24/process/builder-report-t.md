# Direction T Report

## Files Created
All files were created in `/Users/rookslog/Development/iina-streams/docs/design/sidebar-2026-11-24/t/`:
- `index.html` — copied from `../shared/index-template.html` with `data-label="Direction T"`, plus a small hash-forwarding script (`postMessage({ type: "hash", hash: location.hash })` on `#panel` load and `hashchange`) so URL hash states (`#signed-out`, `#new`, `#many`) work even under Safari `file://` frame isolation.
- `panel.html` — loads `../shared/base.css`, `../shared/snapshot.js`, `../shared/viewer.js`, `../shared/util.js`, `panel.css`, and `panel.js`.
- `panel.css` — layout and macOS dark styling for the top block, quality popup menu, 96×54 broadcast rows, search view, and bottom pinned 32 px avatar strip, spaced on a 4 px grid with 150–160 ms transitions and reduced-motion support via `base.css`.
- `panel.js` — interactive state, hash mode handling (`default`, `#signed-out`, `#new`, `#many`), `{ type: "playing" }` listener, quality menu, search filtering, strip progress arcs, and keyboard/VoiceOver support.
- `STRINGS.md` — inventory of every visible string and its class (`name`, `value`, `action`, `error`).

## Choices Where the Brief Was Open
1. **Quality popup placement and control type:** Placed at the trailing end of the top block's footer row (below the 2-line title and optional VOD position bar) as a custom macOS-styled menu button (`aria-haspopup="menu"`) with checkmark and arrow-key navigation rather than a native `<select>` or inline next to the person's name. This keeps long channel names untruncated at 300 px and avoids browser-default `<select>` chrome.
2. **Back navigation on another person's page and search:** Added an icon-only Back button (`aria-label="Back"`, `title` with the playing person's name) in the top-left of the top block when viewing someone other than the playing person (and in the search bar header). Without this, inspecting an offline person while watching a non-strip offline VOD would have no pointer return path without restarting playback.
3. **Search row click behavior & pinned strip during search:** In search view, the bottom strip stays pinned with the magnifier button active (`aria-pressed="true"`), and the magnifier button stays pinned outside the horizontally scrolling `#many` avatar track so search is always reachable. Clicking a live person in search plays them (`U.play` + `U.closePanel()`) and updates the panel to them; clicking an offline person opens their page without interrupting playback.
4. **Live person's `vods[0]` thumbnail fallback:** In `snapshot.js`, live streamers have `vods[0].thumb === null`. Broadcast rows fall back to `person.preview || person.avatar` (matching `frame.js`) so no broadcast row renders a broken or blank thumbnail.
5. **Hash `#many` playback mapping:** Because `frame.js` indexes only the 14 base logins from `SNAPSHOT.people`, synthetic `#many` entries (`login-2`..`login-22`) store `baseLogin` and track `pendingDisplayLogin` so selecting a synthetic person plays the underlying `baseLogin` in `frame.js` while displaying the selected synthetic person as playing in the panel.
6. **Hash `#signed-out` history set:** Interpreted "history people" from `VIEWER.lastVisitDaysAgo` union `VIEWER.unfinished` (11 people, excluding `sodapoppin`, `moistcr1tikal`, and `vinesauce` who have no visit/unfinished entries).
7. **VOD position bar when unstarted:** When a newly clicked VOD has no entry in `VIEWER.unfinished`, the top block's position bar renders at `0%` (`aria-valuenow="0"`), matching `frame.js`'s `0:00 / duration` start clock.

## Checks Run & Limitations
- `node --check panel.js`: passed with exit code 0.
- `grep -rn "http" t/`: returned no matches.
- Local image verification in Node: verified 0 missing image files across all `avatar`, `preview`, and `thumb` paths in `SNAPSHOT.people`.
- Node DOM simulation test: verified `default`, `#signed-out`, `#new`, `#many` (308 people, 135 strip items, `Cmd+F` search reaching all 308 people, `Escape` returning), and `{ type: "playing" }` updating the top block to a VOD with position bar and `LIVE` action.
- **What could not be done:** Live browser visual rendering and screenshot inspection in Safari/WebKit were not executed (Playwright browsers are not cached locally, and existing Safari windows were left untouched per workspace constraints). Visual alignment at 300 px and 360 px in Safari should be verified by opening `t/index.html` in Safari.
