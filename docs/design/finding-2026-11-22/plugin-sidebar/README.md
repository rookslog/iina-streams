# The plugin sidebar as a mini dashboard: three low-fidelity structures (2026-11-23)

**Status:** structure only, for the operator to pick from in Safari. There is no styling effort and nothing is built. Task: [BRIEF.md](BRIEF.md), at commit `0466ca4`.

**Evidence level:** static HTML with sample data and no network. Nothing ran in IINA.

**Open them:**
- [structure-a/index.html](structure-a/index.html), **A: one list, like Twitch's sidebar**;
- [structure-b/index.html](structure-b/index.html), **B: what's playing first**;
- [structure-c/index.html](structure-c/index.html), **C: search and tabs, with what's playing at the bottom**.

Each page draws the panel at 360 pt, with a 300 pt switch, and its notes say what shows first and what sits behind a tap. A dashed outline marks what IINA draws: the tab strip and the collapse chevron.

**Shared pieces.** All three use the person row from Open Stream (`../open-stream/`, direction A), with no reason text and a › that opens VODs for live people too.
- Data: `../open-stream/sample-data.js`, plus a few invented VODs and half-watched VODs in [lowfi.js](lowfi.js).
- Plain styles: [lowfi.css](lowfi.css).

## Comparison

| | **A: one list** | **B: what's playing first** | **C: search and tabs** |
|---|---|---|---|
| First thing seen | One line for what's playing, the search field, then Live | The playing channel's card: title, quality, chat on/off | The search field, then the Live tab |
| Switch channel (task 1) | Live, ranked, with viewers, at the top of the list | "Channels", live first, under Continue watching | The Live tab |
| VODs (task 2) | › on any row | The top card's "This channel's VODs", › on any row, and Continue watching | The VODs tab (continue watching, this channel, your channels), plus › |
| Search (task 3) | Pinned under what's playing; it replaces the lists | In the scroll, under the top card; it replaces the lists | Pinned at the top; it replaces the tab |
| Quality (task 4) | Behind a tap on the playing line, with reload and this channel's VODs | Always shown in the top card | Always shown in the bottom strip, as a menu |
| Long list (task 5) | "Show more" in Live and Offline | "Show more" in Channels | Offline collapsed under Live; the tab scrolls |
| Chat controls | A closed Chat group at the end of the list | **Settings**, which swaps the panel's contents until Back | The … menu on the bottom strip |
| Account and history | A closed Twitch account group | **Settings** | The … menu |
| **Buys** | Closest to the reference the operator named; the fewest new ideas; one scroll | Answers "what am I watching and how is it set" at a glance; continue watching is prominent | The most to browse in 360 pt; a home for the categories idea |
| **Costs** | Chat and account sit at the bottom of a long list | Quality is always on screen, which the operator said isn't needed; the switch list starts lower | Three tabs to learn; the bottom strip and its menu are a second place to look |

**Candidates from the brief, and where each appears** (the operator strikes what they don't want):
- **continue watching:** B and C;
- **categories:** C only;
- **this channel's other VODs:** all three: A behind the tap on the playing line, B in the top card, C in the VODs tab;
- **chat on/off and settings:** all three, in different places;
- **account:** all three;
- **history controls:** all three.

## What all three leave open
- **The chat column.** When the chat column (D-028: chat beside the video, made by shrinking the picture) and this panel are both open on the right, the panel over the video would cover the chat. Beside the video, with IINA's Edge-to-Edge Video off, the picture would shrink for both. Unchecked in IINA; the structures don't change with it.
- **Search results.** These mocks show matches with local People first and Twitch search results after them, in one unlabelled list. The operator asked on Open Stream whether that split and its label should exist at all.
- **Sign-in placement.** It is a filled button wherever it appears (B's Settings, C's menu); in A it would sit in the account group.
- **Long lists.** The sample has only eight people, so scrolling is barely exercised.
- **Untested:** keyboard order beyond the browser defaults, and VoiceOver.
