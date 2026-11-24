# The design set, draft 3: what it is and how it is used

**Draft 3.1, 24 November 2026: draft 3 with redraft 1 and rough pieces 2, 4, 5, 6 and 8 applied
provisionally by the lead (`../draft-3/REDRAFT-1-MARKING.md`, `../draft-3/ROUGH-2026-11-24.md`); not yet marked by the
operator; not tried with any model.** Draft 3 (`../draft-3/`) stays as it was, for comparison. Written by the lead after the operator confirmed the shape: a set of skills that refer
to each other, critique as its own skill, and a separate "start here" skill. Draft 2
(`../draft-2/`) holds the same carried-over lines in one file, for comparison.

This page is for a person taking the set into a project. An agent starts from
`using-the-design-set`.

## What is here

| Skill | For which moment | Who loads it | Refers to |
|---|---|---|---|
| `using-the-design-set` | Start here: which skill for which moment, what to give a launched agent, how the set is changed | Whoever chooses what to load | all the others |
| `designing-with-a-person` | The core: what binds all the skills, departures, what stays with the person | Everyone | none |
| `starting-a-design` | Nothing exists yet, or a brief is being written | Whoever shapes the brief | core; critique, reporting, reaction; craft sources |
| `inheriting-a-design` | A design, skill or method already exists | Whoever takes it up | core; starting |
| `reading-a-reaction` | The person has just reacted | The lead, in conversation | core; reporting |
| `critiquing-a-design` | Judging what another made | A critic launched for that purpose | core; starting; craft sources |
| `reporting-design-work` | Handing work back, or calling the person back | Anyone handing back | core; reaction |

Beside them: `WARRANTS.md` (what backs each line: exact words, how far the source was read, the
step from reading to line, what was read beside it, and which lines it backs),
`DEPARTURES.md` (the form for a recorded and justified departure), and
`DESK-CHECK-CRITIQUE.md` (the author's check of the critique skill against two recorded critiques).

**There is no fixed order.** Visual craft and platform conventions are not covered; a project
keeps using its own sources for those, and two skills point at them.

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

## What changed from draft 2

- **Carried over word for word, by script:** every instruction line of draft 2.
- **New lines:** the whole of `using-the-design-set` (13 lines) and of `critiquing-a-design` (17);
  pointer lines at the end of the starting, reaction, reporting and inheriting skills (seven in
  all), which say where a skill hands on to another and carry no warrant.
- **Restored:** "report, do not fix", removed from draft 2 after its desk check, now in the
  critique skill.
- **Dropped from the skills:** draft 2's section on checks and its three proposed always-read
  lines. Both are now in this page, below.
- **Not applied:** the three challenges above.

## How it would be wired, if adopted

Nothing below is done. Each is a proposal.

1. **Loading the entry.** Either of two ways, which can be combined:
   - three always-read lines in the project's standing instructions:
     - Before making, changing, critiquing or reporting on anything a person will look at or
       use, load `using-the-design-set`.
     - What the person says is said to you. A stop or a direct instruction takes effect as said;
       for anything else, load `reading-a-reaction` before changing anything in answer.
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

- **Exists:** `python3 tools/warrant_quote_check.py docs/design/skill/draft-3` shows that every
  tag has an entry and that the quoted words are in the sources (now 64 tags, 61 quotations).
  It does not show that a tag fits its line, nor whose claim the quoted words carry: a reading once
  passed a quotation check 40 of 40 and gave a claim to the wrong author. **Only the author has checked
  that.** It reruns
  only while the untracked copies of the sources exist on this machine.
- **Proposed, not built:** a brief for anything to be built opens with a purpose sentence, kinds
  of user and tensions; a report that draws on several agents says what they shared.

## What is thin

- `inheriting-a-design`: backed mostly by the lead's own mistakes in reading Impeccable.
- `critiquing-a-design`: seven of its warrants come from one critique report. Its desk check
  found that the two best critiques on record already did nearly every line, and that **no line
  would have found the complaints one of them missed.** Corrected the same day on the operator's reply: the brief in
  that case already held what was needed; the skill lacks a practice of reading a brief for where
  each requirement came from. Three candidate lines are at the end of the desk check.
- Nothing in the set has been read by any model other than its author.
