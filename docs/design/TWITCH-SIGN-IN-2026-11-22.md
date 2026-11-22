# Twitch sign-in and first-run onboarding — design (2026-11-22)

**Status:** built and natively accepted (#7, closed 2026-11-22). The built-in Client ID shipped in 0.5.4 (#8, D-025). That amended the source order below.

**User feedback, 2026-11-22.** Onboarding is "very frustrating". Re-adding credentials should be one button, with a route to the page where the Client ID lives and instructions there. "Forget Twitch login" is weird: it should be **Sign in / Sign out**. Text such as "read-only mode" helps nobody.

## The flow

1. **Signed out (resting state).** One primary button, **Sign in with Twitch**, where chat would be. No Client ID field, scope text or caption.
2. **Click.** Streams requests a device code and shows it large, with **Approve on Twitch**. Nothing opens by itself (amended 2026-11-22, #42, after the user's native check: they prefer to click). The button opens `twitch.tv/activate` in the browser, whose page autofills the code, so the user presses Activate, then Authorize. The button also copies the code to the clipboard without saying so, in case autofill fails. Transient status: "Waiting for Twitch…".
3. **Approved.** Chat connects automatically. The account appears as `@login` in the chat settings menu, with **Sign out** beside it.
4. **Sign out** revokes the token and deletes the Keychain entry (today's "Forget"). It is distinct from chat **Off**, which only disconnects.
5. **Failures**, each with one action:
   - **Declined** → "Sign-in cancelled" with **Try again**.
   - **Code expired** → **Try again** fetches a new code.
   - **Network** → **Retry**.
   - **Invalid Client ID** → opens the setup in step 6.
6. **Only if no Client ID is known** (none built in, none stored): a short setup sheet.
   - A **Open Twitch Developer Console** button (opens `dev.twitch.tv/console/apps/create`).
   - Three short steps: name it anything; OAuth Redirect URL `http://localhost`; Client Type **Public**. Then copy the Client ID.
   - A paste field that validates as you type, then continues straight into step 2.
   - Reachable later as "Use a different Twitch app…" in the account menu.

## Client ID sources, in order

Amended by D-025, 2026-11-22. The order is:
1. the ID just entered in setup;
2. the user's own stored ID (`@data/twitch-client.json`);
3. the Keychain grant's `clientID`;
4. the built-in ID (`src/twitch-app.js`, the maintainer's Public app);
5. otherwise, step 6.

The built-in ID is never saved as the user's own. A user's choice outranks the built-in ID, so "Use a different Client ID" keeps working.

## Copy rules

Every visible string must be a name, a value, an action, a transient state, or an error. Remove:
- "Saved locally for future sessions with read-only chat scope."
- "Approve read-only access in Twitch."
- "Twitch Public Client ID" as a resting label.
- "Forget Twitch login".

## Test plan

- **Unit:** every state transition; Client ID source order; sign-out removes the Keychain entry; Off does not sign out.
- **Native:** a fresh identity reaches live chat with no outside instructions; relaunch keeps you signed in; Sign out then Sign in works.
