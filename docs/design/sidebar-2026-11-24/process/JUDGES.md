# Judging the five directions (2026-11-24, operator asleep)

Every verdict here is labelled with its judge. None is the operator's. The operator picks.

**What the judges shared:**
- **Data:** the same five builds, the same public Twitch snapshot and invented watch history, and the same shared frame and base styles.
- **Model family:** both judges are Claude (Opus 5.5 and the Fable advisor). Their agreement is not independent evidence.
- **Not blind:** the advisor has read the lead's READING.md and BRIEF.md.
- **No Codex:** the operator ruled out Codex for design work (15:45, said 6232df48/1c91d1a5). This overrides the planning lead's "a reviewer of another provider".

**Calibration was weaker than planned:**
- **The control was labelled.** Q, which is round 2 rebuilt, had "(states none)" as its purpose line, and the operator's words included their rejection of its history and Forget groups. So Q's last place shows the judge matching words, not telling good from bad unaided.
- **The Opus judge saw a build that was later corrected.** It saw P, T and S before the running-broadcast fix (`abf31b2`), when a live person's running stream appeared in their lists as a finished VOD.

## The Opus judge (Opus 5.5, separate context; given the operator's words, PRODUCT.md Users, each direction's purpose line and screenshots; not given READING.md, BRIEF.md or KEY.md)

**Its ranking:**
1. R
2. T
3. P
4. S
5. Q

It expects Q to be rejected first.

**Its main findings, condensed by the lead:**
- **R:** the right job for this panel; it is the operator's own 06:44 flow.
  - Half-finished broadcasts show only as a blue arc; which one and how far are given only to VoiceOver.
  - A live person's broadcasts sit behind a chevron that appears only on hover or selection. The same-looking row switches when the person is live and opens their page when offline.
- **T:** the strongest page for one person's broadcasts, and weak as a quick list.
  - The strip's faces have no names.
  - Return didn't act in the scripted run; the cause may be the capture.
  - Search finds people but not that person's broadcasts.
- **P:** browsing, which PRODUCT puts in the dashboard.
  - Typing "lu" matches broadcast titles before people.
  - It has no quality control.
  - A thumbnail on every row is the crowding the operator doubted.
- **S:** in the panel itself, the main viewer cannot switch.
  - Tab is macOS's focus key, and the switcher is a hidden gesture.
- **Q:** brings back exactly what was rejected: the Chat, Twitch and History groups, "Forget ohnePixel", and boxed sections with headings.

**What weakened it:**
- nothing was run in native IINA;
- dark appearance only;
- one scripted keyboard path for all five;
- resume always starts at 0:00 in the shared mock;
- it did not write its judgment down before reading the metrics.

The full report is in the lead's transcript, and this summary keeps its rankings and findings.

## The advisor (Fable; not blind: it has read the lead's reading and brief; judged from one screenshot each)

**Its ranking:**
1. R
2. P, once fixed
3. T
4. Q

S goes alongside, as an addition to a panel direction rather than a rival. It expects T to be rejected first.

**Its main findings:**
- **R:** continue watching is reduced to an unexplained arc, and resuming takes three steps. A bare "17h" doesn't say what it measures.
- **P:** its first screen repeated the Now strip, because running broadcasts were listed as VODs. That is now fixed. A thumbnail on every row is the crowding the operator named.
- **T:** opens on VODs of the stream you are leaving. The strip is unnamed 32 px faces.
- **S:** has no mouse entry point.
- **All five:** real titles begin with 🔴, which imitates the live mark.

## Where they agree and differ

- **Agree:**
  - R is first.
  - R's weakness is continue watching.
  - P's thumbnails crowd.
  - S can't stand alone.
- **Differ:** T against P for second place, and which direction is rejected first (Q for the Opus judge, T for the advisor).

## Scripted measurement (Playwright with installed Chrome, not IINA's WebKit; `tools/capture.py`)

- **Horizontal overflow:** none in any direction at 300 or 360.
- **Keyboard (two arrows and Return):** switched and closed the panel in R, P, S and Q. T didn't act, because Return needs focus in its list.
- **S's switcher:** Tab then Return goes back to the previous channel.
- **Native feasibility of S** (read from source, untested natively):
  - IINA 1.5.1 runs high-priority plugin key listeners before its own handler, and they can stop the key (`PluginInputManager.swift`, lines 92–96).
  - Whether IINA's default bindings already use Tab is unchecked.
