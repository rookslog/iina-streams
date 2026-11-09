# Three reading lanes on one brief: Terra High, Sol High, Sol Medium (2026-11-09)

**What this is.** The operator asked to see how Sol High and Sol Medium handle the same close-reading task that Terra High did. All three lanes had the same brief, the same five full-text papers (pdftotext of arXiv PDFs), and the same flags: `codex exec`, read-only sandbox, `--ephemeral`, no web, no subagents. Only the model and effort differed. Each model ran once, so this compares **these three returns** and does not rank the models. The lanes also inherited the user-level Codex setup (75 skills, global `AGENTS.md`), because they were launched without a profile.

## Measured

| | Terra High | Sol High | Sol Medium |
| --- | --- | --- | --- |
| Wall time (log birth → report write) | ~2 m 43 s | ~5 m 33 s | ~3 m 31 s |
| Tokens (reported by codex) | 163,093 | 184,661 | 168,670 |
| Report size | 13.8 KB | 21.8 KB | 19.6 KB |
| Claimed coverage | All lines, all files | All lines, chunk ranges listed | All lines, chunk ranges listed, `wc -l` cross-check |
| Auditor spot-checks against raw text | 6/6 matched | 4/4 unique claims matched | 5/5 unique claims matched |
| Errors found by the auditor | none | none | none |

The spot-checks test whether claims are **accurate**, not whether they are **complete**. No lane was checked for findings it missed, except by comparing it with the other two.

## What each lane found that the others did not

All three found the same core corrections. These are already folded into the audit:
- The skill-count comparison spans different task groups.
- The ">20%" cost figure is for generated files only.
- There is no dependency on file length.
- The 40 sign flips are observed signs, not significant interaction tests.
- R04 is a paired design.
- R05 recommends proportional verification.
- No paper tests role-splitting.

Each lane's verified additions beyond that core:

- **Sol High**
  - **R02 deliberately excluded "generative or subjective skills"** (R02:241–247). SWE-Skills-Bench therefore says nothing about design or interaction skills such as `streams-interaction-design`. Of all the additions, this one matters most for transfer to IINA.
  - **R04's token reduction holds for output tokens only.** Median *input* tokens rose 3.41% and median *total* tokens rose 1.29% with AGENTS.md (R04 Table 1).
  - R02's most helpful skill was **13.2K characters in 13 sections**. That cuts against treating compactness alone as the virtue.
  - R05 ran on a single harness and model (OpenCode 1.15.1 + Claude Opus 4.6).
- **Sol Medium**
  - R03's generated tests cover only **75% of the modified code on average, with a minimum of 2.5%** (R03:239, 254). That is an oracle weakness.
  - R01's "comprehensive" bucket has **N=5** and a gain of **+0.7pp** (R01:2206–2225).
  - R04's mean output-token reduction is **20.08%**, compared with a 16.58% median.
  - R04's context files deliberately kept conventions, architecture and project-description content (R04:135–140). That argues against reading the literature as anti-overview.
- **Terra High:** no verified additions beyond the core. Its report is the shortest and is a subset of the other two.

## Reading (auditor's inference)

- For an exhaustive close reading with a claim matrix, **Sol Medium returned about as much verified substance as Sol High, in ~60% of the time and with ~9% fewer tokens.**
- **Sol High produced the single most consequential catch** (R02's exclusion of subjective skills).
- **Terra High was fastest and thinnest.** That does not support the project rule "Research and source-critical review should use Terra High" *for this task shape*. One run cannot overturn the rule either. It was made for broader research that involves web sources and conflicting evidence, which this task did not test.
- The useful product is **the union**. For high-stakes readings, two lanes on one brief (for example Sol Medium + Sol High) caught more than either alone, at roughly twice the cost.

**What would test this further:** repeat the three lanes on a second, different corpus, ideally a web-research task where Terra's rule was meant to apply. Score completeness against a key built from the union before any lane is read.
