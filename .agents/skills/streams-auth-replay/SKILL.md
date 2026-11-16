---
name: streams-auth-replay
description: Use when implementing or reviewing Twitch device authorization, Keychain persistence, live IRC chat, Twitch VOD historical chat acquisition, or synchronized replay.
---

# Twitch auth and historical replay evidence

Read `docs/BUG-005-twitch-device-code-poll-rejected-400.md`, `docs/BUG-006-overlay-sidebar-live-freeze.md`, and current `candidate-plugin/src/auth.js`, `candidate-plugin/global.js`, `candidate-plugin/src/player.js`, and replay helpers first.

Define explicit states for missing Client ID, authorization pending, approved, rejected, expiry, refresh, stored grant recovered, session-only operation, Forget and Off. Off closes chat without revoking a saved grant. Do not call repeated device code prompts a successful login. Per-plugin Keychain namespace may differ for Unified and Focus. Confirm persistence only after a clean normal restart with a real approved account, never from a missing-error message or mock.

Do not print tokens, authorization codes, Keychain values, signed HLS URLs, or credential-bearing HTTP payloads. Real OAuth requires user approval. Test replay/IRC logic first with mocked transports; distinguish that from native authenticated receipts.

For historical Twitch chat, investigate public or otherwise authorized VOD acquisition via maintained tools, legitimate provider access and a user-initiated action. Verify VOD identity, message count/provenance, timestamp alignment, seeks, pauses, speed, offset, cancellation, memory and missing-history behavior with genuine messages. Keep JSON archive import as fallback; a synthetic 100k fixture is not real acquisition. Preserve the already-proven YouTube genuine replay behavior.

Security concerns must be independently reviewed: CSP, read-only scopes, bounded message/history, emote resource URLs, text fallback, caching, owner cleanup, account revocation and identity isolation.
