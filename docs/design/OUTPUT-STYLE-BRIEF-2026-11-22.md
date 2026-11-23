# Brief: review the scan-first output style and propose a change (2026-11-22)

You are an Opus session at xhigh effort, with a Fable advisor (global `advisorModel`). The operator asked for this session. **Research and a proposal only:**
- Don't change `~/.claude/settings.json`, `~/.claude/output-styles/`, or any project's active settings.
- You may write the proposal and draft files named below, and file signals through the signal skill's CLI.

## The problem, in the operator's words (2026-11-22, IINA Streams session)

> "This has probably happened 12 times tonight and, like, 40 times in the past week where I get frustrated because you're saying 'still yours' and I have no idea what you're talking about. And I need more context, but at the same time, I don't want you to be just outputting the same tokens over and over and over again."

> "When I lose context and I need to be onboarded again… the inability to easily resituate myself within the decisions, the assumptions, the direction, where the project is at, and what the current status of it is, is so unbelievably frustrating."

**The pattern behind it:** replies ended with lists of coined labels ("the 3-hour soak", "#57", "the tag", "clearance 2", agent names), repeated every turn, with no gloss or link. A memory note written that afternoon to stop this (`~/.claude/projects/-Users-rookslog-Development-iina-streams/memory/contextualize-status-points.md`) didn't stop it.

## Read

- **The style:** `~/.claude/output-styles/scan-first.md`. It is active globally (`outputStyle` in `~/.claude/settings.json`).
- **Global rules it says it composes with:** `~/.claude/CLAUDE.md` and its includes: claims-discipline, decision-presentation, link-what-you-cite, propagation, cite-your-warrant.
- **Signals:** `~/.claude/observability/*.jsonl`, through the signal CLI (`python3 ~/Projects/signal-layer/signal/signal.py show --themes`, and `rg`). Start with these signatures, then find others:
  - `pwe/bare-labels-for-open-items`, especially `obs-20261109T192212-a2f910` and `obs-20261123T001411-acfcc3`;
  - `shared/situatedness-poverty`;
  - `personal-work-ecosystem/situation-map-built-not-used`.
- **Today's IINA Streams session transcript:** `~/.claude/projects/-Users-rookslog-Development-iina-streams/4aa00c72-182b-4323-9888-04796f3ca308.jsonl`. It is large: search it for the operator's messages and the replies they answered. Don't read it whole.
- **The trial waiting file** created in response: `/Users/rookslog/Development/iina-streams/docs/WAITING.md`.
- **The second project in scope:** `/Users/rookslog/Development/sonic-affinity-lab`. Read its CLAUDE.md/AGENTS.md and find its signals.

## Answer

1. **What in scan-first is good and should stay,** and which clauses produce the harm. Trace each harm to signals or transcript instances, with ids or line references, and label each claim as observed or inferred.
2. **Style, habit or infrastructure?** Separate what a style can fix (per-reply shape) from what it can't, such as re-situating an operator who has been away, or decisions written once and reused. For the second, say what infrastructure would.
3. **Audiences.**
   - Does a subagent or teammate load the parent's output style? Check the Claude Code docs, and cite them.
   - Propose separately: (a) operator-facing chat, (b) agent-to-agent briefs and returns, (c) durable docs.
4. **Adapting to the reader:** how much reasoning and background to show, for an operator who is sometimes deep in one project and sometimes switching between several.
5. **A project-local trial.** Exactly how to apply a modified style to only `iina-streams` and `sonic-affinity-lab`, using a project `.claude/output-styles/` file plus a project `settings.json` `outputStyle`; check that Claude Code supports this, and cite it. Draft the style file(s), but don't activate them.
6. **For PWE root:** a short section on the larger idea: a dashboard or plugin showing what's waiting on the operator, with expandable context, links between items, and a trace of why each decision was made. Propose; don't build.

## Deliver

- **The proposal:** `/Users/rookslog/Development/iina-streams/docs/design/OUTPUT-STYLE-PROPOSAL-2026-11-22.md`. Put any decision the operator must make in the five-point form from `~/.claude/decision-presentation.md`.
- **Draft style file(s), not activated:** `/Users/rookslog/Development/iina-streams/docs/design/output-style-drafts/`.
- **Writing:** follow your own proposal. Don't use a label without saying what it is or linking it.
- **When done:** tell the operator in this tab, in at most 10 lines, with links.
