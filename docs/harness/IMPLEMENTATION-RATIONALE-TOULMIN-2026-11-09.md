# IINA Streams — Harness Implementation Rationale and Warrant Audit
**Revision:** 2026-11-09 · **Scope:** Apollo, local IINA Streams candidate worktree · **Status:** Enacted *scaffolding*, not an experimentally validated harness

## 0. Purpose, status, and the epistemic rule

This is a justification and critical account of the harness-related files already written for the IINA Streams initiative. It is not a proposal masquerading as an implementation, nor a proof that the design is optimal. Its job is to let a future auditor reconstruct **what exists, what it is supposed to do, how that intent is warranted, what sources were inspected, and what would disconfirm the decision**. It belongs next to the configuration, but its body is intentionally not always resident in an agent context.

**Primary claim (qualified):** A project-scoped, small, role-differentiated Codex harness, supplemented by an independent Claude Opus reviewer in a separate Herdr pane, is a *defensible experimental starting point* for IINA Streams. It is **not yet proven better**, and the actual project configuration **does not yet enforce the proposed skill-isolation policy**. Source-based reasoning warrants an initial trial and explicit tests, not uncritical adoption.

**Independent audit (November 9, later):** `docs/harness/INDEPENDENT-AUDIT-OPUS-2026-11-09.md` measured the Codex runtime for this repo and re-checked sources R01–R05 and D01–D05. Its corrections are inline below as *[Audit correction]* notes; the original text is kept. Its main runtime finding: in the current untrusted state, the project `.codex/` layer (five agents, the cap of 4) does not appear in the rendered prompt at all. Its main framing challenge: the iteration loop (host spike → operator feel check → critique) matters more for the *product* than catalog isolation. As the operator has clarified, catalog cleanup is still a separate, real prerequisite for the planned context-management and harness work.

The Toulmin fields used below are **Claim (C), Data/Grounds (D), Warrant (W: bridge), Backing (B), Qualifier (Q), Rebuttal/exception (R), and Falsification/audit check (F)**. This follows Stephen Toulmin's approach to making inferential licenses visible; it is an auditing aid, not an empirical performance metric. See [M01] and [M02]. A citation means a source supports some stated premise, not that the entire recommendation follows deductively.

**Provenance vocabulary:** `LOCAL-OBS` = read directly from Apollo files/runtime outputs; `PLATFORM-DOC` = first-party product documentation; `RESEARCH` = paper's stated method/findings; `MAINTAINER` = maintainer-designed practice, not evidence of causal performance; `INFERENCE` = our bridge/interpretation; `NOT-TESTED` = intended behavior lacking real runtime proof. Every important claim should fit one or more tags. The decision does not become correct because it has a citation.

### What was actually changed

Files created in the candidate checkout, relative to `/Users/rookslog/development/iina-streams-candidates`:

| File or directory | Observed content | What it establishes | What it does NOT establish |
| --- | --- | --- | --- |
| `AGENTS.md` | Project instructions and pointers to handoff/audit | A root-level Codex instruction surface exists | That Codex has trusted this project or obeyed it |
| `.codex/config.toml` | `[agents] max_concurrent_threads_per_session = 4`; `[features] hooks = true` | Declared intent to cap parallelism and permit hooks | An isolated skill list, active hooks, runtime-enforced native IINA exclusivity |
| `.codex/agents/streams_ux_critic.toml` | Sol High internal UX critic | Custom agent definition, not Claude | An independent cross-model critique or successful agent spawn |
| `.codex/agents/streams_implementer.toml` | Sol Medium implementer | Bounded engineering role instructions | OS-level write boundaries or native acceptance |
| `.codex/agents/streams_native_qa.toml` | Sol High native QA | A native QA role is described | An actual GUI tester has been started; exclusive control is enforced |
| `.codex/agents/streams_auth_security.toml` | Sol High auth/replay reviewer | Security remit and behavioral prohibitions | A read-only sandbox enforced by that custom TOML |
| `.codex/agents/streams_docs_researcher.toml` | **Terra High** source-critical researcher | Revised model and source-audit instructions; original Luna choice corrected at the user's direction | Relative model performance, a real source-critical report or read-only sandbox enforcement |
| `.agents/skills/streams-interaction-design/SKILL.md` | Native interaction and TNF/HIG reference workflow | One local skill file exists | That it is invoked correctly or measurably improves UI |
| `.agents/skills/streams-native-acceptance/SKILL.md` | Real IINA test procedure | One QA skill exists | That the native test suite has run |
| `.agents/skills/streams-auth-replay/SKILL.md` | Twitch auth/replay evidence protocol | One domain skill exists | That Keychain persistence or genuine Twitch VOD replay is verified |
| `docs/commission/HANDOFF-SOL61-HIGH-2026-11-09.md` | Current product/design brief, now revised for a **local Herdr Codex lead** | Handoff ready for a lead to read | That the lead has started or accepted it |
| `docs/commission/INITIALIZE-SOL61-HIGH-2026-11-09.md` | Short initialization prompt, now oriented to **Herdr on Apollo** | The operator has a prompt for launching Sol | That Codex has been launched |
| `docs/harness/EFFECTIVE-LOAD-AUDIT-2026-11-09.md` | Loading inventory, constraints, hypotheses | A machine-grounded baseline exists | A resolved live-context measurement |
| **This document** | Source-warrant argument, limitations, decision provenance | Audit reference exists | Scientific validation or a finished harness |

All are presently uncommitted in the candidate checkout. Earlier operational/design worktrees, IINA installed candidate packages and stable plugin identity were not modified to make these files. **A new Git worktree branched from the last committed source will not automatically contain uncommitted files.** Do not reset/clean the existing checkout or silently omit this package during transfer.

The previous source snapshot showed `fix/live-overlay-independent-20261108` at `05eba8d`; later new documentation made the checkout unclean. This is expected and is not an implementation failure. Read `git status` again before acting.

## 1. Evidence map: why no single “body of research” settles this

### Empirical findings we should not flatten

**[R01] SkillsBench, arXiv:2602.12670v4 (June 14, 2026).** The **current revision** reports 87 tasks across 8 domains, 18 model–harness configurations and average gains from 33.9% to 50.5% (+16.6 percentage points) for curated skills. It finds heterogeneous effects; task-level skill-pairing with 1 or 2–3 modules performed better than >=4 in its reported ablation. Its limitations explicitly warn that terminal/container tasks do not generalize straightforwardly to GUI work, multi-agent coordination, long horizons or lower-quality ecosystem skills. *Reading in this audit:* HTML abstract, results and relevant subsections on skill quantity, failure modes and limitations; **not a full appendix-by-appendix reproduction**. Earlier citations to 86 tasks/+16.2pp reflect an older paper version and must not be presented as the latest numbers. *[Audit correction: v4 also reports a range of +4.1 to +25.7pp by configuration, and Software Engineering +11.6pp (N=16). Self-generated skills were evaluated on only three configurations, where they fell below the no-Skills baseline. The last two points come from a summarized page tail.]*

**[R02] SWE-Skills-Bench, arXiv:2603.15401v2 (revised October 27, 2026).** 98 public SWE skills in fixed-repository, requirement-driven evaluations; four agent-model configurations, 3,920 paired evaluations. 92 of 98 are classed ineffective, four beneficial, two harmful under the paper's significance protocol; aggregate pass ratio 76.6% to 76.9%. Forty of 98 skills changed effect sign between two harnesses on the same model. *Reading:* current v2 HTML abstract, design/matched conditions and primary result sections. This is the **current v2**, not the superseded v1 figures sometimes cited by secondary sources. Its definition of “ineffective” means *no statistically detectable change under its test*, not proof of zero effects on all tasks. It reports automatic requirement/test generation and one run per matched condition: those design choices deserve independent methodological scrutiny before strong generalizations. *[Audit correction: the abstract confirms 98 skills, four configurations, 3,920 pairs, 92 ineffective and 76.6%→76.9%. The 4 beneficial / 2 harmful counts and the 40-of-98 sign flip are not in the abstract and were not re-checked against the body.]* *[Full-text follow-up, `evidence/2026-11-09-independent-audit/FULLTEXT-READING-R01-R05.md`: the counts are supported. The 40 flips are observed signs for Kimi-K2.6 between Codex and Claude Code, not significant interaction tests. Requirements and verifiers are model-generated, with one run per condition.]*

**[R03] Evaluating AGENTS.md (Gloaguen et al., 2026).** Comparing no context, LLM-generated context and developer-authored context across coding-agent tasks, the paper reports no significant general success-rate benefit and >20% higher inference cost, plus broader exploration/tool use. *Reading:* HTML abstract, experimental conditions, primary-results table/claims and limitations. The study is largely Python and patch-resolution oriented; its outcome is not native-UI usability or long-session preservation. *[Audit correction: the current version is v3 (2026-09-29). Its abstract adds that "context files are useful for specifying non-standard coding practices" and that repository overviews are not helpful. That qualifier **supports** this project's `AGENTS.md`, which consists almost entirely of non-standard practice. "Broader exploration" is not in the abstract.]* *[Full-text follow-up: more testing and exploration is supported in the body. The >20% cost increase applies to LLM-generated files; developer-provided files cost at most 19% more. There was "no clear dependency" of success or cost on file length, so Argument B's warrant is relevance, not brevity. With documentation removed, generated files improved performance by 2.7%.]*

**[R04] On the Impact of AGENTS.md Files on the Efficiency of AI Coding Agents (Lulla et al., 2026).** On 10 repositories/124 PRs, the abstract reports a 28.64% lower median runtime and 16.58% lower output-token use with AGENTS.md, with comparable task completion. *Reading:* university/paper metadata and abstract, **not the complete PDF or analysis**. R03 and R04 differ in samples, context-file provenance, measures (inference cost vs runtime/output tokens), and experimental designs; neither simply refutes the other. This is a productive tension, not a number to average.

**[R05] Agent Skills Can Be Harmful (Dong et al., August 2026).** Microsoft Research publication abstract reports 307 skill-induced failures or efficiency regressions across benchmark cases; excessive verification and heavy pipelines are prominent sources. *Reading:* institutional abstract only, not full methods or replication. It warrants a **failure hypothesis** and testing, not a proven diagnosis of this particular Streams repo. *[Audit correction: the 307 cases (125 functional, 182 efficiency) are drawn from **SkillsBench and SWE-Skills-Bench**, so R05 is not independent of R01/R02. Excessive verification (67) and heavy pipelines (30) are the largest sources *within* the Excessive Procedure category. The same failure mode applies to this harness's own verification-heavy procedures, not only to Superpowers.]*

**[P01]/[P02] Matt Pocock's skills and Obra Superpowers.** These are maintainers' practice proposals and implementation artifacts, not independent evaluations of Sol/Herdr/IINA. Matt Pocock's current engineering README separates user-invoked orchestration from model-invoked procedures and promotes TDD, domain modeling, code review and explicit workflow seams. The local `writing-for-agents` skill discusses context pointers, authoring cost, branching, stale documents and validation. Obra's local `using-superpowers` requires invocation for even a small chance of relevance; this is a substantive normative difference from selective invocation. *Reading:* maintainer readmes and local skill bodies; no controlled IINA outcomes measured.

**[D01]/[D02] Codex docs; [D03]/[D04] Claude docs; [D05] Herdr docs; [D06] Apple HIG/IINA plugin API.** These describe product-supported mechanisms and their declared semantics. They are strong evidence of **allowed configuration shapes**, but weaker than runtime tests for whether a specific file, profile, hook or GUI interaction actually worked.

**Bottom line:** Curated skills sometimes help, randomly importing many may harm, and even AGENTS.md affects different studies differently. The warrant is to select a small, testable initial harness and independently evaluate it. No published result directly evaluates *GPT-6.1 Sol High + Apollo + IINA + Herdr + these three new skills*.

## 2. Toulmin argument A — prefer project-specific constraints to a global skill flood

**C:** Prefer a small project-local catalog, with different subagent subsets, instead of exposing the full user-level catalog and the entire Superpowers workflow by default.

**D:** On Apollo, `~/.agents/skills` has 39 immediate skill files, 28 not explicitly disabled; `~/.codex/skills` has 27 immediate skills, 25 not disabled; the project has 3 further skill files. These **56 named local skills** do not include bundled/plugin skills. `~/.codex/config.toml` contains 50 skill-disable entries (all disabled), a globally enabled Superpowers plugin and eight other enabled plugins. The project's `.codex/config.toml` currently has **no skill filter**. [LOCAL-OBS, E01]. R01/R02/R05 provide mixed but credible reasons to worry about irrelevant or conflicting procedures.

**W:** Reducing available *irrelevant* procedures should reduce selection ambiguity and behavioral interference, while still leaving needed domain procedures discoverable.

**B:** R02's matched results and negative-template examples; R01's focused-skill and failure-mode ablations; local evidence that Superpowers demands a broad ritual before most tasks. [R01,R02,R05,P02].

**Q:** This is a **plausible**, not empirically confirmed, improvement. The 56 count is a filesystem/configuration prediction, **not** a live-session list of actually shown skill descriptions, full instructions or context tokens.

**R:** Too aggressive a filter may hide a tool the lead legitimately needs; selected descriptions may be truncated rather than loaded, so catalog size alone may be misleading; an agent might invoke relevant skills only when needed. A project trust issue may prevent project config from applying. Superpowers could outperform our manual subset on some cases.

**F:** Fresh trusted Codex session: record resolved skill catalog before/after filtering, try invoking an excluded skill and included skill, inspect plugin enablement and subagent results; run matched IINA tasks with and without the filter. **No such runtime validation has occurred.**

*[Audit correction to B: R01's "2–3 skills beat ≥4" compares different task groups (43 vs 21 tasks), so it cannot support a catalog-size rule; the full-text follow-up has the locators. R05 recommends proportional verification, not less of it. R05 shares its cases with R01/R02, so these are two lines of evidence, not three. Measured catalog in this repo: 75 entries, including 14 `superpowers:*` and the retired `delegate-triage`.]*

**Implemented state:** Only candidate skills exist and the small project concurrency/hooks toggles were written. **The proposed filter and Superpowers project override have NOT been enacted.** Do not describe the catalog as isolated.

## 3. Toulmin argument B — keep AGENTS.md short and reference materials on demand

**C:** Keep always-loaded `AGENTS.md` to project invariants, source/branch boundaries and branching pointers; place detailed design principles, source audits and old QA evidence in linked, on-demand documents.

**D:** The global `~/.codex/AGENTS.md` is ~6.3 KB and includes six trigger documents and a global codebase-memory-MCP preference, whether or not this repo has that MCP. The new project `AGENTS.md` is ~2.3 KB and originally pointed unconditionally at two comparatively long briefs; this creates duplicated instruction/reading pressure. [LOCAL-OBS, E01]. R03 reports cost without general task-success gains; R04 reports time/token improvements in a smaller different sample.

**W:** Always-present text should focus on instructions that are both critical and not cheaply discoverable from the filesystem, while references should be reached only for task branches that require them.

**B:** [R03,R04,P03] plus [D01] confirming hierarchical instruction-file loading. The locally inspected Pocock `writing-for-agents` distinguishes context vs cognitive load and argues for clear conditional pointers.

**Q:** Not a universal injunction to minimize tokens. A genuinely load-bearing safety constraint may merit duplication; *relevance and invocation reliability* matter more than byte count.

**R:** Reference links can be too weak; a subagent may fail to read a critical spec, particularly under compaction or unclear triggers. The global document may override project intent if the model misunderstands precedence. The research does not establish an optimal word count.

**F:** Assess actual route: lead sees brief when doing UX, native QA sees test contract, auth reviewer reads security contract, researcher does not read all of them. Track missed references and unnecessary reads. Compare with a brief no-AGENTS baseline.

**Implemented state:** Project `AGENTS.md` exists. The project **has not yet verified** which global guidance and extra triggers Codex consumed. A future pruning pass should avoid deleting safety-relevant instructions by accident.

## 4. Toulmin argument C — split responsibility by epistemic and operational role

**C:** Use one Sol High integration lead; optional internal Sol critic; specialist implementation, auth and native QA agents; and a separate Opus critique channel. Keep exclusive native-IINA control with the lead-designated QA owner.

**D:** The actual task contains different failure modes: wrong UI conceptual model, real player click-through, in-memory and Keychain authorization, current Twitch replay limitations and test provenance. Existing Streams QA history had code tests and native acceptance that did not cover every user experience; the user reports direct drag and auth confusion. The Codex platform supports project `.codex/agents/*.toml` with model/instructions and explicitly notes that skills inherit from the parent while sandbox/approval are controlled at the parent level. [D02, E02, original project QA documents].

**W:** Separating **judgment roles** and giving each an evidence contract can limit confirmation bias, reduce overlapping file mutations and preserve source-to-claim traceability. The external reviewer should have a genuinely separate context/model, while the lead adjudicates rather than simply averaging responses.

**B:** Codex subagent documentation, Claude isolated-agent documentation, Herdr pane/agent controls [D02,D03,D05], and the user's prior experience of misunderstood specifications.

**Q:** This is an engineering governance rationale. There is **no direct experimental evidence** that five named custom agents are the best number, that Sol High beats another model on these exact tasks, or that an extra independent critique always helps. Native GUI operations remain a serialization problem regardless of how many agents exist.

**R:** Coordination overhead and context loss can exceed gains; a “read-only” instruction inside custom Codex TOML does not enforce a separate OS sandbox. Human-facing internal and cross-model critiques are different. Having multiple agents does not itself create genuine independence if they share a loaded brief, evaluative frame or cherry-picked screenshots.

**F:** Compare scoped tasks and actual outcomes; inspect tool/sandbox/skill resolution per agent. Record independently generated critique before disclosing the lead's preferred design. Run only one native GUI driver at a time and show that unrelated windows survive.

**Implemented state:** Five TOML agent files parse syntactically; **none has been spawned and tested**. Their names describe roles, not enforcement. They currently lack per-agent skill-disable selectors and plugin restrictions. Independent Opus is **not** configured as a Codex subagent, and is **not** one of those five.

*[Audit correction to C: (1) In the current untrusted state, none of the five roles is spawnable and the render shows 30 slots, not 4. (2) Codex's built-in policy says "Do not spawn sub-agents unless the user or applicable AGENTS.md/skill instructions explicitly ask", and neither the init prompt nor `AGENTS.md` clearly asks. (3) All Codex agents share one working directory, and full-history forks cannot override model or effort, so a Terra researcher needs `fork_turns: "none"`. (4) Omitted backing and rebuttal: Cemri et al. arXiv:2503.13657 (multi-agent failure categories); Anthropic's multi-agent research post (~15× tokens; coding tasks are less parallelizable); Cognition, "Don't Build Multi-Agents" (share full traces). The audit recommends the lead + Terra researcher + external Opus as the working set until a disjoint parallel slice appears.]*

### Current role/model decision ledger

| Role | Existing file / lane | Model | Status and reason |
| --- | --- | --- | --- |
| Lead | Operator-started Codex pane in **Herdr** | `gpt-6.1-sol` · high | User-selected; model/profile available in local user config; no lead run started here |
| Internal UX critic | `streams_ux_critic.toml` | `gpt-6.1-sol` · high | Optional independent local pass, not equivalent to external Opus |
| Implementer | `streams_implementer.toml` | `gpt-6.1-sol` · medium | Bounded code changes; cost/latency choice is provisional, not benchmarked |
| Native QA | `streams_native_qa.toml` | `gpt-6.1-sol` · high | Interface-state reasoning and user-visible proof; exclusive GUI ownership is organizational |
| Auth/security | `streams_auth_security.toml` | `gpt-6.1-sol` · high | Security/privacy judgments; proposed read-only remit, not sandbox guarantee |
| Research/docs | `streams_docs_researcher.toml` | **`gpt-6.1-terra` · high** | User-corrected from an unjustified Luna choice; requires substantial source criticism, not routine lookup. No claim of measured Terra supremacy. |
| External design critique | Separate **Herdr Claude Code pane**, not a Codex custom agent | **Claude Opus 5.5 · high** | Cross-model design review and post-build critique; not launched by this author |

The earlier Luna assignment had been made by heuristic cost/task classification without performance evidence. It was rejected, the model changed to Terra High, and the source-audit brief strengthened. This correction belongs in the record rather than being erased. A `sandbox_mode = "read-only"` field added transiently to that Codex agent was removed because [D02] says custom-agent sandbox settings do **not** override the parent's sandbox. The correct claim is now “read-only instruction; enforce at parent/session/tool boundary if needed.”

## 5. Toulmin argument D — genuine Opus review in a sibling Herdr pane

**C:** Run Opus as a separate **Claude Code process in another Herdr pane** when the operator's Codex lead requests independent critique; the primary Codex lead is launched inside Herdr by the operator.

**D:** Herdr 0.9.5 is installed on Apollo. Its own CLI/`--skill` documents `HERDR_ENV=1` as a prerequisite for an agent to control the current session, and separates `pane split` from `agent start`. The RDC shell used to prepare this handoff showed `HERDR_ENV` unset, so remote control from here was intentionally avoided. The user clarified that **they** will launch Codex inside Herdr. [LOCAL-OBS; D05].

**W:** Separate processes can use different model, setting sources, hooks and permission surfaces; this is the right boundary for an Opus critique rather than pretending an internal Sol Codex agent is Opus.

**B:** Herdr's official agent automation reference and Claude Code configuration/subagent documentation [D03,D04,D05]. A separate session reduces context coupling, but does not eliminate shared-source framing.

**Q:** The process is **proposed, not yet launched**. Herdr pane separation alone does NOT isolate Claude's user-level `~/.claude/settings.json`, skills or 31 configured hook handlers; those settings must be inspected at launch.

**R:** Opus can inherit user hooks and unrelated skills even in a different pane. An independent critic could still be primed by the lead's already-approved design, or simply read a narrow source subset and miss workflows. Runtime permission restrictions may differ from declarative requests.

**F:** From the operator-started Sol Herdr pane, check `HERDR_ENV=1` and actual pane ID; create/reuse a clearly owned sibling shell pane; start `--kind claude` with explicit chosen model/effort and verified setting sources, avoiding unrelated hooks if possible; give Opus the source corpus and observed native evidence *before* Sol's conclusions; capture review as its own timestamped artifact, and reconcile independently. The Herdr API returns actual IDs; never guess. See [D05]. No Herdr pane/session was created or altered by this author.

*[Audit correction to D: an Opus session started in this repo inside Herdr received the global `CLAUDE.md` chain, this `AGENTS.md`, a Superpowers SessionStart injection, ~100 skills and the 31 user hooks. Its model lineage is independent of the lead's; its framing is not. Scope the lane with `--setting-sources project,local` or `--bare` and confirm the result in the first turn. Additional backing for the cross-lineage choice and for withholding Sol's conclusions: Panickssery et al. arXiv:2404.13076 (self-preference bias). A model critic is not the operator: see audit R2 on operator feel checkpoints.]*

**Do not automate control from RDC outside Herdr**; do not close other panes; do not claim an Opus review was run for this new harness.

## 6. Toulmin argument E — selective domain skills rather than three competing global frameworks

**C:** Expose a few domain-fitting skills to each role, not all of Matt Pocock, Superpowers, Impeccable and TNF/P Stack at once. Source documents (Apple HIG, original TNF principles) should be read as references for relevant design decisions, not as an always-active workflow that dominates engineering.

**D:** The three project-local skills were authored for specific failure conditions: `streams-interaction-design`, `streams-native-acceptance`, `streams-auth-replay`. The Apple skill on Apollo mirrors Apple's HIG, but explicitly calls itself an **unofficial mirror**. The original TNF design-principles file and gesture/interaction notes exist locally. User-level Superpowers is globally enabled and its local `using-superpowers` insists that even 1% possible relevance requires skill invocation. Matt Pocock's current library distinguishes explicit orchestration skills from model-invoked procedures. [E01,P01,P02,D06].

**W:** A reference appropriate to one judgment task should not add mandatory steps to every other task; in particular, GUI interaction must be measured inside IINA, not inferred from a general design skill's templates.

**B:** R01/R02/R05 provide conditional reasons to expect both benefits and interference. Apple's HIG supports platform-conventional behavior; IINA's API documents designated clickable overlay elements. Neither proves the optimal Streams design.

**Q:** The three **new** skills have not been benchmarked. R01 reports that self-generated skills often do not reproduce curated-skill gains. Their creation was justified as an *auditable hypothesis and source pointer*, not as independently validated performance-enhancing knowledge.

**R:** A skill can be too narrow, too long, or trigger at the wrong time. A generic skill may prove better on one task. In the current project config, the global Superpowers plugin remains on and these skills have not been isolated from it. A later version of upstream Matt Pocock skills may differ from the copy locally installed.

**F:** Record skill contents' SHA and upstream version (where available). Compare matched native UX/regression tasks with curated subset, no skills, and Superpowers enabled. Note whether the skill was actually invoked, which references were opened, time/token/tool overhead and which acceptance criteria were satisfied. Keep or delete locally-authored skills on evidence.

**Status:** Files created; filters, automatic invocation accuracy and impact **not validated**.

## 7. Toulmin argument F — hooks and safety must be real mechanisms, not prose

**C:** Distinguish deterministic safety/verification enforcement from reminders in skill files or agent descriptions; avoid high-latency global hooks until their marginal benefit is demonstrated.

**D:** The project config sets `features.hooks = true` but defines **no project hook handlers**. Other user-level profiles such as `macos-design` or `tnf-pstack-lead` define Impeccable PostToolUse and Stop hooks when selected; those opt-in profile hooks are not proved active for this project's ordinary launch. Claude's user settings currently declare 31 hook handlers across 11 lifecycle event classes. [E01,D01,D04]. The global Codex AGENTS.md includes broad procedural guidance; it is not a security policy.

**W:** A declaration that says “don't touch stable” reduces risk only if respected. A true pre-write guard, sandbox, worktree ownership, approvals and reviewable diffs provide stronger protection than a prose-only promise; expensive automatic reviews can also waste time or interfere with correct work.

**B:** Official Codex and Claude docs [D01-D04]; R05's failure taxonomy identifies excessive verification/pipelines as possible regressors.

**Q:** The present configuration should be described as **guidance plus permissions inherited from the user session**, not an engineered protective barrier. A custom Codex agent cannot choose its own read-only sandbox by writing `sandbox_mode` in its agent file [D02].

**R:** Hooks can miss calls, run too late, fail open or block legitimate edits; blindly adding a shell command to every tool event can create more failures than it prevents. Inherited global hooks might already provide some value and are not inventoried at command-output level here.

**F:** Audit resolved runtime hooks and current approvals; run a disposable-file probe; count fires and latency; test that unsafe stable-target operations are rejected before mutation by a proven mechanism. Only then call a safety gate implemented. Never probe by actually attempting an irreversible stable-plugin change.

## 8. Toulmin argument G — couple documents, artifacts and working practices explicitly

**C:** Preserve a short operational entrypoint, a detailed rationale outside the prompt, separate source and evidence ledgers, owner-controlled code files, and native screenshots/logs with checkpoint identity.

**D:** IINA Streams has multiple worktrees and older post-hoc QA reports; some are valid for older v0.5.0 packages but cannot prove today's installed v0.5.1 behavior. New harness files are uncommitted; old clean-branch descriptions were snapshots from before they were created. The user values reversible native design iteration and auditability. [E02; current project reports].

**W:** Explicit provenance, versioned references and mutually consistent pointers reduce the risk of transferring conclusions across branches/builds and claiming a source test establishes a native interaction.

**B:** Domain/engineering rationale from current project experience, [P03] on durable context pointers, [R02] on fixed-checkout paired evaluations, and [D05] on real Herdr agent/pane identity. No cited study proves this exact folder taxonomy superior to every alternative.

**Q:** The recommendation concerns traceability, not guaranteed task pass rates. Extra documentation has upkeep costs and can become stale; avoid creating artifacts that merely paraphrase current config.

**R:** Documentation sprawl can be self-defeating. An agent may prioritize updating ledgers instead of fixing a native UI bug. Auditability can also be achieved by executable checks and hashes without long narratives.

**F:** Given a random native test claim, ask an independent reviewer to recover in under a bounded effort: source commit, installed archive hash, IINA version, exact user journey, screenshot/log proof, and known limitations. Revise folder organization if that chain is too costly. Remove duplicate prose and stale links.

### Intended artifact linkage (not all links are currently automatically validated)

`AGENTS.md` (lightweight task and safety routing)
→ `docs/commission/HANDOFF-SOL61-HIGH-2026-11-09.md` (current intent and scope; reread when beginning substantial work)
→ `docs/harness/EFFECTIVE-LOAD-AUDIT-2026-11-09.md` (what user/project settings appear to load)
→ **this rationale** (why choices were made, source strengths and dissent)
→ `.codex/config.toml` and `.codex/agents/*.toml` (declarative implementation)
→ `.agents/skills/*/SKILL.md` (on-demand procedural packages)
→ `docs/COMMISSION-AUDIT.md` / `docs/EVIDENCE-APPENDIX.md` / `evidence/` (actual behavior evidence, linked to exact checkpoint).
→ `docs/harness/INDEPENDENT-AUDIT-OPUS-2026-11-09.md` + `docs/harness/evidence/2026-11-09-independent-audit/` (independent audit of this rationale and measured runtime state).

**Governance:** Do not update a configuration without adjusting its corresponding account of why, provenance, and effective-loading test. Do not duplicate every config key in always-resident instructions. Keep source registry stable IDs below, with dated revalidation when upstream revises. Store each independent Opus review as a distinguishable source artifact, not as the lead's own claim. The initial file-byte snapshot is recorded separately in `docs/harness/CONFIG-BASELINE-SHA256-2026-11-09.txt`; hashes identify file versions, not their correctness or runtime effect. Do not automatically commit or deploy; ask for or follow the current explicit authorization.

## 9. Platform implementation facts to verify at launch

- **Codex loading:** User config at `~/.codex/config.toml`; trusted repo config at `.codex/config.toml` takes precedence over user-level values; CLI overrides higher still. Untrusted projects may ignore repo config. [D01].
- **Skills:** Explicit `[[skills.config]]` selectors can disable by absolute path or name, with last matching selector winning; changes require a Codex restart. The project presently lacks a positive isolation rule. [D01].
- **Subagents:** Model and effort in `.codex/agents/*.toml` are supported. Parent skills are inherited unless disabled; per-agent `skills.config`, `skills.include_instructions` and `features.plugins` can reduce capabilities. Parent sandbox/approval/provider/MCP still govern. [D02]. *[Audit correction: only per-agent `skills.config` was found on the docs pages read; `skills.include_instructions` and `features.plugins` are unchecked.]*
- **Claude Opus:** A separate Claude Code lane can constrain tools and settings; skill preloading is *not* an exclusive skill allowlist unless Skill discovery/invocation is itself restricted. User hook settings can still apply. [D03,D04].
- **Herdr:** Operator launches Codex locally. Herdr has layout → pane → agent primitives; a shell pane must exist before agent start; only an agent *already inside Herdr* should manipulate its current session. [D05, local CLI `herdr --skill`].
- **Native QA:** IINA's overlay `setClickable` applies to designated `data-clickable` DOM elements, but that contract does not prove modeless direct dragging/resizing over every native OSC region. Native experiment required. [D06].

**Unresolved high-priority configuration questions:** Is this local repo trusted? Which Codex binary/runtime is attached to Herdr and what is its resolved skill catalog? Do the project agent TOMLs show in the chooser? How many user-level skill descriptions and plugin instructions are actually visible? Which profile, if any, is launched? Which hooks fire? Do reviewer instructions run on a separate Claude settings scope? Which new worktree receives uncommitted harness files? Is the Herdr Opus lane accessing the intended same source checkpoint? *[Audit answers: the repo is **not** currently trusted (no entry in `~/.codex/config.toml`). The Codex binary is `~/.npm-global/bin/codex` 0.167.0. The project agent TOMLs do **not** show in the role list. The visible catalog is 75 skills. The Claude Opus lane does **not** run on a separate settings scope unless launched with scoping flags. Still open: whether accepting trust makes the project layer load (audit E1).]*

## 10. Acceptance protocol for this harness design

**Gate 1 — Inventory (mandatory):** Record git status, model/effort, launch CWD, Herdr `HERDR_ENV`/pane ID, project trust, settings precedence, active plugin names, actual skill catalog, current AGENTS chain, hook events and active MCPs. Capture output with sensitive values redacted.

**Gate 2 — Isolation (mandatory):** Apply a *proposed* trusted project filter only after scope review; demonstrate that excluded global skill names do not resolve and the intended local skill does. Probe one internal agent's actual skill and tool surface; do not infer from TOML.

**Gate 3 — Independence (mandatory):** Start Opus in separate Herdr Claude pane with observed settings/tool boundaries. Capture a critique informed by original user experience and native evidence before revealing Sol's preferred resolution; preserve dissents.

**Gate 4 — Native value (mandatory):** Under matched source IINA state, compare task outcomes for minimal / curated / expanded-Superpowers conditions. At minimum: direct chat drag/resize/click-through, clean auth reconnect, correct replay timing, and same-window quality switch. Count work and failures, not just pretty screenshots.

**Gate 5 — Maintainability (after implementation):** Restore a fresh worktree from a named checkpoint + instructions; build and test without copying secrets or modifying the stable plugin. A reviewer should trace each behavior claim to exact files/evidence and explain why the included skill was useful.

No gate has yet been declared passed. Their presence in this document is an audit plan, not test evidence.

*[Audit correction: Gate 1 can now be run read-only with `docs/harness/evidence/2026-11-09-independent-audit/REPRODUCE.sh`. Gate 4's matched minimal/curated/Superpowers comparison is judged close to infeasible: one serialized GUI operator, few repeatable tasks, high run variance. The audit proposes per-slice logging of skill invocations, change-to-native-observation time, iterations and operator acceptance instead (audit R5).]*

## 11. Source register — audit trail and reading depth

The link list is intentionally mixed: platform specification, maintainer artifacts, empirical research, theoretical argument and directly inspected local files. They do not have equal epistemic status.

| ID | Source, version and link | Kind / inspected depth | What it warrants | What it cannot warrant |
| --- | --- | --- | --- | --- |
| M01 | Stephen E. Toulmin, *The Uses of Argument* (1958; updated ed. Cambridge UP, 2003), https://www.cambridge.org/core/books/the-uses-of-argument/26CF801BC12004587B66778297D5567C | Publisher book metadata and description, **not full book** | Toulmin as an argumentative framework | AI harness performance |
| M02 | Purdue OWL, Toulmin Argument, https://owl.purdue.edu/owl/general_writing/academic_writing/historical_perspectives_on_argumentation/toulmin_argument.html | University teaching exposition, main explanation | Claim/grounds/warrant/qualifier/backing/rebuttal vocabulary | Primary reading of Toulmin's entire argument |
| R01 | Li et al., *SkillsBench*, **arXiv:2602.12670v4**, 2026-06-14, https://arxiv.org/html/2602.12670 | Peer-public preprint; inspected abstract, methods headings, results/ablations/limitations | Heterogeneous curated-skill value; focused-skill hypothesis; evaluate matched tasks | Transfer to native GUI/Herdr/Sol without trials; current skill count efficacy |
| R02 | Han et al., *SWE-Skills-Bench*, **arXiv:2603.15401v2**, 2026-10-27, https://arxiv.org/html/2603.15401v2 | Preprint; inspected abstract, experiment construction, paired method and results | Many SWE skills ineffective, harm cases, harness dependence | Any named skill's exact effect on Apollo |
| R03 | Gloaguen et al., *Evaluating AGENTS.md*, 2026 (now **v3**, 2026-09-29), https://arxiv.org/html/2602.11988 | Preprint/ICLR 2026 workshop; inspected main setup/results and limits | Risk of added context cost; no general task-success gain in tested setting | All long-form docs are necessarily bad |
| R04 | Lulla et al., *On the Impact of AGENTS.md Files on the Efficiency of AI Coding Agents*, 2026, https://arxiv.org/abs/2601.20404 | Preprint metadata/abstract **only** | A contrasting empirical claim about runtime/output-token efficiency | Definitive conflict resolution; reproducing its stats/method |
| R05 | Dong et al., *Agent Skills Can Be Harmful*, Microsoft Research, Aug 2026, https://www.microsoft.com/en-us/research/publication/agent-skills-can-be-harmful-an-empirical-study-of-skill-induced-failures-in-llm-agents/ | Institutional abstract **only** | Plausible failure-mode taxonomy: unnecessary verification and heavy pipelines | A full-paper causal audit or proof against Superpowers |
| P01 | Matt Pocock, *skills* Engineering README, https://github.com/mattpocock/skills/blob/main/skills/engineering/README.md | Current upstream maintainer documentation, selective read | Composable taxonomy/skill invocation design | Independently measured superiority |
| P02 | Obra, *Superpowers*, https://github.com/obra/superpowers ; local `skills/using-superpowers/SKILL.md` | Maintainer docs + local complete skill read | Prescriptive workflow and actual invocation philosophy | That using/disabling it is beneficial in IINA |
| P03 | Local Pocock-style `~/.codex/skills/writing-for-agents/SKILL.md` | Full local file read, revision not pinned to upstream | Context pointers, branching, de-duplication and skill-writing criteria as craft reasoning | Independent outcome evidence or current upstream identity |
| D01 | Codex config basics, https://learn.chatgpt.com/docs/config-file/config-basic ; build skills, https://learn.chatgpt.com/docs/build-skills | First-party docs, relevant subsections | Trust/precedence and filter syntax | Actual runtime load on Apollo |
| D02 | Codex custom subagents, https://learn.chatgpt.com/docs/agent-configuration/subagents | First-party docs, role schema, inheritance/permissions sections | Custom agent TOML and constraints | Enforcement of a read-only promise by agent prose |
| D03 | Claude Code subagents, https://code.claude.com/docs/en/sub-agents | First-party docs, tool/skill and agent setup sections | Separate Claude role and skill preloading semantics | Current per-process hook isolation |
| D04 | Claude Code skills and settings, https://code.claude.com/docs/en/skills ; https://code.claude.com/docs/en/settings | First-party docs, relevant sections | Skill access controls and user/project settings | That particular hooks actually fired |
| D05 | Herdr agent automation, https://herdr.dev/tui/docs/agent-automation/ ; local `herdr --skill` | Official docs read + CLI help inspected at 0.9.5 | Separate pane/agent lifecycle and ownership | Currently active Herdr processes from a non-Herdr RDC shell |
| D06 | Apple HIG https://developer.apple.com/design/human-interface-guidelines/ ; IINA overlay API https://docs.iina.io/interfaces/IINA.API.Overlay | HIG local unofficial mirror inspected at skill level; IINA API web reference | Mac idiom, designated overlay interaction mechanisms | Exact native interaction success without testing |
| E01 | Apollo `~/.codex/config.toml`, `~/.codex/AGENTS.md`, `~/.claude/settings.json`, `~/.agents/skills`, `~/.codex/skills` | Read-only local config scan, counts and selected keys; secrets never printed | Current configuration inventory | Complete live injected context/hook output |
| A01 | Independent audit, `docs/harness/INDEPENDENT-AUDIT-OPUS-2026-11-09.md` (2026-11-09) | Runtime render via `codex debug prompt-input`; abstract-level re-check of R01–R05, D01–D05 | Measured catalog, roles and slots in the untrusted state; citation accuracy | Behavior after trust is accepted; full paper bodies |
| A05 | Terra High full-text reading of R01–R05, `docs/harness/evidence/2026-11-09-independent-audit/FULLTEXT-READING-R01-R05.md` | All text lines of the five arXiv PDFs (pdftotext); 6 locators spot-checked by the auditor | Body-level verification of R01–R05 claims; neglected findings | Independent replication; figures beyond their extracted text |
| A02 | Cemri et al., *Why Do Multi-Agent LLM Systems Fail?*, arXiv:2503.13657 v3 | Abstract | Three failure categories relevant to Argument C | Effect sizes for this harness |
| A03 | Anthropic, *How we built our multi-agent research system* (2025-06-13); Cognition, *Don't Build Multi-Agents* (2025-06-12) | Relevant passages | Practitioner limits on multi-agent coding; context-sharing | Controlled evidence |
| A04 | Panickssery et al., arXiv:2404.13076 | Abstract | Self-preference bias in LLM evaluators (backing for Argument D) | That cross-model critique substitutes for the operator |
| E02 | This repo `.codex/config.toml`, `.codex/agents/*.toml`, `.agents/skills/*`, `AGENTS.md`, `docs/harness/EFFECTIVE-LOAD-AUDIT-2026-11-09.md` | Complete local files or tested headers/content; TOML parsed | Actual initial scaffolding and omissions | Runtime success / compliance |

### Methodological caveats and further reading

1. **Version drift:** Cite R01 as `v4` (+16.6pp, 87 tasks), not the older abstract that reports +16.2pp / 86 tasks. Cite R02 as `v2` (98 skills, +0.3pp), not earlier v1/secondary claims. Update pinned versions when papers revise; preserve what earlier auditors actually saw.
2. **Study designs differ:** SkillsBench pairs high-quality curated skills with diverse tasks; SWE-Skills-Bench evaluates individual public SWE skills under generated requirement-driven checks. They answer different questions. Gloaguen and Lulla likewise optimize distinct context-file outcomes. The proper response is explicit transfer conditions and new measurement, not an alleged single coherent theory.
3. **Research depth:** This author did **not** read every relevant paper in full or conduct a formal systematic literature review. R01–R03 have relevant sections inspected; R04/R05 only abstracts and metadata. No claims about their full appendices, preregistration, statistical power or reproducibility beyond the visible text. Future expert audit should open original figures/tables, cross-check code/data, and revisit strongest methodological weaknesses.
4. **Construct validity:** Quantified task pass/fail does not substitute for interface appropriateness, readability, tactile feel, direct manipulation, full accessibility or the operator's aesthetic judgments. A protocol that optimizes only a verifier can reproduce the original IINA failure: “tests pass” while actual UX is bad.
5. **Source dependence:** Upstream docs demonstrate supported configuration surfaces, maintainers express a practice preference, benchmarks supply conditional empirical effects, and local traces show what really ran. These source classes can support one another, disagree productively or leave gaps. Do not let citation density hide a missing bridge.
6. **Audit against practice:** Every recommendation in this rationale must be checked against the actual effective Herdr/Codex/Claude context, actual source and **native** IINA behavior. If practice contradicts the rationale, update the rationale and implementation rather than dismissing the observation.
