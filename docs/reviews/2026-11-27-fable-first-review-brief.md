# Brief: first review by the incoming lead (Fable), 2026-11-27

**Why you are here.** The operator, verbatim (`docs/reviews/2026-11-27-step-back.md` §10): "prompt it and ask it to do a first review of the codebase, of the vision itself. Invite it to sort of question any implicit assumptions and things like that where it's deemed justified. It has to back things up. It doesn't have authority just because it is Fable, right? It's answerable to a bunch of different people: to me now, to me later, to the different users."

**Checkpoint:** repo `/Users/rookslog/Development/iina-streams`, branch `next`, clean, at the commit that adds this file.

**Added by the operator, 2026-11-27 ~20:00 (verbatim):** "Fable should also be auditing our development workflows. Are we struggling in certain ways? Why? Maybe make sure to cite, because again, this is a frontier where the norms of the praxis are constantly evolving and changing because the relevant technical objects are constantly changing, or our understanding of the technical objects is changing. … ensuring that we're shipping things fast in a good way. We're trying to ship things fast while still upholding, I guess, our obligations to the different stakeholders, others who we are answerable to." They also asked that this run as **a new session, not a subagent**.

**Hard limits for this first review:**
- Modify nothing except your report, written to `docs/reviews/2026-11-27-fable-first-review.md`.
- Never launch IINA, the crash harness (`scripts/repro/`) or a Dev deploy.
- No GitHub writes.
- Never print secrets, Keychain values or IP addresses.
- Running `npm test` and `npm run test:py` is fine.

**Skills to load first:** `designing-with-a-person` and `inheriting-a-design` (both in `.claude/skills/`).

**Reading order:**
1. The operator's words: step-back §1, §9 and §10; the feedback files in `~/.claude/projects/-Users-rookslog-Development-iina-streams/memory/`; `PRODUCT.md`.
2. `AGENTS.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md` and `docs/WAITING.md` (skim).
3. The code: `global.js`, `main.js`, `src/`, `ui/`, `scripts/`, `tests/`.
4. **Write your own view.**
5. Only then read the lead's accounts, as claims to check: step-back §2–§8, `docs/reviews/2026-11-27-handoff.md`, `docs/reviews/2026-11-27-independent-account.md`.

**Questions:**
- **A. The codebase.** What is it, how is it shaped, and where are the debt and risk that would stop any agent from developing, testing and shipping good software?
- **B. Implicit assumptions** in the product, the roadmap and the process. Challenge one only where it's justified. For each:
  - the assumption, quoted with its source;
  - why you challenge it;
  - what would show your challenge wrong;
  - whom the change serves and whom it costs.
- **C. A vision of answerability.** The operator is weighing a short vision document that names whom the project answers to, including those absent or not yet here. Use `~/Development/sonic-affinity-lab/VISION.md` as a form reference only: it's a draft from another project, with nothing in it affirmed.
  - Does the form fit here?
  - Whom does this project's record already show it answering to? Cite.
  - Who is missing?
  - **Don't write the page.**
- **D. What can't be judged** without seeing the app run in IINA, and what you'd need in order to judge it.
- **E. The lead's accounts:** where they're wrong or incomplete.
- **F. The development workflows.** Where are we struggling, and why? Cover delegation across models, review rounds (D-032), tests first, the native evidence hierarchy, waiting items and the dev loop. Cite the project record, and cite current outside sources on agentic software practice. The norms are changing, so date each source and say how settled it is.
- **G. Shipping fast, in a good way.** What would let this project ship quickly while keeping its obligations to the people it answers to? What slows it without serving them?

**Return:** write the report to the path above, then summarize it in chat.
- at most 2500 words;
- a source for every claim (file:line or commit);
- observed kept apart from inferred;
- what you didn't read.
