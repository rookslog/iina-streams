# The design set, draft 3.3: what it is and how it is used

**Draft 3.3, 24 November 2026; provisional; not yet marked by the operator; one desk test of the reaction skill (on 3.1, two agents per version) and Codex source checks of 3.1 and 3.2; not used in a project yet.** Drafts 3 (`docs/design/skill/draft-3/`) and 3.1 (`docs/design/skill/draft-3.1/`) stay as they were, for comparison; what changed is below. Draft 3 was written by the lead after the operator confirmed the shape: a set of skills that refer to each other, critique as its own skill, and a separate "start here" skill. Draft 2 (`docs/design/skill/draft-2/`) holds the same carried-over lines in one file, for comparison. Paths that do not begin with `../` resolve from the root of the design-practice-lab repository (`/Users/rookslog/Development/design-practice-lab`), where the records are kept; an installed copy does not carry them.

This page is for a person taking the set into a project. An agent starts from
`using-the-design-set`.

## What is here

| Skill | For which moment | Who loads it | Refers to |
|---|---|---|---|
| `using-the-design-set` | Start here: which skill for which moment, what to give a launched agent, how the set is changed | Whoever chooses what to load | all the others |
| `designing-with-a-person` | The core: what binds all the skills, departures, what stays with the person | Everyone | none |
| `starting-a-design` | Nothing exists yet, or a brief is being written | Whoever shapes the brief | core; critique, reporting, reaction; craft sources |
| `inheriting-a-design` | A design, skill or method already exists | Whoever takes it up | core; starting |
| `reading-a-reaction` | The person has said something about the work, yours or another agent's | Whoever receives it | core; reporting |
| `critiquing-a-design` | Judging what another made | A critic launched for that purpose | core; starting; craft sources |
| `reporting-design-work` | Handing work back, or calling the person back | Anyone handing back | core; reaction |

Beside them: `WARRANTS.md` (what backs each line: exact words, how far the source was read, the
step from reading to line, what was read beside it, and which lines it backs) and
`DEPARTURES.md` (the form for a recorded and justified departure). Draft 3 only holds
`docs/design/skill/draft-3/DESK-CHECK-CRITIQUE.md`, the author's own desk check of the critique skill against two
recorded critiques, made for draft 3: a record of that check, not an independent trial.

**There is no fixed order.** Visual craft and platform conventions are not covered; a project
keeps using its own sources for those, and three skills point at them (`starting-a-design`,
`critiquing-a-design`, and `using-the-design-set`).

## Why the entry is its own skill

The lead first folded it into the core, on the ground that an onboarding skill is unlikely to be
loaded. **The operator rejected that ground, and it was wrong.** The Superpowers plugin on this
machine has such a skill; a session-start hook puts its whole content into every session (read in
the hook's script), and its description says to use it at the start of any conversation. The
reason that stands for a separate skill: a launched agent needs the core and has no use for the
map of which skill fits which moment. The map is for whoever chooses.

## What the operator named that stands behind no line

- Need, demand and desire (Lacan), and Lacan set against Levinas (Žižek, Reinhard): read, in
  `docs/design/process/NOTES-5-lacan-and-the-neighbour.md`. They back no line. They raise three
  challenges that are not applied: expect a remainder that asking does not remove; the person in
  the room against users who are not; Reinhard as challenger to the use made of Levinas. "The
  real" was met only at second hand.
- The plural-norms collection: only its list of sources on people and computers was reread. No
  warrant cites it.
- Levinas and Derrida stand behind three lines as readings, with the lead's carrying-over
  marked. None of their terms is asked of an agent.
- Sariyar on "user-centered design" is the reason the core defines "the person" and "kinds of
  user". Reinhard's earlier essay shaped how sources are set beside each other, each with
  others read beside it and none as judge. Neither is cited by a line.

## What draft 3 changed from draft 2

- **Carried over by script, with path and tag spelling updated:** every instruction line of draft 2 (not verbatim: `DEPARTURES.md` became `../DEPARTURES.md` in `designing-with-a-person`, and `[against: …]` became `[otherwise: …]`).
- **New lines:** the whole of `using-the-design-set` (13 lines) and of `critiquing-a-design` (17);
  pointer lines at the end of the starting, reaction, reporting and inheriting skills (seven in
  all), which say where a skill hands on to another and carry no warrant.
- **Restored:** "report, do not fix", removed from draft 2 after its desk check, now in the
  critique skill.
- **Dropped from the skills:** draft 2's section on checks and its three proposed always-read
  lines. Both are now in this page, below.
- **Not applied:** the three challenges above.

## What changed since draft 3

An instruction line changed in substance since draft 3 carries at least one tag whose entry begins
"Provisional", unless it is named below as not doing so. Changes that carry no tag are named below.

- **Draft 3.1** (the lead, provisionally; `docs/design/skill/draft-3/REDRAFT-1-MARKING.md`,
  `docs/design/skill/draft-3/ROUGH-2026-11-24.md`): redraft 1, pieces 1, 3 and 7, and rough pieces 2, 4, 5 and 6, as new
  or rewritten lines in the core, `reading-a-reaction`, `starting-a-design` and `reporting-design-work`;
  rough piece 8 as two optional warrant fields and the note on checks below; the `derrida-fault`
  entry rewritten from redraft 1, piece 9. Untagged: the core's definition of "the person" lost "and
  who reacts to it"; the reaction skill's description and the pointers to it were reworded.
- **Draft 3.2** (a drafter, on the lead's brief; each change, and the answer to each fault of the
  check of 3.1, in `scratch/runs/draft-3.2/CHANGES.md`, untracked):
  - `reading-a-reaction`: the stop and direct-instruction rule is its own paragraph at the head and
    says a stop does not license resuming (new entry `check31-stop`); what follows is for the part of
    a turn that calls for interpretation; a new line keeps the turn in proportion to the remark (new
    entry `desk1-proportion`); the two lines on pointing are one; the examples of what the maker
    offered are given once; the second of the two questions joined the line on the record; the line on
    loading the core now follows the stop paragraph. 695 words, 558 without frontmatter and status
    (3.1: 764 and 598).
  - `starting-a-design`: a try the maker proposes is no longer listed as something that holds a
    requirement.
  - Exclusions nobody chose, at the operator's word (record item 80, 24 November, 15:08 EST),
    brought by the lead: a new line in `starting-a-design` on finding whom the design leaves out
    without anyone having chosen it; the core's line on exclusion now hands the person a decision
    on each exclusion named, chosen or found, and gives the maker the finding and naming; a clause
    in `critiquing-a-design` has the critic report such exclusions. New entry `implicit-exclusion`.
  - Changed lines whose tags are all older entries: the critique skill's line on what the person
    said (`op-not-sovereign`); the reaction skill's line on a working choice, now holding the line on
    readings not followed (`rl-working-choice`, `op-haunted`).
  - Untagged: every header (the status, and `[otherwise: …]` glossed as a source to read beside the
    line, not its opponent); the reaction skill's description, its sentence scoping what follows the
    stop, and the question under its first line, which sits under that line's tags; the pointers to that skill in
    `using-the-design-set`, `starting-a-design` and `reporting-design-work`, now in one order (a stop or
    a direct instruction first, with nothing to load); the critique skill's note on its desk check;
    this page's table, standing lines, counts and status.
- **Draft 3.3** (the lead's spec, 24 November 2026, provisionally; `CHANGES.md` in this folder until
  moved to the record folder):
  - `designing-with-a-person` and `reading-a-reaction`: the stop and direct-instruction rule now sits
    in the core as well, with a provisional branch on whether the remark says what the thing should
    be or names only what is wrong (new entry `lead-stop-branch`, also added to
    `reading-a-reaction`'s head paragraph; `check31-stop` Limits updated).
  - `starting-a-design`: a proportion sentence on the line for exclusions nobody chose.
  - Departure records move to the project's `design-set/DEPARTURES.md` (never write into the set's
    own folder; `INSTALL.json` added; `DEPARTURES.md`'s Record section notes a copy elsewhere is
    the form only).
  - `designing-with-a-person`: a new line asks the maker to record corrections in the project's
    `design-set/CORRECTIONS.md` without asking the person to sort or restate them (new entry
    `loop-corrections`).
  - Source corrections from the Codex check of draft 3.2 (`scratch/runs/draft-3.2/check/REVIEW.md`,
    rows S01-S22), `r1-*` credits-check notes, and repository-root paths for records that do not
    travel with an installed copy.
  - Untagged or older-tagged changes: `designing-with-a-person`'s departure-recording line (carries
    only older tags `op-depart-kinds` and `rl-no-logs`), `using-the-design-set`'s `Always first`
    line (now states the stop/direct-instruction exception, S01) and departure-recording pointer
    (untagged), `critiquing-a-design`'s note on its desk check (untagged), and every file's status
    line and README counts.

## How it would be wired, if adopted

Nothing below is done. Each is a proposal.

1. **Loading the entry.** Either of two ways, which can be combined:
   - three always-read lines in the project's standing instructions:
     - What the person says is said to you. A stop or a direct instruction takes effect as said,
       with nothing to load first; for anything else they say about the work, load
       `reading-a-reaction` before changing the work in answer.
     - Apart from that, before making, changing, critiquing or reporting on anything a person will
       look at or use, load `using-the-design-set`.
     - A go-ahead covers what was described.
   - a session-start hook that puts the entry skill into every session, as Superpowers does.
     That is a change to the harness and is the operator's to make.
2. **A launched agent gets its skills from whoever launches it.**
   - Codex and Antigravity agents: the first line of the brief names the files to read. The
     reading scouts were briefed this way and followed it.
   - Claude subagents: the agent definition takes a `skills` list; the full content of each is
     put into the agent at start, and a subagent does not inherit the parent's skills. Looked up
     in Claude Code's documentation by a helper that read the page through a summarising fetch;
     no agent definition on this machine uses it yet.
   - A critic gets the core and `critiquing-a-design`, with what the thing is for and its kinds
     of user.
3. **The skills live in this repository** until the operator says otherwise.

## Checks, which are not lines

A check can show that something is present. It cannot show that it is good.

- **Exists:** `python3 tools/warrant_quote_check.py docs/design/skill/draft-3.3` shows that every
  tag has an entry and that the quoted words are in the sources (now 78 tags, 64 quotations).
  It does not show that a tag fits its line, nor whose claim the quoted words carry: a reading once
  passed a quotation check 40 of 40 and gave a claim to the wrong author (reading 7, the Opus second
  pass on Derrida, part 9, "What the first form did and cut":
  `scratch/runs/reading-7/readers/derrida-opus/READING-2.md`, untracked). **Only the author has
  checked that,** apart from the Codex checks of redraft 1, draft 3.1, and draft 3.2, which tested
  new and rewritten entries against their named sources. The check reruns only while the untracked
  copies of the sources exist on this machine.
- **Pointers:** `python3 tools/backs_check.py docs/design/skill/draft-3.3` (in the design-practice-lab
  repository; moved there by the lead) shows that each warrant's "Backs" text stands in a line carrying its tag, and that
  each tagged line is named there. It does not show that the tag fits.
- **Proposed, not built:** a brief for anything to be built opens with a purpose sentence, kinds
  of user and tensions; a report that draws on several agents says what they shared.

## What is thin

- `inheriting-a-design`: backed mostly by the lead's own mistakes in reading Impeccable.
- `critiquing-a-design`: six of its warrants come from one critique report directly (and a seventh,
  `iina-critique`, cites the lead's summary of that critique in IINA's `WAITING.md`, W-17). Its
  author's desk check, made for draft 3 (`docs/design/skill/draft-3/DESK-CHECK-CRITIQUE.md`; not an
  independent trial), read the first critique and its comparison and the first 48 of 75 lines of
  the second report (without reading its closing), found that Case 1 already did most of its lines,
  identified lines neither case called on, and found that **no line would have found the complaints
  one of them missed.** Corrected the same day on the operator's reply: the brief in that case
  already held what was needed; the skill lacks a practice of reading a brief for where each
  requirement came from. Three candidate lines are in the first correction, and five revised
  candidates are at the end of the desk check.
- Read by other models than its author: the Codex check of draft 3.1
  (`scratch/runs/draft-3.1/check/REVIEW.md`), which read the whole set and checked the changed lines
  and entries against their sources; the Codex check of draft 3.2
  (`scratch/runs/draft-3.2/check/REVIEW.md`), which checked the 3.1 check's 18 F-rows, the 22 new
  or changed entries, the README counts and locators, and pointers across the installable files;
  and one desk test of the reaction skill (`scratch/runs/desk-test-1/`), in which four Sonnet
  agents, two given draft 3 and two given draft 3.1, wrote next turns for three scripted moments
  and a judge compared the turns blind (all untracked). Neither is use in a project. No one but
  the drafter has checked the changes of 3.3.
