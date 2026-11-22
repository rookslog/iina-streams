#!/usr/bin/env python3
"""#51 "go further back": how much rewind does mpv's own cache hold, with the video stream selected?

mpv keeps what it downloaded since you joined, up to --demuxer-max-back-bytes (default 50 MiB). The seekable range
therefore grows at 1 s per second until the byte cap, then slides. This samples the range, the cached bytes and the
duration, and prints the master playlist's BANDWIDTH per rendition so the cap can be turned into seconds.

  python3 qa/spikes/backbuffer_probe.py <channel> [--quality 480p30] [--seconds 150]
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

MIB = 1024 * 1024


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("channel")
    parser.add_argument("--quality", default="480p30")
    parser.add_argument("--seconds", type=int, default=150)
    args = parser.parse_args()
    streams = lib.resolve_twitch(args.channel)
    stream = streams[args.quality]
    bandwidth = lib.master_bandwidths(stream["master"], stream["headers"])
    sock_dir = tempfile.mkdtemp(prefix="bb-", dir="/tmp")
    log = Log(os.path.join(sock_dir, "unused.jsonl"))
    # --vid=auto --vo=null: the video stream is selected (so its packets are cached) but nothing is drawn.
    mpv = Mpv("P", ["--rebase-start-time=yes", "--vid=auto", "--vo=null"], os.path.join(sock_dir, "p.sock"), log)
    mpv.start(stream["headers"])
    mpv.request("loadfile", stream["url"], "replace")
    print("| seconds | cached MiB | seekable range (s) | mpv max-back-bytes (MiB) |")
    print("|---|---|---|---|")
    start = time.time()
    last = None
    while time.time() - start < args.seconds:
        time.sleep(15)
        cache = mpv.get("demuxer-cache-state") or {}
        ranges = cache.get("seekable-ranges") or [{"start": 0, "end": 0}]
        last = (time.time() - start, cache.get("total-bytes", 0) / MIB, ranges[0]["end"] - ranges[0]["start"])
        print("| %.0f | %.1f | %.0f | %s |" % (last[0], last[1], last[2],
                                              (mpv.get("demuxer-max-back-bytes") or 0) / MIB))
    mpv.stop()
    shutil.rmtree(sock_dir, ignore_errors=True)
    print()
    print("master BANDWIDTH (Mbit/s) by rendition: " + ", ".join(
        "%s %.2f" % (name, bits / 1e6) for name, bits in sorted(bandwidth.items(), key=lambda kv: kv[1])))
    if last and last[2]:
        print("observed %s bytes per second of range: %.2f MiB/s" % (args.quality, last[1] / last[2]))
    for name, bits in sorted(bandwidth.items(), key=lambda kv: kv[1]):
        print("inferred 50 MiB back-buffer horizon at %s: %.0f s" % (name, 50 * MIB * 8 / bits))


if __name__ == "__main__":
    main()
