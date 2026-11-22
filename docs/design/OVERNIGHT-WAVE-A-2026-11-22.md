# Overnight wave A — test designs (lead, 2026-11-22)

**Status:** lead designs, written while the user sleeps under `.kickoff.json` (plan D-026, plan order). Each slice:
1. The lead designs its tests here.
2. A Codex agent writes them, failing first.
3. An implementer makes them pass.
4. The lead reviews and merges into `beta`.

Writers own disjoint files; see **Owns** under each slice.

Evidence labels follow AGENTS.md. "Observed" means checked on this Mac tonight.

---

## A1 — Open a stream without a modal (#50), and adopt streams opened in IINA (#35, part 1)

**Why.** Observed: pressing + opens `utils.prompt`, and IINA crashed about 5 s later inside JSC's GC timer, running in the modal's nested event loop (crash report `IINA-2026-11-22-044255.ips`). ⌃⌘O uses the same prompt (`global.js` `openStream`). `utils.ask` is also modal. Observed tonight: a Twitch VOD opened with `open -a IINA <url>` played through IINA's own yt-dlp. Streams called `deactivateForForeignFile()`, so its sidebar was blank and there was no chat.

**Design.**
- No blocking dialog anywhere in Streams. `utils.prompt` and `utils.ask` are never called.
- **⌃⌘O (global):** opens a small standalone window (`iina.standaloneWindow`, which exists in IINA 1.5.1: `PluginStandaloneWindow`, `loadFile:`, `open`, `onMessage::`). It loads `ui/open.html`, a single field ("Channel or URL") and the Return key.
  - Submit posts `open-stream` with `{input}`.
  - Global parses the input. If it's valid, global calls `createPlayer(...)` exactly as today and closes the window.
  - If it's invalid, global posts `open-error` back to the window. The window marks the field invalid (`aria-invalid="true"` and a red outline), and the field keeps the text.
  - The implementer verifies the exact `standaloneWindow` method names against IINA v1.5.1 source (`iina/JavascriptAPIStandaloneWindow.swift`) and cites it in the shim.
- **+ in the sidebar:** shows an inline field under the header, with no message to global yet.
  - Return posts `open` with `{input}`. The player forwards it as `app.postMessage('open',{input})`, and global calls `openStream(input)`.
  - Invalid input gets the same invalid-field state as above, sent back as `open-error`.
  - Escape or clicking + again hides the field.
  - *Amended by A1b (2026-11-22):* Escape is handled at document level, and focus moving elsewhere in the sidebar also hides the field. The + rotates to × while the field is open. *Native, 08:53:* Escape still doesn't close the field (IINA doesn't deliver it to the sidebar page); × does.
  - The rule is minimize-ui-text: a placeholder only, no helper sentence.
- **Adoption (#35)** — *amended by A1b:* the hook must be an `async` function. IINA v1.5.1 continues any other hook itself (`MPVController.swift` `MPVHookValue.call`). The controller is built on a main-thread turn, and a 10 s watchdog releases a held load to IINA's own loader. `@data/qa-events-adopted.json` traces it in QA builds. Original text: in `onLoadHook`, when no Streams source is active in this window and the opened path parses with `Sources.parse` as Twitch or YouTube, Streams adopts it.
  - It sets the source, label and active state, and resolves through its normal pipeline, so quality, chat and replay work as they do for ⌃⌘O.
  - A file that doesn't parse (local media, other sites) still deactivates exactly as today.
  - A window whose active source differs from the new path still deactivates, as today: that's a foreign file in a Streams window.

**Tests (Codex writes these; they must fail on `beta` before the change):**
1. Global: `openStream()` with no argument, and the ⌃⌘O menu action, never call `utils.prompt` or `utils.ask`. The shim's versions throw when called. Instead, a standalone window loads `ui/open.html` and opens.
2. Global: an `open-stream` message from the window with `{input:'xqc'}` calls `createPlayer` once, with url `https://www.twitch.tv/xqc` and the same label `openStream` computes today; the window closes. With `{input:'not a stream'}`: no `createPlayer`, the window receives `open-error`, and no modal is shown. With `{input:'  '}`: nothing happens.
3. Global: `app.onMessage('open', {input})` from a player opens the player for valid input. Invalid input sends `open-error` to that player's label only. A legacy `open` message with no input focuses or opens the standalone window rather than prompting.
4. Sidebar script in a minimal DOM (pattern: `tests/sign-in-no-auto-open.test.js`): clicking `#open` reveals the field and focuses it. Return with text posts `open` with `{input}`. Escape hides the field without posting. An `open-error` message sets `aria-invalid="true"` and keeps the text.
5. Player: the sidebar's `open` message with `{input}` is forwarded to global with the input unchanged.
6. Adoption, through `onLoadHook` with the shim's mpv:
   - path `https://www.twitch.tv/videos/2930971003` with no active source: `services.resolve` is called with the parsed VOD source, and the window becomes active. Replay starts only if chat is preferred.
   - path `https://www.youtube.com/watch?v=Yd9q1Y7Ou7g`: resolved as YouTube.
   - path `/Users/x/movie.mkv`: deactivates, with no resolve.
   - an active Twitch source plus a different Twitch path: deactivates (today's foreign-file rule).
7. Source guard: no `utils.prompt(` or `utils.ask(` remains in `global.js`, `src/` or `ui/`.

**Owns:** `global.js`, `src/player.js`, `ui/sidebar.html`, `ui/sidebar.js`, `ui/sidebar.css`, new `ui/open.html`, `ui/open.js` and `ui/open.css`, `tests/support/iina-shim.js` (adding a standaloneWindow double), and new tests. **Not** `main.js`, `qa/` or `scripts/` (A2 owns them).

---

## A2 — QA mode on the dev identity (#33)

**Why.** Tonight's native testing works by keyboard and by `cliclick` on pixels. The plugin already carries `config.qa` hooks: a `qa-open` handler in `global.js`, and QA branches in `main.js`, `src/player.js` and the UI. But `scripts/build.py` always writes `"qa":false` and never packages `qa/qa-harness.js`, and `main.js` requires `./qa-harness.js`. The `qa/` scripts target the retired `local.iina.streams.qa` identity.

**Design.**
- QA is a flag on **dev builds only**: `npm run dev:deploy -- --qa`, or `npm run qa:deploy`. It writes `config.qa` enabled and packages the harness where `main.js` requires it.
- Release and beta builds never contain it. The existing asserts in `tests/test_build_current.py` stay, and gain a dev-with-QA case.
- `qa/control.py` drives the **dev** identity's data folder. Commands:
  - `open <url>`;
  - `click <selector>`, run inside the sidebar or overlay through the existing QA hooks;
  - `state`, returning the player and chat state as JSON;
  - `wait <condition>`.
- Each command is a request file, and the harness writes a response file. Retired-identity paths and `iina-streams-candidates` paths are removed.
- Never prints tokens, Keychain values or device codes. `state` redacts them.

**Tests:**
1. Build: a dev build with QA has `config.qa` enabled, and the archive contains the harness at the path `main.js` requires. A dev build without QA, a beta build and a stable build have neither.
2. Harness, under the shim: an `open` request leads to `app.postMessage('qa-open',{url})`, or the equivalent existing hook, and a response file. An unknown command gets an error response, not a throw. `state` contains no field named or shaped like a token.
3. `qa/control.py`: it resolves the dev data path, writes a request, and reads the response with a timeout. No retired identity strings remain in `qa/`, as a source guard.

**Owns:** `main.js`, `qa/**`, `scripts/build.py`, `scripts/dev*.py` (if any), `package.json` (scripts only), `tests/test_build_current.py`, new `tests/qa-*.test.js` and `tests/test_qa_*.py`, and the QA section of `docs/RELEASE.md`. **Not** `global.js`, `src/` or `ui/` (A1 owns them). If the harness needs a hook in those files, report it rather than editing.

---

## A3 — Recorded Twitch GraphQL fixtures and property tests for VOD acquisition (#17)

**Owns:** `helpers/acquire.py` (only for a demonstrated bug), `src/embedded-helpers.js` (regenerate only), `tests/fixtures/twitch-gql/**`, and new `tests/test_acquire_property.py`.

**Tests:**
- Record sanitized real comment pages for four cases: bursty, quiet, end of VOD, and a long VOD (9 h or more). Strip user IDs other than the display name, and strip any token, signed URL or IP.
- Replay them through `twitch_acquire` with the runner faked to serve fixtures:
  - acquisition terminates;
  - offsets never decrease;
  - well-formed pages never produce `INVALID_ARCHIVE`;
  - the case of an empty page that says more pages follow is decided and pinned: retry once, then end with a diagnostic.
- Property tests with `random` seeded (no new dependency): generated page sequences preserve those properties.

---

## A4 — Spike: live latency and the DVR window (#16, #31, #51 part 1)

Measurement only, with no product code. Use `streamlink`, `mpv` (Homebrew, headless: `--no-video --ao=null`), `ffprobe`, and anonymous Twitch IRC (`justinfan` nick) on one or two big live channels, for about 10 minutes each. Measure:
- **Video behind live:** wall clock minus `#EXT-X-PROGRAM-DATE-TIME` at the playhead, from mpv `time-pos` against the playlist.
- **Chat lead:** `tmi-sent-ts` against video time.
- **Low latency:** whether Twitch's low-latency playlist (`#EXT-X-TWITCH-PREFETCH`, `low_latency`) is offered and what it changes.
- **DVR window:** how far back the live playlist reaches, and whether a VOD exists while the channel is live (for #51 "go further back").
- **What Go Live needs:** seek to the edge, or reload.

Write `docs/design/SPIKE-16-31-LIVE-LATENCY-2026-11-22.md` with numbers, commands and limits, plus scripts in `qa/spikes/`. Never print IPs, tokens or signed URLs; mask them.
