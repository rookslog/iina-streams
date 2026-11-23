# Open Stream with suggestions, and the person row: two directions (2026-11-22)

**Terms.**
- J1, J2, J4 and J10 are approved user journeys (`docs/design/USER-JOURNEYS-2026-11-22.md`):
  - J1, a stranger with no history;
  - J2, the daily viewer who knows who they want;
  - J4, the catch-up viewer after a VOD;
  - J10, keyboard and VoiceOver use.
- D-034 is the decision in `docs/DECISIONS.md` that Twitch data comes from Helix (Twitch's documented API) first, and otherwise from GQL (twitch.tv's internal interface, called anonymously).
- "Spec" is `docs/design/FINDING-AND-WATCHING-SPEC-2026-11-22.md`.
- #-numbers are GitHub issues.

**Status:** a proposal for the operator to pick from. Nothing is approved or built. Base: `beta` at `4d3f7d6`. Task: [BRIEF.md](BRIEF.md), for #74 (suggestions as you type) and #76 (the People screen, which shares the row).

**Evidence level.** These are static HTML mocks with sample data ([sample-data.js](sample-data.js)), viewed in a browser. No frame shows native IINA. Under AGENTS.md's evidence hierarchy, every claim about how this behaves in IINA is a hypothesis until the lead's native check, including:
- window resizing;
- focus;
- VoiceOver output;
- the 100 ms target.

**Open them:**
- [direction-a/index.html](direction-a/index.html), **A: Quick list**;
- [direction-b/index.html](direction-b/index.html), **B: List and detail**.

Each page has three parts:
- a live window to type into, with switches for account, network and history;
- a gallery of every state;
- a sheet of the row's states, in light and dark.

`?theme=light` or `?theme=dark` forces the appearance. A dashed outline marks IINA's title bar. Ohnepixel is a real channel, used only as the brief's example; his titles, counts and history are invented. Every other name is a placeholder.

**Planning record:**
- the product context Impeccable reads is `PRODUCT.md`, at the repository root;
- the shape brief for this window is `.impeccable/surfaces/ui-open-html.md`.

## What both directions share
- **One ranking.** Local People come first, ranked by spec §3 (the ranking model). The sample order is:
  - people with history, by frecency (how often and how recently the viewer opened them);
  - then people known only from Twitch follows;
  - with no history at all, follows are ordered live first, then by newest follow. Twitch search results are appended below them, never interleaved.
  - The sample puts mira_plays (1.2K viewers) above kestrel_vt (31.2K), so viewers are visibly shown but never the sort key.
  - Twitch search uses Helix (Twitch's documented API) when signed in, and anonymous GQL (twitch.tv's internal interface) when signed out, per D-034.
- **Remote rows never move anything.** Their place is held while they load, and they only ever land below the local group. The selection is kept by identity, not by index. Use "Replay Twitch arrival" on either page to watch it happen.
- **Keyboard.** The field keeps focus as a combobox that drives a listbox (`aria-activedescendant`).
  - ↑↓ move; Return opens; Escape clears the field, then closes the window; Tab reaches an offline person's broadcasts.
  - Return on an offline person goes to their broadcasts rather than straight to the newest one. That is a choice for the operator (Decisions, below).
- **VoiceOver.** Each row's name reads as "name, live, N viewers, category", or "name, offline, last live …". Its position comes from `aria-posinset`/`aria-setsize`, and the reason is its description.
- **The person row** carries:
  - avatar or initial, with the live dot on it;
  - name and platform mark;
  - viewers when live;
  - title and category when live, or last live and newest broadcast when offline;
  - a reason on demand.

  States: live, offline, loading (a skeleton), error, selected and hover.
  - The error state, status unavailable, is a hollow ring, also used for live people while there is no network connection.
  - The live red and the busy ring are today's (`ui/sidebar.css`, `ui/open.css`).
- **No match** still offers the typed text as a Twitch channel, since today's parser already opens a bare name. A **pasted URL** shows one row with the parsed address, and no suggestions compete with it.
- **Signed out** shows the same local order minus people known only from Twitch follows (ohana_vee in the "oh" frames, sable_rr on the empty field). That is the spec's "signing in supplements, never degrades" invariant, made visible.
- **Avatars are initials.** Twitch avatars need the plugin's Content Security Policy (`default-src 'none'` in `ui/open.html`) and `Info.json` to allow Twitch's image host. Unchecked: whether IINA 1.5.1 honours that change.

## Comparison

| | **A: Quick list** | **B: List and detail** |
|---|---|---|
| Window | Today's 380 px width. Grows 28 px per row, downward, as `global.js` already does for broadcasts | 600 × 360, fixed. Two heights only: the field alone, as today, or the full frame |
| Row | One line, 28 px: name, mark, then category · title, then viewers or time since last live | Two lines, 44 px: name, mark and viewers; then category · title, or last live · newest broadcast |
| Offline broadcasts (J4) | Inline under the person, pushing later rows down. → and ← open and close them. They are options in the same list | In the right-hand pane, as their own list, which Tab or Return focuses |
| Why it's here | Tooltip, VoiceOver description, and an info button or ⌘I on the selected row | Tooltip and VoiceOver description. Shown as text in the pane once the row is selected |
| Local vs Twitch | A hairline, no heading | Small scope headings: "Your People" and "Twitch" |
| Pointer | A click opens (live) or expands (offline) | A click selects and the pane follows; a double-click or **Open** opens, as in a macOS list |
| **Buys** | The least change from today. The most people on screen in the least space. No new window size. Closest to Spotlight's quick-open feel for J2 (type two letters, Return) | The full title, reason and broadcasts without opening anything. The frame never resizes as results arrive. Apple's search guidance asks that scope be clear, and the headings do that. The pane is a natural home for the People screen's detail (#76) |
| **Costs** | The title is truncated hard at 380 px. Expanding an offline person moves the rows below it (never the selected one, never on hover). The reason needs an extra control (the info button). The window resizes on every result change, which is unverified for flicker in IINA | A new window size in `global.js`. Text in the scope headings, against the operator's minimize-ui-text preference. Two-line rows show fewer people. Real focus moves into the pane, so VoiceOver must follow a second listbox (untested). Click-to-select adds a step for pointer users |
| Journeys it serves best | J2 (the daily viewer), J10 (keyboard: one list, one focus) | J4 (the catch-up viewer), J1 (a stranger, who learns from the detail) |

## Coverage of the brief

| The brief asks for | A | B |
|---|---|---|
| Row states: live, offline, loading, error, selected, hover | Row sheet, gallery | Row sheet, gallery ("Row error" frame) |
| Empty field (top People) | Frame 1 | Frame 1 |
| No history yet (not in the brief; J1 needs it) | Frames 2, 3 (signed in: follows; signed out: field alone) | Frames 2, 3 |
| Typing, remote pending and arrived | Frames 4, 5 | Frames 4, 5 |
| An offline match's broadcasts; loading | Frames 6, 7 | Frames 6, 7 |
| Paste a URL | Frame 8 | Frame 8 |
| No match | Frame 9 | Frame 9 |
| Signed out | Frame 10 | Frame 10 |
| No network connection | Frame 11 | Frame 11 |
| Twitch error | Frame 12 | Frame 12 |
| Reason on demand | Frame 13 | Every frame's pane |
| Keyboard and VoiceOver (J10) | Live window, keys table | Live window, keys table |

## Detector

The detector ran through the project install (`.claude/skills/impeccable/scripts/impeccable detect`, Impeccable 4.10.0). `npx impeccable detect`, the command the task named, was not run: it was invoked with `--no-install`, the package is not installed, and I didn't let npx download it.

**URL scans of the rendered pages** (local server; both directions; dark and light; 1280 and 390 px wide). The first pass found these, and all are fixed:
- the field placeholder at 3.2:1;
- white initials on mid-tone avatars, at 2.9–3.2:1;
- secondary text on the selection colour, at 4.2:1;
- light secondary text, at 4.3:1;
- the LIVE label at 10.5 px;
- A's em dashes used as row separators, now "·" as in B;
- line length and stragglers in the page prose.

After the fixes, all eight scans (2 directions × 2 appearances × 2 widths) report 0 findings.

**The static file scan** reports 8 "cramped padding" findings, all on the page's own Auto/Light/Dark and switch controls. These are dismissed:
- they are mock chrome, not the product;
- a segmented control's segments fill their border by design;
- the rendered scan of the same elements reports nothing.

## Decisions for the operator

**1. Which direction becomes the Open Stream window.** This is yours because it trades your minimize-ui-text preference and a familiar window against showing more per person. It also sets the row that the People screen (#76) inherits.

| Option | Buys | Costs |
|---|---|---|
| **A: Quick list** | Least change from today; fastest J2 | Hard-truncated titles; the window resizes per row |
| **B: List and detail** | Full title, reason and broadcasts visible; a fixed frame | New window size; heading text; fewer people on screen |
| **Defer** until the People screen is designed | One decision for both screens | #74 waits, and 0.5.6 ships without suggestions |

- **The designer's pick is A.** J2, typing two letters and pressing Return, is the daily path, and A changes the least in IINA.
- **What it rests on:** the per-row window resizing is smooth in IINA.
- **What would flip it:** flicker when the existing broadcast list grows (`global.js`, `setFrame`), which the lead can check natively. Then pick B.

This is the designer's lean, not a review; an independent reviewer judges the mocks next.

**2. What Return does on an offline person.** This is yours because it sets J4's speed against seeing the choice.

| Option | Buys | Costs |
|---|---|---|
| **Go to their broadcasts** (both mocks) | The viewer sees which broadcast plays | One more key |
| **Play the newest broadcast** | One key fewer for J4 | A wrong pick when the newest isn't the one wanted |

- **Pick:** go to the broadcasts.
- **What it rests on:** catch-up viewers often want something other than the newest broadcast.
- **What would flip it:** watch history (#73) showing the newest is opened most of the time.

## Not done or not checked
- Nothing was run in IINA. Untested there:
  - focus, VoiceOver, resizing and timing;
  - hover inside a standalone window.
- **YouTube people.** No live status exists yet (spike #39), so no YouTube row is drawn. Only its mark is defined.
- **Reason strings** are invented examples. The real ones must come from §3's inputs.
- **No independent review yet.** That needs `critique` and `audit` by a reviewer who didn't design these, plus `.agents/skills/streams-interaction-design/SKILL.md` (spec §7).
