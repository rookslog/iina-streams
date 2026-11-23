# Review: #73 watch-history module (2026-11-22)

Branch `feat/73-history`: 18ceb7a (Codex's tests), d790bff and bae776d (Sonnet implementer). Reviewer: Codex gpt-6.2-sol xhigh, read-only, 23:26–23:30. Protocol: docs/REVIEW.md (D-032).

## Round 1 (verbatim)

**FIX FIRST** — three D‑032 Important findings block the module.

- **Important (P1) — Privacy guard accepts URLs and bare credentials.** [src/history.js:53](/Users/rookslog/Development/iina-streams-wt/h73/src/history.js:53) allows `mailto:fixture@example.invalid` as a login and persists it. An opaque token or signature made of allowed characters also passes as identity text. Dropping playback metadata works, but the identity denylist cannot uphold the unconditional privacy claim.
- **Important (P1) — A newer schema can be overwritten.** [src/history.js:212](/Users/rookslog/Development/iina-streams-wt/h73/src/history.js:212) checks the v1 `people` shape before honoring the version. With `{version: 2, people: {}}`, the next record copies the original to `.bad` and replaces the active file with v1 instead of leaving it read-only.
- **Important (P1) — Failed privacy changes look successful.** [src/history.js:251](/Users/rookslog/Development/iina-streams-wt/h73/src/history.js:251) swallows write errors after memory changes. If the write throws, forgotten or cleared history returns on reload, and pause is lost. Retrying the same forget or pause after storage recovers still does not write.
- **Medium (P2) — Retention disagrees with item 4.** [src/history.js:267](/Users/rookslog/Development/iina-streams-wt/h73/src/history.js:267) implements the lead-noted exception: a newcomer scoring 100 can evict an incumbent scoring 200. Reconcile that choice with the design. Separately, loading 501 people and toggling pause writes all 501 back.
- **Medium (P2) — Loaded visits and clock skew can distort results.** [src/history.js:94](/Users/rookslog/Development/iina-streams-wt/h73/src/history.js:94) preserves disk order, so an unsorted file can retain or finish the wrong visit; it also rewrites a loaded `1e300` duration unchanged. A future visit gets full weight and wins recency ties until the clock catches up. Normal `finish` ignores `NaN` timestamps and caps huge elapsed times correctly.
- **Medium (P2) — Unicode word starts are misclassified.** [src/history.js:163](/Users/rookslog/Development/iina-streams-wt/h73/src/history.js:163) checks one UTF‑16 code unit at a time, so `oh` matches inside a word immediately after a supplementary Unicode letter.
- **Medium (P2) — Tests miss plausible regressions.** In-memory mutations left all nine tests green when 29-second visits counted, timestamp sorting was removed, invalid timestamps or mixed-case providers were accepted, write errors escaped, or newer-file `finish`/pause mutated memory ([tests/history.test.js:254](/Users/rookslog/Development/iina-streams-wt/h73/tests/history.test.js:254)). Same-second records currently append as specified; an identical `finish` retry closes the other open visit, not a no-op.
- **Nit — Dense test helper.** [tests/history.test.js:68](/Users/rookslog/Development/iina-streams-wt/h73/tests/history.test.js:68) packs the query, destructuring, and tuple projection into one line. The module itself is generally readable.

At `bae776d`, `node --test tests/history.test.js` passed **9/9**, and the scoped `git diff --check` passed. The tests distinguish the age buckets, unfinished scoring, ordinary pause/forget/clear, corrupt-file backup, and unknown-field stripping. Wiring and native IINA were not tested.
## Lead disposition (round 1)

- **P1 privacy: accepted.** Switch from a blocklist to an **allowlist**:
  - Twitch login `^[a-z0-9_]{1,25}$` after lowercasing;
  - YouTube channel id `^UC[A-Za-z0-9_-]{22}$`;
  - display name: at most 64 characters, no control characters, and none of `: ? / = \ &`.
- **P1 newer schema: accepted.** The version is checked before the shape. A newer version is read-only: nothing is written and nothing is backed up.
- **P1 failed writes: accepted.**
  - Every mutating call returns whether it was persisted.
  - A failed write leaves the store "dirty", so the next call, including an identical retry, writes again.
  - forget, clear and pause report failure to the caller.
- **P2 retention: the implementer's choice stands.** A newly recorded person is never the one evicted; otherwise a full history could never admit anyone new. TESTS.md item 4 is amended to say so. Toggling pause writes only when the stored value changes.
- **P2 loaded data: accepted.** Sort visits on load, clamp loaded durations to 12 h, and clamp future timestamps to now.
- **P2 Unicode: accepted.** Word starts are judged on code points, not UTF-16 units.
- **P2 test gaps: accepted.** Add tests that the listed mutations break: the 29-second visit, unsorted loads, invalid timestamps, mixed-case providers, write errors, and mutation attempts on a newer-version file. An identical `finish` retry is a no-op.
- **Nit: accepted.** Un-pack the dense test helper.
