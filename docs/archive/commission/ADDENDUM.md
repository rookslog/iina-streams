# ADDENDUM — Evolving Requirements, Synchronized Chat Replay, Alternative Chat Presentations, and Ambitious Product Branches

> **Companion to:** `IINA_Streams_GPT6_Pro_Main_Commission_2026-11-08.md`. Read the main commission first and this addendum second. This addendum explicitly expands and, where specified, overrides older functional-scope exclusions. All restrictions concerning credentials, unrelated applications, system settings, reversible development, and **no unapproved stable deployment** remain binding.

This is an additional instruction from the user, made after the principal commission was written.

It is part of the same authorized autonomous development run, not a separate future project.

Read this addendum alongside the principal commission. Where it expands or explicitly revises earlier functional scope, it takes precedence. Existing safety, credential, reversibility, and stable-deployment approval boundaries remain intact.

---

## 1. Requirements are evolving, and your design authority is substantive

One of my concerns is that an agent given a specification tends to reproduce that specification, perhaps with modest refinements, rather than develop what the product could become.

I want something more ambitious.

You should understand the preceding commission as a situated expression of what we currently know and want, not an exhaustive account of what would make the best application.

New requirements may emerge through my subsequent reflections, your research, implementation experience, native testing, and discoveries made while confronting the actual software.

You have authority to identify opportunities beyond the prompt, investigate them, and implement justified improvements in reversible development branches.

But there is an equally important responsibility: **I need a dependable, polished product that satisfies the expectations already established.**

I do not want exploratory ambition to consume the entire run and leave me without that product.

Nor do I want a safe baseline to become an excuse for producing one conservative implementation while leaving the more interesting possibilities unfinished.

You must hold these objectives together through the structure of the development work.

---

## 2. The implementation should branch from a working common foundation

Develop a sound shared functional foundation, retaining the existing operational implementation and its verified behavior.

From that foundation, maintain distinct, reversible product candidates.

### A — Baseline product candidate

This candidate faithfully fulfills the principal commission, including the previously established M1–M5 functional and design objectives as far as legitimate access permits.

Develop the refined Unified design to near-release quality.

The baseline must be a credible final product, not a minimally functioning fallback or a deliberately inferior version.

Preserve it as an independently usable, testable, and adoptable implementation.

### B — Ambitious enhanced candidate

Develop a second candidate that retains the reliability and important functionality of the baseline while pursuing a materially stronger or different product conception.

The newly requested chat-replay and flexible chat-display features are especially important opportunities.

This must also become a genuine working implementation rather than a visual illustration of future possibilities.

### C and further exploratory directions

Consider one or more additional directions if a meaningful design or architectural possibility emerges.

These might explore a different relationship between playback and chat, a different interaction structure, or a substantially better approach to stream navigation and controls.

You need not produce an arbitrary number of alternatives. Two substantial near-final candidates remain the minimum intended result, with additional alternatives developed where they warrant the investment.

The candidates need not have wholly separate codebases. A shared engine with independently selectable presentations, capabilities, or configurations may be the superior architecture.

Use Git branches, worktrees, variant-specific plugin targets, or another appropriately reversible arrangement.

The point is that experimental work must not silently destabilize the common foundation or prevent me from choosing the earlier, more conservative candidate.

Improvements discovered in experimental branches may be brought back into the baseline when their value and compatibility are established.

### Important distinction

Do not artificially equate design exploration with adding more features.

A different layout can be a genuine product alternative even with the same feature set.

Likewise, a richer feature set can be worthwhile without requiring an entirely different visual identity.

Explore both dimensions, and avoid conflating them.

Your final comparison should make clear which differences concern the user experience, which concern functionality, and which concern underlying architecture.

---

## 3. New functional request: synchronized chat replay for VODs

I would like to watch recorded Twitch livestreams with their original chat replayed alongside the video, synchronized to the original broadcast.

This is a meaningful part of the viewing experience. The audience's reactions can add something to watching a recording that the video alone does not provide.

**Twitch VOD chat replay is the immediate priority. YouTube livestream archives and VOD chat replay are also desirable.**

Investigate and implement this as far as the supported and legitimately available mechanisms permit.

You may integrate it into M3, M4, an intermediate milestone, or the final M5 integration, whichever gives the strongest architecture.

Do not treat the earlier roadmap's exclusion of video-overlay functionality or its statement that VOD has no live-chat panel as a permanent prohibition. This addendum explicitly reopens those decisions.

### Functional behavior

Where authentic replay data is available, chat should follow the actual playback position.

Investigate and implement:

- Chat appearing at the corresponding moment in the recording.
- Accurate alignment between chat timestamps and video time.
- Pausing chat when video is paused.
- Correct resynchronization after seeking forward or backward.
- Synchronization at different playback speeds.
- Correct behavior at the beginning and end of a recording.
- Handling of long recordings, discontinuities, trimmed highlights, and nonzero start offsets where relevant.
- Bounded memory use and efficient navigation through large chat histories.
- Distinguishing ordinary chat, deleted or unavailable messages, emotes, and other message types where technically appropriate.
- Error, loading, missing-history, and unavailable-replay states.

A chat interface that displays historical messages without respecting video position is not sufficient.

Do not simulate synchronization and describe it as verified real replay.

### Twitch investigation

Investigate the actual availability and reliability of Twitch VOD chat data, including supported APIs, known access restrictions, and the approaches employed by established third-party tools such as TwitchDownloader.

The absence of an officially supported historical-chat API is a significant constraint, but it should lead to serious investigation of legitimate, maintainable alternatives rather than immediate abandonment of the feature.

Evaluate the durability, terms, permissions, maintenance risks, and resource implications of each viable approach.

Do not bypass authentication restrictions, access private VODs without authorization, or compromise credentials.

If a reliable direct retrieval approach is unavailable, investigate useful fallback designs, such as importing an existing authorized chat archive or sidecar file and replaying it against the video timeline.

Such a fallback should be genuinely usable and tested, rather than just described.

Keep acquisition, chat-data normalization, synchronization, and presentation separate enough that another legitimate provider or import mechanism could be substituted later.

Do not require chat capture or archival to operate automatically in the background merely because video is playing.

### YouTube investigation

Investigate recorded YouTube Live chat replay, its availability conditions, official interfaces, and existing extraction capabilities such as yt-dlp's live-chat subtitle support.

Implement the strongest legitimate approach where feasible.

Some VODs will lack chat replay. Represent that condition correctly.

Preserve the distinction between:

- A livestream with current chat.
- An archived livestream with historical replay.
- An ordinary video that never had livestream chat.
- A recording for which chat existed but is no longer available.

Do not conflate a video's ordinary comments section with its synchronized live-chat replay.

### Candidate integration

The baseline must retain all previously commissioned functionality and remain a credible final product.

At least one enhanced candidate should pursue a genuinely working replay experience, with Twitch as the leading target.

If the replay source itself is blocked, carry the synchronization engine, authorized import path, UI integration, and independent tests as far as possible. Identify the exact missing real-source gate.

Do not declare full Twitch replay implemented if only synthetic data or an imported fixture has been exercised.

Do not allow an unavailable replay provider to break ordinary video playback.

---

## 4. New design request: multiple ways of displaying chat

I also want to investigate different presentation modes for live chat and historical chat replay.

Two especially interesting approaches are:

### Sidebar chat

Chat occupies the existing IINA sidebar or a section of the unified Streams panel.

It should feel natural alongside video, with persistent playback and quality controls where appropriate.

The current Unified design is a strong starting point.

### Transparent video-overlay chat

Instead of occupying the sidebar, chat can appear as a small, translucent region over the video itself.

For example, a few recent messages might appear in an upper corner, without requiring a large permanent panel.

Investigate IINA's actual plugin overlay API, including its rendering, input handling, permission requirements, and fullscreen behavior.

I understand that IINA provides an overlay mechanism, but that does not establish that every desired interaction is supported.

Test the actual implementation.

Potential controls include:

- Show/hide chat.
- Sidebar versus overlay presentation.
- Fixed placement presets.
- Adjustable opacity.
- Adjustable text size.
- Number of visible messages.
- Maximum message rate or density.
- Compact appearance options.
- Background treatment and legibility.
- A way to return to defaults.

Do not implement every setting merely because it appears in this list.

Design a coherent interaction model, and keep the default experience simple.

### Positioning and dragging

I would particularly like the possibility of moving the overlay.

Investigate whether it can be positioned in a predefined place, or moved freely by dragging, somewhat like IINA's floating playback controls.

If free dragging is technically feasible through supported plugin mechanisms, implement it in an experimental candidate and test it.

The intended behavior is that I could place the chat region somewhere convenient and, if appropriate, retain that placement.

Consider behavior when entering fullscreen, resizing the player, changing display dimensions, or moving between aspect ratios.

Avoid positioning chat where it regularly obscures subtitles, important player controls, or native IINA interface elements.

Do not steal video mouse interactions unnecessarily.

Prefer an overlay that normally allows clicks to pass through to the player, entering an explicit positioning or editing mode only when needed.

Provide an accessible, non-drag alternative for changing placement.

If free dragging is not reliably supported by the public IINA plugin API, establish why and implement the strongest supported alternative, such as discrete positioning controls.

Do not modify the IINA application binary or global settings to force the behavior.

### Interaction between presentation modes

Explore whether users should be able to switch between sidebar and overlay while watching, or whether the modes should be more strongly separated.

Assess their respective strengths for different circumstances:

- Live viewing.
- Long Twitch VODs.
- Casual background viewing.
- Fullscreen viewing.
- Small player windows.
- Dense versus quiet chats.

There may be worthwhile intermediate forms: a compact floating chat, temporarily expanded overlay, or sidebar that can be dismissed while a small chat region remains visible.

These are possibilities to investigate, not a predetermined feature checklist.

Exercise judgment.

---

## 5. Architecture: distinguish chat source, time, and presentation

The new requests suggest that chat should not be architecturally inseparable from one sidebar implementation.

Investigate an appropriate separation between:

1. Chat acquisition and authorization.
2. Live versus historical chat data.
3. Timestamp normalization and replay synchronization.
4. Shared message state and resource lifecycle.
5. Presentation in sidebar or overlay.
6. User preferences and interaction modes.

This is a proposed architectural direction, not an instruction to introduce unnecessary abstraction.

Challenge it if the actual IINA environment suggests a cleaner design.

The ability to reuse one chat presentation for both live and historical data—or to drive both sidebar and overlay from the same message source—could be valuable.

But do not assume that identical abstractions are correct when the behavior differs.

For example, live chat follows an ongoing stream, whereas historical chat should follow the player's timeline.

That distinction must survive the architecture.

---

## 6. Proactively investigate additional product opportunities

I want you to take initiative in discovering what else would make IINA Streams significantly better.

Inspect the current application, the available IINA APIs, existing streaming tools, and the actual workflows the product is intended to support.

Look beyond the options already listed.

A few possible directions include:

- Recent streams and favorite channels.
- Better stream switching.
- Resuming VOD playback.
- Better feedback during quality changes.
- More convenient opening of Twitch or YouTube URLs.
- Stream metadata that is genuinely useful.
- Chat search or navigation within a replay.
- Efficient emote support.
- More seamless transitions between fullscreen and windowed viewing.
- Features that make long-form background viewing more convenient.

These are leads, not requirements to implement all of them.

Look for other opportunities independently.

Evaluate whether each would materially improve the product, whether it can be completed within a reasonable architecture, and whether its ongoing resource cost is justified.

When an opportunity is strong, implement and test it in a suitable exploratory candidate rather than simply appending it to a future roadmap.

When an opportunity is weaker, preserve it as a justified option without destabilizing the main work.

**Do not let the easiest feature to implement become the feature you choose merely because it is easiest to demonstrate.**

The criterion is its contribution to the actual viewing experience.

---

## 7. Protect the deliverable while genuinely exploring

The major danger is that the exploration consumes the execution while the intended product remains unfinished.

The opposite danger is that the baseline becomes the whole project and the exploratory candidates are treated as speculative appendices.

Design the workflow to avoid both.

A strong strategy might be:

1. Establish and verify the common functional foundation.
2. Create a genuinely finished baseline candidate.
3. Develop an enhanced candidate using shared infrastructure where appropriate.
4. Explore further substantial alternatives in isolated branches or selectable configurations.
5. Integrate justified improvements, refine all final candidates, and compare them under native conditions.
6. Continue until the surviving candidates are near-release quality.

You may improve on this sequence.

Do not require a new operator decision at each step.

If an exploratory route proves genuinely poor, you may abandon it. Preserve the evidence and replace it with a stronger route where possible.

You do not need to retain weak alternatives merely to prove that exploration occurred.

The final alternatives should represent credible adoption choices.

The baseline should not be artificially deprived of improvements that have become clearly beneficial and reliable.

Likewise, an enhanced candidate should not become technically fragile merely to maximize its feature count.

---

## 8. Expanded testing and acceptance

The original testing and auditing requirements remain in force.

Extend the test matrix to include, where the associated functionality is implemented:

- Live chat in sidebar mode.
- Live chat in overlay mode.
- Twitch VOD chat replay in sidebar mode.
- Twitch VOD chat replay in overlay mode.
- Available YouTube replay chat.
- VODs with missing or unavailable chat.
- Pause, resume, seeking, and playback-speed changes.
- Repeated switching between display modes.
- Fullscreen transitions.
- Overlay positioning and persistence.
- Correct click-through behavior.
- Representative bright and dark footage.
- Narrow and wide player geometry.
- Resource behavior during long chat sessions.
- Correct cleanup when chat is hidden, disconnected, or a player closes.

Test real native functionality wherever feasible.

Use synthetic chat to validate rendering and synchronization logic when necessary, but distinguish those tests from successful retrieval and playback of authentic platform chat.

Assess each candidate under comparable conditions.

Preserve performance and resource considerations, especially unnecessary WebKit memory usage, polling, network traffic, and animated content.

---

## 9. Expanded final deliverable

The final review should give me an immediate, practical choice between finished products.

For each candidate, provide:

- Its name and principal design idea.
- Exact branch, commit, and plugin identity.
- What is implemented and genuinely functional.
- What differentiates it from the baseline.
- Any experimental or externally gated capabilities.
- Actual native IINA screenshots.
- Reproducible installation and launch steps.
- A simple way to switch to or compare another candidate.
- Relevant test results and known limitations.
- The remaining work required before approved stable deployment.

Include a **feature and experience comparison** that makes clear whether each candidate supports live chat, VOD chat replay, sidebar chat, transparent overlay chat, and configurable overlay placement.

Do not obscure differences in feature completeness behind an overall design score.

Recommend the strongest candidate, including reasons why a more conservative or more experimental choice might also be defensible.

Where an exploratory implementation materially improves the product, do not automatically recommend the baseline merely because it has fewer features and therefore fewer possible defects.

Evaluate the actual implementations.

Maintain the independent Markdown report, evidence appendix, checkpoints, rollback instructions, and continuation handoff required in the principal commission.

---

## 10. The broader intention

The point of this addendum extends beyond chat replay and video overlays.

I want the project to be capable of developing beyond the requirements that originally initiated it, without losing its responsibility to fulfill them.

The initial specification provides an orientation and some expectations. New features, problems, and possibilities may emerge through implementation. Those discoveries can legitimately change what the strongest product looks like.

I want you to respond to them creatively and critically.

But I also need material results, not another round of unrealized possibilities.

**Give me a dependable implementation that satisfies the original commission, and give me genuinely developed alternatives that show what becomes possible when you go beyond it.**

The alternatives should not be unfinished aspirations. They should be real software that I can run, inspect, compare, and potentially adopt after relatively minor refinements.

You have the authority to investigate, decide, branch, implement, test, and revise autonomously within the existing safety boundaries.

Do not interrupt the run to seek my taste preferences.

Do not deploy stable without my approval.

Do not treat the completion of the written specification as the end of the work if the strongest independently achievable product remains unfinished.

**Continue the original commission with this expanded scope and ambition.**