# BUG-006 — Live overlay freezes after closing the Streams sidebar

Date: 2026-11-08  
Scope: IINA Streams candidate Focus and Unified, successor to BUG-005.

## Report and code-level cause

While Twitch live chat is displayed over video, closing the Streams sidebar leaves the overlay visible but stops message updates.

In the installed 0.5.0 candidate, `ui/sidebar.js` creates and owns the sole `StreamsLive` WebSocket. The overlay receives already-parsed `messages` via the child controller; `ui/overlay.js` contains no transport. `src/player.js` correctly avoids calling `chatOff()` when hiding the sidebar in overlay presentation, but it still depends on background execution and message delivery from the hidden sidebar web view. Hiding or collapsing that view can prevent timely live-batch delivery. The existing `send()` also sent new state to the sidebar before the overlay, making an unavailable hidden surface capable of interrupting the visible one. The user's observed freeze is consistent with these code paths; no packet-level live trace from the failing session was available.

## Change

- A new `ui/overlay-live.js` owns the **single** live Twitch IRC connection in the video's overlay web view. That surface stays shown (with a visually hidden, non-clickable panel) even when presentation is `sidebar`. The sidebar is now only a controller and alternative rendering surface.
- `src/player.js` delivers validated, ephemeral credentials to the overlay after its native ready handshake, not to the sidebar. The bridge uses monotonically increasing session IDs and ignores stale callbacks after Off, replacement, or close. Token material is not included in snapshots, trace events, or displayed messages.
- `src/player.js` sends overlay state first; explicit sidebar hide no longer receives sidebar-state notifications. A failed native state post to the sidebar cannot prevent an overlay update.
- `ui/overlay.html` uses the narrowly scoped Twitch secure-WebSocket CSP. The overlay only renders messages when the selected presentation is `overlay`; in sidebar mode its WebView remains active but its panel is hidden and non-clickable.
- The existing capped Twitch IRC history, moderation, reconnect, Off and pagehide cleanup logic is reused, not duplicated. Switching presentation does not reconnect or request additional OAuth credentials.
- Both candidates are versioned `0.5.1`. The previously verified BUG-005 OAuth pending-response correction is retained.

## Verification

- Full JavaScript and Python test suites executed on Apollo; results recorded in the response, with exact counts.
- The new `tests_candidate/overlay-live.test.js` executes `live.js`, `live-history.js`, and the new overlay controller in a synthetic WebSocket host: verifies connect, IRC read, bounded batch, token non-disclosure, Off, pagehide, and stale-session rejection.
- The updated `tests_candidate/player-auth-binding.test.js` verifies pending native overlay readiness, current-session dispatch, live messages after sidebar hide, switching presentations with no second connection, Keychain warning propagation, and sidebar-post errors that must not block the overlay.
- These are source/synthetic-host tests. They establish the implementation wiring and regression coverage, **not** a completed live Twitch WebSocket run in native IINA with the sidebar collapsed. That final user-authorized native acceptance check remains necessary.
- Installation was not performed. Current IINA windows, user OAuth grants, client IDs, Keychains, plugin preferences, and the stable plugin remain untouched.

## Native acceptance checklist

1. Install the version-0.5.1 Focus or Unified archive through IINA's native plugin installer, confirming the exact candidate identity, and reload the selected candidate when convenient.
2. Start a Twitch livestream, select chat **Over video**, authorize if prompted, and verify new messages.
3. Use the plugin's own **Hide inspector** or **×** control, followed by IINA's native sidebar collapse. Confirm new messages continue to arrive over video across both paths.
4. Reopen the sidebar and switch to **Sidebar** presentation, then return to **Over video**. Confirm one continuing session, no duplicate messages, and no second OAuth prompt.
5. Test Chat Off, re-connect, and a quality change. Confirm socket cleanup and no stale chat messages. Verify the original 0.5.0 archive remains available for rollback.

## Constraints and risk

Keeping the overlay WebView shown for chat in sidebar mode costs some rendering and WebKit resources versus hiding it. That trade-off is explicit and should be measured on the user's 16 GB Mac. The current implementation does not move the socket into a non-WebKit global runtime, which would require another supported persistent transport. Platform-level WebKit suspension during display sleep or application minimization is not ruled out by these tests.

The OAuth/Keychain issues discussed earlier are separate: BUG-005 fixed ordinary HTTP 400 polling; launching IINA with an RDC-isolated `HOME` can still prevent Keychain persistence.
