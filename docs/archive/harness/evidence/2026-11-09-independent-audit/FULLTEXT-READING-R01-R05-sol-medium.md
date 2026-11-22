# Full-text reading of R01–R05: gpt-6.1-sol (medium), comparison lane

Same brief, corpus and flags as the Terra lane (`FULLTEXT-READING-R01-R05.md`), except `-m gpt-6.1-sol -c model_reasoning_effort="medium"`. Run via `codex exec`, read-only, ephemeral, 2026-11-09. Session: 01a1c16e-7a4c-7843-a103-9ad2328705b6. Tokens: 168,670. This is Sol's own report. See `READING-LANES-COMPARISON.md` for the auditor's checks.

---

# Source-critical reading of R01–R05

**Bottom line—inference:** these papers support selective, empirically evaluated guidance and task-proportionate workflows. They do **not** establish that short catalogs, short AGENTS.md files, split roles, or minimal verification are jointly optimal for this macOS GUI project.

Locators below refer exclusively to the supplied text files. **R01–R05 are file aliases**, defined in the coverage table. Verdicts assess correspondence with the supplied text, not independent replication. Every quotation is under 40 words.

## A. Claim checks

### A1. R01 — SkillsBench v4

| Claim | Verdict | Evidence and qualification |
|---|---|---|
| 87 tasks, 8 domains, 18 configurations | **SUPPORTED** | “87 tasks across 8 domains”; “18 model–harness configurations” (R01:27–30). |
| 33.9% → 50.5%, +16.6pp; configuration range | **SUPPORTED** | Table 2: “Mean … 33.9 … 50.5 … +16.6” (R01:400). Gains range “+4.1 to +25.7 pp” (R01:359–363). |
| Software Engineering +11.6pp, N=16 | **SUPPORTED** | Table 3: “Software Engineering … 16 … 37.6% … 49.2% … +11.6” (R01:457). This is a task/configuration aggregate, not a prediction for arbitrary software work. |
| 2–3 skills +19.0pp versus ≥4 +10.1pp | **SUPPORTED**, descriptively | Table 8: “2–3 … 43 … +19.0”; “≥4 … 21 … +10.1” (R01:2206–2212). These are **different task groups**, not a randomized same-task catalog-size intervention. |
| Self-generated skills below no-skill baseline | **SUPPORTED on three configurations**, not all 18 | “below the no-Skills baseline on all three configurations” (R01:467–468): Claude Code/Opus 4.7 −8.1pp; Codex/GPT-5.5 −11.3pp; Gemini CLI/Gemini 3.1 Pro −11.5pp (R01:1442–1446). |
| GUI, multi-agent, long-horizon limitations | **SUPPORTED** | “results may not transfer directly to GUI agents, multi-agent coordination, or very long-horizon workflows” (R01:538–542). |

**Important qualification:** self-generation mixes authoring quality with discovery and creator/solver interference (R01:543–549). Packs were regenerated per Claude trial but reused across Codex/Gemini solver trials; Claude also used a different effort setting from its baseline (R01:1420–1427,1455–1457).

### A2. R02 — SWE-Skills-Bench v2

| Claim | Verdict | Evidence and qualification |
|---|---|---|
| 92 ineffective, 4 beneficial, 2 harmful | **SUPPORTED** | “92 … Ineffective, compared with four Golden and two Harmful skills” (R02:377–379). These are **overall** classifications; configuration-specific counts differ (R02:327–345). |
| 76.6% → 76.9% | **SUPPORTED** | Exact pooled figures: “76.59 … 76.93 … +0.34” (R02:388–397). This is **mean fraction of verifier checks passed**, not whole-task success rate (R02:236–238). |
| 40/98 change sign between harnesses on one model | **SUPPORTED as observed signs** | “with Kimi-K2.6, the observed deltas of 40 of the 98 skills change sign between Codex and Claude Code” (R02:506–507). Figure 7 explicitly says “not significant interactions” (R02:760–762). |
| Requirements generated from skills | **SUPPORTED** | A “fixed requirement-engineer prompt” produces ten requirements from skill content, repository metadata and structure (R02:254–262). |
| Tests generated | **SUPPORTED** | A model receives requirements and repository metadata through a fixed “professional test engineer” prompt and generates deterministic pytest tests (R02:269–278). The prompt demands “≥ 10 test cases per task” (R02:996–998). Generator model identity is **NOT FOUND** in the supplied construction description/prompts. |
| Runs per condition | **SUPPORTED: one** | “run every task once without the skill and once with it” (R02:40–41): 980 requirements × four configurations = 3,920 pairs; infrastructure failures rerun until clean (R02:318–324). |
| Statistical test | **SUPPORTED** | “exact two-sided paired sign-flip test” over ten requirement-level deltas, threshold p<0.05 (R02:304–314). Sensitivity analyses use paired t and exact Wilcoxon tests, yielding the same overall labels (R02:809–816). |

Crucially: “Ineffective means that no directional effect was detected with ten requirements, not that the effect is zero” (R02:313–314).

### A3. R03 — Evaluating AGENTS.md v3

| Claim | Verdict | Evidence and qualification |
|---|---|---|
| No general success gain | **SUPPORTED**, not equivalence | “including context files does not significantly affect performance” (R03:82). Developer files nevertheless improve performance by 2.4% on average, p=0.21 (R03:363–368). |
| >20% cost | **PARTLY** | The abstract says “increasing inference cost by over 20% on average” (R03:32–35). Body: generated files increase cost by 20%/23% across the two benchmarks, but developer files are described as “at most 19%” (R03:359–368). Do not apply >20% indiscriminately to developer files. |
| Broader exploration/tool use | **SUPPORTED** | Agents “search more files (grep), read more files, and write more files”; tests and repository-specific tooling also increase (R03:435–447). |
| Useful for non-standard practices | **SUPPORTED as the authors’ conclusion** | “useful for specifying non-standard coding practices” (R03:37–39). Tool-following evidence supports behavior steering; it does not demonstrate downstream maintainability or security benefits (R03:475–495,570–573). |
| Languages/tasks | **SUPPORTED: Python issue resolution/features** | CTXBench: 138 bug-fixing/feature-addition instances across 12 repositories (R03:75–78); SWE-bench Lite: 300 tasks from popular Python repositories (R03:283–286). |
| What developer files? | **SUPPORTED, with authorship uncertainty** | Root AGENTS.md/CLAUDE.md from repositories primarily using Python, with tests and ≥400 PRs; pre-patch versions are used (R03:176–181,292–293). They are developer-**committed**, “likely to be human-written or edited,” not authenticated purely human authorship (R03:261–262). |

### A4. R04 — AGENTS.md efficiency v2

| Claim | Verdict | Evidence and qualification |
|---|---|---|
| 10 repositories, 124 PRs | **SUPPORTED** | “10 repositories and 124 pull requests” (R04:25). |
| −28.64% median runtime | **SUPPORTED** | Table 1: median 98.57s → 70.34s, 28.64% reduction (R04:190–193). |
| −16.58% output tokens | **SUPPORTED for the median** | Median 2,925 → 2,440, 16.58%; mean reduction is 20.08% (R04:202–205). |
| Paired or observational? | **SUPPORTED: paired intervention on observationally sourced tasks** | “paired within-task design” holds repository/task/state fixed and varies file presence (R04:139–150). It is not merely a cross-repository presence/absence correlation; randomized execution order is **NOT FOUND**. |
| Confounders acknowledged | **SUPPORTED** | Effects may depend on “agent stochasticity, the specific agent framework and model used, and the characteristics of the selected tasks” (R04:213–223). Correctness is outside the comprehensive evaluation scope (R04:174–183). |

### A5. R05 — Agent Skills Can Be Harmful

| Claim | Verdict | Evidence and qualification |
|---|---|---|
| 307 failures: 125 functional, 182 efficiency | **SUPPORTED** | “307 confirmed skill-induced failures: 125 functional failures and 182 high-confidence efficiency regressions” (R05:304–307). These are curated analysis cases, **not population failure rates**. |
| Excessive verification 67; heavy pipelines 30 | **SUPPORTED, category correction essential** | Both belong to **Excessive Procedure**, within efficiency regressions: “Excessive Verification … 67”; “Heavy Implementation Pipeline … 30” (R05:471–478). The latter is not specifically a verification-pipeline category. |
| Source benchmarks | **SUPPORTED, different snapshots** | SkillsBench: 84 tasks/11 domains; SWE-Skills-Bench: 490 instances (R05:178–185)—not the supplied R01/R02 inventories. |
| Attribution method | **SUPPORTED as contrastive/manual attribution** | Fixed task, verifier, model, harness and state; vary skill setup; successful no-skill or alternative-skill runs act as a “pseudo-oracle, not … ground-truth” (R05:165–194). Ambiguous/verifier-narrow/duplicate cases are removed; manual labels finalized by group consensus (R05:279–291). |
| Length/prompt finding | **SUPPORTED, but not “shorter always wins”** | Context Bloat accounts for 46/182 regressions, including 43 skill-body cases (R05:398–438). Overall regressions are “dominated by Excessive Procedure rather than prompt length alone” (R05:487–495). No controlled universal length–performance curve is reported. |

Efficiency inclusion requires **both** token and time ratios >1, with at least one >2; both runs must pass (R05:246–258). Attribution-tool repetitions are not repeated task executions (R05:591–594).

## B. Methodological weaknesses

*“Admitted” identifies author-stated limits; “inference” identifies my methodological reading.*

| Paper | Admitted limitations | Additional weakness—inference |
|---|---|---|
| **R01** | Terminal-only scope; changing harness integrations; no length-matched controls; imperfect determinism/contamination control (R01:538–555). High-quality matched skills are an “optimistic scenario” (1009–1012). | Selection explicitly requires skill-dependent tasks and rejects ones solvable without guidance, limiting average-benefit generalization (1183–1189). Size buckets confound task/content with quantity; comprehensive bucket N=5 (2206–2225). |
| **R02** | Synthesized requests need not represent natural engineering demand; generated verifiers can miss behaviors/favor implementations; repetition and greater power remain future work (R02:613–618). | One run per condition confounds observed deltas with stochastic variation; 40 sign reversals are not established harness interactions (40–41,760–762). Reported p<0.05 classifications have no stated multiplicity correction across 98 skills (304–314). |
| **R03** | Python may already be well represented in training; task-resolution metrics omit security/efficiency qualities (R03:563–579). | One completion per agent/condition limits sensitivity (280). Generated descriptions/tests share reference patches, risking oracle-specificity despite manual repair of 25 instances; mean modified-code coverage is 75%, minimum 2.5% (202–239,254,1171–1183). |
| **R04** | Stochasticity/model/task dependence; no comprehensive correctness or maintainability assessment (R04:174–183,213–235). | Selected actionable files and tiny PRs—≤100 changed lines, ≤5 files—limit transfer (127–159). No repeated-run protocol is reported; ratio-of-medians reductions are not median within-pair percentage improvements (187–212). |
| **R05** | Manual causal/category judgment is subjective; findings may depend on benchmark, harness, model and ecosystem (R05:609–639). | Failure-mined, consensus-filtered cases cannot estimate prevalence. A single-run contrast plus trace evidence cannot fully exclude variance; three GPT attribution votes reuse the same execution evidence (178–194,279–291,591–594). |

**Version drift:** R05’s source inventories differ from supplied R01/R02 (R05:178–185 versus R01:282–284 and R02:318–324). Its cases should not be presented as a reanalysis of these exact later versions.

## C. Neglected content relevant to the proposed harness

| Finding and quote | Harness implication |
|---|---|
| **Procedural gaps, not generic extra knowledge:** “concrete procedures and verifier-facing details (steps, constraints, sanity checks), rather than broad conceptual knowledge” (R01:513–516). | Supports specialized operational guidance. **Against** a merely short catalog whose retained skills lack concrete procedures. |
| **Authoring quality matters:** benchmark skills come from the “top quality quartile (score ≥ 9/12)” (R01:1004–1005). Successful patterns include scripts, calibrated defaults, parsing quirks and invariants (2250–2263). | Benefit estimates concern curated, well-matched packages—not arbitrary installed skills or descriptions alone. |
| **Validation can be the missing ingredient:** generated radar skills omit “the curated autocorrelation cross-check” (R01:1511–1514). | **Against blanket verification reduction:** removing a diagnostic check can remove the mechanism that makes a skill useful. |
| **Testing skills sometimes help substantially:** with a Vitest skill, an agent “installs the workspace and runs the relevant tests successfully in all ten requirements” (R02:511–515). | **Against treating testing overhead as inherently wasteful.** Benefit depends on the agent’s baseline omissions; other configurations already installed the toolchain (516–518). |
| **Concrete templates can override requirements:** “abstract guidance patterns over concrete, opinionated templates with hard-coded paths and values” (R02:499–502). | Supports preserving task authority and marking defaults/examples as overridable—not just shrinking instructions. |
| **Harness dependence:** utility is “the marginal difference between the behavior it induces and the behavior the configuration already exhibits” (R02:595–597). | **Against assuming Codex results transfer to Claude review roles**, or that one fixed catalog is equally useful for every role. |
| **Short AGENTS.md is not an established causal result:** “no clear dependency between the success rate or the per-instance cost and the context file length” (R03:1031–1036). | **Against citing R03 as a word-count experiment.** Its stronger case is against redundant/inappropriate instructions, not length alone. |
| **Documentation availability changes results:** after removing other documentation, generated context files “improve performance by 2.7% on average” (R03:1015–1029). | **Against stripping useful project knowledge** where discoverable documentation is absent. On-demand pointers themselves were not evaluated. |
| **Instruction content, not just tokens, changes cost:** testing instructions increase cost, but no ablated category significantly changes accuracy (R03:1085–1094). | Supports scrutinizing mandated behavior. Does not establish that equivalent checks lack value for native interaction quality or nonfunctional requirements. |
| **Some subagent use existed, but no role-splitting experiment:** Claude’s Task tool “allows SONNET-4.5 to invoke sub-agents, using HAIKU-4.5” (R03:819–821). | Neither supports nor refutes the proposed lead/subagent/external-reviewer structure; no comparative orchestration result follows. |
| **R04 deliberately retained substantive context:** “conventions and best practices,” “architecture and project structure,” and “project description” (R04:135–140). | **Against an unconditional anti-overview reading** of the combined literature. R04’s content/quality selection differs from R03; it did not test terse pointer-only files. |
| **R04’s quality claim is narrow:** “does not constitute a full correctness evaluation” (R04:214–218). | **Against using speed/token savings to justify weaker acceptance checks.** |
| **Relevant skills can still harm:** “Only 2 of 125 functional failures … Applicability Mismatch” (R05:379–390). | A task-specific catalog is insufficient: on-topic defaults can still distort implementation or omit requirements. |
| **Lazy-loading has qualified support:** “shorten mandatory skill bodies and lazy-load optional references only when the task actually requires them” (R05:428–432). | Supports the packaging direction, but is an implication from attributed failures—not a controlled AGENTS.md pointer-design trial. |
| **Verification should be conditional:** “condition verification scope and pipeline depth on task uncertainty, change size, and budget” (R05:496–500). | Supports proportionality. **Against blanket minimal verification:** the discussion explicitly seeks to “preserve careful skill-guided workflows” (603–605). |
| **GUI/long-horizon transfer is explicitly unresolved:** “may not transfer directly to GUI agents, multi-agent coordination, or very long-horizon workflows” (R01:538–542). | **Against presenting this corpus as direct validation of the complete IINA harness.** |

## D. Transfer judgment — **my inference**

| Paper | What it can and cannot warrant for this project |
|---|---|
| **R01** | Warrants trying curated procedural help for unfamiliar APIs, formats and brittle build workflows, with lightweight alternatives. Cannot warrant a universal 2–3-skill catalog cap, human-rated UI improvements, or multi-agent/serialized-GUI coordination (R01:2206–2225,538–549). |
| **R02** | Warrants evaluating each skill against the actual lead/reviewer configuration and preserving explicit task constraints over templates. Its generated, deterministic, single-skill tasks do not assess visual judgment, direct manipulation, or allocation of one GUI operator (R02:240–247,289–314,613–618). |
| **R03** | Warrants removing redundant generated summaries and retaining unique conventions. Python test-resolution results do not establish an optimal AGENTS.md length, pointer architecture, or the value of native GUI inspection; limited enabled subagents do not validate role splitting (R03:819–821,1031–1036,563–573). |
| **R04** | Warrants considering repository guidance as a possible efficiency aid for small code changes. Without comprehensive correctness assessment, it cannot show equivalent UI quality, justify fewer checks, or predict long-session performance (R04:147–159,174–183,213–235). |
| **R05** | Warrants explicit applicability boundaries, optional workflow stages, consistent environments, and risk-sensitive verification budgets. Failure-selected benchmark cases do not establish the optimal verification level or staffing model for human-judged macOS work (R05:279–291,391–394,595–605,624–639). |

**Overall inference:** keeping guidance focused and workflows proportionate is defensible. The serialized GUI tester, role split and external Claude reviewer remain project-design choices, not findings established by this corpus. Human acceptance of interaction quality must remain distinct from benchmark-style test success.

## Reading coverage

Read using numbered `sed -n` chunks; references, appendices, prompts and limitations included. An initially truncated R01 response was recovered through smaller reads.

| File / alias | Actual line ranges read | Parts skipped |
|---|---|---|
| `2602.12670v4.txt` — **R01** | 1–225; 226–450; recovery overlap 179–260; 451–700; 701–1000; 1001–1300; 1301–1600; 1601–1950; 1951–2300; 2301–2600; 2601–2850; 2851–3087 | None of supplied text |
| `2603.15401v2.txt` — **R02** | 1–250; 251–500; 501–750; 751–1000; 1001–1163 | None |
| `2602.11988v3.txt` — **R03** | 1–250; 251–500; 501–750; 751–1000; 1001–1250; 1251–1548 | None |
| `2601.20404v2.txt` — **R04** | 1–160; 161–327 | None |
| `2608.11888.txt` — **R05** | 1–250; 251–500; 501–750; 751–806 | None |

**Coverage check:** fresh `wc -l` returned **6,931 total lines**, matching the endpoints above. Only extracted text was examined: PDF graphics not represented in that text, linked artifacts, source code and underlying execution data were not inspected. No web browsing, edits or subagents.