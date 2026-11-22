#!/usr/bin/env python3
"""How often is the raw per-sample estimate of c right, and when does a 30 s median fail? (#2, #16)

For every sample of player A and B in a measurement run, the raw estimate is
    (end of the newest playlist segment) - (raw cache-end) - c_ffprobe
which is 0 when the estimate is exact and a multiple of the 2 s segment length when it is one segment off.
Prints the share of samples at each offset, the phase with the fewest exact samples, and how many 30 s windows
had a wrong median.

  python3 qa/spikes/live_latency_estimator_agreement.py <run dir> [<run dir> ...]
"""

import bisect
import collections
import json
import statistics
import sys


def newest_playlist_before(times, when):
    return bisect.bisect_right(times, when) - 1


def load_run(path):
    rows = [json.loads(line) for line in open(path + "/rows.jsonl")]
    c = statistics.mean(r["c"] for r in rows if r["k"] == "cal" and r["q"] == "160p30")
    playlists = [r for r in rows if r["k"] == "pl" and "last_end" in r]
    return rows, c, playlists


def usable(sample, variant):
    return (sample["k"] == "mpv" and sample["v"] == variant and sample["tp"] is not None and not sample["idle"]
            and sample["cache_end"] is not None)


def report(path):
    rows, c, playlists = load_run(path)
    times = [p["t1"] for p in playlists]
    for variant in "AB":
        offsets = collections.Counter()
        by_phase = collections.defaultdict(lambda: [0, 0])
        history = []
        windows = 0
        wrong_windows = 0
        for sample in rows:
            if not usable(sample, variant):
                continue
            index = newest_playlist_before(times, sample["t"])
            if index < 0:
                continue
            raw = playlists[index]["last_end"] - sample["cache_end"] - c
            offsets[round(raw / 2) * 2] += 1
            by_phase[sample["ph"]][1] += 1
            if abs(raw) < 0.5:
                by_phase[sample["ph"]][0] += 1
            history.append((sample["t"], raw + c))
            recent = [value for t, value in history if sample["t"] - t <= 30]
            if len(recent) >= 18:
                windows += 1
                wrong_windows += abs(statistics.median(recent) - c) > 0.5
        total = sum(offsets.values())
        shares = {k: "%.0f%%" % (100 * n / total) for k, n in sorted(offsets.items())}
        phase, (exact, count) = min(by_phase.items(), key=lambda item: item[1][0] / item[1][1])
        print("%s %s: share by offset %s of %d samples; fewest exact in phase %s (%d of %d); "
              "30 s windows with a wrong median: %d of %d" % (path.rstrip("/").split("/")[-1], variant, shares, total,
                                                              phase, exact, count, wrong_windows, windows))


if __name__ == "__main__":
    for run_path in sys.argv[1:]:
        report(run_path)
