# Full-text reading of R01–R05: gpt-6.1-sol (high), comparison lane

Same brief, corpus and flags as the Terra lane (`FULLTEXT-READING-R01-R05.md`), except `-m gpt-6.1-sol -c model_reasoning_effort="high"`. Run via `codex exec`, read-only, ephemeral, 2026-11-09. Session: 01a1c16e-7a4c-79c3-96fd-0cac4ec96ffe. Tokens: 184,661. This is Sol's own report. See `READING-LANES-COMPARISON.md` for the auditor's checks.

---

# Source-critical assessment

**Bottom line:** The corpus supports **selective, task-relevant guidance and conditional verification**, not a universal “less context, fewer checks” rule. It does **not establish** that role splitting, an external Claude reviewer, or one serialized GUI tester improves this particular IINA workflow.

Verdicts below concern **what the supplied texts report**, not independent replication. Quotes are under 40 words; line wrapping is collapsed.

## Reading coverage

All five files were read sequentially in numbered chunks, including references, appendices, and limitations. Nothing was supplied from memory or the web; no files were modified.

| File | Line ranges actually read | Parts skipped |
|---|---|---|
| [2602.12670v4.txt — R01](2602.12670v4.txt) | 1–220; 221–450; 451–750; 751–1050; 1051–1400; 1401–1700; 1701–2050; 2051–2350; 2351–2700; 2701–3087; 3088 | None |
| [2603.15401v2.txt — R02](2603.15401v2.txt) | 1–240; 241–490; 491–750; 751–980; 981–1163; 1164 | None |
| [2602.11988v3.txt — R03](2602.11988v3.txt) | 1–240; 241–480; 481–750; 751–1020; 1021–1280; 1281–1548; 1549 | None |
| [2601.20404v2.txt — R04](2601.20404v2.txt) | 1–125; 126–245; 246–327; 328 | None |
| [2608.11888.txt — R05](2608.11888.txt) | 1–180; 181–350; 351–500; 501–650; 651–806; 807 | None |

The final numbered line in each file contains only an unterminated form-feed character; `wc -l` therefore reports one fewer. Coverage and key arithmetic were rechecked with read-only commands. Linked repositories, online supplements, and original PDF layouts were **not inspected**.

## A. Claim checks

### A1. R01 — SkillsBench v4

| Claim | Verdict and evidence |
|---|---|
| 87 tasks, 8 domains, 18 configurations | **SUPPORTED.** “87 tasks across 8 domains”; “18 model–harness configurations.” `2602.12670v4.txt:27–30` |
| 33.9% → 50.5%, +16.6pp; configuration range | **SUPPORTED.** “from 33.9% to 50.5% (+16.6 percentage points”; gains range “from +4.1 to +25.7 pp.” These are configuration-macro aggregate results. `2602.12670v4.txt:30–32,374–400` |
| Software Engineering +11.6pp, N=16 | **SUPPORTED.** Table row: “Software Engineering 16 37.6% 49.2% +11.6”. This is 16 tasks averaged across configurations, not an IINA-like project trial. `2602.12670v4.txt:446–458` |
| 2–3 skills +19.0pp versus ≥4 +10.1pp | **SUPPORTED numerically; PARTLY as a causal sizing rule.** “2–3 Skills gain +19.0 pp”; “≥ 4 Skills give only +10.1 pp.” Table 8 groups **43 versus 21 different tasks** by attached skill count; it does not vary catalog size within the same task. `2602.12670v4.txt:499–507,2203–2212` |
| Self-generated skills below no-skill baseline | **SUPPORTED on all three tested configurations**, not all 18: “Self-generated Skills land below the no-Skills baseline on all three configurations.” Deltas: Claude Code/Opus 4.7 −8.1pp; Codex/GPT-5.5 −11.3pp; Gemini CLI/Gemini 3.1 Pro −11.5pp. `2602.12670v4.txt:464–471,1439–1453` |
| GUI, multi-agent, long-horizon limitations | **SUPPORTED explicitly.** “results may not transfer directly to GUI agents, multi-agent coordination, or very long-horizon workflows.” `2602.12670v4.txt:538–542` |

### A2. R02 — SWE-Skills-Bench v2

| Claim | Verdict and evidence |
|---|---|
| 92 ineffective, 4 beneficial, 2 harmful; 76.6% → 76.9% | **SUPPORTED under its classification protocol.** “92 … Ineffective, compared with four Golden and two Harmful”; exact aggregate: “76.59% to 76.93%.” Crucially, “Ineffective means that no directional effect was detected with ten requirements, not that the effect is zero.” `2603.15401v2.txt:313–314,377–380` |
| 40/98 changed effect sign between two harnesses on the same model | **SUPPORTED as observed deltas.** With **Kimi-K2.6**, “40 of the 98 skills change sign between Codex and Claude Code.” Figure 7 cautions: “observed effects, not significant interactions.” `2603.15401v2.txt:503–507,760–762` |
| Requirements/tests generation | **SUPPORTED: model-generated, skill-derived requirements and generated executable oracles.** A “fixed requirement-engineer prompt” produces ten requirements from the skill, repository metadata, and structure; a “professional test engineer” prompt generates deterministic pytest tests from acceptance criteria. `2603.15401v2.txt:253–278` |
| Runs per condition | **SUPPORTED: one run per requirement × configuration × condition.** “run every task once without the skill and once with it”; 98 skills × 10 requirements × 4 configurations = **3,920 pairs / 7,840 executions**, not repeated trials per cell. Infrastructure failures are rerun. `2603.15401v2.txt:37–43,318–324` |
| Statistical test | **SUPPORTED:** “exact two-sided paired sign-flip test” on ten requirement-level deltas; p<0.05 determines Golden/Harmful. Overall analysis first averages configurations within each requirement. Paired-t and exact-Wilcoxon sensitivity checks give the same 4/2/92 classification. `2603.15401v2.txt:301–314,809–816` |

The test-generation prompt requires “≥ 10 test cases per task”; this is a construction instruction, not evidence that every generated oracle is correct. `2603.15401v2.txt:985–999`

### A3. R03 — Evaluating AGENTS.md v3

| Claim | Verdict and evidence |
|---|---|
| No general success gain | **SUPPORTED as failure to detect a general improvement—not equivalence.** “does not generally improve task success rates.” Developer files nevertheless show +2.4 percentage-point average improvement, p=0.21, and outperform generated files, p=0.038. `2602.11988v3.txt:31–39,363–368` |
| >20% cost | **PARTLY; the abstract overgeneralizes relative to the body.** Abstract: “increasing inference cost by over 20% on average.” Body: generated files +20% on SWE-bench and +23% on CTXBench; developer files “at most 19%.” A claim that **both file types** increased average cost >20% is contradicted by that body passage. `2602.11988v3.txt:32–35,347–368` |
| Broader exploration/tool use | **SUPPORTED.** Agents “run more tests”; “search more files … read more files, and write more files,” and use more repository-specific tooling. `2602.11988v3.txt:435–447,473–474` |
| Useful for non-standard coding practices | **SUPPORTED as the authors’ conclusion**, not a separately quantified compliance result: “context files are useful for specifying non-standard coding practices.” Their recommendation is instructions absent from the README, including conventions/non-functional requirements. `2602.11988v3.txt:37–39,89–91` |
| Languages/tasks | **SUPPORTED: Python-focused.** SWE-bench Lite: 300 tasks from 11 popular Python repositories. CTXBench: 138 bug-fixing/feature-addition instances across 12 repositories; construction requires Python as the main language. `2602.11988v3.txt:75–78,176–193,283–286` |
| What “developer-written” means | **PARTLY if interpreted as confirmed wholly human-authored.** Files are developer-committed root AGENTS.md/CLAUDE.md, taken from pre-patch states. The authors infer they are “likely to be human-written or edited” from distribution/detector differences; authorship is not directly established. `2602.11988v3.txt:176–181,261–262,292–293,1165–1169` |

### A4. R04 — AGENTS.md efficiency v2

| Claim | Verdict and evidence |
|---|---|
| 10 repositories, 124 PRs | **SUPPORTED.** “We analyze 10 repositories and 124 pull requests.” `2601.20404v2.txt:25–26` |
| −28.64% median runtime; −16.58% output tokens | **SUPPORTED, both are median comparisons.** Runtime: 98.57s → 70.34s; output: 2,925 → 2,440 tokens. These are reductions between condition medians, **not the median of per-task percentage reductions**. `2601.20404v2.txt:187–212` |
| Paired or observational? | **SUPPORTED: paired within-task intervention**, with observationally sourced repositories/PRs—not merely a cross-repository correlation. “paired within-task design … varying only the presence of AGENTS.md.” One agent configuration: Codex/gpt-5.2-codex. `2601.20404v2.txt:96–110,139–150` |
| Acknowledged confounders | **SUPPORTED.** Effects may depend on “agent stochasticity,” framework/model, and selected-task characteristics. Crucially, “A comprehensive evaluation of the output quality … is beyond the scope of this paper”; only 50 tasks received a non-trivial-output sanity check. `2601.20404v2.txt:174–183,214–229` |

The starred runtime/output differences use a **Wilcoxon signed-rank test, p<0.05**. `2601.20404v2.txt:212`

### A5. R05 — Agent Skills Can Be Harmful

| Claim | Verdict and evidence |
|---|---|
| 307 cases: 125 functional, 182 efficiency | **SUPPORTED.** “307 confirmed skill-induced failures: 125 functional failures and 182 high-confidence efficiency regressions.” These are refined analysis cases, not a population failure rate. `2608.11888.txt:279–307` |
| Excessive verification 67; heavy pipelines 30; category | **SUPPORTED:** both belong to **Excessive Procedure**, totaling 114/182 efficiency regressions alongside 17 excessive-exploration cases. Table: “Excessive Verification … 67”; “Heavy Implementation … Pipeline … 30.” `2608.11888.txt:463–481` |
| Source benchmarks | **SUPPORTED:** SkillsBench and SWE-Skills-Bench, augmented with metadata-similar public skills from smithery.ai/skillsmp.com. Runs use OpenCode 1.15.1 + Claude Opus 4.6. `2608.11888.txt:178–194,216–236` |
| Attribution method | **SUPPORTED as contrastive manual attribution.** Reference execution is a “pseudo-oracle, not … a ground-truth solution.” Cases are filtered for ambiguity/verifier narrowness/duplicates, manually inspected, assigned one root cause, and finalized through “group consensus.” `2608.11888.txt:183–194,279–303` |
| Efficiency criterion | **SUPPORTED:** both token and time ratios must exceed 1; at least one must exceed **2.0**. Only PASS/PASS pairs qualify. `2608.11888.txt:246–258` |
| Length/prompt-length finding | **SUPPORTED, but not a universal length law.** Context-bloat cases: **43 mandatory-body versus 3 supplementary-material** cases. Overall regressions are dominated by “Excessive Procedure rather than prompt length alone.” **NOT FOUND:** a controlled skill-length experiment or universal safe-length cutoff. `2608.11888.txt:398–442,487–510` |

## B. Methodological weaknesses

“Admitted” identifies the authors’ caveats; “reader inference” identifies my assessment.

| Paper | Authors’ admitted limitations | Reader inference |
|---|---|---|
| **R01** | No length-matched controls; self-generation mixes content, discovery, and creator/solver interference; imperfect determinism/contamination control. `2602.12670v4.txt:543–555` | Selection favors skill benefit: “significantly easier with Skills” is required, and no-separation tasks are rejected. Count/length buckets compare different tasks, so they do not establish causal catalog-size effects. `:273–275,1113,2206–2225` |
| **R02** | Synthesized requests are not natural request distributions; generated verifiers can miss behavior/favor implementations; repetition and greater power are future work. `2603.15401v2.txt:613–618` | Single runs confound individual paired changes with stochastic variation; ten requirements provide limited power. Per-skill p<0.05 labels are reported without a multiple-testing correction in the stated protocol. `:37–45,304–314` |
| **R03** | Python/pretraining coverage may nullify guidance benefits; task resolution does not measure code efficiency or security. `2602.11988v3.txt:563–573` | “We sample completions … once” limits precision. Generated descriptions/tests use reference patches; manual revision of 25/138 cases mitigates but does not eliminate oracle/selection bias. `:206–239,280,1171–1183` |
| **R04** | Explicitly acknowledges stochasticity, one framework/model, narrow selected tasks, and absence of comprehensive correctness evaluation. `2601.20404v2.txt:174–183,213–229` | Faster output is not established equal-quality output. Repeat counts/order randomization are not specified in the execution account; ≤100-LoC/≤5-file selection and generated PR-diff-based requests restrict transfer. `:148–168,182–183,127–137` |
| **R05** | Manual attribution is subjective; ordinary variance and verifier narrowness require judgment; findings may depend on model/harness/task/skill ecosystem. `2608.11888.txt:609–639` | Failure-enriched case mining cannot estimate prevalence or net benefit. Three attribution votes reuse the same execution evidence—they are not task replications; contrastive pairs alone do not fully isolate stochastic causation. `:279–303,582–594` |

**Additional R01 caution:** self-generated Claude runs use max effort versus high for baselines; generated packs often go undiscovered, and some verifier interpretations changed after runs. Thus “models cannot author useful skills” exceeds the experiment. `2602.12670v4.txt:1455–1457,1495–1526`

## C. Neglected content relevant to the harness

### 1. Procedural specificity helps; this is not simply “keep everything short”

- **R01:** skills help with “concrete procedures and verifier-facing details (steps, constraints, sanity checks).” This is the authors’ synthesis, not a length-matched procedural-versus-declarative experiment. `2602.12670v4.txt:513–527`
- **R01:** benchmark skills came from the “top quality quartile”; the benchmark represents “an optimistic scenario.” Catalog pruning cannot substitute for authoring quality and matching. `2602.12670v4.txt:1004–1012`
- **R02:** the helpful Viper skill supplies a “procedural mapping … to concrete library operations”; its example skill is **13.2K characters/13 sections**. **Cuts against:** treating compactness itself as sufficient or longer guidance as intrinsically harmful. `2603.15401v2.txt:413–424,449–473`

### 2. Small attached bundles are not small global catalogs

**R01:** Table 8 measures “number of Skills attached to a task.” It does not test discovery among hundreds of catalog entries or a two-/three-skill global cap. **Cuts against:** presenting +19.0pp versus +10.1pp as an experimentally established catalog-size prescription. `2602.12670v4.txt:2203–2212`

### 3. Applicability and task precedence matter even for relevant skills

- **R01:** negative cases share a pipeline “without applicability boundaries or lightweight fallbacks.” `2602.12670v4.txt:491–497`
- **R02:** “concrete, opinionated templates with hard-coded paths and values” can override explicit requirements. `2603.15401v2.txt:487–502`
- **R05:** only **2/125** functional cases were Applicability Mismatch; many relevant skills still distorted implementation. Authors recommend separating “mandatory task requirements from examples, defaults, reusable templates, and optional workflows.” **Cuts against:** assuming task-specific selection alone prevents harm. `2608.11888.txt:379–394`

### 4. Harness dependence is substantive, not a footnote

**R01:** “the harness’s discovery, prompting, execution, and tool-use loop mediate realized benefit.” R02’s shared-model sign reversals reinforce the need for local evaluation. **Cuts against:** transporting a skill verdict unchanged between Codex lead, subagents, and Claude reviewer. `2602.12670v4.txt:433–438`; `2603.15401v2.txt:503–507`

### 5. R03 does not establish “shorter AGENTS.md causes better performance”

**R03:** “no clear dependency between the success rate or the per-instance cost and the context file length.” Its proposed mechanism is instruction-induced work, not simply token count. **Cuts against:** a purely length-based justification for shortening AGENTS.md. `2602.11988v3.txt:1031–1036`

It also finds generated context files improve performance **2.7 points** when other documentation is removed: “context files are the only source of documentation available.” **Cuts against:** interpreting the paper as evidence that repository context is useless. `2602.11988v3.txt:1002–1029`

### 6. On-demand pointers have support—but not a direct AGENTS.md trial

**R05:** “keep always-loaded instructions short” and move material behind “explicit lazy-loading triggers.” This supports a packaging principle for **skills**; applying it to AGENTS.md is a transfer inference. R03 does not experimentally test short pointer files against long self-contained files. `2608.11888.txt:433–442`

### 7. Verification can be the missing beneficial procedure

**R02:** without the Vitest skill, one configuration “submits untested code”; with it, the agent “installs the dependencies” and “runs the tests to green.” Other configurations already do this, so marginal benefit differs. **Cuts against:** blanket avoidance of verification infrastructure. `2603.15401v2.txt:508–518,590–597`

**R01:** a self-generated radar pack omits the curated “autocorrelation cross-check,” allowing implausible output. Successful authoring includes “sanity checks.” **Cuts against:** removing checks merely because they add steps. `2602.12670v4.txt:1511–1514,513–514`

### 8. R05 advocates calibrated verification, not minimal verification

**R05:** “condition verification scope and pipeline depth on task uncertainty, change size, and budget.” Its policy discussion would “preserve careful skill-guided workflows.” **Supports:** avoiding unconditional heavyweight pipelines. **Cuts against:** using the 67 cases to justify uniformly weak checking. `2608.11888.txt:496–500,595–605`

### 9. R04 is a counterweight, but not equal-quality evidence

R04’s efficiency gain is positive evidence for useful repository instructions. Yet it says resource metrics “do not capture whether agent-produced changes are correct, maintainable, or aligned with developer intent.” **Cuts against:** equating faster completion with successful human-acceptable UI work. `2601.20404v2.txt:224–242`

Its table also shows **higher median input and total tokens**, despite lower output tokens. “Reduced tokens” needs qualification. `2601.20404v2.txt:194–210`

### 10. Role splitting and GUI transfer remain untested

**R03** leaves Claude’s Task tool enabled, allowing “sub-agents … to solve sub-tasks,” but does not ablate role splitting. **R01** explicitly excludes direct transfer to GUI/multi-agent/very-long-horizon settings. **NOT FOUND:** comparative evidence for the proposed lead/worker/external-reviewer arrangement or serialized GUI testing. `2602.11988v3.txt:813–821`; `2602.12670v4.txt:538–542`

### 11. The benchmark versions are not interchangeable

R05 describes SkillsBench as “84 evaluated tasks across 11 domains” and SWE-Skills-Bench as “490 … task instances.” Supplied R01 instead reports **87/eight**; supplied R02 has **980 requirements**. **Cuts against:** pooling their numbers as measurements of identical benchmark snapshots. `2608.11888.txt:178–185`; `2602.12670v4.txt:27–30`; `2603.15401v2.txt:318–322`

## D. Transfer judgment — **my inference**

| Paper | What it can and cannot warrant for this IINA project |
|---|---|
| **R01** | Warrants trying curated procedures for unfamiliar plugin APIs, artifact constraints, and repeatable checks. It cannot establish a catalog cap, GUI-quality gain, multi-agent topology, or long-project benefit; terminal verifiers are not direct-manipulation usability judgments. |
| **R02** | Warrants testing each skill’s marginal contribution in the actual model/harness and protecting explicit requirements from templates. It cannot warrant dropping visual/design guidance: subjective/generative skills were explicitly excluded from selection (`2603.15401v2.txt:241–247`). |
| **R03** | Warrants skepticism toward redundant generated overviews and retaining genuinely non-standard conventions. It cannot establish an ideal AGENTS.md length or show that human visual acceptance, interaction quality, and macOS-specific practices receive no benefit. |
| **R04** | Warrants a local efficiency experiment with repository instructions on small coding changes. It cannot establish equal correctness/usability, benefits on larger UI changes, or that shorter files/pointers outperform substantive instructions. |
| **R05** | Warrants conditional checklists, lazy-loaded detail, applicability boundaries, and monitoring induced work. It cannot identify the optimal verification burden for human-judged GUI work: passing the same deterministic oracle is a weaker equivalence criterion than equal interaction quality. |

**Overall inference:** Keep **task-specific guidance and risk-calibrated checks** as provisional design choices. Treat short catalogs, pointer-based AGENTS.md, role splitting, external review, and serialized GUI access as separate hypotheses—not one jointly established conclusion from these papers.