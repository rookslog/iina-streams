# Discovery and platforms: research and design (2026-11-22)

Research for the operator's 2026-11-22 request about suggestions in Open Stream, "who's on", several platforms and accounts, and merged chat. Written by a Claude research agent (Opus, high effort as requested) for the lead. Started 19:39 EST, finished 19:52 EST, with the relayed fetch details folded in. No code changed; no credentialed API call was made.

**Labels.** Every claim carries one:
- **READ** means a page was read on 2026-11-22. The URL follows the label. Most pages were fetched by four web-fetch subagents (Sonnet, as requested), which returned quoted sentences; their quotes are relayed here, not re-fetched by me.
- **READ (code)** means a file in this repository, at branch `beta`, commit `ff265c6`.
- **READ (secondary)** means a third-party page or a search-engine summary, not the platform's own documentation.
- **INFERRED** means reasoning from those sources; nobody ran it.

**Terms used below.**
- **Helix:** Twitch's documented REST API (`api.twitch.tv/helix`).
- **GQL:** Twitch's private GraphQL API at `gql.twitch.tv`, which twitch.tv itself uses. It is undocumented. Streams already uses it for playback and offline VODs.
- **Public client:** a Twitch app registered without a client secret, as ours is. See `src/twitch-app.js`.
- **Device code flow:** the sign-in where the user types a short code at twitch.tv/activate. It is our only sign-in (`src/auth.js`).
- **App token:** a token that identifies the application rather than a user.
- **Frecency:** a ranking that combines how often and how recently something was used.
- **global:** the plugin's single background script (`global.js`), which holds the sign-in and Keychain access; each player window runs separately.
- **yt-dlp:** the open-source downloader that Streams' Python helpers call for YouTube.
- **PKCE:** an OAuth extension where the app proves it started the sign-in, used by apps that cannot keep a secret.
- **EventSub:** Twitch's documented event-subscription API, which has a WebSocket transport.
- Issue numbers are GitHub issues in `rookslog/iina-streams`: #2 chat delay modes, #6 accounts and sign-in, #16 latency spike, #19 multi-provider, #20 panel overhaul, #30 Following list, #32 offline VOD picker, #39 YouTube live chat spike, #40 Kick spike. D-numbers are entries in `docs/DECISIONS.md`; D-030 chose public GQL for offline VODs.

## Summary

The operator asked for suggestions while typing, "who's on" ranked by likelihood, popular-now browsing, offline channels' VODs, several platforms and accounts, and merged chat; underneath, they want to get from "I feel like watching someone" to playing in a keystroke or two, organised around **people**, not platforms (INFERRED, §1). Most of it can be built from what Streams already has or can cheaply get: local open history ranked by frecency, the Twitch Following list through Helix with one new scope, and per-platform live checks (§2.1, §2.2). Helix offers no recommendations endpoint, so Twitch's personalised sidebar order is out of reach for a third-party app (READ for the endpoint index, INFERRED for GQL, §2.2), and browser cookies must not be read (INFERRED, §2.3). Signed-out remote typeahead is the awkward case: our Public client cannot get an app token, so only GQL offers it, a risk D-030 already accepts for VODs (READ, §2.1). Kick is blocked for a desktop plugin on documented APIs, since every token grant needs a client secret and chat is readable only through public webhooks (READ, §2.5). YouTube live detection costs 1–2 quota units per channel through the Data API, while live chat's cost at scale is unchecked (READ and unchecked, §2.4). **Recommendation:** build a person-centric local "People" model, ranking typeahead from it in 0.5.6, designing it into the 0.6.0 overhaul, and adding YouTube, then Kick, as providers behind one interface in 0.8.0 (§4–§6).

## 1. What the request is for (reading between the lines)

INFERRED throughout this section, from the operator's words and the journeys in `docs/design/USER-JOURNEYS-2026-11-22.md` (J2 daily viewer, J4 catch-up viewer).

| The literal ask | The need under it | A simpler or better way |
| --- | --- | --- |
| Suggestions while typing a name | Never type a full login, and never misspell one | Rank **channels you have opened before** first. Most opens repeat a handful of people, so local history answers most keystrokes with no network call. Remote search fills in the rest. |
| "Ordered by how likely you are to watch them", like Twitch's sidebar | Who is on that I care about, best first | Streams sees every open, so it can learn "likely to watch" from its own history and can explain the order. Twitch's model is out of reach (§2.2), and ours would cover YouTube and Kick too. |
| Recommendations from cookies when signed out | Personal suggestions without signing in | Local history gives the same thing, with no credential involved (§2.3). |
| Popular and "what's popping" | Something to watch when no favourite is live | A small "Live now on Twitch" shelf. It is the lowest-value item for a returning viewer, so it ranks last. |
| Explore live and offline channels, and their VODs | Catch up on someone I missed | Make a **person** the unit: one row per creator. A live dot when on; recent broadcasts when off. #32 already returns those broadcasts signed out. |
| Several platforms, several accounts, the same creator under different names | Follow a *person* wherever they stream | A user-editable **creator** record that links accounts across platforms (§2.6). Do not try to discover the links automatically. |
| Search across accounts | One search box | One typeahead over the People list plus every provider that can search. Results are grouped by person, not by platform. |
| Merged chats in one or several windows | Follow the conversation around the stream I'm watching | Separate sources in one column, with a platform mark on each message and per-source toggles (§2.7). Caveat: chats from other platforms react to *their* stream, which runs seconds ahead of or behind ours. |

The design gap, then, is a local model of *people the user watches*, not a platform feature. Every platform then contributes what it can: search, live status, follows, VODs and chat.

## 2. Findings by question

### 2.1 Typeahead while typing a channel

- **Today:** Open Stream parses a bare name as a Twitch live channel. The regex is `^[A-Za-z0-9_]{3,25}$` (READ (code): `src/source.js`, `parse`). The window shows no suggestions.
- **Signed in: Helix Search Channels.** `GET /helix/search/channels` accepts "a user access token" or "an app access token", and lists **no scope** (READ: https://dev.twitch.tv/docs/api/reference/search#search-channels). Matching is a case-insensitive prefix: "the broadcaster's login name or display name must begin with the query string", and "close misspellings can also match". Results carry `is_live`, `started_at`, `display_name`, `broadcaster_login`, `thumbnail_url` (the profile image), `game_name` and `title`.
- **Today's token is enough.** Because no scope is listed, the `chat:read` token we already hold should work. INFERRED, not tried.
- **Signed out: Helix is not possible.** Public clients "are only limited to the usage of device authorization grant flow to obtain OAuth tokens", and "cannot use any of the other flows like client credentials". The client credentials flow needs "your app's registered client secret" (READ: https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#device-code-grant-flow). Without an app token, a signed-out user has no Helix at all. The same applies to Get Streams, Get Users and Get Videos, so #32 rightly went to GQL (D-030).
- **Signed out: GQL search.** twitch.tv's search box uses GQL operations named `SearchTray_SearchSuggestions` and `SearchResultsPage_SearchResults` (READ (secondary): https://cdn.jsdelivr.net/npm/twitch-gql-queries@0.1.25/README.md). It would be sent with the public web Client-ID already used in `src/twitch-playback.js` and `src/twitch-vods.js`. Unchecked: whether the suggestions operation answers that Client-ID and includes live status. A one-request real-source probe, like the one D-030 relied on, would settle it.
- **Risk:** same as D-030. A private schema can change without notice; a failure would degrade to local-only suggestions.
- **Local first, in every state.** History, the Following list once #30 lands, and the creator records all match in memory. They answer the first keystroke and work offline. INFERRED.
- **Live status in results:** Helix Search Channels returns it directly. For local matches, a batched live check is needed: Helix `Get Streams` with a batch of `user_login` values when signed in (READ: https://dev.twitch.tv/docs/api/reference/streams#get-streams), or GQL when signed out. The page's per-request limit on `user_login` was not relayed (unchecked).

### 2.2 "Popular now" and "who's on"

- **Popular, signed in:** Helix `Get Streams` with no filter returns live streams "in descending order by the number of viewers". It takes `language` and `game_id` filters, accepts a user or app token, and leaves out "streams that Twitch restricts from discovery" (READ: https://dev.twitch.tv/docs/api/reference/streams#get-streams). Our current token suffices. INFERRED.
- **Popular, signed out:** Helix is impossible (§2.1). The twitch.tv front page's directory comes from GQL. INFERRED; no operation name was read.
- **Who's on: Get Followed Streams.** It needs "a user access token that includes the `user:read:follows` scope". `user_id` "must match the user ID in the access token". The list is "in descending order by the number of viewers", and covers only the first 2,000 followed broadcasters (READ: https://dev.twitch.tv/docs/api/reference/streams#get-followed-streams).
- **Followed channels, offline included: Get Followed Channels.** Same scope. Ordered "by `followed_at` (with the most recently followed broadcaster first)". It has no live field, so it would be joined with Get Streams (READ: https://dev.twitch.tv/docs/api/reference/channels#get-followed-channels).
- **Our current scope:** only `chat:read`. `validate` rejects any token whose scope list is not exactly `['chat:read']` (READ (code): `src/auth.js`, `SCOPE` and `validate`).
- **What adding `user:read:follows` costs:** a change to `SCOPE`, a change to that strict check (by design it rejects broader tokens), and re-consent from every signed-in user. Twitch issues scopes per grant, so an old grant cannot gain one. INFERRED from OAuth semantics; not tested. `src/twitch-helix.js` already implements `followedLive` against this endpoint, and its header records the scope check made on 2026-11-22. That supersedes the "unchecked" note in `USER-JOURNEYS` J2.
- **Twitch's personalised sidebar order:**
  - **Not in Helix.** No endpoint name or one-line description in the reference index mentions recommended, suggested, "for you" or personalised channels; the closest are the followed endpoints, which order by viewers or by follow date (READ: https://dev.twitch.tv/docs/api/reference, index only, relayed by the fetch subagent; longer per-endpoint descriptions were not all opened).
  - **GQL only, and only with a first-party session.** The order would live in GQL operations that twitch.tv sends with the user's own first-party session token, the `auth-token` cookie. An OAuth token from our app would not be accepted there. INFERRED; not tested, and testing it would mean handling that cookie, which §2.3 rules out.
  - **Terms of service:** the current Twitch Developer Services Agreement did not load as text at either https://legal.twitch.com/legal/developer-agreement/ or https://legal.twitch.com/en/legal/developer-agreement/ (both returned only navigation), so no clause was read. A search-engine summary of a developer-forum thread paraphrases a reply as calling GQL undocumented and not intended for third-party use (READ (secondary): https://discuss.dev.twitch.com/t/using-gql-in-3rd-party-software/12427); that is a forum post, not a clause.
  - **Risk rating:** moderate for signed-out public reads (D-030's existing risk). High for anything authenticated through GQL. INFERRED.

### 2.3 Browser cookies: do not read them

The plugin should not read browser cookies. INFERRED, for five reasons:

1. **A twitch.tv session cookie is a full credential.** It acts as the user for everything on the site: account settings, purchases, sending chat. Our OAuth grant is one read-only scope that the user approved and can revoke. Holding the cookie throws away that least-privilege boundary.
2. **It breaks project rules.** AGENTS.md says "never expose tokens" and "never perform account authorization without the operator", and D-029 says credentials stay in global's memory. The helpers already pass `--no-cookies --no-cookies-from-browser` to yt-dlp (READ (code): `helpers/acquire.py`, the yt-dlp argument list). Reading cookies would reverse a choice already made.
3. **It needs access the plugin should not ask for.** Safari keeps cookies inside its container, which macOS protects; reading them needs Full Disk Access. Chrome encrypts them with a Keychain key. Either way, the user must grant broad access to a video-player plugin. INFERRED from macOS and Chrome storage conventions; not checked on this machine.
4. **It is fragile.** Cookie formats and storage change, and the endpoints a cookie unlocks are private.
5. **It costs trust at launch.** A Reddit audience (the 0.6.0 launch) reads "reads your browser cookies" as malware behaviour.

**The alternative:**
- Personal suggestions come from **local history**, which needs no sign-in.
- Account-scoped lists come from **OAuth with a named scope**. The user approves the scope at twitch.tv/activate and can revoke it there. This is the existing device code flow.
- Anything only a cookie could unlock stays out of scope.

### 2.4 YouTube

- **Quota:**
  - The default is "100 `search.list` calls, 100 `videos.insert` calls, and 10,000 units per day combined for all other endpoints" per Google Cloud project (READ: https://developers.google.com/youtube/v3/determine_quota_cost; https://developers.google.com/youtube/v3/getting-started).
  - `search.list` has its own bucket of 100 calls a day, at 1 unit per call (READ: same page, and https://developers.google.com/youtube/v3/docs/search/list).
  - An earlier search summary also reported the older figure of 100 units per call. That conflict is resolved in favour of the current page.
- **Is a channel live:**
  - **`search.list` with `eventType=live`** requires `type=video` and returns "only … active broadcasts" (READ: https://developers.google.com/youtube/v3/docs/search/list). At 100 calls a day per project, it cannot serve a user base. INFERRED.
  - **`videos.list`** with `part=snippet,liveStreamingDetails` costs 1 unit. `snippet.liveBroadcastContent` is `live`, `upcoming` or `none`. `liveStreamingDetails` carries `actualStartTime`, `concurrentViewers` and `activeLiveChatId` (READ: https://developers.google.com/youtube/v3/docs/videos). This needs a candidate video ID first.
  - **The channel's uploads playlist** (`playlistItems.list`, 1 unit) gives that ID, and the search page itself recommends it for a channel's latest uploads (READ: search/list page).
  - **Per check:** 2 units per channel, or 1 when a video ID is already cached. INFERRED.
- **Subscriptions:** `subscriptions.list` with `mine=true` needs "a properly authorized request". It costs 1 unit per page and carries no live status (READ: https://developers.google.com/youtube/v3/docs/subscriptions/list). Scope names were not on the page. Unchecked: Google's OAuth verification requirements for a YouTube read scope in a public app.
- **Live chat:**
  - `liveChatMessages.list` and the newer `streamList` cost 5 units each. The page says "to poll for live chat messages, use the `liveChatMessages.streamList` method" (READ: https://developers.google.com/youtube/v3/live/docs/liveChatMessages/list; https://developers.google.com/youtube/v3/live/docs/liveChatMessages/streamList).
  - **Shared key:** if each `list` poll costs 5 units, 10,000 units a day buys about 2,000 polls for the whole user base, which would rule it out at launch without per-user keys. INFERRED. `streamList` is server-streaming, and whether its 5 units are charged per connection or per message batch was not stated. Unchecked; that question belongs to the YouTube live chat spike (#39).
  - Streams already plays YouTube replay chat through its yt-dlp helper, with no Data API (READ (code): `src/player.js` `fetchReplay`, `helpers/acquire.py`).
- **Policy:** the developer policies forbid scraping (III.E.6). They forbid using "any technology other than YouTube API Services to access or retrieve API Data" (III.I.14). They also restrict storing API data beyond 30 days and showing non-API data "alongside" it (III.E.4) (READ, via the fetch tool's summary of a page it could only partly read: https://developers.google.com/youtube/terms/developer-policies).
  - Verbatim, III.C.5: an API client "must not merge or intermix results from sources other than YouTube and present them as YouTube search results" (READ: same page). A cross-platform typeahead therefore marks each result's platform and never labels a mixed list as YouTube results. INFERRED.
  - Unchecked: the exact wording of III.E.4.h. A merged YouTube-plus-Twitch list or chat built on the Data API needs that clause read verbatim before 0.8.0.
- **Without the API:**
  - The channel page `youtube.com/channel/<id>/live` (or `/@handle/live`) shows the current broadcast when there is one. INFERRED; behaviour not read from any source.
  - The uploads RSS feed `youtube.com/feeds/videos.xml?channel_id=` lists the 15 latest videos, and users report it returning 404s (READ (secondary): https://discuss.ai.google.dev/t/youtube-rss-feed-endpoint-returns-404-errors/113379).
  - yt-dlp, which the helper already ships, can resolve a `/live` URL. INFERRED; not run.
  - All three are page-scraping-class and fragile. Using the helper keeps that fragility where it already lives.

### 2.5 Kick

Kick has an official public API. The docs welcome page launches "KICK's Public API". The base URL is `https://api.kick.com`, with paths under `/public/v1` and `/public/v2`. None of the pages read uses the word "beta". The changelog's earliest entry is 01/04/2025 (day/month), "Added livestreams endpoint"; the latest is 11/08/2026 (READ: https://docs.kick.com/ and https://docs.kick.com/changelog.md).

- **Auth blocks a desktop plugin:**
  - Kick uses OAuth 2.1 with PKCE, and `client_secret` is listed as required for the `authorization_code`, `client_credentials` and `refresh_token` grants (READ: https://docs.kick.com/getting-started/generating-tokens-oauth2-flow.md). No public, secret-less client type is documented. A plugin would have to embed a secret, which then isn't secret, or route tokens through a server we run. INFERRED.
  - Refresh tokens were "made reusable/flexible" on 25/11/2025 (READ: changelog).
- **Search:** none. `GET /public/v1/channels` takes exact slugs, up to 50, and returns `stream.is_live` and `viewer_count` (READ: https://docs.kick.com/apis/channels.md).
- **Live status:** `GET /public/v1/users/livestreams?user_id=`, up to 100 IDs, was added 03/07/2026 (READ: https://docs.kick.com/apis/livestreams.md; changelog).
- **Follows:** no endpoint. A Kick contributor said on 16/06/2026, "This is in the roadmap" (READ: https://github.com/KickEngineering/KickDevDocs/issues/370).
- **VODs:** no endpoint in the docs index (INFERRED from https://docs.kick.com/llms.txt; not every page read).
- **Chat, reading:** webhooks only. "Your webhook URL must be accessible over the public internet". The subscription `method` enum is `["webhook"]` (READ: https://docs.kick.com/events/introduction.md; https://docs.kick.com/events/subscribe-to-events.md). A Kick staffer wrote on 04/07/2025, "WebSocket support is on our roadmap, but we don't have an ETA yet" (READ: https://github.com/KickEngineering/KickDevDocs/issues/183). Unverified apps are limited to 1,000 `chat.message.sent` subscriptions, and a webhook that keeps failing for over a day is unsubscribed (READ: https://docs.kick.com/events/subscribe-to-events.md; https://docs.kick.com/events/webhook-security.md). A desktop plugin cannot receive webhooks without a relay we operate. INFERRED.
- **Chat, sending:** `POST /public/v1/chat` with `chat:write` (READ: https://docs.kick.com/apis/chat.md). It still needs a secret-bearing token.
- **The unofficial socket:** kick.com's own chat uses a Pusher WebSocket that third parties read (READ (secondary): KickDevDocs issues #183 and #370). The terms of service, dated 23 March 2026, prohibit "accessing any content on the Service through any technology or means other than those provided or authorized by the Service" (§1.4(k)), along with scraping (§1.4(a)) and reverse engineering (§1.4(m)) (READ: https://kick.com/terms-of-service).
- **Verdict:** Kick, done properly, needs a small hosted relay for auth and webhooks. That is a project decision, not a plugin feature. Reading the unofficial socket looks barred by §1.4(k) on my reading (INFERRED); a browser-extension author asked Kick exactly that in issue #431, opened 05/10/2026, which had no Kick answer when read (READ: https://github.com/KickEngineering/KickDevDocs/issues/431).

### 2.6 Cross-platform identity

| Approach | Status | Label |
| --- | --- | --- |
| **User-curated creator records:** "these accounts are one person" | Always possible; exact; the user owns the data. Costs a little setup, which an "add account to this creator" affordance on any open channel can reduce. | INFERRED |
| **Links a streamer declares** | Helix exposes no social links. `Get Users` and `Get Channel Information` have none in their full field lists; the only free text is `description` (READ: https://dev.twitch.tv/docs/api/reference/users; https://dev.twitch.tv/docs/api/reference/channels). twitch.tv's About panel shows social links through GQL (INFERRED; no operation read). YouTube channel links live on the About page, so scraping (INFERRED). Use these only as *suggestions* the user confirms; the documented one is a YouTube or Kick URL found in the Helix `description` text (INFERRED). | READ / INFERRED |
| **Third-party aggregators** | No public, documented cross-platform creator map found. TwitchTracker is Twitch-only; Streams Charts returned 403 (READ: https://www.twitchtracker.com/). A dependency on one would be a fourth fragile source. | READ |
| **Detect where a creator is live now** | It follows from creator records: check each linked account's provider for live status and show the live ones. This handles "Kick isn't working today", because the user sees which of the three is actually up. | INFERRED |

### 2.7 Multiple chats

**Precedents:**
- **Restream Chat** reads and replies on Twitch, YouTube and Kick, among others. Replies go to "all your channels" or "a specific channel", picked from a platform-logo dropdown. Chat is "API-dependent" (READ: https://support.restream.io/en/articles/9297258-reply-to-chat-messages; https://support.restream.io/en/articles/2379624-what-is-restream-chat).
- **Kimsec unified-chat** uses one feed, "`timestamp + platform + Name: Message`". It reads Twitch over EventSub WebSocket, YouTube through the Live Streaming API, and Kick through webhooks, which "require a **public HTTPS URL**". YouTube is read-only there, and only Twitch and Kick emotes render (READ: https://github.com/Kimsec/unified-chat).
- **Streamlabs Multichat** shows several platforms "all in one window". Kick is read-only (READ: https://streamlabs.com/multistream/multichat).
- **Social Stream Ninja** captures through "a browser extension or a standalone desktop app", from pop-out chat pages (READ: https://github.com/steveseguin/social_stream).
- **Chatterino** is a Twitch chat client that shows "multiple chats side-by-side in one tab" as splits; the pages read do not mention a merged feed (READ: https://chatterino.com/). Its 7TV fork lists experimental Kick support (READ (secondary): https://newreleases.io/project/github/SevenTV/chatterino7/release/v7.5.5).

**Trade-offs** (INFERRED):

| | Separate panes | One merged column |
| --- | --- | --- |
| Space in IINA | Costly: the side-chat column is one margin (D-028), and two panes halve it | Fits the existing column |
| Attribution | Implicit, by pane | Needs a platform glyph per message |
| Moderation and reply | Obvious target | Must follow the *source message's* platform; a send box needs a target picker (Restream's model) |
| Emotes and badges | Per-platform renderer per pane | Same renderers, chosen per message by provider; text-only fallback for a platform we can't render (unified-chat's YouTube) |
| Timing | Each pane can carry its own delay | Each source reacts to its own stream, offset from the one being watched. A merged view must align each source with its own measured offset (the #2 and #16 machinery), or label which messages are early or late. |
| Signal-to-noise | Volume per source is visible | A large chat drowns a small one; per-source toggles fix it |

## 3. Feasibility table

"Now" means buildable with today's code and grants. *Needs* lists what is missing. "GQL risk" is D-030's: the schema may change without notice, and a failure degrades to the next fallback.

| Idea | Possible now? | Needs | Risk | Source |
| --- | --- | --- | --- | --- |
| Typeahead from local history and Following | Yes, once history is recorded | Local storage only | Low | INFERRED |
| Typeahead, Twitch, signed in (Helix Search Channels, with live status) | Yes | Current `chat:read` token; no scope listed | Low: documented | READ: https://dev.twitch.tv/docs/api/reference/search#search-channels |
| Typeahead, Twitch, signed out, via Helix | **No** | An app token, which a Public client cannot get | n/a | READ: https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/ |
| Typeahead, Twitch, signed out, via GQL search | Probably; unchecked | Public web Client-ID (already in code) | GQL risk; terms unread | READ (secondary): https://cdn.jsdelivr.net/npm/twitch-gql-queries@0.1.25/README.md |
| Popular now, signed in (Get Streams by viewers) | Yes | Current token | Low | READ: https://dev.twitch.tv/docs/api/reference/streams#get-streams |
| Popular now, signed out | Only via GQL | Public web Client-ID | GQL risk | INFERRED |
| Who's on: followed live streams | Code exists (`src/twitch-helix.js`) | `user:read:follows`, plus re-consent and an `auth.js` change | Low | READ: https://dev.twitch.tv/docs/api/reference/streams#get-followed-streams |
| Followed channels, offline included | Yes, with the same scope | `user:read:follows` | Low | READ: https://dev.twitch.tv/docs/api/reference/channels#get-followed-channels |
| Twitch's personalised sidebar order | **No** for a third-party app | A first-party session (cookie) | High: credential handling and terms | INFERRED |
| "Likely to watch" order from Streams' own history | Yes | Local history | Low | INFERRED |
| Offline channel's VODs (#32) | Yes (D-030) | Nothing | GQL risk, already accepted | READ (code): `src/twitch-vods.js` |
| Read browser cookies | Should not | Full Disk Access or Keychain | High | INFERRED (§2.3) |
| YouTube: is a channel live | Yes, with an API key: 1–2 units per channel | Google Cloud project key | Shared quota of 10,000 units a day | READ: https://developers.google.com/youtube/v3/determine_quota_cost |
| YouTube: is a channel live, no key (yt-dlp `/live`) | Probably; unchecked | Existing helper | Scraping-class fragility; policy III.E.6 applies only to API clients | INFERRED |
| YouTube subscriptions | With Google OAuth | Google OAuth app, possibly verification (unchecked) | Verification effort | READ: https://developers.google.com/youtube/v3/docs/subscriptions/list |
| YouTube live chat via API | Unchecked at scale (#39) | 5 units per `list` call; `streamList` billing unclear | Quota exhaustion | READ: https://developers.google.com/youtube/v3/live/docs/liveChatMessages/streamList |
| Kick search | **No** (exact slug lookup only) | App token, which needs a secret | n/a | READ: https://docs.kick.com/apis/channels.md |
| Kick live status | Only with a secret-bearing token | A relay we host | Running a server | READ: https://docs.kick.com/apis/livestreams.md |
| Kick follows and VODs | **No** endpoint | n/a | n/a | READ: https://github.com/KickEngineering/KickDevDocs/issues/370 |
| Kick chat, read | Webhooks only | Public HTTPS relay | Unofficial socket likely barred by terms §1.4(k) (my reading; issue #431 unanswered) | READ: https://docs.kick.com/events/introduction.md; https://kick.com/terms-of-service |
| Creator records linking accounts | Yes | Local storage and a small UI | Low | INFERRED |
| Auto-discover a creator's other accounts | Not via documented APIs | GQL or scraping | Fragile; wrong links | READ: https://dev.twitch.tv/docs/api/reference/users |
| Merged multi-platform chat | Twitch now; YouTube replay now; YouTube live and Kick blocked as above | Per-provider chat adapters | Timing alignment | READ: https://github.com/Kimsec/unified-chat |

## 4. Proposed platform abstraction

INFERRED design. It fits the current split: credentials and Helix calls live in global (D-029); public GQL calls can run in global or the player (D-030); `src/source.js` already tags each parsed input with `provider`.

```js
// One object per platform. Every method is optional; capabilities() says which exist and what each needs.
// Every method takes {signal} and resolves; failures reject with Error.code in
// NEEDS_PERMISSION | SIGNED_OUT | RATE_LIMITED | NETWORK | MALFORMED | UNSUPPORTED (as src/twitch-helix.js does today).
const provider = {
  id: 'twitch',                         // 'twitch' | 'youtube' | 'kick'
  capabilities(session) {               // session: this provider's sign-in state, held in global
    return {search: 'public'|'account'|'none', live: …, popular: …, follows: …, vods: …, liveChat: …, replayChat: …, send: …};
  },
  parse(text),                          // -> Channel | Video | null   (src/source.js today)
  search(query, {limit}),               // -> Channel[]  prefix match, with live status where the provider gives it
  live(channels),                       // -> Map<channelKey, Stream|null>  batched (Kick: 100 user IDs; YouTube: 1–2 units each)
  popular({language}),                  // -> Stream[]
  follows(),                            // -> Channel[]  (account-scoped; offline included where possible)
  vods(channel, {limit}),               // -> Video[]
  chat: { live(channel, sink), replay(video, sink) },  // emits ChatMessage; returns {stop()}
  resolve(source, quality),             // playback (src/resolve.js today)
};

// Shapes shared by every provider
Channel     = {provider, id, login, name, avatar}
Stream      = {channel, title, category, viewers, startedAt}
Video       = {provider, id, channel, title, duration, createdAt, url}
ChatMessage = {provider, channelKey, id, time /* server time, for delay alignment */,
               author: {name, color, badges: [ProviderRef]}, fragments: [{text}|{emote: ProviderRef}], replyTo}

// Above the providers, owned by Streams (local, user-editable):
Creator     = {id, name, accounts: [{provider, channelId, login}], pinned}
History     = [{provider, channelId, kind: 'live'|'vod', openedAt, watchedSeconds}]   // feeds frecency
```

How the layers fit (INFERRED):
- **Typeahead** queries every provider whose `capabilities().search` is not `none`, and Creators and History locally. It merges results by Creator, then ranks: frecency (opens weighted by recency), then live status, then remote match quality. The local tier answers synchronously; remote results stream in under a short debounce and never reorder rows already under the pointer.
- **"Who's on"** calls `live()` across all of a Creator's accounts.
- **Chat:** the chat view takes any number of `ChatMessage` sinks. Each source keeps its own delay offset, using the #2 timing machinery.
- **Scopes and keys stay per provider.** A missing grant is a `capabilities()` value the UI can show, not an error.

## 5. Phasing onto the roadmap (D-026)

D-026's timeline is 0.6.0 tonight and 0.8.0 within a week, so each slot gets only what fits it. INFERRED.

| Release | What fits | Why there |
| --- | --- | --- |
| **0.5.6** "find what to watch" | 1. Record **open history** locally (provider, channel, time). 2. **Typeahead in Open Stream** from history, plus Following once #30 lands. 3. Helix Search Channels when signed in (no new scope). 4. #30 with `user:read:follows`: change `SCOPE` and the exact-scope check in `src/auth.js`, then one re-consent. 5. Optionally, GQL search when signed out, after a one-request real-source probe, under D-030's risk. 6. Shape the Twitch code behind the §4 interface, with no new providers. | Small, Twitch-only, and mostly local. It reuses `src/twitch-helix.js`. The typeahead covers the operator's main complaint ("forced to type the whole thing") without any new platform. |
| **0.6.0** overhaul and launch | Design the **People** surface into the overhaul (#20): live now, recent, and all, with recent broadcasts on offline rows (#32). A small "Live now on Twitch" shelf from Get Streams when signed in. No cookie features. | The overhaul designs every screen at once (D-026), so this list should be drawn there, not retrofitted. |
| **0.7.0** talk back | Chat sending needs a write scope. Ask for it when sending ships, not earlier. | Least privilege: a user approves a write scope when the feature that uses it exists. Cost: a second re-consent after 0.5.6. |
| **0.8.0** platforms and accounts (#6, #19, #39, #40) | Accounts (#6): one sign-in per provider; a second account on the same provider is out of scope until someone asks for it (INFERRED reading of "manage multiple accounts"). YouTube provider: live status via yt-dlp `/live`, or Data API with a user-supplied key, not both, since a Data API client that also scrapes may fall under policy III.E.6 (unchecked); replay chat (exists); live chat behind spike #39. **Creator records** and "live anywhere". Multi-source chat column with per-source toggles. **Kick spike #40** decides between a hosted relay, waiting for Kick's WebSocket, or dropping Kick. | Each platform's blockers (quota, secret, webhooks) are spike-sized questions, not features. |

## 6. Recommendation and alternatives

**What it is.** You are choosing the discovery model that typeahead, "who's on", multiple platforms and merged chat all rest on; it is yours because it sets how much private-API risk the product carries and whether Streams is a *people-you-watch* player or a *platform browser*, which D-030 already leaves to your preference.

**The options:**

| Option | What it buys | What it costs |
| --- | --- | --- |
| **A. People-first, local model** (recommended): history and creator records rank everything; providers add search, live status, VODs and chat as they can | Fast typeahead offline and signed out; "likely to watch" that we control and can explain; one model that spans platforms; no cookies | A new local store and UI; signed-out remote search still needs GQL or is absent |
| **B. Platform mirror:** reproduce each platform's sidebar, recommendations and search through its private APIs | Closest to twitch.tv's feel; discovery of new channels | Authenticated GQL means first-party session handling (§2.2); per-platform fragility; nothing spans platforms |
| **C. No new GQL uses:** Helix when signed in, local history otherwise; keep only today's GQL (playback in `src/twitch-playback.js`, offline VODs per D-030) | No new private-API surface | No signed-out remote search or popular list. Going further, to documented-only, is not possible: signed-out playback and VODs have no Helix route without an app token (§2.1) |
| **D. Defer:** ship #30 and #32 as planned, and keep bare-name typing | Zero new work before 0.6.0 | The operator's main complaint (typing whole names) stays open at launch |

**My recommendation, and why:** A, allowing GQL only for signed-out public reads (search, VODs) as D-030 does, because local history answers the commonest case (reopening someone you watch) before any network call, works signed out, needs no cookies or first-party session, and is the only route to a cross-platform "likely to watch" order.

**The load-bearing assumption:** most opens are repeat visits to a small set of creators. That is what makes local frecency outrank any platform recommendation. INFERRED; unmeasured.

**What would flip it:**
- **Discovery over repeat viewing.** If the operator mostly wants to find *new* channels, B's recommendation and popular surfaces matter more, and the case shifts toward B for signed-out browsing. Test: count repeat versus first-time channels over a week of recorded history, from 0.5.6 step 1, or ask the operator.
- **GQL blocked.** If GQL starts rejecting the public web Client-ID, A loses signed-out remote search but keeps its local tier, which is the same as C.
- **Documented APIs only.** If the operator states that preference, choose C.

## Sources not read, and what would settle them

- The current Twitch Developer Services Agreement text: the page rendered no text for the fetch tool. Read it in a browser before relying on GQL for anything new.
- YouTube developer policy III.E.4.h, verbatim. It governs showing YouTube API data next to other platforms' data.
- Whether GQL `SearchTray_SearchSuggestions` answers the public web Client-ID with live status: one unauthenticated request.
- Whether Helix Search Channels accepts our `chat:read` token in practice: one signed-in request, made by the lead under the operator's grant.
