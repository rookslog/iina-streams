# GPT-6 Pro — IINA Streams: Autonomous Product Development, Design-Space Exploration, and Near-Release Candidates

> **Execution document.** Attach this Markdown file and its companion addendum to a **new GPT-6 Pro session**. Read both in full before acting. The addendum expands and, where explicitly stated, supersedes earlier feature/scope decisions. Neither document authorizes stable deployment.

## Your commission

You are the principal architect, macOS product designer, software engineer, integration tester, technical researcher, and independent auditor for **IINA Streams**.

Use the connected **RDC-selfhost** integration to access **Apollo**, the macOS development machine.

Your commission is to continue an existing project, carry its remaining development through implementation and native testing, explore its design possibilities, and deliver **a small portfolio of genuinely finished, functioning, near-release candidates from which I can choose**.

You have considerable architectural and creative authority.

You are not merely executing the specifications of an earlier model. Challenge those specifications where warranted. Identify possibilities they overlooked, question assumptions that narrow the design prematurely, investigate what the actual code and macOS environment make possible, and exercise independent judgment.

**The expected end state is that I can examine two or more credible, fully functioning implementations in actual IINA, choose one, and proceed toward stable deployment with at most relatively minor refinements.**

This is an execution commission. Research, design, implement, run, inspect, criticize, revise, and verify the actual software.

Do not stop at a proposal, implementation plan, HTML mockup, UI prototype, code-complete but untested branch, or technically functional yet visibly unfinished interface.

Do not ask me intermediate design questions. Close the loop autonomously wherever legitimate access permits. Preserve the explicit approval gate for stable deployment.

---

## 1. What success means

The distinction between a working prototype and a finished product is central to this commission.

A prototype can demonstrate an idea. A product candidate must survive ordinary use.

**Your primary deliverable is a set of credible product choices, not merely a demonstration of technical feasibility.**

Aim to deliver:

**Candidate A — Refined Unified**

A complete implementation developing the existing preferred unified-sidebar direction. It should feel considered, coherent, polished, and appropriate to IINA and macOS.

**Candidate B — A materially different, equally developed alternative**

Explore a different, credible organization of the same functionality. It may develop the existing tabbed or compact directions, combine their strengths, or introduce a better arrangement you discover.

Do not assume the existing B — Tabs preview is necessarily the best alternative merely because it already exists.

**Candidate C — An additional alternative if justified**

Pursue a third design if it represents a worthwhile distinct direction and can be brought to comparable completion. Do not manufacture a third option simply to satisfy a count.

The minimum intended outcome is **two functioning, polished, independently reviewable choices**.

Each should be a serious candidate for eventual deployment. They need not have separate playback engines or duplicated infrastructure; sharing a well-designed functional core is preferable where appropriate.

What must differ meaningfully is the user-facing organization, interaction, or product conception.

A different accent color, padding adjustment, or minor CSS variation does not qualify as a separate candidate.

Nor does a complete implementation of A accompanied by unfinished visual demonstrations of B and C.

**If you offer an option as a final candidate, it must actually work.**

Where externally gated functionality cannot be verified—for example, an OAuth step requiring my authorization—the limitation must be explicit and consistent across candidates. Complete and test all independent implementation work.

Do not silently lower the quality threshold for the alternatives.

Do not preemptively reduce the deliverable to one candidate because multiple options seem costly. First investigate how shared architecture, independent presentation layers, and reversible test installations can support meaningful alternatives efficiently.

If an actual technical or authorization constraint makes the intended portfolio impossible, establish that constraint through evidence, complete the strongest achievable work, and identify the remaining gap precisely.

---

## 2. Lessons from earlier agent runs

This commission should take seriously the experience accumulated from earlier Codex and Pro executions.

Relevant records on Apollo include:

`/Users/rookslog/Development/personal-work-ecosystem/local/2026-11-02-library-lead/retro/B-PROMPT-TO-OUTPUT.md`

The retained ambition and invitation Codex returns are available in the November 6 overnight prompt packages, including:

`/Users/rookslog/Development/personal-work-ecosystem/local/2026-11-06-overnight/lanes/pro-pack/TONIGHT-1107/`

The ambition Codex run produced a working RFC 8785 numeric serialization component, passing extensive tests, while acknowledging that the project had not established a need for it.

The invitation Codex run implemented and verified a citation locator, while recognizing that it had taken up a tractable portion of a much larger question.

These were not worthless results. They illustrate a recurrent possibility: **an agent substitutes a bounded, readily finishable task for the concern that initiated the commission, completes that task, recognizes the substitution, and nevertheless stops.**

Retrospective work also suggested that enumerated questions, option lists, and completion criteria can become boundaries that agents follow more rigidly than intended.

These are situated findings, not universal claims about all models.

Take their methodological implications seriously.

### Do not substitute an easier task

A finished design document is not a finished application.

A green mock-test suite is not a validated native implementation.

A screenshot of a beautiful sidebar is not a working product.

A functioning playback adapter is not the same as an integrated experience.

Two distinct visual concepts are not two selectable product candidates.

A well-written list of remaining improvements is not a substitute for making those improvements.

When a simpler achievement presents itself, ask whether it actually advances the intended end state or merely supplies an easier completion condition.

### The instructions are not the boundary of your imagination

The features, designs, tests, and concerns named here establish important context. They should not become an exhaustive taxonomy of what you are allowed to discover.

Inspect the actual software. Follow consequential surprises. Investigate the constraints and affordances that become apparent through implementation.

You may develop a better design direction than any currently named.

You may reject a weak earlier concept and replace it.

You may challenge the original functional architecture where warranted.

But retain the practical purpose: completing a product that I can use.

### Do not stop at contractual completeness

Before concluding, ask whether the resulting implementations actually answer the underlying concern.

Would I be able to install and evaluate the alternatives immediately?

Could I choose one with confidence?

Would adopting the selected candidate require minor refinement, or another substantial development commission?

Have you left important design problems untouched simply because the checklist was satisfied?

If the strongest answer remains that substantial, independently achievable work is unfinished, continue the implementation and validation loop rather than treating the report as final.

The goal is not an arbitrary duration, endless expansion, or maximal feature count. It is substantive completion.

---

## 3. Existing state on Apollo

The following state was independently checked on November 8, 2026. Verify it again before modifying anything.

### Operational implementation

Path:

`/Users/rookslog/Development/iina-streams`

Branch:

`design/tnf-quiet-streams`

HEAD:

`8140312e6df4ff48143712c6ce8b911160a17454`

The existing M2 implementation includes a same-window quality-switching fix introduced in commit `c962f92`.

It uses `mpv.command("loadfile", [url, "replace"])` to change media without reopening the IINA player window.

Preserve and independently verify this behavior.

### Isolated design worktree

Path:

`/Users/rookslog/development/iina-streams-design`

Branch:

`design/in-app-panel-comparison`

HEAD:

`a7b61e1e7e33c4e9a196f59d91bd5202532c7ac1`

This includes the actual IINA sidebar preview plugin under:

`preview-plugin/`

The existing comparison layouts are:

- A — Unified
- B — Tabs
- C — Compact

Native screenshot evidence includes:

`preview-plugin/evidence/unified-native-2026-11-08.png`

The preference expressed previously was:

> yea I like unified the most

Treat this as a meaningful starting preference, not as final acceptance of the implementation, typography, layout proportions, interaction design, or features.

### Existing verification

At the last check:

- Operational M2 tests: 12 passed.
- Preview tests: 8 passed.
- IINA: version 1.5.1, build 183.

The tests were primarily static or mocked. They do not establish full native readiness or complete feature integration.

### Original commission

Read the complete prior execution commission:

`/Users/rookslog/development/iina-streams-design/PROMPT-GPT6-PRO-2026-11-08.md`

Also inspect the relevant current versions of:

- `docs/SPEC.md`
- `docs/ROADMAP.md`
- `docs/DECISIONS.md`
- `docs/RELEASE.md`
- `docs/UX-REVIEW.md`
- `HANDOFF-GPT6-PRO.md`
- `docs/BUG-002-OSC-SIDEBAR.md`
- `docs/BUG-003-title-and-sidebar.md`
- `docs/BUG-004-quality-window-recreation.md`
- `docs/design/TNF-INHERITANCE-QUIET-STREAMS.md`
- `docs/design/NATIVE-PREVIEW-2026-11-08.md`
- `docs/design/PANEL-COMPARISON-2026-11-08.md`
- `preview-plugin/README.md`

Read relevant implementation and test files as well.

Historical documents sometimes describe superseded versions or behavior. Verify against current code, runtime, and tests.

Do not treat the previous commission as a rigid architectural prescription. Its scope, design concerns, known bugs, and authorization boundaries remain important, but its suggested solutions are open to justified revision.

---

## 4. Previous Pro execution and recovery

A previous GPT-6 Pro run began on November 8 around 5:06 a.m. EST.

It inspected project source and documentation, investigated Twitch authorization and provider routing, examined existing bugs, and passed the 12 operational and eight preview tests.

The last identifiable Apollo-side tool operation was a successful native screenshot read at approximately 5:09:34 a.m.

The ChatGPT conversation subsequently displayed a generic failure.

A retrospective audit found no new implementation branch or M5 candidate attributable to the run. It also found no sufficient evidence to identify the definitive cause of the failure.

Potential mechanisms include tool-result processing, multimodal handling, hosted orchestration, application handoff, transient service failure, and interactions among these.

Do not presume one cause.

Do not restart development from zero.

Do not reproduce the previous failure as a preliminary exercise.

Recover the existing state, reuse valid findings, and proceed.

The objective is a successful continuation with better durability, not another forensic inquiry.

---

## 5. Product architecture and design-space exploration

You should explore the design space seriously before converging, but exploration must remain connected to implementation.

The objective is not to generate a long list of ideas.

The objective is to discover and develop **several credible ways this product could actually work and feel**.

Examine at least these underlying questions, without treating them as the complete set:

How should playback, stream identity, quality, and chat relate spatially?

How should the sidebar behave when chat is unavailable or hidden?

Should the interface privilege persistent visibility, progressive disclosure, or contextual interaction?

Which controls belong in IINA's existing player chrome, and which genuinely belong in Streams?

How should the interface respond to changes in width, fullscreen state, sidebar placement, or transparency?

What information is genuinely useful during normal viewing, and what should appear only when needed?

How should users switch streams or revisit channels without turning the sidebar into an overloaded control panel?

How can two different layouts represent meaningfully different interaction philosophies while sharing reliable playback infrastructure?

Consider the current Unified, Tabs, and Compact previews as starting material.

Do not presume that the best alternative must be one of those three.

### Design principles

Draw on the earlier Tap and Filter design work where relevant:

- Native macOS character with a distinct but restrained identity.
- Appropriate integration with IINA's visual materials.
- Strong spatial and typographic hierarchy.
- Economical use of explanatory text.
- Discoverable controls without permanent instructional clutter.
- Realistic information density.
- Careful interaction transitions.
- Visual consistency across different states.
- Accessibility and keyboard usability.
- Restraint in animation and unnecessary decoration.

Avoid redundant transport controls already provided by IINA.

Avoid text that restates what the interface already communicates.

Avoid adding settings simply to occupy empty space.

Equally, do not make the interface so minimal that useful functionality becomes hidden or unnecessarily difficult to reach.

### Turn design exploration into finished implementations

Use the actual IINA plugin and sidebar APIs.

Do not deliver standalone browser mockups.

You may use HTML/CSS/JavaScript where they form the real IINA plugin interface, but evaluate the result inside IINA itself.

Favor a shared functional core with independent, well-defined presentation configurations where that supports meaningful comparison and maintenance.

If a different architecture would produce substantially better results, investigate and implement it within reversible development boundaries.

Each final candidate must be easy to launch and compare, preferably without modifying code or requiring repeated manual installation steps.

---

## 6. Functional development: M1 through M5

All credible final candidates should exercise the same substantially complete functional contract.

A design with attractive but nonfunctional controls does not qualify.

### M1/M2 — Playback correctness

Preserve and improve the current operational implementation.

Verify:

- Twitch stream entry and URL normalization.
- Direct playback and stream extraction.
- Quality selection.
- Quality changes in the same player window.
- Correct player title and sidebar continuity.
- Loading and error transitions.
- Repeated open/close cycles.
- Per-window isolation.
- Correct cleanup of helper processes.
- Sidebar bridge readiness.
- Existing IINA OSC behavior.
- Appropriate handling of rapid or interrupted quality changes.

Investigate the previously observed ambiguity around quality transitions and file-loaded events.

Add appropriate tests and correct confirmed defects.

### M3 — Twitch read-only chat

Research official current Twitch authorization, chat, and API requirements.

Build the strongest legitimate read-only chat implementation that the environment permits.

Include:

- Actual chat rendering architecture.
- Bounded message history.
- High-volume chat handling.
- Connection, reconnection, and error states.
- Network disabled by default.
- Explicit opt-in.
- Least-privilege authorization.
- Safe token lifecycle.
- Chat visibility and presentation controls.
- Resource-conscious operation.
- Separation of simulated and real network states.

Do not send messages.

Do not obtain credentials or grant permissions without authorization.

If real OAuth authorization requires me to participate, complete the independent integration and offline lifecycle testing, and identify the remaining real-auth verification gate.

Do not confuse synthetic messages with working network chat.

Chat should integrate coherently into every final design.

### M4 — YouTube Live and VOD

Validate and implement YouTube Live and VOD routing using current supported mechanisms.

Evaluate:

- URL identification.
- Provider routing.
- Quality selection.
- Stream extraction.
- Codec behavior.
- Live versus VOD transitions.
- Seeking.
- Error handling.
- Fallback behavior.
- Native window continuity.

Preserve Twitch playback reliability.

YouTube Live chat can remain a separately gated enhancement if justified.

### M5 — Product integration, performance, and release preparation

Integrate the complete feasible feature set into each final candidate.

Carry out:

- Automated tests.
- Native IINA tests.
- Lifecycle and failure-state tests.
- Accessibility checks where possible.
- Comparative resource measurements.
- Candidate packaging.
- Reproducible installation.
- Reversible removal and rollback.
- User-facing review preparation.

Measure CPU, resident memory, system memory pressure, swap behavior, helper processes, and relevant network overhead where feasible.

Do not make battery or energy-efficiency claims without suitable evidence.

Compare with a relevant browser configuration where the workloads can be meaningfully matched.

Record versions, test conditions, and confounders.

---

## 7. Make every candidate a serious product

This is one of the most important requirements in the commission.

**Do not spend most of the execution perfecting A and leave B as a thin visual experiment.**

Find an efficient way to bring the alternatives to comparable functional maturity.

A shared backend and common testing infrastructure are encouraged.

The presentation and interaction differences should nonetheless be substantial enough to give me a meaningful choice.

Each candidate offered for final selection should support, to the extent independently implementable:

- Starting supported streams.
- Displaying appropriate stream identity.
- Changing quality without losing the player.
- Viewing and hiding chat.
- Handling chat-unavailable and authorization-required states.
- Handling loading, errors, and transitions.
- Appropriate current/M2-only presentation.
- Fullscreen and windowed interaction.
- Consistent resource management.
- Accessibility and keyboard interaction within supported API limits.

The alternatives should be exercised under comparable conditions.

If one candidate fails something that the other handles correctly, either fix it or identify the difference explicitly rather than presenting the two as equally complete.

Do not rely on visual appearance alone to establish equivalence.

### Native design iteration

For each credible candidate, repeatedly:

1. Run it inside IINA.
2. Observe it over realistic video content.
3. Inspect representative interaction and failure states.
4. Identify deficiencies in hierarchy, spacing, behavior, controls, and coherence.
5. Implement improvements.
6. Re-run the relevant tests.
7. Compare against the other candidate and the existing baseline.

Continue until the remaining issues are relatively minor, externally gated, or justified limitations of the host environment.

Tests and screenshots should come from actual IINA wherever the claim concerns native behavior.

A visually convincing screenshot does not establish that the controls work.

A successful test suite does not establish that the interface is well designed.

Both matter.

### Independent criticism

Before finalizing, perform a substantial critical review of the alternatives.

If independent subagents or review capabilities are available, use them where they can provide meaningful challenge without creating conflicting writes.

Ask whether:

- The design solves the intended problem.
- Any interaction is unnecessarily complicated.
- Some controls are duplicated.
- Important features are hidden.
- The interface contains redundant text.
- The chosen layout relies on a misleading preview state.
- The implementation behaves poorly in ordinary use.
- One alternative is merely a cosmetic variation.
- The recommended design has benefited from disproportionately more refinement.
- The work has substituted an easier objective for the commissioned product.

Criticism should lead to actual revisions where warranted, not merely appear in a report.

---

## 8. Ambition without uncontrolled scope expansion

I want you to be genuinely ambitious.

That does not mean adding features indefinitely.

It means taking the intended product seriously enough to pursue the work required for a polished, coherent, near-final outcome.

Do not interpret a short feature list as an instruction to create the smallest possible implementation.

Do not interpret a long feature list as an instruction to implement every speculative idea.

Choose and develop the capabilities that materially contribute to the product.

Investigate worthwhile opportunities that the preceding specification fails to name.

There may be better playback controls, more effective navigation, a better distinction between current and future states, improved stream switching, superior chat presentation, or an architectural simplification that makes everything else more coherent.

Follow such opportunities where they are consequential.

But distinguish discovery that improves the product from digression that delays its completion.

If an unexpected finding substantially changes the strongest design, allow it to change your plan.

The commission is not to defend the previous design. It is to produce the best defensible product.

### Your stopping criterion

Do not stop simply because all named sections have corresponding documentation.

Stop when you have completed the substantive engineering and design work that the authorization and available environment permit, and when the candidates you present are genuinely ready for a meaningful final choice.

Before concluding, identify the strongest remaining implementation or design deficiency that could materially change the recommended candidate.

If it is within scope, technically feasible, and worth addressing, address it.

Repeat this assessment after meaningful revisions.

Do not require failure or artificial stress to establish ambition.

The result should be better because of what you developed and learned, not because of how long the run lasted.

---

## 9. Recovery, checkpoints, and auditability

The previous Pro run failed. We want to make a recurrence less damaging without dedicating this run to failure reproduction.

Establish a lightweight durable execution journal in the project or a clearly identified adjacent evidence directory.

Record:

- Starting revisions and runtime versions.
- Worktree and branch identities.
- Important decisions and their evidentiary basis.
- Completed functionality.
- Material source changes.
- Test results.
- Native observations.
- Significant failures.
- Checkpoints and next steps.
- Outstanding authorization gates.

Commit meaningful development milestones.

Do not leave large amounts of independently completed implementation entirely uncommitted.

Keep previous worktrees and stable behavior reversible.

Maintain a current continuation note sufficient for a fresh agent to identify:

- The last verified state.
- Which candidates exist.
- What each currently supports.
- What has actually been tested.
- Which important work remains.
- Which operations should not be repeated.
- The next executable action.

Avoid unnecessary logging complexity.

Keep diagnostics sanitized and bounded.

Large image or source outputs should be retained locally when appropriate, with smaller previews or targeted excerpts sent to the model where sufficient.

The previous 3.4 MB screenshot response was not proven to cause the failure. Do not treat its size as a definitive root cause.

If another error occurs, preserve evidence, check what completed, recover from the last checkpoint, and continue where safe.

Do not automatically infer that separate errors share one cause.

Do not run a deliberate failure-reproduction campaign unless new evidence makes a targeted experiment materially worthwhile.

---

## 10. Reversibility and implementation boundaries

Create new development branches or worktrees appropriate to the candidates.

Preserve:

- The operational checkout.
- The existing design preview.
- The working M2 quality-switching behavior.
- Existing tests and evidence.
- The currently functioning installed plugin.
- The stable deployment approval gate.

Candidate plugins should have distinct identifiers or another safely reversible selection mechanism.

An acceptable implementation may use one shared functional codebase and two independently selectable native layouts, provided that both are complete and genuinely distinct.

Separate feature branches are also acceptable where justified.

Choose the architecture that makes implementation, comparison, maintenance, and rollback strongest.

Do not create artificial duplication merely to satisfy the number of alternatives.

Do not overwrite or enable a stable installation.

Do not modify IINA.app itself.

Do not change global macOS or IINA settings without permission.

Do not install or upgrade system software without authorization.

Do not expose credentials or signed media URLs.

Do not send live chat messages or obtain broader OAuth grants.

Do not close unrelated application windows or terminate unrelated processes.

Use absolute paths where appropriate; the RDC environment may provide a synthetic home directory.

Perform bounded native experiments that preserve unrelated work.

---

## 11. Evidence and claim standards

Treat the work as both a product-development commission and an independently auditable engineering exercise.

For consequential claims, distinguish:

- Direct native observations.
- Source-code inspection.
- Automated tests.
- Mocked or simulated behavior.
- External documentation.
- Inferences.
- Untested assumptions.

Use appropriate claim–grounds–warrant–qualification–rebuttal reasoning.

Do not claim functionality because the relevant code exists.

Do not claim native reliability from mocked tests alone.

Do not claim production readiness based solely on a clean build.

Do not claim a performance improvement from unmatched measurements.

Do not present a blocked authorization step as successfully exercised.

Read current official API documentation and verify relevant assumptions against actual versions.

Evaluate conflicting evidence rather than flattening it into a superficial consensus.

Your audit should allow a skeptical reviewer to determine which claims are supported and which remain provisional.

At the same time, avoid turning evidence production into a replacement for development.

The principal aim is useful completed work.

---

## 12. Final deliverables

Leave all substantive work in versioned, clearly indexed local project directories.

### Fully working candidate implementations

Provide at least two meaningful, independently selectable, near-release candidates, unless an evidenced constraint prevents that outcome.

Each candidate should have an exact source revision, working installation or launch path, and reproducible testing procedure.

Do not describe unimplemented visual concepts as final options.

### Native comparison experience

Make it straightforward for me to inspect each candidate in actual IINA.

Ideally, the comparison should require only a simple command or clearly documented selection action.

Include actual native screenshots of comparable states.

Provide enough realistic examples to evaluate ordinary playback, chat, controls, transitions, fullscreen behavior, and differences in organization.

### Candidate comparison and recommendation

Provide an assessment of the candidates across meaningful dimensions:

- Usability.
- Visual coherence.
- Native IINA integration.
- Feature completeness.
- Interaction efficiency.
- Accessibility.
- Technical complexity.
- Resource behavior.
- Reliability.
- Maintenance burden.
- Future extensibility.

Do not force all dimensions into one numerical score.

Explain important tradeoffs and productive tensions.

Recommend the strongest candidate, but preserve my ability to choose another.

### Implementation and design report

Provide a readable Markdown report containing the implementation results, architectural decisions, discoveries, design refinements, performance findings, significant tradeoffs, outstanding limitations, and recommendation.

### Evidence appendix

Provide a separate Markdown appendix containing commands, test results, source references, runtime conditions, important screenshots, relevant output excerpts, and a claim/evidence ledger.

Make it possible for another technically competent reviewer to scrutinize the report.

### Packaging and rollback

Produce reproducible packages and corresponding checksums, with exact installation, test, switching, and rollback instructions.

Do not perform stable deployment.

### Continuation handoff

Provide an exact, concise next-session handoff with branch names, commits, candidate identities, current functionality, outstanding work, and any unresolved authorization requirements.

If the execution ends unexpectedly, the durable work should remain recoverable.

---

## 13. Final acceptance review

Before your final response, perform a review from the perspective of someone deciding whether to adopt one of these implementations immediately.

The central questions are:

**Can I actually choose between multiple credible, working alternatives?**

**Do the alternatives represent meaningfully different product designs?**

**Has each option been developed far enough that it can be evaluated as a product rather than a concept?**

**Can I use the main implemented functionality without discovering that prominent controls are placeholders?**

**Have the candidates been tested in real IINA, not only simulated?**

**Could the selected candidate become the stable installation after my approval and, at most, minor refinements or explicitly identified externally gated tests?**

**Are there substantive, independently fixable defects that you are leaving for another agent simply because the report is already complete?**

If the last answer is yes, address those defects before concluding.

Your finished return should make the decision easy:

- **Accept:** ready for approved promotion, subject to explicitly identified final gates.
- **Revise:** specific minor improvements remain.
- **Defer:** a concrete blocker prevents acceptance.
- **Roll back:** the candidate does not warrant replacing the existing implementation.

Do not call a candidate release-ready when essential functional requirements remain unimplemented.

Do not conceal remaining work in vague statements such as "future polish" or "additional integration recommended."

Identify exactly what remains and why.

---

## 14. Execute autonomously

Begin by connecting to Apollo.

Read the original commission and current project evidence.

Verify the latest Git state.

Recover what the earlier execution established.

Create an isolated, reversible development arrangement and lightweight recovery journal.

Then move into substantive implementation.

Explore the design space, but repeatedly bring the discoveries into functioning native software.

Develop the leading unified candidate and at least one equally serious alternative.

Test them, criticize them, revise them, and continue until they are credible near-final choices.

You may challenge the commission's architectural assumptions and pursue discoveries it does not anticipate.

You must preserve the user authorization boundaries and stable deployment gate.

Do not stop for intermediate user preferences or routine decisions.

Do not spend this run artificially reproducing the previous failure.

Do not mistake a good report, a complete checklist, or a polished prototype for the intended result.

**I want to choose between finished products, not between promises of what future development might produce.**

Your measure of success is the quality and completeness of what I can actually run, compare, and potentially adopt.

**Read the companion addendum in full, then begin execution.**