# IINA Streams — project agent guidance

Start by checking current Git status, exact IINA plugin identities, and the user's immediate task. Current plan: `docs/ROADMAP.md` (GitHub milestones and issues); build, dev loop and release: `docs/RELEASE.md`; decisions: `docs/DECISIONS.md`. For substantial Streams design/engineering work, read `docs/archive/commission/HANDOFF-SOL61-HIGH-2026-11-09.md`. **Only for harness configuration, agent/skill selection, or audits**, consult `docs/archive/harness/EFFECTIVE-LOAD-AUDIT-2026-11-09.md`, `docs/archive/harness/IMPLEMENTATION-RATIONALE-TOULMIN-2026-11-09.md` and `docs/archive/harness/INDEPENDENT-AUDIT-OPUS-2026-11-09.md`. Treat historical reports as evidence from their dated state, not runtime proof.

- The operator's task is a usable **native IINA** streaming/chat experience, not a finished plan or screenshot. Directly movable/resizable overlay, coherent chat/account UI and real Twitch VOD chat are priority journeys.
- Preserve the operational M2 worktree, original preview, current candidate archives, stable ID, installed plugins, and unrelated IINA/Safari windows. Stable deployment requires explicit user approval.
- The operator launches the Sol High Codex lead **locally in Herdr**. Research and source-critical review should use **Terra High, not Luna**. Independent Opus review runs in a separately scoped Claude Code Herdr pane, not as a Codex subagent. Only one agent at a time may operate native IINA; the lead owns that testing slot, installation decisions, merges and release gates.
- Give each subagent a bounded brief with known source checkpoint, exact file/test ownership, expected evidence, and a deadline. Reviews are independent of builder reports. Never allow parallel writers to change shared files.
- Evidence hierarchy: observed native IINA result > real-source integration test > source/automated mock test > past agent claim > untested proposal. Label claims and counterevidence; no synthetic test implies authentic Twitch acquisition or OAuth persistence.
- Never expose tokens, Keychain values, device codes or signed URLs in logs. Never perform account authorization without the operator.
- Prefer a distinct development-plugin identity/worktree over reinstalling the same archive for a CSS or JS change. Preserve rollback and verify IINA reloading before asserting hot reload.
- **Before describing or designing any surface, or making any claim about users,** read `PRODUCT.md` §Users (everyday Mac users, not technical ones; their desires and the tensions between them) and §Surfaces in IINA (which IINA panel each part of Streams uses, and which side it's on). The operator's first-hand observations of Streams outrank inferences from code. When the operator describes their own IINA, treat it as an observation and find the setting that explains it.
- On UI work use `.agents/skills/streams-interaction-design/SKILL.md`; on native testing `.agents/skills/streams-native-acceptance/SKILL.md`; on auth/replay `.agents/skills/streams-auth-replay/SKILL.md`. They supplement, not override, Apple's HIG or the operator's feedback.
- **The design set** (draft 3.1, provisional, from design-practice-lab; installed 2026-11-24 in `.claude/skills/`, version in `DESIGN-SET-VERSION`, departures in `.claude/skills/DEPARTURES.md`). Always read:
  - Before making, changing, critiquing or reporting on anything a person will look at or use, load `using-the-design-set`.
  - What the person says is said to you. A stop or a direct instruction takes effect as said; for anything else, load `reading-a-reaction` before changing anything in answer.
  - A go-ahead covers what was described.

  The design set governs how design work is done with the operator and judged. Impeccable, Apple's macOS guidelines and the streams-interaction-design skill are its craft sources: they govern how a thing looks and behaves on the platform. Do not load `design-craft` or `design-triage` from later drafts.
- **Impeccable** (design skill; operator-approved 2026-11-22, WAITING W-10), installed for this project only, with no hook and telemetry off:
  - designers start a screen with its `shape`;
  - an independent reviewer runs `critique` and `audit`;
  - `npx impeccable detect` checks `ui/` and the mocks.

  Its defaults are web taste: Apple's macOS guidelines, the streams-interaction-design skill and native IINA behaviour win any conflict.
- **Worktrees live outside the project folder,** in `../iina-streams-wt/<name>`: never `.claude/worktrees/`. In-project copies make link-opening tools ask which `docs/WAITING.md` to open. So don't use the Agent tool's `isolation: worktree`: create the worktree with `git worktree add ../iina-streams-wt/<name> <branch>`, and point the agent at it. Remove each worktree once its branch is merged or parked; the branch keeps the commits.
- Keep the skill roster narrow. Do not simultaneously invoke the complete Matt Pocock, Superpowers, P Stack, and Addy Osmani workflow routers.
- Multi-round review follows `docs/REVIEW.md` (D-032): severity gate, a step-back at round 3 or on any recurring class, class repair against written invariants, and the Known classes list in every reviewer brief.
- Each completed slice needs reproducible observed behavior, tests where appropriate, preserved source SHA, and an honest record of what was **not** tested.
