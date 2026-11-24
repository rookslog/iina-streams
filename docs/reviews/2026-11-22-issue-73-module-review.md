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
## Lead disposition after the final clearance (23:42)

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

- **Lead decision (23:46), on the targeted pass:** a history file that can't be read (an I/O failure, not a parse failure) blocks history until it can be read; nothing falls back to backup-and-replace. Losing new history is better than overwriting a file we can't read. The wiring records "history unavailable" in Streams' diagnostics (`@data/beta-global.json`), so it is visible.

## Narrow check (verbatim; Codex gpt-6.2-sol xhigh, finished 23:49, on 777052a)

**NOT CLOSED** at `777052a`.

1. **CLOSED** — [TESTS.md:74](/Users/rookslog/Development/iina-streams-wt/h73/docs/design/finding-2026-11-22/history/TESTS.md:74) narrows the module claim to format checks and leaves provenance to wiring.
2. **NOT CLOSED as written** — Mutators retry the read and write nothing while unavailable; `query` never writes. But [`record()`](/Users/rookslog/Development/iina-streams-wt/h73/src/history.js:423) returns its existing `null` sentinel, not `false`.
3. **NOT CLOSED** — Clock rollback and same-second retries pass, but [the write omits the ID counter](/Users/rookslog/Development/iina-streams-wt/h73/src/history.js:359). After forgetting the highest-ID visit and reopening, its stale handle can close a new visit.
4. **CLOSED** — Load trims to 500 by score without writing.
5. **CLOSED** — `node --test tests/history.test.js` passed 27/27; the new tests caught all six targeted retry and timestamp mutations.

**Other new regressions**

- [src/history.js:510](/Users/rookslog/Development/iina-streams-wt/h73/src/history.js:510) — Forgetting a channel trimmed on load returns `true` without deleting it from disk. It can reappear after scores change and the store is reopened.
- [src/history.js:398](/Users/rookslog/Development/iina-streams-wt/h73/src/history.js:398) — A stored `Number.MAX_SAFE_INTEGER` ID makes subsequent records return duplicate IDs that `finish()` rejects.
- [src/history.js:371](/Users/rookslog/Development/iina-streams-wt/h73/src/history.js:371) — Load trimming rescans the list for each eviction. A 10,000-person fixture took 2.4 s to open versus 6 ms at `8f83b2c`.
## Lead disposition

- Per D-032 rule 4, the surviving findings go to the operator, as `docs/WAITING.md` W-13. **The merge is held**; fixing on the branch is reversible, so it goes ahead.
- **The fixes:**
  - the next-id counter is persisted in the file;
  - forgetting a person trimmed on load also removes them from the file (and the trim keeps the evicted logins until the next write);
  - ids are bounded: at the safe-integer limit, renumber in order;
  - the trim is O(n log n), by sorting once;
  - `record` keeps `null` for "ignored"; TESTS.md is amended to say that `null` is its false.

## Narrow check 2 (verbatim; Codex gpt-6.2-sol xhigh, finished 23:56, on 2e1633c)

**NOT CLOSED** — `node --test tests/history.test.js` passed 35/35, but targeted probes reproduced two stale-handle failures and one load regression.

- **CLOSED — (2) `record`:** `null` is documented and tested as the ignored-result sentinel.
- **NOT CLOSED — (3) ID counter:** `nextId` is persisted, but a surviving high open ID triggers another rollover after reopen. A forgotten handle then closes a new visit. [src/history.js:447](/Users/rookslog/Development/iina-streams-wt/h73/src/history.js:447)
- **CLOSED — Forget after trimming:** Forgetting a load-trimmed person removes them from disk, including on retry after a failed write.
- **NOT CLOSED — `MAX_SAFE_INTEGER`:** IDs stay in range, but skipping IDs currently in use doesn’t void old handles. A retry with a closed visit’s handle closed a new visit after rollover. [src/history.js:471](/Users/rookslog/Development/iina-streams-wt/h73/src/history.js:471)
- **CLOSED — O(n²) trimming:** Load now scores once and sorts once; the 10,000-person test passed.

**New regression — [src/history.js:186](/Users/rookslog/Development/iina-streams-wt/h73/src/history.js:186):** With a max ID and a missing ID in the same file, load renumbers open visits too. A live handle that closed the correct visit on `777052a` now closes a different one.
## Lead step-back (D-032: the stale-handle class recurred)

Renumbering near `MAX_SAFE_INTEGER` is the source of every remaining finding, and it guards a case that real use can't reach: at most 500 × 10 visits are stored, and the counter grows by one per visit. **Simplify:**

- **Ids are bounded at 2^31.** A loaded file with any id, or a `nextId`, that is non-integer, below 1 or above 2^31 is treated as corrupt: it's backed up to `.bad`, and history starts empty.
- **No renumbering anywhere, at load or at runtime.** At 2^31 the counter refuses: `record` returns `null` and nothing is written. That isn't reachable in practice.
- **Missing ids on load** (from an older file without them) are assigned from `nextId` upward in time order. Before load there are no live handles to break.
- Remove the renumbering code and its tests; add tests for the bound.

## Narrow check 3 (verbatim; Codex gpt-6.2-sol xhigh, finished 00:02, on 8f37230)

**NOT CLOSED** — `node --test tests/history.test.js`: 38/38 passed; targeted probes found gaps.

- **NOT CLOSED — Stale handle after reopen.** Normal reopen is fixed, but the new corrupt-file recovery resets the counter to 1. A stale handle can then close a new visit for the same channel. [src/history.js:336](/Users/rookslog/Development/iina-streams-wt/h73/src/history.js:336)
- **CLOSED — Skipping in-use IDs.** The rollover and skip logic is gone; `record()` returns `null` once the last ID is issued.
- **NOT CLOSED — Load renumbering.** The old overflow path is gone, but load still changes an open visit’s ID if it duplicates an earlier visit’s ID. [src/history.js:191](/Users/rookslog/Development/iina-streams-wt/h73/src/history.js:191)
- **New — Corruption check bypass.** Explicit `id: null` is treated as missing, and invalid IDs on visits with bad timestamps or durations are skipped without a `.bad` backup. [src/history.js:142](/Users/rookslog/Development/iina-streams-wt/h73/src/history.js:142)
## Lead disposition: close the stale-handle class by construction

- **Handles are scoped to one store instance.** Each `createHistory` draws a random instance token, and handles carry it. `finish` with a handle from another instance is a no-op. In production, global holds one store for the IINA session, and handles never outlive their windows. A reopen therefore can never alias a handle, whatever the counter does.
- **Load is strict:** a duplicate id, an explicit `id: null`, or an invalid id on any visit (including one dropped for a bad timestamp or duration) makes the file corrupt (`.bad`, history starts empty). Load never changes an id.

## Narrow check 4 (verbatim; Codex gpt-6.2-sol xhigh, finished 00:07, on f3c5826)

- **NOT CLOSED — Stale handle after corrupt reset:** Distinct tokens block it, but identical injected random draws let the stale handle close the new visit. [src/history.js:562](/Users/rookslog/Development/iina-streams-wt/h73/src/history.js:562)
- **CLOSED — Duplicate open-visit ID:** Load treats the file as corrupt instead of renumbering the visit. [src/history.js:158](/Users/rookslog/Development/iina-streams-wt/h73/src/history.js:158)
- **CLOSED — Null or invalid IDs on dropped visits:** IDs are checked before any visits or people are dropped. [src/history.js:372](/Users/rookslog/Development/iina-streams-wt/h73/src/history.js:372)
- **New finding — Foreign handles can still write:** `finish()` returns `false` but flushes a pending write. [src/history.js:589](/Users/rookslog/Development/iina-streams-wt/h73/src/history.js:589)
- **Token persistence — No leak:** The token is on the returned handle, not the serialized visit. Targeted writes confirmed it was absent from the JSON. [src/history.js:540](/Users/rookslog/Development/iina-streams-wt/h73/src/history.js:540)

`node --test tests/history.test.js`: 44/44 passed.
## Lead disposition: closed in substance

- **Stale handle after a corrupt reset:** it reproduces only when a test injects identical random draws for two instances. Production uses `Math.random`, so a collision is negligible. Accepted, and noted in the header comment.
- **A foreign handle flushes a pending write:** this is the documented "next mutating call retries" contract. The foreign visit itself is never changed. Accepted as intended.
- **Token persistence:** no leak (Codex checked the JSON).

**Evidence for WAITING W-13:** after four narrow checks, nothing open would change behaviour in production. Lead recommendation: merge.
