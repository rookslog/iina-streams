# IINA Streams — Bounded on-demand Twitch VOD replay (unreleased)

**Status:** Corrected beta implementation on an isolated branch, not a stable release; installed IINA plugins are unchanged until the user explicitly installs the new beta. Authoritative record: the test report and exact package SHA attached to the release build.

## Root cause: previous unreleased full-download experiment

The user's real VOD was `https://www.twitch.tv/videos/2930971003` (a roughly nine-hour broadcast). The previous code tried to download the entire VOD's chat before replay began.

With the public Twitch `VideoCommentsByOffsetOrCursor` persisted query, offset-based pagination can return overlapping messages whose maximum `contentOffsetSeconds` equals the offset requested. In this recording, page **50** requested **290 seconds**, returned a page ending at **290 seconds**, and indicated `hasNextPage: true`. Our code incorrectly classified this as `INVALID_ARCHIVE`, surfacing the generic, misleading error *The downloaded file is not a complete supported chat replay*. More broadly, an all-or-nothing nine-hour fetch is poor latency and risks page/size/time limits.

## Correction

- The native player requests bounded chat **near its current mpv time**, starting about 8 seconds behind and targeting up to 60 seconds ahead. This is not a full-history export.
- The Python acquisition helper uses a fixed public Twitch endpoint, canonical numeric VOD ID, no user credentials/cookies, at most 64 pages / 15,000 messages / 16 MiB of archive data / 50 seconds per window. If the page budget is exhausted, it returns a truthfully flagged bounded window rather than misrepresenting it as a complete archive.
- Offset pagination advances by at least one integer second, deduplicates comment IDs across the requested window, and no longer aborts on a repeated ending timestamp. **This API is not exhaustive during extreme same-second bursts**; some comments can be missed. Cursor pagination was tested and returned `IntegrityCheckFailed` without authorized integrity material. No attempt to bypass that restriction is made.
- Existing normalized archive importer and mpv-clock replay engine are reused, retaining the active replay while the next window loads. The player prefetches near the end of the current window, fetches at the new position after a seek (including distant seeks and user chat offset adjustments), coalesces requests during rapid seeks, ignores stale results, and cancels on explicit Chat Off/close.
- A user-initiated **Fetch replay** works after an unavailable response, and **Import archive…** remains independent. The automatic on-demand fetch respects the persisted Chat Off preference. Video playback does not wait for chat.
- The loader checks source identity, window bounds, archive output ownership and cancellation; it deletes superseded normalized windows. On transient refresh errors it retains the last valid replay and backs off for 30 seconds.
- No new third-party CLI, login, system-wide preference change, or local HTTP server is needed.

## Real-source acceptance on Apollo — November 17, 2026

The exact problematic VOD was tested through Python acquisition and the existing archive importer, without the IINA user interface at these playback seconds:

| Playback position | Acquired messages | HTTP pages | Coverage (seconds) |
| --- | ---: | ---: | --- |
| 0 | 228 | 5 | 3–63 |
| 290 | 402 | 10 | 280–355 |
| 500 | 717 | 20 | 491–561 |
| 20,000 | 188 | 4 | 19,989–20,083 |
| 32,000 | 186 | 4 | 31,978–32,090 |

Separate end-to-end helper-runner smoke using the **same source helper invocation pattern as the bundled plugin** confirmed successful acquisition, JSON publication, normalized import and matching VOD IDs at positions 290, 500, and 32,000. Repeatable, opt-in command:

```sh
cd /Users/rookslog/Development/iina-streams-auto-vod
/usr/bin/python3 -B qa/live-twitch-replay-smoke.py --run
```

This network test is intentionally **not** in the default offline unit suite.

## Tests and remaining gates

- Full JavaScript suite: **168 passed, zero failed**. Includes initial autoplay, automatic prefetch, 5-hour seek, 8-hour seek during an outstanding request, Chat Off and late helper publication, manual Fetch after persisted Off, background failure preserves replay, bad metadata, mismatched VOD ID, manual import independence, offset, and no-more-chat behavior.
- Full Python suite: **120 tests, zero failed, nine explicit skips**. The skips belong to the previous `candidate-plugin/` builder layout, which no longer exists in this root-layout branch. New `test_build_current.py` covers the current commit-stamped development builder, source identity, reproducibility, and embedding.
- Native IINA WKWebView UI presentation and uninterrupted video playback under the newly installed beta are **not yet observed**. Those are appropriate real end-to-end experiential checks once the user installs this beta; do not claim them from mocks.
- Extreme same-second comment floods may omit some messages because Twitch's public offset pagination is not a lossless archival interface. The dependency is undocumented and can change.
- Sustained multi-hour foreground viewing, memory/energy metrics and rate limiting over many consecutive windows remain unmeasured. These are not represented as passing.
- The previously built local beta archives remain available as historical rollback files; tagged stable v0.5.3 stays untouched.

## Installation

The development plugin identifier remains `local.iina.streams.beta`. Its displayed version is `0.5.3-dev.g<commit>`, not a newly incremented release version. Build with:

```sh
cd /Users/rookslog/Development/iina-streams-auto-vod
/usr/bin/python3 -B scripts/build.py --beta --output dist/beta
```

Install via **IINA → Settings → Plugins → Install Local Package…** after closing the beta-owned player. Do not reinstall stable or alter unrelated windows.
