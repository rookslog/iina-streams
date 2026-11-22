#!/usr/bin/env python3
"""Probe #51 "go further back": the live playlist's DVR window, and whether a VOD exists while the channel is live.

Prints numbers and tag names only. URLs, tokens and signed query strings are never printed.

  python3 qa/spikes/dvr_window_probe.py <channel> [--quality 160p30]
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "..", "helpers"))
import live_lib as lib  # noqa: E402
import media  # noqa: E402  (read-only: its VOD admission regexes, to say whether Streams would admit the URL)

GQL = "https://gql.twitch.tv/gql"
CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko"  # the public web client id, also used by helpers/acquire.py
ARCHIVE_QUERY = ('query($login:String!){user(login:$login){stream{id createdAt viewersCount '
                 'archiveVideo{id status lengthSeconds createdAt broadcastType}} '
                 'videos(first:1,type:ARCHIVE){edges{node{id status lengthSeconds createdAt}}}}}')


def gql(query, variables):
    body = json.dumps({"query": query, "variables": variables}).encode()
    request = urllib.request.Request(GQL, data=body, headers={"Client-ID": CLIENT_ID, "Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.loads(response.read())


def vod_playlist_numbers(text):
    """Return what a VOD media playlist says about itself, from EXTINF and the header tags."""
    durations = [float(m) for m in re.findall(r"#EXTINF:([0-9.]+)", text)]
    tags = sorted({line.split(":")[0] for line in text.splitlines() if line.startswith("#")})
    return {"segments": len(durations), "total_s": round(sum(durations), 3), "endlist": "#EXT-X-ENDLIST" in text,
            "tags": tags,
            "twitch_total": next((float(l.split(":")[1]) for l in text.splitlines()
                                  if l.startswith("#EXT-X-TWITCH-TOTAL-SECS")), None),
            "playlist_type": next((l.split(":")[1] for l in text.splitlines() if l.startswith("#EXT-X-PLAYLIST-TYPE")), None)}


def describe_url_shape(url):
    """Say what Streams' helper would do with a VOD URL without printing it."""
    parts = urllib.parse.urlsplit(url)
    path = parts.path
    return {"host_is_cloudfront_distribution": bool(media.TWITCH_VOD_HOST.fullmatch(parts.netloc)),
            "path_shape_admitted_by_helper": media._twitch_vod_path(path),
            "path_last_segment": re.sub(r"[A-Za-z0-9]{12,}", "<id>", path.rsplit("/", 1)[-1]),
            "query_param_names": sorted(urllib.parse.parse_qs(parts.query))}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("channel")
    parser.add_argument("--quality", default="160p30")
    args = parser.parse_args()
    out = {}

    streams = lib.resolve_twitch(args.channel)
    live = streams[args.quality]
    t0 = time.time()
    _, body, headers = lib.fetch(live["url"], live["headers"])
    row = lib.playlist_row(body.decode(), t0, time.time(), headers.get("Date"))
    out["live_playlist"] = {k: row.get(k) for k in ("n", "np", "window_s", "elapsed", "total", "seq", "ranges")}
    out["live_playlist"]["target_duration_s"] = lib.parse_media_playlist(body.decode())[1]["target"]
    out["live_playlist"]["has_endlist"] = "#EXT-X-ENDLIST" in body.decode()
    out["live_playlist"]["tag_names"] = sorted({l.split(":")[0] for l in body.decode().splitlines() if l.startswith("#")})

    answer = gql(ARCHIVE_QUERY, {"login": args.channel})
    user = (answer.get("data") or {}).get("user") or {}
    stream = user.get("stream") or {}
    out["gql"] = {"errors": [lib.mask(e.get("message", "")) for e in answer.get("errors", [])][:3],
                  "stream_started": stream.get("createdAt"), "archiveVideo": stream.get("archiveVideo"),
                  "latest_archive_edge": [e["node"] for e in (user.get("videos") or {}).get("edges", [])]}
    # Only the live stream's own archive counts. The channel's latest older VOD would answer a different question.
    video = stream.get("archiveVideo")
    out["gql"]["live_stream_has_archive_video"] = bool(video)
    if video:
        try:
            vod_streams = lib.resolve_twitch_url("twitch.tv/videos/" + video["id"])
        except RuntimeError as error:
            vod_streams = {}
            out["vod_resolve_error"] = str(error)
        pick = vod_streams.get(args.quality) or next(iter(vod_streams.values()), None)
        if pick:
            samples = []
            for index in range(2):
                t_live = time.time()
                _, live_body, _ = lib.fetch(live["url"], live["headers"])
                live_total = lib.parse_media_playlist(live_body.decode())[1]["total"]
                _, vod_body, _ = lib.fetch(pick["url"], pick["headers"])
                numbers = vod_playlist_numbers(vod_body.decode())
                numbers["live_total_secs_same_moment"] = live_total
                numbers["vod_behind_live_secs"] = None if live_total is None else round(live_total - numbers["total_s"], 3)
                numbers["t"] = round(t_live - t0, 1)
                samples.append(numbers)
                if index == 0:
                    time.sleep(30)
            # Do live and VOD share one timeline? Compare c = PDT - PTS of a live segment and of the VOD's first and
            # next-to-last segments (the VOD list is longer, so this also downloads two 10 s segments).
            live_c = lib.calibrate(live["url"], live["headers"])
            vod_c = lib.calibrate(pick["url"], pick["headers"])
            vod_segments = [x for x in lib.parse_media_playlist(vod_body.decode())[0] if not x["prefetch"]]
            newest_end = vod_segments[-1]["pdt"] + vod_segments[-1]["dur"]
            out["timeline"] = {"live_c": live_c["c"], "vod_c_first_segment": vod_c["c_first"],
                               "vod_c_newest_segment": vod_c["c_last"], "vod_minus_live_c_s": vod_c["c"] - live_c["c"],
                               "vod_has_program_date_time": bool(vod_segments and vod_segments[0]["pdt"]),
                               "vod_segment_durations": sorted({x["dur"] for x in vod_segments})[:4],
                               "vod_newest_pdt_end_behind_wall_s": time.time() - newest_end}
            out["vod_url_shape"] = describe_url_shape(pick["url"])
            out["vod_samples"] = samples
    print(json.dumps(out, indent=1, default=str))


if __name__ == "__main__":
    main()
