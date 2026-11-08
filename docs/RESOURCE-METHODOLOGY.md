# Resource measurement methodology

This document contains the collection/interpretation protocol and a limited native sampler validation. The completed six-run QA observations are in RESOURCE-RESULTS.md; controlled workload interpretation remains separate from sampler validation. Record actual conditions and durations alongside each observation; a short native characterization does not establish a general performance advantage.

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

## Native sampler validation — 2026-11-08

The independent auditor ran the existing sampler read-only on Apollo with IINA PID 75148, label `sampler-validation-75148`, requested duration 8 seconds, and interval 2 seconds. The command succeeded with exit code 0 and no query errors. It ran from `19:12:24.857Z` to `19:12:32.921Z`, reported 8.063 seconds elapsed, collected four samples, and stopped for the requested duration. The observed elapsed time exceeded the requested window by 63 ms; retain the measured duration rather than silently rounding it to the requested window. No application, player, window, preference, or remote file was changed by this validation.

Sampler SHA-256: `9e2846befd1b072f5ce34764b33b4127feb7d6a9f7c2179dbb4674c3e5db3862`.

Observed environment: IINA 1.5.1 build 183; macOS 27.2 build 26B123; hardware model `Mac16,13`; 17,179,869,184 bytes installed memory; 10 logical and 10 physical CPUs as reported by sysctl. The sampler recorded repository HEAD `ab4a00f0a1324769283275c39f3b7df3376c7a84`; that value is repository metadata, not proof of the exact loaded plugin bytes. The IINA PID retained its start identity `2026-11-08T19:04:20Z` throughout.

| Sample UTC | Elapsed s | IINA ps CPU % | IINA RSS KiB | WindowServer ps CPU % | WindowServer RSS KiB | System memory-free % |
| --- | --- | --- | --- | --- | --- | --- |
| 19:12:24.926 | 0.068 | 1.0 | 226496 | 3.3 | 53920 | 40 |
| 19:12:27.000 | 2.143 | 10.2 | 227984 | 4.1 | 54512 | 38 |
| 19:12:29.073 | 4.215 | 6.4 | 263456 | 7.0 | 51376 | 36 |
| 19:12:31.141 | 6.284 | 15.9 | 265312 | 6.9 | 50064 | 34 |

Per-sample collection took 0.039–0.098 seconds. System swap allocation was 6,936,592,384 bytes used in all four samples, with no used-allocation delta. The VM counter deltas between the first and last collected samples were Swapins +28, Swapouts +0, Pageins +12,971, and Pageouts +9. These are shared-system observations; they are not assigned to the candidate. A constant swap-used figure does not mean that no swap-in occurred.

The sampler found no process descendants under this IINA PID and reported 14 WebKit processes as unattributed; their PPID was 1. They were therefore excluded from `scopedTotal`, which in this run equals the IINA main-process values above. Five WebKit processes began one second after IINA (PIDs 75150, 75151, 75153, 75154, and 75156); correlated start times are a useful investigation lead, not conclusive ownership evidence. Use independently observed ownership before supplying `--helper-pid`, and preserve that operator attribution in the report.

This run validates the native command/parser path, process identity checks, timing, and system queries. No workload metadata was supplied, the current player/source/pause/chat state was not independently established by the auditor, and there was no controlled warm-up or matched Safari condition. A concrete overlap was subsequently verified: `evidence/native/focus-final-fullscreen-quality-360.json` records a native fullscreen quality-change test with before/action/after times `19:12:26.752Z`, `19:12:27.155Z`, and `19:12:31.991Z`, inside this sampler interval. That artifact's SHA-256 is `6ebbe6fdbafc19ff0b26efeb2b21c4317b354448d18908b17341cba594521309`.

The figures must not be used as an A/B comparison, steady-state playback cost, evidence of a memory leak or its absence, or a measurement of the native-timer fix's memory effect. The confirmed quality-change overlap and unrelated system activity can affect CPU/RSS/pressure. Network remains unmeasured. The six completed controlled QA captures are analyzed separately in RESOURCE-RESULTS.md.

### WebKit attribution investigation

Unprivileged targeted `launchctl procinfo` queries returned exit status 1 with a root-privilege requirement. No escalation was attempted. At `19:18:27.380318Z`, a read-only PID/parent/start/name inventory observed fresh IINA PID 99898 (start `19:18:22Z`) and WebKit PIDs 99910, 99911, 99956, 99957, and 99960 (starts `19:18:22–23Z`), all with PPID 1. The earlier 75150/75151/75153/75154/75156 cohort was no longer in the inventory. The main task had independently restarted IINA for its next test; the auditor did not do so.

This is lifecycle correlation, not a verified responsible-owner field, and does not distinguish candidate WebKit from other enabled IINA plugins. Keep these helpers unattributed in the primary reported totals. A root-only CPU/RSS table can be useful with that scope stated; it cannot support a claim about total application-plus-WebKit efficiency. No process memory profiling, debugger attachment, UI action, or full argv/environment dump was used to investigate ownership.

`qa/analyze-resources.py --directory /absolute/evidence/resources` can summarize the six saved Unified/Focus Off/sidebar/overlay reports without querying or changing a running application. It reports per-run min/median/max, original SHA-256 hashes, condition-record checksum agreement, native before/after workload fields, query errors, and matching-metadata differences. Its output intentionally makes no total-efficiency claim or automatic ownership inference. Recorded QA polling and any other enabled plugins remain part of the measured host configuration.

## Completed controlled captures

All six Unified/Focus Off/sidebar/overlay reports are now independently read and analyzed in [RESOURCE-RESULTS.md](RESOURCE-RESULTS.md). The machine-readable [resource-summary.json](../evidence/resources/resource-summary.json) preserves per-run values, hashes, condition checks, native before/after fields, and matching-metadata comparisons. Sixty samples were collected in total, with ten samples after a 20-second warm-up for each approximately 20-second run. All six report hashes match the conditions records, and all selected paired workload fields agree.

The reported scope is IINA main process only. Fifteen WebKit processes in the Unified session and sixteen to seventeen in the Focus session remain unattributed. The QA wrapper polls every 400 ms, modes ran in sequential order, shared WindowServer/system paging varied, and the main task reports minor UI/sidebar-continuity source changes between the sessions. These limitations preclude a total-efficiency winner or an isolated final-build A/B conclusion. Final post-QA-cleanup preservation remains a separate pending check.

### Safari comparison outcome

An optional same-source Safari comparison was attempted by the main task, but the saved `evidence/resources/safari-comparison-window.json` records disabled JavaScript inspection and an inability to verify decoded quality/codec/timing. It therefore records no validly matched benchmark and supports no relative efficiency claim. No inspection preference was enabled. The owned comparison window was closed after identification, and a pre-existing window's accidental resize was approximately restored; exact prior geometry was not captured. The preservation incident and recovery uncertainty are detailed in `PRESERVATION-AUDIT.md` and must accompany this comparison limitation.

The updated Safari record has SHA-256 `b3e16655cdea1adc433f318f9e1ee5c72b3e261fc9b3d8517065e94fb463f00d` and records cleanup at `2026-11-08T19:34:13.115469+00:00`. The auditor read the saved record only and did not operate Safari.
