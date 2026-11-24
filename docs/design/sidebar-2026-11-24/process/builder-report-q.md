# Direction Q Report (Gemini 4 Hydrogen)

## Files created

In `/Users/rookslog/Development/iina-streams/docs/design/sidebar-2026-11-24/q/`:

- `index.html` — copied from `../shared/index-template.html` with `data-label="Direction Q"` and `<title>Direction Q</title>`, plus a small hash-forwarding script after `frame.js` so URL hashes (`#signed-out`, `#new`, `#many`, `#channel`, `#offline`) and `hashchange` events reach the `#panel` iframe even under `file://` origin isolation.
- `panel.html` — loads `../shared/base.css`, `../shared/snapshot.js`, `../shared/viewer.js`, `../shared/util.js`, `panel.css`, and `panel.js`. Preserves Round 2's exact views (`#list-top`/`#list-view` and `#chan-top`/`#chan-view`), sections (`Continue watching`, `Live`, `Offline`), and disclosure groups (`Chat`, `Twitch`, `History`).
- `panel.css` — macOS dark sidebar styling built on `../shared/base.css` tokens, 4 px spacing grid, `[hidden] { display: none !important; }`, flat grouped surfaces (no shadows, no gradients), custom macOS-styled `<select>` wrapper, pill switches, segmented control, 150–180 ms transitions respecting `prefers-reduced-motion`.
- `panel.js` — plain JavaScript wiring Round 2's structure onto `SNAPSHOT`, `VIEWER`, and `U`, supporting hash states (`#signed-out`, `#new`, `#many`, `#channel`, `#offline`) and live `hashchange`, `{type: "playing"}` messages from `frame.js`, `U.play` + `U.closePanel()` on stream/VOD selection, keyboard navigation (`Tab`, `↑`/`↓`, `Return`, `Escape`, `⌘F`), and interactive Chat/Twitch/History controls.
- `STRINGS.md` — lists every visible string with its class (`name`, `value`, `action`), non-visible signifiers, and tooltips/accessible names.

## Choices the brief did not dictate

1. **Person row layout (2-line `.row` from `base.css` vs Round 2's 1-line grid):** Round 2 (`lowfi.css`) placed avatar, name, `category · title`, and viewers all on a single horizontal line, which crushed `category · title` at 300 px. Using `base.css`'s `.row` structure (28 px avatar, line 1 name + right-aligned tabular value, line 2 ellipsized `category · title` or newest VOD title) keeps all Round 2 strings readable at both 360 px and 300 px.
2. **VOD date formatting (`Nov 23` vs `1d`):** `../shared/util.js` exports `U.ago` (`3h`, `2d`, `3w`) for offline last-live age, while Round 2 (`DONE.md`) showed calendar dates (`Nov 21`) on VOD rows. `panel.js` formats VOD dates with `Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })` to match Round 2's exact strings, while using `U.ago` for offline person rows.
3. **Channel view `Type` filter on `SNAPSHOT` VODs:** `SNAPSHOT` VODs have no `type` property (all are full broadcasts > 1 hour). `All` and `Broadcasts` show all VODs for the channel; `Highlights` and `Uploads` filter to empty so the control remains honest without inventing metadata.
4. **`#signed-out` and `#new` mapping onto `SNAPSHOT`/`VIEWER`:**
   - `#signed-out`: filters `U.ranked` to people with watch history (`VIEWER.lastVisitDaysAgo[login] != null`), hiding the 3 people without history (`sodapoppin`, `moistcr1tikal`, `vinesauce`), and displays `Sign in with Twitch` in the `Twitch` group.
   - `#new`: clears `Continue watching` and `Offline` (no history), displays live channels from `SNAPSHOT`, focuses search, disables `Forget <name>`, and displays `Sign in with Twitch`.
   - `#many`: repeats `U.ranked` 22 times (308 people total) with numeric suffixes (`2`–`22`); clicking a suffixed person's VOD/stream strips the `-N` suffix when calling `U.play` so the shared `frame.js` resolves the real snapshot channel.
5. **Playing a VOD updates the Playing summary:** When `{type: "playing"}` arrives with `kind === "vod"`, `#playing` shows `<Name> · <VOD title>` and its duration rather than a `LIVE` pill.
6. **Hash forwarding for `file://`:** Because `../shared/frame.js` creates `<iframe id="panel" src="panel.html">` without forwarding `location.hash`, and browsers treat `file://` parent/iframe frames as cross-origin, `index.html` forwards `location.hash` to `panel.html` on load and via `postMessage({ type: "hash" })` on `hashchange`.
7. **Inline `<svg>` chevrons on `<select>`:** Instead of a `data:image/svg+xml` CSS background (which would require an `xmlns` URL containing `http`), `.select-wrap` places an inline `<svg>` chevron beside each `<select>` so zero `http` strings appear in the folder.

## Verification and what could not be done

- **Checked and passed after final edit:**
  - `node --check q/panel.js` — passed.
  - `rg -n "http" q/` — 0 matches across all 5 files.
  - Headless Google Chrome (via Playwright) against both a local Python/Node HTTP server and `file://`: verified 360 px and 300 px widths with zero horizontal overflow, all avatar/thumbnail images loaded, `#chan-top`/`#chan-view` hidden in list view and `#list-top`/`#list-view` hidden in channel view, keyboard search (`#q` -> `ArrowDown` -> `Enter` -> channel view -> `#vq` -> `Escape` -> `Escape` back -> `Escape` clears `#q`), VOD click triggering `{type: "playing"}` and closing sidebar, `#signed-out`, `#new`, `#many` (including `Show more`), and `file://` `#signed-out` + `hashchange` -> `#new`. Screenshots were visually inspected.
- **Could not do / not tested:**
  - `npx impeccable detect` failed with `EPERM` on `/Users/rookslog/.npm/_cacache/tmp` (existing root-owned cache permission error outside this folder).
  - Playwright's standalone WebKit binary was not cached locally (`/Users/rookslog/Library/Caches/ms-playwright/` does not exist), so automated browser checks ran in headless Google Chrome rather than WebKit/Safari directly; real Safari and VoiceOver were not manually launched.
