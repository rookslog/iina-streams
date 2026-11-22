#!/usr/bin/env python3
"""Could an Auto chat-sync estimator work from data a plugin can see, without ffprobe? (#2, #16)

The measurement script knew c = PROGRAM-DATE-TIME - raw PTS from ffprobe. A plugin has no ffprobe, but it can read
the media playlist and mpv's cache-end. This replays a measurement run with only those inputs:

    c_hat(t) = median over the last WINDOW seconds of  (end of the newest playlist segment) - (raw cache-end)
    behind_hat = now - (raw time-pos + c_hat)

and prints |behind_hat - behind| per phase of the run, where `behind` uses the ffprobe c.

  python3 qa/spikes/live_latency_estimator_check.py <run dir> [<window seconds, default 30>]
"""

import bisect
import json
import statistics
import sys


def main():
    run = sys.argv[1]
    window = int(sys.argv[2]) if len(sys.argv) > 2 else 30
    rows = [json.loads(line) for line in open(run + "/rows.jsonl")]
    c_true = statistics.mean(r["c"] for r in rows if r["k"] == "cal" and r["q"] == "160p30")
    playlists = [r for r in rows if r["k"] == "pl" and "last_end" in r]
    times = [r["t1"] for r in playlists]
    print("| variant | phase | n | median abs error (s) | p95 | max |")
    print("|---|---|---|---|---|---|")
    for variant in "AB":
        history = []
        errors = {}
        for r in rows:
            if r["k"] != "mpv" or r["v"] != variant or r["tp"] is None or r["idle"] or r["cache_end"] is None:
                continue
            index = bisect.bisect_right(times, r["t"]) - 1
            if index < 0:
                continue
            history.append((r["t"], playlists[index]["last_end"] - r["cache_end"]))
            recent = [value for t, value in history if r["t"] - t <= window]
            if len(recent) < window * 0.6:
                continue
            c_hat = statistics.median(recent)
            truth = r["t"] - (r["tp"] + c_true)
            estimate = r["t"] - (r["tp"] + c_hat)
            errors.setdefault(r["ph"], []).append(abs(estimate - truth))
        for phase, values in errors.items():
            ordered = sorted(values)
            print("| %s | %s | %d | %.2f | %.2f | %.2f |" % (variant, phase, len(values), statistics.median(ordered),
                                                              ordered[int(0.95 * (len(ordered) - 1))], ordered[-1]))


if __name__ == "__main__":
    main()
