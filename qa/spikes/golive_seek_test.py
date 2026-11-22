#!/usr/bin/env python3
"""#51 "Go Live": which mpv action returns a rewound live HLS player to the edge?

One headless mpv with DEFAULT time handling (rebase-start-time=yes, so time-pos starts at 0 on join, as in IINA).
Raw PTS = time-pos + demuxer-start-time, wall time of the playhead = raw PTS + c, behind = now - that.
Each method runs after the player has been rewound 30 s with a relative seek, and is observed for 15 s.

  python3 qa/spikes/golive_seek_test.py <channel> --out <dir>

Writes <dir>/rows.jsonl and prints one summary table. Numbers only; no URLs or tokens.
"""

import argparse
import json
import os
import shutil
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import live_lib as lib  # noqa: E402
from live_latency_measure import Log, Mpv  # noqa: E402


def observe(mpv, c, seconds, label, rows, log):
    """Sample once a second; return the list of (seconds into the phase, behind)."""
    series = []
    end = time.time() + seconds
    start = time.time()
    while time.time() < end:
        t0 = time.time()
        tp = mpv.get("time-pos")
        base = mpv.get("demuxer-start-time")
        idle = mpv.get("idle-active")
        stalled = mpv.get("paused-for-cache")
        cache = mpv.get("demuxer-cache-state") or {}
        now = (t0 + time.time()) / 2
        behind = None if tp is None or base is None or idle else now - (tp + base + c)
        series.append((now - start, behind, stalled))
        log.write({"k": "gl", "t": now, "phase": label, "tp": tp, "start": base, "behind": behind, "idle": idle, "pfc": stalled,
                   "cache_end": cache.get("cache-end"), "dur": mpv.get("duration")})
        time.sleep(max(0, 1.0 - (time.time() - t0)))
    return series


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("channel")
    parser.add_argument("--out", required=True)
    parser.add_argument("--quality", default="160p30")
    args = parser.parse_args()
    os.makedirs(args.out, exist_ok=True)
    log = Log(os.path.join(args.out, "rows.jsonl"))
    stream = lib.resolve_twitch(args.channel)[args.quality]
    c = lib.calibrate(stream["url"], stream["headers"])["c"]
    sock_dir = tempfile.mkdtemp(prefix="gl-", dir="/tmp")
    mpv = Mpv("G", ["--rebase-start-time=yes"], os.path.join(sock_dir, "g.sock"), log)
    mpv.start(stream["headers"])
    summary = []

    def start_playback():
        mpv.request("loadfile", stream["url"], "replace")

    def method_seek_percent():
        return mpv.request("seek", 100, "absolute-percent").get("error")

    def method_seek_cache_end():
        cache_end = (mpv.get("demuxer-cache-state") or {}).get("cache-end")
        return mpv.request("seek", cache_end, "absolute").get("error")

    def method_seek_duration():
        return mpv.request("seek", mpv.get("duration"), "absolute").get("error")

    def method_seek_before_cache_end(seconds):
        def run():
            cache_end = (mpv.get("demuxer-cache-state") or {}).get("cache-end")
            return mpv.request("seek", cache_end - seconds, "absolute").get("error")
        return run

    def method_seek_huge_relative():
        return mpv.request("seek", 1000000, "relative").get("error")

    def method_reload():
        return mpv.request("loadfile", stream["url"], "replace").get("error")

    methods = [("seek 100 absolute-percent", method_seek_percent), ("seek <cache-end> absolute", method_seek_cache_end),
               ("seek <duration> absolute", method_seek_duration),
               ("seek <cache-end> - 0.5 absolute", method_seek_before_cache_end(0.5)),
               ("seek <cache-end> - 2 absolute", method_seek_before_cache_end(2)),
               ("seek <cache-end> - 4 absolute", method_seek_before_cache_end(4)),
               ("loadfile same URL (reload)", method_reload),
               ("seek +1000000 relative", method_seek_huge_relative)]

    start_playback()
    series = observe(mpv, c, 40, "join", None, log)
    summary.append(["join, 40 s later", "-", series[-1][1], "-"])
    for name, method in methods:
        mpv.request("seek", -30, "relative")
        before = observe(mpv, c, 10, "rewound for " + name, None, log)
        seeks_before = mpv.event_counts.get("seek", 0)
        answer = method()
        after = observe(mpv, c, 15, name, None, log)
        did_seek = mpv.event_counts.get("seek", 0) - seeks_before
        values = [b for _, b, _ in after if b is not None]
        stalls = sum(1 for _, _, p in after if p)
        gaps = sum(1 for _, b, _ in after if b is None)
        summary.append([name, "%.1f" % before[-1][1] if before[-1][1] is not None else "-",
                        "%.1f" % values[-1] if values else "-", "mpv: %s; seek events: %d; samples with no position: %d; samples paused-for-cache: %d; min %s" % (
                            answer, did_seek, gaps, stalls, "%.1f" % min(values) if values else "-")])
        if gaps > 10:  # the player stopped: restore it before the next method
            start_playback()
            observe(mpv, c, 20, "restore", None, log)
    mpv.stop()
    shutil.rmtree(sock_dir, ignore_errors=True)
    print("| method | behind just before (s) | behind 15 s after (s) | notes |")
    print("|---|---|---|---|")
    for row in summary:
        print("| " + " | ".join(str(x) if not isinstance(x, float) else "%.1f" % x for x in row) + " |")


if __name__ == "__main__":
    main()
