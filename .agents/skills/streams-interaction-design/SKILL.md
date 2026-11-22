---
name: streams-interaction-design
description: Use for IINA Streams sidebar, floating chat, direct manipulation, visual hierarchy, settings, and native interaction design decisions and critiques.
---

# IINA Streams interaction design

Read the original operator feedback in `docs/archive/commission/HANDOFF-SOL61-HIGH-2026-11-09.md`; inspect the actual running UI and the code paths before proposing an answer.

Relevant standards:
- Local Apple Design skill: `/Users/rookslog/.agents/skills/apple-design-skill/SKILL.md`; read the applicable macOS, pointer, drag/drop, accessibility, settings and material references rather than all HIG files.
- Tap and Filter's original `DESIGN-PRINCIPLES.md`, `GESTURES.md`, `INTERACTION-MODEL.md` under `/Users/rookslog/Development/personal-work-ecosystem/local/2026-10-15-codex-campaign/TNF-LEAD-sol/pstack-trial/.audit/opus-design-work/`. These are precedents to challenge, not a mandatory aesthetic template.

Ask what the viewer is *trying to do*, in order: start a stream, read chat, grab/resize it directly, hide inspector, change quality, return after a restart, replay real VOD chat. Compare at least two materially different interaction arrangements only when the task warrants divergence.

Record for each key gesture: visible signifier, action, real on-screen feedback, possibility of inadvertent player input capture, keyboard/menu fallback, undo/recovery, and fullscreen/narrow-window behavior. Ordinary overlay movement and resizing should not require navigating Appearance then enabling a mode. Do not replace an unpopular mechanism with a non-discoverable hidden gesture.

Measure success inside native IINA with real pointer interactions. A standalone browser test or generated mockup can explore behavior but cannot prove host overlay event delivery. Mark host limitations as hypotheses until a native test isolates them.

Review for semantic clarity, visual density, usable values, color contrast, actual type hierarchy, readability over moving video, and whether native IINA already owns the control. Do not add invented glass, extra controls, instructions, or animations merely to fill space.

Deliver a concise decision ledger: user task → observed failure → alternative(s) → chosen implementation → exact native acceptance proof → remaining uncertainty.
