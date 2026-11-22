"""Shared helpers for the #16/#31/#51 live-latency spike (measurement only, not product code).

Nothing here prints or stores a URL, a token or an IP. Rows written to the log hold numbers and tag names only;
mask() is applied to every string that could reach a terminal.
"""

import datetime
import json
import os
import re
import subprocess
import tempfile
import urllib.parse
import urllib.request

STREAMLINK = "/opt/homebrew/bin/streamlink"
MPV = "/opt/homebrew/bin/mpv"
FFPROBE = "/opt/homebrew/bin/ffprobe"

# The same flags helpers/media.py passes for a Twitch resolve, so the playlist URL is the one Streams hands mpv.
STREAMLINK_RESOLVE = ["--no-config", "--no-plugin-cache", "--no-plugin-sideloading", "--http-ignore-env",
                      "--webbrowser", "false", "--loglevel", "none", "--http-timeout", "12", "--json"]

ALLOWED_HEADERS = {"user-agent": "User-Agent", "accept": "Accept", "accept-language": "Accept-Language"}
URL = re.compile(r"https?://\S+")
LONG_TOKEN = re.compile(r"[A-Za-z0-9_\-]{32,}")
IPV4 = re.compile(r"\b\d{1,3}(?:\.\d{1,3}){3}\b")
KNOWN_DATERANGE_CLASSES = {"timestamp", "twitch-session", "twitch-stream-source", "twitch-trigger"}


def mask(text):
    text = URL.sub("<URL>", str(text))
    text = IPV4.sub("<IP>", text)
    return LONG_TOKEN.sub("<TOKEN>", text)


def streams_headers(headers):
    """The header subset helpers/media.py forwards to mpv (cookies and everything else are dropped)."""
    return {ALLOWED_HEADERS[k.lower()]: v for k, v in headers.items() if k.lower() in ALLOWED_HEADERS}


def resolve_twitch(channel):
    return resolve_twitch_url("twitch.tv/" + channel)


def resolve_twitch_url(target):
    """Return {quality: {"url": media playlist, "headers": {...}}}. Raises RuntimeError with a masked message."""
    command = [STREAMLINK] + STREAMLINK_RESOLVE + [target]
    done = subprocess.run(command, capture_output=True, text=True, timeout=60)
    try:
        data = json.loads(done.stdout)
    except ValueError:
        raise RuntimeError("streamlink gave no JSON: " + mask(done.stderr[:200]))
    if "error" in data:
        raise RuntimeError("streamlink: " + mask(data["error"]))
    return {name: {"url": s["url"], "master": s.get("master"), "headers": streams_headers(s.get("headers", {}))}
            for name, s in data["streams"].items() if s.get("type") == "hls"}


def fetch(url, headers, timeout=12):
    """GET a URL; return (status, body bytes, response headers)."""
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.status, response.read(), response.headers


def iso_to_epoch(text):
    return datetime.datetime.fromisoformat(text).timestamp()


def tag_attributes(line):
    """Parse the KEY=VALUE,KEY="VALUE" list after the colon of a tag."""
    body = line.split(":", 1)[1] if ":" in line else ""
    return {k: v.strip('"') for k, v in re.findall(r'([A-Z0-9-]+)=("[^"]*"|[^,]*)', body)}


def parse_media_playlist(text):
    """Parse a Twitch media playlist. Segment URIs stay in memory (for calibration) and are never logged."""
    segments = []
    info = {"seq": None, "elapsed": None, "total": None, "ranges": [], "discontinuities": 0,
            "server_time": None, "target": None}
    pdt = None
    duration = None
    for line in text.splitlines():
        if line.startswith("#EXT-X-MEDIA-SEQUENCE:"):
            info["seq"] = int(line.split(":")[1])
        elif line.startswith("#EXT-X-TARGETDURATION:"):
            info["target"] = int(line.split(":")[1])
        elif line.startswith("#EXT-X-TWITCH-ELAPSED-SECS:"):
            info["elapsed"] = float(line.split(":")[1])
        elif line.startswith("#EXT-X-TWITCH-TOTAL-SECS:"):
            info["total"] = float(line.split(":")[1])
        elif line.startswith("#EXT-X-DISCONTINUITY"):
            info["discontinuities"] += 1
        elif line.startswith("#EXT-X-DATERANGE:"):
            attrs = tag_attributes(line)
            info["ranges"].append(attrs.get("CLASS", ""))
            if attrs.get("CLASS") == "timestamp" and "X-SERVER-TIME" in attrs:
                info["server_time"] = float(attrs["X-SERVER-TIME"])
        elif line.startswith("#EXT-X-PROGRAM-DATE-TIME:"):
            pdt = iso_to_epoch(line.split(":", 1)[1])
        elif line.startswith("#EXTINF:"):
            duration = float(line.split(":")[1].split(",")[0])
        elif line.startswith("#EXT-X-TWITCH-PREFETCH:"):
            regular = [s for s in segments if not s["prefetch"]]
            start = segments[-1]["pdt"] + segments[-1]["dur"] if segments else None
            average = sum(s["dur"] for s in regular) / max(1, len(regular))
            segments.append({"pdt": start, "dur": average, "uri": line.split(":", 1)[1], "prefetch": True})
        elif line and not line.startswith("#") and pdt is not None and duration is not None:
            segments.append({"pdt": pdt, "dur": duration, "uri": line, "prefetch": False})
            pdt = None
            duration = None
    return segments, info


def playlist_row(text, t_request, t_response, date_header):
    """Reduce a playlist to the numbers the analysis needs."""
    segments, info = parse_media_playlist(text)
    regular = [s for s in segments if not s["prefetch"]]
    prefetch = [s for s in segments if s["prefetch"]]
    row = {"k": "pl", "t0": t_request, "t1": t_response, "date": date_header, "seq": info["seq"],
           "n": len(regular), "np": len(prefetch), "elapsed": info["elapsed"], "total": info["total"],
           "server_time": info["server_time"], "disc": info["discontinuities"],
           "ranges": sorted(set(info["ranges"])),
           "unknown_ranges": sorted(set(info["ranges"]) - KNOWN_DATERANGE_CLASSES)}
    if regular:
        row["first_pdt"] = regular[0]["pdt"]
        row["last_end"] = regular[-1]["pdt"] + regular[-1]["dur"]
        row["window_s"] = row["last_end"] - regular[0]["pdt"]
    if prefetch and prefetch[-1]["pdt"] is not None:
        row["prefetch_end"] = prefetch[-1]["pdt"] + prefetch[-1]["dur"]
    return row


def segment_pts(segment_uri, headers):
    """Download one segment and return the video stream start_time (raw PTS seconds), via ffprobe."""
    _, body, _ = fetch(segment_uri, headers, timeout=20)
    with tempfile.TemporaryDirectory() as folder:
        path = os.path.join(folder, "seg.ts")
        with open(path, "wb") as handle:
            handle.write(body)
        out = subprocess.run([FFPROBE, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=start_time",
                              "-of", "default=nw=1:nk=1", path], capture_output=True, text=True, timeout=30)
    return float(out.stdout.split()[0])


def calibrate(playlist_url, headers):
    """Offset c = PROGRAM-DATE-TIME minus raw PTS, from an old and a new regular segment of the playlist.

    With `mpv --rebase-start-time=no`, mpv's time-pos is the raw PTS, so playhead wall time = time-pos + c.
    c_first and c_last differ only if PTS and PDT drift within the playlist window (about 30 s apart).
    """
    _, body, _ = fetch(playlist_url, headers)
    segments, _ = parse_media_playlist(body.decode())
    regular = [s for s in segments if not s["prefetch"]]
    first, last = regular[0], regular[-2]
    c_first = first["pdt"] - segment_pts(urllib.parse.urljoin(playlist_url, first["uri"]), headers)
    c_last = last["pdt"] - segment_pts(urllib.parse.urljoin(playlist_url, last["uri"]), headers)
    return {"c_first": c_first, "c_last": c_last, "c": (c_first + c_last) / 2}


def master_bandwidths(master_url, headers):
    """BANDWIDTH (bits per second) of each variant in the master playlist, keyed by its NAME."""
    _, body, _ = fetch(master_url, headers)
    result = {}
    lines = body.decode().splitlines()
    for index, line in enumerate(lines):
        if line.startswith("#EXT-X-STREAM-INF:"):
            attrs = tag_attributes(line)
            result[attrs.get("VIDEO", attrs.get("RESOLUTION", "?"))] = int(attrs["BANDWIDTH"])
    return result
