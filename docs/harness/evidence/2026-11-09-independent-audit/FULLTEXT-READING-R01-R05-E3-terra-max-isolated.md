# Full-text reading of R01–R05: gpt-6.1-terra max, isolated profile, codex exec (round-2 lane E3)

Launched with `codex -p reader exec … max`; 192,461 tokens. Same brief and corpus as round 1. The isolated profile is `reader-codex-profile.config.toml` in this folder, deployed as `~/.codex/reader.config.toml`. This is the lane's own report; see `READING-LANES-COMPARISON.md` for the auditor's checks.

---

# Source-critical review

**Bottom line:** The papers support evaluating task-specific guidance and avoiding unnecessary mandatory work. They do **not** establish an optimal catalog size, a short `AGENTS.md` plus pointers, a particular role split, or the removal of substantive verification for this project. Several headline results have important selection, measurement, and transfer limits.

Locators below use the user’s R01–R05 labels; the [reading coverage](#reading-coverage) table maps them to the exact files. Quoted whitespace in tables is normalized.

## A. Claim checks

### A1. [R01 — SkillsBench v4](2602.12670v4.txt:23)

- **SUPPORTED — aggregate and range.** The paper reports “87 tasks across 8 domains,” “18 model–harness configurations,” and pass rate “from 33.9% to 50.5% (+16.6 percentage points; 25.5% normalized gain),” with configuration gains “+4.1 to +25.7 pp” (R01:23–33). This is a task-macro pass rate, not a project-success probability (R01:332–340).
- **SUPPORTED — software engineering.** Table 3 reports “Software Engineering 16 37.6% 49.2% +11.6”: **N=16 tasks**, +11.6 percentage points (R01:446–458).
- **SUPPORTED as a descriptive comparison; PARTLY as a prescription.** “2–3 Skills gain +19.0 pp”; tasks with ≥4 gain +10.1 pp (R01:499–507). These are **different task groups**—43 versus 21 tasks—not a randomized comparison of catalog sizes (R01:2203–2212).
- **SUPPORTED — self-generated condition, with qualifications.** Self-generated skills were “below the no-Skills baseline on all three configurations”: −8.1, −11.3, and −11.5 pp (R01:464–471; R01:1439–1449). The setup had discovery and creator/solver interference issues, incomplete slots, and a Claude effort-level difference; it does not isolate authoring quality alone (R01:1420–1457; R01:1490–1526).
- **SUPPORTED — transfer limitation.** The authors say results “may not transfer directly to GUI agents, multi-agent coordination, or very long-horizon workflows” (R01:536–542).

### A2. [R02 — SWE-Skills-Bench v2](2603.15401v2.txt:29)

- **SUPPORTED — classifications and mean.** The overall result is 92 ineffective, “four Golden and two Harmful,” with mean pass ratio “from 76.6% to 76.9%” (R02:45–48; R02:377–381). Crucially, ineffective means “no directional effect was detected with ten requirements,” **not** that the effect is zero (R02:304–314).
- **SUPPORTED — sign changes, not established interactions.** “40 of the 98 skills change sign between Codex and Claude Code” with Kimi-K2.6 held fixed (R02:503–507). The figure explicitly says these are “observed effects, not significant interactions” (R02:760–762).
- **SUPPORTED — construction and statistics.** A “requirement-engineer prompt” produces ten requirements from each skill and repository; a “professional test engineer” prompt generates deterministic pytest verifiers from those requirements (R02:253–278). There is **one run per condition, requirement, and configuration**, with infrastructure retries: 3,920 pairs, or 7,840 condition runs. The primary test is an exact two-sided paired sign-flip test on ten requirement-level deltas; the overall profile averages configurations first (R02:40–44; R02:289–314; R02:318–324).

### A3. [R03 — Evaluating AGENTS.md v3](2602.11988v3.txt:23)

- **SUPPORTED — no general detected success gain; PARTLY — “>20% cost.”** The abstract says context files do “not generally improve task success rates” (R03:29–39). In the detailed results, generated files increase average cost by **20% and 23%** on the two benchmarks; developer-provided files increase it by “at most 19%” on average. Neither developer versus none nor generated versus none is a statistically significant success improvement (R03:345–368).
- **SUPPORTED — behavioral changes.** Agents “run more tests” and tend to “search more files (grep), read more files, and write more files”; they also use more repository-specific tools (R03:435–447; R03:473–490).
- **SUPPORTED as the authors’ recommendation.** The abstract says files are useful for “non-standard coding practices” (R03:35–39). Tasks are Python issue resolution and feature addition: 300 SWE-bench Lite tasks and 138 CTXBench instances from 12 repositories. The latter use **pre-patch, developer-committed root context files**; the authors say these are “likely to be human-written or edited,” not that exclusive human authorship was established (R03:71–81; R03:176–193; R03:250–262; R03:280–293).

### A4. [R04 — AGENTS.md efficiency v2](2601.20404v2.txt:18)

- **SUPPORTED — reported metrics.** The study uses “10 repositories and 124 pull requests.” Its runtime table reports “Median 98.57 70.34 28.23 28.64%”; output-token medians are 2,925 versus 2,440, a 16.58% reduction (R04:25–30; R04:187–204). These are differences between **condition medians**, not necessarily the median of within-pair percentage changes.
- **SUPPORTED — paired experiment, not merely observational.** The authors describe a “paired design”: they remove or retain the file on the same task and snapshot, after sampling historical PRs (R04:139–150; R04:213–218). They acknowledge stochasticity, one agent/model configuration and selected task characteristics. A “comprehensive evaluation of the output quality” is outside scope; only 50 sampled tasks received a nontrivial-output sanity check (R04:168–183; R04:213–232).

### A5. [R05 — Agent Skills Can Be Harmful](2608.11888.txt:14)

- **SUPPORTED — counts and categories.** The selected dataset contains 307 cases: 125 functional failures and 182 efficiency regressions (R05:28–35; R05:263–273). Of the latter, **114** are Excessive Procedure, including “Excessive Verification … 67 cases” and “Heavy Implementation Pipeline … 30” (R05:463–495). The 30 are **implementation** pipelines, not 30 verification pipelines.
- **SUPPORTED — source and attribution method.** The study uses SkillsBench and SWE-Skills-Bench, adds semantically matched public skills, and compares a target run with a no-skill **or another-skill** reference. It filters 665 candidate cases to 307 and assigns labels through manual inspection and “group consensus” (R05:163–194; R05:212–245; R05:279–305). For efficiency cases, “both token use and execution time must regress,” and at least one must more than double (R05:246–258).
- **SUPPORTED in the stated sense; NOT FOUND as a length optimum.** Regressions are “not explained by prompt length alone”; 43 of 46 **context-bloat** cases concern skill-body text, while procedure dominates the selected efficiency cases (R05:44–51; R05:395–442). I found no controlled result establishing that shorter skills always perform better or specifying an optimal prompt length.

## B. Methodological weaknesses

- **R01 — Authors:** terminal/container scope, possible contamination, limited model/harness coverage, and no length-matched control (R01:536–555). **Inference:** selection favors skill-sensitive tasks—reviewers reject tasks without measurable separation and the checklist asks for tasks “significantly easier with Skills”—and skill-count groups contain different tasks (R01:268–276; R01:1106–1117; R01:2203–2212).
- **R02 — Authors:** requirements and verifiers are generated, ten requirements limit power, and runs need repetition and human verifier review (R02:613–618). **Inference:** one run per arm leaves stochastic variation unresolved; 98 overall skill tests at nominal p<.05 raise multiplicity concerns, with no correction reported in the full text (R02:304–314; R02:713–717).
- **R03 — Authors:** evaluation is Python-focused and does not assess properties such as security or code efficiency (R03:563–573). **Inference:** one completion per agent, plus descriptions and tests generated using the original PR patch, limit stability and create oracle/overfitting concerns; the authors manually edited tests for 25 of 138 instances (R03:202–239; R03:280; R03:1171–1177).
- **R04 — Authors:** effects may reflect agent stochasticity, model/harness, or selected tasks, and correctness is not fully measured (R04:174–183; R04:212–232). **Inference:** small PRs, one Codex model, and LLM-generated task statements based on the PR diff limit generalization to a larger interactive product (R04:127–131; R04:147–167).
- **R05 — Authors:** classification requires subjective judgment and may vary with benchmark, model, harness, and ecosystem (R05:607–639). **Inference:** selected single-run contrasts and a large-regression threshold do not eliminate stochasticity or estimate an ecosystem-wide failure rate (R05:175–190; R05:246–258; R05:279–305). Its stated inventories—84 SkillsBench tasks and 490 SWE instances—differ from the supplied R01 v4 and R02 v2 inventories; the exact source snapshots are not identified here (R05:179–184; R01:221–224; R02:318–324).

## C. Neglected content relevant to the harness

- **Specific procedures, not merely more text.** R01 says skills help most with “concrete procedures and verifier-facing details,” such as constraints and checks (R01:512–527). R02’s helpful Viper example supplies library operations the unassisted agent often omits (R02:408–424). This supports testing **which project-specific knowledge fills a demonstrated gap**, not assuming every skill helps.
- **Cuts against rigid size caps.** R01’s skill-count comparison concerns bundles attached to different tasks, not an experimentally varied catalog (R01:2203–2212). R02’s strongest overall helpful example is described as “13.2K characters, 13 sections” (R02:408–424; R02:449–472). That does not establish that long skills are best; it does challenge using length alone as a quality proxy.
- **Cuts against blanket reduction of verification.** In one R02 configuration, a testing skill “installs the workspace and runs the relevant tests successfully in all ten requirements”; the unassisted agent installed the toolchain in four of ten (R02:508–517). R05 recommends conditioning “verification scope and pipeline depth on task uncertainty,” change size, and budget—not omitting necessary checks (R05:487–500).
- **Cuts against treating short `AGENTS.md` plus pointers as proven.** R03 found “no clear dependency” between file length and success or cost in its binned analysis; it did **not** test the proposed short-file/pointer design directly. When documentation was removed, generated context files improved observed performance by “2.7% on average” across the tested agents (R03:995–1036). R04’s median **total** tokens actually rose from 223,707 to 226,582 even while output tokens fell (R04:194–210).
- **Relevant skills and generated skills can fail for different reasons.** R05 classifies only 2 of its 125 selected functional cases as applicability mismatches; many instead involve incorrect or omitted required elements (R05:326–350). In R01’s selected self-generation audit, “10 of 12 audited trajectories never list, read, or mention the generated skills”: a discovery problem, not evidence that all generated content was intrinsically bad (R01:1490–1499).
- **Role splitting and GUI serialization: NOT FOUND as tested choices.** R03 says “we keep the Task tool enabled,” allowing Claude Code to invoke subagents, but does not compare the requested role structure with alternatives (R03:813–821). R01 explicitly cautions about multi-agent and GUI transfer (R01:536–542). None establishes the value of a Codex lead, external Claude reviewer, or single serialized GUI tester.
- **Human judgment is not captured by the headline scores.** R01 maintainers “personally inspect agent output” for multimodal tasks during review, but the benchmark’s reported scores use deterministic verifiers (R01:1129–1135; R01:1204–1208). That is not a measurement of one operator’s experience manipulating a native UI.

## D. Transfer judgment — **my inference**

- **R01:** Curated procedural knowledge may help with IINA-specific APIs or workflows. Its selected, test-scored terminal tasks cannot justify a fixed number of skills or predict human satisfaction with direct manipulation.
- **R02:** Test individual skills with the actual Codex configuration and representative tasks; useful or harmful effects can be configuration-specific. Explicit invocation and generated executable oracles do not measure discovery in a catalog or subjective UI quality.
- **R03:** Concise, genuinely project-specific instructions are a reasonable hypothesis, especially for conventions absent from existing documentation. Python issue-test results cannot establish the best file length or substitute for observing a human using the plugin.
- **R04:** Repository instructions can plausibly reduce runtime or output tokens on some coding tasks. Without correctness equivalence or visual evaluation, the observed speedup cannot warrant reduced verification or a quality claim for this plugin.
- **R05:** Avoid making expensive procedures compulsory without a task-specific reason, and inspect conflicts between skills and requirements. Its selected failure cases cannot quantify this project’s risk or justify skipping checks needed for a reliable, usable UI.

## Reading coverage

All five files were read in numbered chunks, including references, appendices, and limitations. Each has a final unterminated form-feed-only line, included below.

| File | Lines read | Parts skipped |
|---|---|---|
| R01 — `2602.12670v4.txt` | 1–350; 351–650; 651–1000; 1001–1400; 1401–1800; 1801–2200; 2201–2600; 2601–3088 | None |
| R02 — `2603.15401v2.txt` | 1–250; 180–500; 501–830; 831–1164 | None |
| R03 — `2602.11988v3.txt` | 1–350; 351–700; 701–1050; 1051–1300; 1301–1549 | None |
| R04 — `2601.20404v2.txt` | 1–110; 111–220; 221–328 | None |
| R05 — `2608.11888.txt` | 1–180; 181–360; 361–540; 541–720; 721–807 | None |

**Checks:** Fresh `nl -ba` reads established locators; scripted whitespace-normalized spot checks checked quoted excerpts against the files. No web sources were consulted, and no files were changed.