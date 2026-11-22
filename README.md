# IINA Streams

Watch Twitch and YouTube in [IINA](https://iina.io), with chat beside or over the video.

<!-- GIF: docs/media/demo.gif, recorded by the lead -->

## Install

**Requirements**

- macOS with [IINA](https://iina.io) 1.5.1. `Info.json` sets no minimum IINA version, and 1.5.1 is the only version the project has tested. <!-- unverified: other IINA versions, and which macOS versions and CPU architectures work; only IINA 1.5.1 on Apple silicon is documented in the repo -->
- [Homebrew](https://brew.sh), then `brew install streamlink yt-dlp`.
- `python3`. The plugin uses `/opt/homebrew/bin/python3` if it exists and `/usr/bin/python3` otherwise. <!-- unverified: that macOS's own /usr/bin/python3 works without installing Xcode Command Line Tools -->
- Node.js is passed to yt-dlp as a JavaScript runtime for YouTube (`/opt/homebrew/bin/node`). <!-- unverified: whether YouTube playback fails without Node installed; the code passes the flag but this was not tested -->

**Where it looks for tools.** The video helper expects Streamlink at `/opt/homebrew/bin/streamlink` and yt-dlp at `/opt/homebrew/bin/yt-dlp`. These paths are fixed in the code (`helpers/media.py`). The chat-replay helper (`helpers/acquire.py`) finds yt-dlp on the `PATH` it is started with, then falls back to the same Homebrew path. **Intel Macs with Homebrew in `/usr/local` are not found**, and a Streamlink or yt-dlp installed any other way is not either. <!-- unverified: whether a symlink in /opt/homebrew/bin fixes this on Intel -->

**Install the plugin**, either way:

1. Download `iina-streams-<version>.iinaplgz` from the [latest GitHub Release](https://github.com/rookslog/iina-streams/releases/latest) and open it with IINA.
2. Or in IINA, **Settings › Plugins › Install from GitHub**, then enter `rookslog/iina-streams`.

**Update.** IINA's GitHub install checks `Info.json`'s `ghVersion` on `main` against the installed one, and offers the update when it is higher. <!-- unverified: how and when IINA shows the update prompt in the UI; this is read from IINA's source as described in docs/RELEASE.md, not observed --> To update by hand, install the newest Release again.

## Use

- **Open a stream:** **Plugin › Streams › Open Stream…** (⌃⌘O). Paste a Twitch channel or VOD URL, a YouTube video or livestream URL, or a bare Twitch channel name.
- **Open another:** press **＋** in the Streams sidebar header and enter a channel or URL.
- **Quality:** the Streams sidebar has a quality menu and switches in the same window.
- **Sidebar or overlay:** in the sidebar, **⚙ Chat settings › Display** chooses *Sidebar* or *Over video*. The overlay can be dragged and resized from its corner. The same panel sets text size, spacing, glass opacity and timestamps (off, `12:34` or `12:34:56`).
- **Twitch live chat:** click **Sign in with Twitch**, then **Approve on Twitch**. Streams shows a device code, opens Twitch with the code filled in, and you approve there. The requested scope is read-only `chat:read`: Streams cannot send messages. Streams ships its own Twitch app ID; **Use a different Client ID** lets you use your own. **Sign out** is in the same panel.
- **Twitch VOD chat:** needs no sign-in. Chat loads in windows around the playback position and follows seeks.
- **YouTube chat:** replay chat loads for a finished livestream or video that has it. A live YouTube stream plays without chat.

## Support matrix

| | Plays | Chat |
| --- | --- | --- |
| Twitch live | Yes, through Streamlink | Yes, after Twitch sign-in |
| Twitch VOD | Yes, through Streamlink | Yes, replayed in time windows, no sign-in |
| YouTube video | Yes, through yt-dlp | Replay chat, when the video has it <!-- unverified: how many finished videos have replay chat available; the helper fetches it with yt-dlp and reports an error if none --> |
| YouTube live | Yes, through yt-dlp | **No.** Replay loads after the stream ends |

Basis: `src/source.js` for accepted URLs, `helpers/media.py`, `helpers/acquire.py` and `src/player.js` for chat. The table states what the code does. A native run on each row was not repeated for this README. <!-- unverified: an end-to-end native check of every row on the current build -->

## Known limits

- Chat is read-only. Sending is not built.
- No emotes or badges yet: emotes show as words. <!-- unverified: confirm against the build you ship; the journey doc dated 2026-11-22 lists this as open (#34) -->
- Twitch live chat can run ahead of the video when you pause or rewind; there is no delay setting yet. <!-- unverified: same, #2 and #28 -->
- Twitch VOD chat comes from Twitch's public API, which can miss messages in very dense same-second bursts.
- Only Twitch and YouTube URLs are accepted. Twitch clips and Twitch pages that are not a channel or `/videos/<id>` are not.
- Dependencies are not bundled and the tool paths are fixed (see Install).
- **Plugin › Reload All Plugins** crashed IINA 1.5.1 once (which plugin caused it is unconfirmed). Quit and reopen IINA instead.

## Privacy

Streams runs on your Mac, has no servers of its own and no telemetry. Your Twitch login is kept in the macOS Keychain. What is stored where, and what it connects to: [docs/PRIVACY.md](docs/PRIVACY.md).

## Report a bug or suggest something

[Open an issue](https://github.com/rookslog/iina-streams/issues/new/choose) and pick **Something isn't working** or **Idea**. Never paste tokens, device codes or signed stream URLs.

## License

[MIT](LICENSE).

## Development

[docs/RELEASE.md](docs/RELEASE.md) covers the plugin identities (stable, beta, dev), the dev loop, CI and releasing. The plan is in [docs/ROADMAP.md](docs/ROADMAP.md) and decisions are in [docs/DECISIONS.md](docs/DECISIONS.md).

| Path | Contents |
| --- | --- |
| `Info.json`, `main.js`, `global.js`, `config.js` | Plugin entry points |
| `src/` | Playback, sources, auth, replay, timers |
| `ui/` | Sidebar and overlay web views |
| `helpers/` | Python helpers: stream resolution and chat acquisition |
| `tests/` | JS (`npm test`) and Python (`npm run test:py`) suites, plus fixtures |
| `scripts/` | Build, dev loop, version check |
| `qa/` | Diagnostics run by hand, never packaged |
| `docs/` | Roadmap, release process, decisions, designs. `docs/archive/` holds history |
