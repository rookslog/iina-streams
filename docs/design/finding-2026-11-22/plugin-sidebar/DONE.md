# Done: plugin sidebar, round 2 (2026-11-23)

Task: [BRIEF.md](BRIEF.md) §Round 2, at commit `d3c3c20`. Low fidelity, sample data, no network. Not run in IINA, not committed, not reviewed.

## Files
- `revised/index.html`: **the revised structure**. Add `#channel` or `#offline` to the URL to open on a live or an offline channel's view.
- `revised/revised.css`: the round-2 additions to `lowfi.css` (VOD rows with a 16:9 thumbnail, the channel view).
- `lowfi.css`: the IINA strip is redrawn as the plugin panel's own strip: one puzzle-piece tab per plugin, and the collapse chevron, dashed because IINA draws it. Whether IINA captions those tabs is unchecked.
- `structure-a/`, `structure-b/`, `structure-c/` `index.html`: round 1, with only the strip fixed. Their text is round 1's and isn't revised.
- `lowfi.js`: unchanged, apart from round-1 helpers the revised page reuses (search, people order, the width switch).
- `README.md`: round-1 comparison, plus a pointer to the revision.

## Every visible string on the revised panel, with its class
Classes are from `.agents/skills/streams-interaction-design/SKILL.md`, "Text on screen". The page's notes column beside the panel is mock chrome and isn't listed. Tooltips appear only on hover, so they are listed separately.

**List view**

| String (example) | Where | Class |
|---|---|---|
| LIVE | Playing line; live card in the channel view | value (live state) |
| Ohnepixel, mira_plays, … | Playing line, person rows, Continue watching | name |
| 12.3K, 1.2K | Playing line, live person rows | value (viewers) |
| 1080p60, 720p60, 480p, Audio only | Quality menu, behind the playing line | value |
| Search | Field placeholder | action |
| 3 | Field, while typing: result count | value |
| Continue watching | Section heading | name |
| Live | Section heading | name |
| Offline | Section heading | name |
| Major day 3 watch party | VOD title | name |
| Nov 21 | VOD date | value |
| 5:56:40 | VOD length, on the thumbnail | value |
| Counter-Strike | Category, in a live person row | name |
| Opening cases until… | Stream title, in a live person row | name |
| Sunday cozy stream… | Newest VOD title, in an offline person row | name |
| 2d, 3w | Offline person row: time since last live | value |
| Show more | Under Live and Offline | action |
| Chat | Group heading | name |
| Beside, Over | Chat placement | value |
| 14 | Chat text size | value |
| Import… | Chat group | action |
| Twitch | Group heading | name |
| you_handle | Twitch group | name |
| Sign out | Twitch group | action |
| Sign in with Twitch | Twitch group, when signed out (not drawn in this mock) | action |
| History | Group heading | name |
| Forget Ohnepixel | History group | action |
| Delete all… | History group | action |

**Channel view.** It repeats LIVE, names, viewers, VOD titles, dates, lengths, Search and the count, and adds:

| String | Where | Class |
|---|---|---|
| Ohnepixel | Header, beside Back | name |
| Newest, Most viewed | Sort menu | value |
| All, Broadcasts, Highlights, Uploads | Type menu | value |

**No text, signifier only:**
- live dot, progress bar, and the blue new-since-last-visit dot;
- the ↻ reload icon, the ‹ back icon, and − and + for text size;
- the chat and history switches;
- the disclosure arrows.

**Tooltips, on hover only:** Reload, Back, Quality, Show chat, Record history, Smaller text, Larger text, Text size, Sort, Type, New.

**Cut from round 1:**
- labels that repeated their controls: "Reload stream", "Quality", "Show chat", "Chat settings / Open…", "Import archive / Choose…", "Pause watch history", "Forget this channel";
- status text: "Signed in as…", "No recent broadcasts", "No match", "Source" after the viewer count;
- the heading "This channel's VODs".
- A channel with no VODs, or a search with no match, now shows an empty list. While searching, the field's count shows 0.

## Not checked
- Keyboard order and VoiceOver beyond browser defaults. Rows, Back and the menus are native buttons and selects; Escape goes back.
- The data behind the mock is the brief's data notes, all unchecked against a live Twitch response:
  - thumbnails;
  - sort and type;
  - local title search;
  - stored progress, which needs resume (#78).
