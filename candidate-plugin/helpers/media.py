#!/usr/bin/env python3
"""Bounded public-media acquisition. Stdout is private IPC, never a log."""

import argparse
import json
import math
import os
import re
import selectors
import signal
import subprocess
import sys
import threading
import time
from urllib.parse import parse_qs, urlsplit


STREAMLINK = "/opt/homebrew/bin/streamlink"
YTDLP = "/opt/homebrew/bin/yt-dlp"
MAX_METADATA_BYTES = 8 * 1024 * 1024
MAX_RESPONSE_BYTES = 64 * 1024
MAX_FORMATS = 512
MAX_URL_BYTES = 16384
MAX_START_SECONDS = 2592000
CHANNEL = re.compile(r"[A-Za-z0-9_]{3,25}\Z")
VIDEO_ID = re.compile(r"[A-Za-z0-9_-]{11}\Z")
FORMAT_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}\Z")
TWITCH_QUALITY = re.compile(r"([1-9][0-9]{1,3})p([1-9][0-9]{0,2})?\Z")
RESERVED_TWITCH = {"videos", "directory", "search", "settings", "subscriptions", "following", "downloads",
                  "login", "signup", "products", "p", "popout", "clips"}
AUTO = {"id": "auto720", "label": "Auto · 720p preferred"}
# Exact Twitch-owned distribution observed from Streamlink's public hutchmf VOD
# 2923174759 on 2026-11-08. Deliberately do not allow arbitrary CloudFront tenants.
TWITCH_VOD_DISTRIBUTIONS = {"d2vi6trrdongqn.cloudfront.net"}


ERROR_MESSAGES = {
    "INVALID_ARGUMENTS": "The media request is invalid.",
    "UNSUPPORTED_SOURCE": "Enter a public Twitch channel, Twitch recording, or YouTube video URL.",
    "INVALID_QUALITY": "Choose Auto or one of the available qualities.",
    "QUALITY_UNAVAILABLE": "That quality is no longer available. Open the stream again and choose another quality.",
    "UNSAFE_MEDIA_URL": "The extractor returned an unsupported media address.",
    "INVALID_METADATA": "The extractor returned unreadable or unexpected media information.",
    "UNAVAILABLE": "This video or stream is unavailable. It may be offline, private, or restricted.",
    "NO_PLAYABLE_FORMAT": "No compatible public playback format is currently available.",
    "AUDIO_UNAVAILABLE": "No compatible audio format is currently available for this quality.",
    "AUTH_REQUIRED": "This media requires account access, which this candidate does not request.",
    "DRM_UNSUPPORTED": "This protected media cannot be played by this candidate.",
    "TIMEOUT": "Finding playback formats timed out. Try again.",
    "CANCELLED": "The media request was cancelled.",
    "OUTPUT_LIMIT": "The extractor returned more information than the candidate can process.",
    "MISSING_DEPENDENCY": "A required media extractor is not available on this Mac.",
    "EXTRACTOR_FAILED": "The media service could not be reached, or the video is offline, restricted, or unavailable.",
    "INTERNAL_ERROR": "The media request could not be completed.",
}


class MediaError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(ERROR_MESSAGES[code])


class SafeParser(argparse.ArgumentParser):
    def error(self, message):
        raise MediaError("INVALID_ARGUMENTS")


def _stop_owned_group(process):
    """The child is a new session leader; its entire group belongs to this request."""
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        process.wait(timeout=0.2)
    except (subprocess.TimeoutExpired, OSError):
        pass
    # The leader may already have exited while a child ignores SIGTERM.
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    try:
        process.wait(timeout=1)
    except (subprocess.TimeoutExpired, OSError):
        pass


def run_command(command, *, timeout=35, max_output_bytes=MAX_METADATA_BYTES):
    """Collect one bounded metadata response; never log extractor stdout/stderr.

    A minimal child environment also works under IINA utils.exec, which supplies
    only LC_ALL. No HOME override, configuration, auth cache, or shell is needed.
    """
    process = None
    selector = None
    previous_handlers = {}
    cancelled = [False]

    def cancel(signum, frame):
        cancelled[0] = True

    if threading.current_thread() is threading.main_thread():
        for signum in (signal.SIGTERM, signal.SIGINT):
            previous_handlers[signum] = signal.getsignal(signum)
            signal.signal(signum, cancel)
    try:
        if cancelled[0]:
            raise MediaError("CANCELLED")
        try:
            process = subprocess.Popen(
                command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                shell=False, start_new_session=True, close_fds=True,
                env={"PATH": "/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin", "LC_ALL": "en_US.UTF-8"},
            )
        except OSError:
            raise MediaError("MISSING_DEPENDENCY") from None
        selector = selectors.DefaultSelector()
        selector.register(process.stdout, selectors.EVENT_READ, "stdout")
        selector.register(process.stderr, selectors.EVENT_READ, "stderr")
        deadline = time.monotonic() + timeout
        chunks, total, stderr_total = [], 0, 0
        while selector.get_map():
            if cancelled[0]:
                raise MediaError("CANCELLED")
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise MediaError("TIMEOUT")
            for key, _ in selector.select(min(remaining, 0.1)):
                data = os.read(key.fd, min(65536, max_output_bytes + 1))
                if not data:
                    selector.unregister(key.fileobj)
                    continue
                total += len(data)
                if key.data == "stderr":
                    stderr_total += len(data)
                if total > max_output_bytes or stderr_total > 65536:
                    raise MediaError("OUTPUT_LIMIT")
                if key.data == "stdout":
                    chunks.append(data)
        while True:
            if cancelled[0]:
                raise MediaError("CANCELLED")
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise MediaError("TIMEOUT")
            try:
                status = process.wait(timeout=min(remaining, 0.1))
                break
            except subprocess.TimeoutExpired:
                continue
        if cancelled[0]:
            raise MediaError("CANCELLED")
        if status != 0:
            raise MediaError("EXTRACTOR_FAILED")
        return b"".join(chunks)
    finally:
        if selector is not None:
            selector.close()
        if process is not None:
            _stop_owned_group(process)
            process.stdout.close()
            process.stderr.close()
        for signum, handler in previous_handlers.items():
            signal.signal(signum, handler)


def _seconds(value):
    if not value:
        return 0
    if re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", value):
        return min(MAX_START_SECONDS, float(value))
    match = re.fullmatch(r"(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?", value)
    if match:
        hours, minutes, seconds = (int(part or 0) for part in match.groups())
        return min(MAX_START_SECONDS, hours * 3600 + minutes * 60 + seconds)
    return 0


def _public_url(value):
    try:
        parsed = urlsplit(value)
        if parsed.scheme.lower() not in ("http", "https") or parsed.username is not None or parsed.password is not None:
            raise ValueError()
        if parsed.port not in (None, 80 if parsed.scheme.lower() == "http" else 443):
            raise ValueError()
        if not parsed.hostname or not re.fullmatch(r"[A-Za-z0-9.-]+", parsed.hostname):
            raise ValueError()
        return parsed
    except ValueError:
        raise MediaError("UNSUPPORTED_SOURCE") from None


def parse_source(value):
    """Normalize only public provider identities; tracking and transport URLs disappear."""
    if not isinstance(value, str):
        raise MediaError("UNSUPPORTED_SOURCE")
    value = value.strip()
    if not value or len(value) > 2048 or re.search(r"[\x00-\x20\x7f\\]", value):
        raise MediaError("UNSUPPORTED_SOURCE")
    if CHANNEL.fullmatch(value) and value.lower() not in RESERVED_TWITCH:
        identifier = value.lower()
        return {"kind": "twitch-live", "provider": "Twitch", "id": identifier,
                "url": "https://www.twitch.tv/" + identifier, "startSeconds": 0}
    if re.match(r"(?:(?:www|m)\.)?twitch\.tv/", value, re.I):
        value = "https://" + value
    parsed = _public_url(value)
    try:
        query = parse_qs(parsed.query, max_num_fields=32, keep_blank_values=True)
        fragment = parse_qs(parsed.fragment, max_num_fields=8, keep_blank_values=True)
    except ValueError:
        raise MediaError("UNSUPPORTED_SOURCE") from None
    for key in ("v", "t", "start"):
        if len(query.get(key, [])) > 1 or len(fragment.get(key, [])) > 1:
            raise MediaError("UNSUPPORTED_SOURCE")
    time_value = (query.get("t") or query.get("start") or fragment.get("t") or fragment.get("start") or [""])[0]
    path = parsed.path.rstrip("/")
    host = parsed.hostname.lower()
    if host in ("twitch.tv", "www.twitch.tv", "m.twitch.tv"):
        vod = re.fullmatch(r"/videos/([0-9]{1,20})", path)
        if vod:
            identifier = vod.group(1)
            return {"kind": "twitch-vod", "provider": "Twitch", "id": identifier,
                    "url": "https://www.twitch.tv/videos/" + identifier, "startSeconds": _seconds(time_value)}
        identifier = path[1:] if path.startswith("/") else ""
        if CHANNEL.fullmatch(identifier) and identifier.lower() not in RESERVED_TWITCH:
            identifier = identifier.lower()
            return {"kind": "twitch-live", "provider": "Twitch", "id": identifier,
                    "url": "https://www.twitch.tv/" + identifier, "startSeconds": 0}
    youtube_hosts = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"}
    identifier = ""
    if host in {"youtu.be", "www.youtu.be", "m.youtu.be", "music.youtu.be"}:
        identifier = path[1:]
    elif host in youtube_hosts:
        if path == "/watch":
            identifier = (query.get("v") or [""])[0]
        else:
            match = re.fullmatch(r"/(?:live|shorts|embed)/([A-Za-z0-9_-]{11})", path)
            if match:
                identifier = match.group(1)
    if VIDEO_ID.fullmatch(identifier):
        return {"kind": "youtube", "provider": "YouTube", "id": identifier,
                "url": "https://www.youtube.com/watch?v=" + identifier, "startSeconds": _seconds(time_value)}
    raise MediaError("UNSUPPORTED_SOURCE")


def _media_url(value, provider):
    if not isinstance(value, str) or not value or len(value) > MAX_URL_BYTES or re.search(r"[\x00-\x20\x7f\\]", value):
        raise MediaError("UNSAFE_MEDIA_URL")
    try:
        parsed = urlsplit(value)
        host = parsed.hostname or ""
        suffixes = ("ttvnw.net", "twitch.tv", "twitchcdn.net") if provider == "Twitch" else ("googlevideo.com",)
        allowed = any(host == suffix or host.endswith("." + suffix) for suffix in suffixes)
        if provider == "Twitch" and host in TWITCH_VOD_DISTRIBUTIONS:
            allowed = True
        if (parsed.scheme != "https" or parsed.username is not None or parsed.password is not None or
                parsed.port not in (None, 443) or parsed.fragment or not re.fullmatch(r"[a-zA-Z0-9.-]+", host) or not allowed):
            raise ValueError()
    except ValueError:
        raise MediaError("UNSAFE_MEDIA_URL") from None
    return value


def _headers(provider, *sources):
    """Do not forward cookies, authorization, arbitrary headers, or header injection."""
    allowed = {"user-agent": "User-Agent", "accept": "Accept", "accept-language": "Accept-Language",
               "referer": "Referer", "origin": "Origin"}
    result = {}
    for headers in sources:
        if headers is None:
            continue
        if not isinstance(headers, dict) or len(headers) > 64:
            raise MediaError("INVALID_METADATA")
        for key, value in headers.items():
            name = allowed.get(str(key).lower())
            if name is None:
                continue
            if not isinstance(value, str) or len(value) > 1024 or re.search(r"[\x00-\x1f\x7f]", value):
                raise MediaError("INVALID_METADATA")
            if name in ("Referer", "Origin"):
                try:
                    parsed = _public_url(value)
                except MediaError:
                    raise MediaError("INVALID_METADATA") from None
                hosts = {"twitch.tv", "www.twitch.tv", "player.twitch.tv"} if provider == "Twitch" else {"youtube.com", "www.youtube.com"}
                if parsed.scheme != "https" or parsed.hostname not in hosts or parsed.query or parsed.fragment:
                    raise MediaError("INVALID_METADATA")
            result[name] = value
    return result


def _number(value, default=0):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) else default


def _title(value, fallback):
    if not isinstance(value, str):
        return fallback
    value = re.sub(r"https?://\S+", "", value)
    value = re.sub(r"[\x00-\x1f\x7f]", " ", value).strip()
    return value[:240] or fallback


def _choose(options, quality):
    if not options:
        raise MediaError("NO_PLAYABLE_FORMAT")
    if quality != "auto720":
        if quality not in options:
            raise MediaError("QUALITY_UNAVAILABLE")
        return options[quality]
    video = [item for item in options.values() if item["height"] > 0]
    if not video:
        raise MediaError("NO_PLAYABLE_FORMAT")
    preferred = [item for item in video if item["height"] <= 720]
    if not preferred:
        # Do not silently select the highest resolution if a source has no transcodes.
        minimum = min(item["height"] for item in video)
        preferred = [item for item in video if item["height"] == minimum]
    return max(preferred, key=lambda item: (item["h264"], item["height"], item["fps"], item["has_audio"], item["direct"]))


def _public_formats(options):
    ordered = sorted(options.values(), key=lambda item: (item["height"], item["fps"], item["h264"]), reverse=True)
    return [dict(AUTO)] + [{"id": item["id"], "label": item["label"]} for item in ordered]


def _twitch(source, metadata, quality):
    if metadata.get("plugin") != "twitch" or not isinstance(metadata.get("streams"), dict):
        raise MediaError("INVALID_METADATA")
    streams = metadata["streams"]
    if len(streams) > MAX_FORMATS:
        raise MediaError("OUTPUT_LIMIT")
    options = {}
    for name, stream in streams.items():
        match = TWITCH_QUALITY.fullmatch(name)
        if not match and name != "audio_only":
            continue
        if not isinstance(stream, dict) or stream.get("type") != "hls":
            continue
        height = int(match.group(1)) if match else 0
        fps = int(match.group(2) or 30) if match else 0
        options[name] = {"id": name, "label": name if match else "Audio only", "height": height, "fps": fps,
                         "h264": True, "has_audio": True, "direct": False, "raw": stream}
    selected = _choose(options, quality)
    stream = selected["raw"]
    details = metadata.get("metadata") if isinstance(metadata.get("metadata"), dict) else {}
    return {"ok": True, "source": source, "title": _title(details.get("title"), source["id"] + " — Twitch"),
            "live": source["kind"] == "twitch-live", "duration": None, "quality": selected["id"],
            "formats": _public_formats(options), "mediaURL": _media_url(stream.get("url"), "Twitch"),
            "headers": _headers("Twitch", stream.get("headers"))}


def _youtube(source, metadata, quality):
    if (metadata.get("id") != source["id"] or metadata.get("_type") not in (None, "video") or
            "entries" in metadata or metadata.get("extractor_key", "Youtube").lower() != "youtube"):
        raise MediaError("INVALID_METADATA")
    if metadata.get("_has_drm") or metadata.get("has_drm"):
        raise MediaError("DRM_UNSUPPORTED")
    if metadata.get("availability") in {"private", "premium_only", "subscriber_only", "needs_auth"}:
        raise MediaError("AUTH_REQUIRED")
    if metadata.get("live_status") == "is_upcoming":
        raise MediaError("UNAVAILABLE")
    raw_formats = metadata.get("formats")
    if not isinstance(raw_formats, list):
        raise MediaError("INVALID_METADATA")
    if len(raw_formats) > MAX_FORMATS:
        raise MediaError("OUTPUT_LIMIT")
    options, audio = {}, []
    for raw in raw_formats:
        if not isinstance(raw, dict) or not isinstance(raw.get("format_id"), str) or not FORMAT_ID.fullmatch(raw["format_id"]):
            continue
        if raw.get("has_drm") or raw.get("protocol") not in ("https", "m3u8", "m3u8_native"):
            continue
        video_codec = str(raw.get("vcodec") or "").lower()
        audio_codec = str(raw.get("acodec") or "").lower()
        if video_codec == "none":
            if audio_codec != "none" and (audio_codec or raw.get("audio_ext") not in (None, "none")):
                audio.append(raw)
            continue
        height = _number(raw.get("height"))
        if not 0 < height <= 16384 or not video_codec:
            continue
        fps = _number(raw.get("fps"))
        h264 = video_codec.startswith(("avc1", "avc3", "h264"))
        codec_label = "H.264" if h264 else "AV1" if video_codec.startswith(("av01", "av1")) else "VP9" if video_codec.startswith(("vp9", "vp09")) else "HEVC" if video_codec.startswith(("hev1", "hvc1", "hevc")) else "Video"
        label = str(int(height)) + "p" + (str(round(fps)) if fps > 30 else "") + " · " + codec_label
        options[raw["format_id"]] = {"id": raw["format_id"], "label": label, "height": height, "fps": fps,
                                    "h264": h264, "has_audio": audio_codec not in ("", "none"),
                                    "direct": raw.get("protocol") == "https", "raw": raw}
    selected = _choose(options, quality)
    raw = selected["raw"]
    live = metadata.get("is_live") is True or metadata.get("live_status") == "is_live"
    duration = _number(metadata.get("duration"), None)
    result = {"ok": True, "source": source, "title": _title(metadata.get("title"), source["id"] + " — YouTube"),
              "live": live, "duration": duration if not live and duration is not None and duration >= 0 else None,
              "quality": selected["id"], "formats": _public_formats(options),
              "mediaURL": _media_url(raw.get("url"), "YouTube")}
    audio_headers = None
    if not selected["has_audio"]:
        if not audio:
            raise MediaError("AUDIO_UNAVAILABLE")
        # Live HLS may omit bitrate/codec while rating its audio variants numerically.
        # Use those ratings after language, AAC and bitrate; display notes are not a contract.
        preferred_audio = max(audio, key=lambda item: (
            _number(item.get("language_preference"), -1), str(item.get("acodec") or "").startswith(("mp4a", "aac")),
            _number(item.get("abr")), _number(item.get("quality"), -1), _number(item.get("source_preference"), -1),
            _number(item.get("asr")), item.get("protocol") == "https"))
        result["audioURL"] = _media_url(preferred_audio.get("url"), "YouTube")
        audio_headers = preferred_audio.get("http_headers")
    result["headers"] = _headers("YouTube", metadata.get("http_headers"), audio_headers, raw.get("http_headers"))
    return result


def resolve(url, quality="auto720", *, runner=None):
    source = parse_source(url)
    if not isinstance(quality, str) or not FORMAT_ID.fullmatch(quality):
        raise MediaError("INVALID_QUALITY")
    if source["provider"] == "Twitch":
        command = [STREAMLINK, "--no-config", "--no-plugin-cache", "--no-plugin-sideloading", "--http-ignore-env",
                   "--webbrowser", "false", "--loglevel", "none",
                   "--http-timeout", "12", "--json", source["url"]]
    else:
        command = [YTDLP, "--ignore-config", "--no-plugin-dirs", "--no-cache-dir", "--no-playlist", "--simulate",
                   "--dump-single-json", "--no-warnings", "--no-progress", "--no-check-formats", "--socket-timeout", "12",
                   "--retries", "1", "--extractor-retries", "1", "--no-remote-components",
                   "--js-runtimes", "node:/opt/homebrew/bin/node", source["url"]]
    payload = (runner or run_command)(command)
    if not isinstance(payload, (bytes, str)) or len(payload) > MAX_METADATA_BYTES:
        raise MediaError("OUTPUT_LIMIT")
    try:
        metadata = json.loads(payload)
    except (ValueError, UnicodeError, RecursionError):
        raise MediaError("INVALID_METADATA") from None
    if not isinstance(metadata, dict):
        raise MediaError("INVALID_METADATA")
    if "error" in metadata:
        raise MediaError("UNAVAILABLE")
    result = _twitch(source, metadata, quality) if source["provider"] == "Twitch" else _youtube(source, metadata, quality)
    if len(json.dumps(result, ensure_ascii=False).encode("utf-8")) > MAX_RESPONSE_BYTES:
        raise MediaError("OUTPUT_LIMIT")
    return result


def main(argv=None):
    try:
        parser = SafeParser(add_help=False, allow_abbrev=False)
        parser.add_argument("command", choices=["resolve"])
        parser.add_argument("--url", required=True)
        parser.add_argument("--quality", default="auto720")
        args = parser.parse_args(argv)
        result = resolve(args.url, args.quality)
    except MediaError as error:
        result = {"ok": False, "error": {"code": error.code, "message": str(error)}}
    except KeyboardInterrupt:
        result = {"ok": False, "error": {"code": "CANCELLED", "message": ERROR_MESSAGES["CANCELLED"]}}
    except Exception:
        # Do not expose exceptions: their arguments can contain signed URLs.
        result = {"ok": False, "error": {"code": "INTERNAL_ERROR", "message": ERROR_MESSAGES["INTERNAL_ERROR"]}}
    try:
        print(json.dumps(result, ensure_ascii=True, allow_nan=False, separators=(",", ":")))
    except (BrokenPipeError, OSError):
        return 1
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
