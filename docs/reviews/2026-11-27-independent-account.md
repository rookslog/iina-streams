# Independent review — IINA Streams, 27 November 2026

**The central failure is that the project optimized for producing and reviewing changes rather than delivering a coherent, reliable application.** The lead continued integrating features after receiving evidence that the existing experience was unacceptable.

I formed this assessment before reading the lead's retrospective. I examined `next` at `0c27291` and 16 crash reports. GitHub was unreachable, so issue information comes from the local roadmap. I did not operate IINA or change any files.

## 1. Stability was neglected despite early warnings

The crashes did not become a serious problem only on 27 November.

- **7 November:** unexpected closures were already reported and stable promotion deferred. ([DECISIONS.md](docs/DECISIONS.md:16))
- **22 November:** Reload All Plugins crashed IINA. Three ordinary viewing sessions also ended in crashes after 31, 43 and 65 minutes. The listener-retention fix addressed a suspected cause, but automated tests could not reproduce it. ([DECISIONS.md](docs/DECISIONS.md:44), [WAITING.md](docs/WAITING.md:9))
- **24–27 November:** further crashes occurred while feature development continued.

The crash reports independently establish these signatures:

| Date | Reports | Faulting signatures |
|---|---:|---|
| 22 Nov | 9 | Sidebar loading, menu updating, message listeners, JavaScriptCore garbage collection |
| 24 Nov | 2 | Sidebar teardown, Objective-C release |
| 26 Nov | 4 | JavaScriptCore string destruction during memory cleanup |
| 27 Nov | 1 | Same string destruction signature, with IINA's messaging bridge on the stack |

Source: `~/Library/Logs/DiagnosticReports/IINA-2026-11-{22,24,26,27}-*.ips`.

**Inference:** stability should have displaced feature development on 22 November. Instead, the three-hour viewing test remained an outstanding task for the operator. The reports establish recurring crashes, not their responsible plugin, precise cause or hourly frequency.

## 2. How the work acquired its present order

Responsibility is shared, but the decisions were not all the operator's.

| Decision | Responsibility |
|---|---|
| Release sequence: trustworthy loop, then chat timing | Lead proposed; operator approved milestone tracking. D-024 |
| Discovery next; overhaul and installation without dependencies at public launch; additional platforms later | Operator approved the plan and supplied an extremely ambitious timeline. D-026 |
| Bringing adoption, emotes, docked chat and JavaScript playback resolution forward | Lead's implementation sequence. `632c722`, `e600c76`, `f7b78e3`, `1a0518c` |
| Disable adoption by default and same-window reactivation | Lead recommended; operator accepted following review findings. D-033 |
| History and search before dashboard, listening mode and VOD resume | Lead/advisor proposed; operator approved. D-035 |
| Keep the dashboard in launch scope despite a raw 7.5-hour estimate | Lead recalibrated using **one** previous timing observation. D-035 sizing |
| Pause features and repair fundamentals | Operator approved, 27 November. D-036 |

Sources: [DECISIONS.md](docs/DECISIONS.md:40), lines 63, 125, 141, 154 and 165.

**Inference:** the operator authorized product directions; the lead retained responsibility for sequencing, feasibility and integration. Approval of an ambitious roadmap did not establish that its prerequisites worked.

## 3. Effort and user needs diverged

From 20 November through `0c27291`, `next` accumulated **505 commits**, including 94 merges.

Of the 411 non-merge commits:

| Area | Commits mentioning relevant issues |
|---|---:|
| Discovery, history and search | 122 |
| Chat, timing, emotes and overlay | 52 |
| Authentication and accounts | 21 |
| Crashes and diagnostic work | 10 |

Additionally, 225 touched documentation, 150 tests and 40 UI files. These are overlapping counts, not measurements of working time. Source: `git log` and path-filtered `git rev-list` at `0c27291`.

The work was not inherently misguided. However, [PRODUCT.md](PRODUCT.md:14) describes everyday Mac users who want effortless setup, one-window switching, readily accessible VODs, background viewing and uncomplicated controls. Yet VOD resume remained at 0.7.0, dependency-free setup at 0.6.0, and direct chat docking was deferred to the overhaul. ([ROADMAP.md](docs/ROADMAP.md:9), WAITING.md:298)

The clearest failure was Open Stream:

- The approved mock included followed channels; the implementation omitted them.
- The lead's own test specification stripped useful information from the rows.
- A permission button was introduced into search, then removed following the operator's objection.
- Existing account permissions still prevented follows from appearing on 25 November.

(WAITING.md:322, 333, 335, 340, 376)

**Inference:** the tests were successfully enforcing aspects of the wrong design.

## 4. Native acceptance became subordinate to implementation

There was worthwhile native testing: quality changes, the video-margin experiment, Go Live and discovery of the failed offline-channel interface. (DECISIONS.md:27, 85; `70aaf33`, `fdc5e84`)

But the record also shows:

- History wiring merged provisionally with native testing and independent clearance outstanding. (WAITING.md:108)
- The offline-channel fix merged after five reviews and 846 passing tests, without native confirmation. (WAITING.md:128, 147)
- Search merged after the lead withdrew the requirement to observe follows loading in IINA. (WAITING.md:395, 398)
- Seven final native acceptance checks remained listed before the 0.5.5 release. (docs/reviews/2026-11-22-v0.5.5-release-review.md:1051)

This reverses the project's own evidence hierarchy. ([AGENTS.md](AGENTS.md:9))

## 5. The operator became the recipient of engineering problems

WAITING contains 21 headings under Open and seven numbered entries under Answered, although W-19 and W-23 were answered within Open and W-26 was withdrawn.

D-032 requires escalation when a **recurring class of defects survives clearance**. It does not require escalation of every residual finding. Non-regressive medium findings are explicitly non-blocking. ([REVIEW.md](docs/REVIEW.md:14), line 23)

The lead nevertheless invoked it for minor history-module defects, offline-channel edge cases, search-selection races and developer build management. (WAITING.md:82, 128, 397, 400)

**Decisions genuinely belonging to the operator:**

- Product scope, privacy exclusions and transmitting viewing-history names to Twitch.
- Public releases, posting upstream under their account and access to their IINA session.

(WAITING.md:37, 47, 113, 149, 254, 415)

**Decisions belonging to the lead:** routine correctness fixes, technical review dispositions, reversible development merges, build cleanup and a coherent solution to outdated sign-in permissions.

The operator also explicitly rejected the decision-reporting format on 22 November. (WAITING.md:70)

## 6. Where the lead's retrospective falls short

The lead's account is substantially candid. Its commit figures are reproducible at its earlier checkpoint, `9d82dcb`. My disagreements concern responsibility and causation. ([Step-back](docs/reviews/2026-11-27-step-back.md:103))

- **It understates earlier warnings.** On 23 November the operator rejected the sidebar design; on 24 November they explicitly identified a failure of attention to detail and user understanding. (WAITING.md:200, 296)
- **It understates the lead's role in creating defects.** The search specification contradicted the approved mock, and the sidebar critique missed problems because the brief itself requested them. (WAITING.md:213, 333)
- **It conflates account consistency with multiple accounts.** Separate development and stable credentials are intentional isolation. Sharing them is not the obvious remedy for inconsistent experiences within one plugin. (DECISIONS.md:36; step-back:120)
- **It treats testing access as a continuing constraint rather than an urgent problem to solve.** A separate test environment was proposed on 22 November but deferred until before launch. Basic reliability needed it sooner. (WAITING.md:49)

## 7. What I would change, in priority order

1. **Establish reliable playback.** Isolate crash causes, compare diagnostic and ordinary builds, record build-specific incidents and conduct extended viewing tests.
2. **Repair the complete Twitch experience.** Walk opening, signing in, searching, switching, watching VODs, changing quality and manipulating chat. Include signed-out users and upgrades from older sign-ins.
3. **Reorder the roadmap around those journeys.** Bring coherent account behavior, intuitive controls and VOD continuity forward. Defer discovery expansion and new platforms.
4. **Establish independent native testing now.** Stop making the daily user the integration-test environment.
5. **Restore decision ownership.** Keep rigorous code review, but require native evidence before accepting a feature as complete. The lead should resolve engineering choices and bring the operator meaningful product decisions.

The approved pause is appropriate. **Its success should be measured by whether ordinary use becomes dependable and intelligible, not by another completed roadmap or review cycle.**
