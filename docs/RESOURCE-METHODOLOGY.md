# Resource measurement methodology

This is a collection and interpretation protocol, not a performance result. Record actual conditions and durations alongside each observation; a short native characterization does not establish a general performance advantage.

## Conditions and workload

Record the candidate commit/build, plugin identity, IINA/macOS versions, hardware, display scale/refresh, power state, window/video dimensions, sidebar width, fullscreen state, visible overlays, other active players, and measurement timestamps. Keep unrelated applications and user work intact. Note background activity, remote control, screenshots, and screen recording as possible confounders; avoid captures during the measured interval when practical.

Use the same public source, playback segment, video codec, resolution, frame rate, audio configuration, playback speed, and hardware-decoding state for A/B comparisons. Verify decoded playback properties rather than assuming that the Auto label guarantees a match. Record dropped frames and buffering alongside resource readings. Measure startup/extraction separately from settled playback.

Useful public inputs observed on 2026-11-08:

- Twitch: `https://www.twitch.tv/videos/2922164492`. The selected 720p60 playlist had sequence 0, 4,514 segments, 45,140 seconds of EXTINF duration, and ENDLIST. Use a fixed replay position and interval for repeated measurements; availability can change.
- YouTube Live: `https://www.youtube.com/watch?v=umLWFz4izTM`. Extractor metadata offered H.264 720p60 video format 311 and separate HLS audio. The live content changes between runs, so sequential samples are less tightly matched than a completed recording. Audio variants 233/234 omitted bitrate/codec metadata; their numeric source preferences were 0/1. Record the actually decoded audio properties.

For each candidate, distinguish chat Off, genuine replay in the sidebar, the same replay in the overlay, and a hidden presentation. Record the archive identity, playback interval, message density, row limit, font/opacity settings, and replay offset. Hidden presentation and chat Off are separate conditions. If live authorization is unavailable, label live-chat resource behavior unmeasured; a disconnected or synthetic state is not an active-chat measurement.

## Collection and attribution

Prefer a fixed warm-up followed by equal sampling windows; the bounded sampler supports up to 30 seconds per run, with a practical target of 30 seconds of settled playback followed by 20–30 seconds sampled every 2–5 seconds. These are proposed durations, not completed measurements. Label them short characterizations. Preserve raw timestamped samples and repeat conditions where feasible; use the same order or alternate A/B order to expose drift.

| Measurement | Record and interpretation |
| --- | --- |
| IINA CPU and resident memory | Record PID, process name, sampling tool, CPU convention, and RSS units. Preserve individual samples and summarize range/median. Sum only identified relevant PIDs; CPU totals may exceed 100% on multicore workloads. RSS is not private memory or physical footprint, and summing processes can double-count shared pages. |
| WebKit and helper processes | Inventory before/during/after the run and after the owned player closes. Record attribution evidence, such as parentage and observed launch/exit. Do not assign every WebKit process on the Mac to this plugin; report ambiguous/shared processes separately. Include transient extractor work in startup observations. |
| WindowServer | Record separately as a shared system process. Changes can reflect every visible application, display configuration, and remote capture; they are not an exact plugin allocation. |
| Memory pressure and swap | Capture read-only system pressure/VM snapshots and swap-used state before and after. Distinguish existing swap allocation from swap-in/out activity during the interval; cumulative counters require deltas. Record global background-load uncertainty. |
| Network | Where attributable counters are available, record bytes and interval separately for media acquisition, playback, and chat. Otherwise mark network overhead unmeasured. Do not infer zero traffic from absent measurements or export signed URLs, headers, cookies, or tokens. |

## Safari comparison and conclusions

Use an owned Safari test tab only if a public workload can be matched without disturbing unrelated tabs. Match source/segment, decoded quality/codec/fps, audio, video viewport, visibility, and chat state. Record browser version and autoplay/ad/buffering conditions. If Safari chooses another codec, quality, audio path, or visible workload, report a descriptive observation with those differences; do not calculate a candidate improvement from it. Browser/WebKit process attribution may remain shared and incomplete.

Report failed or missing measurements, exact durations, and confounders. Short CPU/RSS observations do not establish battery life, energy efficiency, long-session stability, or leak absence. Closing an owned player and observing process/resource changes provides lifecycle evidence only for that measured interval.

## Media address scope

The resolver in `candidate-plugin/helpers/media.py` accepts the configured Twitch CDN suffixes and one observed CloudFront distribution, `d2vi6trrdongqn.cloudfront.net`; it does not allow arbitrary CloudFront tenants. Another legitimate Twitch VOD distribution may therefore return `UNSAFE_MEDIA_URL` until independently verified. Keep this compatibility limit in the report rather than widening the allowlist for benchmarking. YouTube transport is restricted to HTTPS on `googlevideo.com` and its subdomains. Store canonical source IDs and sanitized format facts in evidence, never expiring transport URLs.
