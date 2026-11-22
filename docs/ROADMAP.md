# Roadmap

One line per release. Each item lives in a GitHub issue, and each release is a [milestone](https://github.com/rookslog/iina-streams/milestones). Open an issue for detail; open [design/ROADMAP-RATIONALE-2026-11-22.md](design/ROADMAP-RATIONALE-2026-11-22.md) for why the plan is shaped this way.

| Release | Theme | Issues |
| --- | --- | --- |
| [0.5.4](https://github.com/rookslog/iina-streams/milestone/1) | A loop you can trust; first GitHub Release | VOD chat #11 · dev workflow #5 · shortcut #4 · sign-in #7 · Client ID #8 · UI text #9 · live timestamps #10 · cleanup #12 · test shim #13 · release #14 |
| [0.5.5](https://github.com/rookslog/iina-streams/milestone/2) | Chat on your timeline | delay modes #2 · latency spike #16 · VOD test fixtures #17 |
| [0.5.6](https://github.com/rookslog/iina-streams/milestone/3) | An overlay you can shape | resize and drag #1 · host probe and pointer tests #18 |
| [0.6.0](https://github.com/rookslog/iina-streams/milestone/4) | Participate | send chat #3 · Auto sync if #16 passes |

**Parents:** account and sign-in #6 (#7, #8, #3), chat timing #2 (#16, #10), overlay #1 (#18). **Backlog (no milestone):** Reload All Plugins crash #15, emotes and badges, URL interception, YouTube live chat, resource measurement.

## How items get here

1. **Every report or idea becomes an issue:** what happened, what was expected, and the evidence level (native, real-source, unit, or report).
2. **Related to an existing theme?** Add it as a sub-issue of that theme's parent, not as a standalone issue.
3. **Pick a milestone:** a regression or blocker for the current release, or something small that hurts now, goes in the current milestone. Anything that needs measurement or design first goes in the next milestone, as a `type:spike`. Everything else gets no milestone (backlog).
4. **Label** by area (`area:auth|chat|overlay|playback|dev-infra`) and type (`bug`, `type:ux|feature|spike`, `upstream`).
5. Keep this file to one screen. Detail belongs in the issue, design reasoning in `docs/design/`, and decisions in `DECISIONS.md`.
