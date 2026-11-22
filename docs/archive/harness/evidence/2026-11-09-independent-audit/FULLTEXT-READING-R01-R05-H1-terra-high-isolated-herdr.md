# Full-text reading of R01–R05: gpt-6.1-terra high, isolated profile, interactive Codex in a Herdr pane (round-2 lane H1)

Launched with `herdr agent start reader-terra-high --kind codex --pane wDA:p3 -- -p reader -m gpt-6.1-terra -c model_reasoning_effort=high`. Prompted to read BRIEF.md (the same brief, delivered as a file). Report extracted from session rollout-2026-11-09T13-04-15-01a1c17b…jsonl; total_tokens 368,338 (289,152 cached; this accounting is not comparable with exec's figure). Same brief and corpus as round 1. The isolated profile is `reader-codex-profile.config.toml` in this folder, deployed as `~/.codex/reader.config.toml`. This is the lane's own report; see `READING-LANES-COMPARISON.md` for the auditor's checks.

---

# Source-critical report

**Bottom line:** The papers provide qualified support for task-specific guidance and for avoiding unnecessarily heavy procedures. They do **not** establish an optimal catalog size, a short-file rule, a particular multi-agent role split, or a reduced verification regime for the proposed IINA project. R02 also provides a counterexample in which skill-induced testing helped.

**Coverage limitation:** I did not complete the brief’s required full reading. Tool output was truncated during the initial full-text reads, and substantial portions—including appendices—remain unread in four files. The verdicts below are therefore **provisional, limited to the passages listed in the coverage table**, not findings of absence across the full corpus. No web browsing or subagents were used.

Source keys: [R01 — SkillsBench v4](2602.12670v4.txt), [R02 — SWE-Skills-Bench v2](2603.15401v2.txt), [R03 — Evaluating AGENTS.md v3](2602.11988v3.txt), [R04 — AGENTS.md efficiency v2](2601.20404v2.txt), [R05 — Agent Skills Can Be Harmful](2608.11888.txt).

## Reading coverage

Ranges below are the continuous passages whose output I could confirm reading, plus targeted passages; isolated search-result lines are not represented as full coverage. “Skipped” means not confirmed read, whether or not an attempted tool call included it.

| File | Lines confirmed read | Parts skipped or not confirmed |
|---|---|---|
| R01 `2602.12670v4.txt` | 20–34, 200–224, 320–557, 1000–1012, 1300–1324, 1430–1457, 2199–2228 | Remaining lines through 3087, including most appendices |
| R02 `2603.15401v2.txt` | 37–52, 145–156, 220–324, 370–410, 426–438, 500–528, 605–620 | Remaining lines through 1163, including most appendices |
| R03 `2602.11988v3.txt` | 15–110, 140–290, 300–410, 410–506, 560–590, 1015–1048, 1070–1094 | Remaining lines through 1548, including most appendices |
| R04 `2601.20404v2.txt` | 1–327 | None in the supplied text file; its separately referenced online appendix was not in the authorized corpus |
| R05 `2608.11888.txt` | 175–224, 240–258, 279–305, 443–499, 607–639 | Remaining lines through 806, including portions lost to truncation |

## A. Claim checks

Verdicts concern what the supplied paper **reports**, not independent replication.

### A1. R01 — SkillsBench

- **SUPPORTED — inventory and aggregate:** “87 tasks across 8 domains,” evaluated in “18 model–harness configurations”; pass rate “33.9% to 50.5% (+16.6 percentage points),” with gains “+4.1 to +25.7 pp” (R01:24–32).
- **SUPPORTED — software engineering:** The domain table reports “Software Engineering 16 37.6% 49.2% +11.6” (R01:446–457). N is **16 tasks**, not 16 independent projects or people.
- **SUPPORTED, with a causal qualification — skill counts:** “2–3” skills: N=43 tasks, +19.0 pp; “≥4”: N=21, +10.1 pp (R01:2203–2212). These are groups of *different tasks*, not a demonstrated causal optimum for catalog size.
- **SUPPORTED — self-generation:** “Self-generated Skills land below the no-Skills baseline on all three configurations” (R01:464–468). Differences were −8.1, −11.3 and −11.5 pp. This diagnostic had missing trial slots and a Claude effort-level mismatch (R01:1430–1435, 1454–1457).
- **SUPPORTED — transfer limits:** The authors say terminal-container results “may not transfer directly to GUI agents, multi-agent coordination, or very long-horizon workflows” (R01:536–542).

### A2. R02 — SWE-Skills-Bench

- **SUPPORTED:** “92 of the 98 skills” were Ineffective, versus “four Golden and two Harmful”; aggregate pass ratio was 76.59% → 76.93% (R02:377–380). **Ineffective means no detected directional effect**, not evidence of zero effect (R02:304–314).
- **SUPPORTED:** “deltas of 40 of the 98 skills change sign between Codex and Claude Code” with Kimi-K2.6 held fixed (R02:503–507). These are observed sign changes, not necessarily statistically significant reversals.
- **SUPPORTED — generation:** A fixed prompt receives skill content and repository metadata/structure and generates ten requirements (R02:253–262). A separate test-engineer prompt converts acceptance criteria into deterministic pytest tests (R02:269–278).
- **SUPPORTED — runs and test:** The paper says “every task once without the skill and once with it,” across four agent–model configurations (R02:37–43). Classification uses an “exact two-sided paired sign-flip test” on ten requirement-level deltas (R02:289–314).

### A3. R03 — context files

- **SUPPORTED, qualified:** The abstract says context files do not “generally improve task success rates” and increase inference cost “by over 20% on average” (R03:23–39). In the detailed results, generated files increased cost by **20% and 23%** on the two benchmarks; developer files increased it by **at most 19%** (R03:347–368). Do not apply “over 20%” uniformly to developer-written files.
- **SUPPORTED:** Agents “run more tests” and tend to search, read and write more files and use more repository-specific tooling (R03:435–447).
- **SUPPORTED as the authors’ conclusion:** “context files are useful for specifying non-standard coding practices” (R03:35–39); this is broader than a direct experimental demonstration of every such practice.
- **SUPPORTED — scope:** SWE-bench Lite uses 300 tasks from 11 popular Python repositories; CTXBENCH has 138 instances from 12 repositories with developer-provided files (R03:271–286). CTXBENCH includes bug fixes and features (R03:71–78). The files were developer-committed, with analysis suggesting they were “likely to be human-written or edited” (R03:259–262), not necessarily wholly human-authored.

### A4. R04 — efficiency

- **SUPPORTED:** The abstract reports “10 repositories and 124 pull requests” and median reductions of 28.64% in runtime and 16.58% in output tokens (R04:23–30); the table gives the underlying medians (R04:187–205).
- **SUPPORTED — design:** This is a **paired intervention**, not merely an observational comparison: the same task and repository snapshot are run with and without the root file (R04:89–93, 139–150).
- **SUPPORTED — qualifications:** Authors acknowledge agent stochasticity, particular model/framework and selected-task dependence (R04:212–219). They did not comprehensively evaluate semantic correctness; 50 sampled tasks received a non-trivial-output sanity check (R04:169–183, 214–218). Median **total** tokens increased 1.29%, despite lower median output tokens (R04:202–210).

### A5. R05 — skill-induced failures

- **SUPPORTED:** The final dataset contains 307 cases: 125 functional failures and 182 efficiency regressions (R05:263–273, 303–305).
- **SUPPORTED, category corrected:** The 67 excessive-verification cases and 30 **heavy implementation pipeline** cases are subcategories of **Excessive Procedure**, itself 114 of the 182 efficiency regressions—not functional failures (R05:463–480).
- **SUPPORTED — sources and attribution:** The subjects are SkillsBench and SWE-Skills-Bench (R05:178–185). The study uses same-task reference runs as a “pseudo-oracle,” then removes ambiguous, verifier-induced and duplicate candidates and manually labels remaining cases by group consensus (R05:175–194, 279–291). Its automated triage tool did not create the taxonomy or replace manual validation (R05:487–496).
- **SUPPORTED, qualified — length:** The authors conclude regressions are dominated by procedure “rather than prompt length alone” (R05:483–495). Context bloat still accounts for 46/182 cases, including 43 attributed to skill-body text (R05:463–470); this is not evidence that length never matters.
- **Version caution:** R05 describes an 84-task, 11-domain SkillsBench and 490 SWE-Skills-Bench instances (R05:178–184), whereas the supplied R01 and R02 versions report 87 tasks and 980 requirements respectively (R01:24–30; R02:318–322). Treat R05’s analysis as based on its stated benchmark subjects, not automatically as analysis of the later supplied versions.

## B. Methodological weaknesses

Each bullet separates the paper’s stated limitation from an additional **inference** where applicable.

- **R01:** Authors acknowledge terminal-only transfer, possible contamination, lack of length-matched controls and optimistic high-quality skill selection (R01:536–555, 1000–1012). **Inference:** comparisons by skill count/length group different tasks, so task composition can confound the apparent design effect (R01:2199–2225).
- **R02:** Authors acknowledge synthesized skill-derived requirements, potentially incomplete or implementation-favoring verifiers, need for repeats and limited statistical power (R02:613–618). **Inference:** one run per condition makes individual deltas sensitive to run variation (R02:37–43).
- **R03:** Authors identify Python focus and unmeasured outcomes such as security and efficiency (R03:563–573). CTXBENCH uses generated descriptions/tests, albeit reviewed against reference changes, and samples one completion per agent (R03:202–232, 273–280).
- **R04:** Authors acknowledge stochasticity and limited tasks/models, and do not fully assess correctness (R04:169–183, 212–229). **Inference:** selecting small PRs and files already containing particular content limits representativeness; generated issue descriptions from PR diffs may shape the task (R04:127–160).
- **R05:** Authors acknowledge subjective attribution and possible dependence on task distribution, harness, model and skill ecosystem (R05:607–637). **Inference:** selecting large PASS/PASS cost increases and excluding ambiguous cases supports analysis of selected mechanisms, not a population harm rate (R05:246–258, 279–291, 443–454).

## C. Neglected content relevant to the harness

- **Useful skills are more than short skills.** R01 says gains are greatest when success depends on “concrete procedures and verifier-facing details,” including steps, constraints and sanity checks (R01:512–516). Its benchmark used unusually high-quality skills: ecosystem mean 6.2/12 versus benchmark 10.1/12 (R01:1000–1011). **Inference:** catalog curation and applicability matter at least as much as count.
- **A small number is not a proven universal cap.** R01’s 2–3 versus ≥4 result compares task groups (R01:2203–2212), while 13/87 tasks nevertheless had negative aggregate skill deltas, including heavy or brittle prescribed pipelines (R01:491–497). This supports testing individual guidance, not adopting a fixed number as a causal law.
- **Against a blanket reduction in verification:** R02 reports that, in one configuration, a testing skill changed dependency setup from 4/10 to 10/10 requirements and led the agent to run relevant tests successfully; other configurations already did the setup (R02:508–518). R05 instead warns about **excessive or repeated** verification, not testing as such (R05:473–498).
- **Against treating shorter context as sufficient:** R03 found “no clear dependency” between context-file length and success or cost in its binned analysis (R03:1031–1036). Its category ablation associated testing instructions with higher cost, but found no significant accuracy effect for any category (R03:1071–1093). This is not a direct test of on-demand pointers.
- **Context content can serve non-benchmark objectives.** R03’s authors explicitly endorse specifying “non-standard coding practices” (R03:35–39), even though measured task success did not generally rise. Removing such instructions solely because they do not improve issue-resolution scores could discard the operator’s actual requirements.
- **Harness and skill content interact.** R01 says discovery, prompting, execution and tool-use loops “mediate realized benefit” (R01:433–438); R02’s same-model sign changes reinforce that qualification (R02:503–507). **Against assuming transfer:** a skill evaluated under one agent does not establish its effect under a Codex lead, subagents and a separate reviewer.
- **Against applying a generic terminal benchmark to GUI coordination:** R01 explicitly names GUI agents, multi-agent coordination and long-horizon workflows as transfer limits (R01:536–542). None of the passages checked establishes that role splitting or a single serialized GUI tester is optimal.

## D. Transfer judgment — inference

- **R01:** Curated procedural guidance is a plausible aid for repeatable plugin workflows, especially where an agent lacks project-specific steps. The observed gains and skill-count groupings cannot establish an optimal catalog or expected improvement on direct manipulation, human judgment or multi-agent GUI work.
- **R02:** Its paired comparisons support evaluating a candidate skill with the actual model, harness and repository. Generated, testable software requirements and single runs cannot determine whether a skill improves visual quality or a human operator’s experience.
- **R03:** It supports keeping instructions purposeful and measuring their behavioral cost, while retaining non-standard project practices. Python issue-resolution tests do not decide which macOS UI rules or human-review instructions are necessary.
- **R04:** A project-specific root file can plausibly reduce some execution costs on small coding tasks. Its efficiency measures and limited correctness sanity check cannot warrant a short-file limit or conclude that faster plugin work is equally correct or usable.
- **R05:** Its taxonomy provides concrete failure modes to watch for: misplaced artifacts, unnecessary checks and heavyweight procedures. Selected benchmark regressions cannot quantify harm rates for this project or justify eliminating GUI verification needed by the human operator.

The outstanding work is to read every omitted range, including appendices, then revisit these provisional verdicts and add or correct any findings those passages warrant.