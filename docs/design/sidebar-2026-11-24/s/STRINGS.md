# Visible strings — Direction S

Every visible string in `panel.html` and `overlay.html` is listed below with its class (`name`, `value`, `action`, or `error`), per `.agents/skills/streams-interaction-design/SKILL.md` ("Text on screen").

| Surface | String (or pattern) | Class | Notes |
|---|---|---|---|
| `panel.html` | Streamer display name (e.g. `ohnePixel`) | `name` | Playing person in top block |
| `panel.html` | `LIVE` (button on VOD hero when person is live) | `action` | Switches to live stream and closes panel |
| `panel.html` | `LIVE <h>:<mm>` (e.g. `LIVE 7:20`) | `value` | Uptime value next to live dot when live is playing |
| `panel.html` | Viewer count (e.g. `36.7K`) | `value` | Compact viewer count in top block |
| `panel.html` | Category name (e.g. `Grand Theft Auto VI`) | `name` | Game/category in top block |
| `panel.html` | Stream or VOD title | `name` | Up to two lines in top block; one per broadcast row |
| `panel.html` | Quality button value (e.g. `1080p60`) | `value` | Compact value popup trigger at top block end |
| `panel.html` | Quality menu items (`Source (1080p60)`, `720p60`, `480p`, `360p`, `Audio only`) | `value` | Options in quality popup menu |
| `panel.html` | `Search` | `value` | Search field placeholder |
| `panel.html` | Broadcast length and age (`<duration> · <ago>`) | `value` | Row metadata in broadcast list and VOD top block |
| `panel.html` | `Clear` | `action` | Shown in empty search result state |
| `panel.html` | `Unavailable` | `error` | Defensive fallback if playing person cannot be resolved |
| `overlay.html` | `Search` | `value` | Search field placeholder |
| `overlay.html` | Live person display name (e.g. `Northernlion`) | `name` | Row 1 tile label |
| `overlay.html` | Live viewer count (e.g. `8.4K`) | `value` | Row 1 tile viewer count |
| `overlay.html` | Unfinished VOD person display name (e.g. `tarik`) | `name` | Row 2 tile label |
| `overlay.html` | `Clear` | `action` | Shown when search matches neither row |

Note: the frame chrome in `index.html` is outside the design and holds the brief's unchecked native feasibility notes for Direction S.
