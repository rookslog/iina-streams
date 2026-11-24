Method: dual-agent (A: design review, an isolated Opus 5.5 reviewer · B: detector and browser evidence, an isolated Sonnet 5.5 agent)

# Independent critique: the plugin sidebar's mini dashboard, round 2 (2026-11-23)

**Target:** `revised/index.html` at commit a0c2a7f: the list, `#channel` and `#offline`, judged as the 360 pt panel only. The mock is unchanged at 0899838, and line numbers below are as of a0c2a7f. It is a static, low-fidelity mock:
- the design review judged structure, hierarchy, grouping, text and density, not colour or polish;
- the detector's contrast and size findings are reported in problem 8, for the real-fidelity round.

**Impeccable score:** 22/40 (Acceptable).

## Verdict
The structure answers round 2's asks and keeps the text rule, but it needs a structural pass before a real-fidelity round: the panel loses track of what's playing, switching to a live channel takes two clicks, and no empty, finished or failed states are drawn.

## Problems, most severe first
Labels: *observed* means seen in the rendered page; *read* means read in source; *inferred* means reasoned. Problems 2 and 5 follow the brief's own instructions. They are ranked as problems because the panel fails the viewer there, whoever chose it.

### 1. [P1] The channel you're watching has no home in the panel
- **The viewer is trying to:** see what's on, change quality (task 4), or browse this channel's other VODs (task 2).
- **What fails:**
  - The playing channel is left out of Live (read: `lowfi.js:107` filters it out).
  - Clicking the playing line opens only the quality menu and Reload, not the channel (observed).
  - So the only way to reach the current channel's VODs is to type its name into search.
  - Once any channel view is open, the playing line is gone, and with it what's playing and quality (observed).
  - On the playing channel's own view, the live card offers to switch to the stream already playing (observed; `index.html:204`).
- **What to change:**
  - Make the playing line's name open the current channel's view, and leave quality and Reload where they are.
  - Keep a compact playing line pinned in the channel view too.
  - On the playing channel, give the live card a "playing" state instead of a switch action.
- **Why it ranks above problem 2:** it breaks two tasks and the panel's sense of state, and its fix needs no decision from the operator. Problem 2 adds a click to the main task but stays within the brief's two-action bar, and its fix waits on reading the operator's words.

### 2. [P1, structure the brief asked for] Switching to a live channel takes two clicks, and moving from one channel to another takes three
- **The viewer is trying to:** switch to another live channel and close the panel (task 1, the panel's main job).
- **What fails:**
  - Clicking a live person opens their channel view. Playback switches only on a second click, on the live card (observed).
  - From inside a channel view, reaching another channel takes Back, the row, then the live card. Typing another channel's name there searches this channel's VODs and finds nothing (observed).
  - The operator's own account of the job is one click: "click it, switch, and then collapse the thing back again" (`BRIEF.md:7`). PRODUCT.md's redrafted §Users quotes them: "I just want to switch to this person."
  - Their round-2 words are "if I clicked on it, it would switch and load up… information about their channel" (`BRIEF.md:66`). The brief read that as opening the channel view only (`BRIEF.md:71`); a reading where one click switches playback *and* shows the channel fits them as well (inferred).
- **What to change:**
  - Settle the reading with the operator (see the first question below).
  - If one click should switch, make a live person's row switch playback and open their channel view together, and drop the live card's switch action.
  - Either way, let the channel view's search reach channels as well as this channel's VODs, or give it a way back to channel search without Back.

### 3. [P1] Empty and no-match states are blank, and the search count sits under the clear button
- **The viewer is trying to:** search for a channel, or for a VOD within a channel (task 3).
- **What fails:**
  - No match in either search, or a type filter that leaves nothing (Highlights on a channel with none), draws an empty card sliver (observed).
  - The result count ("6", "0") is pinned at the field's right edge, under the native clear "×" (design review, observed on zoom; not rechecked in synthesis). It also repeats the length of the list below it.
  - Nothing tells "Twitch search still loading" apart from "no such channel". There is no state for a failed VOD load, or for being signed out (read: none drawn).
  - A channel with no VODs (lumen_ash) would show an empty card (read; not opened).
- **What to change:**
  - Drop the count.
  - Show "No match", which is an error string the text rule allows.
  - Show a spinner while the remote part of a search is pending.
  - When a filter empties the list, make the type menu read as non-default, so the cause is visible.

### 4. [P1] Continue watching loses whose VOD it is
- **The viewer is trying to:** resume a VOD they started (task 2, the catch-up viewer J4).
- **What fails:**
  - The channel name and the VOD title share one truncating line. At 360 pt it already reads "ohayo_…" (observed, list screenshot); at 300 pt it reads "Ohnep…" (design review, observed).
  - The date shown is the broadcast date, but the rows are ordered by when you last watched. The dates read as unsorted: Nov 21, 13, 20, 10 (observed).
  - The four thumbnail rows are the heaviest block in the panel, and they outweigh the live dots below (observed). The brief put Continue watching first, so the order is right; the trouble is its weight.
- **What to change:**
  - Put the title on line 1 and "name · date" on line 2, truncating only the title.
  - Lighten the rows (smaller thumbnails, or fewer rows shown), so that the live dots, not the thumbnails, draw the eye.

### 5. [P2, placement the brief asked for] Chat on/off sits at the bottom of a scrolling list
- **The viewer is trying to:** turn chat on or off, or move it beside or over the video, quickly.
- **What fails:**
  - Chat, Twitch and History come after every channel. At 360 pt, History is already below the fold (observed, list screenshot), and Show more under Offline pushes Chat further down.
  - Apple's macOS sidebar guidance says to avoid putting critical information or actions at the bottom of a sidebar, since windows are often moved so that the bottom edge is hidden (apple-design-skill, `sidebars.md` §macOS).
- **What to change:** decide whether chat on/off is a quick action. If it is, give it a fixed place that doesn't scroll, such as the playing line's row, the overlay or the Streams menu, and leave the rarer settings (text size, import, account, history) at the end.

### 6. [P2] In the channel view, search, sort and type sit above a card they don't affect
- **The viewer is trying to:** search, sort or filter one channel's VODs (round 2 item 3).
- **What fails:** the three controls sit above the live card, and the live card survives every search and filter (observed).
- **What to change:** put the live card directly under the channel's header, with search, sort and type in the VOD list's own header.

### 7. [P2] Progress and "new" marks contradict the brief or each other
- **The viewer is trying to:** find an older VOD they started (task 2).
- **What fails:**
  - A finished VOD shows no bar (read: `index.html:126` draws one only below 100%; observed on "Inventory review with chat"). So a finished VOD looks like one never started, although the brief says "Every VOD you've started shows its progress bar" (`BRIEF.md:73`). Only Continue watching is meant to drop finished VODs (`BRIEF.md:70`).
  - "Major day 3 watch party" shows both the blue "new" dot and an 18% bar (observed, channel screenshot).
  - "Most viewed" reorders rows by a number the rows don't show (observed).
- **What to change:**
  - Draw a full bar for finished VODs.
  - Drop the new dot once a VOD is started.
  - Show views while sorted by views, or drop that sort (see the second question below).

### 8. [P2] The keyboard path loses your place (J10)
- **The viewer is trying to:** switch channel by keyboard alone (J10).
- **What fails:**
  - Back and Escape return focus to the list's search field, not to the row you opened (observed; `index.html:221`).
  - "Show more" removes itself, and focus drops to the page (observed; `index.html:172`).
  - There are no arrow keys between rows. It takes 7 Tab presses to reach the first live channel (observed).
  - Beside/Over are `role="radio"` buttons without arrow-key behaviour (read).
- **What to change:**
  - Return focus to the row you came from.
  - After Show more, move focus to the first new row.
  - Give each list one tab stop, with arrow keys inside it.

### 9. [P3] The smallest marks are too small to read over video
- **The viewer is trying to:** read length and live state at a glance.
- **What fails:**
  - VOD lengths are 9.5 px: 4 in the list, 6 in the channel view (detector).
  - The LIVE pill is 10.5 px, white on #ff4a4a at 3.3:1 (detector).
  - The disclosure triangles before the playing line and the groups are 10 px and read as dots (design review, observed; visible in the list screenshot).
- **What to change:** in the real-fidelity round, use macOS's own small sizes and a system red for the badge, and draw a disclosure triangle that reads as one.
- **Not adopted from the detector, as web taste in conflict with native fit:**
  - search placeholder contrast of 2.5:1 (macOS draws a search field's placeholder in a deliberately quiet tertiary colour);
  - "flat type hierarchy" (13/15/17 px; macOS separates levels by weight more than size).

## Questions for the brief, not the build
Each needs the lead, or the operator, to settle it.
- **Does one click on a live person switch playback?** The answer decides problem 2's fix.
- **Does "Most viewed" break Product Principle 3?** The principle reads "Viewer counts are shown, never used as a sort key" (`PRODUCT.md` §Product Principles). Is a sort of VODs by views, chosen by the viewer, an exception? The answer decides part of problem 7's fix.

## Smaller points
- **Two search fields, one placeholder:** both say "Search", but one searches channels and the other this channel's VODs (design review, read at `index.html:24` and `:65`).
- **The Live and Offline headings** repeat what the live dot and its absence already say (design review; a candidate cut under the text rule, not a defect).
- **"14"** for chat text size has no unit, and its meaning is only in a tooltip.
- **"Import…"** doesn't say what it imports.
- **"Forget Ohnepixel"** acts with no confirmation, while "Delete all…" signals one.
- **Turning chat off** leaves Beside/Over and text size enabled (design review, observed).
- **Short VOD lengths** pad an hour, as in "0:01:34" and "0:21:00".
- **The Chat and History switches** render as web checkboxes. The real build should pick one native control and use it in both places.
- **Known review classes** (`docs/REVIEW.md` §Known classes): no instance found. Whether IINA delivers Escape to the plugin panel's page, rather than to the player, is unchecked natively.

## What works
- **Text discipline holds.** Every visible string is a name, value, action or error. There is no reason text and no status sentence anywhere in the panel. The design review derived the string list from the render itself, not from `DONE.md`.
- **Progress as a signifier.** The thumbnail bar carries resume state without words. Continue watching keeps a VOD last watched 9 days ago, so the "no age cutoff" rule shows.
- **Escape is layered, and 300 pt holds.** Escape clears the field first, then goes Back. Both views keep their layout at 300 pt, apart from problem 4's truncation.

## Provenance
- **Separate sub-agents: yes.** Assessment A (the design review) and Assessment B (the detector and browser evidence) ran in parallel as two isolated agents, and neither saw the other's output. Models are as requested; served effort isn't attested.
  - B's report was read only after A had returned.
  - B's one-line hand-back, which arrived first, carried the overlay counts (6, 9, 6) but no findings.
- **Browser inspection: yes, in Chrome.** IINA and Safari render with WebKit, so WebKit rendering is unchecked.
  - **A** worked in its own tab with real clicks, keys and 22 Tab presses, across the list, `#channel`, `#offline`, search, Show more, the playing line, Back, Escape and the 300 pt switch.
    - It opened the Twitch and History groups, and set Sort and Type, by script rather than through the native menus.
    - It never saw "Show more" under Live, because the sample has only 2 live people.
  - **B** ran:
    - the file scan, which found 1 finding;
    - URL scans at 1000×800 of all three views (7, 10 and 6 findings) and at 390×844 of the list;
    - `impeccable shot` screenshots;
    - the live overlay, injected on all three views. The console reported 6, 9 and 6 anti-patterns: one fewer than the URL scan on the list and channel views, and the same on offline (unresolved).
  - In synthesis, the list and channel screenshots were checked against A's visual claims, and the claims behind problems 1, 2, 4, 6 and 7 against the source.
  - Nothing ran in IINA, and VoiceOver wasn't used.
- **Context Impeccable read:**
  - `impeccable context` loaded `PRODUCT.md`.
  - A read the critique rubric, `BRIEF.md`, the interaction skill including "Text on screen", `PRODUCT.md`, the Apple guidance it needed (sidebars and disclosure controls among others) and `docs/REVIEW.md`.
  - `DONE.md` and `README.md` were not given to A as truth.
- **Context looked for and lacking:**
  - **No `DESIGN.md`:** Impeccable reported no visual world to judge against.
  - **No surface brief for this panel:** the only one, in `.impeccable/surfaces/`, is Open Stream's. I didn't register one, because a surface brief records design intent, and writing it is a designer's `shape` step, not a critic's.
  - **The operator's taste**, beyond two sources:
    - `BRIEF.md`'s quotations;
    - `PRODUCT.md` §Users, which was redrafted from the operator's words during this run (commit 0899838) and is unconfirmed by them.
  - **The operator's reaction to round 2** (WAITING W-17) was deliberately kept from both assessments and from the synthesis, to keep this read independent.
- **What weakened the critique:**
  - **No native guidance loaded.** `PRODUCT.md` records the platform as `web`, so Impeccable loaded no native-platform guidance. Its detector applies web rules, two of which conflicted with native fit (problem 9).
  - **PRODUCT.md changed mid-run.** Commit 0899838 redrafted §Users during the run. A's line citations match the new file, so it probably read that version (inferred).
  - **The design hook reports itself two ways:** `hooks status` says enabled, while `impeccable context` says no hook is active this session. `.impeccable/config.json` is absent. Impeccable's own setup-drift check reported one item (build path unset), which has no bearing on a critique.
  - **Not signed in to an Impeccable account:** the snapshot was saved locally only, at `.impeccable/critique/2026-11-23T07-35-25Z__6-11-22-plugin-sidebar-revised-index-html-9e4621a1.md`.
    - It records A's scores and A's six priority issues.
    - This file's ranking supersedes it. Problems 2 and 5 were added in synthesis, so this file has four P1s where the snapshot has three.
    - It is the first run for this target, so there is no score trend.
  - **Detector limits:** it reads markup and CSS, so it can't judge the strip IINA draws or anything IINA does.
  - **Live server leftovers:** the live server created empty `.impeccable/live/` folders, which were removed after the run.
