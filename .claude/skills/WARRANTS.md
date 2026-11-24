# Warrants for the design set (draft 3.3)

**Draft 3.3, 24 November 2026; provisional; not yet marked by the operator; one desk test of the reaction skill (on 3.1, two agents per version) and Codex source checks of 3.1 and 3.2; not used in a project yet.** Since draft 3.1, two optional fields may be added to an entry where they apply (rough piece 8, adopted provisionally): **In its setting**, the section the quoted words stand in and whose voice they are in where the text has more than one; and **What complicates the line**, a passage cited as carefully as the one that backs it. Entries that begin "Provisional" back lines applied before the operator marked them, or are themselves rewritten without the operator's mark; their sources are named. A Codex check of draft 3.1 tested the entries then marked Provisional, and the rewritten `derrida-fault`, against their named sources (`scratch/runs/draft-3.1/check/REVIEW.md`, untracked). Draft 3.2 made sixteen of the corrections that check asked for in full and two in part (F4 left the standing distinction in `r1-record`'s Limits; F16 put the page and translation in `derrida-fault`'s "In its setting" rather than on the Says line), and added three entries (`check31-stop`, `desk1-proportion`, and, at the lead's later request, `implicit-exclusion`). A Codex check of draft 3.2 (`scratch/runs/draft-3.2/check/REVIEW.md`, untracked) tested the 3.1 check's 18 F-rows, the 22 new or changed entries, the README counts and locators, and pointers; draft 3.3 applies those corrections and adds `lead-stop-branch` and `loop-corrections`. No other reader has checked the changes of 3.3. Paths that do not begin with `../` resolve from the root of the design-practice-lab repository (`/Users/rookslog/Development/design-practice-lab`), where the records are kept; an installed copy does not carry them.

Each entry: where the line came from; the source and how far it was read; what the source says, quoted exactly where a path is given (checked by `tools/warrant_quote_check.py`); how it was read; the step from that reading to the line, where the step is the lead's own carrying-over; what was read beside it and how that differs; limits; and the lines it backs. **The check reruns only while the untracked copies of the sources exist** under `scratch/runs/` on this machine; the books and papers are not in the repository. "Through a scout" means a Gemini reading scout found the passage and the lead checked the words by script.

**On the words used.** Sources are set beside each other; none is another's opponent and none judges the rest. The tag `[otherwise: …]` and the field "Read beside it" replaced `[against: …]` and "Challenger" on 23 November, on the operator's word ("i fear dialectics"). Where a source itself takes issue with another, that is reported as its own act.

**One file for the whole set.** The Reading Lab keeps a warrants file beside each skill. Here several skills lean on the same sources, so one file is kept and each entry lists the lines it backs, by skill. A line can still be deleted or changed together with its warrant.

### [op-not-calculative]
- Came from: The operator, 23 November, on how principles bind.
- Source and extent: The operator's own words; whole message recorded.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/brief/OPERATOR_DIRECTION.md` :: "One doesn't need to be calculatively applying each principle exactly as it is written"
- Read as: A principle binds and still has to be applied by someone in a situation.
- Read beside it: Impeccable's gates: where an agent's belief in its work is the risk, a check that refuses does better than judgment (Notes 2, part 3).
- Backs: designing-with-a-person: These lines orient you. None carries its own application. What a line …

### [suchman-instructions]
- Came from: The operator's point above, looked for in a source from another tradition.
- Source and extent: Suchman, Human-Machine Reconfigurations, chapters 5 and 6; through a scout's passages and contexts the lead opened.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/scratch/runs/scout-2c/sources/suchman-plans-and-situated-actions.txt` :: "does not inhere in the instruction but must be found by the instruction follower with reference to the situation of its use"
- Read as: No instruction carries its own application.
- Step to the line: From people following instructions to an agent following a skill. The carrying is the lead's; whether an agent finds meaning in a situation as a person does is not tested.
- Read beside it: The studies of coding agents: agents carry written instructions out to the letter (gloaguen, in Notes 3).
- Limits: About people and 1980s planning systems, not language models. Her own notes warn against reading her as against plans.
- Backs: designing-with-a-person: These lines orient you. None carries its own application. What a line … | using-the-design-set: There is no fixed order. Load the one for the moment you are in, and g…

### [shepard-coverage]
- Came from: Whether a skill can make design judgment better.
- Source and extent: Shepard and Albrecht, arXiv 2606.20512v2; abstract, sections 1 to 3.3 and 7.3 to 8 read by the lead; results sections unread.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/scratch/runs/sitting-3/sources/2606.20512v2.txt` :: "improved guidance helps agents reach the correct file rather than improving the quality of the changes they make"
- Read as: Guidance may change where work gets to and leave its quality as it was.
- Step to the line: From "reaches the right file" in code to "where the work gets to" in design. The lead's, from one study.
- Read beside it: The authors' own framing, that instruction quality is a first-order factor.
- Limits: One small model, coding tasks with tests. Carrying it to design is the lead's.
- Backs: designing-with-a-person: Nothing here gives design sense. Guidance can change where the work ge…

### [schon-repertoire]
- Came from: The same question, from a study of a designer teaching.
- Source and extent: Schön, The Reflective Practitioner, chapter 3; through a scout's passages and contexts the lead opened.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/scratch/runs/scout-2c/sources/schon-ch3-design-as-reflective-conversation.txt` :: "But Quist reflects very little on his own reflection-in-action"
- Read as: The teacher's skill comes from cases he has seen and is not written down by him.
- Step to the line: From an architecture studio to software design. The lead's.
- Read beside it: Schön's own hope, in the same chapter, of a generic design process.
- Limits: One teacher, one student, twenty minutes, architecture.
- Backs: designing-with-a-person: Nothing here gives design sense. Guidance can change where the work ge…

### [diss-skill]
- Came from: Who can catch a defect in an agent's work.
- Source and extent: Dissanayake et al., arXiv 2610.27801v1; through a scout's passages and contexts the lead opened.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/scratch/runs/scout-1/sources/dissanayake-2610.27801v1.txt` :: "self-reported experience with agentic AI tools was not associated with defect resolution"
- Read as: Knowing the subject predicted catching defects; experience with agents did not.
- Step to the line: From catching seeded defects in code to judging a design. The lead's.
- Read beside it: None found in what was read.
- Limits: 36 people, short Python tasks, seeded defects.
- Backs: critiquing-a-design: You judge well only what you know. Say which parts of the subject you … | designing-with-a-person: Nothing here gives design sense. Guidance can change where the work ge…

### [grunde-ticks]
- Came from: The lead's reports that listed receipts as all holding.
- Source and extent: Grunde-McLaughlin et al., arXiv 2602.16844v1; through a scout's passages and contexts the lead opened.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/scratch/runs/scout-1/sources/grunde-2602.16844v1.txt` :: "a highly visible set of green checkmarks"
- Read as: Evidence arranged by the agent from its own account raised confidence more than accuracy.
- Step to the line: From research reports to design reports. The lead's.
- Read beside it: The operator's standing rule of a claim with its receipt, which this does not overturn: a receipt lets a reader check.
- Limits: Small studies, one agent system, hand-made annotations.
- Backs: critiquing-a-design: Do not lead with a score. If a score is asked for, put it after the pr… | designing-with-a-person: Citing a tag or passing a check settles nothing that is owed to the pe… | reporting-design-work: Make the consequence of a choice concrete. Do not lead with a score or…

### [audit-purpose]
- Came from: The audit of 23 November found that nothing first fixed what a page was for.
- Source and extent: `/Users/rookslog/Development/sonic-affinity-lab/docs/audit/2026-11-23-design-process/INDEX.md`, the lead's index of four auditors; not quoted here.
- Read as: Purpose before appearance.
- Step to the line: The audit found the lack; that a sentence of purpose would have helped is the lead's inference.
- Read beside it: Schön: one may begin by imposing an order and learn the purpose from what it does (schon-discipline).
- Backs: starting-a-design: Say in one sentence what the thing is for, in the person's words where…

### [op-tensions]
- Came from: The operator, in the IINA streams project, 23 November.
- Source and extent: The operator's words as recorded in Notes 2, part 1, from that project's session.
- Says: `docs/design/process/NOTES-2-how-to-write-the-skills.md` :: "never can perfectly resolve these tensions, but how we would respond to them through our design"
- Read as: Several users, whose wants are answered and not dissolved.
- Read beside it: Impeccable's instruction that the user's goal be one (imp-one-goal).
- Backs: designing-with-a-person: Whether a tension has been answered well enough… | starting-a-design: Write who uses it as kinds of user, each with what they want, and set … | starting-a-design: For each tension, say how the design responds. A tension may stay open…

### [iina-users]
- Came from: A draft already made in the operator's other project.
- Source and extent: The Users section of the IINA streams product record, read whole by the lead; marked there as a draft for the operator to correct.
- Says: `~/Development/iina-streams/PRODUCT.md` :: "not resolved, responded to"
- Read as: Kinds of viewer, tensions, a floor, explicit exclusion.
- Step to the line: Taken from a draft the operator has not confirmed.
- Read beside it: That draft keeps a primary viewer and gives every tension a response.
- Limits: A draft.
- Backs: starting-a-design: Write who uses it as kinds of user, each with what they want, and set … | starting-a-design: Say what every kind of user is owed whatever gets priority, and whom a…

### [levinas-third]
- Came from: The operator asked what exceeds the principles, and named Levinas.
- Source and extent: Levinas, Otherwise than Being, pages 157 to 159 read by the lead from a scanned text; the rest of chapter V sections 3 to 5 through a scout.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/scratch/runs/scout-2d/sources/levinas-otb-ch5-sections-3-to-5.txt` :: "It is troubled and becomes a problem when a third party enters."
- Read as: With more than one to answer to, comparing them is required and always to be corrected.
- Step to the line: From persons to whom one is responsible to kinds of user of software. The lead's. The line takes only the structure (more than one, so comparing is required); it asks for none of the terms.
- Read beside it: Derrida's essay on Levinas warns against turning a text's matter into an instance of a general pattern (Notes 2, part 4).
- Limits: Ethics between persons. Its use for software users is the lead's carrying-over. No Levinas term is put into a skill line.
- Backs: designing-with-a-person: Whether a tension has been answered well enough… | starting-a-design: Write who uses it as kinds of user, each with what they want, and set …

### [imp-one-goal]
- Came from: Named as a source that says otherwise than the line.
- Source and extent: Impeccable, `reference/distill.md`; through a scout's passage.
- Says: `~/.agents/skills/impeccable/reference/distill.md` :: "There should be ONE"
- Read as: Impeccable asks for one primary goal.
- Read beside it: This draft's own line on kinds of user.
- Backs: starting-a-design: otherwise: Write who uses it as kinds of user, each with what they want, and set …

### [op-absence]
- Came from: The operator, in the IINA streams project, 23 November.
- Source and extent: As recorded in Notes 2, part 1.
- Says: `docs/design/process/NOTES-2-how-to-write-the-skills.md` :: "You don't necessarily attend to absence as well"
- Read as: What was not said is evidence.
- Read beside it: Attending to absence can become inventing wants the person does not have.
- Backs: starting-a-design: Ask what is missing from what you were told. What would the person hav…

### [patel-unstated]
- Came from: The same point, measured for code.
- Source and extent: Patel et al., arXiv 2611.01181; abstract and sections 1, 2, 4.3, 4.4 and 5 read by the lead.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/scratch/runs/sitting-3/sources/2611.01181.txt` :: "the primary bottleneck is identifying the latent defect rather than implementing its repair once identified"
- Read as: What is stated gets done; what is not stated is mostly missed.
- Step to the line: From defects a coding task did not state to wants a person did not state. The lead's.
- Read beside it: The same paper (§4.4, Table 3): asking an agent to look beyond the task lowered the resolve rate of the task itself for all three models in that comparison (the size of the drop differed).
- Limits: Coding tasks. The measure does not penalise needless defensive changes.
- Backs: reading-a-reaction: do not turn each remark into an item… | starting-a-design: Ask what is missing from what you were told. What would the person hav…

### [chen-omission]
- Came from: What a plan or brief leaves out.
- Source and extent: Chen et al., arXiv 2604.04918v2; through a scout's passages and contexts the lead opened.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/scratch/runs/scout-1/sources/chen-2604.04918v2.txt` :: "The same mechanism could work against the user for omission risks, where safety required an additional protective action."
- Read as: A brief keeps out what it does not mention, including what it should have mentioned.
- Step to the line: As for chen-plan.
- Read beside it: The same study: plans much reduced the harmful actions an agent attempted.
- Limits: Web tasks, a lightweight model, a made-up user profile.
- Backs: critiquing-a-design: You are given what the thing is for and who uses it, as kinds of user … | starting-a-design: Ask what is missing from what you were told. What would the person hav… | starting-a-design: Read your own brief for what it got wrong before you build on it. What…

### [chen-plan]
- Came from: The lead treated an authorisation to run as covering what followed, 22 to 23 November.
- Source and extent: As above.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/scratch/runs/scout-1/sources/chen-2604.04918v2.txt` :: "approving an abstract representation of future behavior could reduce the perceived need to reassess that behavior when it materialized in a concrete form"
- Read as: Agreement to a description is not agreement to the thing.
- Step to the line: From approving an agent's plan for a web task to agreeing a design brief or a run. The lead's.
- Read beside it: The same study: an approved plan placed in the agent's instructions is what steered it well. So a plan is worth having; the line is about what agreeing to it covers.
- Backs: reporting-design-work: A go-ahead covers what was described. It does not cover what follows f… | starting-a-design: Make one small concrete thing early and show it. Say how rough it is a…

### [iina-critique]
- Came from: A critique run as its method requires, measured against a person's reaction.
- Source and extent: The IINA streams waiting item on the sidebar layouts (W-17), read whole by the lead.
- Says: `~/Development/iina-streams/docs/WAITING.md` :: "the critique judges against the brief"
- Read as: That project's lead read the result so: generic failures caught, wrong calls in the brief missed. The page scored 22 of 40, "Acceptable"; the person had called it "trash".
- Read beside it: The report itself, which steps outside the brief twice (iina-critique-report).
- Limits: One page, one run. The lead first took this summary for the report; corrected in Notes 4.
- Backs: critiquing-a-design: The brief is given to you as something to judge. It is not the standar… | reading-a-reaction: What they say of how it looked or sounded to them is evidence about it, not the standard… | starting-a-design: A check that is handed the brief will mostly check against it.

### [imp-template]
- Came from: A claim by Impeccable's authors about models.
- Source and extent: Impeccable, `reference/visualize.md`; through a scout's passage.
- Says: `~/.agents/skills/impeccable/reference/visualize.md` :: "a prompt that specifies everything gets back a template"
- Read as: What a brief pins down, the model stops deciding.
- Step to the line: From image prompts to briefs in general. The lead's.
- Read beside it: No source is given there; it reads as a lesson from watched sessions.
- Backs: starting-a-design: Read your own brief for what it got wrong before you build on it. What…

### [grunde-goals]
- Came from: People cannot say everything in advance.
- Source and extent: As for grunde-ticks.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/scratch/runs/scout-1/sources/grunde-2602.16844v1.txt` :: "Several participants updated their goal post after seeing partial or full completion of the task"
- Read as: Wants change on seeing a partial result.
- Step to the line: As for grunde-ticks.
- Read beside it: chen-plan: what is shown early can also lower scrutiny later.
- Backs: designing-with-a-person: Whether the thing is good for them, and what it is for when that is in… | starting-a-design: Make one small concrete thing early and show it. Say how rough it is a…

### [schon-discipline]
- Came from: How a designer begins.
- Source and extent: As for schon-repertoire.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/scratch/runs/scout-2c/sources/schon-ch3-design-as-reflective-conversation.txt` :: "You should begin with a discipline, even if it is arbitrary"
- Read as: Impose an order to find out what it does; it can be broken open later.
- Step to the line: From a designer's opening move on a site to showing a person something early. The lead's.
- Read beside it: audit-purpose.
- Backs: starting-a-design: otherwise: Say in one sentence what the thing is for, in the person's words where… | starting-a-design: Make one small concrete thing early and show it. Say how rough it is a…

### [audit-round1]
- Came from: The audit found that round 1 worked: it began from a stated design and was tried by hand.
- Source and extent: `/Users/rookslog/Development/sonic-affinity-lab/docs/audit/2026-11-23-design-process/INDEX.md`; not quoted here.
- Read as: A concrete thing, tried, early.
- Step to the line: One liked round. That its early trying by hand is why it was liked is the reasoning auditor's inference, marked as such there.
- Read beside it: One round.
- Backs: starting-a-design: Make one small concrete thing early and show it. Say how rough it is a…

### [op-not-sovereign]
- Came from: The operator, on being made the standard a critique is scored against.
- Source and extent: W-17, as above.
- Says: `~/Development/iina-streams/docs/WAITING.md` :: "I'm not sovereign"
- Read as: A reaction is evidence, shaped by its situation.
- Read beside it: The person is still the only authority on their own first look.
- Backs: critiquing-a-design: If you are given what the person said about the thing, their account of it is evidence and not the answer key… | designing-with-a-person: The person is the authority on their own first look. They are not ther… | reading-a-reaction: What they say of how it looked or sounded to them is evidence about it, not the standard…

### [audit-remark-item]
- Came from: The audit's name for the lead's fault.
- Source and extent: An independent auditor's report; the lead opened its receipts.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/docs/audit/2026-11-23-design-process/reasoning/REASONING-AUDIT.md` :: "remark in, item out"
- Read as: Each remark became an added item, in pages and in proposals.
- Read beside it: Impeccable's critique, which maps each finding to a command on purpose.
- Backs: reading-a-reaction: do not turn each remark into an item…

### [iina-readings]
- Came from: The operator asked that lead what justified its reading.
- Source and extent: W-17, as above.
- Says: `~/Development/iina-streams/docs/WAITING.md` :: "what justifies that reading, and what other readings might we have?"
- Read as: Seven readings were then written with grounds, one about the lead, and the next round was designed to test fidelity (3), scope against hierarchy (2 against 1), and the reference (5) — not to distinguish all seven.
- Step to the line: From one case in another project to a general line. The lead's; the operator put that question to that lead about one reading.
- Read beside it: Writing readings can become a way of not deciding.
- Limits: One case.
- Backs: reading-a-reaction: hold more than one reading… | reading-a-reaction: Choose a next step that could show your reading wrong…

### [op-haunted]
- Came from: The operator, in the IINA streams project.
- Source and extent: As recorded in Notes 2, part 1.
- Says: `docs/design/process/NOTES-2-how-to-write-the-skills.md` :: "stop continuing as if a reading is absolute and sovereign"
- Read as: Keep other readings reachable.
- Read beside it: The Reading Lab's design notes count it a failure to refuse to decide "on the strength of 'both are valid'" (see rl-working-choice).
- Backs: reading-a-reaction: hold more than one reading… | reading-a-reaction: Keep the others findable…

### [audit-mark-places]
- Came from: The audit found that nobody had asked the operator to point at the text that should not be there.
- Source and extent: As for audit-remark-item.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/docs/audit/2026-11-23-design-process/reasoning/REASONING-AUDIT.md` :: "Nobody ever asked the operator to mark the places"
- Read as: Ask the person to point.
- Step to the line: Since draft 3.2 the line asks for pointing only when it would change the next step, and is joined to the line on asking to be shown (`rough-shown`). That scope is the Codex check of 3.1 (its worked use 2), not the audit's.
- Read beside it: none found in what was read.
- Backs: reading-a-reaction: ask them to show or point only when that would change your next step…

### [grunde-unfound]
- Came from: What a person wanted to be shown.
- Source and extent: As for grunde-ticks.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/scratch/runs/scout-1/sources/grunde-2602.16844v1.txt` :: "it showed what it seemed to be unable to find"
- Read as: Say what was not found.
- Step to the line: As for grunde-ticks.
- Read beside it: One participant's remark.
- Backs: critiquing-a-design: End with what ran and what did not, what you were and were not given, … | reporting-design-work: Say first what you did not look at, did not find and did not test, and…

### [diss-check]
- Came from: Asking an agent to check its work.
- Source and extent: As for diss-skill.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/scratch/runs/scout-1/sources/dissanayake-2610.27801v1.txt` :: "can create visible verification without an independent judgment about where the implementation may fail"
- Read as: A generic check shows activity, not diagnosis.
- Read beside it: none found in what was read.
- Backs: critiquing-a-design: A general instruction to check finds little | reporting-design-work: Make the consequence of a choice concrete. Do not lead with a score or…

### [op-on-faith]
- Came from: The operator, 23 November, on the lead's critique of its own rounds.
- Source and extent: The operator's own words.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/brief/OPERATOR_DIRECTION.md` :: "you're just giving me a list of items that I just have to take on faith"
- Read as: A report must be something the person can question.
- Read beside it: none found in what was read.
- Backs: reporting-design-work: Say first what you did not look at, did not find and did not test, and…

### [chen-consequence]
- Came from: What made information usable to an overseer.
- Source and extent: As for chen-omission.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/scratch/runs/scout-1/sources/chen-2604.04918v2.txt` :: "it made the consequence of an action concrete enough for users to evaluate"
- Read as: Concrete consequence over more information.
- Step to the line: As for chen-plan.
- Read beside it: none found in what was read.
- Backs: reporting-design-work: Make the consequence of a choice concrete. Do not lead with a score or…

### [imp-scores]
- Came from: Named as a practice that goes otherwise than the line.
- Source and extent: Impeccable, `reference/critique.md`, read whole by the lead.
- Says: `~/.agents/skills/impeccable/reference/critique.md` :: "Re-run `$impeccable critique` after fixes to see your score improve."
- Read as: A score as the headline and the goal.
- Read beside it: A score with its line items is easier to contest than an impression (Notes 2, part 5).
- Backs: critiquing-a-design: otherwise: Do not lead with a score. If a score is asked for, put it after the pr… | reporting-design-work: otherwise: Make the consequence of a choice concrete. Do not lead with a score or…

### [lee-agreement]
- Came from: The lead gave the operator four audit reports that agreed and had one brief in common.
- Source and extent: Lee and Lee, arXiv 2604.22277, main text read whole by the lead and by a scout.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/scratch/runs/scout-1/sources/lee-2604.22277.txt` :: "gradual convergence can feel like accumulating evidence, even when the underlying information remains unchanged"
- Read as: Agents agreeing persuades beyond the evidence.
- Step to the line: From opinions on statements to audit and critique reports. The lead's.
- Read beside it: The same paper: the effect was weaker for questions of value, which design partly is.
- Limits: Opinions on statements, scripted agents.
- Backs: critiquing-a-design: If another critic worked from the same brief or the same files, say so… | reporting-design-work: When more than one agent looked at something, say what they shared: br…

### [imp-two-assessments]
- Came from: Impeccable keeps a design review apart from a mechanical detector.
- Source and extent: As for imp-scores.
- Says: `~/.agents/skills/impeccable/reference/critique.md` :: "Detector output is deterministic, but it still anchors judgment."
- Read as: Judgment kept from measurement.
- Read beside it: No source given.
- Backs: critiquing-a-design: Make your own judgment before you read any measurement or detector out… | reporting-design-work: Keep judgment apart from measurement.

### [chen-reentry]
- Came from: What a person needs when called back.
- Source and extent: As for chen-omission.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/scratch/runs/scout-1/sources/chen-2604.04918v2.txt` :: "what exactly is being authorized, what remains reversible, and how far that authorization extends into subsequent execution"
- Read as: Rebuild the decision around the person.
- Step to the line: As for chen-plan; the authors propose it and did not test it.
- Read beside it: It is the authors' proposal; they did not test it.
- Backs: reporting-design-work: When you call the person back to decide, rebuild the decision for them…

### [op-step]
- Came from: The operator, 23 November.
- Source and extent: The operator's own words.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/brief/OPERATOR_DIRECTION.md` :: "I want to step through this, you know, step by step"
- Read as: When the person holds each step, a step is a turn of the conversation.
- Read beside it: The operator, 21 November: stop waiting, decide and record (Notes 1, the worked case). Which applies depends on the situation.
- Backs: designing-with-a-person: Whether to go on. When the person has said they want to go step by ste… | reporting-design-work: A go-ahead covers what was described. It does not cover what follows f…

### [lead-wrong-five-times]
- Came from: The lead judged Impeccable from parts of it and was corrected five times.
- Source and extent: The lead's own notes.
- Says: `docs/design/process/NOTES-4-scout-round-2.md` :: "I was wrong about it five times in two sittings"
- Read as: Read whole before inheriting. A sixth correction of the same kind followed, about the IINA critique report.
- Read beside it: Reading everything whole is not always possible; then say how far.
- Backs: inheriting-a-design: Read it whole before judging it, and say how far you read.

### [op-biased-search]
- Came from: The operator, 23 November.
- Source and extent: The operator's own words.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/brief/OPERATOR_DIRECTION.md` :: "is just doomed and biased"
- Read as: Look for what counts against the view held.
- Read beside it: none found in what was read.
- Backs: inheriting-a-design: Look first for what counts against your view of it.

### [op-inherit]
- Came from: The operator, 23 November, on existing designs.
- Source and extent: The operator's own words.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/brief/OPERATOR_DIRECTION.md` :: "We can sort of interpret the intentions behind it and work within that"
- Read as: Inherit by reading intentions, or start elsewhere and take up parts.
- Read beside it: Impeccable's rule never to split the difference between refining and replacing.
- Backs: inheriting-a-design: Say what it was for where it came from, what you take, what you leave …

### [imp-observed]
- Came from: Impeccable's rules come from sessions its authors watched.
- Source and extent: Impeccable, `reference/degraded/documenter.md`; through a scout's passage.
- Says: `~/.agents/skills/impeccable/reference/degraded/documenter.md` :: "both observed live"
- Read as: A rule is a lesson from a failure.
- Read beside it: The failures are not shown, so the lessons cannot be checked.
- Backs: inheriting-a-design: Treat its rules as lessons from failures somebody watched, and ask wha…

### [op-depart]
- Came from: The operator, 23 November, correcting the lead.
- Source and extent: The operator's own words.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/brief/OPERATOR_DIRECTION.md` :: "you can't just depart willy-nilly"
- Read as: Bound, able to depart, answerable for it.
- Read beside it: Impeccable allows a departure only when something outside the agent forced it.
- Backs: designing-with-a-person: You are bound by these lines, and you may depart from one. A departure… | designing-with-a-person: No ground, no departure.

### [schon-knowing]
- Came from: A design teacher on breaking a commitment.
- Source and extent: As for schon-repertoire.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/scratch/runs/scout-2c/sources/schon-ch3-design-as-reflective-conversation.txt` :: "may be violated on occasion if they are violated in a knowledgeable way"
- Read as: A departure has to show knowledge of what the commitment implied.
- Step to the line: Schön speaks of a designer breaking their own earlier commitments. Applying it to lines given by someone else is the lead's.
- Read beside it: none found in what was read.
- Backs: designing-with-a-person: You are bound by these lines, and you may depart from one. A departure…

### [imp-uncited]
- Came from: Impeccable's rule for its reviewer.
- Source and extent: Impeccable, `reference/degraded/finish-reviewer.md`; a scout's passage, opened by the lead.
- Says: `~/.agents/skills/impeccable/reference/degraded/finish-reviewer.md` :: "an uncited deviation is a defect"
- Read as: A departure names its ground.
- Step to the line: Taken nearly as written, with the grounds widened on the operator's word to include another reading of the line.
- Read beside it: Its grounds exclude the agent's own reading.
- Backs: designing-with-a-person: You are bound by these lines, and you may depart from one. A departure…

### [derrida-fault]
- Came from: Provisional (this rewrite of the entry; the line it backs is not new). The operator named this essay, on receiving a work as a gift, as an example of doing justice to a principle by not following it exactly (23 November, 07:41; they gave Levinas as its author; it is Derrida's). The lead read it whole after that, for what it says of the gift; its bearing on departures was the lead's reading afterwards (Notes 2, part 4). Entry rewritten 24 November from redraft 1, piece 9, after a Codex check.
- Source and extent: Derrida, "At This Very Moment in This Work Here I Am", read whole by the lead from a poor text layer; pp. 180-190 by a reader of reading 7 (second pass, part 6). On page images, as each reports: the drafter of redraft 1, pp. 185, 187 and 188, with p. 186 in the text layer only and p. 189 not checked (`scratch/runs/redraft-1/NOTES.md`, item 7); the Codex checker of redraft 1, pp. 185-189 and p. 190 (its scope note); the Codex checker of draft 3.1, pp. 185-189 (its coverage note). The lead confirmed in the text layer the two corrections of redraft 1's check that the entry now carries (the reply on p. 188 only; a sentence between the refusal and the question).
- Says: `/Users/rookslog/Development/design-practice-lab/scratch/books/derrida-at-this-very-moment/atvm-180-190.txt` :: "a fault of my own that I will not seek to resolve or absolve within the general necessity"
- In its setting: The quoted words are on printed p. 187 (PDF p. 45) of the English translation by Ruben Berezdivin and Peggy Kamuf (Psyche: Inventions of the Other, vol. I, Stanford 2007). They are in the voice of the essay's "I", which says it speaks from its place as a woman (p. 185) and is answered by another voice (p. 188).
- Read as: A fault is named and kept as one's own, and the general necessity that saying is always contaminated (p. 185) does not excuse it. After naming the fault, the voice asks whether its unfaithfulness answered to what the work says of itself. The ground is offered as a question, and the fault stays named.
- Step to the line: From a voice that commits and keeps a fault in receiving another's work, to an agent recording a departure from a line. The lead's. That a departure is justified by what is particular to the case is a reader's step (reading 7, second pass), not the page's. That the ground may be another reading of the line is the operator's (23 November, 08:02).
- Read beside it: "Des Tours de Babel", where, in Derrida's reading of Benjamin, the translator tries to absolve itself of its debt (p. 121), a task and not an absolution achieved; at the limit of the sacred text, the infinite guilt absolves at once (p. 132). Neither passage says it is the absolution the voice of the other essay declines (p. 187): the reading-7 Opus reader first set the two side by side, and the comparison is that reader's. The essay asks where the fault will lie and calls its site improbable (pp. 185-186), and the replying voice finds it illegible (p. 188). That a recorded departure can be found later is this project's practice (`DEPARTURES.md`), not the essay's claim. The operator's correction of 23 November, 08:02 EST, was of the lead's false choice between keeping a departure on record and justifying it as making the departure conform to the line, not of a reading of this essay: a departure stays on record and is justified, on another reading of the line or on another ground.
- Limits: One writer's gift to another, about ethics and sexual difference. An agent's departure from a skill line is not of that order; the carrying-over takes the structure (named, kept as one's own, not excused by the general law, a particular ground asked), not the gravity.
- Backs: designing-with-a-person: You are bound by these lines, and you may depart from one. A departure…

### [rl-change]
- Came from: How the Reading Lab changes a skill.
- Source and extent: The Reading Lab's skill file, read whole by the lead.
- Says: `~/Development/reading-lab/skills/limits-and-correction/SKILL.md` :: "propose changes from worked readings, not from plausibility"
- Read as: A line changes from cases.
- Read beside it: The operator: cases help and do not exhaust how a practice applies.
- Backs: designing-with-a-person: Several departures from one line are a reason to propose changing the …

### [iina-critique-report]
- Came from: The report behind the summary above, read after the draft was first written.
- Source and extent: The critique report, 168 lines, read whole by the lead.
- Says: `~/Development/iina-streams/docs/design/finding-2026-11-22/plugin-sidebar/CRITIQUE.md` :: "They are ranked as problems because the panel fails the viewer there, whoever chose it."
- Read as: A critic can question the brief, and this one did, in two problems and in a closing section of questions for the brief.
- Read beside it: It still landed far from the person's reaction, so the line is kept with "mostly".
- Backs: critiquing-a-design: The brief is given to you as something to judge. It is not the standar… | critiquing-a-design: Where the build follows the brief and still fails a user, rank it as a… | starting-a-design: otherwise: A check that is handed the brief will mostly check against it.

### [iina-rough-mock]
- Came from: A recorded case that cuts against showing something rough early.
- Source and extent: W-17, as above.
- Says: `~/Development/iina-streams/docs/WAITING.md` :: "a rough mock read as finished UI, after several misses"
- Read as: A rough thing shown early can be judged as if finished, and rejected for its roughness.
- Read beside it: Schön and Grunde-McLaughlin, who support showing early (schon-discipline, grunde-goals).
- Limits: One case. The line now asks that the roughness be said.
- Backs: starting-a-design: otherwise: Make one small concrete thing early and show it. Say how rough it is a…

### [op-many-users]
- Came from: The operator, 23 November, on Impeccable's single primary user.
- Source and extent: The operator's own words.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/brief/OPERATOR_DIRECTION.md` :: "that don't need to be unified into a single user"
- Read as: Several kinds of user, not merged.
- Read beside it: The same message: imagining different users may help, and some of that design thinking "seemed reductive".
- Backs: starting-a-design: Write who uses it as kinds of user, each with what they want, and set …

### [rl-check-discharges]
- Came from: The Reading Lab's boundary line for its own checks.
- Source and extent: The Reading Lab's skill file on limits and correction, read whole by the lead.
- Says: `~/Development/reading-lab/skills/limits-and-correction/SKILL.md` :: "Passing a quote check or citing a warrant tag discharges nothing owed to the reader."
- Read as: Taken over nearly as written, with "the person" for "the reader".
- Read beside it: none found in what was read.
- Backs: designing-with-a-person: Citing a tag or passing a check settles nothing that is owed to the pe…

### [rl-working-choice]
- Came from: The risk that several readings become a way of not deciding.
- Source and extent: The Reading Lab's skill file on reading alongside; that one line read, the file not read whole.
- Says: `~/Development/reading-lab/skills/reading-alongside/SKILL.md` :: "Label the decision as your working choice for this task."
- Read as: Decide, and mark the decision as provisional.
- Read beside it: op-haunted: no reading is to be treated as final.
- Backs: reading-a-reaction: Label your working reading as a working choice…

### [rl-stays]
- Came from: The Reading Lab's way of handing a matter back.
- Source and extent: As for rl-check-discharges.
- Says: `~/Development/reading-lab/skills/limits-and-correction/SKILL.md` :: "say plainly that you are handing the matter back, and to whom. Don't simulate it"
- Read as: Some matters are named as the person's and are given back in words.
- Read beside it: What belongs on the list for design work is the lead's choice, from the audit and the operator's words.
- Backs: critiquing-a-design: Do not write a missing brief or settle design intent yourself. Say wha… | critiquing-a-design: Whether the thing is good for the person stays with the person. Hand t… | designing-with-a-person: Whether the thing is good for them, and what it is for when that is in… | designing-with-a-person: Hand these back in plain words, and say to whom. Do not answer them on…

### [rl-no-logs]
- Came from: Named as a source that says otherwise than the departures file.
- Source and extent: The Reading Lab's design notes, read whole by the lead.
- Says: `~/Development/reading-lab/docs/design/2026-10-21-skills-v0-design-notes.md` :: "because a log section is where a checklist ritual starts"
- Read as: A required log invites ritual entries.
- Read beside it: The operator: a departure stays on record.
- Backs: designing-with-a-person: otherwise: Record it in the project's `design-set/DEPARTURES.md`…

### [op-depart-kinds]
- Came from: The operator, 23 November, twice.
- Source and extent: The operator's own words.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/brief/OPERATOR_DIRECTION.md` :: "there's different ways of departing too"
- Read as: The kinds of departure are open; three come from the earlier message ("modified, overridden slightly, or challenged").
- Read beside it: none found in what was read.
- Backs: designing-with-a-person: Record it in the project's `design-set/DEPARTURES.md`…

### [imp-untested]
- Came from: Impeccable on saying what evidence was and was not had.
- Source and extent: Impeccable, `reference/adapt.md`; through a scout's passage.
- Says: `~/.agents/skills/impeccable/reference/adapt.md` :: "Name what stayed untested and move on"
- Read as: Say what produced the evidence and what was not tested.
- Read beside it: none found in what was read.
- Backs: critiquing-a-design: End with what ran and what did not, what you were and were not given, … | reporting-design-work: Say first what you did not look at, did not find and did not test, and…

### [audit-two-contexts]
- Came from: Named as a source that says otherwise than the line.
- Source and extent: The lead's index of the audit of 23 November, which quotes the auditors.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/docs/audit/2026-11-23-design-process/INDEX.md` :: "Open Stream's useful single-context review (OP-03) is a counterexample to treating the split as necessary for any useful critique."
- Read as: Separate contexts for judging are not shown to be needed.
- Read beside it: Impeccable calls a single-context critique degraded, without evidence.
- Backs: critiquing-a-design: otherwise: Make your own judgment before you read any measurement or detector out… | reporting-design-work: otherwise: Keep judgment apart from measurement.

### [imp-document-not-fix]
- Came from: Impeccable's audit is told to report and not repair. Removed from draft 2 for want of a case; restored for the critic, whose whole task it describes.
- Source and extent: Impeccable, `reference/audit.md`; through a scout's passage.
- Says: `~/.agents/skills/impeccable/reference/audit.md` :: "Don't fix issues; document them for other commands to address."
- Read as: Finding is kept apart from changing.
- Read beside it: Impeccable's critique does map each finding to a suggested command.
- Backs: critiquing-a-design: You were launched to find. Report what you find; do not alter the thin…

### [patel-review]
- Came from: An agent reviewing its own finished work.
- Source and extent: Patel et al., arXiv 2611.01181; abstract and sections 1, 2, 4.3, 4.4 and 5 read by the lead.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/scratch/runs/sitting-3/sources/2611.01181.txt` :: "broader review can uncover unstated defects while also introducing regressions in the original task"
- Read as: Looking again and changing in one pass finds more and breaks more.
- Step to the line: From an agent reviewing its own code to a critic of a design. The lead's, and loose.
- Read beside it: A separate reviewer was not tested there.
- Limits: Coding tasks.
- Backs: critiquing-a-design: You were launched to find. Report what you find; do not alter the thin…

### [iina-brief-questions]
- Came from: The report keeps what the brief must settle apart from what the build got wrong.
- Source and extent: The IINA streams critique report, 168 lines, read whole by the lead.
- Says: `~/Development/iina-streams/docs/design/finding-2026-11-22/plugin-sidebar/CRITIQUE.md` :: "Questions for the brief, not the build"
- Read as: Two lists, so that a build is not blamed for the brief and the brief does not escape.
- Read beside it: none found in what was read.
- Limits: One report from one run, in another project. Making its practice a general line is the lead's step.
- Backs: critiquing-a-design: Keep questions for the brief apart from problems in the build.

### [iina-hand-back]
- Came from: The critic found no brief for the surface and did not write one.
- Source and extent: The IINA streams critique report, 168 lines, read whole by the lead.
- Says: `~/Development/iina-streams/docs/design/finding-2026-11-22/plugin-sidebar/CRITIQUE.md` :: "a surface brief records design intent"
- Read as: Stating intent is the designer's and the person's step; the critic says it is missing.
- Read beside it: A critic who sees what the intent should be and stays silent wastes that.
- Limits: One report from one run, in another project. Making its practice a general line is the lead's step.
- Backs: critiquing-a-design: Do not write a missing brief or settle design intent yourself. Say wha…

### [iina-declined]
- Came from: The report sets aside two detector findings.
- Source and extent: The IINA streams critique report, 168 lines, read whole by the lead.
- Says: `~/Development/iina-streams/docs/design/finding-2026-11-22/plugin-sidebar/CRITIQUE.md` :: "as web taste in conflict with native fit"
- Read as: A measurement made for one kind of thing can be wrong for another; the critic says which findings it did not adopt and why.
- Read beside it: none found in what was read.
- Limits: One report from one run, in another project. Making its practice a general line is the lead's step.
- Backs: critiquing-a-design: Decline a measured finding that conflicts with the platform or with wh…

### [iina-problem-form]
- Came from: How the report states each problem.
- Source and extent: The IINA streams critique report, 168 lines, read whole by the lead.
- Says: `~/Development/iina-streams/docs/design/finding-2026-11-22/plugin-sidebar/CRITIQUE.md` :: "*observed* means seen in the rendered page; *read* means read in source; *inferred* means reasoned"
- Read as: Each problem begins from what the viewer is trying to do and says how the critic knows.
- Read beside it: The operator's standing rule on claims already asks for this labelling; a second copy is not evidence it will be followed.
- Limits: One report from one run, in another project. Making its practice a general line is the lead's step.
- Backs: critiquing-a-design: Go by what each kind of user is trying to do… | critiquing-a-design: For each problem say what the user is trying to do, what fails, how yo…

### [iina-weakened]
- Came from: The report's last section.
- Source and extent: The IINA streams critique report, 168 lines, read whole by the lead.
- Says: `~/Development/iina-streams/docs/design/finding-2026-11-22/plugin-sidebar/CRITIQUE.md` :: "What weakened the critique"
- Read as: A critique ends by saying what it lacked: context not given, things not run, tools that did not fit.
- Read beside it: A long provenance section can become display (the Reading Lab's warning about tagging).
- Limits: One report from one run, in another project. Making its practice a general line is the lead's step.
- Backs: critiquing-a-design: You are given what the thing is for and who uses it, as kinds of user … | critiquing-a-design: End with what ran and what did not, what you were and were not given, …

### [imp-not-measured]
- Came from: Impeccable's reviewer is told that a matching score does not end the looking.
- Source and extent: Impeccable, `reference/degraded/finish-reviewer.md`; a scout's passage.
- Says: `~/.agents/skills/impeccable/reference/degraded/finish-reviewer.md` :: "which the numbers do not measure"
- Read as: A score covers what was measured; say what it leaves out.
- Read beside it: Impeccable's critique still asks for a score out of 40 as its headline.
- Backs: critiquing-a-design: Do not lead with a score. If a score is asked for, put it after the pr…

### [schon-cycles]
- Came from: Whether design work runs in stages.
- Source and extent: Schön, The Reflective Practitioner, chapter 3; through a scout's passages and contexts the lead opened.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/scratch/runs/scout-2c/sources/schon-ch3-design-as-reflective-conversation.txt` :: "back and forth, back and forth"
- Read as: The designer moves between the part and the whole in cycles; no stage is finished once.
- Step to the line: From a studio to a set of skills with no fixed order. The lead's.
- Read beside it: Impeccable's build phases, enforced in order by a script, where an agent's belief in its work is the risk.
- Limits: One teacher and one student.
- Backs: using-the-design-set: There is no fixed order. Load the one for the moment you are in, and g…

### [vercel-not-invoked]
- Came from: Whether a skill gets loaded.
- Source and extent: A Vercel engineering post; through a scout's passage.
- Says: `/Users/rookslog/Development/sonic-affinity-lab/scratch/runs/scout-2b/sources/vercel-agents-md-vs-skills.txt` :: "In 56% of eval cases, the skill was never invoked."
- Read as: Lines that must always apply cannot live only in a skill.
- Step to the line: From framework documentation to a design practice. The lead's.
- Read beside it: The Agent Skills specification and Anthropic's posts favour loading on demand.
- Limits: One vendor, one framework, its own tests.
- Seen on this machine: the Superpowers plugin does not rely on its entry skill's description alone. A session-start hook (`~/.claude/plugins/marketplaces/superpowers-dev/hooks/session-start`) reads that skill's file and puts its whole content into every session. So an entry skill can be loaded reliably, by a hook or an always-read line. The operator corrected the lead on this: "the justification cannot rest on 'unlikely to be loaded'".
- Backs: using-the-design-set: A skill that is not loaded does nothing. Name in the brief, or in the …

### [op-skill-never-loads]
- Came from: The operator's own standing instruction.
- Source and extent: The operator's global instructions.
- Says: `~/.claude/CLAUDE.md` :: "A skill that never loads is worse than an always-loaded file"
- Read as: As above.
- Read beside it: none found in what was read.
- Backs: using-the-design-set: A skill that is not loaded does nothing. Name in the brief, or in the …

### [r1-said-to-you]
- Came from: Provisional. Redraft 1, piece 3; applied by the lead before the operator marked it. Its sources named directly in draft 3.2, after the Codex check of 3.1.
- Source and extent: Two parts of the line rest on different sources. That a stop, or a correction, takes effect at once is inherited: `docs/design/skill/draft-3/WALKTHROUGH.md` (lines 28-29, "Reactivity") names a correction of fact and an instruction about conduct, above all a stop; `docs/design/process/NOTES-8-reading-round-5.md` ("What does not count as a finding") names an instruction about conduct, above all a stop; and the reading-6 Codex reader of Lacan (`scratch/runs/reading-6/readers/lacan-codex/READING.md`, section 3, "What changes when this leaves the clinic") writes of a clear stop or correction to what was done and notes that the distinction was already in the walkthrough. That a remark can hand back the category the maker offered is from reading 8: for instance the xhigh Codex reader on the operator's "what do you mean, 'my reaction'?" (`scratch/runs/reading-8/readers/fresh-codex-xhigh/READING.md`, section "Who can ask the question?", its closing paragraphs). The line as written, the evidence clause included, is the redraft-1 drafter's (`scratch/runs/redraft-1/REDRAFT.md`, piece 3) and the lead's (`docs/design/skill/draft-3/REDRAFT-1-MARKING.md`, piece 3). Credits in that file corrected 24 November (`scratch/runs/redraft-1/CREDITS-FIXED.md`; a Codex check, `scratch/runs/redraft-1/credits-check/REVIEW.md`, found 25 of 39 rows fixed rightly, 11 partly, 3 inside the replaced piece 9 entry).
- Read as: A remark is addressed to the maker and does something there; a stop or an instruction takes effect as said.
- Step to the line: The drafter's and the lead's; the readers gave questions and readings, not this line. In 3.2 the stop sentence became its own paragraph at the head of the skill (with `check31-stop`), and the second of piece 3's two questions joined the line on the record.
- Limits: Written from a long written exchange with one person, who can correct the maker and does (`scratch/runs/reading-8/readers/fresh-opus/READING.md`, section 2); not from usability sessions, spoken remarks or reviews. That the person reads every turn is not established (Codex check of redraft 1, row W-159).
- Backs: designing-with-a-person: A stop or a direct instruction from the person takes effect… | reading-a-reaction: A stop or a direct instruction takes effect as said… | reading-a-reaction: What the person says is said to you… | reading-a-reaction: Keep their words in it as said, beside your reading…

### [r1-grounds]
- Came from: Provisional. Redraft 1, piece 1 (its paragraph, moved out of the core by the lead).
- Source and extent: Readings 6 and 8 and round 3, as `scratch/runs/redraft-1/REDRAFT.md` (untracked) piece 1 cites them; the operator, record items 20, 33, 48. Credits in that file corrected 24 November (`scratch/runs/redraft-1/CREDITS-FIXED.md`; a Codex check, `scratch/runs/redraft-1/credits-check/REVIEW.md`, found 25 of 39 rows fixed rightly, 11 partly, 3 inside the replaced piece 9 entry).
- Read as: One remark can speak from several grounds; the maker says which it takes it as and does not make the person settle it.
- Step to the line: The drafter's ordering; the three grounds are the reading-6 Codex reader's.
- Limits: Item 33's self-account is a reader's reading, not the operator's assertion (Codex check, W-14).
- Backs: reading-a-reaction: One remark may speak from the person's own use…

### [r1-record]
- Came from: Provisional. Redraft 1, piece 1.
- Source and extent: Reading 8, the reader from Lacan and the new reader, as `scratch/runs/redraft-1/REDRAFT.md` (untracked) piece 1 cites them; the lead's own records on transcription. Credits in that file corrected 24 November (`scratch/runs/redraft-1/CREDITS-FIXED.md`; a Codex check, `scratch/runs/redraft-1/credits-check/REVIEW.md`, found 25 of 39 rows fixed rightly, 11 partly, 3 inside the replaced piece 9 entry).
- Read as: The maker holds most of the record of the person's words and answers for what it makes of them.
- Step to the line: "Keep it where they can see and correct it" is the drafter's.
- Limits: Seeing and correcting is access, not standing to contest (Codex check, "What it leaves out", 2); fails where the person cannot see the record.
- In draft 3.2: the line again ends with the contrast its source had ("the people not here cannot"), which 3.1 dropped without saying so (Codex check of 3.1); the second of redraft 1, piece 3's two questions (their words kept beside the reading, so that they can hold the maker to them) joined it; and "you write it down, cut it and put it into briefs" was cut for length. The standing point above stays here, not in the line. The drafter of 3.2's changes; not checked by another reader.
- Backs: reading-a-reaction: You keep most of the record…

### [r1-not-their-voice]
- Came from: Provisional. Redraft 1, piece 1, joined by the lead to core line 28 as its provisional answer to the marking sheet's question 2.
- Source and extent: Reading 8, the two Codex readers, as `scratch/runs/redraft-1/REDRAFT.md` (untracked) piece 1 cites them; `starting-a-design` on what the excluded fall back on. Credits in that file corrected 24 November (`scratch/runs/redraft-1/CREDITS-FIXED.md`; a Codex check, `scratch/runs/redraft-1/credits-check/REVIEW.md`, found 25 of 39 rows fixed rightly, 11 partly, 3 inside the replaced piece 9 entry).
- Read as: The person decides whom a design may leave out, as their judgment about those people, not as their voice.
- Step to the line: The lead's join of the reading to line 28.
- Limits: Gives the people not here no route of their own; that stays open.
- In draft 3.2: the line now hands the person a decision on each exclusion that has been named, chosen or found, and gives the maker the finding and naming of those nobody chose (`implicit-exclusion`). Amended by the drafter of 3.2 at the lead's request; not checked by another reader.
- Backs: designing-with-a-person: Whether a tension has been answered well enough…

### [r1-brief-holds]
- Came from: Provisional. Redraft 1, piece 7; applied by the lead before the operator marked it, with the builder's leave restored after the Codex check of redraft 1 (W-29). In draft 3.2 a try the maker proposes left the list of what holds a requirement, after the Codex check of 3.1.
- Source and extent: The forces a requirement can carry: the xhigh Codex reader of reading 8, `scratch/runs/reading-8/readers/fresh-codex-xhigh/READING.md`, section "What a principle can ask", its closing paragraph; that reader's worked requirement, the same file, section "A requirement someone can test". Changing what the review will accept: the reading-7 Codex reader of Derrida, `scratch/runs/reading-7/readers/derrida-codex/READING.md`, sections "Back through the lead's answer" (its third point) and "What I would try on a brief, and what the warrant would have to admit". Also the audit's finding F1 (`/Users/rookslog/Development/sonic-affinity-lab/docs/audit/2026-11-23-design-process/reasoning/REASONING-AUDIT.md`) and the operator's request of 23 November, 01:54, and correction of 01:59. Redraft 1 (`scratch/runs/redraft-1/REDRAFT.md`) gave the reader's places without naming the file (Codex check of redraft 1, W-390); they are named here. Credits in that file corrected 24 November (`scratch/runs/redraft-1/CREDITS-FIXED.md`; a Codex check, `scratch/runs/redraft-1/credits-check/REVIEW.md`, found 25 of 39 rows fixed rightly, 11 partly, 3 inside the replaced piece 9 entry).
- Read as: A brief is the maker's writing; each requirement says what holds it there, and the person's words constrain the maker's reading of what they want.
- Step to the line: The kinds of hold are the drafter's, from the reader's forces, with two changes the drafter did not name: the reader's requirement accepted for a bounded job became a try the maker proposes, and the reader's claim from someone who never got to speak became a judgment, the maker's or the person's, about people not here (Codex check of 3.1). In 3.2 the try left the list: a try can be agreed as an experiment within the job while adopting it stays undecided (the same check, with the case under `docs/design/skill/draft-3/REDRAFT-1-MARKING.md`, piece 7). That change is the 3.2 drafter's.
- Limits: Says what holds a requirement, not who ratified it (Codex check of redraft 1, "What it leaves out", 3).
- Backs: starting-a-design: A brief written from what the person said is your writing…

### [rough-shown]
- Came from: Provisional. Rough piece 4, not redrafted; its sources checked in the Codex check of draft 3.1. Joined in 3.2 with the line on asking the person to point (`audit-mark-places`).
- Source and extent: `docs/design/skill/draft-3/ROUGH-2026-11-24.md`, piece 4, which names three sources: Suchman's helper at the copier (round 5, unit 2, from pages; `docs/design/skill/draft-3/WALKTHROUGH.md`, section "Step 2 begun"); the audit's finding that nobody asked the operator to mark the places; and the finder's cases in which a recording or a marked screenshot came with the remark (`scratch/runs/cases-1/scout-codex/CASES.md`, untracked; the walkthrough's note of 01:10 EST, "On asking to point").
- Read as: A maker hears of trouble after it happened; where its next step turns on what the person saw, it asks to be shown.
- Step to the line: The lead's. Suchman's helper attends as the trouble happens; that a maker mostly hears of it afterwards is the lead's premise, and when to ask is not in her pages. The threshold in 3.2 (ask only when it would change the next step) is from the Codex check of 3.1, worked use 2.
- Limits: The unit gives nothing on when to ask. In the finder's closest case (01) the same author says vague reports still got the cause found; the finder left that out, and the source check of the finder's cases reported it (`docs/design/skill/draft-3/WALKTHROUGH.md`, section "The source check of the finder's cases").
- Backs: reading-a-reaction: You mostly hear of their trouble afterwards…

### [rough-readings]
- Came from: Provisional. Rough piece 5, without its opening clause (which sorted remarks), joined with two texts the 3.1 entry did not name; checked in the Codex check of draft 3.1.
- Source and extent: `docs/design/skill/draft-3/ROUGH-2026-11-24.md`, piece 5: rounds 3 and 4 (five of six readers question the old line, five limit it); both readers of Lacan. The reading-6 Codex reader of Lacan supports weighing evidence for a reading and limits a gate before every change (`scratch/runs/reading-6/readers/lacan-codex/READING.md`, section 6, the row on the third line).
- Read as: Several readings before a costly change, one about what the maker offered; never on a stop, an instruction, a plain correction or a located fault.
- Step to the line: The lead's, with two joins: asking what speaks for each reading comes from the draft-3 line this replaces, not from piece 5; exempting a direct instruction comes from redraft 1, piece 3 (`docs/design/skill/draft-3/REDRAFT-1-MARKING.md`). In 3.2 "what speaks against it" became "what would show it wrong", and the exemptions moved to the paragraph at the head of the skill (`check31-stop`). "Costly" stays provisional: the reader counts do not test it.
- Limits: No case found tests several readings against a quick grounded try; readings can be listed with none put at risk.
- Backs: reading-a-reaction: Before a costly change, hold more than one reading…

### [rough-step]
- Came from: Provisional. Rough piece 6; not redrafted and not checked.
- Source and extent: `docs/design/skill/draft-3/ROUGH-2026-11-24.md`, piece 6: both readers of Lacan; the Codex reading of Derrida; the finder's cases of replaying the person's action.
- Read as: A next step that could show the reading wrong, decided beforehand; agreement settles nothing; the person can refuse or redirect it.
- Step to the line: The lead's.
- Limits: A step small enough to refuse may be too small to tell anything; the clinic's half (a refusal read as confirming) is not carried.
- Backs: reading-a-reaction: Choose a next step that could show your reading wrong…

### [rough-checked]
- Came from: Provisional. Rough piece 2; placed by the lead in this skill rather than the core; not redrafted and not checked.
- Source and extent: `docs/design/skill/draft-3/ROUGH-2026-11-24.md`, piece 2: the Codex reading of Lacan, sense F.
- Read as: Say what was checked and what the maker is only credited with knowing.
- Step to the line: The lead's.
- Limits: A maker reciting its motives can take up the room; this line asks for what was checked, not motives.
- Backs: reporting-design-work: Say what you checked and what you are only credited with knowing…

### [check31-stop]
- Came from: Provisional. Draft 3.2, written by its drafter from the Codex check of draft 3.1 (its high fault and worked use 1) and the first desk test; no other reader has checked it.
- Source and extent: `scratch/runs/draft-3.1/check/REVIEW.md` (untracked), read whole; `scratch/runs/desk-test-1/judge/JUDGING.md` and the four `TURNS.md` (untracked), read whole.
- Says: `scratch/runs/draft-3.1/check/REVIEW.md` :: "A stop is not itself permission to resume."
- Read as: A stop or a direct instruction is acted on before any reading; a stop ends the work it names, and if the scope is clear an instruction given with it is the one change allowed (if the stop ended the work, the correction is retained without resuming).
- Step to the line: The paragraph's place and wording are the drafter's. "Do only what an instruction given with it names" follows the check's worked use 1 and the judge's test for the stop, under which a turn passed if it made the one named correction and nothing more.
- Read beside it: In the desk test the two agents given draft 3.1 wrote the named correction at once in their written turns (r2, r4); of the two given draft 3, one set out three readings before promising the fix (r1), and the other reported the fix in its written turn and noted in its note that a person who wrote "stop" might want to be asked first, without asking them in the turn (r3). The judge scored written reports for one scenario, not actual chart edits.
- Limits: One check, and four agents of one model writing turns for one scripted stop that named its correction. A stop that names nothing, and a stop during a running edit, were not tried. The branch on what a stop allows is not this source's; see `lead-stop-branch`.
- Backs: reading-a-reaction: A stop or a direct instruction takes effect as said…

### [desk1-proportion]
- Came from: Provisional. Draft 3.2, written by its drafter from the first desk test and the Codex check of draft 3.1 (worked use 2 and its note on length); no other reader has checked it.
- Source and extent: `scratch/runs/desk-test-1/` (untracked): `SCENARIOS.md`, the four `TURNS.md` and `judge/JUDGING.md`, read whole, with the lead's key (`KEY.md`); `scratch/runs/draft-3.1/check/REVIEW.md`, read whole.
- Says: `scratch/runs/desk-test-1/judge/JUDGING.md` :: "its four readings and combined proposal ask a lot of a hesitant remark"
- Read as: On the hesitant remark ("maybe something calmer?") the blind judge preferred the shorter turns, written by the agents given draft 3 (195 and 208 words), to those of the agents given draft 3.1 (368 and 322).
- Step to the line: The drafter's, from one judge's preference among written turns to a line on proportion. The check reached the same point from the text: a quick trial does not need two readings written out (worked use 2). Both agents given draft 3.1 said in their notes that the readings made the turn long for the remark.
- Read beside it: The judge also valued the explicit wait in one long turn (r2), and would take the two mocks of one draft-3 turn (r3) if they could be looked at; shortness was not its only ground.
- Limits: Four agents of one model, one judge, three written moments; a judge's preference is not a person's reaction. "Cheap", "reversible" and "hesitant" are left to the agent's judgment, and nothing yet shows that the line shortens a turn.
- Backs: reading-a-reaction: Keep the turn in proportion to the remark…

### [implicit-exclusion]
- Came from: Provisional. The operator, 24 November, 15:08 EST (record item 80), on who decides whom a design leaves out: the person can ask for an exclusion, and there may also be exclusions nobody asked for. Applied in draft 3.2 by its drafter at the lead's request, before the operator marked the wording.
- Source and extent: The operator's message, read whole: item 80 of `/Users/rookslog/Development/sonic-affinity-lab/brief/OPERATOR_DIRECTION.md`, [said: 6232df48/932ed7f9], resolved with that project's `tools/said.py`; not copied here, by the record's rule. And `docs/design/skill/draft-3/WALKTHROUGH.md`, section "Answering for exclusion, and where to mark it", read whole: the operator's item 66 (answering for a skill includes what it excluded) and the lead's table of where each kind of exclusion is marked.
- Read as: Besides the exclusions the person decides, a design can leave people out that nobody chose.
- Step to the line: The four places to look (defaults, kinds of user the brief did not name, what the checks test and do not test, what was assumed about who uses it and how) are the lead's, in its request to the drafter; the operator named none of them. Item 66 is about answering for a skill's own exclusions; carrying it to a design's is the lead's. Dividing the work (the maker finds and names, the person decides) is the lead's, and bears on the marking sheet's question 2 (`docs/design/skill/draft-3/REDRAFT-1-MARKING.md`): who settles whom a design may leave out.
- Read beside it: The walkthrough's table distinguishes what nobody has named (cannot be marked; the head says the record is incomplete and where to raise it) from exclusions someone else points out (`DEPARTURES.md` for agents, the operator's record for the operator; no place yet for users). In the lead's prose below that table ("Three positions of the lead's"): the exclusions that matter most are often those someone else names. So the maker's search is never complete, and naming what it finds does not make it so. `r1-not-their-voice`: the person's decision is a judgment about those people, not their voice.
- Limits: One message, put as a question; the operator has not marked the wording. Nothing yet gives the people left out a way to point it out themselves (`r1-not-their-voice`, Limits).
- Backs: starting-a-design: Look also for whom the design leaves out without anyone having chosen it… | designing-with-a-person: Finding and naming the exclusions nobody chose is your part… | critiquing-a-design: report whom the design leaves out without its brief saying so…

### [lead-stop-branch]
- Came from: Provisional; the design lead's wording, 24 November 2026, untested.
- Source and extent: the advisor's finding on 3.2 (the core did not carry the stop rule; "instruction", "plain correction" and "located fault" overlapped), and the 3.2 drafter's reading of "a stop does not license resuming" (`docs/design/skill/draft-3.2-record/CHANGES.md`, section "Decisions the operator has not marked").
- Read as: after a stop the maker does only what the remark says the thing should be, or checks a fault it names, and then waits.
- Step to the line: the lead's; the branch (what it should be / only what is wrong) is the lead's and is not in the Codex check of 3.1, which made its exception conditional on the scope being clear (`scratch/runs/draft-3.2/check/REVIEW.md`, row S16).
- Limits: untested; desk test 2's moments 2 and 6 are meant to test it.
- Backs: designing-with-a-person: A stop or a direct instruction from the person takes effect… | reading-a-reaction: A stop or a direct instruction takes effect as said…

### [loop-corrections]
- Came from: Provisional; the design lead, 24 November 2026, for the operator's request of 24 November, 15:05 EST, for continuous development of the skills with feedback from projects (`[said: 6232df48/4c246823]`; the record's item 79; cite it, do not copy it).
- Source and extent: `docs/plan/LOOP-DESIGN.md`, part A items 7-8 and "What the literature scan changes" (the scan, by Codex, before the operator's routing of 15:33: `scratch/runs/lit-scan-1/SCAN.md`, its section 3, item 4 and the paragraph on not making the user classify; the papers it cites are unread by the lead).
- Read as: a correction is evidence from one occasion, kept with the maker's reading, for the lead to triage.
- Step to the line: the lead's.
- Limits: untried; a file depends on the maker remembering to write it.
- Backs: designing-with-a-person: When the person corrects how a line…
