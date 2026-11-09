# Full-text reading of R01–R05: gpt-6.1-terra xhigh, isolated profile, codex exec (round-2 lane E2)

Launched with `codex -p reader exec … xhigh`; 159,803 tokens. Same brief and corpus as round 1. The isolated profile is `reader-codex-profile.config.toml` in this folder, deployed as `~/.codex/reader.config.toml`. This is the lane's own report; see `READING-LANES-COMPARISON.md` for the auditor's checks.

---

# Source-critical review

The papers support **testing targeted guidance in the actual agent configuration**, not a universal rule for catalog size, context-file length, role splitting, or minimal verification. The strongest direct transfer limit is R01’s explicit warning that its results may not transfer to GUI, multi-agent, or very long-horizon work.

Locators below use the file aliases in the reading-coverage table. Verdicts describe **text correspondence**, not independent reproduction of experiments.

## A. Claim checks

### A1. R01 — SkillsBench v4

- **Aggregate — SUPPORTED.** The abstract reports “87 tasks across 8 domains,” “18 model–harness configurations,” and “33.9% to 50.5% (+16.6 percentage points),” with configuration gains of +4.1 to +25.7 pp (R01:25–33).
- **Software Engineering — SUPPORTED.** The domain table reports “Software Engineering 16 37.6% 49.2% +11.6” (R01:445–457). This is a descriptive aggregate across those **16 tasks** and 18 configurations, not an IINA-specific effect.
- **Skill count — SUPPORTED as an observed comparison; PARTLY as a causal rule.** The paper reports “2–3 Skills gain +19.0 pp” versus “≥ 4 Skills” giving “+10.1 pp” (R01:499–505). The appendix groups **different tasks** by their existing bundle sizes: 43 versus 21 tasks (R01:2203–2212). It does not demonstrate that reducing the same task’s bundle to three causes the difference.
- **Self-generated skills — SUPPORTED, with important qualifications.** “On all three configurations, self-generated Skills land below the no-Skills baseline” (R01:1442–1452): Claude Code −8.1 pp, Codex −11.3 pp, Gemini CLI −11.5 pp. The self-generated condition has missing trial slots, a different Claude effort setting, and discovery/creator-interference issues (R01:1420–1457, 1490–1524).
- **Transfer limitations — SUPPORTED.** The authors say results “may not transfer directly to GUI agents, multi-agent coordination, or very long-horizon workflows” (R01:536–542).

### A2. R02 — SWE-Skills-Bench v2

- **Classification and mean — SUPPORTED.** “92 of the 98 skills” were Ineffective, with “four Golden and two Harmful”; aggregate pass ratio rose from 76.59% to 76.93% (R02:377–380). **Ineffective means no detected directional effect**, not proven zero effect (R02:304–314).
- **40 sign changes — SUPPORTED, descriptively.** With Kimi-K2.6 held fixed, “deltas of 40 of the 98 skills change sign between Codex and Claude Code” (R02:503–507). The appendix cautions: “observed effects, not significant interactions” (R02:758–762).
- **Construction — SUPPORTED.** A fixed “requirement-engineer prompt” receives the skill, repository metadata, and structure and produces ten requirements (R02:253–257). A model using a “professional test engineer” prompt generates deterministic pytest tests from requirements and metadata (R02:269–278).
- **Runs and test — SUPPORTED.** Each task is run “once without the skill and once with it” in each configuration (R02:38–42): 3,920 pairs, or 7,840 condition runs, across four configurations (R02:317–323). The primary test is an “exact two-sided paired sign-flip test” over ten requirement-level deltas (R02:304–305); paired *t* and exact Wilcoxon sensitivity checks produced the same overall counts (R02:805–819).

### A3. R03 — Evaluating AGENTS.md

- **Success and cost — PARTLY if stated without qualification.** The authors report no *statistically significant general success improvement*, not proof of no benefit (R03:341–368). Generated files increased average inference cost by **20% on SWE-bench and 23% on CTX-Bench**; developer-provided files increased cost “at most 19%” on average in the reported comparison (R03:358–368). Thus “>20% cost” should not be applied uniformly to both file types.
- **Behavior and purpose — SUPPORTED as reported findings/recommendation.** Context files led agents to “run more tests” and “navigate the repository more” (R03:435–452); the abstract says they are “useful for specifying non-standard coding practices” (R03:35–38). More activity is not itself evidence of better outcomes.
- **Tasks and files — SUPPORTED.** Both datasets concern Python repository tasks: SWE-bench Lite’s 300 issues and CTX-Bench’s 138 bug-fix/feature instances from 12 repositories (R03:73–81, 282–286). The latter uses **developer-committed root context files**; the paper argues they are likely human-written or edited, not that every word was demonstrably human-authored (R03:175–179, 1163–1171).

### A4. R04 — AGENTS.md efficiency

- **Numbers — SUPPORTED.** The study reports 10 repositories and 124 PRs (R04:24–29); median wall-clock time fell from 98.57 to 70.34 seconds, **28.64%**, and median output tokens from 2,925 to 2,440, **16.58%** (R04:187–204). These are differences between condition medians, not a stated median of individual percentage reductions.
- **Design — SUPPORTED as paired experimental, not merely observational.** It is a “paired within-task design” using the same task and repository state with the root file present or removed (R04:138–150). Wilcoxon signed-rank tests marked runtime and output-token differences significant (R04:187–212).
- **Confounders and quality — SUPPORTED with a major caveat.** Authors acknowledge “agent stochasticity,” the specific framework/model, and selected tasks (R04:212–218). Crucially, “semantic correctness or the functional equivalence” was **not comprehensively evaluated**; a 50-task manual sanity check assessed nontrivial changes (R04:174–182, 212–218). The abstract’s “comparable task completion behavior” is therefore weaker than comparable verified correctness.

### A5. R05 — Agent Skills Can Be Harmful

- **Counts — SUPPORTED within the selected failure dataset.** The paper reports “307” cases: “125 functional failures and 182” efficiency regressions (R05:29–34). Within **Excessive Procedure**, 67 are excessive verification and 30 heavy implementation pipelines; the category totals 114 of the 182 efficiency regressions (R05:483–495). These are **not prevalence estimates over all skill uses**.
- **Sources — SUPPORTED, but versions differ from this corpus.** R05 names SkillsBench and SWE-Skills-Bench (R05:29–34), describing **84 tasks/11 domains and 490 repository tasks** (R05:179–185). Those counts differ from the supplied R01 v4 and R02 v2; do not silently treat R05 as an analysis of the exact later files.
- **Attribution — SUPPORTED as the authors’ method, not conclusive causation.** They compare a single target run with a no-skill or matched-skill reference, which “acts as a pseudo-oracle, not as a ground-truth solution” (R05:175–191). They remove ambiguous, verifier-narrow, and duplicate candidates and assign labels by manual group consensus (R05:279–291). A passing reference and trajectory review strengthen attribution but do not eliminate run-to-run variance.
- **Length — SUPPORTED with scope.** The paper says regressions are “not explained by prompt length alone” (R05:44–49): 43 of 46 *context-overhead* cases involve skill-body text, while induced actions dominate the larger efficiency-regression set (R05:426–436, 483–495). It does not establish an optimal skill length.

## B. Methodological weaknesses

- **R01.** Authors acknowledge missing length-matched controls, contamination/nondeterminism, and limited GUI/multi-agent transfer (R01:536–554). **My observation:** rejecting “low-signal” tasks and requiring tasks to be “significantly easier with Skills” select toward skill benefit; bundle-size groups also differ in task composition (R01:268–275, 1110–1113, 2203–2212).
- **R02.** Authors acknowledge skill-derived requirements, potentially incomplete or implementation-favoring generated verifiers, one run per arm, and limited power with ten requirements (R02:38–42, 613–618). **My observation:** the 40 sign changes are descriptive, not tested significant interactions, and the benchmark excludes subjective skills and costly repository setups (R02:241–247, 758–762).
- **R03.** Authors limit generalization beyond Python and task-resolution metrics (R03:562–572). **My observation:** one sample per agent and LLM-generated descriptions/tests constrain inference; reviewers edited 25 generated test sets, demonstrating an oracle-quality concern even though manual review mitigated it (R03:199–239, 280, 1171–1178).
- **R04.** Authors acknowledge one agent/model, stochasticity, selected small tasks, and lack of full correctness evaluation (R04:94–100, 148–167, 174–182, 212–230). **My observation:** generated issue statements derived from PR diffs and selection of files containing particular content types limit transfer to naturally phrased UI requests and arbitrary context files (R04:125–146).
- **R05.** Authors acknowledge subjective attribution, possible ordinary variance, and model/harness/task-distribution dependence (R05:609–635). **My observation:** selection specifically for contrasting failure or large PASS/PASS cost regressions makes the taxonomy informative about *selected cases*, not skill-harm frequency; the older benchmark inventories and single-run comparisons add version and variance limits (R05:175–185, 250–291).

## C. Neglected content relevant to this harness

- **Curated expertise can help substantially—not just small catalogs.** R01 says skills help with “concrete procedures and verifier-facing details” rather than broad conceptual knowledge (R01:512–516). Its high-gain audit identifies executable scripts, parsing quirks, format constraints, and invariants (R01:522–527). **Cuts against** interpreting “small catalog” as a reason to omit high-value, task-specific procedures.
- **Quality and discoverability matter.** R01 selected skills from the “top quality quartile” and calls its benchmark an “optimistic scenario” relative to the ecosystem (R01:1004–1015). In the self-generated audit, “10 of 12 audited trajectories never list, read, or mention the generated skills” (R01:1490–1499). A poor result cannot be assigned to prose quality alone.
- **The same skill can change value with the harness.** R02 reports that skill utility is the “marginal difference” relative to the behavior the configuration already exhibits (R02:595–598). Its testing-skill example helped one configuration install and run the native test toolchain, while the others usually did so unassisted (R02:508–520, 581–596). **Cuts against** a blanket policy of avoiding verification guidance.
- **Verification must be proportional, not absent.** R05 recommends conditioning “verification scope and pipeline depth on task uncertainty” (R05:496–499). R01 also documents a generated workflow that omitted an autocorrelation cross-check and accepted implausible output (R01:1507–1513). **Cuts against** replacing a heavy pipeline with a universally minimal check.
- **On-demand pointers and concise bodies have a bounded rationale.** In R05, “43 of the 46 context-overhead cases” involved mandatory skill-body text (R05:430–437). But R03 found “no clear dependency” between context-file length and success or per-instance cost in its binned analysis (R03:1032–1037). **Cuts against** treating shortness alone as an established quality or cost guarantee.
- **Overviews depend on available documentation.** R03 found context-file overviews did not meaningfully accelerate locating PR-relevant files in its main setting (R03:410–432). When ordinary documentation was removed, generated context files “consistently improve performance by 2.7% on average” in the tested settings (R03:1004–1029). **Cuts against** categorically excluding orientation material when the agent otherwise lacks it.
- **Neither role splitting nor a serialized GUI tester is established here.** R01 explicitly warns about multi-agent transfer (R01:536–542); R03 did leave Claude Code’s subagent tool enabled (R03:813–821), but that is not a controlled comparison of role structures. These sources do not establish that the proposed split, external reviewer, or single GUI tester is optimal.

## D. Transfer judgment — inference

- **R01:** Supports trialing curated, concrete IINA or macOS procedures and measuring their effect on representative tasks. Its task-selected, terminal/container aggregate cannot predict human-perceived UI quality, coordination benefits, or a numerical optimal catalog size for this project.
- **R02:** Supports evaluating individual skills with the actual Codex/Claude setup and watching for templates overriding explicit paths or requirements. Generated, objectively tested SWE requirements do not capture direct manipulation or one operator’s aesthetic and interaction judgments.
- **R03:** Supports keeping durable instructions distinct from redundant documentation and recording genuinely nonstandard project practices. Python issue-resolution and automated test outcomes do not establish the right length or content for a native macOS UI project.
- **R04:** Supports the possibility that a project context file reduces latency and output tokens on some small Codex tasks. It cannot establish equivalent correctness, visual quality, or a benefit for long-running multi-agent GUI work.
- **R05:** Supports checking whether guidance induces unnecessary repeated work, incorrect paths, or environment drift. Its selected contrastive failures cannot determine the appropriate amount of GUI testing or justify removing human review; those require project-specific evidence.

## Reading coverage

I read the plain-text files in full, including references, appendices, and limitations. These ranges refer to the extracted text, not visual inspection of PDF figures; no web sources or underlying experimental artifacts were consulted.

| Alias | File | Lines read | Parts skipped |
|---|---|---:|---|
| R01 | [2602.12670v4.txt](2602.12670v4.txt:1) | 1–3087 | None in extracted text |
| R02 | [2603.15401v2.txt](2603.15401v2.txt:1) | 1–1163 | None in extracted text |
| R03 | [2602.11988v3.txt](2602.11988v3.txt:1) | 1–1548 | None in extracted text |
| R04 | [2601.20404v2.txt](2601.20404v2.txt:1) | 1–327 | None in extracted text; the separately linked online appendix was outside the corpus |
| R05 | [2608.11888.txt](2608.11888.txt:1) | 1–806 | None in extracted text |