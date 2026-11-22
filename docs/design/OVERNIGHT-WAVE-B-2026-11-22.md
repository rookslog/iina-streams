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
