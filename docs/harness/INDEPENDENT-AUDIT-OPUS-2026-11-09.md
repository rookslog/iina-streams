# IINA Streams — Independent Audit of the Agentic Environment

**Date:** 2026-11-09 · **Auditor:** Claude Opus 5.5 (Claude Code 2.1.319), running in a Herdr pane on Apollo (`HERDR_ENV=1`) in `/Users/rookslog/Development/iina-streams-candidates` · **Source state:** branch `fix/live-overlay-independent-20261108` at `05eba8d`, harness files untracked. All 14 files in `docs/harness/CONFIG-BASELINE-SHA256-2026-11-09.txt` matched their recorded hashes (`shasum -a 256 -c`) at audit start, so this audit examines exactly the files the rationale describes.

**Changes made by this audit (revision 1; see revision 2 below):** this report, plus `docs/harness/evidence/2026-11-09-independent-audit/` (two rendered Codex prompts, a summary, a read-only reproduction script). No configuration, skill, agent, instruction, plugin or IINA state was changed. Because the brief said to leave everything else unchanged, I have **not** added pointers to this report in `AGENTS.md`, the rationale or the hash baseline. That propagation is deliberately left for the operator.

**Revision 2 (same day, at the operator's direction):** the doc corrections in R8 were applied as inline *[Audit correction]* notes to `EFFECTIVE-LOAD-AUDIT-2026-11-09.md` and `IMPLEMENTATION-RATIONALE-TOULMIN-2026-11-09.md`, with the original text kept. Pointers to this report were added to `AGENTS.md` and to the rationale's artifact chain and source register (A01–A04). A post-edit hash snapshot was written to `CONFIG-BASELINE-SHA256-2026-11-09-r2.txt`; the original baseline is kept as the pre-audit state. The operator also corrected the framing of §2/§7; see §7, "Framing correction". A full-text re-reading of R01–R05 was commissioned to close the reading-depth gaps marked in §4.1; see §7, "Follow-up reading".

**Conflict of position.** The harness names an "independent Opus reviewer in a separate Herdr Claude pane" as one of its mechanisms. I am an instance of that lane, auditing a design that gives me a role. My session also inherited the same operator-authored epistemic norms the Codex lead inherits (see §3, F7). Read my judgments on the value of the Opus lane with that in mind.

---

## 1. Method, and why this method

### 1.1 Approach

I treated the audit as a **consequence-weighted inquiry**. The questions were ordered by how much a wrong answer would cost IINA Streams, not by how the rationale is organized.

1. **Frame the practical problem from the project's own history** before reading the rationale's argument (§2). The project already ran one complete agentic commission (2026-11-07/08) with a known outcome. That outcome is the most situated evidence available about what this environment has to fix. No benchmark is closer to the work.
2. **Measure what the harness actually does at runtime**, not only what its files declare (§3). The rationale's central self-assessment is that runtime loading is unverified. I found that much of it can be checked read-only with `codex debug prompt-input`, so I checked it.
3. **Check the rationale's sources and then its bridges** (§4). Is each citation accurate? Does the inference from the cited finding to the engineering practice hold? What does the evidence selection leave out?
4. **Evaluate the organization of practice** (§5): roles, delegation, skills, instructions, hooks, evidence and the native loop. For each, I separate declared from verified behavior and ask what the mechanism does to the work.
5. **Recommend changes and experiments, ranked by consequence** (§6).

### 1.2 Why this method suits the problem

The rationale is mainly a *justificatory* document. It uses Toulmin structure to make each claim's warrant visible. That structure is good at showing whether a claim is supported. It is bad at showing whether the right claims are being made. An audit that followed the rationale's own seven arguments would inherit that blind spot. Starting from the project's history and the runtime gives an independent reference point. It lets me see that the rationale's question ("which skills and agents should be loaded?") may not be the main question ("what loop produces an interface the operator finds good?").

### 1.3 Evidence I used, and how closely

| Evidence class | What I did | Depth |
| --- | --- | --- |
| Harness files (`AGENTS.md`, `.codex/**`, `.agents/skills/**`, handoff, init prompt, both harness docs) | Read completely | Full |
| Project history (`docs/EXECUTION-JOURNAL.md`, `docs/DECISIONS.md`, `docs/UX-REVIEW.md`, `docs/reviews/M0-M2-2026-11-07.md`, `docs/superpowers/plans/2026-11-08-candidate-portfolio.md`) | Read completely | Full |
| `docs/SELECTION-REPORT.md`, `docs/COMMISSION-AUDIT.md`, commission/addendum | First ~60 lines of the report; targeted greps of the others | Partial |
| Candidate source | `candidate-plugin/ui/overlay.js` lines 1–9 only | Spot check |
| Codex runtime | `codex --version`; `codex debug prompt-input` in the repo and in a scratch copy; `~/.codex/config.toml` keys (no secrets printed) | Measured |
| Claude runtime | `~/.claude/settings.json` hook and plugin inventory; my own session's injected context | Measured / self-observed |
| Cited papers R01–R05 | A fetch agent read abstracts; for SkillsBench, ~40k characters of the v4 HTML verbatim plus a summarized tail | Abstract-level, one partial body |
| Platform docs D01–D05 | A fetch agent read each page; several were truncated, with tails summarized by the tool (marked [S] below) | Partial |
| Omitted literature (§4.3) | A fetch agent confirmed six of seven sources and quoted the relevant passage; one publisher page returned 403 | Abstract or passage |

**What I did not do.** I did not launch the Codex lead, spawn any Codex subagent, or operate IINA. I did not read full paper bodies, reproduce any benchmark statistic, or read the TNF design sources. I did not read most of the 320 KB of project docs the handoff requires. Fetch-agent reports are second-hand: I spot-checked their quotes for internal consistency but did not re-fetch them myself.

### 1.4 What would make me revise the approach

- If a trusted Codex launch shows that the project layer loads exactly as the rationale predicts (recommendation E1), my main runtime findings shrink to "a launch step is missing" and §5 should weigh more heavily.
- If the operator says the 2026-11-08 rejection was mainly about specific widgets, not about the absence of a feel-and-iterate loop, my reframing in §2 weakens. The operator's own account should outrank my reading of the journal.
- If the next commission's first slice succeeds natively with no operator involvement, the case for operator checkpoints (R2) weakens.

---

## 2. The practical problem, framed from the project's history

### 2.1 What the previous environment produced

The 2026-11-07/08 commission ran under rules very close to the ones now proposed. It had provenance labels, an evidence hierarchy, a single native operator, independent review, preservation audits, hash-verified archives, and Superpowers-style plans with RED/GREEN records (`docs/superpowers/plans/2026-11-08-candidate-portfolio.md`). Its output was rigorous by its own measures:

- **Large verification counts.** Final records show 143 JS + 103 Python tests; "51 genuine YouTube Fetch/replay timing checks"; "Unified windowed360/fullscreen720 each passed 11 checks"; five-plus-five open/close cycles "each passed eleven checks" (`docs/EXECUTION-JOURNAL.md`).
- **Careful preservation work.** That included a forensic account of an unrelated Safari window that changed state, written up in `docs/PRESERVATION-AUDIT.md` and `docs/COMMISSION-AUDIT.md`.
- **Accurate negative findings.** For example, Keychain persistence "did not pass its noncredential probe" (`docs/SELECTION-REPORT.md`).

The operator then judged the interface **seriously unsatisfactory** (handoff §1, §3). The overlay needed Move/Done to reposition. The settings hierarchy was incoherent. Auth was confusing. Small changes needed a full reinstall.

### 2.2 Why that happened, as far as the record shows

Three causes are visible in the record. Each is labelled with its warrant.

1. **The spec licensed the rejected design.** The addendum told the agent to implement "discrete positioning controls" if free dragging was not reliably supported (`docs/commission/ADDENDUM.md`, "Positioning and dragging"). The plan's review focus says "any unsupported dragging becomes accessible placement presets with documented native proof." Move/Done was an *accepted* outcome of the old spec, not a QA miss. *(Observed in the documents.)*
2. **The taste checkpoint was removed.** "User explicitly waived intermediate taste/plan approvals" (plan, "Global constraints"; repeated in `docs/EXECUTION-JOURNAL.md`). Through the whole run, the only person whose judgment of "pleasant to operate" counts never touched an intermediate build. *(Observed.)*
3. **Verification measured what can be checked mechanically.** The checks covered identity, geometry, timing, byte equality and window survival. They did not cover whether dragging feels right or whether the settings make sense. The commission audit says plainly, for example, that "Full keyboard/visible-focus/VoiceOver and narrow-layout accessibility audits were not performed." This is the familiar metric-substitution pattern (Goodhart/Campbell). The verified items were real, but they stood in for the goal. *(The pattern is my interpretation; the check contents are observed.)*

### 2.3 What kind of environment the problem calls for

From this history, the hard part of IINA Streams is **design discovery under an uncertain host**, not false completion claims. The open questions are:

- What does IINA 1.5.1's overlay input routing actually allow? (`data-clickable` regions, OSC interception, drag start without a mode)
- Which arrangement of identity, quality, chat and account makes sense to *this* operator?

Both are answered by short loops against the material: try something in native IINA, then have the operator try it. Schön's account of design as a "reflective conversation with the situation", and Hutchins/Hollan/Norman's gulfs of execution and evaluation in direct manipulation, both name why a screenshot, a DOM assertion or a critic's report cannot stand in for that loop. *(Both are cited from my own knowledge; neither was re-fetched for this audit.)*

So, before reading the rationale, I would expect a good environment for this project to have:

1. **A fast native iteration path** (a dev link with a distinct identity and verified reload behavior).
2. **A host-capability spike first**, because the answer bounds the whole design space.
3. **Cheap, scheduled operator "feel" checkpoints** that are not routine micro-approvals.
4. **Assurance machinery sized to its real risks**: credentials, stable-plugin protection, unrelated windows, and synthetic-vs-genuine replay claims. The previous run showed these risks are real.
5. **Critique that adds information the operator does not already have**, such as host constraints, accessibility, failure states and alternative interaction models, rather than a proxy verdict on taste.

The handoff already contains most of (1), (2) and (5) as **product work** (§3.D, §4 step 4, §4 steps 2/7). The harness rationale mostly does not discuss them as **harness design**. That gap is the main finding of this audit.

---

## 3. Measured runtime state

`codex debug prompt-input` renders the model-visible prompt without calling a model. I ran it in the repo exactly as an operator-launched lead would start, with the auditor's environment. Raw outputs, a summary and a reproduction script are in `docs/harness/evidence/2026-11-09-independent-audit/`. Ranked by consequence:

| # | Finding | Warrant |
| --- | --- | --- |
| **F1** | **None of the five project custom agents is spawnable in the current state.** The `spawn_agent` role list has 16 roles: `default`, `explorer`, `worker`, seven user-level `harness_*` roles, three more `harness_explorer_terra_*`/`luna_*` roles and four `impeccable_*`. No `streams_*` role appears. User-level agent TOMLs in `~/.codex/agents/` *are* auto-discovered: `terra_max`, `terra_xhigh` and `impeccable_*` appear without being registered in `config.toml`. | `SUMMARY.txt`, "spawn roles" |
| **F2** | **The project concurrency cap does not apply.** The prompt says "There are 30 available concurrency slots", not 4. | Same render |
| **F3** | **The repo has no Codex trust entry.** `grep -i iina ~/.codex/config.toml` returns nothing. Per D01, project `.codex/` layers load "only when you trust the project", which would explain F1 and F2. **I could not confirm that trust is the cause.** A `-c projects."…".trust_level="trusted"` override and a git-initialized copy under the trusted `/private/tmp` both rendered identically to the untrusted case. Possible explanations: the debug renderer may skip the project layer, trust may not pass to child directories, or there may be a schema problem. The rationale lists "Is this local repo trusted?" as unresolved. The file answers it: **not currently**. | `grep`; two renders with identical role lists |
| **F4** | **75 skills are visible**, not the predicted 56 named local skills plus extras. The list includes all **14 `superpowers:*` skills**, the three project skills, `impeccable`, `make-interfaces-feel-better`, `web-design-guidelines`, and **`delegate-triage`**. The operator retired that skill on 2026-11-01 with the instruction to "change whatever is causing you to read it across the board" (`~/.claude/delegation.md`), but it is still in the Codex catalog. The catalog is 30.6 KB. | `SUMMARY.txt` |
| **F5** | **Codex is installed and can be inspected.** `which codex` → `~/.npm-global/bin/codex`, version 0.167.0. The load audit says "No native codex CLI executable was found at the common paths". That was true of the shell it was written from, which was not Apollo's interactive PATH. Its main limitation ("did not start a new Codex runtime to compare resolved skill catalogs") could have been removed read-only. | `which`, `codex --version` |
| **F6** | **Codex's built-in multi-agent policy may make the role design idle even after trust is fixed.** The render contains: "Do not spawn sub-agents unless the user or applicable AGENTS.md/skill instructions explicitly ask for sub-agents, delegation, or parallel agent work." The init prompt asks for an Opus pane, not Codex subagents. Project `AGENTS.md` regulates subagents ("Give each subagent a bounded brief") but does not clearly ask for them. Two more lines matter: "All agents share the same directory … edits made by one agent are immediately visible to all other agents", and "Full-history forks … inherit the parent model and reasoning effort and do not accept overrides." So a Terra researcher needs `fork_turns: "none"`, and "isolated worktree" for the implementer depends on the lead creating one and briefing a `cd`. Nothing enforces it. | Render, `multi_agent_mode` and `multi_agent_role` blocks |
| **F7** | **The Opus lane is not separately scoped today.** This Claude session, in this repo and in Herdr, received the global `CLAUDE.md` chain (claims discipline, decision presentation and others) and the project `AGENTS.md`. Claude Code loaded it as project instructions. It also received a **Superpowers SessionStart injection** ("You have superpowers … you ABSOLUTELY MUST invoke the skill"), about 100 skills, and the delegation-roster agents. `~/.claude/settings.json` enables only `skill-creator` and declares 31 hook handlers across 11 events. **I could not find where Superpowers is enabled for Claude**: it is not in `settings.json`, `settings.local.json` or `~/.claude.json`. The load audit is correct that `settings.json` does not enable Superpowers, but in practice it is active. | Self-observation of injected context; settings inventory |
| **F8** | **Mandatory reading is large.** The handoff's "Read first, in this order" list is about **320 KB of project docs**, plus about **135 KB of named source files**, plus about **60 KB of TNF sources**. That is roughly 500 KB (on the order of 125k tokens), all required before work starts. Argument B in the rationale keeps `AGENTS.md` short (2.3 KB), but the reading the lead is told to do costs about two hundred times as much. | `wc -c` over the listed paths |
| **F9** | Positive: the **hash baseline works**. All 14 hashes verified, and it is a cheap, honest identity mechanism. The three project skills are **short (1.9–2.3 KB) and project-specific**. | `shasum -c`; `wc -c` |

**What F1–F6 mean together.** If the lead launches without accepting the trust prompt, the runtime is: global `AGENTS.md` plus project `AGENTS.md`, 75 skills including Superpowers, user-level Sol, Terra, Luna and Impeccable roles, 30 slots, and a default policy against delegation. The rationale's architecture (five roles, cap 4, Terra pinned for research) would then exist **only as prose**. The rationale already says it is "not yet enforced" and "not validated". F1–F6 show that the gap is bigger than it says: most of the declared layer is currently **absent**, not merely unenforced.

---

## 4. The rationale's research: selection, interpretation, warrant

### 4.1 Citation accuracy (checked against sources)

| ID | Rationale claim | Check | Verdict |
| --- | --- | --- | --- |
| R01 SkillsBench v4 | 87 tasks, 8 domains, 18 configs, 33.9→50.5% (+16.6pp); focused 2–3 skills beat ≥4; GUI/multi-agent/long-horizon limits | All confirmed; ablation and limits come from the summarized tail [S]. Not stated by the rationale: the gain ranges **+4.1 to +25.7pp** by configuration, and self-generated skills were tested on only 3 configurations, "below the no-Skills baseline" [S]. | **Accurate.** But the load audit's figure of "+4.5 points for software engineering" is stale. v4 Table 3 gives **SE +11.6pp (N=16)** [S]. The load audit's erratum fixed the aggregate but not this figure. |
| R02 SWE-Skills-Bench v2 | 98 skills, 4 configs, 3,920 pairs, 92 ineffective, 76.6→76.9% | Confirmed in the abstract | **Accurate.** "4 beneficial / 2 harmful" and "40 of 98 changed sign between two harnesses" are **not in the abstract**. The fetch agent did not read the body, so these are unchecked by me, not refuted. |
| R03 Gloaguen et al. | No general success gain; >20% cost; broader exploration | First two confirmed; "broader exploration" not in the abstract. Now **v3 (2026-09-29)**. The abstract also says **"context files are useful for specifying non-standard coding practices"** and repository overviews "are not helpful". | Accurate, but it **leaves out the qualifier that best supports the project's own `AGENTS.md`**. That file is almost entirely non-standard practice: preservation, native-evidence tiers, credential rules. Including the qualifier would make Argument B stronger and more specific. |
| R04 Lulla et al. | 10 repos/124 PRs, −28.64% runtime, −16.58% output tokens | Confirmed. *(Rev. 2 correction: I first called this "correlational" because of the abstract's wording. The full text describes a **paired within-task design** (R04:139–150), with one Codex configuration and **no functional-correctness evaluation**; 50 sampled tasks got only a sanity check.)* | Accurate. The reading depth is honestly given as "abstract only". The real limit is "efficiency without measured quality", not "correlational". |
| R05 Dong et al. (MSR) | 307 failures; excessive verification and heavy pipelines prominent | Confirmed: 125 functional + 182 efficiency. "Excessive verification" (67) and "heavy pipelines" (30) are the largest sources **within the Excessive Procedure category**. The cases are drawn from **SkillsBench and SWE-Skills-Bench**. | Accurate in substance. However, **R05 is not independent of R01/R02**. Argument A counts R01, R02 and R05 as three "mixed but credible reasons", which overstates convergence. |
| D02 sandbox | Custom-agent `sandbox_mode` does not override parent | Docs: "don't override the parent configuration … A custom agent file can't replace those settings" [S] | **Correct, and the correction was well handled.** Removing `sandbox_mode` was the right move. |
| D02 narrowing keys | Per-agent `skills.include_instructions`, `features.plugins` | **Not found** on the docs pages read. Only `skills.config` per agent is documented [S]. | Unchecked, and possibly undocumented. Do not plan isolation around these keys without a runtime probe. |
| D01/D04 plugin override | Project `[plugins."superpowers@openai-curated"] enabled=false` | **Not found** on the pages read | Unchecked. The load audit presents it as a confirmed platform rule. |
| D05 Herdr | `HERDR_ENV=1` prerequisite | Not on the web page, but present in local `herdr --skill`: "Requires HERDR_ENV=1" | Accurate. The rationale cites both sources. |
| D03 Claude | `skills:` preloads and is not an allowlist | Confirmed verbatim | Accurate. Docs also give `--setting-sources`, `--bare` and `--restricted`, which the rationale does not use when designing the Opus lane. |

**Overall:** the citations are unusually accurate and their reading depth is stated honestly. The rationale is a good example of citation discipline. Its problems are in **selection and bridging**, not in misquotation.

### 4.2 Bridges from findings to practice

1. **From benchmark pass rates to this project's harness (Arguments A, E).** R01–R05 measure task pass rates on terminal or SWE tasks with automated verifiers. The project's failure was in exactly what the rationale's own caveat 4 says such verifiers cannot measure: "interface appropriateness … direct manipulation … aesthetic judgments". The rationale states this limitation and then still uses these papers as the main backing for its two headline arguments. That is not wrong, because the skill-interference hypothesis is plausible. But the warrant carried over is weak, and the argument looks stronger than it is because the citations are many and precise. **Argument A's claim (fewer irrelevant skills) is reasonable on craft grounds alone.** The benchmarks add little that is specific to IINA.
2. **From platform capability to role design (Argument C).** The backing for five roles is "Codex subagent documentation, Claude isolated-agent documentation, Herdr pane/agent controls … and the user's prior experience". Platform docs show the roles *can be configured*. They do not show that roles *help*. The rationale's Q and R fields admit this. What it does not cite is the literature that bears on it directly (§4.3).
3. **From "independent model" to "independent judgment" (Argument D).** The warrant is that a separate process and model gives a real critique. Lineage independence is real and useful. Two things weaken it. First, frame independence is low (F7: the same operator norms, the same handoff, the same evidence). Second, neither model is the user. The rationale's R field mentions priming. It does not ask whether a model critic can stand in for the operator's taste. In practice the handoff uses Opus where the previous run lacked an operator checkpoint.
4. **Gate 4 (§10 of the rationale) as a warrant mechanism.** The gate proposes matched comparisons of minimal, curated and Superpowers conditions on native IINA tasks. In this setting that is close to infeasible. There is one serialized GUI operator, there are few repeatable tasks, model runs vary a lot, and each native run takes tens of minutes. A handful of runs per condition would not support the conclusions the gate implies. Gate 4 is an experimental design copied from the benchmark papers. It would cost a large share of the commission's time and produce weak evidence. *(This is a judgment about feasibility, not a measurement.)*

### 4.3 What the evidence selection left out

The rationale's search looks like it started from "skills and AGENTS.md" and found that literature well. Things it could reasonably have found, given that its own arguments C, D and F depend on them:

| Omitted source (verified to exist) | Relevant content | Effect on the rationale |
| --- | --- | --- |
| Cemri et al., *Why Do Multi-Agent LLM Systems Fail?*, arXiv:2503.13657 (v3 2025-10-26) | Failures "clustered into 3 categories: (i) system design issues, (ii) inter-agent misalignment, and (iii) task verification" | Argument C needs it: a five-role design opens all three failure channels. The paper does not refute the design, but C's rebuttal field should rest on it. |
| Anthropic, *How we built our multi-agent research system* (2025-06-13) | "about 15× more tokens than chats"; domains that need shared context or many inter-agent dependencies "are not a good fit"; "most coding tasks involve fewer truly parallelizable tasks than research" | Supports using subagents for research and review, not for implementation in a tightly coupled UI codebase. That matches the project's own "no parallel writers" rule, with a reason behind it. |
| Cognition, *Don't Build Multi-Agents* (2025-06-12) | "Share context, and share full agent traces"; subagents acting on "conflicting assumptions not prescribed upfront" | Bears directly on the brief-based implementer and UX critic, which get bounded briefs rather than traces. |
| Anthropic, *Building effective agents* (2024-12-19) | "finding the simplest solution possible, and only increasing complexity when needed" | A practitioner prior in favor of a lead-plus-one-reviewer baseline. |
| Panickssery et al., arXiv:2404.13076 | Self-preference bias correlates with self-recognition | Supports the cross-lineage Opus lane, and supports keeping the lead's preferred design hidden from Opus at first. This is actually **backing the rationale lacked for its own sound choice**. |
| Becker et al. (METR), arXiv:2507.09089 | AI made experienced developers 19% slower while they estimated 20% faster | Agents' and operators' impressions of productivity are unreliable. That argues for logging cheap actuals (time to first native drag, iterations per hour) rather than for elaborate gates. |
| Hertzum & Jacobsen, "The evaluator effect" (IJHCI) | Different evaluators find substantially different problem sets | Supports more than one critic, and supports treating any single critique as a sample, not a verdict. **Publisher page returned 403. Citation unverified in this audit.** |

**Reasonable omissions versus the impossible.** The multi-agent and LLM-judge sources were findable with a query matched to Arguments C and D, so leaving them out is a gap that could have been avoided. Leaving out design-practice theory (Schön, direct manipulation) is more forgivable for a document about configuration. But it is the omission with the biggest consequence, because it is the one that would have changed the framing (§2.3). Nobody could have found literature evaluating "Sol + Herdr + IINA", and the rationale says so correctly.

### 4.4 What the Toulmin frame shows and what it hides

Toulmin structure is a good auditing aid, and it is used with honest qualifiers and rebuttals. But it breaks the environment into **claims**. A loop design is not a claim. Questions such as when the operator touches a build, how long an iteration takes, and where critique enters relative to the host spike are about the **sequence and economics of the work**. The format has no field for opportunity cost, and none for the claim that should have been argued but was not. That is why the documents carefully justify which skills to hide and say almost nothing about the iteration loop, which is the mechanism with the biggest consequence. The document also notes that M01 is cited from publisher metadata only. That is fine for using the vocabulary, and the document says so.

---

## 5. Practice and technical organization

### 5.1 Well warranted: preserve these

- **The handoff's user-feedback section (§3 A–G)** is the best artifact in the package. It is concrete, grounded in the source code (16 px margins, 56/120 px exclusions, fractional-range coordinates, editing-mode clickability), clear about which old spec items it supersedes, and honest about what each prior fix does not prove. My spot check of `candidate-plugin/ui/overlay.js` confirms one of its source claims: in editing mode it sets `data-clickable` on `documentElement`, `body` and every descendant, so the whole overlay captures clicks.
- **The evidence hierarchy and synthetic-versus-genuine labelling** in `AGENTS.md` fit a failure that actually happened (synthetic Twitch replay, no real grant) and cost little to state.
- **The single-native-operator rule.** The history backs it directly: the Safari window incident, the Accessibility-press crash, and the stuck native menu tracking.
- **Credential and stable-plugin boundaries** are short, absolute and appropriate.
- **The dev-link iteration requirement (handoff §3.D)** is probably the most consequential mechanism in the package. The rationale does not discuss it as harness design.
- **The three project skills** are short, task-specific and carry non-standard practice. That matches both SkillsBench's focused-skill finding and the Gloaguen qualifier the rationale left out. `streams-interaction-design`'s gesture ledger (signifier, action, feedback, capture risk, fallback, recovery) is a good design instrument.
- **Honest status vocabulary.** "Scaffolding, not validated", explicit NOT-TESTED, and the recorded Luna→Terra correction. The documents do not overclaim.
- **The hash baseline** (F9).

### 5.2 Not adequately supported, or currently absent

- **The five Codex roles.** They are not spawnable in the current state (F1), possibly discouraged by Codex's default policy (F6), and argued only from what the platform allows (§4.2). Brief-based roles also bring the context-loss problems in §4.3. My judgment: the lead plus **one** read-only researcher (Terra, for the Twitch VOD tooling and IINA API questions, which really are parallelizable) plus the external Opus lane covers the real needs. The implementer and native-QA roles split work that the lead must integrate and own anyway (single native slot, single writer). *(Inference; not tested.)*
- **Skill isolation as the main lever.** Seventy-five visible skills with Superpowers on is a real interference risk. Whether it matters here is unknown. The cheap test is to watch whether the lead invokes Superpowers rituals on the first slice (E3), not a matched A/B.
- **The Opus lane as currently launched** (F7). Running it as-is gives the critic the operator's whole global epistemic regime, a Superpowers mandate and 31 hooks. The frame becomes "audit the evidence" rather than "use the thing". That is useful for engineering review and weak for interaction critique.
- **Gate 4** (§4.2): high cost, little it can support.

### 5.3 Overhead and displacement risks

The new package continues the previous run's evidential culture and adds to it: Toulmin fields, six provenance tags, five gates, an evidence ledger, adjudication records, and the global `governance/epistemic-criteria.md` (4.7 KB), which must be read in full "for … claims about Codex or harness behavior". Each part is defensible on its own. Together they set the lead's attention toward producing auditable claims, which is the activity that produced high-quality evidence for an interface the operator rejected. R05's largest within-category failure source is *excessive verification*. The rationale uses R05 against Superpowers. It applies equally to the rationale's own procedures. *(Inference from the history and R05; not measured here.)*

The handoff does push back: "Avoid a long report as a substitute for a working design." That sentence is the right correction, but it is outweighed by everything around it.

### 5.4 Codex, Claude, Herdr and IINA together

- **Herdr** is used correctly as a process boundary, and the rule to control panes only from inside Herdr is sound. Herdr gives a separate process, not separate settings (F7). That makes the "separately scoped" Claude pane a launch-flag question, not a layout question.
- **Codex ↔ Claude**: the bridge is files, which is good. The Opus critique should land as its own dated file (as the rationale specifies). It needs to start from native captures and the host-spike results, which do not yet exist.
- **Native IINA** is the bottleneck resource and correctly has a single owner. The harness does not yet say what happens in the time when the native slot is busy.

---

## 6. Recommendations and experiments, ranked by consequence for IINA Streams

**E1 — Resolve trust and re-render before launch (about 5 minutes, operator).** Launch `codex` in the repo, accept the trust prompt, exit, then run `docs/harness/evidence/2026-11-09-independent-audit/REPRODUCE.sh`. Pass: the render shows 4 slots and five `streams_*` roles. If it fails, the custom-agent layer is not a working mechanism on Codex 0.167, and the rationale's §4 and §6 should be rewritten around what actually loads. *Deciding variable: F1–F3.*

**R1 — Run the host-capability spike before Opus critique and design synthesis.** In a dev-link identity:
1. In normal (non-editing) mode, make only the chat panel `data-clickable`.
2. Test whether a physical drag starts on it.
3. Test whether clicks outside it still reach IINA.
4. Test behavior over the OSC region.
5. Test whether a corner grip can resize.

This is a short native experiment and its result bounds every later design choice. Give the result to Opus as input. The handoff currently orders this after critique and synthesis (§4 steps 2–4). *Load-bearing assumption: the main overlay complaint depends on host input routing, which has not been tested.*

**R2 — Put the operator back in the loop, cheaply.** The previous run waived taste checkpoints. Replace that with two scheduled checkpoints, which are not micro-approvals: (a) after the spike, a five-minute try of the drag over the dev link; (b) at design convergence. Add "operator-experienced" above "observed native IINA result" in the `AGENTS.md` evidence hierarchy *for UX questions only*. *Would flip if the operator would rather review only finished candidates; that is their call.*

**R3 — Scope the Opus lane at launch, and test that the scoping works.** Launch the Herdr Claude pane with `claude --setting-sources project,local` or `--bare`, plus an explicit model and effort. Then confirm in the first turn that no Superpowers SessionStart text and no user hooks appear. If the injection still appears, find its source (F7 is unresolved). For **interaction** critique, give Opus the native captures, a short gesture recording, and the operator's complaints, not the evidence ledger. Ask it for alternative interaction models and the native tests that would decide between them, not for a verdict.

**R4 — Cut the role set to what has a job.** Keep the lead, `streams_docs_researcher` (Terra, `fork_turns: "none"`), and the external Opus lane. Fold implementer and native QA back into the lead until a real parallel, disjoint slice appears. Say in `AGENTS.md` that the lead *may* delegate research and review, so the Codex default "do not spawn" policy (F6) does not quietly block the one role that helps.

**R5 — Replace Gate 4 with cheap actuals.** Per slice, log: which skills were invoked (from the transcript), time from code change to native observation, native iterations, and whether the operator accepted. After three slices, look at the log before buying any matched comparison. This covers the useful part of Gate 4 at a small fraction of the cost (METR, §4.3).

**R6 — Index the mandatory reading by task.** Restructure the handoff's "Read first" list (about 500 KB; F8) into what the first slice needs: the handoff, BUG-006, `overlay.{js,css,html}`, and the IINA overlay API. Other material should be read when its task comes up. This is the rationale's own Argument B applied to the reading list, not only to `AGENTS.md`.

**R7 — Clear the visible global catalog (operator decision, global scope).** The retired `delegate-triage` and the duplicate `delegation-triage` are still in the Codex catalog (F4), which goes against the operator's 2026-11-01 instruction. Decide separately whether Superpowers belongs in this repo's lead. Both are user-level changes; I have not made them.

**R8 — Correct the harness documents. *Applied in revision 2.***
- Load audit: Codex *is* installed (F5).
- Load audit: SE gain is +11.6pp in v4, not +4.5.
- Rationale: R05 shares cases with R01/R02, so it is not independent support.
- Rationale: add the R03 "non-standard practices" qualifier.
- Mark `include_instructions`, `features.plugins` and the project plugin override as not found in the docs.
- Add the §4.3 sources to the rebuttal fields of Arguments C and D.
- Update the hash baseline after the edits.

### Recommendations I considered and rejected

- **"Remove the provenance discipline."** No. It addresses a real failure and costs little at the `AGENTS.md` level. The problem is how much of it there is, not that it exists.
- **"Build a project hook to guard the stable plugin."** Not yet. The plugin-ID and path checks in the skills plus operator approval match the risk. A hook that fails open or blocks legitimate edits adds new failure modes (rationale Argument F is right here).

---

## 7. Open uncertainties and disagreements

- **F3's cause** is unresolved, so treat E1 as a measurement, not a formality.
- **Where Claude's Superpowers enablement comes from** is not located.
- **Hertzum & Jacobsen** could not be verified (publisher returned 403).
- **R02's 4/2/40 figures** are unchecked beyond the abstract.
- **My central reframing (§2)** comes from reading the journal and handoff, not from the operator. If the operator says otherwise, §2.2 point 2 and R2 should give way.
- **Disagreement with the rationale:** it treats skill and agent isolation as the first-order question and validation as the main missing piece. I think the first-order questions are loop order (spike, then operator, then critique) and the cost of evidence. Isolation is a real but second-order problem. A trusted launch plus one transcript inspection (E1, R5) could show I have this backwards. If Superpowers rituals visibly take over the lead's first slice, the rationale's ordering wins.

**Framing correction (operator, revision 2).** "Loop, not catalog cleanup" was a false either/or. The loop claim is about what decides whether the *next IINA Streams commission* produces a good interface. The operator's point is that the user-level Codex and Claude setups need cleaning and harmonizing anyway, as groundwork for a different approach to context management and harness construction than the platforms' defaults. F4 and F7 are evidence for that: a retired skill still visible, Superpowers active without being enabled where expected, and 31 hooks inherited by every pane. Both lines of work are needed. They answer different questions and should not compete for the same slot.

**Follow-up reading (revision 2).** The reading-depth limits marked in §4.1 were partly structural. The fetch tool truncates pages at about 40k characters and summarizes the remainder ([S] marks). A flag records where to push, but it is not a reading. A follow-up lane was commissioned on the operator's prompt: raw full texts downloaded locally, read in full by Terra High against the specific open claims. **Result (completed same day):** `docs/harness/evidence/2026-11-09-independent-audit/FULLTEXT-READING-R01-R05.md`. Terra reports reading every text line of all five papers. I spot-checked six of its locators against the raw text, and all matched. What changes:
- **Now supported, with qualification (R02):** 4 beneficial / 2 harmful, and the 40-of-98 sign flips. The flips are *observed* signs for one model (Kimi-K2.6) between Codex and Claude Code, not significant interaction tests.
- **Weakens the "small catalog" backing (R01):** "2–3 skills +19.0pp vs ≥4 +10.1pp" compares **different task groups** (43 vs 21). It is not a same-task removal, so it cannot set a catalog-size rule.
- **Weakens a length-focused reading of Argument B (R03):** the paper finds "no clear dependency" of success or cost on context-file length. The >20% cost increase applies to *LLM-generated* files; developer-provided files cost at most 19% more. With documentation removed, generated context files *improved* performance by 2.7%, which argues against a blanket "no overview" policy.
- **R05, more precisely:** the 67 excessive-verification cases are part of 114 excessive-procedure cases within the efficiency regressions. The paper's recommendation is **proportional** verification, scaled to task uncertainty, change size and budget, not less verification. That is how §5.3 should be read. R05 also used older benchmark inventories (84 SkillsBench tasks, 490 SWE instances).
- **Against the role split (R01, R03):** none of the five papers tests a lead/subagent/reviewer topology, and R01 explicitly warns about transfer to multi-agent work.
- **Cuts the other way (R02):** a testing skill *induced* real native test execution. A good skill can strengthen verification.

Two more points come from Sol High and Sol Medium lanes run on the same brief (`evidence/2026-11-09-independent-audit/READING-LANES-COMPARISON.md`):
- R02 **excluded "generative or subjective skills"** by design, so it says nothing about design or interaction skills.
- R04's token reduction holds **for output tokens only**; median input and total tokens rose slightly.

Net effect on this audit: §4.2's judgment that the benchmarks add little that is specific to IINA is confirmed.

**Round 2 and the inventory of inventories (revision 3, same day).**
- Four more Terra lanes tested context isolation, launch surface and effort; results are in `READING-LANES-COMPARISON.md`, round 2.
  - The isolated `reader` profile cut the prompt from 99 KB to 59 KB but did not change cost or quality measurably on this corpus.
  - Max effort took 3.3× the time for two extra verified catches.
  - The interactive Herdr lane read only part of the corpus, and said so. The cause is unconfirmed.
- At the operator's request, two scouts then compiled every earlier attempt to inventory, audit or fix the setups. The register is at `~/Development/personal-work-ecosystem/local/2026-11-09-inventory-of-inventories/README.md`, which is git-ignored there by that workspace's convention.

**It corrects advice given in this session's chat.** The cross-machine design proposed there (one composition repo, per-host overlays, a drift check) **already exists**: it was built on 2026-10-04 in `dionysus:/data/lanes/E-harness-repo/` and was never adopted. A drift audit the same day counted 6,869 file differences between the machines. Any setup redesign should start from that repo, not from this audit. §4.1's R04 note is corrected (above).

---

## Appendix A — Reproduction

- Hash baseline: `shasum -a 256 -c docs/harness/CONFIG-BASELINE-SHA256-2026-11-09.txt`
- Runtime render: `docs/harness/evidence/2026-11-09-independent-audit/REPRODUCE.sh` (read-only; no model call). Raw JSON SHA-256 values are in `SUMMARY.txt` in the same folder.
- Claude hook inventory: count `hooks.*[].hooks` in `~/.claude/settings.json` (31 handlers / 11 events on 2026-11-09).
- Reading-list size: `cat` the eleven docs named in handoff §2 → 320,405 bytes; the named source files → 134,916 bytes.

## Appendix B — Sources used by this audit, with reading depth

*(Rev. 2: R01–R05 were also read in full by Terra High from downloaded PDFs; see `evidence/2026-11-09-independent-audit/FULLTEXT-READING-R01-R05.md`.)* Rationale sources R01–R05 and D01–D05 at the URLs given in `IMPLEMENTATION-RATIONALE-TOULMIN-2026-11-09.md` §11. Fetched 2026-11-09 by a delegated fetch agent: abstracts for all; the SkillsBench v4 HTML partly verbatim with the tail summarized. Additional sources: arXiv:2503.13657; anthropic.com/engineering/multi-agent-research-system; cognition.com/blog/dont-build-multi-agents; anthropic.com/engineering/building-effective-agents; arXiv:2404.13076; arXiv:2507.09089 (abstract or quoted passage each); Hertzum & Jacobsen (unverified, 403). Schön (*The Reflective Practitioner*, 1983) and Hutchins, Hollan & Norman ("Direct Manipulation Interfaces", 1985) are cited from my own knowledge and were not re-read.
