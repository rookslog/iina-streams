# Direction Q — Visible Strings

Every visible string in `panel.html` and `panel.js`, classified per `.agents/skills/streams-interaction-design/SKILL.md` ("Text on screen": **name**, **value**, **action**, or **error**). Tooltips and `aria-label` values appear only on hover or via VoiceOver and are listed separately.

## List view

| String (example) | Where | Class |
|---|---|---|
| `LIVE` | Playing summary (`#playing`); live card in channel view | value |
| `ohnePixel`, `Northernlion`, `LIRIK`, … | Playing summary, person rows, Continue watching | name |
| `36.7K`, `8.4K`, … | Playing summary, live person rows | value |
| `Source (1080p60)`, `720p60`, `480p`, `360p`, `Audio only` | Quality menu (`#quality`) | value |
| `Search` | Search field placeholder (`#q`) | action |
| `3`, `0` | Search field result count (`#q-count`, while typing) | value |
| `Continue watching` | Section heading | name |
| `Live` | Section heading | name |
| `Offline` | Section heading | name |
| `the monday gamer \| !prime !DemonBluff`, … | VOD title (Continue watching and channel view) | name |
| `Nov 23`, `May 13`, … | VOD date | value |
| `4:56:14`, `7:20:23`, … | VOD length, on thumbnail | value |
| `Grand Theft Auto VI`, `Project Zomboid`, … | Category, in a live person row | name |
| `🔴[DROPS] GTA 6 PACIFIST PLAYTHROUGH🔴`, … | Stream title, in a live person row | name |
| `40m`, `2d`, … | Offline person row: time since last live | value |
| `Show more` | Under Live and Offline when list exceeds cap | action |
| `Chat` | Group heading | name |
| `Beside`, `Over` | Chat placement segmented control | value |
| `14` | Chat text size | value |
| `Import…` | Chat group | action |
| `Twitch` | Group heading | name |
| `you_handle` | Twitch group (signed in) | name |
| `Sign out` | Twitch group (signed in) | action |
| `Sign in with Twitch` | Twitch group (`#signed-out`, `#new`, or after Sign out) | action |
| `History` | Group heading | name |
| `Forget ohnePixel` | History group (updates to playing person's name) | action |
| `Delete all…` | History group | action |

## Channel view

Repeats `LIVE`, person names, viewer counts, categories, stream titles, VOD titles, dates, lengths, `Search`, and result count (`#vq-count`), and adds:

| String (example) | Where | Class |
|---|---|---|
| `ohnePixel` | Channel header (`#chan-name`), beside Back | name |
| `Newest`, `Most viewed` | Sort menu (`#sort`) | value |
| `All`, `Broadcasts`, `Highlights`, `Uploads` | Type menu (`#type`) | value |

## No visible text (signifiers only)

- Red avatar ring (`live`), dimmed grayscale avatar (`offline`), progress bar on started VODs, and blue new-since-last-visit dot (`.newdot`).
- Reload icon (`↻`), Back icon (`‹`), search magnifier, text size icons (`−`, `+`).
- Chat and History toggle switches.
- Disclosure chevrons on Playing and Chat/Twitch/History groups.

## Tooltips and accessible names (non-visible)

- Tooltips: `Quality`, `Reload`, `Show chat`, `Smaller text`, `Larger text`, `Text size`, `Record history`, `Back`, `Sort`, `Type`, `New`, plus full stream/VOD titles on rows.
- Accessible names on rows announce person name, live/offline state, viewers or age/length, title, and watched percentage/new state when applicable.
