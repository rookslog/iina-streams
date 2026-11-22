# Overnight wave B — test designs (lead, 2026-11-22)

**Status:** lead designs, written under `.kickoff.json`. Same pipeline as [wave A](OVERNIGHT-WAVE-A-2026-11-22.md): Codex writes the tests, an implementer makes them pass, and the lead reviews and merges.

- **B1 and B2** touch `src/player.js`, `global.js` and `ui/`, so they start only after A1 merges, one at a time.
- **B5** starts in new files and can run alongside.
- Chat timing (#2, #28) and Go Live (#51) get their designs once the A4 latency spike reports.

---

## B1 — Emotes in chat (#34, part 2)

Integration points are mapped in [EMOTES-INTEGRATION-2026-11-22.md](EMOTES-INTEGRATION-2026-11-22.md). The renderer (`ui/chat-content.js`) is merged and tested; nothing uses it yet.

**Design.**
- `safeMessage` in `src/player.js` keeps `emotes` (clipped to 2048) and `badges` (clipped to 1024) for live messages.
- Both views render the text through `StreamsChatContent.twitch.segments` and `renderSegments`, behind a provider-neutral `segmentsFor(message)`.
- CSP: the sidebar's `img-src 'none'` becomes `img-src https://static-cdn.jtvnw.net`, and the overlay gains the same `img-src`.
- Add `.emote` CSS (vertical alignment and spacing; fixed size via attributes).
- `docs/PRIVACY.md` names `static-cdn.jtvnw.net` (emote images are fetched from Twitch's CDN).
- Badges: carried through but not rendered. Rendering needs the badge API and is a follow-up.

**Tests:**
1. `safeMessage` keeps `emotes` and `badges` for a live message, and clips them. Replay messages without them are unchanged.
2. Sidebar and overlay, in a minimal DOM: a message `Kappa hi` with `emotes: '25:0-4'` renders an `img.emote` (`alt` and `title` `Kappa`, `src` on `static-cdn.jtvnw.net`, fixed `width`/`height`) followed by the text ` hi`. A message with no emotes renders text only. No `innerHTML` assignment is used for message text (source guard on both files).
3. Both HTML files' CSP contains `img-src https://static-cdn.jtvnw.net` and no wider `img-src`. The overlay still has its `connect-src` (the existing assertion stays).
4. The QA text digest (`renderedMessages`) still includes emote names, using `alt`.

**Owns:** `src/player.js` (`safeMessage` only), `ui/sidebar.*`, `ui/overlay.*`, `docs/PRIVACY.md`, and new tests.

**Native check (lead):** with QA mode, emote images load in the IINA WebView. The note above lists this as unchecked.

---

## B2 — Surface swallowed errors (#24)

**Design.** Each consequential `catch(_){}` becomes either an explicit state or a diagnostic log line. Logs never contain tokens, Keychain values or device codes.
- Corrupt Keychain JSON in `global.js` gets a distinct `auth` phase or diagnostic, not a silent "signed out". Saved credentials are left untouched.
- A settings parse failure in `src/io.js` is logged and keeps a backup of the unreadable file (`settings.json.corrupt-<ts>`) before the defaults apply. Preferences aren't silently erased.
- Helper-cancel errors in `src/player.js` are logged.

**Tests:**
- corrupt Keychain JSON leads to the new diagnostic or state, with no write over the saved item;
- corrupt settings get backed up, then the defaults load, and the backup holds the original bytes;
- each changed catch logs without secrets: feed a value shaped like a token and assert the log doesn't contain it;
- a source scan lists the remaining `catch(_){}` blocks, and each must carry a one-line justification comment.

**Owns:** `global.js`, `src/io.js`, `src/player.js` (catch sites only), and new tests.

---

## B5 — Works out of the box: Twitch playback in JS (#36, step 1)

Spike #37 ([SPIKE-37-OUT-OF-THE-BOX-2026-11-22.md](SPIKE-37-OUT-OF-THE-BOX-2026-11-22.md)) measured it: resolving Twitch playback in JS (GQL `PlaybackAccessToken` plus usher) gave the same variants as Streamlink in 182–256 ms, against about 1.2 s. Step 1 builds the resolver as **new files**, with no wiring. Step 2, wiring it in behind a fallback to the Python helper, starts after A1 merges.

**Design.**
- `src/twitch-playback.js` resolves a channel (live) or a VOD id to `{variants:[{name,resolution,bandwidth,fps,url}], live}`, through an injected `http` (`iina.http` in production).
- IINA host rule: `iina.http` casts params and headers to `[String:String]`, and one non-string value drops the whole map. So every param and header must be a string.
- Never log tokens, signatures or usher URLs: logs mask the query string.
- Errors map to the codes the UI already knows: offline, not found, restricted (subscriber-only or geo), network, malformed.

**Tests,** using sanitized fixtures written by hand from the spike's observed shapes, with no real token or signature:
- the access-token request body and headers, all strings;
- usher URL construction;
- master playlist parsing into variants, for source, 1080p60, 720p60, 480p, 360p, 160p and audio_only;
- the error mapping, case by case;
- no secret in any log line;
- a 2 s timeout becomes the network error.

**Owns:** new `src/twitch-playback.js`, new `tests/twitch-playback.test.js` and fixtures. Nothing else.

---

## B6 — Twitch API client for Following and recent VODs (#30, #32, step 1)

**Design.** A new file `src/twitch-helix.js`, using the user's existing login (Bearer token plus the Client-ID it was issued to) through an injected `http`. Every header and param is a string. Functions:
- `followedLive({userID})` calls `GET https://api.twitch.tv/helix/streams/followed?user_id=…&first=100` and follows `pagination.cursor`. It returns `[{login, name, title, game, viewers, startedAt, thumbnail}]`, sorted by viewers.
- `recentVODs({login})` calls `GET /helix/users?login=…` for the id, then `GET /helix/videos?user_id=…&type=archive&first=10`. It returns `[{id, title, createdAt, duration, url}]`. `url` is `https://www.twitch.tv/videos/<id>`, which `Sources.parse` accepts.

Errors:
- a 401 whose message names a missing scope becomes `NEEDS_PERMISSION`. The followed endpoint needs `user:read:follows`; today's login has only `chat:read`.
- any other 401 becomes `SIGNED_OUT`;
- a 429 becomes `RATE_LIMITED`, carrying `Ratelimit-Reset`;
- a network failure becomes `NETWORK`;
- an unexpected shape becomes `MALFORMED`.

Never log the token.

**Tests,** with hand-written fixtures shaped like Twitch's documented responses and labelled as documented, not recorded:
- request URL, headers and params, all strings, with `Authorization: Bearer <token>` and `Client-Id`;
- pagination across two pages;
- the sort order;
- the mapping for an empty list;
- `recentVODs` builds its URLs with `Sources.parse` and checks they round-trip;
- each error mapping;
- no log line contains the token.

**Owns:** new `src/twitch-helix.js`, new `tests/twitch-helix.test.js` and `tests/fixtures/twitch-helix/**`. Nothing else.

---

## C1 — Live latency estimator (#2, #16, #51; module only)

From [SPIKE-16-31-LIVE-LATENCY-2026-11-22.md](SPIKE-16-31-LIVE-LATENCY-2026-11-22.md), section 6: observed on recorded rows from two channels, with a maximum error of 0.02 s for a 30 s window.

**Design.** A new pure module, `src/live-latency.js`, with no IINA calls. The caller feeds samples and gets estimates.

Functions:
- `createEstimator({windowSeconds:30, minSamples:18})` returns `{addSample, offset, behindLive, videoWallClock, reset}`.
  - `addSample({now, newestSegmentEnd, rawCacheEnd})` takes seconds. `newestSegmentEnd` is the PDT of the newest playlist segment's end, as epoch seconds. `rawCacheEnd` is mpv's cache end on the raw timeline (`time-pos + demuxer-start-time` domain).
  - `offset()` returns `c_hat`, the median of `newestSegmentEnd − rawCacheEnd` over the window, or `null` while uncertain: fewer than `minSamples`, or no value within ±0.5 s of the median holding more than half the window.
  - `videoWallClock(rawTimePos)` is `rawTimePos + c_hat`, or `null`.
  - `behindLive({now, rawTimePos})` is `now − videoWallClock(rawTimePos)`, or `null`.
  - **Reload detection:** a `rawCacheEnd` that drops by more than 10 s from the previous sample resets the window.
- `goLiveTarget({cacheEnd})` returns `cacheEnd − 2` (time-pos domain). The spike found a seek at or past the cache end is a silent no-op, and `−0.5` stalls.
- `isDue({sentAt, videoWallClock, offsetSeconds})`: a chat message (`tmi-sent-ts` in epoch seconds) is due once `videoWallClock ≥ sentAt + offsetSeconds`.

**Tests**, using synthetic sample streams:
- **Constant offset:** a constant offset with 30% of samples off by ±2 s gives the exact median.
- **Not enough samples:** 17 samples give `null`.
- **Split window:** a window split 50/50 between two values gives `null` (uncertain).
- **Reload:** the window resets and goes uncertain, then recovers after 18 samples.
- **Calculations:** `behindLive` and `videoWallClock` arithmetic; `goLiveTarget`; `isDue` at the boundary and with an offset.
- **Window:** only the last 30 s count.

**Owns:** new `src/live-latency.js` and `tests/live-latency.test.js`.

---

## B2a — Surface swallowed errors outside the player (#24, part 1)

B2 is split: `src/player.js` is held by the A1b fix (#35), so its catch sites wait for B2b. This part covers `src/auth.js`, `global.js` and `src/io.js`.

**Design.**
- **Unreadable Keychain item.** In `src/auth.js`, `connect()` and `forget()` read the saved grant. If the item is a non-empty string that isn't JSON, they call an optional `diagnostic(code)` option with `'keychain-unreadable'`. The behavior is otherwise unchanged:
  - `connect` goes on to a new device-code sign-in;
  - `forget` reports the grant as unknown, as today;
  - the item isn't written until a new grant saves.

  `global.js` passes `diagnostic: code => gLog('auth-diagnostic', {code})`.
- **Other unreadable files in `global.js`.** The catch sites that parse the client file or the saved login, in auth connect and probe, log `gLog('auth-diagnostic', {code})` with `'client-file-unreadable'` or `'saved-login-unreadable'`.
- **Unreadable `settings.json` in `src/io.js`.** If `@data/settings.json` exists but isn't JSON, `readSettings()` first writes its exact text to `@data/settings.json.corrupt-<Date.now()>`, logs `host.console.log('Streams: settings.json was unreadable; kept a copy and used defaults')` without the content, and returns `{}`. A later `saveSettings` can't destroy the user's only copy.
- **Justified catches.** Every remaining catch that swallows an error in these three files carries a short comment on the same line or the line above saying why it's safe:
  - `postChild`'s stringify;
  - the `gLog` diagnostic write;
  - the embedded-helpers require;
  - helper marker cleanup;
  - `cancelHelpers`;
  - `deleteDataPath`.
- **Never log secrets.** No diagnostic or log contains the raw Keychain text, a token or file content.

**Tests** (new files only):
1. `auth`: a stored value `'{not json'` calls `diagnostic('keychain-unreadable')` once from `connect`, goes on to the device request, and makes no write before a grant. The same stored value in `forget` calls the diagnostic. A missing item (`''` or `null`) does not.
2. `global`, under the shim, with a corrupt saved-login Keychain value and a corrupt client file: an auth probe and a connect write `auth-diagnostic` entries with these codes. With a token-shaped string inside the corrupt value (`{"access_token":"abcd1234abcd1234abcd` with no closing brace), no diagnostic file or console line contains `abcd1234`. Use QA or beta config so `gLog` writes.
3. `io`: a corrupt `settings.json` gives `{}`, a backup file whose text equals the original, and a console line without the content. A valid file is read as before, with no backup. A missing file gives `{}` and no backup.
4. Source scan over `src/auth.js`, `global.js` and `src/io.js`: every `catch(_){` whose body is empty or only `return`s has a comment (`//` or `/* */`) on the same line or the line above.

**Owns:** `src/auth.js`, `global.js`, `src/io.js`, and new `tests/b2a-*.test.js`. Not `src/player.js` or `ui/`.

---

## C2a — Chat timing policy and live clock (#2, #28; new modules only)

Wiring into `src/player.js` and the sidebar, C2b, waits for A1b. This part builds two pure modules on C1's estimator.

**Domain note.** The estimator only needs `cacheEnd` and `timePos` on the same timeline. Its offset absorbs any shift between them, and a reload resets it. In IINA (`rebase-start-time=yes`), `demuxer-cache-state.cache-end` and `time-pos` share that timeline: the spike's `seek <cache-end − 2> absolute` landed in this mode (§4). That rests on the spike's result, not on an IINA run. So C2a uses `time-pos` and `cache-end` directly, with no `demuxer-start-time`.

### `src/chat-timing.js`

`createChatTiming({mode, manualDelay, fineTune})`:
- `mode` is `'auto' | 'manual' | 'live'`, default `'auto'`.
- `manualDelay` is clamped to 0–120 s, default 0.
- `fineTune` is clamped to −10…+10 s, default 0.

Values are rounded to 0.5 s, and anything not finite falls back to the default.

Methods:
- **`effective(behindLive)`** returns `{delay, state}`:
  - `live`: delay 0, state `'live'`.
  - `manual`: delay `manualDelay`, state `'manual'`.
  - `auto` with a finite `behindLive`: delay `max(0, behindLive + fineTune)`, state `'auto'`.
  - `auto` with `null`: delay `manualDelay`, state `'auto-uncertain'`. Never a false "synced".
- **`reveal(messages, nowMs, delaySeconds)`** returns `{visible, nextDueMs}`:
  - A message, `{id, timestampMs, …}`, is visible if it was revealed before, or once `timestampMs + delay·1000 ≤ nowMs`.
  - Order is kept.
  - Once revealed, a message stays visible even if the delay grows, as after a pause. Nothing is un-shown.
  - `nextDueMs` is the earliest pending due time, or `null`.
  - The revealed-id memory is pruned to ids still present in `messages`.
  - Messages without `timestampMs` (notices) are visible at once.
- **`calibrate(message, nowMs)`** (#28) sets `manualDelay` to the message's age, `(nowMs − timestampMs)/1000`, clamped and rounded. It sets `mode` to `'manual'` and returns the settings.
- **`settings()` / `update(partial)`** return and change the plain persisted object `{mode, manualDelay, fineTune}`.

### `src/live-clock.js`

`createLiveClock({http, readPlayer, estimator, setTimer, clearTimer, now, intervalMs = 2000, staleMs = 10000, log})`:
- **`start(mediaURL)`**: every `intervalMs`, it fetches the media playlist with `http.get(mediaURL, {headers:{}, params:{}})`, using string maps only.
  - It parses `newestSegmentEnd` = the last regular segment's `#EXT-X-PROGRAM-DATE-TIME` plus its `#EXTINF`, in epoch seconds. `#EXT-X-TWITCH-PREFETCH` lines are ignored.
  - It reads `{timePos, cacheEnd}` from `readPlayer()`.
  - If all are finite, it calls `estimator.addSample({now: now()/1000, newestSegmentEnd, rawCacheEnd: cacheEnd})`.
  - It keeps the last `timePos` and the time of the last good sample.
- **`behindLive()`** returns `null` if there's been no good sample within `staleMs`; otherwise `estimator.behindLive({now: now()/1000, rawTimePos: timePos})`.
- **`goLiveTarget()`** returns the last `cacheEnd − 2`, or `null`.
- **`stop()`** clears the timer; it's idempotent. A second `start` replaces the first, and its old in-flight response is ignored (generation check).
- **Errors:** a fetch error or malformed text adds no sample. `log` receives only a code (`'playlist-fetch'`, `'playlist-malformed'`), **never the URL** (it's signed).
- **`parseNewestSegmentEnd(text)`** is exported for tests. It returns epoch seconds or `null`.

### Tests (synthetic playlists; no real URLs or signatures)

`chat-timing`:
- each mode's `effective`;
- `auto` with `null` gives `auto-uncertain` and the manual delay;
- `fineTune` with a negative result clamps at 0;
- `reveal`: the due boundary is inclusive; the order is kept; a revealed message stays visible after the delay grows; `nextDueMs` is correct; notices show at once; pruning works;
- `calibrate` with rounding and clamping (a 200 s-old message gives 120);
- the clamp and round rules in the constructor and `update`.

`live-clock`, with a fake `http`, timers and clock:
- the parser: PDT plus EXTINF of the last regular segment; prefetch lines ignored; the 12-hour form of PDT with a `Z` or `+00:00` zone; no PDT gives `null`;
- `start` → tick → `addSample` with the right numbers;
- a fetch error or malformed text adds no sample and logs a code without the URL (assert that the URL substring is absent from every log argument);
- stale after `staleMs` gives `null`;
- `stop` prevents further fetches;
- a restart ignores the old response;
- every header and param value is a string.

**Owns:** new `src/chat-timing.js`, `src/live-clock.js`, `tests/chat-timing.test.js` and `tests/live-clock.test.js`. The base is beta with C1 merged. Until then, tests inject a fake estimator, so they don't need `src/live-latency.js`.

---

## C2b + C3 — Chat timing and Go Live in the player (#2, #28, #51, #16)

Starts after A1b merges, since it owns `src/player.js`. It builds on C1 and C2a.

**Player.**
- For `twitch-live`, after `file-loaded`, create one `liveClock` with `readPlayer: () => ({timePos: mpv.getNumber('time-pos'), cacheEnd: <demuxer-cache-state.cache-end>})` and the resolved media URL.
- Restart it on a quality change, a reload or a new URL. Stop it on close, deactivation or a source change.
- Live messages pass through `chatTiming.reveal(messages, now, effective(liveClock.behindLive()).delay)` before `send()`. A timer at `nextDueMs` re-sends.
- The settings `{mode, manualDelay, fineTune}` persist with `saveSetting({chatTiming})`.
- Replay (VOD) chat is unaffected: it keeps its own offset.

**Sidebar (minimize-ui-text).**
- **Live pill** in the header for `twitch-live`. It's red when `behindLive ≤ 5 s`. Otherwise it's grey and reads `−N s`, and clicking it does Go Live. It's hidden while uncertain.
- **Chat timing** row in Chat settings: a segmented `Auto | Manual | Live` control and a delay stepper. In Manual, the stepper sets `manualDelay`; in Auto, it sets `fineTune`. Auto-uncertain shows a hollow-dot signifier with a tooltip; Manual is still selectable.
- **#28:** in Manual, ⌥-clicking a chat message calibrates to it. Briefly highlight the message; no text.

**Go Live.** `liveClock.goLiveTarget()`.
- If it's finite and more than 1 s ahead of `time-pos`: `mpv.command('seek', [String(target), 'absolute'])`.
- Otherwise, reload the current quality, which is the fallback (spike §4: seeking at or past the cache end is a no-op).

**Amended at merge (C3 review, 2026-11-22):**
- **minSamples:** the player uses `minSamples: 10`. One sample per 2 s poll fits at most 16 samples in a 30 s window, so 18 could never be reached. 10 samples covers the same ~18 s of history as the spike's 18 one-second rows.
- **Go Live key:** `Ctrl+Meta+g`. `Ctrl+Meta+l` is IINA 1.5.1's Log Viewer, and IINA doesn't reject a plugin key that clashes with the main menu.
- **`behindLive()`** reads the current playhead, not the one from the last sample.
- **Reload:** a Go Live reload's end-file isn't read as a stop.

**Menu (five-item cap).** The top level becomes **Show Streams**, **Go Live** (`Ctrl+Meta+l`; the implementer checks for conflicts with `iina.menu`/`getAllKeyBindings` and reports them), and a **Chat ▸** submenu (Import Chat Archive…, Turn Chat Off, In Sidebar, Over Video, Beside Video). This is verified against IINA 1.5.1's `menu.item` submenu API; cite it in the shim.

**Tests (shim).**
- the clock starts and stops per the lifecycle above;
- a message is held until due, in Manual 10 s with fake timers;
- Live mode shows it at once;
- Auto-uncertain uses the manual delay;
- the pill state is computed from `behindLive`;
- Go Live seeks when the target is ahead, else reloads;
- the settings persist;
- replay is unaffected;
- the menu structure;
- no URL in any log.

**Native (lead).** On a public live channel: watch the pill and Auto delay, compare chat to the video by eye, pause 30 s, resume, then Go Live.

---

## D1 — Chat beside the video (#47, #52), per D-028

Starts after A1b merges. D-028's native gate passed (spike §7).

**Design.**
- `view.presentation` accepts `'beside'`. `view.columnWidth` defaults to 320 and is clamped to 240–480 px.
- **Entering `beside`** with chat on:
  - the overlay renders a **docked column**: full height, at the right edge, opaque in the theme, using the existing chat rendering. Its left edge is a drag handle for `columnWidth`.
  - the player sets `video-margin-ratio-right` to `columnWidth / windowWidth`.
  - In windowed mode, the window widens once by `columnWidth` (`core.window.frame`, clamped to the screen's visible frame), and the player remembers the widened width.
- **Window changes:** recompute the ratio on IINA's window-resize and size-adjusted events. The implementer verifies the event names in IINA v1.5.1 source and cites them.
- **Leaving** (another presentation, chat off, deactivation or window close): set the margin to 0. If the window is still at the widened width, shrink it back.
- **Fullscreen:** margin only, no frame change.
- **#52:** a small overlay cluster at the column's top: Go Live (twitch-live only, using C3's action) and Hide Chat (→ chat off). Icons only, with `aria-label`s.

**Tests (shim).**
- `viewSettings` accepts `'beside'` and clamps `columnWidth`;
- entering sets the margin ratio, and a resize event recomputes it;
- leaving, chat off, deactivation and close each reset it to 0;
- widen and restore happen only when the width is unchanged;
- fullscreen sends no frame change;
- the overlay receives the `column` layout and width;
- the cluster's messages route to Go Live and chat off.

**Native (lead):** the spike's §5 steps 3, 7 and 8 with the real column, plus a drag-resize of the column and the window.

---

## B5b — Twitch playback in JS, wired in with the helper as fallback (#36, step 2)

**Design.**

New `src/resolve.js`: `createResolver({resolveTwitch, http, helperResolve, log, now})` returns `resolve(source, quality)`, which has the same contract as today's `services.resolve`: `{ok, source, title, live, duration, quality, formats, mediaURL, headers?}` or `{ok:false, error:{code, message}}`.

Routing:
- **Twitch live or VOD:** call `resolveTwitch({kind, login|id}, {http, log})`.
- **Definitive answers** (`OFFLINE`, `NOT_FOUND`, `RESTRICTED`): return `{ok:false}` with the same error codes and messages the helper uses for these cases (read them from `helpers/media.py`). **Don't** fall back.
- **Anything else** (`NETWORK`, `MALFORMED`, a thrown error, a timeout): call `helperResolve(source, quality)` and return its result. Record `log('twitch-js-fallback', code)` with the code only.
- **YouTube and local** go straight to `helperResolve`.

**Formats and quality.** Variants map to the helper's ids and labels, so saved quality choices carry over.
- An id is `<height>p` plus the rounded fps when fps ≥ 50 (Streamlink's Twitch names: `1080p60`, `720p60`, `480p`, `360p`, `160p`). `chunked` (the source) takes its id from its RESOLUTION and FRAME-RATE. `audio_only` has the label `Audio only`.
- `formats` is `[AUTO, …]` ordered like `_public_formats`.
- Selection matches `_choose`: for `auto720`, the highest variant at 720p or below, else the lowest. An explicit id that's missing gives `QUALITY_UNAVAILABLE`, as in the helper.

**Title.** `resolveTwitch` gains an optional title lookup in the same GQL request: `user(login){broadcastSettings{title}}` for live, `video(id){title}` for a VOD. A missing title or a title error falls back to `"<id> — Twitch"` and never fails playback. Apply the helper's `_title` cleanup: strip URLs and control characters, cut to 240 characters.

**Other fields.** `live` comes from the kind; `duration` is `null`; there are no `headers` (the JS path sends none).

**Wiring.** In `main.js`, set `services.resolve = createResolver({…, helperResolve: services.resolve.bind(services)})`, using `iina.http` and the existing log.

**Never log** URLs, tokens or signatures.

**Tests** (fake `http` and `helperResolve`, with fixtures from `tests/fixtures/twitch-playback/`, adding a title response):
- live and VOD success give the helper-shaped result, with ids `1080p60`, `720p60`, `480p` and `audio_only`;
- `auto720` selection, and the explicit and missing-quality cases;
- each definitive error, with no helper call;
- `NETWORK` or `MALFORMED` → the helper is called once with the same arguments and its result is returned;
- YouTube goes to the helper only;
- the title: present, missing, and cleaned;
- no log argument contains the fixture's fake signature or token;
- `main.js` wiring, under the shim: `services.resolve` is the wrapper.

**Owns:** new `src/resolve.js`, `src/twitch-playback.js` (title lookup only), `main.js` (the wiring line only), new `tests/resolve.test.js`, and fixtures. Not `src/io.js` (B2a holds it) or `src/player.js` (A1b holds it).

**Native (lead):** a live channel and a VOD open with no Streamlink process (`pgrep streamlink` is empty during the resolve), and quality changes work.

---

## C3b — Live chat buffer that survives a delay (#2)

**Why.** Observed natively (09:37, #2 comment): paused 70 s in Auto, the overlay chat went empty. `ui/overlay-live.js` keeps the newest 150 messages (`StreamsLiveHistory.reduce(…, 150)`) and posts them whole, and the player filters them through `reveal`. On a busy channel all 150 are newer than the delayed playhead, so nothing shows. The older ones are gone, which also leaves a gap after resuming.

**Design.**
- **Overlay → player bridge.** `live-messages` keeps `{session, messages}` (the newest 150, as today) and adds `removed: [id…]`, the ids that this batch's `clear-message` or `clear-user` events took out of history, and `clearedAll: true` when a `clear-all` arrived. Moderation must never be lost by the player's buffering.
- **Player buffer.** `liveInbox` becomes an id-keyed union, in arrival order, of every message received this session:
  - apply `removed` and `clearedAll` first;
  - keep everything not yet revealed, capped at 3000 (drop the oldest pending past the cap);
  - keep the newest 150 revealed messages.

  `send()` shows the newest 150 visible messages. A session change or chat off clears the buffer.
- **No messages are lost** between posts as long as fewer than 150 arrive between two batches. That's accepted, and stated in a code comment.
- **Unchanged:** chat-timing rules, replay and IRC itself.

**Tests.**
- With a delay of 60 s and 400 messages arriving over 60 s in posts of the newest 150, all 400 are still buffered, and they reveal in order as the clock advances.
- Revealed messages stay visible while newer ones are pending (the panel never goes empty after it has shown messages).
- `clear-message`, `clear-user` and `clear-all` remove messages from the player buffer, both pending and revealed, through the new `removed` and `clearedAll` fields. A message that only fell out of the overlay's 150 window is **not** removed.
- The pending cap at 3000 drops the oldest pending messages.
- The session-change reset.

**Owns:** `ui/overlay-live.js`, `ui/live-history.js` (only if the reducer must report removed ids), `src/player.js` (`onLiveMessages` and the inbox only), and new `tests/c3b-*.test.js`.

---

## A2 — Adopted windows reach global through a mailbox (#56), per D-029

> **SUPERSEDED 2026-11-22 10:45 (D-029 SUPERSEDED in `docs/DECISIONS.md`).** The root cause below is wrong. Adopted children do get a link to global; only a core created during global's own load lacks it, and our synchronous `menu.forceUpdate()` causes that. The fix is in the v0.5.5 release review r1 #5. Kept for the record.

**Why.**
- **Root cause.** A window IINA opened itself, and Streams adopted (#35), can't message global: `JavascriptAPIGlobalChild.postMessage` calls `parentAPI?…`, and only `createPlayerInstance` sets `parentAPI` (IINA v1.5.1 `JavascriptAPIGlobal.swift` L82–87, L129–131). Every child→global message is a silent no-op: `open`, `auth-connect`, `auth-probe`, `auth-disconnect`, `auth-forget` and `player-closed`. Observed natively: global's `player-open` trace stayed empty (#56 comment, 09:51).
- **The reverse works.** Global's `postMessage(<bare-number label>, …)` reached the adopted window. Observed natively: the QA probe in `qa-label-probe.json` read `"0"` at 09:59. Source: L105–111, and `PlayerCore.swift` L67–81 for the labels.
- **Global can safely post to any bare label.** Every IINA core has this plugin's instance whenever global runs: cores load plugins at creation (`PlayerCore.swift` L74–81), and enabling a plugin reloads it into every core (`JavascriptPlugin.swift` L54–64 → `reloadPluginForAll`). So L108's force-unwrap can't fail.
- **The child can't name itself.** `getLabel()` returns `userLabel`, which only `createPlayerInstance` sets (L71–73, L125–127). An adopted child's label must come from global.

**Design.**
- **Detection:** a player is adopted when `iina.global.getLabel()` is empty. `src/player.js:100` already relies on this.
- **New module `src/adopted-bridge.js`.** `createBridge({global, file, parse, now, random})` returns a `global`-shaped object: `{getLabel, postMessage, onMessage}`. `main.js` passes it to `start()` **only for adopted players**, through a host whose `global` is the bridge. `src/player.js` is unchanged.
  - `onMessage(name, cb)` registers with the native child API and keeps a local copy, so the bridge can deliver locally.
  - **`postMessage('open', {input})`:** if `parse(input)` (the same `Sources.parse` global uses) is null, or the input is blank, deliver `open-error` locally on the next turn and write nothing. If it's valid, file an `open` request with the input.
  - **Every other name** (`auth-connect`, `auth-probe`, `auth-disconnect`, `auth-forget`, `player-closed`): file a request. Data is copied only for `auth-connect`, which carries `{}`-shaped options and no secrets. `auth-*` payloads must not contain tokens; tests assert this.
  - **Request file:** `@data/bridge-<now>-<random>.json`, flat in `@data` (IINA's `file.write` doesn't create directories, and the file API has no mkdir: `JavascriptAPIFile.swift`, `write` uses `String.write(toFile:)`). It contains `{v:1, nonce, label|null, name, data}`. There is one file per request, never a shared read-modify-write.
  - **Label handshake:** until the child knows its label, requests carry `label:null`, and the bridge keeps them pending in memory while listening for `bridge-hello {nonce, label}`. When a hello carries one of its pending nonces, it adopts that label, re-files the pending requests with it, and sends all later requests with it. The label is kept for the child's lifetime. Pending requests older than 30 s are dropped.
- **Global, `global.js`:** every 2000 ms, `file.list('@data/')` and take only names matching `^bridge-[0-9]{13}-[A-Za-z0-9]{8,32}\.json$`. For each, oldest first by the time in the name: read it, delete it, then validate (`v`, a string `name` from the allow-list, a 1–9 digit `label` or null, a nonce of 8–64 `[A-Za-z0-9]`, and an age under 30 s, else drop).
  - **`label` null:** post `bridge-hello {nonce, label:String(n)}` to labels `"0"`…`"31"`, and drop the request. When the child receives a hello carrying its nonce, it re-files every pending request (same nonce) with its label.
  - **`label` known:** dispatch to the same handlers the native path uses, with `sender = label`.
    - `targetID` stays managed-only.
    - A parallel `adopted` set, plus `sessions` keyed by label string, gets the same fences: `postChild` for an adopted label uses `app.postMessage(label, name, wire)`. `auth-ready` goes only to a label in `audience` for the current session, as for managed players.
    - `open` → `openInput(input)`. `postOpenError` is not needed, because the child already validated.
  - **Staleness:** `player-closed` removes the label from `adopted`, `audience` and `sessions`. IINA reuses idle cores, so a later `auth-connect` from the same label starts a new session (`nextSession`). An adopted label with no request for 30 min is dropped from `audience`.
  - **Polling cost:** one `file.list('@data/')` every 2 s, and reads only for matching names. This is the one timer global starts at load. It amends the rule pinned by `tests/global.test.js` ("global loading performs no … timer work"): an adopted child has no other channel to global (D-029 amendment).
- **Security:**
  - Tokens and device codes travel only global→child in memory (`postMessage`), never through `@data/bridge`.
  - A request file holds only the message name, the nonce, the label, and for `open` the user's typed input, which is deleted on read.
  - Never log input text, tokens or signed URLs.

**Tests.**
- **Bridge (pure):**
  - adopted detection;
  - invalid and blank `open` deliver a local `open-error` and write no file;
  - valid `open` writes one request;
  - each other name writes one request per call, as distinct files;
  - `bridge-hello` with a matching nonce sets the label, and a foreign nonce is ignored;
  - later requests carry the label;
  - no request file ever contains a token-shaped string, even when called with an `auth-ready`-like payload;
  - `onMessage` passes through to the native API.
- **Global (shim):**
  - a label-null request triggers hellos to 0–31 and is then dropped; the same nonce re-filed with a label is processed;
  - a label-known `auth-connect` adds the label to `audience` and posts `auth-state` by **string** label;
  - `auth-ready` reaches only a label that connected in the current session;
  - `player-closed` clears the label;
  - an `open` request opens a managed player;
  - malformed, too-old or unknown-name requests are dropped and their files deleted;
  - files are processed oldest first and deleted after reading;
  - global's load schedules exactly one timer (the 2 s poll), with no reads while no `bridge-*` file exists; non-matching `@data` files are never read or deleted;
  - managed players are unchanged (the existing tests stay green).
- **`main.js`:** an adopted start gets the bridge as `host.global`, and a managed start gets the native `iina.global`.

**Owns:** `src/adopted-bridge.js` (new), `global.js`, `main.js`, new `tests/a2-*.test.js`. Not `src/player.js`.

**Native (lead):**
- in an adopted window, invalid input turns the + field red at once;
- valid input opens a managed window;
- with a saved login, turning chat on connects live chat;
- sign-in from an adopted window shows the device code in that window;
- closing the window, then opening another adopted window, works.

---

## B6b — Offline channel offers its recent broadcasts (#32), per D-030

**Why.** Typing a channel that isn't live gives a dead end today. `src/resolve.js` maps `OFFLINE` to the helper's generic `UNAVAILABLE`. Real-source check (lead, 10:10, signed out, public web Client-ID as in `src/twitch-playback.js`): GQL `user(login){videos(first:N, type:ARCHIVE, sort:TIME){edges{node{id title createdAt lengthSeconds}}}}` returned 5 archives for a live channel, and `user: null` for an unknown login. No sign-in is needed, so this works in managed and adopted windows alike, and needs no global round trip.

**Design.**
- **New `src/twitch-vods.js`:** `recentArchives({login}, {http, log, limit = 10})` makes one GQL POST with a plain-object body `{query}`, as for the title lookup (`iina.http` casts data to `[String:Any]`). It returns `{ok:true, vods:[{id, title, createdAt, lengthSeconds, url}]}`, where `url` is `https://www.twitch.tv/videos/<id>` and must round-trip through `Sources.parse` to kind `twitch-vod`. Failures:
  - `{ok:false, code:'NOT_FOUND'}` when the user is null;
  - `NETWORK` on a transport failure or non-2xx;
  - `MALFORMED` on an unexpected shape.

  No thumbnails in v1: the current broadcast's preview host isn't the CDN that the CSP allows. Never log URLs, and never log the query's login together with anything identifying the user.
- **`src/resolve.js`:** a definitive `OFFLINE` keeps the helper-compatible `{ok:false, error:{code:'UNAVAILABLE', …}}` and adds `error.reason:'offline'`. `NOT_FOUND` and `RESTRICTED` are unchanged.
- **`src/player.js`:** when a `twitch-live` load fails with `reason:'offline'`, call `recentArchives({login: source.id})` once per load and send `offlineVods: {state:'loading'|'ready'|'none'|'error', items}` in the sidebar state. A source change or close cancels it, and a stale result is ignored.
- **`ui/sidebar.*`:** in that error state, replace the error line with a list of up to 10 rows: title (one line, ellipsized), short date, and length as `h:mm:ss`. Show a spinner while loading. Keep the plain error line for `none` or `error`. Clicking a row posts the existing `open {input: url}`, the same path as the + field, so it opens a managed window. Signifiers, not prose: no "Recent broadcasts" heading beyond a single short label.

**Tests.**
- **`twitch-vods`:** request shape (POST, a plain-object body, string headers, the Client-ID); the mapping; `limit`; user null → `NOT_FOUND`; non-2xx → `NETWORK`; a bad shape → `MALFORMED`; the URL round-trips through `Sources.parse`; no log argument contains a URL.
- **resolve:** `OFFLINE` → `UNAVAILABLE` with `reason:'offline'`, and still no helper call.
- **player (shim):**
  - an offline live load fetches once and publishes `loading` then `ready`;
  - a stale result after a source change is ignored;
  - VOD and YouTube sources never fetch.
- **sidebar:** rows render as text only (no `innerHTML` with titles); a click posts `open` with the VOD URL; and the `none` and `error` states.

**Owns:** new `src/twitch-vods.js`, `src/resolve.js` (the reason field), `src/player.js` (the offline branch), `ui/sidebar.*` (the list), and new `tests/b6b-*.test.js`. It waits until `src/player.js` is free: after C3b, D1 and A2.
