# Direction R Build Report

## Files created

- [index.html](file:///Users/rookslog/Development/iina-streams/docs/design/sidebar-2026-11-24/r/index.html) — copied from `../shared/index-template.html` with `data-label="Direction R"` and `data-panel="panel.html"`.
- [panel.html](file:///Users/rookslog/Development/iina-streams/docs/design/sidebar-2026-11-24/r/panel.html) — loads `../shared/base.css`, `../shared/snapshot.js`, `../shared/viewer.js`, `../shared/util.js`, `panel.css`, and `panel.js`.
- [panel.css](file:///Users/rookslog/Development/iina-streams/docs/design/sidebar-2026-11-24/r/panel.css) — 4 px grid spacing, macOS dark source-list styling, 360 px and 300 px layout, 150–190 ms transitions gated by `prefers-reduced-motion` (in `base.css`).
- [panel.js](file:///Users/rookslog/Development/iina-streams/docs/design/sidebar-2026-11-24/r/panel.js) — people list, playing-row accent bar and quality menu, live/offline hairline split, unfinished VOD avatar arcs, slide-in person broadcast page, search, keyboard navigation, `{type:"playing"}` listener, and `#signed-out` / `#new` / `#many` hash states.
- [STRINGS.md](file:///Users/rookslog/Development/iina-streams/docs/design/sidebar-2026-11-24/r/STRINGS.md) — full list of visible strings with their class (`name` / `value` / `action`), non-visible accessible names/tooltips, and the intentional omission of sort/filter on the person page.

## Choices the brief did not dictate

1. **Parent hash forwarding:** `../shared/frame.js` loads `<iframe id="panel" src="panel.html">` without passing `location.hash`. `panel.js` reads `window.location.hash` first and falls back to `window.parent.location.hash` (inside `try/catch` for `file://` restriction safety) and listens for `hashchange` on both `window` and `window.parent`, so opening `r/index.html#signed-out`, `#new`, or `#many` works directly.
2. **`#signed-out` history filter:** `VIEWER.rank` lists 14 channels while `VIEWER.lastVisitDaysAgo` has entries for 11 of them (`sodapoppin`, `moistcr1tikal`, and `vinesauce` are absent). `#signed-out` keeps only the 11 channels in `VIEWER.lastVisitDaysAgo` (in `VIEWER.rank` order, including all 4 channels with unfinished VODs) so `#signed-out` visibly differs from the signed-in default.
3. **`#many` generation & expansion:** Generates 300 channels by cycling through `VIEWER.rank` (keeping round 1 un-suffixed so `VIEWER` state remains intact, and appending ` 2`, ` 3`, ... for subsequent rounds). Shows all live channels, the hairline, the first 30 offline channels, and a `"Show All"` button reachable by pointer and keyboard (`↓` / `Return`); searching in `#many` matches across all 300 channels.
4. **Live + unfinished avatar pairing (e.g., Northernlion):** Uses a `36x36` avatar container where the `28x28` avatar carries the `1.5px` red live ring (`--live`) and an outer `36x36` SVG ring (`r=17`) renders the `1.5px` accent arc (`--accent`), keeping both signals separated so they do not collide.
5. **Deduplicating live stream from VOD list on the person page:** In `snapshot.js`, live channels include `vods[0]` with `thumb: null` and `at` within seconds of `startedAt` (the in-progress recording of the active broadcast). When a channel is live, that duplicate entry is omitted below the live broadcast row while preserving original indices (`vodIndex`) for `U.play` and `U.progressOf`.
6. **Quality button display & persistence:** Displays `1080p60` for `Source (1080p60)` on the playing row while showing full `VIEWER.qualities` strings in the menu. Preserves a locally chosen quality override across `{type:"playing"}` broadcasts from `frame.js` (since `frame.js` does not update its own `VIEWER.playing.quality` on menu selection).
7. **Empty search state:** Renders a single `"Clear"` action button with no explanatory sentence, keeping every visible string in the `name` / `value` / `action` / `error` set.
8. **Inline SVG without `http`:** Derives the SVG namespace from `dom.app.querySelector("svg").namespaceURI` instead of hardcoding the SVG URI literal, keeping `grep -rn "http"` completely clean.
9. **Person page keyboard ergonomics:** `→` on a selected row (or from an empty search field) opens the person's page; `←` (from a broadcast row or empty search field) or `⌘[` returns to the list; `Escape` clears non-empty search first, then calls `U.closePanel()` (or closes the quality menu first if open).

## Verification & what could not be done

- **Verified:**
  - `node --check r/panel.js` passed.
  - `grep -rn "http" r/` returned zero matches.
  - Headless Chromium (via Playwright against a local Python HTTP server) verified: all 14 avatar images loaded (`naturalWidth > 0`), zero horizontal overflow at `360px` and `300px`, no overlap between row text and the quality button at `300px`, quality menu opens and switches to `720p60`, keyboard `↑`/`↓`/`→`/`←`/`Escape`/`Ctrl+F` reaches all 14 people and their broadcasts, live row click closes the panel and `{type:"playing"}` updates row 1 (both via `frame.js` and direct `postMessage`), and `#signed-out` (11 rows), `#new` (6 live rows, search auto-focused), and `#many` (160 initial rows -> `"Show All"` -> 300 rows) react to parent `hashchange`.
- **Could not do:**
  - Did not open or test interactively in Safari (or native IINA), and Playwright's WebKit binary was not installed locally without network download; layout and interactions were verified in headless Chromium rather than WebKit/Safari.
  - Under `file://` in Safari with strict local file restrictions, `window.parent.location.hash` inside `readHash()` could be blocked by the browser's cross-origin `file://` policy (handled gracefully via `try/catch`, falling back to `panel.html#<hash>`).
