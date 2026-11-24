# Privacy

Streams runs entirely on your Mac. It has no servers of its own, no analytics, and no telemetry. Nothing is sent to the developer.

## What it stores

| What | Where | Why |
| --- | --- | --- |
| Your Twitch login: access and refresh tokens, plus the app ID they belong to | macOS Keychain, item `<plugin id> - twitch-readonly` | Keeps you signed in. **Sign out** revokes the login at Twitch and overwrites this item with a signed-out marker. |
| Your own Twitch Client ID, only if you entered one | IINA plugin data, `twitch-client.json` | Uses your own Twitch app instead of the built-in one |
| Display settings: layout, text size, timestamps, overlay position | IINA plugin data, `settings.json` | Remembers how you like chat shown |
| Recent session steps: state flags and timestamps, no addresses or messages | IINA plugin data, `last-session.json` | Diagnosing problems |
| Beta and Dev builds only: recent sign-in steps, such as request paths and status codes, with no tokens | IINA plugin data, `beta-global.json` | Diagnosing sign-in problems |
| Chat replay downloads | IINA plugin data, temporary files | Replay chat for VODs and finished livestreams; removed when no longer needed |

IINA plugin data lives in `~/Library/Application Support/com.colliderli.iina/plugins/.data/<plugin id>/`.

## What it connects to

- **Twitch:**
  - `id.twitch.tv`: sign-in, token checks and refresh, and sign-out revocation, with the read-only `chat:read` permission;
  - `www.twitch.tv`: opened in your browser only when you click **Approve on Twitch**;
  - `dev.twitch.tv`: opened in your browser only if you choose **Use a different Client ID** and click **Open Twitch Developer Console**;
  - `irc-ws.chat.twitch.tv`: live chat (read-only WebSocket);
  - `static-cdn.jtvnw.net`: official Twitch emote images in live chat, loaded by the sidebar and overlay chat views when a message contains an emote;
  - `gql.twitch.tv`: signed-out playback tokens and stream titles, live-status checks, an offline channel's recent broadcasts, and VOD chat replay;
  - `usher.ttvnw.net`: stream and VOD quality playlists (or through Streamlink as a fallback);
  - `*.ttvnw.net`, `*.twitchcdn.net`, and Twitch's CloudFront VOD hosts (`*.cloudfront.net`): video and audio playback in IINA, plus live playlist polling on `*.ttvnw.net` or `*.twitchcdn.net` to keep live chat timing synced.
- **YouTube:**
  - `www.youtube.com`: video info and replay chat through yt-dlp;
  - `*.googlevideo.com`: video and audio playback in IINA.

Streams contacts these services only when you open a stream or sign in.

## The built-in Twitch app

Streams signs in through its own registered Twitch application, **IINA Streams**. It is a public client, so it has no secret. Twitch shows that app name when you approve. You can use your own Twitch app instead: in the sign-in panel, choose **Use a different Client ID**.
