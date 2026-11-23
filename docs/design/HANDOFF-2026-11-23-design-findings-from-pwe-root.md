# Design findings for IINA Streams, from PWE root (2026-11-23T05:07Z)

Agent-written by PWE root (Claude Opus 5.5, Apollo pane wY:pGW). **Primary reader:** the IINA Streams lead. **Secondary:** an auditor; the sources are linked at the end. This file is yours to keep, edit or move.

## Why you have this
- **The complaint.** On 2026-11-22 the operator said IINA Streams' design output is still "atrocious", despite tap-n-filter's (TNF) book reading and guidelines. They asked root to do the diagnostic work first, then hand it over.
- **The decision (2026-11-23, ask W-272, option A).** Each project's session takes its own part; root takes the shared part, a home for the TNF design practice that sessions actually load.
- **The operator's words:** "Let's go with your recommendation for both."

## What root found for IINA (labels in each line)
- **Guidance was taken up in part (observed).** The lead read the TNF inheritance brief, and Claude sessions read the project skill 8 times on 11-22. The text pass used the principles' language.
  - The pointers predate the 11-22 UI work: the first `DESIGN-PRINCIPLES` string is in `8140312` (2026-11-07), and the project skill and critic agent were added on 11-09.
- **Codex (observed, with detector limits).** None of the 24 Codex rollouts had a recorded call matching a design-file path, though `AGENTS.md` names the skill. Not tested:
  - loads by glob, by tool output or by injected context;
  - image calls of the `function_call` form.

  So "Codex never read it" is **not** established; only "no recorded matching call" is.
- **Review (observed).** The overhaul designer rendered its mockups in headless Chrome, and its README says "No frame shows native IINA behaviour". The lead took 39 native screenshots from 11:53Z; the operator looked natively at 16:12 EST.
- **The gap (unchecked).** The operator still found prose status text. Whether the build they saw contained the text-pass commit is unchecked.
  - Signal `obs-20261122T200540-f44e5d` (`iina-streams/native-pass-without-user-task`): the hide-chat design passed "code matches design", and the operator said "not ideal at all... not intuitive". That is a lead for this join.
- **The rejected skills (observed).** `design-triage` and `design-craft` were called once each, at 2026-11-22T12:49Z, by an Opus 5.5 subagent. Both are now switched off user-wide (2026-11-23 02:17Z). Impeccable stays as approved for this project (WAITING W-10).
- **Root's earlier conclusion, withdrawn.** "Guidance not arriving" is withdrawn: a Codex cross-family review showed the joins between guidance, build and the page seen are incomplete.

## Your part: questions only IINA's records can answer
1. Which build did the operator see when they found the prose status text? Did it contain the text-pass commit?
2. Did the Codex builders read the design skill? Decode the rollout call and result records rather than matching strings.
3. Did the native acceptance checks (`.agents/skills/streams-native-acceptance`) run on that build?
4. With those answers, decide what the next design pass needs and record it in `docs/DECISIONS.md`.

## Where the TNF practice lives today (until root's shared home exists)
- **Principles:** `/Users/rookslog/Development/personal-work-ecosystem/local/2026-10-15-codex-campaign/TNF-LEAD-sol/pstack-trial/.audit/opus-design-work/DESIGN-PRINCIPLES.md`.
- **TNF repo:** `/Users/rookslog/Development/tap-n-filter`.
- **Skills:** `~/.agents/skills` (impeccable, apple-design-skill).

## Limits
- Don't change user-level settings (`~/.claude`) or shared skills; that is root's part.
- Record what you find in IINA's own records, and tell root in one line when you have answers to 1–3.
- This doesn't jump your queue: the operator's open items in `docs/WAITING.md` come first.

## Sources (PWE, Apollo)
- `/Users/rookslog/Development/personal-work-ecosystem/evidence/delegation/2026-11-22-harness-inventory/SYNTHESIS.md` §3 (corrected 2026-11-23)
- `/Users/rookslog/Development/personal-work-ecosystem/evidence/delegation/2026-11-22-harness-inventory/REPORT-C-design-situating.md` (IINA rows, §1c, explanation 2)
- `/Users/rookslog/Development/personal-work-ecosystem/evidence/delegation/2026-11-22-harness-inventory/REVIEW-D-codex.md` (findings 1, 8)
- `/Users/rookslog/Development/personal-work-ecosystem/evidence/delegation/2026-11-22-harness-inventory/DISPOSITION.md` (root's verdicts)
