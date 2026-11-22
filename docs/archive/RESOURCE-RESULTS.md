# Native resource observations — Unified and Focus

**Scope: IINA main process only. Six short QA captures completed on 2026-11-08, with 60 samples in total.** All six saved reports passed independent checksum and condition review. They provide reproducible observations of the two presentations under closely matched playback settings. WebKit ownership remains unverified, the shared implementation changed slightly between the two sessions, and system activity varied; these results do not establish a resource-efficiency winner.

The complete machine-readable analysis is [resource-summary.json](../evidence/resources/resource-summary.json), SHA-256 `d158e04cf9710fa96b94da052579cbb3bc5b9acb7f49dcaeedb54802ce98df13`. The collection/attribution protocol and the earlier sampler-validation limitations are in [RESOURCE-METHODOLOGY.md](RESOURCE-METHODOLOGY.md).

## Workload and environment

Both sessions used the public archived YouTube source `https://www.youtube.com/watch?v=92h_kU8O58M` and its genuine imported chat archive. The test operator started a fresh IINA process with one QA-managed player for each variant. Unified used PID 99898; Focus used PID 40519. Original IINA plugins retained their prior enablement.

Each variant ran the same sequence: chat Off, replay in the sidebar, then replay in the overlay. Each condition sought to approximately 120 seconds, played for a 20-second warm-up, and then collected ten samples at a requested two-second interval during a 20-second sampling window. Sampling covered approximately source seconds 140–161. The state at both ends of each run reported:

- Format 136, H.264 video at 1280×720 and 30 fps.
- AAC audio at 44,100 Hz and `videotoolbox-copy` hardware decoding.
- Speed 1×, unpaused playback, no active acquisition/helper, no cache pause, and zero dropped frames.
- A 1280×800 application window, with fullscreen off.

The paired Off/sidebar/overlay reports have no differences or missing values in the analyzer's selected media, playback, window-size, and chat-configuration comparison fields. The native endpoint records support the media properties and frame sizes. Some metadata, including the declared 300-pixel sidebar width and one-player count, comes from the test configuration/operator record rather than an independent measurement of every visible surface. The Unified overlay window used origin (156,135); the other conditions used (140,140). Frame geometry remained stable within each run.

The environment was IINA 1.5.1 build 183 on macOS 27.2 build 26B123, hardware model `Mac16,13`, 16 GiB installed memory, and 10 logical/physical CPUs as reported by sysctl. Every report records sampler SHA-256 `9e2846befd1b072f5ce34764b33b4127feb7d6a9f7c2179dbb4674c3e5db3862` and repository HEAD `ab4a00f0a1324769283275c39f3b7df3376c7a84`.

**Build qualification:** repository HEAD does not identify uncommitted or already loaded plugin bytes. The main task reports that Focus included the latest minor UI/sidebar-continuity fixes after the Unified captures. These are observations of evolving QA builds, not an isolated comparison of final packages differing only by variant. The QA command poll ran every 400 ms in both sessions; its overhead is included. No synthetic chat substituted for the genuine archive in these runs.

## IINA main-process CPU and resident memory

CPU values are the native `ps %cpu` readings, without whole-machine normalization. Resident memory is RSS converted from KiB to MiB by dividing by 1,024. RSS is not private memory or physical footprint.

| Variant | Chat presentation | CPU % median | CPU % range | RSS MiB median | RSS MiB range |
| --- | --- | --- | --- | --- | --- |
| Unified | Off | 7.30 | 6.0–8.0 | 174.297 | 163.750–175.531 |
| Unified | Sidebar replay | 7.90 | 6.6–8.6 | 178.328 | 176.406–180.078 |
| Unified | Overlay replay | 13.95 | 5.3–42.4 | 184.312 | 178.781–199.047 |
| Focus | Off | 6.45 | 5.5–8.5 | 114.516 | 109.656–116.875 |
| Focus | Sidebar replay | 8.10 | 6.4–25.3 | 127.359 | 118.578–133.062 |
| Focus | Overlay replay | 8.65 | 5.6–29.3 | 97.672 | 94.641–107.422 |

The two Off observations and sidebar median CPU values were fairly close in these short captures. Unified's overlay run had a higher median and a wider CPU range. Focus's main-process RSS was lower in this session, and fell between its sidebar and overlay runs. Those observations should remain attached to their exact runs: they do not isolate a design's memory cost, explain the cause of a spike, or demonstrate a leak or its absence. Paging/compression, retained views/caches, differing fresh-process histories, evolving source, and unrelated system activity can affect resident memory and timing.

No descendants or explicitly attributed WebKit helpers entered the scoped totals. Consequently `scopedTotal` equals the IINA main process for all 60 samples. The main process also contains IINA itself and any relevant work from other enabled plugins; the table is not an incremental Streams-only overhead measurement.

## Shared processes, memory pressure, swap, and helpers

WindowServer is shared by the desktop. Its large changes across conditions are a reason to avoid treating these sequential samples as a controlled whole-system benchmark.

| Variant / mode | WindowServer CPU % median (range) | System memory-free % range | Swap-used change | Swapins delta | Swapouts delta | Unattributed WebKit count |
| --- | --- | --- | --- | --- | --- | --- |
| Unified / Off | 26.35 (22.3–28.3) | 48–49 | 0 MiB | 294 | 0 | 15 |
| Unified / Sidebar | 6.35 (3.5–9.1) | 52–54 | 0 MiB | 68 | 0 | 15 |
| Unified / Overlay | 23.15 (8.8–45.0) | 45–53 | 0 MiB | 231 | 0 | 15 |
| Focus / Off | 7.75 (5.3–16.8) | 43–47 | 0 MiB | 99 | 0 | 16 |
| Focus / Sidebar | 32.50 (8.6–47.9) | 37–49 | −16 MiB | 931 | 0 | 16–17 |
| Focus / Overlay | 30.45 (8.3–45.0) | 40–49 | −32 MiB | 784 | 0 | 16–17 |

Swap figures are system-wide changes between the first and last collected samples. The absence of a swap-used increase does not mean no swap-in activity occurred. The memory-free percentage is the queried `memory_pressure -Q` value, not an independently inferred severity classification. Neither these values nor WindowServer's readings are attributed to the candidate.

WebKit workers had PPID 1. Targeted unprivileged `launchctl procinfo` queries required root privileges, so no responsible-owner field was obtained and no escalation was attempted. Lifecycle/start-time correlation was kept as an inference and did not silently move those workers into the IINA total. Counts also changed between and during the sessions. Total app-plus-WebKit CPU/memory therefore remains unmeasured.

Native endpoint records and sampled process trees showed no active helper work. Both completed condition files report that the final Off action left chat mode Off, zero retained messages, and no active helpers. This is bounded lifecycle evidence for those observations, not proof of long-session cleanup or complete process-memory release. Network overhead was not measured.

## Interpretation limits and Safari outcome

These were single sequential runs per condition, with Off → sidebar → overlay ordering and no counterbalancing or repeated trials. A new process was used for each variant, but caches, desktop activity, and system paging were not held constant. Sidebar and overlay intentionally allocate different visible space to chat/video. QA instrumentation remains present, and the final ordinary packages were not the measured artifacts.

The optional same-source Safari attempt did not produce a validly matched comparison: JavaScript inspection was disabled and decoded quality/codec/timing could not be verified. No inspection preference was enabled. The saved comparison record supports no browser-efficiency conclusion. During that attempt, a pre-existing Safari window was accidentally resized; the owned comparison window was later closed and the other window approximately restored. Exact prior geometry was not captured. The disclosure and recovery evidence are in [PRESERVATION-AUDIT.md](PRESERVATION-AUDIT.md).

No battery-life, energy-efficiency, total application cost, long-session stability, or release-readiness conclusion follows from these CPU/RSS captures. They are useful as reproducible native observations and as a baseline for later controlled measurements with responsible WebKit attribution and fixed final build bytes.

## Timing and evidence integrity

All timestamps below are UTC on 2026-11-08. Every run had a 20-second warm-up, ten samples, `terminationReason: duration`, stable root PID identity, and no query errors. Small differences between requested and measured elapsed time are retained rather than rounded away.

| Report | Start | End | Measured seconds |
| --- | --- | --- | --- |
| `unified-off.json` | 19:20:10.561 | 19:20:30.632 | 20.071 |
| `unified-sidebar.json` | 19:20:54.821 | 19:21:14.891 | 20.070 |
| `unified-overlay.json` | 19:21:40.079 | 19:22:00.159 | 20.080 |
| `focus-off.json` | 19:38:56.267 | 19:39:16.342 | 20.075 |
| `focus-sidebar.json` | 19:39:41.029 | 19:40:01.101 | 20.073 |
| `focus-overlay.json` | 19:40:26.127 | 19:40:46.200 | 20.074 |

The independently read sample files match the SHA-256 values stored in their corresponding conditions records. Unified's conditions record completed at `19:22:01.568802+00:00`; Focus's completed at `19:40:47.825767+00:00`.

| Evidence file in `evidence/resources/` | SHA-256 |
| --- | --- |
| `unified-conditions.json` | `332a6657490b1bab465433349ab1b65c2e4cf97b9b91f60d9608e164705b1784` |
| `unified-off.json` | `a12becdde9f04041cceae14e6d7740f9ed409e4373d77ff188c512f1737c1e04` |
| `unified-sidebar.json` | `86499cc0814b8fdea304d247c9aeff2cbcf1d228f2b852aa290ddbfd0419126c` |
| `unified-overlay.json` | `4382b8ce6f3d66dcf906680c3f34ed7d8ba37022b59903215c4e0de892825b17` |
| `focus-conditions.json` | `3d9b99af08ca7b445ee3ee51245ee48d579be55cc742e76f49d46bc8adc002df` |
| `focus-off.json` | `ad4d3b36a144f2ca496c351dff87b6b8af02e7143702be472b0d3edec4ef53cc` |
| `focus-sidebar.json` | `af886793c5f133a069312f770b27ad2730f59f7a7ad2b5a2c7e67b966221eca9` |
| `focus-overlay.json` | `a47130f5117fcd6730afbbaef0125897d5f29f42bf8c764ff1baa9dd38e585fe` |

To regenerate the numerical summary from these saved reports, with no native application action:

```sh
/usr/bin/python3 -B qa/analyze-resources.py \
  --directory /Users/rookslog/development/iina-streams-candidates/evidence/resources
```

The analyzer used for this review has SHA-256 `d2e60a1b29a97c43a0d09b7fe7c0065fa8b9d5a0befb8988912e3a8c31dc0873`. It does not operate IINA/Safari or sample a running process; it reads the saved reports and condition records. The earlier eight-second sampler-validation capture overlapped a quality switch and is excluded from every controlled-results table above.
