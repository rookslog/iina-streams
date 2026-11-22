# Spike: live latency, chat lead, Go Live and the DVR window (#16, #31, #51)

Measured 2026-11-22 on this Mac with Homebrew `streamlink` 8.6.3, `mpv` v0.41.0 and `ffprobe` 9.0.1. No IINA was involved. No product code changed. The scripts are in `qa/spikes/`; raw per-second rows stay out of the repository (they hold only numbers, but they are bulky).

Labels: **[observed]** is a number or behavior the scripts recorded. **[inferred]** is reasoning from observed numbers or from source, not itself measured. **[unchecked]** was not tested.

## Summary

| Question | Answer |
|---|---|
| How far behind live does Streams' playback run? | **7.9 s** (trymacs) and **7.2 s** (montanablack88) over the first 2 minutes after joining, within ±0.03 s there. Across joins it varied: 7.88, 7.30, 7.68 and 7.73 s on trymacs (four loads), 7.15 and 6.97 s on montanablack88 (two loads). [observed] |
| How far ahead of the video is chat? | The same 7.8 s and 7.0 s, because chat arrives 0.11 s after `tmi-sent-ts`. [observed] |
| Does a low-latency playlist exist? | No separate one. The one playlist always carries two `#EXT-X-TWITCH-PREFETCH` entries. Streamlink's `--twitch-low-latency` is client-side. [observed, plus Streamlink source] |
| Can Auto chat sync hold within 1 s? | Yes in these runs, with a thin margin underneath: the error was at most 0.02 s with a 30 s estimator window, through pause, a 120 s rewind, reload and quality change, but only about 70% of the raw per-sample estimates were exact and about 30% were a whole 2 s segment off (section 6). [observed on 2 channels, about 9 minutes of events each] |
| Does seeking to the end work as Go Live? | Only `seek <cache-end minus a margin> absolute`. Seeking to the end itself is a silent no-op. [observed, 1 channel] |
| Is a VOD available while live? | Yes on trymacs (a recording, whole broadcast, same timeline as live), no on montanablack88. [observed] |
| How far back does the live playlist reach? | 28 s. mpv's own cache reaches back to when you joined, up to a byte cap. [observed] |

What "behind live" means here: the wall clock minus Twitch's own timeline (`#EXT-X-PROGRAM-DATE-TIME`, "PDT"). It is not glass-to-glass latency. Time from the streamer's camera to Twitch's PDT stamp is not measured. [unchecked]

## What Streams hands mpv

`helpers/media.py` runs `streamlink --json` with `--no-config --no-plugin-cache --no-plugin-sideloading --http-ignore-env --webbrowser false --loglevel none --http-timeout 12`, and passes the chosen stream's media-playlist URL as `stream-open-filename` (`applyResolution` in `src/player.js`), with only `User-Agent`, `Accept`, `Accept-Language`, `Referer` and `Origin` forwarded. There is no `--twitch-low-latency`, and nothing else sets mpv's HLS options. [observed in source] The measured variant A below is that, in Homebrew's headless mpv with `--no-config`. IINA's bundled mpv/FFmpeg and its option defaults are not checked. [unchecked]

## Method

| Part | How |
|---|---|
| Clock | `sntp time.apple.com` at the start: +0.009 s ± 0.042 s. The end-of-run check timed out, so drift over the run is unchecked. |
| Channels | trymacs (26,796 viewers at 12:43 UTC) and montanablack88 (23,395), picked from the public top-streams list. Both runs started 12:50:29 UTC and ran together. |
| Players, all on the 160p30 playlist, per channel | **A**: mpv on the plain URL (what Streams does). **B**: as A plus `--demuxer-lavf-o=live_start_index=-1`. **C**: `streamlink --twitch-low-latency --player-external-http` serving MPEG-TS on a local port, mpv playing that. Each mpv: `--no-config --no-video --ao=null --idle=yes --rebase-start-time=no` and a JSON IPC socket. |
| Position to wall time | `c = PDT − PTS`, measured with ffprobe on the oldest and newest segment of the playlist. With `--rebase-start-time=no`, mpv's `time-pos` is the raw PTS, so the playhead's wall time is `time-pos + c`, and behind live = `now − (time-pos + c)`. `c` was identical to 1 ms for the oldest and newest segment, for 160p and 360p, and from the start to the end of the trymacs run, and the same on live and on the VOD (below). [observed] |
| Sampling | Every 1 s per mpv: `time-pos`, `pause`, `paused-for-cache`, `core-idle`, `demuxer-cache-state`, `duration`. Every 2 s: the media playlist (window, newest segment end, prefetch, `EXT-X-DATERANGE` classes). Anonymous IRC (`justinfanNNNN`, IRCv3 tags) logs only `tmi-sent-ts` and the local arrival time. |
| Stress, on A only | 30 s pause; seeks of −30, −120, −30 s; Go Live attempts; reload of the same URL; quality change to 360p by `loadfile`; second pause; reload after a fresh resolve. |

Commands:

```
python3 qa/spikes/live_latency_measure.py trymacs --out <dir1> --port 18741 &
python3 qa/spikes/live_latency_measure.py montanablack88 --out <dir2> --port 18742 &
python3 qa/spikes/live_latency_analyze.py <dir1> <dir2>
python3 qa/spikes/live_latency_estimator_check.py <dir1> 30
python3 qa/spikes/live_latency_estimator_agreement.py <dir1> <dir2>
python3 qa/spikes/golive_seek_test.py trymacs --out <dir3>
python3 qa/spikes/backbuffer_probe.py trymacs --quality 480p30 --seconds 150
python3 qa/spikes/dvr_window_probe.py trymacs
python3 qa/spikes/ad_probe.py trymacs zarbex strogo ohnepixel gaules --rounds 2
```

## 1. How far behind live (variant A is Streams today)

Steady state after a 30 s start-up, 120 one-second samples each. [observed]

| Channel | Player | Behind live, median (s) | Range (s) | Buffer ahead of the playhead, median (s) | Stalls (paused-for-cache samples) |
|---|---|---|---|---|---|
| trymacs | A plain URL | 7.88 | 7.86–7.94 | 5.65 | 0 |
| trymacs | B `live_start_index=-1` | 4.63 | 4.61–4.67 | 2.43 | 0 |
| trymacs | C Streamlink low latency | 0.86 | 0.83–0.89 | 0.76 | 0 |
| montanablack88 | A | 7.15 | 7.13–7.18 | 5.19 | 0 |
| montanablack88 | B | 4.25 | 4.23–4.30 | 2.30 | 0 (2 underrun samples) |
| montanablack88 | C | 2.06 | 2.04–2.12 | 2.25 | 0 |

Where the time goes, for A: the newest regular segment ends about 0.9 s before the wall clock (playlist edge age median 0.93 s on trymacs, 0.84 s on montanablack88), and mpv's newest cached data sits about 2.2 s behind the wall clock (A 7.88 − 5.65 = 2.23; B 4.63 − 2.43 = 2.20). The rest is how far back from the end of its cache the demuxer starts: about 5.7 s for A and 2.4 s for B. [inferred from those observed numbers] The #31 hypothesis "FFmpeg starts about 3 segments behind the edge" fits: A starts roughly 3 segments (6 s) back, and `live_start_index=-1` removes about 3.3 s. [inferred] mpv's cache does not add a separate delay; it holds what is already counted. [inferred]

C is 0.86 s on one channel and 2.06 s on the other. The cause was not investigated. [unchecked]

B did not hold its advantage. Over the whole run, with no command sent to B, its behind-live drifted upward in steps. [observed] The per-phase medians below are for the same player in the order the phases ran; C is shown for comparison.

| Channel | Player | Baseline (t+30 s to t+150 s) | Later phases (s) | Whole run, excluding start-up: min – max |
|---|---|---|---|---|
| trymacs | B | 4.63 | 4.64 through t+420 s, 4.68 at the quality change, 4.72 at the second pause, 5.09 after the fresh resolve | 4.61 – 5.13 |
| trymacs | C | 0.86 | 0.85 to 0.86 in every phase | 0.83 – 0.90 |
| montanablack88 | B | 4.25 | 4.30 at t+260 s, then 4.94 from t+300 s, 5.31 from t+470 s (the stream was still live) | 4.23 – 5.35 (to t+550 s) |
| montanablack88 | C | 2.06 | 2.06 to 2.07 until the stream's last minute | 2.04 – 2.07 (to t+550 s) |

B therefore gained 0.5 s and 1.1 s of lag in about 9 minutes. The cause (a resync after a short stall, or a playlist reload) was not found. [unchecked]

Live playlist, every 2 s, 285 fetches on trymacs and 257 on montanablack88. [observed]

| Quantity | trymacs | montanablack88 |
|---|---|---|
| Regular segments in the playlist | 14, always | 14 to 16 |
| Segment length | 2 s; `TARGETDURATION` 6 | 2 s |
| Window of regular segments | 28.0 s | 28.0 s (max 30.2) |
| Edge age: response time minus newest segment end, median / p95 | 0.93 / 1.93 s | 0.84 / 2.13 s |
| `#EXT-X-TWITCH-PREFETCH` entries | 2, always | 0 to 2 |
| Prefetch end minus response time, median | 3.07 s | 3.18 s |

A 28 s window gives no DVR of its own: the usher playlist exposes only the last 28 s. [observed]

## 2. How far ahead chat runs

IRC arrival minus `tmi-sent-ts`: median 0.11 s on both channels, p5 0.10 s, p95 0.16 s (trymacs) and 0.21 s (montanablack88); the minimum was 0.08 s, never negative. Because delivery lag is positive and small, the local clock and Twitch's stamps agree to about 0.1 s. [inferred, using the single sntp reading above]

Chat lead = `tmi-sent-ts` minus the video's wall time at the moment the message arrived (how far into the video's future a message's send time sits), baseline phase only. [observed]

| Channel | Messages in baseline | Player | p5 | Median | p95 | Std dev |
|---|---|---|---|---|---|---|
| trymacs (0.4 msg/s) | 41 | A | 7.72 | 7.76 | 7.80 | 0.03 |
| trymacs | 41 | B | 4.48 | 4.52 | 4.55 | 0.02 |
| trymacs | 41 | C | 0.69 | 0.74 | 0.77 | 0.02 |
| montanablack88 (4.6 msg/s) | 315 | A | 6.79 | 7.03 | 7.07 | 0.16 |
| montanablack88 | 315 | B | 3.90 | 4.13 | 4.17 | 0.16 |
| montanablack88 | 315 | C | 1.71 | 1.95 | 1.98 | 0.16 |

This is the offset between two clocks, chat's send time and the video's Twitch timeline. It is not what viewers saw when they typed: a chatter watching with their own latency reacts to something older than the message stamp says. How large that is was not measured. [unchecked]

## 3. What stress does to the numbers (variant A)

Behind-live values in seconds, taken from the first and last sample of each phase. The montanablack88 column is the same script run on that channel; that stream ended at about 13:00 UTC, so its phases from t+550 s on are discarded. [observed]

| Event | trymacs before → after | montanablack88 before → after | Notes |
|---|---|---|---|
| Pause 30 s, then resume | 7.88 → 37.88 | 7.15 → 37.14 | Behind grows 1 s per second; after resume the playhead continues from where it stopped, with no catch-up. mpv kept downloading during the pause (seekable range end advanced 30 s). |
| Seek −30 s (relative) | 37.88 → 67.88 | 37.14 → 67.15 | Exactly +30.0. |
| Seek −120 s (relative) | 67.88 → 187.87 | 67.15 → 187.15 | Worked: the cache then spanned 304 s (joined about 5 minutes earlier). |
| Quality change, `loadfile` of the 360p playlist | 7.30 → 7.68 | 7.15 → 6.97 | Restart 0.8 to 1.5 s after `start-file`. The reload just before it had cut the cache range from 424 s to 54 s; this one cut it from 54 s to 52 s, so each reload empties the rewind history. `time-pos` restarts near 0. |
| Reload after a fresh `streamlink --json` | 37.69 → 7.73 | not reached (stream ended) | The resolve itself took 2.23 s, so about 3.3 s until audio resumed. |
| Second pause 30 s | 7.75 → 37.69 | 7.20 → 36.37 | Same as the first. |

Variants B and C were not given the events; they only show that A's events do not disturb them. Their own behavior under pause and seek is unchecked. [unchecked]

**Ad break:** none seen. The playlists carried only the `EXT-X-DATERANGE` classes `timestamp`, `twitch-session`, `twitch-stream-source`, `twitch-trigger` and `twitch-assignment`; there were no discontinuity tags. About 20 minutes of playlist across the two channels, plus ten fresh anonymous sessions on five large channels (`ad_probe.py`), showed no stitched ad. Streamlink's Twitch plugin requests its access token with `playerType=embed`, which may be why. [observed; the reason is inferred from `twitch.py` line 357]. What an ad does to `time-pos`, to PDT and to `c` is therefore unknown. [unchecked] Streamlink's plugin treats `CLASS="twitch-stitched-ad"` or an id starting `stitched-ad-` as an ad (source, not seen on the wire).

## 4. Go Live: seek to the edge, or reload?

Run with mpv's default time handling (`--rebase-start-time=yes`, so `time-pos` starts at 0 on join as in IINA), one channel, one trial per method. Each method follows a −30 s relative seek and 10 s of waiting. `behind` is computed from `time-pos + demuxer-start-time + c`. [observed]

| Method | Behind just before (s) | Behind 15 s after (s) | What happened |
|---|---|---|---|
| `seek 100 absolute-percent` | 37.4 | 37.4 | mpv answered `success`, emitted no seek event, did not move. |
| `seek <cache-end> absolute` | 67.4 | 67.4 | Same: no-op. |
| `seek <duration> absolute` | 96.7 | 96.7 | Same: no-op. |
| `seek <cache-end> − 0.5 absolute` | 121.9 | 4.9 | Landed at 2.4 s behind, stalled 2 samples (paused-for-cache), then behind-live rose from 4.2 s to 4.9 s over the remaining samples and was still rising when observation stopped. |
| `seek <cache-end> − 2 absolute` | 35.0 | 7.2 | Jumped with no stall. |
| `seek <cache-end> − 4 absolute` | 37.2 | 6.3 | Jumped with no stall. |
| `loadfile` of the same URL | 36.3 | 6.9 | 2 samples with no position, cache history dropped, `time-pos` reset to about 0.5. |
| `seek +1000000 relative` | 20.5 | 20.5 | No-op. |

An earlier version of the measuring script ran with `--rebase-start-time=no` and its absolute seeks (`seek 100 absolute-percent` jumped to the start of the cache range; `seek <cache-end> absolute` did nothing) disagreed with the default-time run above. I treat those two earlier phases as a harness artefact of that option and use only the table above; the cause was not diagnosed. [inferred]

So "seek to the edge" is not one command in mpv. A seek at or past the cache end does nothing, and a seek a little before it works. Reload works but throws away the rewind history and costs about 2 s of silence (3.3 s with a fresh resolve). A Go Live that seeks to `cache-end − 2` lands near the normal join latency (about 7 s); `cache-end − 0.5` can land closer (4.9 s here) at the price of a roughly 2 s stall. [inferred from one trial each; spread between trials is unknown]

## 5. How far back can the user go (#51)

mpv's cache. The seekable range grows from the moment of joining. On 480p30 with the video stream selected (`--vid=auto --vo=null`) it held 31.9 MiB after 150 s (0.21 MiB/s) and had not hit mpv's default `demuxer-max-back-bytes` of 50 MiB. [observed] The master playlist's `BANDWIDTH` per rendition gives the horizon that cap would give: 160p 0.23 Mbit/s → about 1,820 s; 360p 0.63 → 666 s; 480p 1.43 → 294 s; 720p 3.42 → 123 s; 1080p 6.83 → 61 s. At 480p the observed 0.21 MiB/s gives about 240 s instead of 294 s (the advertised bitrate is a peak figure, and the observed rate is for one channel), so treat the horizons as upper-ish estimates; both figures are [inferred] and the cap itself was not reached. Real IINA may set other cache options. [unchecked] A reload (quality change, fresh resolve) drops the history. [observed]

The live playlist: 28 s. Not useful as DVR. [observed]

A VOD while live. Anonymous GQL with the web client id used by `helpers/acquire.py`: `user.stream.archiveVideo`. [observed]

| | trymacs | montanablack88 |
|---|---|---|
| `archiveVideo` for the live stream | present, `status: RECORDING`, `broadcastType: ARCHIVE` | `null`. The latest archive was yesterday's finished VOD. |
| VOD playlist | `index-dvr.m3u8`, `EXT-X-PLAYLIST-TYPE:EVENT`, no `ENDLIST`, segments of about 10 s, 1,103 to 1,106 of them (11,059 to 11,089 s) while the live playlist's `TOTAL-SECS` was about 2 to 4 s ahead | not applicable |
| Timeline | carries `PROGRAM-DATE-TIME`; `c = PDT − PTS` equal to the live playlist's to 1 ms | not applicable |
| Newest VOD segment end behind wall clock | 4.7 s | not applicable |
| Host and path | CloudFront distribution host and a path that `helpers/media.py` `TWITCH_VOD_HOST` / `_twitch_vod_path` admit; no query string | not applicable |

[observed] Whether other channels have a live VOD depends on the channel's settings; two channels is not a sample of that. [unchecked] `helpers/media.py` admits this URL shape only for a `twitch-vod` source, so a "live with archive" source kind would be new work. [inferred from reading `_twitch`]

Display: the left counter is mpv's `time-pos`, which restarts at 0 on join and again after every reload (observed: 170.2 s before a reload, 0.55 s after). `demuxer-start-time` is readable (10,516.6 at join in one run) and `duration` was the buffered length (14.9 s at 10 s in). [observed]

## 6. Can Auto be built from what a plugin can see

The ffprobe `c` is not available in a plugin. This replays the runs with only the playlist's newest segment end and mpv's raw cache end: `c_hat` is the median of `(newest segment end PDT) − (raw cache-end)` over the last N seconds, and `behind_hat = now − (raw time-pos + c_hat)`. Absolute error against the ffprobe truth, by phase, from `live_latency_estimator_check.py`. [observed on recorded rows]

| Window | Result |
|---|---|
| 30 s (needs at least 18 samples) | Max error 0.02 s in every phase on both channels, including pause, rewind 120 s, reload, quality change, on both A and B. |
| 10 s | Median 0.01 s but p95 1.5 to 2.0 s: one 2 s segment of quantisation noise whenever the playlist and the cache disagree by one segment. |

**The load-bearing assumption is that, in any 30 s window, no single wrong value (0, +2 s or −2 s) holds a majority except the right one.** The raw, unfiltered estimate `playlist newest end − raw cache-end − c` was not right per sample. Share of samples by error, over the whole run (A and B listed separately, one row per channel), and the worst single phase: [observed]

| Channel | Player | −2 s | exact (0) | +2 s | +4 s | Worst phase (exact samples) |
|---|---|---|---|---|---|---|
| trymacs | A | 9% | 69% | 22% | 0% | `rewind30-b`, 11 of 20 |
| trymacs | B | 12% | 64% | 23% | 1% | `after-pause30-b`, 9 of 20 |
| montanablack88 | A | 13% (and under 1% at −4 s) | 70% | 16% | 1% | `pause30`, 15 of 29 |
| montanablack88 | B | 11% | 71% | 18% | 1% | `pause30`, 14 of 29 |

The median is right while neither side (negative, positive) holds more than half the window. That held in all 1,215 (trymacs) and 1,078 (montanablack88) windows of 30 s or more, with the thinnest phase at 9 of 20 exact (45%), so the margin is real but not wide. A longer window, or requiring the estimate to stay put (hysteresis) before updating `c_hat`, would widen it; neither was tried. [observed for the counts; the remark about a longer window is inferred]

Raw position in IINA terms is `time-pos + demuxer-start-time` (the check above used raw `time-pos` directly). [inferred; not run in the default time mode against live playlist rows]

## Limits and what was not tested

- IINA itself, its bundled mpv/FFmpeg, and its cache and demuxer options. Variant A is Homebrew's mpv with `--no-config`. The "~4 s" element in IINA (#16) was not identified; none of the numbers above is a claim about it. (B's 4.2 to 4.6 s and the 4 s mentioned in the issue match only by coincidence of size.)
- Ad breaks: none occurred; effect unknown.
- Glass-to-glass latency, and how far chatters' own latency shifts what a message refers to.
- 720p and 1080p playback: all timing is at 160p30 (and 360p for the change). The 50 MiB horizon at those renditions is derived from advertised bitrates, not measured.
- Run length: about 10.5 minutes per channel; encoder restarts, discontinuities or `c` jumping over hours are untested.
- Two channels, and one trial per Go Live method.
- The Go Live seeks ran with `--no-video`, so seek and stall behavior with a video track selected is unchecked (the 480p cache probe did select video, but did not seek).
- The mpv cache and readahead options named in #31 (`--cache-secs`, `--demuxer-readahead-secs`, and similar) were not tried.
- B's rebuffer risk: it keeps 0.1 to 4 s of buffer, 2 `paused-for-cache` samples at start-up (trymacs) and 2 `underrun` samples (montanablack88); behavior on a poor network is not tested.
- C's pause, seek and rewind behavior (it is a non-HLS byte stream to mpv), and whether Streamlink's ad skipping would show the user a gap.
- The end-of-run clock check failed (`sntp` timed out), so clock drift across the run is unchecked.
- montanablack88's last playlist fetch was at about t+574 s (its stream ended; the script then stopped at the fresh-resolve step with `RuntimeError: streamlink: No playable streams found on this URL: twitch.tv/montanablack88`). Phases from `after-pause30-b` (t+550 s) on are discarded.
- Mpv's IPC sockets live in `/tmp/ls-*`, `/tmp/gl-*` and `/tmp/bb-*` for the run and are deleted on exit, because a Unix socket path must be under about 100 bytes and the scratchpad path is longer.

## Recommendations

### #2 Auto chat sync

Auto is viable on this evidence, with the margin shown in section 6 (the 30 s median is right only while the exact estimates stay a plurality that neither wrong side outweighs). Build it as follows; the first four points are measured, the fifth and sixth are design judgment.

1. Estimate `behind = now − (time-pos + demuxer-start-time + c_hat)`, with `c_hat` the median over at least 30 s of (newest playlist segment end − raw cache-end), the playlist polled every 2 s. A 30 s window held to 0.02 s; a 10 s window did not (up to 2 s). `c` was constant for the whole run, through reload and quality change, so keep it and only re-derive it on a signal that the timeline changed.
2. Release each chat message when the playhead's wall time reaches `tmi-sent-ts` plus the user's fine-tune offset. Pause then holds chat automatically, because the playhead stops. Typical delay is 7 to 8 s today.
3. The playlist is fetched with the same signed URL mpv has; that needs a helper or plugin fetch that never logs it.
4. Declare Auto **uncertain** and offer Manual when: fewer than about 18 estimator samples; the playlist fetch fails; the median disagrees with the previous `c_hat` by more than 1 s; a `CLASS="twitch-stitched-ad"` range or an `EXT-X-DISCONTINUITY` appears; or the source is not live. These are the unknowns above (ads, long runs).
5. Decide what a rewind does to held and shown messages (the rewind of 120 s moved the playhead back 120 s; chat that was already shown cannot be un-shown). That is a product choice, not a measurement.
6. Gate shipping on a native IINA run with the default time mode, because variant A here is Homebrew mpv with options Streams does not use.

### #31 Reducing the lag

Today's 7 to 8 s is not unavoidable. Two levers, neither tried inside IINA:

- `--demuxer-lavf-o=live_start_index=-1` (B) is one option string and cut 3.3 s and 2.9 s at the start of the two runs, with a thinner buffer (0.1 to 4 s ahead). It did not hold: over about 9 minutes B's lag rose by 0.5 s and 1.1 s with no command sent (section 1), and on one channel it kept 2 underrun samples. Treat it as a lever that needs a longer rebuffer and drift test, including on a bad network, before it is a default.
- Streamlink low latency through a local port (C) reached 0.86 and 2.06 s, but needs a long-lived Streamlink process and port per playing stream, and it was not tested for seek, pause or ads. That conflicts with #2's "no persistent heavy processes", so treat it as a later option.

There is no low-latency playlist to request: the usher URL carries no low-latency parameter (parameter names seen: `platform`, `p`, `allow_source`, `allow_audio_only`, `playlist_include_framerate`, `multigroup_video`, `supported_codecs`, `sig`, `token`, `fast_bread`), and the normal media playlist already lists two prefetch segments about 3 s ahead of the wall clock. [observed] FFmpeg is not using them. [inferred from A's cache end tracking the last regular segment, not from FFmpeg source]

### #51 Go Live and going back

- **Go Live:** `seek` to `demuxer-cache-state.cache-end − 2` (absolute, in mpv's `time-pos` timeline); do not seek to `cache-end`, `duration` or a percent, which silently do nothing. Fall back to reloading the same URL when no seek event follows. Gate the control on being behind by more than a few seconds.
- **Time display:** show `behind` from the Auto estimator. `time-pos` restarts at 0 on every reload, so it cannot be "time behind live" and should not be shown as stream time.
- **Go further back:** ship the part that is free first, rewind within mpv's cache since joining, and say how far it reaches (the horizon above). Do not drop the cache on a quality change without saying so; a reload loses the history. A VOD-backed "further back" is possible when the channel has an `archiveVideo` for the live stream (observed for one of two channels), and the VOD shares the live timeline to 1 ms, so a switch between them can be exact. It needs: a GQL lookup, a new source kind in `helpers/media.py` for a live channel's VOD, and an availability check that hides the control for channels without one.
