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
