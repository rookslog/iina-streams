# Output style: review and proposal (2026-11-22)

Answers the brief [`OUTPUT-STYLE-BRIEF-2026-11-22.md`](OUTPUT-STYLE-BRIEF-2026-11-22.md). Research and
proposal only: no settings or live style files were changed. Draft style:
[`output-style-drafts/scan-first-situated.md`](output-style-drafts/scan-first-situated.md), not active.

**Headline.** The global "scan-first" style is not loaded in any session on this Mac (observed).
`~/.claude/settings.json` asks for `scan-first`, the style file names itself `Scan-first`, and style
names are case-sensitive. No other settings file under `~` (searched six levels deep) names it
correctly: the only other `outputStyle`, in a Dionysus import copy, is also lowercase. So tonight's unexplained "Still yours" lists came from habit with no style
loaded, and the records that blamed the style are wrong on that point. Two of the style's clauses
would still produce the same harm if it were switched on; the rest is sound and is kept in the draft.
A style can fix the shape of each reply. It cannot re-situate you after a break or write a decision
once for reuse: that takes the waiting file (already trialled in IINA Streams) and later a viewer
(section 6). Two decisions are yours, at the end: how to trial the draft in the two projects, and what
to do with the inactive global setting.

**Sources and shorthand used below.**
- **Signal ids** (`obs-…` = an observation, `int-…` = an interpretation) are rows in the signal ledger,
  `~/.claude/observability/signal-2026-MM.jsonl`; open one with `rg <id> ~/.claude/observability/`.
- **`T:Lnnnn`** is line nnnn of tonight's IINA Streams transcript,
  `~/.claude/projects/-Users-rookslog-Development-iina-streams/4aa00c72-182b-4323-9888-04796f3ca308.jsonl`.
  Both files are append-only, so these line numbers stay valid. Times are UTC (EST + 5 h).
- **The IINA lead** is the Claude Code session that ran IINA Streams work tonight (that transcript).
- **A probe** is a one-shot `claude -p --model haiku` run in an empty scratch folder on Claude Code
  2.1.330, 2026-11-22, asking the session to quote the style's paragraph that begins "Anything that is
  a list in substance".
- **Observed** means I saw it in a file, a probe or the docs; **inferred** means reasoning from those.

## 0. The finding that changes the question: scan-first isn't loaded

| Probe setup | Result (observed) |
|---|---|
| No project settings; only the user setting `"outputStyle": "scan-first"` | `NONE`: style text absent |
| Project setting `"outputStyle": "scan-first"` (lowercase) | `NONE` |
| Project setting `"outputStyle": "Scan-first"` (the file's own `name:`) | The exact paragraph |

The docs state the rule: "The value is case-sensitive"
([output-styles](https://code.claude.com/docs/en/output-styles)). This interactive Opus session,
started in `iina-streams`, has no style text in its system prompt (observed by inspection), so this is
not a print-mode artefact. How long the style has been off is unchecked: the August interpretation
`int-20260822T061538-787eac` saw it missing on 2026-08-22, three days after the file was written, which
fits but doesn't prove "never on". The PWE memory `scan-first-reply-style` (PWE is
`~/Development/personal-work-ecosystem`) has stood in for the style since then, but only in PWE sessions.

What follows from it:
- **Section 1's clause-to-harm links are inferred from the text**: "would cause this if loaded". The
  style's benefits are equally unobserved as effects of the style. Keeping them rests on your stated
  preference ("He processes replies by scanning", memory `scan-first-reply-style`, 2026-08-22).
- **Three records are contradicted.** The IINA lead's diagnosis (T:L20102: "The style's end-of-reply
  rule … squeezes several decisions into one line") was made from the file without checking that it was
  loaded. The "New here" sentence of `obs-20261123T001411-acfcc3` repeats that diagnosis. W-7 in
  [`../WAITING.md`](../WAITING.md) (the output-style change) says the style "applies in every project".
  I filed `obs-20261123T004405-7127a6` (correction) and `int-20261123T004404-e90cdb` (the cause). I
  didn't edit `WAITING.md`, which is outside this brief's write scope.
- **The trial compares the draft with no style**, not with scan-first.
- **Fixing only the letter case would be a change for the worse**: it would switch on the two harmful
  clauses everywhere for the first time. Because the file lacks `keep-coding-instructions`, it would
  also drop Claude Code's built-in coding instructions. The docs say custom styles "leave out Claude
  Code's section of built-in software engineering instructions, such as how to scope changes, write
  comments, and verify work, unless `keep-coding-instructions` is set to `true`."

The complaint also predates the style: `obs-20260726T190720-fdc4fd` (26 July: a decision put to you in
"compressed jargon" that "names a distinction without ever stating the underlying facts") came before the
19 August file.

## 1. What to keep, and which clauses do harm

**Keep** (all carried into the draft): the headline first; one section per topic; "anything that is a
list in substance must be a list in form"; paragraphs of about three sentences; tables for option ×
benefit × cost; warrant labels and links in the clause that makes the claim; bold only for the scan
layer (item names, the one unchecked risk, a correction); a short answer to a short question; chat only.

**Clauses that would cause the harm if loaded.** Each mechanism is inferred from the clause's text;
each instance is observed, produced by habit while the style was off.

| Clause in `scan-first.md` | How it produces the harm (inferred) | Instances (observed) |
|---|---|---|
| "A single `Next:` line at the end … One line, not a section." | Several pending decisions packed into one line can only fit as labels | T:L19375 "Still yours: the 3-hour soak before the tag, and whether to report the missing check to IINA"; `obs-20261116T063006-3c6f01` ("two things are still open on your side"); `obs-20261113T010927-4b220e`; `obs-20261109T192212-a2f910` |
| "**Name or label** — one clause on what it is" | Lets a label serve as the name, and the clause can be skipped | T:L20024 "#57; the tag;"; `obs-20261108T120548-a1539c` ("start W-202"); `obs-20261103T181735-724350` ("pretext v2, the Amen thread"); T:L17745 bold item "Windows IINA opened itself", answered at T:L17758 "What do you mean the Windows IINA opened itself?" |
| "findable by eye in under two seconds" | Tests whether a name can be found again, not whether it can be understood | `obs-20261115T014755-2a2338`: "you are indexing W233235 and W236 … how do I get there quickly to look at … the greater context" |
| (No rule on coined terms) | A gloss given once fades from later replies | "Soak" was glossed at T:L19088, T:L19206 and T:L19351, then bare in every closing list from T:L19375. T:L20024 explains the soak in its body, but its closing list doesn't, and after a computer restart (T:L19977) you asked "What's a three-hour soak?" (T:L20046). That fits reading the end first. Also `obs-20261120T120924-938f24` (sonic-affinity-lab: "workshop, mirror, notebook and 'the split'") |
| (No rule on repetition) | Unchanged items get re-listed every turn | 8 "Still yours" blocks from 22:19 to 00:09 UTC (T:L19351, L19375, L19442, L19493, L19621, L19903, L19939, L20024); T:L4435 "I don't want you to just repeat yourself again. Because that wastes tokens." |
| (No rule on what a link must reach) | A link to a whole issue replaces stating a short action | T:L4727 "four new items are in [#49]", then T:L4730 "Again, what do you need me to test?" |

Counted from tonight's transcript with a regex over your messages, 8 of your questions on 2026-11-22
asked what an agent's term or request meant: T:L4435, L4547, L4730, L17758, L17853, L18230, L18559 and
L20046. A regex can miss phrasings, so 8 is a floor against your estimate of 12.

## 2. Style, habit or infrastructure

| Problem | Can a style fix it? | What does |
|---|---|---|
| A label used as a name; a coined term without a gloss; re-listing unchanged items | Yes, per reply | The draft's Lists, Coined terms and Pending items rules |
| Rules that aren't followed | No: "It's an instruction Claude follows, so nothing enforces it" ([output-styles](https://code.claude.com/docs/en/output-styles)) | A check run on each reply (below), but only if the style alone fails |
| Re-situating you after a break | Partly: the style can ask for a re-situation, but the session often can't tell you were away | A hook that tells the session how long since your last message and what changed meanwhile (below) |
| A decision written once and reused | No | The project's waiting file, kept current in the same pass as the change [per: propagation] |
| Glosses that cost tokens every reply | Partly | A short terms list per project, so a gloss is a few words plus a link |

**Why the style alone probably won't be enough** (inferred from the record of instructions that
weren't followed):
- The PWE memory `self-contained-asks` records the same failure five times, from 9 to 23 October.
- The always-loaded decision-presentation rule was skipped in `obs-20261109T193531-0c3d6a`.
- A waiting page existed and bare ids continued (`int-20261108T121521-2c3aa6`: "the gap moved from no
  page to agents not expanding from the page at the point of asking").
- The IINA memory `contextualize-status-points` was broken within the hour of being written (T:L20102).

The style is still the cheapest lever for each reply. Its rules are in the instructions on every turn,
where a memory is only one note among many (inferred; the trial tests it).

**Infrastructure, in order of cost:**
1. **The waiting file.** Each item is written once, under a stable heading, with what it is, how it
   arose, the options, a recommendation and what the answer changes. Answered items move under
   *Answered* with the answer and its date. IINA Streams has one ([`../WAITING.md`](../WAITING.md),
   commit `f3517db`). sonic-affinity-lab has a section, "Waiting on the operator" in
   `~/Development/sonic-affinity-lab/docs/plan/STATE.md`, whose items still lean on bare ids ("E-023,
   E-145", "row 5", "WP-06"; observed). Neither project's agent instructions name its waiting file
   (observed by grep), and the draft relies on that pointer.
2. **A terms list per project.** I found no glossary in either project. IINA Streams defines its three
   plugin copies in `docs/RELEASE.md` "Three identities", but nothing defines "soak", "clearance" or
   "class L".
3. **A gap-aware hook, unbuilt.** I see no timestamps on your messages in this session (observed by
   inspection). A `UserPromptSubmit` hook could add "N minutes since your previous message; the waiting
   file changed since then" to each prompt. That would let "Returning" in the draft trigger on fact
   rather than guesswork. Conjecture that it helps; small to build.
4. **A reply lint, unbuilt and held back.** A `Stop` hook could flag ids (`#57`, `W-3`, `E-145`) with no
   link or gloss in the same line. Hold it unless the trial fails. The stop gate already runs twice per
   turn (W-6 in `../WAITING.md`), and a lint brings false alarms.
5. **A cross-project viewer**, in section 6.

## 3. Audiences

**What the style reaches** (docs quotes are from the pages linked; probe results observed):
- **Subagents:** not reached. "Output styles apply to the main conversation and to a fork, which
  inherits the parent's whole conversation and system prompt. Other subagents run their own system
  prompt, so styles don't change how they respond"
  ([output-styles](https://code.claude.com/docs/en/output-styles)). A probe agreed: the parent showed its
  project style, and the general-purpose subagent it started answered `NONE` and didn't follow it (one
  run, Haiku).
- **Agent-team teammates:** unknown. "Each teammate is a full, independent Claude Code session", and
  "a teammate loads the same project context as a regular session: CLAUDE.md, MCP servers, and skills"
  ([agent-teams](https://code.claude.com/docs/en/agent-teams)). The page doesn't say whether that
  includes `outputStyle`, and I didn't test it.
- **Codex and Gemini agents in Herdr panes** (Herdr is the terminal workspace the agents run in): never
  reached. They aren't Claude Code.

**(a) Chat with you.** The draft style, in full.

**(b) Briefs and returns between agents.** A style can't carry these, so the rules go where agents
read them: the brief itself, agent definitions, and the global `subagent-returns` skill.
- **A brief defines every coined term it uses.** For a Claude subagent the brief is its whole context,
  and for Codex or Gemini it is too.
- **Between agents, ids are fine** once a brief or return defines them. Agents read every line; you
  scan.
- **Returns** keep the forms this repo's `AGENTS.md` and `docs/REVIEW.md` already require: files,
  counts with their command, and what was not tested.
- **The harm arises at relay.** "Clearance 2", "class L" and agent names reached you because the lead
  passed agents' words on. The draft's relay rule puts the translation there.

**(c) Durable docs.**
- **Cite stable ids** [per: cite-your-warrant]; `path:line` belongs in chat [per: link-what-you-cite].
- **Define each coined term at first use**, or link the project's terms list.
- **The waiting file follows the format in section 2**, with a "last updated" line.
- **Decision logs** (`docs/DECISIONS.md` here) hold the reasoning a waiting item links to.

## 4. Adapting to the reader

Three modes, and how a session can tell which one it's in:

| Mode | Signs (what the session can see) | What changes |
|---|---|---|
| **In flow**: quick back-and-forth in one project | Short replies from you, using the session's terms yourself | Terms you have used count as shared. Reasoning only for decisions and surprises |
| **Returning or switching** | You say you're back or restarted; a compaction; "where are we?"; with the hook, a long gap | Open with a re-situation (what changed, what waits, what runs). Define every term again |
| **Thinking aloud** | Dictated, many threads, no action asked | Prose in the order of your turn, fewer and fuller claims, no headline |

The third row comes from the scope note in the PWE memory `scan-first-reply-style` (2026-10-16). That
note is root's reading of your critique, marked unratified there, so strike the draft's
"thinking aloud" bullet if it's wrong. "Root" is the coordinating session in PWE.

**How much reasoning to show.** Show it when a decision is asked (the five points), when a result
contradicts what was expected, or when a claim would change what you do. Otherwise give the result,
its receipt, and a link for background.

**Why a gloss in every reply, not once per session.** You read the end of a reply first
(`obs-20261113T010927-4b220e`; a candidate factor in `obs-20261109T193531-0c3d6a`). You also come back
after breaks and restarts (T:L19977, then T:L20046). A term glossed three replies ago is gone for you.

**Cost control.** A gloss is a few words plus a link. The full text lives once in the waiting file or
the terms list. That meets both halves of your request: more context, without "outputting the same
tokens over and over" (T:L20046).

## 5. A project-local trial in `iina-streams` and `sonic-affinity-lab`

**What Claude Code supports** (docs quoted; probes observed):

| Question | Docs | Probe |
|---|---|---|
| Project style folder | Style locations include "Project: `.claude/output-styles`" | A project style loaded |
| Project setting beats user setting | "A project's own settings files take precedence over that value." Precedence: "managed settings, command line, project local, shared project, user" ([settings](https://code.claude.com/docs/en/settings)) | A project `outputStyle` replaced the user `scan-first` |
| A project file with the same name as a user style | Not stated | The project file won. With no project setting at all, a project `scan-first.md` loaded through the user setting. Hence the draft's distinct name |
| A symlinked style file plus `settings.local.json` | Not stated | Loaded |
| When an edit takes effect | "Claude Code reads style files when it starts, so if you create or edit one during a running session, restart Claude Code" | n/a |
| Subagents | Not reached (section 3) | Not reached |

**Steps for the recommended option A** (local only). The lead of each project runs them after your
yes, not before. They copy the draft rather than link to it. A link into the `iina-streams` working
tree would break when another branch is checked out, and an unresolved style name loads nothing and
reports no error (the lowercase probes).

```sh
DRAFT=~/Development/iina-streams/docs/design/output-style-drafts/scan-first-situated.md
for d in iina-streams sonic-affinity-lab; do
  P=~/Development/$d
  mkdir -p "$P/.claude/output-styles"
  cp "$DRAFT" "$P/.claude/output-styles/"
  grep -qx '.claude/output-styles/' "$P/.git/info/exclude" || echo '.claude/output-styles/' >> "$P/.git/info/exclude"
  # merge the key into settings.local.json, creating it if absent; other keys are kept
  python3 -c 'import json,pathlib,sys; p=pathlib.Path(sys.argv[1]); d=json.loads(p.read_text()) if p.exists() else {}; d["outputStyle"]="scan-first-situated"; p.write_text(json.dumps(d,indent=2)+"\n")' "$P/.claude/settings.local.json"
done
```

Today `iina-streams` has no `.claude/settings.local.json`, and sonic-affinity-lab's holds only an
`Agent` permission (both observed). Git ignores the file in both repositories. After any edit to the
draft, rerun the loop and the check below.

**Steps for option B** (committed). This uses the shared `.claude/settings.json`, which a probe showed
works:

```sh
P=~/Development/sonic-affinity-lab   # or iina-streams, which publishes it
mkdir -p "$P/.claude/output-styles" && cp "$DRAFT" "$P/.claude/output-styles/"
python3 -c 'import json,pathlib,sys; p=pathlib.Path(sys.argv[1]); d=json.loads(p.read_text()) if p.exists() else {}; d["outputStyle"]="scan-first-situated"; p.write_text(json.dumps(d,indent=2)+"\n")' "$P/.claude/settings.json"
git -C "$P" add .claude/settings.json .claude/output-styles/scan-first-situated.md
git -C "$P" commit -m "Trial output style scan-first-situated (docs/design/OUTPUT-STYLE-PROPOSAL-2026-11-22.md)"
```

A `/config` choice in that project writes to `settings.local.json`, which outranks `settings.json`.

**Check it loaded**, then restart the leads in both projects:

```sh
for d in iina-streams sonic-affinity-lab personal-work-ecosystem; do
  (cd ~/Development/$d && echo "== $d" && claude -p "Quote verbatim the paragraph in your instructions that begins 'A term is shared only if'. If there is none, write NONE." --model haiku </dev/null)
done
```

The first two should quote the paragraph and PWE should print `NONE`. That proves print mode only;
that interactive sessions in these two projects load it is unchecked until a restarted lead is asked
the same question.

A scratch-folder run of this check against the draft quoted the paragraph word for word (observed,
2026-11-22).

**Roll back:** delete the `outputStyle` key, the copied style file and the exclude line, then restart.

**Measure for one week from activation**, against the week before it (no style loaded):
- **Your confusion questions:** your messages asking what an agent's term or request means, per
  project. Baseline: 8 in tonight's IINA session (section 1).
- **New signals:** those under `pwe/bare-labels-for-open-items` and its sibling signatures from these
  two projects. `obs-20261109T193532-705bcd` lists eight such signatures.
- **Reply length:** the median length of the lead's replies, so glossing doesn't swell them.
- **Your verdict.**

If confusion doesn't fall, add the reply lint (section 2, item 4). If replies swell with no gain, trim
the Coined terms rule.

## 6. For PWE root: a viewer for what's waiting on you (proposal, not built)

**The problem.** What waits on you is scattered:
- in per-project files: `iina-streams/docs/WAITING.md`, the STATE.md section in sonic-affinity-lab,
  `fable-runs/hfr-monitor/OPERATOR-QUESTIONS.md`;
- on PWE's `reports/WAITING-ON-YOU.md`, generated from the asks ledger by `asks.py`.

That generated page prints no notes. A helper found you could act on 11 of its 40 entries from the page
and their linked pages alone (`obs-20261121T032740-be3153`). You have asked twice for a browsable view.
On 15 Nov you asked again about a Claude Code plugin for project management and onboarding (the
signal's paraphrase, `obs-20261115T014755-2a2338`). On 22 Nov you said you want to "look at what are the to-do items … the
reasoning behind each one, the recommendation … assumptions that are being made"
(`obs-20261122T195109-cce188`).

**One record, one collector, one viewer.**
- **Record:** one item per decision or action, with these fields:
  - its plain-words name and its project;
  - what it is, and how it arose, with links to the transcript message and any signals;
  - the options, the recommendation, the load-bearing assumption, and what would flip it;
  - what the answer changes;
  - its links to other items: what it blocks and what blocks it;
  - its state, and the answer verbatim with its date;
  - what it supersedes, or what supersedes it.

  These are the decision-presentation five points plus a trace of why each decision was made.
  `WAITING.md` here is close already: `### W-n.` headings with bold field labels, and a dependency
  list under W-3.
- **Source of truth:** each project's waiting file, in that fixed format. The asks ledger becomes an
  index over those files rather than a second copy, which removes the drift `obs-20261121T032740-be3153`
  found (inferred).
- **Viewer: one Claude Code plugin (a "mod"), in three parts.** Corrected 2026-11-22: the operator
  runs Claude Code in Ovis, not Sheprd. A Claude Code mod works in any terminal that runs Claude
  Code, and on its desktop and mobile surfaces. Each capability below is from this build's plugin
  API types (2.1.330); none is built:
  1. **An auto-linker.** A `ui.render` hook on `AssistantMessage` may rewrite how a reply is drawn,
     and "a rewrite changes the drawing and leaves the stored message alone". The model writes a
     short reference (`W-7`, `docs/WAITING.md:63`, a relative path). The mod resolves it against the
     session's folder and the project's waiting file, finding the `### W-7.` heading at draw time
     so line numbers never drift, and draws a clickable link (`Link`, an OSC 8 hyperlink in a
     terminal). That removes the output tokens of absolute paths.
  2. **A waiting pane beside the chat** (`$.ui.open` with a `Pane` render): the open items from the
     project's waiting file, each expandable to its full entry and its dated updates. An optional row
     above the prompt (`AbovePrompt`) could say how many items are new or changed.
  3. **A `/waiting [id]` command** (`$.command.register`) that prints one item in full on request, so
     the context is pulled when wanted, not pushed every turn. The gap-aware hook from section 2 fits
     here too, through `prompt.submit` or `prompt.compose`.

  A published claude.ai page backed by a database stays an option for reading on a phone.
  **Unchecked, and it could sink the auto-linker:** whether Ovis opens OSC 8 hyperlinks and
  `file:line` targets. The sonic-affinity-lab complaint that links don't open at the spot
  (`obs-20261122T195028-db0380`) may be the terminal's doing.
  **Link test, 2026-11-23 (observed, from the operator's screenshot):** clicking a link to
  `docs/WAITING.md` opened Ovis's file viewer with "Several files are named WAITING.md". It listed
  this one and a copy in an agent worktree (`.claude/worktrees/agent-…/docs/WAITING.md`). So Ovis
  resolves a link by file name, even when the link gives the full path. It doesn't refuse: it offers
  a choice. The operator's point is that the choice is ambiguous, because they may not know which
  copy is meant. Of the repository's 12 worktrees (`git worktree list`, 2026-11-23), only two sit
  inside the project folder, both under `.claude/worktrees/`, and only those collided (inferred: the
  chooser listed one of them and none of the copies in `iina-streams-wt/`). The `agent-` names
  suggest Claude Code's own subagent worktree option made them. The fix is to keep worktrees outside
  the project folder, as the lead already does for its own (`iina-streams-wt/`), and to remove each
  when its work is merged. That belongs to the IINA lead.
  **Context cost of `/waiting`:** a command's answer can set `isTextDisplayOnly`: "the output row is
  drawn and kept, and goes in no request" (API types). So `/waiting W-7` need not enter the model's
  context, and the pane never does (inferred: it's UI only). Both are untested.
- **Citation resolver: the core of the plugin (added 2026-11-23 at the operator's request).** Agents
  cite only an id: `W-7` (waiting item), `D-33` (decision), `R-4` (requirement), `#57` (issue),
  `obs-…` (signal). The plugin turns each into a link when the reply is drawn. A small per-project
  map (for example `.claude/citations.json`) says, for each prefix, which file holds it and what its
  heading looks like (`### W-7.` in `docs/WAITING.md`). Issues go to their GitHub URL and signals
  to the ledger. The plugin finds the heading at draw time and stores no line number, so a link can't
  drift to the wrong entry. That drift happened tonight: this proposal cited D1 at line 358, and its
  own later edits moved D1 to line 390, so the operator landed on the wrong entry
  (`obs-20261123T054433-234887`). Entries cite each other the same way, and the pane can show what
  cites an entry ("cited by"). That is the useful core of spec-driven development (ids and
  traceability across requirement, decision, issue and test) without the rest of its process.
  Markdown can stay the storage while ids sit in headings. The history and cross-links argue for an
  event store later, with Markdown as a generated view, as the signal ledger already does.
- **A central index for root and for every agent (the operator's idea, 2026-11-23).** One store,
  updated automatically, holds the open waiting items, recent decisions and recent signals of every
  project, each with its author, session and dated history.
  - **Who reads it:** root reads it to stay current on all projects. The operator uses it through
    the pane. Any agent uses it to onboard to a project: what's open, what was decided lately, what
    went wrong lately.
  - **Fed from what exists:** each project's waiting file and decision log; PWE's asks ledger
    (`asks.py`); the signal ledger, whose events already carry the session and the exact message.
  - **Pulled, not pushed:** a session gets a few lines at most at start, and more only on request
    (`/situate` or the pane), because loading it into every session wastes usage when it isn't needed
    (`obs-20261120T212838-589361`).
  - **Ids need a project prefix.** PWE's ledger numbers asks globally (W-264), while IINA Streams
    numbers its own (W-1 to W-13), so "W-7" alone is ambiguous across projects (observed in both
    files). The resolver would read `iina:W-7`, or take the project from the session's folder.
  - **Who may write:** any agent whose work needs the operator adds an entry addressed to the
    operator, and the store records which agent and session wrote or updated it. Items that affect
    every project, such as D2 and D3 in this proposal (the global style setting and the global
    decision rule), belong in root's list, even when they arose in one project.
  - **The risk is the one the situation map met** (8 events under `situation-map-built-not-used`): an
    index nobody opens. The resolver and the pane put it on the path both the operator and the
    agents already use.
- **First step:** agree the field format, convert the two trial projects' waiting files to it, and
  test link opening in Ovis, then build the
  auto-linker and the read-only `/waiting` command as one mod. Then check whether your confusion questions fall further.
- **The main risk** is a viewer nobody opens. The theme `situation-map-built-not-used` has 8 events
  since 5 Oct (e.g. `obs-20261023T143055-1ebe8d`: "dead on arrival. All this effort for nothing").
  So the viewer has to sit where you already look, and agents have to link into it.

This project-local trial is itself the "try it locally, then propose it" path asked for in
`obs-20261123T002548-e04b04`. One version of the pattern is a style or setting placed in a project's
`.claude/`, measured, then promoted to `~/.claude/`.

## 7. Where the "waiting on you" habit comes from (added after the operator's question)

**Three sources, none of them the style:**
1. **PWE memories** (observed). Four memories in `~/.claude/projects/-Users-rookslog-Development-personal-work-ecosystem/memory/` tell sessions to keep a waiting page and cite ask ids: `waiting-on-you-file`, `asks-go-in-the-ledger`, `expand-waiting-items` and `self-contained-asks`. PWE's asks ledger (`asks.py`) gives each ask a W-number such as W-264. The memories disagree on the link. `waiting-on-you-file` says "every chat mention of a W-id links its own line", but `asks-go-in-the-ledger` says "Replies cite `W-0nn` ids with the absolute path to the page", the page and not the line. An id plus a page link, or an id alone, satisfies the second.
2. **Memory is per project folder** (observed: each project has its own `memory/` directory). Those four rules load only in sessions started in PWE's root. The IINA Streams and sonic-affinity-lab memories hold no waiting-file rule. A lane started in a PWE subfolder gets its own, separate memory folder. That explains the inconsistency: sessions outside PWE root never had the rule (inferred).
3. **The model's own habit** (observed in tonight's IINA session, which loaded none of these rules): it ends a turn by listing what's open. The global decision-presentation rule allows "a register row may abbreviate to a label for indexing" and asks for expansion only "the moment I ask you to act on it". A closing "Still yours" list isn't framed as asking, so it slips through (inferred).

**Conjecture, to test:** the stop gate (`delegate-ops/delegateops/plugins/stop-rule/hooks/stop_gate.py`) blocks a turn that *ends like a question* ("your call", "would you like", a trailing "?") unless a stop condition is named. A declarative "Still yours: X, Y" list matches none of its patterns and passes. The gate may therefore push sessions from asking toward exactly this list. It blocks only in runs with a `.kickoff.json` (its docstring). sonic-affinity-lab has one; iina-streams doesn't, though tonight's lead wrote stop tags (T:L19493). To test, count blocked stops per project in the gate's log, and compare the phrasing of closing lists before and after the gate was installed.

**What follows for the trial.** The draft style puts the rule where every session in the project loads it, instead of in one project's memory. It names the link precisely: the item's own line. It also covers closing lists that aren't phrased as asks.

**The month's survey.** Two read-only agents read all 1,116 observations filed from 2026-10-22 to
2026-11-23. The merged table, with method and counts, is kept privately at
`~/.claude/observability/research/2026-11-22-operator-communication-survey.md`, because its rows name
private projects and this repository is public. Its 6 spot-checked rows matched their source.
- **353 of the 1,116 (about a third) concern how agents communicate with you.**
- **The largest class is a claim beyond its evidence (114 primary).** The draft leaves that to the
  global claims-discipline rule.
- **Next come: asking or stopping when an agent could have answered (34); a waiting place stale or
  unused (28); a decision without its context (24).** Bare-label asks, missing links, undefined
  jargon and not re-situating you total 47 as a primary class, and 81 when secondary classes are counted
  (one row can count twice).
- **Models:** only 59 rows name one. Fable 5.2 has 31, all from November when root ran on Fable.
  Opus has about 26, Opus 5.5 or unversioned. Both appear under bare labels and claims beyond
  evidence. The record can't separate the model from the role it played (inferred), so it doesn't
  support blaming one model's style.
- **No observation reports that a fix for bare labels or missing links worked.** Several report
  the fix failing: `obs-20261116T063006-3c6f01`, `obs-20261123T001411-acfcc3`, and
  `obs-20261123T021427-46c60f`. The last is PWE root using bare W-267 to W-269 two hours after the
  same complaint, and you said: "Literally, I complained about this issue to you, and you're still
  doing the same thing."

**Two survey findings changed the draft:**
1. ~~When a decision is asked for now, its substance goes in the chat~~ (from the expectation of
   `obs-20261123T021427-46c60f`). **Reversed by the operator, 2026-11-22:** "I really don't think all
   of it should be in the chat … it should be linked and easily accessible from the chat so that we
   can reuse that history and that effort that has come before." The draft now gives one line in
   chat: what the item is, what's needed, the recommendation in a clause, and the link. The depth and
   the item's dated history stay in the waiting entry.
2. `path:line` links don't always open at the spot (`obs-20261122T195028-db0380`, sonic-affinity-lab).
   The one line must therefore say what the item is even if the link fails. That doesn't mean
   repeating the entry. The draft also now says to check that an item is
   still open and truly yours before listing it (`obs-20261023T154535-c016d4`,
   `obs-20261108T173213-4006dc`).

## Decisions for you

### D1. How to trial the draft style in the two projects

**What it is.** Whether, and how, to switch on the draft style for a week in `iina-streams` and
`sonic-affinity-lab`. It's yours because it changes how every reply reads to you there, and
`iina-streams` is a public repository, so committing the style publishes it.

| Option | What it buys | What it costs |
|---|---|---|
| **A. Local only** (steps in section 5) | Nothing published. One command copies the same draft to both projects. Rollback is one key | Sessions started in a worktree or another clone don't get it |
| **B. Committed** `.claude/settings.json` and style file (the brief's wording) | Every checkout, worktree and teammate in the repository gets it | Publishes the style in the public `iina-streams` repository |
| **C. Skip the trial; change the global style** | One step | Reaches about 26 live panes untested (`obs-20261123T002548-e04b04`), and skips the local trial you asked for (`obs-20261123T002549-3ce6dc`) |
| **D. No style; the waiting file and habit only** | No change | Habit produced tonight's lists with no style loaded |

**Recommendation: A, for one week, measured as in section 5.** It tests the draft where the problem
is, publishes nothing, and comes off by deleting one key. Approving A also approves its cascade, which
each project's lead carries out:
- the steps in section 5;
- one line in each project's agent instructions naming its waiting file (`iina-streams/AGENTS.md`:
  `docs/WAITING.md`; `sonic-affinity-lab/CLAUDE.md`: `docs/plan/STATE.md`, "Waiting on the operator");
- rewriting that STATE.md section's bare-id items in plain words;
- correcting W-7 in `docs/WAITING.md` to say the global style isn't loaded, and linking this proposal;
- a pointer from the IINA memory `contextualize-status-points` to the trial style;
- restarting both leads.

**Load-bearing assumption.** The sessions that talk to you in these projects start in each project's
main folder, not a worktree. Subagents never get a style either way.

**What would flip it.** If a lead or teammate that talks to you runs from a worktree, use B in
sonic-affinity-lab. Its repository is private, so committing publishes nothing. Check by listing the
working folder of each Claude pane in Herdr.

**Answered 2026-11-22, about 22:25 EST:** "Yes, switch the trial on." Option A was installed in
both projects by copying the draft. The check in section 5 quoted the style in `iina-streams` and
`sonic-affinity-lab`, and printed `NONE` in PWE. Running sessions there get it only after a restart.
Interactive loading is unchecked until a restarted lead is asked. The draft also names both waiting
files itself, so no tracked file had to change. Left for each project's lead: correct W-7 in
`docs/WAITING.md`, and rewrite the bare-id items in sonic-affinity-lab's STATE.md section.

### D2. What to do with the inactive global setting

**What it is.** `~/.claude/settings.json` asks for `scan-first`, and the style is named `Scan-first`,
so no session loads it (section 0). It's yours because that file is shared by every project, and this
brief barred me from changing it.

| Option | What it buys | What it costs |
|---|---|---|
| **Leave it until the trial ends** | Nothing changes anywhere, and the trial has a clean comparison | The setting keeps naming a style that isn't loaded |
| **Fix the letter case now** | The style you believed was on, on | Switches on the two harmful clauses everywhere for the first time, and drops the built-in coding instructions everywhere |
| **Remove the setting** | Settings say what is true | No change in behaviour on this Mac; Dionysus, the other machine, may differ (unchecked) |

**Recommendation: leave it.** When the trial week ends, either promote the trial style globally, with `name:`
matching `outputStyle` letter for letter, or drop it. Fixing the case now would spread exactly the
clauses this review faults.

**Load-bearing assumption.** No session anywhere depends on scan-first being active now. That's
observed for this Mac and unchecked for Dionysus: the memory `scan-first-reply-style` records you saying
in August that the style worked there.

**What would flip it.** If `/config` on Dionysus shows Scan-first active, the harmful clauses are live
there. Copy the draft there before the trial ends.

### D3. The global decision rule asks for what you just rejected

**What it is.** `~/.claude/decision-presentation.md` says a register label may be used for indexing,
"but the moment I ask you to act on it, I expand it to the five points above", in chat. You now want
one line in chat and the five points behind a link. That rule loads in every project and outranks a
style in practice (inferred: it sits in CLAUDE.md, the style only shapes layout). It's yours because
it's your global rule.

| Option | What it buys | What it costs |
|---|---|---|
| **Amend the rule** to "one line in chat (what it is, what's needed, recommendation) plus a link to the five points written in the waiting entry" | Chat and rule agree, in every project | A global edit; sessions in projects without a waiting file need the fallback kept |
| **Leave it; the trial style says the opposite** | No global change | Two instructions disagree, and sessions may obey either |
| **Wait for the trial's result** | Evidence first | A week of the conflict |

**Recommendation: amend now,** keeping "five points in chat" as the fallback when no waiting file
exists. Your words settle the preference. The trial then tests the format, not a conflict.
**Load-bearing assumption:** the waiting entry really holds the five points. Where it doesn't, the
one line is a bare label again. **What would flip it:** entries found incomplete during the trial,
which the leads' audit of their waiting files would show.

## 8. Notes added after the trial went on

- **Unreported frustration is recoverable.** The survey read signals only, so anything you didn't
  report is missing from it. Claude Code transcripts are kept (`cleanupPeriodDays` is 3650), and
  647 of them, 5.5 GB, changed in the last month. 1,031 of the month's 1,119 observations carry the
  transcript path and the exact message id. A transcript survey would extract your messages with a
  script, flag confusion and frustration (as section 1 did by hand for one session), have agents
  classify the flagged ones, and count which became signals. Codex and Gemini sessions, and anything
  on Dionysus, are stored elsewhere and unchecked.
- **Auto-linking, for the plugin (section 6).** You want the model to write a short reference, such
  as `WAITING.md#W-7` or a relative path, and have something turn it into a clickable link. That
  saves the output tokens of absolute paths. A Claude Code mod can do it: the auto-linker in section 6
  (observed in the API types, not built). Until it exists the style keeps absolute `path:line`.
- **Item history.** You want every update to a waiting item kept. The draft now asks for a dated
  update line under the item instead of overwriting it. The viewer in section 6 would store updates
  as events, as the signal ledger does, and show the current state with its history.

