# Spike #37: Twitch resolution and VOD chat in plugin JS, YouTube through IINA's yt-dlp

Date: 2026-11-22. Base: `c3d6fd9` (beta). Issue: #37, parent goal #36 (fresh Mac, only IINA installed).
Prototype and scripts: `spikes/out-of-box/`. Nothing in `src/`, `ui/`, `helpers/`, `global.js`, `main.js`, `tests/` was edited.
Host: this Mac (Apple Silicon, IINA 1.5.1, Streamlink 8.6.3, yt-dlp 2026.08.19 both in Homebrew/pip and in IINA.app), a single network location (ad serving is geo-dependent), one run unless stated. No docs index, roadmap or other doc was updated; this report and `spikes/out-of-box/` are the only additions.

Labels: **VERIFIED** = I ran or measured it. **INFERRED** = reasoned from source or from a measurement that does not test it directly. Playback access tokens, signatures and signed URLs were never printed or saved. One exception: my first debug run printed a master playlist's `SESSION-DATA` lines to the session output once, and one of them is the viewer IP the usher echoes; it was not written to any file, and the script now prints only `EXT-X-STREAM-INF` lines. Only shapes, counts, hosts and timings appear in this report.

## Existing defects found at `c3d6fd9` (route these; the helpers are not mine to edit)

1. **Twitch VOD playback fails with `UNSAFE_MEDIA_URL`** for VOD `2935383720` (one VOD tested). `media.py` allows exactly one CloudFront tenant (`d2vi6trrdongqn.cloudfront.net`); this VOD's playlists are on `d1m7jfoe9zdc1j.cloudfront.net` (Streamlink returned that host for all 8 streams). VERIFIED by running `media.py resolve`. One VOD on a second tenant proves that more than one tenant exists, not how many; the allow-list should be pattern-based or dropped for URLs only mpv fetches. `Info.json` `allowedDomains` applies to `iina.http` calls (INFERRED for mpv, see below).
2. **YouTube resolve and replay can fail with `OUTPUT_LIMIT`** when `--dump-single-json` exceeds 8 MiB. VERIFIED on `fTDvp9CBXoQ` (`media.py`, 11.7 MB; automatic_captions is 11.15 MB of it) and on `zn1dXa6W7t4` (`acquire.py`, same error; the automatic_captions share there is INFERRED). `Yd9q1Y7Ou7g` and the NASA live stream pass. A trimmed invocation is in Q3 caveat 5.

## Recommendation for #36

| Dependency today | Replacement | Verdict |
|---|---|---|
| Streamlink (Twitch live and VOD URLs) | Plugin JS: GraphQL `PlaybackAccessToken` + usher master playlist through `iina.http`, hand mpv the chosen variant URL | Works in the prototype, plays in mpv, 4.6-7x faster to resolve than Streamlink (medians); ads and offline-channel edge cases need follow-up |
| Python for Twitch VOD chat windows | Plugin JS: same persisted GraphQL query, same pagination | Same 440 messages as the Python helper on the same window; half the wall time |
| Python importer (`replay.py`) | Plugin JS for archives the plugin itself fetches (at most 64 MB); no JS replacement for the 1 GB user-import path | Movable with a lower size cap |
| yt-dlp for YouTube (Homebrew) | IINA's bundled `youtube-dl`, executed with `iina.utils.exec("youtube-dl", ...)` or its absolute path | Works with IINA's minimal environment for VOD, live and live-chat replay; costs a fixed ~5 s startup per run; no way to cancel a running process |
| Python as the helper runtime | Remove once the three items above move; `/usr/bin/python3` on a fresh Mac is a Command Line Tools stub | Stub behaviour INFERRED, not tested on a fresh Mac |
| Rust compiled helper | Not warranted | Measured Python overhead is about 30 MB and 0.1 s CPU for chat windows; the costly children (yt-dlp, Streamlink) are not Python |

Decision: Twitch resolve and Twitch VOD chat move to JS; YouTube resolve and YouTube replay acquisition go through IINA's yt-dlp; delete Python only after the replay importer is ported. The prototype's weakest evidence is ad handling (no ad was observed) and the real `iina.http` runtime (not run; modelled from source).

## What `iina.http` and `utils.exec` can do (IINA v1.5.1 source)

Read from `JavascriptAPIHttp.swift`, `JavascriptAPIUtils.swift`, `Utility.swift` and the Just library (`Just.swift`) that `iina.http` wraps. VERIFIED by reading; not by running a plugin.

`iina.http` (`get/post/put/patch/delete/download`):
- Options read: `params` (query), `headers` (string map), `data` (object). No `json`, raw body, timeout, redirect or cookie option is exposed.
- **Trap: `params` and `headers` are cast with `as? [String: String]`.** One non-string value (a JS number, boolean) makes the whole map silently absent. The first prototype sent `p: Math.floor(...)`; the shim now models the drop, and VERIFIED against the live usher: with a numeric `p` the `params` map is dropped, the request goes without `sig`/`token`, and usher answers 403. Every param and header value must be a string. (The first version of the shim coerced with `String()` and would have hidden this.) `data` is `[String: Any]` and takes numbers and nested objects.
- Body: if `data` is non-empty and a `Content-Type` header equals `application/json` (case-insensitive), `data` is sent as JSON; otherwise it is form-urlencoded. A top-level JSON array body is not possible, so Twitch's batched GraphQL form (an array of operations) is out; a single-operation object is fine.
- Response object has only `statusCode`, `reason`, `data` (parsed JSON or null), `text` (UTF-8 string or null). No response headers, no binary body, no streaming.
- Status 400-599 and transport failures reject with the same object, `text` included.
- The host must match the plugin's `allowedDomains` (`hostIsValid`); read from source. That this check does not apply to URLs mpv fetches is INFERRED (I did not read the mpv loading path; playback in mpv from the same URLs worked in my headless runs, which say nothing about IINA's own checks).
- Redirects followed, cache disabled, one shared `URLSession`, so connections are reused (INFERRED from `Just`'s single session; not measured in IINA).

`iina.utils.exec(file, args, cwd, stdoutHook, stderrHook)`:
- Needs the `file-system` permission (already in Info.json).
- A bare name (no `/`) is looked up first in `~/Library/Application Support/com.colliderli.iina/bin` (empty on this Mac), then in `IINA.app/Contents/MacOS`, which holds `youtube-dl`. So `exec("youtube-dl", [...])` works without an absolute path, and a user-installed newer binary in `bin/` would take precedence.
- An absolute path also works (`file.first == "/"`), so `/Applications/IINA.app/Contents/MacOS/youtube-dl` is allowed. The bundle path is only run, never modified.
- Child environment is exactly `{LC_ALL: en_US.UTF-8}`: no `PATH`, no `HOME`.
- No timeout, no kill/cancel handle, no stdin. A running process cannot be stopped from the plugin; the plugin can only ignore its result.
- stdout is decoded per read chunk with `String(data:encoding:.utf8)`; a chunk that ends inside a multi-byte character fails to decode and is silently dropped (INFERRED effect). Not triggered here because yt-dlp's `--dump-single-json` and `--print ...j` output is pure ASCII (VERIFIED on a Japanese-title search result: 0 non-ASCII bytes).

The prototype's shim (`spikes/out-of-box/iina-http-shim.mjs`) enforces these limits on Node's `fetch`. It cannot reproduce URLSession behaviour (default headers, TLS, connection reuse, how JSC numbers bridge into JSON).

## Q1. Twitch live and VOD playback URLs from plugin JS

**Answer: yes.** VERIFIED for one live channel (`xqc`, about 30k viewers) and one VOD (`2935383720`).

Recipe, copied from Streamlink 8.6.3's `twitch.py` and unchanged in behaviour: POST `https://gql.twitch.tv/gql` with the web Client-ID and the `PlaybackAccessToken` persisted-query hash (`isLive`/`isVod`, `playerType: embed`, `platform: site`), then GET `https://usher.ttvnw.net/api/v2/channel/hls/<login>.m3u8` (live, with `fast_bread=true`) or `/vod/v2/<id>.m3u8` (VOD, `nauth`/`nauthsig`), then parse the master playlist. Everything the plugin needs fits `iina.http`: JSON POST via `Content-Type: application/json`, query parameters via `params`, text response.

| Check | Streamlink 8.6.3 | JS prototype (shim) |
|---|---|---|
| Live variants | `audio_only, 160p30, 360p30, 480p30, 720p60, 1080p60` (+ `best`, `worst`) | the same six, named from `STABLE-VARIANT-ID` (with `multigroup_video=true` the master has no `EXT-X-MEDIA`; naming from it yields empty names, which I hit first) |
| VOD variants | same six | the same six |
| Resolve time, live, N=8 interleaved | median 1285 ms (range 1150-1748) | median 182 ms (first call 354 ms cold) |
| Resolve time, VOD, N=8 | median 1189 ms | median 256 ms (first 382 ms) |
| Offline channel | no streams | usher returns 404 (VERIFIED), nonexistent channel: token is `null` (VERIFIED) |
| Plays in mpv 0.41.0 (Homebrew; IINA embeds libmpv, a different build), 8 s, `--vo=null --ao=null` | not run through mpv | variant URL: mpv printed the video track line at 0.7-1.2 s (not a decoded frame); master URL: 3.9-5.2 s (mpv chose 1080p60). Exit 0 in all four runs; the live variant run also logged `[ffmpeg] tls: Unknown error` (not seen on the other runs; not investigated) |

Streamlink's timings include Python start-up and a media-playlist check for every variant, which the JS path skips (it would not detect a channel that is listed but whose playlist is not yet reachable; Streamlink's comment says its GQL live status can lag by a minute). So the comparison favours JS partly because it does less. The JS numbers are Node `fetch` in-process on a warm DNS cache, not IINA's JSC.

Hand mpv the variant URL, not the master. It matches what `media.py` returns today (`stream.url` is a per-variant playlist), keeps the quality picker, and starts about 4 s sooner.

**Ads.** Not observed, so ad handling is **unverified**. I took 44 media-playlist polls across 10 distinct live channels (xqc 18 polls in 6 fresh sessions, k4sen and theburntpeanut 8 fresh sessions with one poll each, plus a single-poll sweep of the 10 largest live channels, which includes those three). None contained a `stitched-ad` DATERANGE or ad-titled segment; the only daterange classes were `timestamp`, `twitch-session`, `twitch-stream-source`, `twitch-trigger`. The token said `show_ads: true, server_ads: true, adblock: false, subscriber: false`, so ads were allowed, just not served in these samples. What the source does license: Streamlink only skips ad segments while it itself reads segments (`TwitchHLSStreamWorker`). `media.py` passes mpv a bare URL, so ad skipping is already not in effect in the current design; stitched ads, if present, reach mpv either way (INFERRED from the source and `media.py`, not tested with an ad present).

**Low latency.** With `fast_bread=true` the media playlist carries 2 `EXT-X-TWITCH-PREFETCH` tags, without it 0 (VERIFIED; the usher URL Streamlink builds always sets it, so the prototype matches). Segment duration was 2 s either way. Newest full segment lag was 0-1.7 s with and without prefetch; the lag at FFmpeg's default live start point (third segment from the end) was 6.0-7.7 s in both (4 samples each, local clock). mpv appears not to use the prefetch tags (INFERRED: the demuxer ignores unknown tags; I did not test a latency difference in a player). Conclusion: no low-latency difference between Streamlink-derived and JS-derived URLs for mpv.

Other observations:
- User-Agent: both a Chrome UA and a URLSession-like `IINA/1.5.1 CFNetwork/... Darwin/...` UA were accepted (VERIFIED, live). The plugin should still set `User-Agent` explicitly (Streamlink does, for issue 6574).
- Token JSON contains `device_id`, `user_ip`, `user_id`; never log it. The master playlist echoes the viewer IP in `SESSION-DATA`.
- `usher` URLs and media URLs are signed and short-lived; resolve at playback start, not at plugin load.
- Client-integrity token: Streamlink falls back to a browser-acquired integrity token only if the first token request fails. It never failed here. The fallback needs a headless browser and is not reproducible in plugin JS (INFERRED); if Twitch starts requiring it for anonymous viewers, JS resolution stops working.

## Q2. VOD chat windows in JS

**Answer: yes, fully.** `helpers/acquire.py` `twitch_acquire` already uses plain `urllib` against the same public GraphQL persisted query (`VideoCommentsByOffsetOrCursor`, offset pagination, no cookies, no token). `spikes/out-of-box/twitch-vod-chat.mjs` ports it line for line (same bounds: 50 s, 64 pages, 15 000 messages, 8 s lookback, 60 s lookahead; same normalisation) through the shim.

VERIFIED on VOD `2935383720` at 3600 s: Python and JS both made 11 pages and produced 440 messages spanning 3589-3667 s with the same id set (0 ids only in one side). 436 of 440 records are byte-identical by position; the other 4 are two swapped pairs of messages with the same second, because the server returns same-second messages in varying order between requests. Wall time: JS 2.2 s (11 pages at about 190 ms), Python 4.2 s in the same session. `urllib` opens a new TLS connection per page (about 350 ms per page), while `iina.http` should reuse one session (INFERRED, not measured in IINA). Output size 68 KB.

What stays the same: Twitch's offset pagination is lossy in bursts; this undocumented operation can change its hash.
What JS changes: cancellation becomes a generation check between pages (page requests cannot be aborted, which is acceptable at 0.2 s per page). Writing the result is `iina.file.write`.

## Q3. YouTube through IINA's bundled yt-dlp

**Answer: yes for VOD, live and chat-replay download, with caveats.** `IINA.app/Contents/MacOS/youtube-dl` is a 37 MB universal Mach-O (x86_64 + arm64), version 2026.08.19, no Python needed. All runs below used the exact `iina.utils.exec` environment: `env = {LC_ALL: en_US.UTF-8}` only.

| Case | Result (VERIFIED) |
|---|---|
| VOD `fTDvp9CBXoQ` (45 min) | 188 formats, heights 144-2160, codecs avc1/vp9/av01, all with URLs. Wall 7.0-7.7 s, CPU 1.6 s, RSS 103-133 MB |
| Live `ROboUHfPUrU` | 7 HLS formats, 144-720p avc1, `is_live`. Wall 6.1-6.8 s |
| VOD `Yd9q1Y7Ou7g` (4.9 h) | 47 formats up to 1080p, `live_chat` track `youtube_live_chat_replay`. Wall 6.6 s |
| Chat replay download for `zn1dXa6W7t4` (44 min), same flags as `acquire.py` | 2.36 MB, 1734 lines in 13.2 s wall, CPU 1.7 s, peak tree RSS 119 MB. End to end: `replay.py import` accepted that file (1732 messages, 2 chunks, 0.27 s) and the JS importer port also gives 1732 |
| Throughput of a 720p avc1 URL obtained with no JS runtime | 6 MB at 18.8-20.8 MB/s in 5 of 6 samples (one IINA-environment sample, the first, 2.8 MB/s); the with-PATH samples (node and deno found) were 18.8-20.8 MB/s |

Caveats:
1. **JS runtime.** Without deno/node yt-dlp warns that "No supported JavaScript runtime could be found" and that YouTube extraction without one is deprecated and some formats may be missing. In these samples nothing was missing: the format counts and heights were identical with and without a `PATH` that contained node and deno. The risk is that YouTube changes and forces the JS challenge solver; then the bundled binary cannot work on a fresh Mac (INFERRED from the warning text; not testable today).
2. **Fixed startup of about 5 s.** `youtube-dl --version` alone takes 4.8-5.7 s wall (0.65 s CPU) on the bundled binary, also on a copy in another directory, versus 0.24 s for the Homebrew yt-dlp. Cause not determined (PyInstaller self-extraction or signature checks are guesses). A YouTube resolve therefore costs about 7 s instead of about 2 s, and a replay fetch pays it twice (preflight plus download). Spawn it as soon as the URL is known, and cache the result.
3. **Age.** The bundled yt-dlp is 95 days old today and prints "older than 90 days". yt-dlp breaks against YouTube regularly. A newer binary placed in IINA's `bin` folder would win for a bare `exec("youtube-dl", ...)` (source), but installing it is outside this spike.
4. **No cancellation.** A replay fetch can run up to 120 s and cannot be killed from `utils.exec`.
5. **Metadata size.** `--dump-single-json` was 11.7 MB for `fTDvp9CBXoQ`, 96% of it `automatic_captions` (11.15 MB; formats 0.48 MB). `--extractor-args youtube:skip=translated_subs` did not shrink it. `-O '%(.{id,title,live_status,is_live,duration,availability,extractor_key,_type})j' -O '%(formats.:.{...})j' -O '%(subtitles.live_chat)j'` returns 317 KB with the same formats (VERIFIED; a single nested selector returned `NA`, three flat ones work). `ytdlp-check.mjs ... trim` is that variant.
6. **IINA's own path.** IINA can open a YouTube URL itself via mpv's ytdl hook when its "enable youtube-dl" preference is on (`MPVController.swift` sets `ytdl`). I did not test replacing the plugin's own resolution with that; it would remove the format picker work but depends on a user preference (INFERRED).

## Q4. Inventory of what Python does today

| # | Python task (file) | Class | Basis |
|---|---|---|---|
| 1 | Parse and normalise source URLs (`media.py` `parse_source`) | movable | `src/source.js` already duplicates it |
| 2 | Run Streamlink, pick quality, validate and allow-list media URL (`media.py` Twitch) | movable (replaced by Q1 recipe) | prototype works |
| 3 | Run yt-dlp, pick formats and audio, allow-list URL (`media.py` YouTube) | needs yt-dlp; the post-processing (format ranking, URL validation) is movable | Q3; ranking logic is plain data handling |
| 4 | Process wrapper: bounded pipes, timeouts, `SIGTERM`/`SIGKILL` process group, 8 MB cap (`run_command`) | hard for the child-control part: `utils.exec` has no kill or timeout; the size bound is moot if output is trimmed | exec source |
| 5 | Twitch VOD chat window fetch (`acquire.py` `twitch_page`, `twitch_acquire`, `normalize_twitch_comment`) | movable | Q2 |
| 6 | YouTube chat replay download (`acquire.py` `acquire`: two yt-dlp calls, directory watcher, `RLIMIT_FSIZE`) | needs yt-dlp. YouTube's innertube replay continuation is undocumented and not reproduced here | Q3; direct JS implementation not attempted |
| 7 | Replay archive import: stream-validate JSON, normalise YouTube renderers and TwitchDownloader JSON, dedupe, deletions, sort, chunk to 1000 rows (`replay.py`) | movable for archives up to the 64 MB the plugin acquires; hard for the 1 GB / 2 M-message user-import limit (no streaming file read, no sqlite in JSC) | JS port of the YouTube half gives 5726 messages, equal to Python's 5726, 6 chunks, 47 ms in Node on an 8 MB archive; heap 8.8 MB. The TwitchDownloader JSON path and deletions were not exercised (0 deletions in that archive) |
| 8 | Cancel bridge: marker file polled by `runner.py`, SIGINT into the helper (`runner.py`, `io.js`) | movable for HTTP work (generation check); hard for yt-dlp (cannot kill) | exec source |
| 9 | Pick `python3`: `/opt/homebrew/bin/python3` else `/usr/bin/python3` (`io.js`) | goes away with the above; on a fresh Mac `/usr/bin/python3` is Apple's Command Line Tools stub that prompts for an install | INFERRED from known macOS behaviour, not tested here |
| 10 | Hardcoded `/opt/homebrew/bin/streamlink`, `yt-dlp`, `node` (`media.py`, `acquire.py`) | goes away with Q1 and Q3 | |

## Q5. Cost of today's helpers

Commands run from the shell on public content, via `spikes/out-of-box/measure-helper.mjs` (`/usr/bin/time -l` for CPU and the largest process, plus a 100 ms `ps` sample of the summed RSS of the whole process tree; the sampler can miss shorter spikes). One run each unless noted. Note the 2026-11-22 live-playback snapshot saw no helper running; these are the transient costs when one does.

| Helper call | Wall | CPU (user+sys) | Largest process RSS | Peak tree RSS sum |
|---|---|---|---|---|
| `acquire.py` Twitch VOD window, 15 pages (600 s) | 5.4 s | 0.12 s | 32.6 MB | 33.4 MB |
| same, 11 pages (3600 s) | 4.3 s | 0.11 s | 33.0 MB | 33.9 MB |
| same, 7 pages (20000 s) | 2.9 s | 0.09 s | 32.7 MB | 33.7 MB |
| `acquire.py` YouTube replay, 4.9 h stream (8.0 MB archive) | 38.3 s | 2.23 s | 82.7 MB | 113 MB |
| `acquire.py` YouTube replay, `zn1dXa6W7t4` | 2.5 s then fails `OUTPUT_LIMIT` | 1.13 s | 116.6 MB | 113 MB |
| `replay.py import` of the 8.0 MB archive | 0.99 s | 0.86 s | 24.6 MB | 25 MB |
| `media.py` Twitch live | 1.56 s | 0.37 s | 67.2 MB | 87.7 MB |
| `media.py` YouTube live | 1.77 s | 0.39 s | 73.8 MB | 91.2 MB |
| `media.py` YouTube VOD (4.9 h) | 1.56 s | 0.45 s | 86.8 MB | 107 MB |
| IINA yt-dlp, VOD resolve, `iina` flags | 7.0-7.7 s | 1.6 s | 103-133 MB | n/a (`time -l` only) |
| IINA yt-dlp, chat replay download 44 min | 13.2 s | 1.7 s | 117 MB | 119 MB |

The table above used the pyenv `python3` shim (3.13.13), which adds shim processes (5-6 in the tree) and is not what `io.js` selects. I re-ran four rows with `/opt/homebrew/bin/python3` (3.14.7, the interpreter `io.js` prefers): Twitch window 11 pages 3.6 s wall, 0.11 s CPU, 35.2 MB largest and 36.1 MB tree (2 processes); `media.py` Twitch live 1.45 s, 0.36 s CPU, 67.4 MB largest, 90.2 MB tree; YouTube replay 4.9 h 37.2 s, 2.72 s CPU, 83.9 MB largest, 116.2 MB tree; `replay.py import` of that 8 MB archive 0.80 s, 0.77 s CPU, 28 MB. Same picture. Still not measured: the real path through `runner.py` with its cancel-marker watcher thread, launched by `iina.utils.exec` (an extra Python thread polling every 50 ms; not run).

For comparison, JS in Node (not JSC): the whole 11-page chat window is 2.0 s wall, 0.11 s CPU; the replay import of the same 8 MB is 47 ms. Node's own process RSS of 67 MB is runtime baseline and says nothing about JSC.

Reading: Python's own share is small. The chat window helper is about 33 MB and 0.1 s CPU, and its wall time is network waiting. The large numbers belong to yt-dlp (100+ MB, 1-2 s CPU) and Streamlink (67 MB), which a Rust helper would still have to spawn. A Rust helper could not remove the yt-dlp or Streamlink children, and its own saving is bounded by Python's measured share: about 33 MB and 0.1 s CPU on a chat window, about 25 MB and 0.8 s CPU on the largest archive import I made (8 MB). The case for removing Python is the fresh-Mac dependency, not cost; the case for a compiled helper is not supported by these numbers.

## Risks

- **Undocumented endpoints.** The Twitch GraphQL operations, the web Client-ID, the persisted-query hashes (copied from Streamlink 8.6.3) and the usher parameters are not a public API and can change without notice; Streamlink and yt-dlp track those changes today, the plugin would own them. Mitigation is to fail closed with a clear state and ship a plugin update. A change that demands a client-integrity token would break JS resolution (see Q1).
- **Twitch terms.** Unchecked. I tried the Terms of Service and the Developer Services Agreement on `legal.twitch.com`: `curl -sL` returned a 28-30 KB shell page with no clause text (greps for scraping/robot/automated/circumvent found nothing), and WebFetch returned only navigation and footer for both. I have no verified statement of what they say about unofficial clients, undocumented APIs or ad circumvention; the maintainer should read them before shipping and decide. The mechanics match what Streamlink and yt-dlp do (anonymous, no login, public web Client-ID); no account token or OAuth is involved.
- **YouTube** can change at any time; the bundled yt-dlp is already 95 days old and warns about the missing JS runtime.
- **Ads** unverified (above). Stitched ads would play through.
- **`iina.http` runtime** behaviour is from source reading and a Node model. Not run inside IINA.
- **Plugin data safety.** Never put the token, signature or full URL in logs or error text; `playback.js` already strips `https?://` from error messages.

## What I could not test

- Anything inside a running IINA plugin: `iina.http` and `iina.utils.exec` were read from source and modelled, not executed. In particular: JSON number bridging for `contentOffsetSeconds`, URLSession's default headers and connection reuse, `exec` with the bundle path, and JSC memory with a 64 MB archive string.
- A fresh Mac. Nothing was run without Homebrew/Python/Streamlink being present on the machine (I only ran yt-dlp with IINA's restricted environment, which does not prove it works where nothing else is installed). The Command Line Tools stub behaviour is from general macOS knowledge.
- An actual ad break, ad-free vs ad-bearing latency, mpv/IINA latency differences beyond playlist-timestamp arithmetic, and subscriber-only, geoblocked or private content.
- Playback of YouTube URLs from IINA's yt-dlp in mpv or IINA, YouTube formats that need separate audio (media.py's `audioURL` logic with the new output), and IINA's own ytdl path.
- Deletion/moderation records and TwitchDownloader JSON in the JS importer; archives near the 64 MB cap.
- Twitch's terms of service and Developer Services Agreement (page text not retrievable).
- The real `runner.py` path under `iina.utils.exec`.
- Repeat-run variance beyond what is stated; most Q5 figures are single runs.

## Reproduce

`node spikes/out-of-box/twitch-resolve.mjs live <channel>` or `vod <id>` (redacted summary), `bench-resolve.mjs`, `streamlink-baseline.mjs`, `mpv-playback-check.mjs`, `ad-watch.mjs`, `live-top.mjs`, `latency-probe.mjs`, `twitch-vod-chat.mjs` plus `compare-chat.mjs`, `ytdlp-check.mjs`, `ytdlp-throttle.mjs`, `replay-import.mjs`, `measure-helper.mjs`. Requires Node, mpv, Streamlink and a Homebrew yt-dlp for the comparisons only. The scripts print counts, shapes and hosts, not tokens or URLs. `find-content.mjs` and `live-top.mjs` pick fresh test content, because VODs expire.
