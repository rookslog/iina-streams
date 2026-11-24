# Visible strings — Direction P

Every visible string in Direction P belongs to one of four classes (`name`, `value`, `action`, `error`), per the "Text on screen" rule.

| Where | String | Class | Notes |
|---|---|---|---|
| Search field | `Search` | action | Input placeholder |
| Active person chip | `<person.name>` | name | e.g. `Northernlion`, `CohhCarnage` |
| Active person chip | `×` | action | Remove filter chip (`aria-label="Remove <person.name>"`, `title="Remove"`) |
| Search suggestion chip | `<person.name>` | name | Matching person from snapshot/ranked list |
| Now strip | `<person.name>` | name | 11 px label under each 40 px live avatar |
| Timeline day marker | `Today` | value | Broadcast or watched date (`2026-11-24`) |
| Timeline day marker | `Yesterday` | value | Broadcast or watched date (`2026-11-23`) |
| Timeline day marker | `<Weekday> <Day>` | value | e.g. `Sun 22`, `Sat 21` (2–6 days ago) |
| Timeline day marker | `<Month> <Day>` | value | e.g. `Nov 15`, `Nov 3`, `May 13` (same year) |
| Timeline day marker | `<Month> <Day>, <Year>` | value | e.g. `Oct 26, 2025` (prior year) |
| Timeline row | `<vod.title>` | name | Broadcast title, single line ellipsized |
| Timeline row meta | `<person.name>` | name | Inline button that filters timeline to that person |
| Timeline row meta | `· <duration> · <age>` | value | e.g. `· 4:56:14 · 14h`, `· 3:14:20 · 3w` |
| Empty filter state | `Clear` | action | Shown only when search/filter yields zero rows |

## Non-visible strings (tooltips & accessible names)

- Search clear button: `aria-label="Clear"`, `title="Clear"`
- Now tile: `title="<person.name> · <category> · <viewers>"`, `aria-label="<person.name>, Live, <viewers> viewers[, playing]"`
- Timeline row: `title="<person.name> · <vod.title> (<category>)"`, `aria-label="<person.name>, <Live|VOD>, <vod.title>, <duration>, <age>[, <pct>% watched][, new][, playing]"`
- Timeline accent dot: `title="New"`
