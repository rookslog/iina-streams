# Departures from the design set

## Record

### 2026-11-24, #74 Open Stream page (Claude Opus 5.5, builder for the lead)
- **Line:** `starting-a-design`, "Make one small concrete thing early and show it."
- **Kind:** set aside this once.
- **Situation:** the operator was asleep and the lead delegated the whole page build (ui/open.html, open.js, open.css on feat/74-suggestions) with an independent design review and the lead's native check to follow.
- **Ground:** nobody could be shown a rough version mid-build. The captures in the lead's scratchpad (opus-74-page/) are the first thing anyone sees, so they stand in for the early showing, and nothing in the build is past undoing: three files, no git writes.
- **What would show it was wrong:** the operator's first look rejects something structural (the inline broadcasts, the default highlight, the empty-history glyph) that a five-minute rough look would have caught before the keyboard model was built around it.
