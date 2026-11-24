# Brief: the plugin sidebar, restarted (2026-11-24)

**Written by** the IINA Streams lead, 24 November 2026, from [READING.md](READING.md) (my reading, signed). The operator's words are quoted as said; everything else here is mine. **What holds each requirement** is tagged:
- **[asked]:** the operator asked for it;
- **[principle]:** a project principle (PRODUCT.md) requires it;
- **[try]:** I propose it as a try;
- **[judgment]:** my judgment of what users who aren't here need.

## What it is for, and for whom

There is no single purpose sentence: each direction below has its own, and judges are asked to judge the purposes too. What is common: the panel is opened briefly, over the video on the left, and closed. The operator described it: "I click the plugin menu button, see all the different options, click it, switch, and then collapse the thing back again." [asked]

**Kinds of user** (PRODUCT.md §Users, condensed; these are the ones the critic gets):
- **daily viewer:** knows who they want; switches rather than opens more windows;
- **catch-up viewer:** a person's VODs, live or not, resumed across sittings, even weeks later;
- **background listener:** the least on screen;
- **stranger:** nothing to set up, works signed out, no history;
- **privacy-minded:** good order without feeling tracked;
- **technical:** depth out of everyone else's way;
- **keyboard and VoiceOver user:** everything reachable, state announced.

**Tensions** (PRODUCT.md):
- quick open versus browsing;
- little text versus being understood;
- familiar (Twitch) versus better ("go beyond the browser");
- signed in versus signed out.

## Fixed for every direction

### The operator's located faults (READING.md §1)
- The panel is on the left [asked].
- Search searches people, above them [asked].
- No label that repeats its icon; no reason text [asked].
- No chat here [asked].
- Quality is not always on screen [asked].
- No history or settings groups [asked].

### Text
Every visible string is one of:
- a **name** (a person, a broadcast title, a category);
- a **value** (viewers, length, age, quality);
- an **action** (on a control);
- an **error**.

Also:
- no headings unless the direction says so;
- no sentences;
- placeholder "Search";
- tooltips and accessible names carry the detail.

Source: the "Text on screen" rule in `.agents/skills/streams-interaction-design/SKILL.md` [principle]. List every visible string with its class in `STRINGS.md` in your folder.

### Switching
- Choosing a live person or a broadcast plays it and closes the panel (`U.play`, then the frame closes the panel). This is the operator's flow, minus their collapse step [try].
- The old picture keeps playing until the new one starts (the frame does this) [principle].

### Keyboard
- Tab reaches the search field.
- ↑ and ↓ move through rows, and Return acts.
- Escape clears the search, then closes the panel (`U.closePanel()`).
- ⌘F focuses search.
- Selection is visible.

Source: J10 [principle].

### VoiceOver
- Rows are buttons or listbox options.
- Each has an accessible name: person, live state, viewers or length, progress.

Source: J10 [principle].

### Width
- Works at 360 and at 300 (the frame's switch).
- Names ellipsize; nothing overlaps; there is no horizontal scroll.

Source: IINA's 300–500 pt range.

### States, by URL hash
Each direction says what each of these shows:
- `#signed-out`: no follows, only people from history;
- `#new`: no history and signed out; the snapshot stands in for Twitch's search results;
- `#many`: about 300 people, made by repeating the snapshot with a numeric suffix.

Source: PRODUCT.md floor, "everything works without signing in" [principle].

### Data
- `../shared/snapshot.js`: public Twitch data taken 2026-11-24 15:45, with local images.
- `../shared/viewer.js`: invented watch history and positions. One unfinished VOD is three weeks old, on purpose: "you watched them a long time ago… I want to go visit it again" [asked].
- `../shared/util.js`: formatting helpers.
- No network. No libraries or web fonts.

### Craft
- `../shared/base.css`: macOS dark system colours, source-list rows, the search field, avatars and progress bars.
- Apple's macOS conventions win over web habits. No cards with shadows, no gradients, no badges with words.

Source: AGENTS.md craft sources [principle].

### Files
Your folder holds:
- `index.html`, copied from `../shared/index-template.html` with your label;
- `panel.html`, `panel.css` and `panel.js`;
- `overlay.html`, only in direction S;
- `STRINGS.md`.

Do not edit `../shared/`.

## The directions

Folder letters are neutral on purpose. Which letter is which is in `KEY.md`, which judges don't get.

### Direction R
**Purpose:** get from what you're watching to the next person in one click, then get out of the way.
**Refuses:** headings, sections, thumbnails in the list, settings, anything that isn't a person.

**The list**
- **Search field** on top.
- **One scrolling list**, in this order:
  1. **The person playing now.** A 3 px accent bar at the row's leading edge. Quality appears as a value at the row's end ("1080p60"); clicking it opens a menu of `VIEWER.qualities`. This is the only place quality lives [asked: occasionally, not always on screen].
  2. **Live people,** in `VIEWER.rank` order. Each row has: an avatar with a red ring; the name; one meta line, "category · 36.7K". The title is in the tooltip and the accessible name.
  3. **A hairline,** with no heading. This is the live/offline split, done by weight, not words [try; asked: "a better way of splitting between live and offline"].
  4. **Offline people,** in rank order: a dimmed avatar, the name, and meta of last live as "2d".
- **Unfinished VODs:** a person who has one shows a thin accent arc around the avatar [try].
- **A row's chevron** appears on hover and when the row is selected; it opens that person's page. → also opens it.

**Acting on a row**
- **A live row** (click or Return) switches.
- **An offline row** opens the person's page.

**The person's page** replaces the list with a slide.
- **The top:**
  - a Back icon button (accessible name "Back", no visible word);
  - avatar and name;
  - "LIVE 2:20" when live, or last live otherwise.
- **The live broadcast first** when they are live.
- **Their broadcasts,** newest first, one row each:
  - the title on one line;
  - meta of length and age, "7:20:00 · 2d";
  - a progress bar if started.
- **No thumbnails** [try, against "not 100% sure of showing the thumbnails in this already overcrowded space"].
- **The search field** on this page searches this person's broadcast titles; the page's top shows whose they are.
- **No sort or filter;** they belong to the dashboard [try; asked was "filter or sort them" (07:06)]. This is the one place R overrides a request, on purpose. Say so in STRINGS.md.

**States**
- `#signed-out`: the same list, holding only history people.
- `#new`: the search field, focused, with live people from the snapshot under it. Offline people are left out. No heading.
- `#many`: the first 30 offline people, then a "Show All" action.

### Direction P
**Purpose:** keep up with your people over time: who's on now, what you missed, what you left unfinished.
**Refuses:** grouping by person, live and offline sections, settings.

**The layout**
- **Search field** on top.
- **"Now":** one horizontal row of live people. Each is a 40 px avatar with a red ring, with the name under it in 11 px. The current one is marked, the row scrolls sideways, and a click switches. No heading.
- **The timeline,** below. One chronological list of everything that happened with your people, newest first, marked by day as values ("Today", "Yesterday", "Sat 22", "Nov 3"):
  - their broadcasts, by broadcast date;
  - your own unfinished watching, on the day you watched it. So the three-week-old one is three weeks down: going back in time finds it [try].
- **Each timeline row:**
  - a 64×36 thumbnail with a small avatar at its corner;
  - the title on one line;
  - meta of person, length and age;
  - a progress bar under the thumbnail if started;
  - a small accent dot if it's new since your last visit to that person (`U.isNew`) [try].

**Acting**
- **A row** plays that VOD.
- **A person's name in a row** filters the timeline to that person. A chip appears under the search field, with an × to remove it.
- **Search** suggests matching people as chips. Choosing one filters the timeline.

**States**
- `#signed-out`: Now and the timeline from history people only.
- `#new`: the search field only, focused, with Now from the snapshot.
- `#many`: Now scrolls sideways, and the timeline is long. Show the first 60 rows, then load more on scroll.

### Direction T
**Purpose:** the panel is the stream you're in: this person, where you are in their broadcasts, and who else is on at a glance. This rethinks what the panel is for.
**Refuses:** being a directory of everyone; search as the main thing.

**The layout**
- **The top block,** the person playing now:
  - a large avatar;
  - the name;
  - "LIVE 2:20", category and viewers;
  - the title, at most two lines;
  - quality as a value popup at the block's end.

  **When a VOD is playing,** the block shows the VOD's title and a position bar. A small "LIVE" action appears if the person is live now.
- **Their broadcasts:** rows with a 96×54 thumbnail, title, length and age, and progress bars, newest first. This is where "where you are" lives [asked: continue watching, half-watched].
- **Pinned at the bottom: the strip.** One row of 32 px avatars:
  1. first, live people in rank order, with red rings; a click switches, and the panel becomes theirs;
  2. then, dimmed, offline people who have an unfinished VOD, each with a progress arc; a click opens their page in the panel without playing;
  3. at the strip's end, a magnifier icon button, which replaces the panel's content with people search; Escape returns.
- **Another person's page** looks like the top block plus broadcasts, without playing.

**States**
- `#signed-out`: the strip from history people only.
- `#new`: the top block and broadcasts for what's playing; the strip is the snapshot's live people.
- `#many`: the strip scrolls sideways; search covers the rest.

### Direction S
**Purpose:** switching costs a keystroke, over the picture, like ⌘-Tab. The panel is only for looking through one person's broadcasts.
**Refuses:** opening a panel to switch; lists of people in the panel.

**The switcher (`overlay.html`)**
- **Hidden** until Tab is pressed over the video. The frame forwards keys; the overlay posts `{type:"overlay-active", active:true}`.
- **A centred glass card,** with:
  - a search field at its top, filled by typing;
  - **row one:** live people as 56 px avatar tiles, with the name and viewers under each;
  - **row two:** unfinished VODs as 120×68 thumbnail tiles, each with a progress bar and its person's name.
- **The previous channel is preselected,** so Tab then Return goes back to the last channel, like ⌘-Tab [try].
- **Keys:** ← and → move; ↓ and ↑ change rows; Return plays; Escape closes. Typing filters both rows.

**The panel (`panel.html`)**
- It starts closed (`data-open="false"` on the frame script).
- It holds only the playing person's page: the top block as in T, then their broadcasts with search over their titles.

**Feasibility, marked on the page in the chrome only, not in the design:**
- IINA 1.5.1's plugin API has `input.onKeyDown(key, callback, priority)` (`JavascriptAPIInput.swift`). Whether a plugin's handler can stop IINA's own binding of the same key is unchecked.
- Whether Tab is free in IINA's default bindings is unchecked.
- The overlay is a web view that takes clicks only on elements marked clickable (`PluginOverlayView.swift`). Typed text would come through key listeners, not a focused field.

**States**
- `#signed-out` and `#new`: as R.
- `#many`: row one scrolls sideways.

### Direction Q
**Purpose:** the control. This is round 2 rebuilt at the same polish as the others.
- **Copy round 2's structure and strings exactly** from `../../finding-2026-11-22/plugin-sidebar/revised/index.html` (strings in its `DONE.md`), using this folder's shared data and `base.css`.
- **Don't fix anything:** keep its sections, headings, the Chat, Account and History groups, and the channel view with sort and filter. The point is to test whether polish alone changes the judgment.
- **States:** as round 2 had them, plus `#signed-out` if round 2 had it.

## What this brief does not settle
- Which direction. That's the operator's, in the morning.
- Native feasibility of S. Read from source, untested in IINA.
- Whether a click on a live person should open their page rather than switch. R and T disagree on purpose.
- The bigger dashboard (W-15) is not designed here.
