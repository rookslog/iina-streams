# Design brief: Open Stream with suggestions, and the person row (2026-11-22)

**Decided by:** D-034 (Twitch data-source rule) and D-035 (release mapping: this ships in 0.5.6 as #74, built on watch history, #73). **Spec:** `docs/design/FINDING-AND-WATCHING-SPEC-2026-11-22.md` §2.1 (this window), §3 (ranking), §2.5 (history controls).

## Who and when
- **J2, the daily viewer:** knows who they want, for example Ohnepixel. They type "o" or "oh" and Ohnepixel is first if they watch him most. Return opens it with chat.
- **J4, the catch-up viewer:** the person is offline. Recent broadcasts appear in place (this exists today, `ui/open.js`), and one click opens a VOD with chat replay.
- **J1, a stranger:** has no history yet. Suggestions come from Twitch search when signed in, or from Twitch's internal search when signed out (D-034).
- **J10:** everything works by keyboard and VoiceOver.

## What exists
- A standalone Open Stream window (`ui/open.html`, `ui/open.css`, `ui/open.js`; opened from `global.js`).
- Its current layout: a text field, then the offline-VOD list (see the operator's screenshot in #67).
- The operator's preference (memory `minimize-ui-text`): show state with signifiers (live dot, spinner, icon), not reworded text. Text is for names, values, actions and errors.

## Two deliverables
1. **The person row,** shared with the future People screen (#76) so the two never diverge:
   - avatar or initial;
   - display name;
   - platform mark;
   - live dot;
   - viewers when live;
   - title and category when live, or "last live" and newest VOD when offline;
   - a "why it's here" reason, available on demand rather than always shown.

   States: live, offline, loading, error, keyboard-selected, pointer-hover.
2. **The Open Stream window with suggestions:**
   - local matches first, ranked by §3;
   - remote matches arrive below them, without reordering the row under the pointer or the keyboard selection;
   - paste a URL as today;
   - an offline match expands to its recent broadcasts.

   States: empty field (top People), typing, no match, signed out, offline network, Twitch error.

## Constraints
- **It lives inside IINA:** a plugin web page in a native macOS window. Apple's macOS guidelines and IINA's look win over web taste. Use the system font and native-feeling controls; no gradients, no card stacks.
- **No sponsored ordering.** Viewers are shown, never the sort key.
- **Keyboard:** ↑↓ moves, Return opens, Escape clears then closes, Tab reaches the VOD list. VoiceOver announces the name, the live state and the row's position.

## Process (D-035 design process, spec §7)
- Two HTML mock directions, each in its own folder under this directory (`direction-a/`, `direction-b/`), plus a short README. Use static sample data, with no network calls.
- **With Impeccable** (a fresh session in this repo sees it): `shape` first; then `npx impeccable detect` on the mocks.
- An independent reviewer (`critique`, `audit`, plus `.agents/skills/streams-interaction-design/SKILL.md`). The designer never reviews their own mock.
- The operator picks one direction. Then tests first (#73, #74), the build, and a check in native IINA.

## What counts as working (in IINA, not a browser)
In IINA's Open Stream window:
- typing two letters shows a ranked list within about 100 ms from local history;
- Return opens the top match with chat;
- remote results never move the selected row;
- VoiceOver reads each row's name and live state.
