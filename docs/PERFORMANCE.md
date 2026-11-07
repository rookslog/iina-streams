# Performance evidence — 2026-11-07

Status: **partial extraction benchmark; no matched Safari/IINA comparison**.

## New measurements on Apollo
- Source: live `https://www.twitch.tv/hutchmf`, Streamlink 8.6.3 `--no-config --loglevel error --stream-url ... 360p30`.
- Exactly three independent command invocations; exit status 0 each; no video player started.
- Run 1: wall 1.63 sec, maximum RSS 71,696,384 bytes (68.4 MiB), CPU time 0.36 user + 0.11 sys sec.
- Run 2: wall 1.30 sec, maximum RSS 67,911,680 bytes (64.8 MiB), CPU time 0.30 user + 0.07 sys sec.
- Run 3: wall 1.18 sec, maximum RSS 72,744,960 bytes (69.4 MiB), CPU time 0.29 user + 0.06 sys sec.
- Small sample, network latency and caching vary; `/usr/bin/time -l` measures **peak extractor-process footprint only**, not a sustained playback memory footprint.
- Direct extracted stream decoded six frames in headless mpv (`--vo=null --ao=null --hwdec=no --frames=6`) at 360p30, exit 0. That does not measure hardware decode or audio playback in IINA.
- `streamlink --json` returned currently available `audio_only,160p30,360p30,480p30,720p60,1080p60` for hutchmf. The JSON may include sensitive signed media URLs; raw response was **not committed**, and a temporary output file was cleared.
- `evidence/tests/resource-idle-2026-11-07.txt` records an idle process/swap snapshot at 13:21 local. Swap allocation then ~11,993 MiB; this is not a swap throughput measurement. Other applications running invalidate simple process-sum comparisons.

## Inherited preliminary results (not reproduced here)
Prior session noted total combined resident memory approx. 129–193 MiB for IINA+Streamlink 360p30, 160–212 MiB for 720p60 on different Twitch streams. No fair Safari comparison. Treat as historical probes only.

## Not established
- No 5-minute warm, repeated matched stream tests of Safari vs IINA.
- No production IINA steady-state RSS/CPU measurement, WebKit allocations, GPU shared memory, decoded frame/dropped frame metrics, or Energy Impact comparison.
- No chat overhead or shutdown memory return measurement.
- No evidence yet that Streamlink-based playback beats Safari in real energy consumption.

## Recommended future measurement
Use matched channel/quality/codec where possible; record exact session URL type (not tokens), decoder, player versions, timestamp, load, 2-minute warmup plus 5-minute samples repeated three times. Measure system memory pressure and **swap-ins/outs per interval**, not accumulated swap used; collect IINA, WebKit helpers, Streamlink, Safari and codec/performance. Turn chat on/off in one test only after M3. Never restart Safari or close unrelated windows to make a comparison look favorable.
