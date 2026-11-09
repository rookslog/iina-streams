# Full-text reading of R01–R05 (independent-audit follow-up, 2026-11-09)

**Provenance:** produced by `gpt-6.1-terra` at reasoning effort `high`, via `codex exec` (codex-cli 0.167.0, read-only sandbox, `--ephemeral`, no web access), session id `01a1c159-bd0f-7602-916a-ceb0dfb7ae79`, 163,093 tokens. Commissioned by the Opus auditor at the operator's prompt to close reading-depth gaps flagged in `../../INDEPENDENT-AUDIT-OPUS-2026-11-09.md` §4.1. This is Terra's own report, not the auditor's.

**Corpus:** arXiv PDFs downloaded with `curl` on 2026-11-09 and converted with `pdftotext -layout`, with no summarizing layer in between. The line locators (`R0n:line`) refer to those text files, which were kept only in the auditor's scratchpad. To reproduce, re-download the same versions and convert them the same way. PDF SHA-256 values:
    8aaa07614b61ae47cc340289340263ec9f68a5cd9c34f7d730b11d7c38b49fea  2601.20404v2.pdf
    e945b406632dcd8246563e5a3fca907534551732a6e49cad165c7690cde3f4ae  2602.11988v3.pdf
    e987ebc3f0084a1ffc8acbca58259e33120b95fcef3876abfad060e169cf210b  2602.12670v4.pdf
    61120258c599e3b70c5d0151ee63ad2f96f51757fc6bf38f7f4d560edb460f1c  2603.15401v2.pdf
    9845511440ed3c45b8898b2fc4d0f8806d904ea28c101ff0c4aaf8c747c8e883  2608.11888.pdf

**Auditor spot-check (6 of the report's locators, against the raw text):** each of the following matched.
- R01:446–458 SE row "16 37.6% 49.2% +11.6"
- R01:2203–2212 task groups 43 vs 21
- R02:503–507 "deltas of 40 of the 98 skills change sign between Codex and Claude Code" (Kimi-K2.6)
- R03:345–368 20%/23% for generated files vs "at most 19%"
- R03:1031–1036 "no clear dependency … context file length"
- R04:139–150 "paired within-"
- R05:179–184 "84 evaluated tasks across 11 domains … 490 … instances"

The other claims and section D (transfer judgment, which Terra marks as its own inference) were not independently re-checked.

---

# Source-critical assessment

**Bottom line:** The papers support testing narrowly applicable guidance and avoiding *unnecessary* procedural work. They do **not** establish an optimal skill-catalog size, justify a blanket reduction in verification, or validate the proposed role split for a human-judged native GUI project. Several results are explicitly configuration- and task-dependent.

## Reading coverage

Line numbers refer to the supplied `pdftotext` files, not PDF page numbers. All text lines—including references, appendices, and limitations—were read in chunks. Charts are assessed only through their extracted text and captions.

| File | Lines read | Parts skipped |
|---|---:|---|
| [R01: 2602.12670v4.txt](2602.12670v4.txt) | 1–3087 | None in text extraction |
| [R02: 2603.15401v2.txt](2603.15401v2.txt) | 1–1163 | None in text extraction |
| [R03: 2602.11988v3.txt](2602.11988v3.txt) | 1–1548 | None in text extraction |
| [R04: 2601.20404v2.txt](2601.20404v2.txt) | 1–327 | None in text extraction; its separately referenced online appendix is outside the corpus |
| [R05: 2608.11888.txt](2608.11888.txt) | 1–806 | None in text extraction |

## A. Claim checks

Verdicts concern what the **specified versions report**, not independent replication. Locators below use the R01–R05 mapping above.

### A1. R01 — SkillsBench v4

- **Aggregate — SUPPORTED.** The paper reports “87 tasks across 8 domains,” 18 configurations, 33.9% → 50.5% (+16.6 percentage points), and configuration gains of +4.1 to +25.7 pp (R01:26–33, 359–363, 400).
- **Software engineering — SUPPORTED.** Its table gives **N=16**, 37.6% → 49.2%, **+11.6 pp** (R01:446–458).
- **Skill count — SUPPORTED as a descriptive comparison; PARTLY as a causal design rule.** “2–3 Skills gain +19.0 pp” versus ≥4 at +10.1 pp (R01:499–505). These are **different groups of tasks**: 43 versus 21, not a same-task randomized removal of skills (R01:2203–2212).
- **Self-generated skills — SUPPORTED.** They fall below no-skill on **all three** dedicated-harness configurations: −8.1, −11.3, and −11.5 pp (R01:464–471). The creator/solver protocol differed across harnesses, and Claude’s effort setting differed from its baseline (R01:1420–1427, 1454–1457).
- **Transfer limitations — SUPPORTED.** The authors say containerized terminal results “may not transfer directly to GUI agents, multi-agent coordination, or very long-horizon workflows” (R01:536–542).

### A2. R02 — SWE-Skills-Bench v2

- **Counts and aggregate — SUPPORTED.** Overall classifications are 92 ineffective, four beneficial, and two harmful; mean check-pass ratio is 76.59% → 76.93%, rounded to 76.6% → 76.9% (R02:377–380). **“Ineffective” is not equivalence:** it means no directional effect detected with ten requirements (R02:304–314).
- **40 sign changes — SUPPORTED, with qualification.** For Kimi-K2.6, “40 of the 98 skills change sign” between Codex and Claude Code (R02:503–507). These are observed signs, **not significant interaction tests** (R02:760–762).
- **Generation and runs — SUPPORTED.** A model prompt generates ten requirements from each skill and repository; another prompt generates deterministic pytest verifiers from their acceptance criteria (R02:253–278). Each requirement is run **once per condition per configuration**: 3,920 pairs across four configurations (R02:37–43, 318–324).
- **Test — SUPPORTED.** The primary test is an “exact two-sided paired sign-flip test” on ten requirement-level deltas; paired *t* and exact Wilcoxon are sensitivity checks (R02:304–314, 809–816).

### A3. R03 — Evaluating AGENTS.md v3

- **Success and cost — PARTLY.** No statistically significant general success gain versus no file is reported (R03:345–368). The **20% and 23%** average cost increases refer to *LLM-generated* files on SWE-bench and CTXBench; developer-provided files increase average cost by **at most 19%** in the reported settings. The abstract’s “over 20% on average” should not be assigned indiscriminately to each file type.
- **Behavior and non-standard practices — SUPPORTED, with scope.** Context files lead to “more testing and exploration” and more specialized tool use (R03:435–448, 473–474). The conclusion calls them useful for “non-standard coding practices” (R03:32–39); this is an author conclusion, not a separate randomized test of every such practice.
- **Tasks and files — SUPPORTED.** Both datasets are Python-focused: 300 SWE-bench Lite tasks and 138 CTXBench bug-fix/feature instances across 12 repositories (R03:71–78, 283–286). The latter used **developer-committed root files**, likely human-written **or edited**, not proven wholly human-authored (R03:176–180, 250–262).

### A4. R04 — AGENTS.md efficiency v2

- **Numbers — SUPPORTED.** Ten repositories and 124 PRs; median runtime 98.57 → 70.34 seconds, **−28.64%**; median output tokens 2,925 → 2,440, **−16.58%** (R04:23–30, 187–204). These are differences between condition medians, not stated medians of per-pair percentage changes.
- **Design — SUPPORTED as paired, not merely observational.** The authors describe a “paired within-task design” with the same task and repository state, varying file presence (R04:139–150). One Codex/model configuration was used (R04:95–106).
- **Confounders and outcome quality — SUPPORTED.** They acknowledge “agent stochasticity,” model/harness, and selected-task dependence (R04:212–219). They did **not** comprehensively assess correctness; 50 sampled tasks received a nontrivial-output sanity check, not functional equivalence testing (R04:174–183, 214–218).

### A5. R05 — Agent Skills Can Be Harmful

- **Counts — SUPPORTED.** The selected analysis set comprises **307 cases: 125 functional and 182 efficiency** (R05:301–306). Within **efficiency regressions**, excessive procedure accounts for 114; its subcategories include **67 excessive-verification** and **30 heavy-implementation-pipeline** cases (R05:463–481). The latter are not all verification pipelines.
- **Sources and attribution — SUPPORTED, with version caveat.** The study uses SkillsBench and SWE-Skills-Bench, augmented with semantically matched public skills, and compares a target with a no-skill or other-skill reference as a “pseudo-oracle”; remaining cases are manually inspected and labeled by group consensus (R05:163–194, 216–245, 279–291). R05 describes **84 SkillsBench tasks and 490 SWE instances** (R05:179–184), not the later inventories in R01 v4 and R02 v2; do not silently merge their denominators.
- **Length — SUPPORTED with qualification.** The paper says efficiency regressions are not explained by “prompt length alone” (R05:44–51). Of **46 selected context-bloat cases**, 43 were attributed to skill-body text; this is a category of selected regressions, **not** an experiment establishing a universal length threshold (R05:398–432).

## B. Methodological weaknesses

Each item separates the paper’s own limitation from an additional reading inference.

- **R01.** Authors acknowledge missing length-matched controls and limited GUI/multi-agent transfer (R01:536–555). **Inference:** selection favors tasks “significantly easier with Skills,” and quantity groups differ by task, limiting population and causal claims about catalog size (R01:1106–1117, 2203–2212).
- **R02.** Authors acknowledge synthesized requirements, potentially incomplete or implementation-favoring verifiers, single executions, and limited power (R02:613–618). **Inference:** 98 significance classifications at unadjusted p<.05 warrant caution about false discoveries; the sign changes alone do not establish significant harness interactions (R02:304–314, 760–762).
- **R03.** Authors acknowledge Python focus and that correctness metrics omit security and efficiency of the resulting code (R03:563–573). **Inference:** one sample per condition and generated descriptions/tests based partly on the reference patch constrain power and oracle independence, despite manual review (R03:202–239, 280–282).
- **R04.** Authors acknowledge stochasticity, a single model/harness, small selected PRs, and no full correctness evaluation (R04:147–167, 174–183, 212–229). **Inference:** LLM-generated task descriptions informed by PR diffs and absent functional scoring make efficiency gains difficult to interpret as savings at equal solution quality (R04:127–150, 174–183).
- **R05.** Authors acknowledge subjective attribution and dependence on benchmark, harness, model, and ecosystem (R05:609–639). **Inference:** selected contrastive failures and a single stated OpenCode/Opus configuration cannot estimate how often skills harm ordinary deployments; a successful reference run does not by itself rule out run variance (R05:225–232, 279–291).

## C. Neglected content relevant to the harness

- **Procedures, not generic bulk.** R01 says skills help most with “concrete procedures and verifier-facing details” (R01:512–516); its strongest-case audit highlights calibrated scripts, parsing quirks, invariants, and precise discovery descriptions (R01:522–527). This supports **task-specific, reviewable operational knowledge**, not merely a small catalog.
- **Quality and selection matter.** R01 selected skills from the “top quality quartile” and calls its benchmark an “optimistic scenario” (R01:1002–1012). Its numerical uplift should not be applied to an arbitrary local collection.
- **A useful skill can strengthen verification — cuts against a blanket anti-verification rule.** In R02, a testing skill induced installation of the missing toolchain and execution of native tests; the same benefit did not consistently transfer to other configurations (R02:503–517, 590–597). R01 also identifies a generated skill that omitted a useful cross-check (R01:1506–1514).
- **Use proportional verification, not no verification.** R05 recommends conditioning “verification scope and pipeline depth on task uncertainty, change size, and budget” (R05:487–500). Its 67 cases are selected high-cost regressions; they do not show that GUI inspection or regression tests are dispensable.
- **Examples can override the actual task.** R02 documents a template causing files to be written at the wrong path despite explicit instructions (R02:487–502); R05 similarly recommends separating task requirements from defaults and examples (R05:379–394). This cuts against rigid, universally applied role or workflow recipes.
- **Context-file content is not interchangeable.** R03 recommends instructions beyond existing documentation, while its overview proxy found no faster discovery (R03:413–433, 581–594). But when documentation was removed, generated context files improved average performance by 2.7% in that experiment (R03:1002–1029). **Cuts against an unconditional “no overview” policy.**
- **Shorter is not itself a demonstrated optimum.** R03 found “no clear dependency” of success or cost on file length in its binned analysis (R03:1031–1036). R01’s task-group associations and R05’s selected bloat cases are useful cautions, but do not establish a universal word limit.
- **Role splitting is not established.** R03 enabled Claude Code’s subagent tool (R03:813–821), but does not isolate a role-split effect. R01 expressly warns about multi-agent transfer (R01:536–542). **Cuts against citing these papers as evidence that a lead/subagent/external-reviewer topology is superior.**

## D. Transfer judgment — inference

- **R01:** Supports piloting curated, procedural skills for concrete IINA/plugin operations and comparing them against no-skill runs. It cannot warrant its average uplift, a 2–3-skill optimum, or the proposed multi-agent arrangement for direct manipulation and human visual judgment.
- **R02:** Supports evaluating individual skills in the actual Codex/Claude and repository combination, and guarding task instructions against templates. Generated, testable SWE requirements and single runs do not establish performance on subjective native-GUI work or multi-skill interactions.
- **R03:** Supports keeping repository instructions useful, nonredundant, and behaviorally intentional. Python issue-resolution benchmarks do not determine the ideal length or contents of macOS UI guidance, nor the value of human visual acceptance.
- **R04:** Shows that a paired Codex study can observe lower runtime and output-token medians with selected context files. Without functional-quality measurement, it cannot establish equal-quality savings for this plugin or settle its instruction-file design.
- **R05:** Supports looking for unnecessary mandatory checks, mismatched paths, and costly skill-induced detours. Its selected failures do not justify removing targeted builds, regression checks, or the **serialized GUI tester** needed to assess interactive behavior; neither that serialization nor the external reviewer was evaluated as a topology.