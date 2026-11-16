# Full-text reading of R01–R05: gpt-6.1-terra high, isolated profile, codex exec (round-2 lane E1)

Launched with `codex -p reader exec -m gpt-6.1-terra -c model_reasoning_effort=high`; 158,624 tokens. Same brief and corpus as round 1. The isolated profile is `reader-codex-profile.config.toml` in this folder, deployed as `~/.codex/reader.config.toml`. This is the lane's own report; see `READING-LANES-COMPARISON.md` for the auditor's checks.

---

# Source-critical review

**Bottom line:** The papers give some support for task-specific guidance and for avoiding *unnecessary* procedure. They do **not** establish an optimal catalog size, a short `AGENTS.md` with pointers, role splitting, or minimal verification for this macOS GUI project. Several results also cut against a blanket reduction in verification.

Locators below use the file keys in the coverage table; line numbers refer to the supplied plain-text files. Quotations are verbatim and each is under 40 words.

## Reading coverage

| Key and file | Lines read | Parts skipped |
|---|---:|---|
| [R01 — 2602.12670v4.txt](2602.12670v4.txt) | 1–3087 | None |
| [R02 — 2603.15401v2.txt](2603.15401v2.txt) | 1–1163 | None |
| [R03 — 2602.11988v3.txt](2602.11988v3.txt) | 1–1548 | None |
| [R04 — 2601.20404v2.txt](2601.20404v2.txt) | 1–327 | None |
| [R05 — 2608.11888.txt](2608.11888.txt) | 1–806 | None |

All text, including references, limitations, and appendices present in these files, was read in chunks. PDF figures are accessible only to the extent represented in the supplied `pdftotext` output; I did not inspect the PDFs or web.

## A. Claim checks

### A1. R01 — SkillsBench

- **Aggregate: SUPPORTED.** It reports “87 tasks across 8 domains” and “18 model–harness configurations”; pass rate rises from “33.9% to 50.5% (+16.6 percentage points),” with configuration gains “+4.1 to +25.7 pp” (R01:27–32). These are task-macro results, not a guarantee for each task.
- **Software engineering: SUPPORTED.** The table gives “Software Engineering 16 37.6% 49.2% +11.6” (R01:446–458).
- **Quantity: SUPPORTED as a descriptive comparison; causal interpretation is PARTLY supported.** “2–3 Skills gain +19.0 pp, and ≥ 4 Skills” give “+10.1 pp” (R01:499–505). The groups contain different tasks—43 versus 21—not randomized reductions of the same bundles (R01:2203–2212).
- **Self-generated skills: SUPPORTED for all three tested configurations.** They “land below the no-Skills baseline on all three configurations,” by −8.1, −11.3, and −11.5 pp (R01:464–470). The diagnostic had missing trial slots, different pack-generation procedures, and a Claude effort-level mismatch (R01:1420–1435, 1454–1457); it does not isolate authoring quality alone.
- **Transfer limitations: SUPPORTED.** The authors say terminal-container results “may not transfer directly to GUI agents, multi-agent coordination, or very long-horizon workflows” (R01:536–542).

### A2. R02 — SWE-Skills-Bench

- **Counts and average: SUPPORTED.** Overall, “92 of the 98 skills” were Ineffective, versus “four Golden and two Harmful”; aggregate pass ratio rose from 76.59% to 76.93% (R02:377–380). Ineffective means no detected directional effect, **not** established equivalence (R02:313–314).
- **Harness sign changes: SUPPORTED, with qualification.** With Kimi-K2.6 held fixed, “deltas of 40 of the 98 skills change sign between Codex and Claude Code” (R02:503–507). The figure calls these “observed effects, not significant interactions” (R02:760–762).
- **Construction: SUPPORTED.** A fixed prompt receives the skill, repository metadata and structure and “produces ten distinct requirements” (R02:253–257). A test-engineer prompt converts acceptance criteria into deterministic pytest tests (R02:269–278). The requirements are skill-derived, not sampled natural requests.
- **Runs and test: SUPPORTED.** Each task runs “once without the skill and once with it” per configuration (R02:37–44); the primary test is an “exact two-sided paired sign-flip test” over ten requirement-level deltas (R02:304–314). There are 3,920 *pairs* across four configurations, despite the abstract’s ambiguous “3,920 paired evaluations” wording (R02:318–324, 388–390). Paired t and exact Wilcoxon sensitivity tests gave the same overall counts (R02:809–816).

### A3. R03 — Evaluating AGENTS.md

- **Success and cost: PARTLY.** The paper says context files “do not generally improve task success rates” and increase inference cost “by over 20% on average” (R03:28–35). More precisely, generated files increased average cost 20% on SWE-bench and 23% on CTXBench; developer-provided files increased it by **at most 19%**, with a nonsignificant 2.4% average success gain (R03:345–368). No significant gain is not proof of no effect.
- **Behavior: SUPPORTED.** Agents “run more tests” and tend to “search more files,” “read more files,” and use more repository-specific tools (R03:435–447).
- **Non-standard practices: SUPPORTED.** The abstract says files are “useful for specifying non-standard coding practices” (R03:35–39). That is the authors’ practical conclusion, not a separately measured success gain for each such practice.
- **Tasks and files: SUPPORTED.** CTXBench comprises 138 Python bug-fix and feature-addition instances across 12 repositories with developer-committed context files (R03:71–81). SWE-bench Lite supplies 300 tasks from popular Python repositories (R03:280–286). The paper says the developer-provided files are *likely* human-written or edited based on comparison and AI-detection scores—not that authorship of each was established (R03:259–262, 1165–1169).

### A4. R04 — AGENTS.md efficiency

- **Sample and medians: SUPPORTED.** The abstract reports “10 repositories and 124 pull requests” (R04:23–30). Table 1 gives runtime medians 98.57→70.34 seconds, −28.64%, and output-token medians 2,925→2,440, −16.58% (R04:187–204). These are differences between condition medians, not necessarily the median of per-pair percentage changes.
- **Design: SUPPORTED as paired intervention, not merely observational.** It is a “paired within-task design” with the same repository, task and codebase state, varying file presence (R04:139–150).
- **Confounders and qualification: SUPPORTED.** The authors acknowledge “agent stochasticity,” the particular framework/model, and selected tasks (R04:212–218). Task statements were generated from PR diffs (R04:127–137). Crucially, “semantic correctness or the functional equivalence” was outside scope; 50 sampled outputs received only a nontrivial-change sanity check (R04:174–183, 214–218).

### A5. R05 — Agent Skills Can Be Harmful

- **Counts: SUPPORTED.** The selected analysis dataset has “307” cases: “125 functional failures and 182” efficiency regressions (R05:304–306). Within **Excessive Procedure**, 67 are excessive verification and 30 are **heavy implementation pipelines**, not necessarily verification pipelines (R05:463–478).
- **Sources and attribution: SUPPORTED.** The authors use SkillsBench and SWE-Skills-Bench (R05:179–185), augment them with metadata-similar public skills, and compare target runs with no-skill or matched-skill reference runs (R05:220–245). After removing ambiguous, verifier-narrow and duplicate candidates, they manually label and reach group consensus (R05:279–291). The reference is a “pseudo-oracle, not ... a ground-truth solution” (R05:186–192).
- **Length and procedure: SUPPORTED with scope.** Among 46 *context-bloat* cases, 43 concern skill-body text and three supplementary material (R05:408–440). Across all 182 selected efficiency regressions, Excessive Procedure accounts for 114; thus the authors say regressions are not explained by “prompt length alone” (R05:483–495). This is a taxonomy of selected regressions, not a general causal estimate of the effect of length.

**Version boundary:** R05 describes an earlier SkillsBench inventory of 84 tasks/11 domains and SWE-Skills-Bench of 490 instances (R05:179–184), whereas the supplied R01 and R02 report later inventories. Do not combine their denominators as if they were the same experiment.

## B. Methodological weaknesses

- **R01.** Authors acknowledge terminal-only transfer, model/harness drift, contamination and no length-matched control (R01:536–555). **My reading:** reviewers reject tasks with no measurable separation, and the checklist asks for tasks “significantly easier with Skills”; this selects toward detectable skill benefit. Quantity groups also differ in task composition (R01:268–275, 1106–1117, 2203–2212).
- **R02.** Authors acknowledge synthetic skill-derived requirements, potentially incomplete or implementation-favoring verifiers, single executions and limited power from ten requirements (R02:613–618). **My reading:** excluding subjective skills and expensive repositories narrows applicability to UI work; many skill-level significance tests also warrant caution when interpreting individual labels (R02:240–247, 304–314).
- **R03.** Authors acknowledge Python-only evaluation and outcome dimensions beyond task resolution (R03:563–573). **My reading:** one sample per agent/condition and generated descriptions/tests limit precision and oracle validity, despite manual review; 25 of 138 generated test sets needed edits (R03:202–213, 215–239, 280–282, 1171–1175).
- **R04.** Authors acknowledge stochasticity, one agent/model and small selected PRs; correctness and maintainability were not evaluated (R04:147–160, 212–229). **My reading:** diff-derived task statements and selecting files for specific content limit generalization; faster output cannot establish equal-quality completion (R04:127–145, 174–183).
- **R05.** Authors acknowledge subjective trajectory attribution and dependence on benchmark, harness, model and skill ecosystem (R05:609–638). **My reading:** single-run target/reference contrasts and selected large regressions cannot establish population incidence or fully exclude run variance; cross-skill references also change skill content rather than simply removing it (R05:175–192, 246–258, 265–273).

## C. Neglected content relevant to the harness

- **Procedure, not mere presence.** R01 says skills help most with “concrete procedures and verifier-facing details,” rather than “broad conceptual knowledge” (R01:512–516). Its high-benefit audit identifies calibrated scripts, parsing quirks, constraints and invariants (R01:2248–2263). This favors *specific, validated* guidance, not an arbitrary count cap.
- **Selection and authorship matter.** R01 calls its high-quality benchmark skills an “optimistic scenario” relative to the ecosystem (R01:1004–1012); its own admission criteria favor skill-dependent tasks (R01:1181–1190). R02’s harmful template caused an agent to copy a path instead of following the explicit task (R02:487–502).
- **Harness dependence matters.** R01 says discovery, prompting and tool loops “mediate realized benefit” (R01:433–438); R02’s 40 sign changes are observed, not significant interactions (R02:503–507, 760–762). A catalog effective for one role or model is not automatically effective for another.
- **Against a blanket “avoid verification” rule:** R02’s `vitest-unit-testing` skill caused one configuration to install the toolchain and run tests successfully in all ten requirements, versus four unassisted setups (R02:508–518). R01’s self-generated radar example omitted a curated “autocorrelation cross-check” and produced implausible output (R01:1506–1514). These support retaining verification that catches consequential errors.
- **Against mandatory exhaustive pipelines:** R05 recommends conditioning “verification scope and pipeline depth on task uncertainty, change size, and budget” (R05:487–500). R01 observed heavy recipes crowding out simpler valid approaches and recommends applicability boundaries and fallbacks (R01:2228–2245). Neither finding says a human GUI check is redundant.
- **Against shortening context indiscriminately:** R03 found no clear relationship between file length and success or per-instance cost (R03:1031–1036). When documentation was removed, generated context files improved performance by 2.7% on average in that experiment (R03:1002–1029). It recommends retaining information absent from the README, including conventions or nonfunctional requirements (R03:85–91).
- **Role splitting is not established.** R03 allowed Claude Code to invoke Haiku subagents (R03:813–821), but that is a setup detail, not a comparison establishing that splitting roles improves outcomes. R01 expressly cautions about multi-agent transfer (R01:536–542).

## D. Transfer judgment — inference

- **R01:** Supports trying well-authored, focused procedural skills and measuring their local effect. Its skill-dependent selection and terminal verifiers cannot predict improvement for native direct manipulation, human taste, or coordination around one GUI tester.
- **R02:** Supports testing each skill with the actual model, harness and task, and guarding explicit requirements against template defaults. Its single-run, generated, deterministically scored SWE tasks do not establish the value of a design or interaction skill for IINA.
- **R03:** Supports keeping persistent instructions relevant and nonredundant, especially for project-specific conventions. Python issue-resolution results do not determine the right length or contents for a macOS plugin’s GUI workflow; its subagent-enabled setup does not validate role splitting.
- **R04:** Supports a possibility that repository guidance can reduce effort in a paired Codex workflow. It cannot establish equal correctness, a benefit for larger UI changes, or an optimal short-file/pointer architecture.
- **R05:** Supports avoiding mandatory heavyweight steps and checking whether skill examples conflict with task requirements. Its selected benchmark failures do not quantify the benefit or cost of a human operator’s serialized GUI testing, nor justify removing checks that assess visual and interaction quality.