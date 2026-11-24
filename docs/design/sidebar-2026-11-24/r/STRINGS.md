# Direction R — Visible Strings

Every visible string on screen is a **name**, **value**, **action**, or **error**. There are no headings, no sentences, no reason text, and no visible labels that repeat an icon.

## Main list

| String | Class | Where |
|---|---|---|
| `Search` | action | Search field placeholder |
| Person display name (e.g. `ohnePixel`, `Northernlion`, `tarik`, `ohnePixel 2`) | name | Primary line of every person row |
| Stream category (e.g. `Grand Theft Auto VI`, `Project Zomboid`, `Just Chatting`) | name | Meta line of live person rows |
| Viewer count (e.g. `37K`, `8.4K`, `14K`) | value | Meta line of live person rows (`U.compact`) |
| Last live age (e.g. `39m`, `17h`, `3d`) | value | Meta line of offline person rows (`U.ago`) |
| Compact quality (e.g. `1080p60`, `720p60`, `480p`, `360p`, `Audio only`) | value | Trailing button on the playing person's row |
| Quality options (`Source (1080p60)`, `720p60`, `480p`, `360p`, `Audio only`) | value | Quality menu opened from the playing row (`VIEWER.qualities`) |
| `Show All` | action | Tail button after the first 30 offline people in `#many` |
| `Clear` | action | Empty-state button when search has no matches |

## Person page

| String | Class | Where |
|---|---|---|
| Person display name (e.g. `ohnePixel`) | name | Top bar beside the Back icon button and avatar |
| `LIVE 7:20` (and other uptimes via `U.uptime`) | value | Top bar status when live, and meta line of the live broadcast row |
| Last live age (e.g. `17h`, `3d`) | value | Top bar status when offline |
| `Search` | action | Broadcast search field placeholder |
| Broadcast title (live stream or VOD title) | name | Primary line of each broadcast row |
| Stream category (e.g. `Grand Theft Auto VI`) | name | Meta line of the live broadcast row |
| Viewer count (e.g. `37K`) | value | Meta line of the live broadcast row |
| Duration and age (e.g. `7:20:00 · 2d`) | value | Meta line of each VOD row (`U.duration` and `U.ago`) |
| `Clear` | action | Empty-state button when broadcast search has no matches |

## Non-visible strings (accessible names and tooltips)

- Back icon button: `aria-label="Back"`, `title="Back"` (no visible word).
- Search clear icon button: `aria-label="Clear"`, `title="Clear"`.
- Row chevrons: person's name in `aria-label` and `title`.
- Playing quality button: `"Quality, <selected>"` in `aria-label`, full quality name in `title`.
- Live rows: stream title in `title`; person/title, live state + uptime, category, viewers, and unfinished progress (if any) in `aria-label`.
- Offline rows: name + last live age in `title`; person, offline state + age, and unfinished progress (if any) in `aria-label`.
- VOD rows: full title in `title`; title, duration, age, and watched percentage (if started) in `aria-label`.

## Intentional override noted by the brief

- **No sort or filter on the person's page:** The operator asked to "filter or sort them" (07:06), and Direction R intentionally omits sort and filter controls from the sidebar (leaving them to the dashboard), keeping only broadcast title search and newest-first order.
