# BUG-005 — Twitch device authorization fails while permission is pending

Date: 2026-11-08  
Scope: Focus and Unified 0.5.0 candidate plugins on Apollo (IINA 1.5.1)

## Symptom

The user approves read-only Twitch chat access, but IINA Streams reports "Twitch authorization was declined or expired" shortly after starting the device-code flow.

## Reproduction and cause

The registered public Twitch application was verified from Apollo without completing another account authorization. `POST /oauth2/device` returned HTTP 200. An immediate `POST /oauth2/token` before account approval returned HTTP **400** with `{"status":400,"message":"authorization_pending"}`; this is the expected Twitch protocol response, not a rejection of permission. No generated code or client ID was printed.

IINA 1.5.1's `JavascriptAPIHttp.swift` uses `(response.ok ? resolve : reject).call(withArguments: [response.toDict()])`. The rejected object retains `statusCode`, `data`, and `text`. The original candidate `global.js` HTTP adapter caught *all* rejections and returned `{status:0,data:{}}`, discarding Twitch's `authorization_pending`. `TwitchAuth.poll()` treats an unrecognized response as terminal and emits "Twitch authorization was declined or expired." The five-second poll interval was not the underlying bug.

The original `src/auth.js` correctly handles `authorization_pending` and `slow_down` **if** the error body reaches it.

## Fix

The candidate `global.js` HTTP adapter now normalizes both resolved and rejected IINA HTTP responses, keeping their HTTP status and structured JSON body (or parsing `text` where `data` is missing). Genuine transport errors remain `{status:0,data:{}}`. No access tokens, client IDs, or raw HTTP payloads are logged.

Added two focused regressions: an IINA-style rejected HTTP 400 must continue polling; a sequence of pending responses followed by approved token and validation must reach `ready`.

## Verification and limits

- `node --test tests/*.test.js tests_candidate/*.test.js`: **145 passed, 0 failed** on Apollo.
- `python3 -B -m unittest discover -s tests_candidate -p 'test_*.py'`: **103 passed, 0 failed**.
- Built separately in `dist/twitch-auth-fix-20261108`; the previously delivered `dist/candidates` archives are unchanged.
- Focus archive SHA-256: `9692f295a791f3d0303135277aeac6ede488ae22b99abb8f15d9370be88bad61`.
- Unified archive SHA-256: `389533b1a053a911bad76fe26b1ec1a74bcbf3deb070bc6ad07a11e20bd8f8d9`.
- This test run does **not** claim a completed live Twitch account authorization or an IINA native post-install test. The user must approve that separately.
- The installed candidate bundles and running IINA process were **not** changed or restarted. No stable IINA Streams identity was deployed.

## Activation and rollback

Use IINA Settings → Plugins → Install Local Package to select the appropriate archive in `dist/twitch-auth-fix-20261108`. Because its identifier and version equal the existing candidate's, review IINA's candidate-specific replacement prompt carefully; do not replace any unrelated plugin. Finish the native install, relaunch IINA when ready, start a **new** Twitch device authorization, and confirm that the waiting phase persists until approval.

The original candidate archives remain at `dist/candidates` for rollback. Reinstall one of those through IINA's native installer if necessary. A pending device code from the old runtime cannot be reused.

References: [Twitch Device Code Flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#device-code-grant-flow), [IINA HTTP source](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPIHttp.swift).
