# Direction P — Build Report (Gemini 4 Hydrogen)

## Files created
All files are in `/Users/rookslog/Development/iina-streams/docs/design/sidebar-2026-11-24/p/`:

- `index.html`: Copied from `../shared/index-template.html` with `data-label="Direction P"` and `data-panel="panel.html"`.
- `panel.html`: Loads `../shared/base.css`, `../shared/snapshot.js`, `../shared/viewer.js`, `../shared/util.js`, `panel.css`, and `panel.js`. Uses semantic regions (`<header>`, `<section>`), `role="toolbar"` for chips, `role="list"` for the Now strip, and `role="listbox"` / `role="option"` for the timeline.
- `panel.css`: Layout and styling on a 4 px grid using `base.css` dark macOS system tokens, 160 ms ease-out transitions (respecting `prefers-reduced-motion` from `base.css`), 40 px live avatars with 11 px names in Now, 64×36 thumbnails with bottom-trailing 18 px corner avatars and progress bars underneath, and responsive truncation at 360 px and 300 px with zero horizontal overflow.
- `panel.js`: Plain readable JavaScript (`"use strict";`) implementing the chronological timeline, unfinished-watching placement by watched date, Now strip, person filter chip and search suggestion chips, `#signed-out` / `#new` / `#many` states and `hashchange` handling, `{type:"playing"}` listener, `U.play` + `U.closePanel()` switching, and full keyboard navigation (`Tab`, `⌘F`, `Escape`, `↑`/`↓`, `←`/`→`, `Return`/`Space`).
- `STRINGS.md`: Inventory of all visible strings with their class (`name`, `value`, `action`, or `error`), plus tooltips and accessible names.

## Choices not dictated by the brief

1. **Deduplicating unfinished VODs in the timeline:** Each entry in `VIEWER.unfinished` appears once in the timeline, moved to its `watchedDaysAgo` date (`U.NOW - u.watchedDaysAgo * 86400000`) rather than appearing twice (once on broadcast date and once on watched date). Its age value in meta (`14h`, `1d`, `9d`, `3w`) matches its watched date and day header (`Today`, `Yesterday`, `Nov 15`, `Nov 3`), and its `isNew` accent dot is suppressed since the viewer already started watching it.
2. **Timezone reference for day headers:** Calendar day labels (`Today`, `Yesterday`, `Weekday Day`, `Month Day`, `Month Day, Year`) are computed against the `-05:00` offset from `SNAPSHOT.takenAt` (`2026-11-24T15:45-05:00`) so day boundaries (`Today`, `Yesterday`, `Nov 3`) remain consistent regardless of the viewer's local system timezone.
3. **Fallback thumbnail when `vod.thumb` is `null`:** Live current broadcasts (`vodIndex === 0 && p.live`) use `p.preview`; older VODs without a thumbnail (`vods[6..7]`) render a neutral 64×36 `--fill` frame with a centered play glyph rather than duplicating the corner avatar inside the thumbnail.
4. **Search behavior while typing and in `#new`:** Typing in Search both suggests matching people as selectable chips (capped at 12 chips, prefix matches first, horizontally scrollable) and filters the timeline live by person name/login, title, or category. In `#new`, the timeline stays hidden until the user types a search query or picks a suggested person chip, at which point `SNAPSHOT` acts as search results.
5. **Hash forwarding across `frame.js`:** Because `../shared/frame.js` embeds `panel.html` without forwarding `location.hash`, `panel.js` reads `location.hash` first and falls back to `window.parent.location.hash` (guarded with `try/catch` for strict `file://` origins) and listens to `hashchange` on both `window` and `window.parent`.
6. **`#signed-out` person pool:** Interpreted "history people only" as people present in `VIEWER.lastVisitDaysAgo`, `VIEWER.unfinished`, or `VIEWER.playing` (11 people, 88 timeline rows, omitting `sodapoppin`, `moistcr1tikal`, and `vinesauce` who have no history in `VIEWER`).
7. **`#many` expansion and keyboard reachability:** Repeats `U.ranked` 22 times (`308` people, `132` live in Now, `2,464` timeline rows), staggering repeated VOD timestamps by 37 minutes per copy and sending `p.sourceLogin` to `U.play` so `frame.js` always resolves playback media. Timeline loads 60 rows initially and appends 60 more on scroll (`IntersectionObserver` + `scroll` fallback) or when keyboard `↓` moves past the last rendered row.
8. **Empty filter state:** When a search query returns zero rows, shows a muted search glyph and a single `"Clear"` action button (no explanatory sentence).
9. **Marking the playing item:** The active Now tile uses `--selected` with a 1 px accent border and outer avatar ring; an active timeline VOD row uses a 3 px leading accent bar and subtle `--selected` tint. Choosing either calls `U.play(...)` followed by `U.closePanel()` to match the brief's Switching rule.

## Verification & anything I could not do

- **Checks run after final edit:**
  - `node --check /Users/rookslog/Development/iina-streams/docs/design/sidebar-2026-11-24/p/panel.js` exited `0`.
  - `grep -rn "http" /Users/rookslog/Development/iina-streams/docs/design/sidebar-2026-11-24/p/` returned no matches (`NO_HTTP_FOUND`).
  - Playwright verification via installed Google Chrome (`/private/tmp/verify_p.py` against a local HTTP/1.1 server) passed all assertions: 360 px and 300 px layout with zero horizontal overflow and zero broken images across 202 `<img>` elements; day labels (`Today`, `Yesterday`, ..., `Nov 3`); person-name click filtering and chip `×` removal; Search suggestion chip filtering; `Escape` clearing filter before closing panel; Now click & timeline VOD click triggering playback, closing panel, and updating playing marks via `{type:"playing"}`; `#signed-out` (88 rows), `#new` (focused Search, 6 Now items, hidden timeline until search), and `#many` (132 live in Now, 60 initial rows expanding to 120 on scroll, keyboard `ArrowDown` selection). Screenshots at 360 px and 300 px were visually inspected.
- **Not tested:**
  - Not opened directly in macOS Safari or tested with macOS VoiceOver; browser checks ran in headless Google Chrome via Playwright because Playwright's standalone WebKit binary was not installed.
  - Cross-origin `file://` restriction behavior in Safari when opening `index.html#new` over `file://` (rather than `http://localhost`) was not directly observed in Safari; if Safari blocks `window.parent.location.hash` across `file://`, opening `panel.html#new` directly or serving via HTTP avoids it.
