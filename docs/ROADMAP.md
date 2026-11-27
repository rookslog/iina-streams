# Roadmap

One line per release. Each item lives in a GitHub issue, and each release is a [milestone](https://github.com/rookslog/iina-streams/milestones). Open an issue for detail. Why the plan is shaped this way: [design/USER-JOURNEYS-2026-11-22.md](design/USER-JOURNEYS-2026-11-22.md) (journeys and the launch plan, D-026) and [design/ROADMAP-RATIONALE-2026-11-22.md](design/ROADMAP-RATIONALE-2026-11-22.md) (through 0.5.5).

**Now (D-036, 2026-11-27): new features are paused; the basics come first.** The order is crashes (#90), then a native walk through every journey, then a re-plan brought to the operator. Only fixes merge until then. Record: [reviews/2026-11-27-step-back.md](reviews/2026-11-27-step-back.md).

| Release | Theme | Issues |
| --- | --- | --- |
| [0.5.4](https://github.com/rookslog/iina-streams/milestone/1) | A loop you can trust; first GitHub Release | VOD chat #11 · dev workflow #5 · shortcut #4 · sign-in #7 · UI text #9 · live timestamps #10 · cleanup #12 · test shim #13 · release #14 · install-local footgun #21 · oldest-Python CI #22 · built-in Client ID #8 |
| [0.5.5](https://github.com/rookslog/iina-streams/milestone/2) | Chat on your timeline | delay modes #2 · click-to-calibrate #28 · latency spike #16 · reduce video lag #31 · VOD test fixtures #17 · readability #23 · swallowed errors #24 |
| [0.5.6](https://github.com/rookslog/iina-streams/milestone/3) | Find what to watch (**paused**, D-036) | Following list #30 · offline VOD picker #32 · open from the browser #35 · official emotes and badges #34 · watch history and controls #73 · typing suggestions #74 · signed-in VOD list through Twitch's documented API #75 · plugin panel reopens with options open #86 · emotes in past-broadcast chat #87 |
| [0.6.0](https://github.com/rookslog/iina-streams/milestone/4) | **Public launch** (Reddit) | UI overhaul: panel #20, overlay #1, pointer tests #18, drag to dock #85, chat controls #88, right-click #89 · works out of the box #36 (spike #37) · launch kit #38 · People screen #76 · listening mode #77 |
| [0.7.0](https://github.com/rookslog/iina-streams/milestone/5) | Talk back | send chat #3 · third-party emotes #29 · VOD resume #78 · stream end #79 |
| [0.8.0](https://github.com/rookslog/iina-streams/milestone/6) | More platforms and accounts | accounts #6 · multi-provider #19 · YouTube live chat spike #39 · Kick spike #40 · creator records #80 · merged chat #81 |

The 0.6.0 launch is undated (D-035), and the finding-and-watching plan is [design/FINDING-AND-WATCHING-SPEC-2026-11-22.md](design/FINDING-AND-WATCHING-SPEC-2026-11-22.md).

**Parents:** account and sign-in #6 (#7, #8, #3, #19), chat timing #2 (#16, #10), overlay #1 (#18). **Backlog (no milestone):** Reload All Plugins crash #15, resource measurement #25, undocumented VOD GraphQL #26, CI maintenance #27, QA mode restore or retire #33, category browsing #68, chat-activity strip #69, late joiner #70, multi-view #71, live-while-open notices #72.

## How items get here

1. **Every report or idea becomes an issue:** what happened, what was expected, and the evidence level (native, real-source, unit, or report).
2. **Related to an existing theme?** Add it as a sub-issue of that theme's parent, not as a standalone issue.
3. **Pick a milestone:** a regression or blocker for the current release, or something small that hurts now, goes in the current milestone. Anything that needs measurement or design first goes in the next milestone, as a `type:spike`. Everything else gets no milestone (backlog).
4. **Label** by area (`area:auth|chat|overlay|playback|dev-infra`) and type (`bug`, `type:ux|feature|spike`, `upstream`).
5. Keep this file to one screen. Detail belongs in the issue, design reasoning in `docs/design/`, and decisions in `DECISIONS.md`.
