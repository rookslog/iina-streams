# Review protocol

How a branch is reviewed when review runs over more than one round: release reviews (`docs/reviews/`), and any multi-round review of a feature branch. Decision D-032 (`docs/DECISIONS.md`).

Sources:
- the operator's round-3 stop rule in chatgpt-cli (PR #57's systemic repair design);
- Anthropic's [How the Claude Code team does code review](https://claude.dev/blog/solving-code-review-at-anthropic/) (2026-10-15);
- the reviewer agent definition ("past 3 rounds, step back and reconsider the approach").

## Severity

The reviewer's labels are inputs. The lead gives each finding a disposition and a reason, recorded verbatim in the review file.

| Grade | What it covers | Effect |
|---|---|---|
| **Important** (P0/P1) | A security or privacy exposure, data loss, a crash or wedged player, or a regression against the last release | Blocks the release |
| **Medium** (P2), not a regression | A defect that the last release did not have worse | Issue on the next milestone, filed the same day; doesn't block |
| **Pre-existing** | Reproduced on the last release | Issue filed the same day; doesn't block this release |
| **Nit** | Style and readability | Optional |

## Rounds

1. **Rounds 1 and 2:** fix each accepted finding and review again.
2. **Step back at round 3, or earlier** when any finding belongs to a class that an earlier round already found. Point patches stop. The lead writes a recurrence triage (class × findings × rounds) into the review file.
3. **Repair each recurring class against written invariants** in a design doc.
   - A class-level falsifier comes first. It is a bounded exhaustive exploration, property tests, or a transition table, and it must fail on the known-bad commit without being told the reviewer's sequence. Then the repair.
   - The brief names the class and its invariants. The reviewer's probe becomes a regression example, never the test design.
4. **Clearance.** One review, seeded with the triage table and the prior reports, verifies the current source instead of inheriting earlier verdicts. There are **at most two** clearance reviews.
   - A recurring class that survives clearance goes to the operator as a decision: redesign, descope, or ship with the risk accepted.
5. **Record rounds-to-SHIP** in the review file's status row. The target is two or fewer.

## Prevention at the source

- **Write each class down.** Each recurring class becomes an entry under *Known classes* below. Where possible it also becomes a structural test or scan in `npm test`, so new code meets it before any reviewer does.
- **Give reviewers the list.** Their brief includes this file and the Known classes list.
- **Brief the class, not the probe.** A brief that fixes a review finding names the class and asks for every instance. A brief that only says to replay the reviewer's sequence is not a test design.

## Known classes

- **M: which window a global action acts on (#73, 2026-11-24).** Global has no active-player accessor in IINA 1.5.1 (`JavascriptAPIGlobal.swift`), so global code never decides which window is meant. A command about one window belongs to that window's controller, as a player menu item (IINA shows only the active player's items, `MenuController.swift:646`), or it waits for a screen that names the person. Origin: two review rounds on Forget This Channel.
- **C: cancellation scope (#73, 2026-11-24; reworded after the lead's round-3 check).** A late answer to a request the Open Stream form started acts only while *that same form instance is still showing*. One predicate expresses that, and every late answer uses it, live and offline. It covers an explicit cancel, the window's close button (IINA tells the plugin nothing when that's used: `PluginStandaloneWindow.swift:23`, `JavascriptAPIStandaloneWindow.swift:50`), a form the plugin closed after another submission opened, and a later instance. Separately, the draft counter (`openRun`) fences only updates to the form's contents, after an edit or a repeat submission. Opens from elsewhere (the sidebar) have no form instance and are independent. Tests are a table of the ways a form ends, not replays of a reviewer's probe.

- **L: controller authority across async boundaries.** Every timer, post-`await` continuation and listener in the player checks its activation. Losing authority is one-way, and a reload of the same source is a new activation. Origin: v0.5.5 rounds 1–6, 15 findings. Repair and falsifier: `docs/design/V055-CLASS-REPAIR-2026-11-22.md`, class L. **L5b (#64, 2026-11-24):** work that continues an ended activation (a late resolve, a promise continuation after a loss between jobs, a timer turn) also reads no mpv property and arms no timer. The explorer checks it, with a loss between promise jobs that is a close or a foreign file.
- **A: Auto chat timing.** Decisions use progress accumulated over samples, never a per-sample delta. The outcome must not depend on how often the player samples. Origin: v0.5.5 rounds 1–6, 7 findings. Repair: the same design doc, class A.
- **H: a host rule mirrored by guesswork.** A plugin check that mirrors an IINA rule takes its test table from IINA's source, with file and line cited, before any implementation. Origin: the clock's URL gate, v0.5.5 rounds 2–4.
