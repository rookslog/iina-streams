# Emotes and badges: integration note (issue #34, first half)

Date 2026-11-22. Base `c3d6fd9`. Written by reading `src/player.js`, `ui/live.js`, `ui/live-history.js`, `ui/overlay-live.js`, `ui/overlay.js`, `ui/sidebar.js` and both HTML pages; none were edited. Integration points are named by function and message, not line number, because another agent is restructuring these files.

## What exists

`ui/chat-content.js` (global `StreamsChatContent`, also `require`-able) with tests in `tests/chat-content.test.js`.

- `StreamsChatContent.twitch.segments(text, emotesTag)` returns `{type:'text',text}` and `{type:'emote',name,url,url2x,provider:'twitch'}`. Positions are code points. Malformed, overlapping or out-of-range tags give one text segment.
- `StreamsChatContent.twitch.badges(badgesTag)` returns `[{set,version}]`. No image lookup.
- `StreamsChatContent.renderSegments(segments, {document, size})` returns DOM nodes. It never uses `innerHTML`, sets `alt` and `title` to the emote name, sets fixed `width`/`height` (default 24), and replaces a failed image with its name as text. It assigns `src` only for the Twitch emote CDN URL shape. Text goes in as text nodes (`createTextNode`), not `textContent` on a wrapper.

## Message flow found

1. **Live parse: already done.** In `ui/live.js`, `create(...)`'s PRIVMSG handler parses IRC tags and enqueues `{type:'message', ..., text, badges, emotes, action}`. `badges` is clipped to 1024 chars and `emotes` to 2048 (raw tag strings, not parsed).
2. `ui/live-history.js` `reduce` keeps `badges`, `emotes`, `action` on each record.
3. `ui/overlay-live.js` posts `live-messages` `{session, messages}` to the plugin side.
4. **The drop point.** In `src/player.js`, the `overlay.onMessage('live-messages', ...)` handler maps each message through `safeMessage`, which keeps only `id, time, sentAt, author, text, color, kind`. `badges`, `emotes` and `action` are discarded here. `safeMessage` must also carry `emotes` (string, clipped to 2048, same as live.js) and `badges` (string, clipped to 1024). `safeMessage` is exported and has tests, so extend its tests too.
5. The same `safeMessage` is used for replay messages (`messages=result.map(safeMessage)` in the replay path). Replay records come from the helper and have no `emotes` field today, so replay emotes are out of scope unless the helper's normalized output is extended. Unchecked: whether the Twitch GraphQL replay data carries emote fragments.
6. `send()` then posts state to both views; the page state's `chat.messages` is what each view renders.

## Where each view renders text

- **Sidebar:** `render(s)` in `ui/sidebar.js`, in the message-list rebuild block. It creates `const text=document.createElement('span'); text.textContent=m.text;` then `row.append(author,text)`. Replace with `text.replaceChildren(...StreamsChatContent.renderSegments(StreamsChatContent.twitch.segments(m.text,m.emotes)))`.
- **Overlay:** the message-rendering loop in `ui/overlay.js` has the same `text.textContent=m.text` followed by `row.append(author,text)`. Same replacement.
- Both views also build a text-only digest for QA (`renderedMessages` uses `e.textContent`). Emote `<img>` contributes no `textContent`, so QA inspection will omit emote names unless a text node or the `alt` is included. Decide then whether that matters.
- The sidebar scroll-follow logic measures heights; fixed `width`/`height` on emote images is there so a late image load does not shift layout.
- Provider seams (#19): the views should call a neutral entry point. Today `segments` is under `twitch`; a thin `segmentsFor(message)` dispatching on `m.provider` would keep the call sites provider-neutral. Not built here because messages have no `provider` field yet.

## Script and CSP changes required

- Both `ui/sidebar.html` and `ui/overlay.html` need `<script src="chat-content.js"></script>` before `sidebar.js` / `overlay.js`. `scripts/build.py` copies the whole `ui` directory (`PLUGIN_ENTRIES`), so no build change is needed (read from `scripts/build.py`; no build was run).
- **Sidebar CSP** is `default-src 'none'; script-src 'self'; style-src 'self'; connect-src wss://irc-ws.chat.twitch.tv:443; img-src 'none'`. Change `img-src 'none'` to `img-src https://static-cdn.jtvnw.net`.
- **Overlay CSP** is `default-src 'none'; script-src 'self'; style-src 'self'; connect-src wss://irc-ws.chat.twitch.tv:443`. No `img-src`, so images fall back to `default-src 'none'` and are blocked. Add `; img-src https://static-cdn.jtvnw.net`.
- `tests/overlay-live.test.js` (test "HTML places the only chat transport in overlay...") asserts the overlay CSP contains `connect-src wss://irc-ws.chat.twitch.tv:443`. Appending `img-src` leaves that assertion passing. No other test inspects the CSP (grep of `tests/*.js` for `connect-src|img-src|Content-Security`).
- `style-src 'self'` forbids inline `style` attributes; the renderer uses `width`/`height` attributes and a class `emote`, which are allowed. Add CSS for `.emote` (vertical-align, margin) to `sidebar.css` and `overlay.css`.
- Whether the IINA plugin WebView honours this CSP for `https` images, and whether it can load remote images at all, is unchecked. It needs a native IINA observation (per AGENTS.md evidence hierarchy); this work has only Node tests with a DOM double.

## Things that could block or surprise

- **CTCP action messages (`/me`).** `ui/live.js` strips the `\x01ACTION ` wrapper (8 characters) before enqueueing `text`. Whether Twitch emote positions are relative to the stripped text or the raw one is unchecked. If positions include the wrapper, emotes in `/me` messages will be mis-sliced or fall back to plain text. The module cannot detect this. Check with a real `/me` message that has an emote.
- **Truncation.** `live.js` clips text to 4000 and the history/`safeMessage` clip it to 2000 characters, and the `emotes` tag to 2048. A long message can cut off text so a position falls out of range; the module then renders the entire message as plain text (by design), losing all its emotes. Rare.
- **Failed image fallback** shows the emote name as text, but is untested in a real WebView.
- **Badges** need the Twitch badge API (needs credentials from the user's login) and presumably a CSP allowance for its image host; out of scope here.
- No blocker to wiring found; the two changes are the `safeMessage` fields and the CSP edit.
