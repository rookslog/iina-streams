# Independent review of the two Open Stream mocks (2026-11-22)

Reviewer: a Claude Opus reviewer at high effort, independent of the designer, read-only. Lenses:
1. interaction design (`.agents/skills/streams-interaction-design`);
2. Impeccable critique, audit and detect;
3. fit inside IINA on macOS;
4. the brief's acceptance points.

Summary of its report, with the key observations kept exact.

**Recommendation:** a hybrid nobody has drawn yet. Keep A's one-line row, hairline, inline broadcasts and click-to-open, inside a frame whose **top edge never moves** while results change. Neither mock meets that condition.

**Findings:**
1. **BLOCKER, A.** The mock window grew from 213 to 269 px when Twitch rows landed, and shrank from 118 to 84 px on "zz" (observed, headless). IINA 1.5.1's `setFrame` keeps the old origin when x and y are omitted (`JavascriptAPIStandaloneWindow.swift:144-157`, read), and `global.js:300` omits them. AppKit's origin is bottom-left, so the title bar, field and selected row would jump when results arrive (inferred). Native test: note the title bar's position, trigger today's offline-broadcast list, and see whether it moves.
2. **MAJOR, B.** B isn't fixed-size: `b.js:141` drops to 84 px when nothing matches (observed). The same top-edge jump follows.
3. **MAJOR, both.** Duplicates and in-place updates aren't modelled. The rule should be: a remote duplicate of a local login is dropped, and fresher live data updates the local row's content, never its position.
4. **MAJOR, both.** Rows are rebuilt with `innerHTML` on every change. In B, a list scrolled 4 px reset to 0 when results arrived (observed). The rebuild also recreates the focused input. The build must patch rows in place, keep the scroll offset, and test a scrolled list.
5. **MAJOR, B.** The offline pane has no visible play control; a click only selects (`b.js:118-120`, `b.js:315`).
6. **MAJOR, B.** Headings and a LIVE pill restate state as text, against the operator's minimize-UI-text preference, and viewers are shown twice.
7. **MAJOR, both.** The sample data falls in viewer order outside the history group, so the build would inherit Twitch's ranking. The spec must name the remote order, and the samples must break viewer order.
8. **MINOR, A.** A second Tab strands focus outside the field, and ← at the end of the text collapses the broadcasts.
9. **MINOR, both:**
   - the selection colour is hard-coded, so it ignores the system accent and doesn't dim in an inactive window;
   - A's info button is 20 px and invisible until hover;
   - the hollow ring is faint in dark mode;
   - an option contains a button, and a separator and status sit inside the listbox.

**Detector:** Impeccable engine 0.1.27, source scans: 4 cramped-padding findings each, all on the mocks' own switches. URL scans at 1280×800, light and dark: 0 findings. The critique ran in a degraded single-context mode.

**Held up (observed):**
- the VoiceOver label carries the name and live state;
- the history order isn't by viewers;
- both mocks reach an offline match's broadcasts by Return, Tab and click;
- both use the system font, have light, dark and increased-contrast tokens, and handle reduced motion.

**Not checked:** anything in native IINA, VoiceOver output, `aria-description` in WKWebView, the 100 ms target, and all of `b.css`.

**Operator question:** should Open Stream stay one fixed size, with empty space when there are few matches, or hug its results, at the cost of a native fix that pins its top edge? Recorded in `docs/WAITING.md` as W-12.
