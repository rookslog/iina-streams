# Twitch sign-in and first-run onboarding — design (2026-11-22)

**Status:** chosen by the lead at the user's direction ("whatever you think should be ideal"). Not yet built or natively tested.

**User feedback, 2026-11-22.** Onboarding is "very frustrating". Re-adding credentials should be one button, with a route to the page where the Client ID lives and instructions there. "Forget Twitch login" is weird: it should be **Sign in / Sign out**. Text such as "read-only mode" helps nobody.

## The flow

1. **Signed out (resting state).** One primary button, **Sign in with Twitch**, where chat would be. No Client ID field, scope text or caption.
2. **Click.** Streams requests a device code. It copies the code, opens `twitch.tv/activate` in the browser, and shows the code large, with **Copy code** and **Cancel**. Transient status: "Waiting for Twitch…".
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

Built-in ID (injected at build time; publishing one is a separate user decision), then the stored per-identity `@data/twitch-client.json`, then the Keychain grant's `clientID`, then step 6.

## Copy rules

Every visible string must be a name, a value, an action, a transient state, or an error. Remove:
- "Saved locally for future sessions with read-only chat scope."
- "Approve read-only access in Twitch."
- "Twitch Public Client ID" as a resting label.
- "Forget Twitch login".

## Test plan

- **Unit:** every state transition; Client ID source order; sign-out removes the Keychain entry; Off does not sign out.
- **Native:** a fresh identity reaches live chat with no outside instructions; relaunch keeps you signed in; Sign out then Sign in works.
