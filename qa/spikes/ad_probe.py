#!/usr/bin/env python3
"""Look for a Twitch stitched ad (pre-roll) in the first playlist of a fresh anonymous session.

An ad shows in the media playlist as an EXT-X-DATERANGE with CLASS "twitch-stitched-ad" (or an ID that starts with
"stitched-ad-"), a changed segment URI host, and usually an EXT-X-DISCONTINUITY. Prints tag names and counts only.

  python3 qa/spikes/ad_probe.py <channel> [<channel> ...] [--rounds 2]
"""

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import live_lib as lib  # noqa: E402


def probe(channel, quality):
    stream = lib.resolve_twitch(channel)[quality]
    _, body, _ = lib.fetch(stream["url"], stream["headers"])
    text = body.decode()
    classes = sorted({lib.tag_attributes(line).get("CLASS", "") for line in text.splitlines()
                      if line.startswith("#EXT-X-DATERANGE:")})
    stitched = "stitched-ad" in text
    return {"channel": channel, "classes": classes, "stitched_ad_marker": stitched,
            "discontinuities": text.count("#EXT-X-DISCONTINUITY")}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("channels", nargs="+")
    parser.add_argument("--rounds", type=int, default=2)
    parser.add_argument("--quality", default="160p30")
    args = parser.parse_args()
    for round_number in range(args.rounds):
        for channel in args.channels:
            try:
                print(round_number, probe(channel, args.quality), flush=True)
            except Exception as error:
                print(round_number, channel, "error:", lib.mask(error), flush=True)
            time.sleep(1)


if __name__ == "__main__":
    main()
