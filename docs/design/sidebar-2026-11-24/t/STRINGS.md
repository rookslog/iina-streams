# Direction T — Visible Strings

Every visible string in Direction T (`panel.html`, `panel.css`, `panel.js`) with its class (`name`, `value`, `action`, or `error`), per `.agents/skills/streams-interaction-design/SKILL.md` ("Text on screen").

| Where | String | Class | Notes |
|---|---|---|---|
| Top block | Person display name (e.g. `ohnePixel`, `Northernlion 2`) | name | Ellipsized if wider than available space; full name in tooltip |
| Top block (live) | `LIVE 7:20` (`LIVE` + `U.uptime(startedAt)`) | value | Paired with red live dot |
| Top block (live) | Category (e.g. `Grand Theft Auto VI`) | name | Ellipsized on narrow widths |
| Top block (live) | Viewer count (e.g. `36.7K`) | value | Compact count via `U.compact` |
| Top block (offline) | Last live age (e.g. `17h`, `3d`) | value | Via `U.ago(lastLive)` |
| Top block (live / VOD) | Stream or VOD title | name | Clamped to 2 lines; full title in tooltip |
| Top block (VOD / live) | `LIVE` | action | Button shown when a VOD of a live person is playing or when viewing another live person's page |
| Top block (playing) | Quality value (e.g. `1080p60`, `Source (1080p60)`, `720p60`, `480p`, `360p`, `Audio only`) | value | Trigger button and menu items from `VIEWER.qualities` |
| Broadcasts list | Broadcast title | name | Clamped to 2 lines; full title in tooltip |
| Broadcasts list | Duration and age (e.g. `7:20:00 · 1d`) | value | Via `U.duration` and `U.ago` |
| Search view | `Search` | action | Search field placeholder |
| Search view | Person display name | name | Matching people |
| Search view | `LIVE 3:38` and category, or last live age | value / name | Live uptime + category name, or offline age |
| Search view | Viewer count (e.g. `13.9K`) | value | Shown at trailing edge when live |
| Error fallback | `No data` | error | Shown only if `SNAPSHOT`, `VIEWER`, or `U` fails to load |

## Icon-only controls (no visible string)
- **Back** button (top block on another person's page; search bar header): chevron-left SVG with `aria-label="Back"` and `title`.
- **People search** button (end of bottom strip): magnifier SVG with `aria-label="Search"` and `title="Search"`.
