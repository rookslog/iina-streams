# IINA Streams — Initial automatic Twitch VOD chat experiment (superseded)

**Historical status:** This first experiment was built with an incremented local beta version label, but was **never a tagged release**. It was superseded after a long VOD failed. New development snapshots use Git commit IDs while the released version remains v0.5.3.

## Behaviour

- On first successful load of a public Twitch VOD, Streams automatically fetches available historical chat using Twitch's public video-comments GraphQL operation.
- It walks the chat timeline with overlapping **time-offset** pagination; cursor pagination was rejected in live testing with `IntegrityCheckFailed`. This is an undocumented provider interface and may change.
- The fetch runs in the existing isolated, cancellable Python acquisition helper. It uses only the canonical Twitch VOD ID, a fixed Twitch hostname, and the public Twitch web client identifier. No login cookies, account tokens, alternate hosts, or private-content access is attempted.
- When complete, the bounded acquisition publishes its archive atomically and sends it through the existing incremental replay importer and mpv-synchronized chat engine. Video playback never waits for chat.
- Fetches do not restart on quality changes or stop merely because the sidebar is hidden. Chat **Off** cancels pending work; previously saved Off preference prevents auto-fetch. **Fetch replay** allows retry; **Import archive…** remains an authorized fallback.
- There are explicit limits: 10-minute acquisition deadline, 30,000 pages, 2,000,000 messages, 128 MiB output, and 2 MiB per HTTP response. A limit or provider failure discards partial results and does not fabricate a complete replay.
- Twitch has no stable documented official VOD-chat interface. Some recordings may have unavailable chat, rate limits, or an endpoint that stops working.

## Verification on Apollo (November 17, 2026)

- Real public VOD `2791131914`: full acquisition and import, **54 messages**, no authentication.
- Real public VOD `1933854663`: full multi-page acquisition and import, **83 messages**, no authentication.
- Public VOD `2922164492`: 8 successive real pages sampled and normalized; **365 distinct messages** imported. This is a partial sample, not evidence the entire long recording can be fetched.
- Node test suite: 155 pass including new auto-fetch, cancellation, one-shot semantics, and Off-preference tests.
- Python focused acquisition + replay tests: 39 pass; 53 additional Python media/helper/resource tests pass (92 total in applicable groups). The old, inherited `test_build.py` and `test_install.py` target a removed `candidate-plugin/` layout and are not applicable to this beta builder. They remain in the repo unchanged.
- **Not yet established:** live IINA 1.5.1 UI installation/operation for this beta, full multi-hour VOD retrieval under load, long-session performance or energy use.

## Install and rollback

Build from this isolated worktree:

```sh
cd /Users/rookslog/Development/iina-streams-auto-vod
/usr/bin/python3 -B scripts/build.py --beta --output dist/beta
```

The former local package `iina-streams-beta-0.5.5.iinaplgz` is superseded and retained only as historical evidence. Install the current commit-stamped development package instead; beta identity remains `local.iina.streams.beta`, distinct from stable.

For rollback, reinstall the existing saved beta 0.5.4 package from `/Users/rookslog/Development/iina-streams/dist/beta/` or disable the beta plugin in IINA Plugins settings. Keep the stable plugin intact. Avoid directly deleting installed plugin directories while IINA is running.

## Unfinished engineering

- Add a visible message-count/progress state during long fetches.
- Establish a clear provider error for integrity checks and login-required sources without suggesting unavailable is the same as an empty chat.
- Native test: actual playback and chat, overlay/sidebar, seek after acquisition, cancellation during download, and no UI disruption.
- Benchmark large VOD imports and consider caching, streaming windows, or incremental acquisition instead of waiting for a complete long archive.
