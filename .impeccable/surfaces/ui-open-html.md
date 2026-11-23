---
version: 1
slug: "ui-open-html"
primary_target: "ui/open.html"
related_targets: ["docs/design/finding-2026-11-22/open-stream/direction-a/index.html","docs/design/finding-2026-11-22/open-stream/direction-b/index.html"]
---

# Open Stream window and the person row

Shape brief, 2026-11-22. Source: `docs/design/finding-2026-11-22/open-stream/BRIEF.md`. Mocks: `docs/design/finding-2026-11-22/open-stream/direction-a/` and `direction-b/`. Every answer below comes from the brief, the spec (`docs/design/FINDING-AND-WATCHING-SPEC-2026-11-22.md` §2.1, §3, §2.5), D-034 (the Twitch data-source rule) and D-035 (the release mapping), both in `docs/DECISIONS.md`. The operator asked that only questions that can't be inferred be put to them, and none came up, so nothing here was confirmed in an interview. The operator confirms by picking a direction.

## 1. Job and audience
- **Mode:** Operate. The viewer is doing a task, and the tool should disappear into it.
- **Who arrives:**
  - (J-numbers are the approved journeys in `docs/design/USER-JOURNEYS-2026-11-22.md`.)
- J2, the daily viewer: knows who they want and types two letters;
  - J4, the catch-up viewer: their person is offline, and they want a VOD with chat replay;
  - J1, a stranger: has no history;
  - J10: anyone using only the keyboard or VoiceOver.
- **How they arrive:** ⌃⌘O, the sidebar's ＋, or an offline player handing its channel name over (today's offline-broadcast list, called B6c in the code; GitHub issue #32).

## 2. Outcome and proof
- **The task:** open the right person, or their VOD, in two to four keystrokes.
- **Success, in IINA:**
  - two letters show a ranked local list within about 100 ms;
  - Return opens the top match with chat;
  - remote rows never move the selected row;
  - VoiceOver reads each row's name, live state and position.
- **Product truth to show:**
  - the ranking is the viewer's own (frecency, pins), not Twitch's;
  - viewer counts are visible but never the sort key.

  The sample data puts a 1.2k-viewer person above a 31k-viewer one, so the second point shows.

## 3. Selected direction
The visual world is the existing Streams UI: the `ui/sidebar.css` and `ui/open.css` tokens, 13 px system font, 28 px rows, the busy ring, and the red live pill. This is an extension, so there is no world workshop and no DESIGN.md change. Two structures go to the operator:
- **A, Quick list:** today's 380 px window keeps growing one row at a time.
  - Each person is one 28 px line.
  - An offline person's broadcasts open inline under their row.
  - The local and remote groups are split by a hairline, with no heading.
  - The reason is behind an info button and in a tooltip.
- **B, List and detail:** a wider fixed frame (600 × 360) whose height changes once, not per row.
  - Each person is a two-line row on the left.
  - The selected person's detail shows on the right: the reason, the stream or the recent broadcasts.
  - The local and remote groups have small scope headings.

What the operator chooses between:
- density, one line or two;
- where broadcasts appear, inline or beside the list;
- whether the window grows or stays put;
- how the two groups are told apart, a divider or headings.

## 4. Scope and boundaries
- **Fidelity:** static HTML mocks with sample data and no network calls. Keyboard, remote arrival and states are scripted.
- **Untouched:** `ui/` code, IINA itself, global's message protocol, the URL parser (`src/source.js`).
- **Anti-goals:**
  - thumbnail grids and card stacks;
  - gradients, and glass used as decoration;
  - reworded state text, where a signifier can carry the state;
  - sorting by viewers;
  - any element that moves under the pointer.

## 5. States and ranges
- **Window states:**
  - empty field: top People;
  - empty field with no history: signed in, it shows follows; signed out, the field alone;
  - typing;
  - a pasted URL;
  - no match: still offers the typed name as a Twitch channel;
  - signed out;
  - no network connection;
  - a Twitch error.
- **Row states:** live, offline, loading (a skeleton), error (status unknown), keyboard-selected, pointer-hover, plus offline-expanded.
- **Ranges:**
  - names of 3–25 characters;
  - titles of up to 140 characters, always truncated;
  - viewer counts from 0 to 300k;
  - 0–8 local matches and 0–5 remote ones;
  - 0–10 broadcasts per person.

## 6. Interaction and layout
- **Focus:** the field keeps focus. It is a combobox driving a listbox through `aria-activedescendant`, and the top row is selected by default.
- **Keys:**
  - ↑↓ move the selection;
  - Return opens a live row with chat, or, on an offline row, moves into its broadcasts;
  - Escape clears the field, then closes the window;
  - Tab reaches the broadcast list, and Shift-Tab returns.
- **Remote rows** are only appended below the local group. Their slot is reserved while they load, and the selection and the row under the pointer never move.
- **Hover** shows a highlight. Nothing expands on hover.
- **Errors:** a short phrase and an icon in the remote slot. Local rows stay usable.

## 7. Constraints and open decisions
- **Platform:** a macOS IINA plugin web page in a native IINA window. Apple's macOS guidelines and IINA's look win over web taste.
- **Content Security Policy:** `default-src 'none'`. Avatars from Twitch need a CSP and `Info.json` change, so the mocks draw initials.
- **Data sources (D-034):** Helix (Twitch's documented API) first, then anonymous GQL (twitch.tv's internal interface). Signed out still gets live dots and remote search, through GQL.
- **Window size:** global sets the frame. A keeps today's 28 px-per-row growth; B needs a new fixed frame.
- **Shared row:** the person row is shared with the People screen (GitHub issue #76) and must stay one component.
- **Builders must not invent:**
  - what Return does on an offline row: these mocks move into its broadcasts, and opening the newest VOD at once is the alternative;
  - the reason strings, which must come from real §3 inputs.
