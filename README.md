# IINA Streams

Watch Twitch and YouTube in [IINA](https://iina.io) with chat beside or over the video.

- **Open a stream:** **Plugin › Streams › Open Stream…** (⌃⌘O) accepts a Twitch channel, a Twitch VOD, or a YouTube video or livestream URL.
- **Quality:** switch quality in the same window from the Streams sidebar.
- **Twitch live chat:** shows in the sidebar or on top of the video. You can drag the overlay and resize it from its corner. Timestamps can be off, `12:34` or `12:34:56`.
- **Twitch VOD chat:** loads in windows around wherever you are playing, and follows seeks.
- **YouTube replay chat:** loads for finished livestreams.

## Requirements

- IINA 1.5.1 on macOS.
- [Streamlink](https://streamlink.github.io) and [yt-dlp](https://github.com/yt-dlp/yt-dlp), for example `brew install streamlink yt-dlp`.
- Twitch chat needs a Twitch sign-in: click **Sign in with Twitch** and approve on Twitch. Streams ships its own Twitch app ID. You can use your own app instead, through **Use a different Client ID**.

## Install

- **Stable:** IINA › Settings › Plugins › Install from GitHub, then enter `rookslog/iina-streams`. No GitHub Release has been published yet, so this currently installs `main` (0.5.3) from source. The first packaged Release will be 0.5.4 ([#14](https://github.com/rookslog/iina-streams/issues/14)).
- **Beta:** every commit to `beta` builds a `.iinaplgz`, available under [Actions](https://github.com/rookslog/iina-streams/actions) › the run › Artifacts. Open it with IINA. It installs as **Streams Beta**, separate from stable.

## Status and plans

The last tagged release is v0.5.3, and `beta` targets 0.5.4. The plan is in [docs/ROADMAP.md](docs/ROADMAP.md), with one line per release linking to GitHub milestones and issues.

## Development

[docs/RELEASE.md](docs/RELEASE.md) covers the three plugin identities (stable, beta, dev), the linked dev loop (`npm run dev:deploy`, then relaunch IINA), CI, versioning and releasing. Decisions are logged in [docs/DECISIONS.md](docs/DECISIONS.md).

| Path | Contents |
| --- | --- |
| `Info.json`, `main.js`, `global.js`, `config.js` | Plugin entry points |
| `src/` | Playback, sources, auth, replay, timers |
| `ui/` | Sidebar and overlay web views |
| `helpers/` | Python helpers: stream resolution and chat acquisition |
| `tests/` | JS (`npm test`) and Python (`npm run test:py`) suites, plus fixtures |
| `scripts/` | Build (`build.py`), dev loop (`dev.py`), version check |
| `qa/` | Diagnostics run by hand, never packaged. Most scripts drive a QA build that no current script produces (#33) |
| `docs/` | Roadmap, release process, decisions, designs. `docs/archive/` holds history |
