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

## Round 2, final clearance (verbatim; Codex gpt-6.2-sol xhigh, 23:38–23:42, on 8f83b2c)

**FIX FIRST** — `feat/73-history` at `8f83b2c`.

- **P1 — Privacy guarantee still open.** [src/history.js:72](/Users/rookslog/Development/iina-streams-wt/h73/src/history.js:72) implements the approved allowlists and rejects the round‑1 `mailto:` example. But a synthetic opaque token that fits the rules was written to disk as either a login or a display name. The module validates format, not provenance; it cannot support the unconditional “never a token” claim.
- **P1 — Forget can still falsely report success.** [src/history.js:295](/Users/rookslog/Development/iina-streams-wt/h73/src/history.js:295) returns `true` when nothing is dirty. If the initial read throws, `forget` sees an empty list and reports success without writing; the channel reappears when storage is readable again. Ordinary failed writes are reported and identical mutator retries work, but [query](/Users/rookslog/Development/iina-streams-wt/h73/src/history.js:408) does not retry a pending write despite the “next call” contract.
- **P2 — Visit handles break under clock rollback.** [src/history.js:127](/Users/rookslog/Development/iina-streams-wt/h73/src/history.js:127) clamps the timestamp that [finish uses as the key](/Users/rookslog/Development/iina-streams-wt/h73/src/history.js:385). Record at `1000`, reopen with the clock at `990`, and the original handle no longer closes the visit. Separately, the approved same-second handle collision means an identical retry after a failed write can close the *other* window’s visit.
- **P2 — The 500-person cap is still open on load.** [src/history.js:263](/Users/rookslog/Development/iina-streams-wt/h73/src/history.js:263) loads all 501 people from an oversized file; changing pause writes all 501 back. Newcomer protection and unchanged-pause behavior are closed.
- **P2 — Retry tests still miss state loss.** [tests/history.test.js:349](/Users/rookslog/Development/iina-streams-wt/h73/tests/history.test.js:349) stayed green when failed forget, clear and pause calls rolled back their in-memory changes. The suite also missed skipping retries on no-op `record` or `finish`, and accepting invalid stored timestamps.

**Closed:** Readable newer schemas stay read-only; loaded visits sort and clamp as specified in isolation; Unicode word starts and the dense helper are fixed. The tests rejected every mutation explicitly listed in round 1. `node --test tests/history.test.js` passed **18/18**; the scoped diff check passed. Wiring and native IINA were out of scope.
## Lead disposition after the final clearance (23:50)

Targeted fix plus a narrow check, per the 0.5.5 precedent (and the same path as #67).

- **P1 privacy: accepted, by narrowing the claim.** The module can check format, not provenance. TESTS.md item 9 becomes: "the module stores only identity fields that pass the allowlists, and never playback metadata". Provenance is guaranteed by the wiring: items 10–12 must pass only identity that came from a resolved Twitch user (login and display name) or a YouTube channel record, and a wiring test asserts that nothing from a URL, token or playlist reaches `record`. No module code change for this.
- **P1 forget after a failed read: accepted.**
  - An I/O failure on the initial read (not a parse failure) marks the store **unavailable**.
  - While unavailable, every mutation returns false and writes nothing, so a file it couldn't read is never overwritten. Each call retries the read first.
  - The pending-write contract becomes "the next *mutating* call": `query` never writes.
- **P2 handles: accepted.** Each visit gets a stored, monotonically increasing `id`, and handles carry that id, not the timestamp. That fixes both clock rollback and the same-second collision.
- **P2 cap on load: accepted.** Trim to 500 in memory on load, by score; nothing is written until the next mutating call.
- **P2 test gaps: accepted.** Tests where:
  - a failed forget, clear or pause keeps its in-memory change and retries;
  - a no-op `record` or `finish` doesn't skip a pending retry;
  - invalid stored timestamps are rejected on load.
