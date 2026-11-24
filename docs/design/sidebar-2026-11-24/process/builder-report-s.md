# Direction S — Implementation Report

## Files Created
All files were created in `/Users/rookslog/Development/iina-streams/docs/design/sidebar-2026-11-24/s/`:
- `index.html`: Copied from `../shared/index-template.html` with `data-label="Direction S"`, `data-overlay="overlay.html"`, `data-open="false"`. Adds the unchecked native feasibility note in the frame chrome (outside the design) and forwards URL hash changes / panel close focus back to the frame.
- `overlay.html`, `overlay.css`, `overlay.js`: The centred glass switcher card hidden until `Tab` is pressed over the video (`{type:"overlay-active", active:true}`), with search-by-typing, row one of `56 px` live avatar tiles (name + compact viewers), row two of `120×68` unfinished VOD thumbnail tiles (progress bar + person name), previous-channel preselection, and full arrow/Tab/Return/Escape keyboard navigation.
- `panel.html`, `panel.css`, `panel.js`: The sidebar panel (starts closed), showing only the playing person's top block (44 px avatar, name, live uptime/category/viewers or VOD length/age/category, 2-line title, quality value popup at block end, plus VOD position bar and `LIVE` action when watching a VOD of a live person) and their searchable broadcasts (`96×54` thumbnails, title, duration/age, and progress bars, newest first).
- `STRINGS.md`: Exhaustive table of every visible string in `panel.html` and `overlay.html` classified as `name`, `value`, `action`, or `error`.

## Choices the Brief Did Not Dictate
1. **Top block layout at `300 px`:** Placed the quality value popup (`1080p60`) and optional `LIVE` action inline on the name row to the right of the `44 px` avatar so the status/meta line (`LIVE 4:42 · 8.4K · Project Zomboid` or `4:43:13 · 5h · Just Chatting`) spans the full remaining width (`220 px` at `300 px`) without clipping category or viewer counts.
2. **Missing VOD thumbnails (`thumb: null` in `SNAPSHOT`):** Several broadcasts in `snapshot.js` (`vods[0]` of live channels and `vods[6]`/`vods[7]`) have `thumb: null`. Rendered a `96×54` `--fill` placeholder frame with a subtle play icon rather than guessing a preview image or causing broken `<img>` elements.
3. **Previous channel before first switch:** Initialized `previous` to the first live channel in `VIEWER.rank` other than `VIEWER.playing.login` (`Northernlion`), so an immediate `Tab` + `Return` on initial open switches away from `ohnePixel` and a second `Tab` + `Return` switches right back to `ohnePixel`.
4. **Currently playing marker in `overlay.html`:** Marked the currently playing tile with a subtle `2 px` top `--accent` pill (`aria-current="true"`), distinct from the `--selected` highlight (`aria-selected="true"`), avoiding word badges.
5. **Overlay search & empty states:** Typing anywhere while the overlay is open filters both rows; `Escape` clears a non-empty query first and closes the overlay on the next `Escape` (matching the panel rule). When a filter returns zero matches, a `Clear` action button is shown with no explanatory sentence.
6. **`#many` playback mapping:** Generated 300 entries (`129` live tiles in row one) with numeric suffixes (`"ohnePixel 2"`, etc.) while keeping `baseLogin` mapped to the underlying `SNAPSHOT` login so every `#many` tile plays in `frame.js` when chosen.
7. **Broadcasts `newest first` and `#signed-out`/`#new`:** Sorted broadcasts by `Date.parse(b.at)` descending; omitted unfinished VOD progress bars and row two in `#new` (no history) and kept `#signed-out` grounded in `VIEWER.rank` / `VIEWER.unfinished` local history.
8. **Split `overlay.css` / `overlay.js`:** Separated `overlay.html`'s styles and scripts into `overlay.css` and `overlay.js` alongside `panel.css` and `panel.js` for readability and `node --check` validation.

## Verification & Anything Not Done
- **Checks passed after final edit:**
  - `node --check` passed on `panel.js` and `overlay.js`.
  - `grep -rn "http"` returned zero matches in `s/`.
  - Headless Google Chrome (Playwright) against `file:///.../s/index.html` passed all automated checks: initial closed sidebar / inactive overlay, `Tab` activation & previous-channel preselection (`Northernlion` -> `ohnePixel`), `ArrowDown`/`ArrowUp`/`ArrowLeft`/`ArrowRight`, live typing filter, two-step `Escape`, `{type:"playing"}` panel sync, zero horizontal overflow and all images loaded at `360 px` and `300 px`, quality popup menu, broadcast `ArrowDown` + `Return` playing VOD & closing panel, VOD top block `LIVE` button and position bar, `#new` (6 live, 0 unfinished), `#many` (129 live tiles scrolling horizontally), and `#signed-out` (6 live, 4 unfinished), with zero console or page errors.
- **Not tested / cannot verify here:**
  - Not opened interactively in macOS Safari.app or VoiceOver.app (tested in headless Google Chrome via `file://`, not Safari/WebKit, because Playwright's WebKit binary is not installed).
  - Native IINA 1.5.1 overlay/key-binding feasibility (`input.onKeyDown` priority, `Tab` availability, and `PluginOverlayView.swift` click/key behavior) remains unchecked in native IINA.
