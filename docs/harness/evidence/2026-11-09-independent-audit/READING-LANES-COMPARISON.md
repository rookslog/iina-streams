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

## Round 2: context isolation, launch surface, and effort (Terra, same brief and corpus)

Four more lanes, each designed to change one variable relative to a comparison lane. "Isolated" means the `reader` profile (`reader-codex-profile.config.toml`). Rendered with `codex debug prompt-input`, it removes the skill catalog, plugins, MCP, web search, hooks and memories, and takes the prompt from 99 KB to 59 KB. Two things remain: the global `AGENTS.md` (7 KB) and the subagent tool definitions, which no tried key removed.

| Lane | Change vs. comparison | Wall time | Tokens | Coverage claimed |
| --- | --- | --- | --- | --- |
| T0 (round 1) | Terra High, default context, `exec` | 2 m 43 s | 163,093 | full |
| **E1** | T0 with the isolated profile → **context** | 2 m 44 s | 158,624 | full |
| **E2** | E1 at xhigh → **effort** | 3 m 28 s | 159,803 | full |
| **E3** | E1 at max → **effort** | 9 m 06 s | 192,461 | full |
| **H1** | E1, but interactive in a Herdr pane, brief delivered as a file → **surface** | 2 m 11 s | 368,338 total incl. 289,152 cached (different accounting; not comparable) | **partial**, honestly reported |

**Findings that separate the lanes.** The table below scores all seven lanes against the round-1 union. Scoring was by key-term search, with the discriminating items adjudicated by reading the context. Earlier `grep` passes were invalid because `grep` here is `ugrep`, which rejected the patterns; the checks were redone in Python.

| Finding | Lanes that state it |
| --- | --- |
| R02 deliberately excluded generative/subjective skills | SH, **E1**, **E2** |
| R04 median input/total tokens *rose* | SH, **E3**, **H1** |
| R02's helpful skill was 13.2K characters | SH, **E3** |
| R04 kept architecture/conventions content | SM, **E1** |
| R03 test coverage 75% avg / 2.5% min; R04 mean −20.08% | SM only |
| R03 "no clear dependency" on file length | all except **E1** |
| R03 +2.7% when docs removed; R05 proportional verification | all except **H1** |

**Reading (inference; one run per lane, so differences of one or two items are within plausible run-to-run variance):**
- **Context isolation (T0 → E1)** changed neither time nor tokens. The ~130k-token corpus dominates, so removing 40 KB of harness context barely moves the total. E1 caught two items T0 missed and missed one T0 caught. There is no clear quality effect in one pair.
- **Effort (E1 → E2 → E3).** xhigh ≈ high in time, tokens and content. Max took **3.3× the time** and 21% more tokens and added two verified catches. For exhaustive close reading, max buys little per unit time. Sol Medium (round 1) remains the best value observed.
- **Surface (E1 → H1).** The interactive Herdr lane hit tool-output truncation three times (session log), switched to targeted searches, and **read only part of four of the five papers**. It said so plainly in its coverage table, which is the right behavior. Its report omits two items every full reader found. Cause **unconfirmed** between three candidates: (a) the interactive surface's tool-output budget, (b) the brief arriving as a file instead of as the prompt, (c) run variance. The test that would decide: rerun H1 with the brief pasted as the prompt, and run an `exec` lane that is told to read BRIEF.md.
- **Practical upshot:** for long-corpus reading, launch through `exec` (or verify full coverage in an interactive lane before trusting its verdicts). Two lanes on one brief keep beating one lane at higher effort.

**What would test this further:** repeat the three lanes on a second, different corpus, ideally a web-research task where Terra's rule was meant to apply. Score completeness against a key built from the union before any lane is read.
