"""Media resolver contract tests; fake extractors never contact a network."""

import json
import importlib.util
import contextlib
import copy
import io
import os
import pathlib
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import ytdlp_double  # tests/ytdlp_double.py, shared with the acquire and runner tests


HELPER = pathlib.Path(__file__).resolve().parents[1] / "helpers" / "media.py"
SPEC = importlib.util.spec_from_file_location("candidate_media", HELPER)
media = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(media)


def twitch_metadata():
    # Streamlink 8.6.3 --json shape. URLs are deliberately fake transport fixtures.
    def stream(name):
        return {"type": "hls", "url": "https://use12.playlist.ttvnw.net/" + name + ".m3u8?sig=private-fixture",
                "master": "https://usher.ttvnw.net/api/channel/hls/hutchmf.m3u8?token=do-not-copy",
                "headers": {"User-Agent": "Fixture/1.0", "referer": "https://www.twitch.tv/",
                            "origin": "https://www.twitch.tv", "Cookie": "never-export-this"}}
    return {"plugin": "twitch", "metadata": {"id": "321247574496", "author": "HutchMF", "title": "A live stream"},
            "streams": {key: stream(key) for key in ["audio_only", "360p30", "720p60", "1080p60", "best", "worst"]}}


def youtube_metadata():
    # Includes muxed, video-only, audio-only, AV1, and storyboard entries.
    def fmt(identifier, height, video, audio, **extra):
        return dict({"format_id": identifier, "url": "https://rr4---sn.example.googlevideo.com/videoplayback?itag=" + identifier + "&sig=private-fixture",
                     "height": height, "fps": 30, "vcodec": video, "acodec": audio,
                     "protocol": "https", "ext": "mp4", "has_drm": False}, **extra)
    return {"id": "jNQXAC9IVRw", "extractor_key": "Youtube", "extractor": "youtube", "_type": "video",
            "title": "Me at the zoo", "duration": 19, "live_status": "not_live", "is_live": False,
            "description": "Never export metadata wholesale: https://invalid.example/?token=do-not-copy",
            "http_headers": {"User-Agent": "Fixture/1.0", "Cookie": "never-export-this"},
            "formats": [fmt("18", 360, "avc1.42001E", "mp4a.40.2"),
                        fmt("136", 720, "avc1.4d401f", "none"),
                        fmt("137", 1080, "avc1.640028", "none"),
                        fmt("399", 1080, "av01.0.08M.08", "none"),
                        fmt("140", None, "none", "mp4a.40.2", abr=128, language_preference=0),
                        fmt("251", None, "none", "opus", abr=160, language_preference=0),
                        {"format_id": "sb0", "url": "https://i.ytimg.com/sb/example", "protocol": "mhtml", "vcodec": "none", "acodec": "none"}]}


def youtube_live_metadata():
    # Sky News' public HLS schema observed on 2026-11-08; transport URLs are fake.
    fixture = youtube_metadata()
    video = dict(fixture["formats"][1], format_id="311", fps=60, protocol="m3u8_native",
                 url="https://manifest.googlevideo.com/video/311?sig=private-fixture")
    fixture.update(id="umLWFz4izTM", is_live=True, live_status="is_live", duration=None,
                   formats=[video] + [
                       {"format_id": identifier, "vcodec": "none", "acodec": None,
                        "audio_ext": "mp4", "protocol": "m3u8_native", "abr": None, "tbr": None,
                        "language_preference": None, "quality": -1, "source_preference": preference,
                        "format_note": note,
                        "url": "https://manifest.googlevideo.com/audio/" + identifier + "?sig=private-fixture"}
                       for identifier, preference, note in [("233", 0, "Default, low"), ("234", 1, "Default, high")]
                   ])
    return fixture


class SourceTests(unittest.TestCase):
    def test_canonical_source_identity_and_start_offsets(self):
        cases = [
            ("HutchMF", {"kind": "twitch-live", "provider": "Twitch", "id": "hutchmf", "url": "https://www.twitch.tv/hutchmf", "startSeconds": 0}),
            ("https://m.twitch.tv/videos/123456?t=1h2m3s", {"kind": "twitch-vod", "provider": "Twitch", "id": "123456", "url": "https://www.twitch.tv/videos/123456", "startSeconds": 3723}),
            ("https://youtu.be/jNQXAC9IVRw?t=12&si=tracking", {"kind": "youtube", "provider": "YouTube", "id": "jNQXAC9IVRw", "url": "https://www.youtube.com/watch?v=jNQXAC9IVRw", "startSeconds": 12}),
            ("https://www.youtube.com/live/jNQXAC9IVRw?start=1.5", {"kind": "youtube", "provider": "YouTube", "id": "jNQXAC9IVRw", "url": "https://www.youtube.com/watch?v=jNQXAC9IVRw", "startSeconds": 1.5}),
        ]
        for supplied, expected in cases:
            with self.subTest(supplied=supplied):
                self.assertEqual(media.parse_source(supplied), expected)

    def test_rejects_host_confusion_credentials_files_and_playlist_sources(self):
        invalid = ["https://youtube.com.evil.example/watch?v=jNQXAC9IVRw", "https://evil.example@www.twitch.tv/hutchmf",
                   "https://www.twitch.tv:8443/hutchmf", "file:///etc/passwd", "https://127.0.0.1/x", "https://[::1]/x",
                   "https://www.youtube.com/playlist?list=abc", "https://www.youtube.com/watch?v=jNQXAC9IVRw&v=aaaaaaaaaaa",
                   "https://www.twitch.tv/directory", "https://www.twitch.tv/videos/12/extra", "https://www.twitch.tv/%68utchmf",
                   "https://www.twitch.tv/abc\\@127.0.0.1", "https://www.youtube.com/watch?v=jNQXAC9IVRw\n--exec=bad"]
        for supplied in invalid:
            with self.subTest(supplied=supplied), self.assertRaises(media.MediaError) as error:
                media.parse_source(supplied)
            self.assertEqual(error.exception.code, "UNSUPPORTED_SOURCE")


def ytdlp_output(command, info):
    """yt-dlp's stdout for `command` (see ytdlp_double.py), refused like media.run_command if over the cap."""
    printed = ytdlp_double.output(command, info)
    if len(printed) > media.MAX_METADATA_BYTES:
        raise media.MediaError("OUTPUT_LIMIT")
    return printed


class MetadataTests(unittest.TestCase):
    def resolve_fixture(self, source, fixture, quality="auto720"):
        self.commands = []
        def runner(command, **kwargs):
            self.commands.append(command)
            if os.path.basename(command[0]) == "yt-dlp":
                return ytdlp_output(command, fixture)
            return json.dumps(fixture).encode("utf-8")
        return media.resolve(source, quality, runner=runner)

    def test_twitch_uses_actual_formats_with_720_default_and_metadata_only_command(self):
        result = self.resolve_fixture("https://www.twitch.tv/hutchmf", twitch_metadata())
        self.assertTrue(result["ok"])
        self.assertEqual(result["quality"], "720p60")
        self.assertEqual(result["source"]["provider"], "Twitch")
        self.assertEqual(result["title"], "A live stream")
        self.assertTrue(result["live"])
        self.assertIsNone(result["duration"])
        self.assertEqual({f["id"] for f in result["formats"]}, {"auto720", "audio_only", "360p30", "720p60", "1080p60"})
        self.assertTrue(result["mediaURL"].startswith("https://use12.playlist.ttvnw.net/720p60.m3u8"))
        cmd = self.commands[0]
        self.assertEqual(cmd[0], "/opt/homebrew/bin/streamlink")
        self.assertIn("--no-config", cmd)
        self.assertIn("--no-plugin-cache", cmd)
        self.assertIn("--no-plugin-sideloading", cmd)
        self.assertIn("--http-ignore-env", cmd)
        self.assertEqual(cmd[cmd.index("--webbrowser") + 1], "false")
        self.assertIn("--json", cmd)
        self.assertEqual(cmd[-1], "https://www.twitch.tv/hutchmf")

    def test_twitch_vod_and_high_quality_selection_remain_recording_specific(self):
        result = self.resolve_fixture("https://www.twitch.tv/videos/123456?t=10s", twitch_metadata(), "1080p60")
        self.assertEqual(result["source"]["kind"], "twitch-vod")
        self.assertEqual(result["source"]["id"], "123456")
        self.assertEqual(result["source"]["startSeconds"], 10)
        self.assertFalse(result["live"])
        self.assertEqual(result["quality"], "1080p60")

    def test_first_observed_twitch_vod_distribution_is_allowed(self):
        fixture = twitch_metadata()
        fixture["streams"]["720p60"]["url"] = "https://d2vi6trrdongqn.cloudfront.net/fixture/720p60/index-dvr.m3u8"
        try:
            result = self.resolve_fixture("https://www.twitch.tv/videos/2923174759", fixture)
        except media.MediaError as error:
            self.fail("the observed public Twitch VOD distribution was rejected: " + error.code)
        self.assertEqual(result["mediaURL"], "https://d2vi6trrdongqn.cloudfront.net/fixture/720p60/index-dvr.m3u8")
        self.assertFalse(result["live"])

    # Playlist paths below are modelled on one VOD observed on 2026-11-22 (Streamlink 8.6.3, VOD 2935383720):
    # /<hash>_<channel>_<broadcast id>_<timestamp>/<quality>/index-muted-<token>.m3u8 on d1m7jfoe9zdc1j.cloudfront.net.
    # The other Twitch tenant (d2vi6trrdongqn) and its index-dvr.m3u8 name are from the earlier test above.
    VOD_PLAYLIST = "/0123456789abcdef0123_hutchmf_2935383720_1700000000/720p60/index-muted-AB12CD34EF.m3u8"
    VOD_SOURCE = "https://www.twitch.tv/videos/2935383720"

    def resolve_vod_stream(self, url, source=VOD_SOURCE):
        fixture = twitch_metadata()
        fixture["streams"]["720p60"]["url"] = url
        return self.resolve_fixture(source, fixture)

    def test_twitch_vod_playlists_on_either_known_cloudfront_tenant_are_allowed(self):
        for host in ("d2vi6trrdongqn.cloudfront.net", "d1m7jfoe9zdc1j.cloudfront.net"):
            url = "https://" + host + self.VOD_PLAYLIST + "?sig=private-fixture"
            with self.subTest(host=host):
                self.assertEqual(self.resolve_vod_stream(url)["mediaURL"], url)

    def test_cloudfront_vod_rule_admits_only_vod_playlists_on_tenant_shaped_hosts(self):
        host = "d1m7jfoe9zdc1j.cloudfront.net"
        refused = [
            "https://arbitrary.cloudfront.net" + self.VOD_PLAYLIST,           # not a distribution-id host
            "https://x" + host + self.VOD_PLAYLIST,                             # one character too long
            "https://" + host + ".evil.example" + self.VOD_PLAYLIST,           # suffix trick
            "https://evil-" + host + self.VOD_PLAYLIST,                         # prefix trick
            "https://sub." + host + self.VOD_PLAYLIST,                          # subdomain of a tenant
            "https://d1m7jfoe9zdc1j.example.net" + self.VOD_PLAYLIST,          # tenant shape, not CloudFront
            "https://media.example" + self.VOD_PLAYLIST,                        # not CloudFront at all
            "https://" + host + "/payload.js",                                  # not an HLS playlist path
            "https://" + host + "/a/b/c/index-dvr.m3u8",                        # wrong depth
            "https://" + host + "/a/b/index.m3u8",                              # not index-<name>.m3u8
            "https://" + host + "/a/b/index-dvr.m3u8/extra",                    # playlist must be the last segment
            "http://" + host + self.VOD_PLAYLIST,
            "https://user:pass@" + host + self.VOD_PLAYLIST,
            "https://" + host + ":8443" + self.VOD_PLAYLIST,
            "https://" + host + self.VOD_PLAYLIST + "#fragment",
        ]
        for url in refused:
            with self.subTest(url=url), self.assertRaises(media.MediaError) as error:
                self.resolve_vod_stream(url)
            self.assertEqual(error.exception.code, "UNSAFE_MEDIA_URL")

    def test_cloudfront_vod_path_refuses_dot_segments_and_their_encoded_forms(self):
        # #55: the path rule let "." and ".." through as segments, so /../ walked out of the playlist directory.
        host = "d1m7jfoe9zdc1j.cloudfront.net"
        playlist = "index-muted-AB12CD34EF.m3u8"
        refused = [
            "/../720p60/" + playlist,
            "/./720p60/" + playlist,
            "/0123456789abcdef0123_hutchmf_2935383720_1700000000/../" + playlist,
            "/0123456789abcdef0123_hutchmf_2935383720_1700000000/./" + playlist,
            "/../../" + playlist,
            "/%2e%2e/720p60/" + playlist,                 # percent-encoded ".."
            "/%2E%2E/720p60/" + playlist,
            "/.%2e/720p60/" + playlist,                   # half encoded
            "/%2e/720p60/" + playlist,                    # encoded "."
            "/0123456789abcdef0123_hutchmf_2935383720_1700000000/%2e%2e/" + playlist,
            "/%252e%252e/720p60/" + playlist,             # double encoded
            "/..%2f720p60/" + playlist,                   # encoded slash after a dot pair
        ]
        for path in refused:
            url = "https://" + host + path
            with self.subTest(path=path):
                try:
                    self.resolve_vod_stream(url)
                    code = "accepted"
                except media.MediaError as error:
                    code = error.code
                self.assertEqual(code, "UNSAFE_MEDIA_URL")

    def test_cloudfront_vod_path_still_admits_dots_inside_a_segment(self):
        # Only the whole-segment forms "." and ".." are refused; a dot inside a name is fine.
        host = "d1m7jfoe9zdc1j.cloudfront.net"
        url = "https://" + host + "/a.b_hutchmf.2935383720/720p60.v2/index-muted-AB12CD34.m3u8"
        self.assertEqual(self.resolve_vod_stream(url)["mediaURL"], url)

    def test_cloudfront_is_never_allowed_for_live_channels_or_for_youtube(self):
        url = "https://d1m7jfoe9zdc1j.cloudfront.net" + self.VOD_PLAYLIST
        with self.assertRaises(media.MediaError) as error:
            self.resolve_vod_stream(url, source="https://www.twitch.tv/hutchmf")
        self.assertEqual(error.exception.code, "UNSAFE_MEDIA_URL")
        fixture = youtube_metadata()
        for item in fixture["formats"]:
            if item["format_id"] in ("136", "18"):
                item["url"] = url
        with self.assertRaises(media.MediaError) as error:
            self.resolve_fixture("https://youtu.be/jNQXAC9IVRw", fixture)
        self.assertEqual(error.exception.code, "UNSAFE_MEDIA_URL")

    def test_auto_prefers_h264_and_uses_lowest_resolution_when_no_720_format_exists(self):
        fixture = youtube_metadata()
        fixture["formats"] = [f for f in fixture["formats"] if f.get("format_id") not in ("136", "137")]
        fixture["formats"][1]["height"] = 720
        result = self.resolve_fixture("https://youtu.be/jNQXAC9IVRw", fixture)
        self.assertEqual(result["quality"], "18", "360p H.264 is preferred to 720p AV1 in Auto")
        fixture = twitch_metadata()
        fixture["streams"] = {"1080p60": fixture["streams"]["1080p60"], "1440p60": fixture["streams"]["1080p60"]}
        result = self.resolve_fixture("https://www.twitch.tv/hutchmf", fixture)
        self.assertEqual(result["quality"], "1080p60", "Auto must choose lowest, not highest, available fallback")

    def test_youtube_selects_h264_and_adds_compatible_audio_from_actual_formats(self):
        result = self.resolve_fixture("https://youtu.be/jNQXAC9IVRw", youtube_metadata())
        self.assertEqual(result["quality"], "136")
        self.assertIn("itag=136", result["mediaURL"])
        self.assertIn("itag=140", result["audioURL"])
        self.assertEqual(result["duration"], 19)
        self.assertFalse(result["live"])
        self.assertEqual({f["id"] for f in result["formats"]}, {"auto720", "18", "136", "137", "399"})
        cmd = self.commands[0]
        self.assertEqual(cmd[0], "/opt/homebrew/bin/yt-dlp")
        for flag in ["--ignore-config", "--no-plugin-dirs", "--no-cache-dir", "--simulate", "--no-playlist", "--no-remote-components"]:
            self.assertIn(flag, cmd)
        self.assertNotIn("--dump-single-json", cmd, "the full dump can exceed the size limit")
        self.assertNotIn("--cookies", cmd)
        self.assertNotIn("--cookies-from-browser", cmd)

    def test_live_hls_audio_uses_provider_rating_when_bitrate_is_absent(self):
        result = self.resolve_fixture("https://www.youtube.com/watch?v=umLWFz4izTM", youtube_live_metadata())
        self.assertIn("/audio/234?", result["audioURL"])
        self.assertEqual(result["quality"], "311")
        self.assertIn("/video/311?", result["mediaURL"])
        self.assertTrue(result["live"])

    def test_audio_provider_rating_preserves_language_aac_and_bitrate_priorities(self):
        for lower, higher in [
                ({"language_preference": 1}, {"language_preference": 0}),
                ({"acodec": "mp4a.40.2"}, {"acodec": "opus"}),
                ({"abr": 160}, {"abr": 128})]:
            with self.subTest(preferred=lower):
                fixture = youtube_live_metadata()
                fixture["formats"][1].update(lower)
                fixture["formats"][2].update(higher)
                result = self.resolve_fixture("https://www.youtube.com/watch?v=umLWFz4izTM", fixture)
                self.assertIn("/audio/233?", result["audioURL"])

    def test_audio_numeric_quality_precedes_source_rating_and_display_notes(self):
        fixture = youtube_live_metadata()
        fixture["formats"][1]["quality"] = 2
        fixture["formats"][2]["quality"] = 1
        result = self.resolve_fixture("https://www.youtube.com/watch?v=umLWFz4izTM", fixture)
        self.assertIn("/audio/233?", result["audioURL"])
        fixture["formats"][1]["quality"] = 1
        fixture["formats"][1]["format_note"] = "Default, high"
        fixture["formats"][2]["format_note"] = "Default, low"
        result = self.resolve_fixture("https://www.youtube.com/watch?v=umLWFz4izTM", fixture)
        self.assertIn("/audio/234?", result["audioURL"])

    def test_muxed_youtube_does_not_add_a_duplicate_audio_track(self):
        result = self.resolve_fixture("https://youtu.be/jNQXAC9IVRw", youtube_metadata(), "18")
        self.assertEqual(result["quality"], "18")
        self.assertNotIn("audioURL", result)

    def test_exact_high_quality_and_live_metadata_are_not_silently_capped(self):
        fixture = youtube_metadata()
        fixture.update(is_live=True, live_status="is_live", duration=None)
        result = self.resolve_fixture("https://www.youtube.com/watch?v=jNQXAC9IVRw", fixture, "399")
        self.assertEqual(result["quality"], "399")
        self.assertTrue(result["live"])
        self.assertIsNone(result["duration"])
        self.assertIn("itag=399", result["mediaURL"])

    def test_unavailable_quality_and_hostile_quality_never_become_extractor_arguments(self):
        for value, code in [("999", "QUALITY_UNAVAILABLE"), ("--exec=touch", "INVALID_QUALITY"),
                            ("bestvideo+bestaudio", "INVALID_QUALITY"), ("136\n--cookies", "INVALID_QUALITY")]:
            with self.subTest(value=value), self.assertRaises(media.MediaError) as error:
                self.resolve_fixture("https://youtu.be/jNQXAC9IVRw", youtube_metadata(), value)
            self.assertEqual(error.exception.code, code)
            if code == "INVALID_QUALITY":
                self.assertEqual(self.commands, [], "invalid quality must fail before extractor startup")

    def test_private_urls_and_credentials_cannot_escape_public_metadata(self):
        result = self.resolve_fixture("https://www.twitch.tv/hutchmf", twitch_metadata())
        self.assertEqual(result["headers"], {"User-Agent": "Fixture/1.0", "Referer": "https://www.twitch.tv/", "Origin": "https://www.twitch.tv"})
        public = dict(result)
        public.pop("mediaURL")
        serialized = json.dumps(public)
        for secret in ["private-fixture", "do-not-copy", "never-export-this"]:
            self.assertNotIn(secret, serialized)

    def test_selected_transport_must_be_https_on_provider_cdn(self):
        for unsafe in ["http://use12.playlist.ttvnw.net/a.m3u8", "https://127.0.0.1/a", "https://ttvnw.net.evil.example/a",
                       "https://user:pass@use12.playlist.ttvnw.net/a", "https://use12.playlist.ttvnw.net:444/a", "https://arbitrary.cloudfront.net/a"]:
            fixture = twitch_metadata()
            fixture["streams"]["720p60"]["url"] = unsafe
            with self.subTest(unsafe=unsafe), self.assertRaises(media.MediaError) as error:
                self.resolve_fixture("https://www.twitch.tv/hutchmf", fixture, "720p60")
            self.assertEqual(error.exception.code, "UNSAFE_MEDIA_URL")

    def test_audio_transport_and_header_newlines_are_validated(self):
        fixture = youtube_metadata()
        fixture["formats"][4]["url"] = "https://127.0.0.1/audio"
        fixture["formats"][5]["url"] = "https://127.0.0.1/audio2"
        with self.assertRaises(media.MediaError):
            self.resolve_fixture("https://youtu.be/jNQXAC9IVRw", fixture)
        fixture = twitch_metadata()
        fixture["streams"]["720p60"]["headers"]["User-Agent"] = "normal\r\nCookie: private"
        with self.assertRaises(media.MediaError) as error:
            self.resolve_fixture("https://www.twitch.tv/hutchmf", fixture)
        self.assertEqual(error.exception.code, "INVALID_METADATA")

    def test_playlists_drm_and_mismatched_video_identity_are_rejected(self):
        for alteration in [{"_type": "playlist", "entries": []}, {"id": "aaaaaaaaaaa"}, {"_has_drm": True}]:
            fixture = youtube_metadata()
            fixture.update(alteration)
            with self.subTest(alteration=alteration), self.assertRaises(media.MediaError):
                self.resolve_fixture("https://youtu.be/jNQXAC9IVRw", fixture)

    def test_missing_and_malformed_metadata_returns_sanitized_errors(self):
        for payload in [b"not-json https://private.example/?token=secret", b"[]", b'{"error":"https://private.example/?token=secret"}']:
            with self.subTest(payload=payload), self.assertRaises(media.MediaError) as error:
                media.resolve("https://www.twitch.tv/hutchmf", runner=lambda *args, **kwargs: payload)
            self.assertNotIn("secret", str(error.exception))
            self.assertNotIn("private.example", str(error.exception))


class LargeMetadataTests(unittest.TestCase):
    """YouTube videos whose full yt-dlp dump exceeds 8 MiB must still resolve (#46)."""
    URL = "https://youtu.be/jNQXAC9IVRw"

    def large_fixture(self):
        fixture = youtube_metadata()
        # Spike #37: automatic_captions was 11.15 MB of an 11.7 MB dump. Two language entries stand in for it.
        caption = {"ext": "vtt", "url": "https://www.youtube.com/api/timedtext?" + "x" * 4096, "name": "n" * 1024}
        fixture["automatic_captions"] = {"en": [dict(caption) for _ in range(1200)],
                                         "fr": [dict(caption) for _ in range(1200)]}
        fixture["description"] = "d" * 100000
        fixture["storyboards"] = [{"fragments": [{"url": "https://i.ytimg.com/sb/" + "y" * 200}] * 500}]
        return fixture

    def run_resolve(self, fixture, quality="auto720"):
        commands = []

        def runner(command, **kwargs):
            commands.append(command)
            return ytdlp_output(command, fixture)
        return media.resolve(self.URL, quality, runner=runner), commands

    def test_the_fixture_is_over_the_limit_when_dumped_whole(self):
        dump = json.dumps(self.large_fixture()).encode("utf-8")
        self.assertGreater(len(dump), media.MAX_METADATA_BYTES, "precondition: this is the failing case")
        with self.assertRaises(media.MediaError) as error:
            ytdlp_output(["yt-dlp", "--dump-single-json"], self.large_fixture())
        self.assertEqual(error.exception.code, "OUTPUT_LIMIT", "the old command fails on it")

    def test_large_metadata_resolves_with_the_same_result_as_a_small_dump(self):
        large, commands = self.run_resolve(self.large_fixture())
        small, _ = self.run_resolve(youtube_metadata())
        self.assertEqual(large, small)
        self.assertEqual(large["quality"], "136")
        self.assertIn("itag=140", large["audioURL"])
        self.assertEqual(large["headers"], {"User-Agent": "Fixture/1.0"}, "top-level http_headers still reach the result")
        template_text = " ".join(arg for arg in commands[0] if arg.startswith("%"))
        for unread in ("automatic_captions", "subtitles", "description", "storyboards"):
            self.assertNotIn(unread, template_text)

    def test_trimmed_output_matches_the_full_dump_for_every_field_the_resolver_reads(self):
        # For each field: set up a fixture where the field decides the outcome, then check (a) the outcome
        # differs when the field is withheld, so the case proves something, and (b) the trimmed pipeline
        # reproduces the outcome the full dump gives.
        source = media.parse_source(self.URL)

        def outcome(fixture, trimmed):
            try:
                if trimmed:
                    return self.run_resolve(copy.deepcopy(fixture))[0]
                if "error" in fixture:  # resolve() checks this before _youtube, on the full dump (c3d6fd9)
                    return "UNAVAILABLE"
                return media._youtube(source, copy.deepcopy(fixture), "auto720")
            except media.MediaError as error:
                return error.code

        def tie_audio(f):
            # Two non-AAC audio formats that differ only in the field under test (251 gets it).
            for item in f["formats"]:
                if item["format_id"] in ("140", "251"):
                    item.update(acodec="opus", abr=160, language_preference=0)
            return f["formats"][5]

        def only_audio_ext(f):
            f["formats"] = [x for x in f["formats"] if x["format_id"] != "251"]
            f["formats"][4].update(acodec="", audio_ext="m4a")

        def on_136(**change):
            return lambda f: f["formats"][1].update(change)

        def on_251(**change):
            return lambda f: tie_audio(f).update(change)

        top = {
            "id": lambda f: None, "title": lambda f: f.update(title="Other title"), "duration": lambda f: f.update(duration=123),
            "is_live": lambda f: f.update(is_live=True), "live_status": lambda f: f.update(live_status="is_upcoming"),
            "availability": lambda f: f.update(availability="private"), "has_drm": lambda f: f.update(has_drm=True),
            "_has_drm": lambda f: f.update(_has_drm=True), "_type": lambda f: f.update(_type="playlist"),
            "extractor_key": lambda f: f.update(extractor_key="Vimeo"),
            "http_headers": lambda f: f.update(http_headers={"User-Agent": "Other/2"}),
            "error": lambda f: f.update(error="Video unavailable"),
            # #73: watch history needs the channel's id and name.
            "channel_id": lambda f: f.update(channel_id="UCotherChannel"),
            "channel": lambda f: f.update(channel="Other channel"),
        }
        # `entries` on a video-typed info (a playlist itself is expanded before printing, see ytdlp_double);
        # `playlist_id` is how a video derived from a playlist, such as a one-entry playlist's child, shows.
        flags = {"entries": lambda f: f.update(entries=[{"id": "jNQXAC9IVRw"}]),
                 "playlist_id": lambda f: f.update(playlist_id="PLfixture")}
        formats = {
            "format_id": lambda f: None, "url": lambda f: None, "protocol": lambda f: None, "vcodec": lambda f: None,
            "height": lambda f: None, "acodec": on_136(acodec="mp4a.40.2"), "audio_ext": only_audio_ext,
            "fps": on_136(fps=60), "has_drm": on_136(has_drm=True), "http_headers": on_136(http_headers={"User-Agent": "Fmt/3"}),
            "abr": lambda f: tie_audio(f).update(abr=999), "language_preference": on_251(language_preference=5),
            "quality": on_251(quality=5), "source_preference": on_251(source_preference=5), "asr": on_251(asr=48000),
        }
        self.assertEqual(set(top), set(media.YOUTUBE_VIDEO_FIELDS))
        self.assertEqual(set(formats), set(media.YOUTUBE_FORMAT_FIELDS))
        self.assertEqual(set(flags), set(media.YOUTUBE_FLAG_FIELDS))
        for scope, cases in (("video", top), ("format", formats), ("flag", flags)):
            for field, setup in cases.items():
                fixture = youtube_metadata()
                setup(fixture)
                withheld = copy.deepcopy(fixture)
                if scope in ("video", "flag"):
                    withheld.pop(field, None)
                else:
                    for item in withheld["formats"]:
                        item.pop(field, None)
                with self.subTest(scope=scope, field=field):
                    expected = outcome(fixture, trimmed=False)
                    self.assertNotEqual(outcome(withheld, trimmed=False), expected, "the case must depend on the field")
                    self.assertEqual(outcome(fixture, trimmed=True), expected)

    def test_a_video_derived_from_a_one_entry_playlist_is_rejected(self):
        # #54 second re-review: with --no-playlist yt-dlp still expands a one-entry playlist and prints the
        # child, which has no `entries`; only its `playlist_id` says where it came from.
        child = youtube_metadata()
        playlist = {"_type": "playlist", "id": "PLfixture", "title": "p", "entries": [child]}
        printed = ytdlp_output(["yt-dlp"] + media.YOUTUBE_OUTPUT, playlist).decode().split("\n")
        self.assertEqual(printed[2:], ["0", "1"], "the double prints the child: no entries, a playlist_id")
        with self.assertRaises(media.MediaError) as error:
            media.resolve(self.URL, runner=lambda command, **kwargs: ytdlp_output(command, playlist))
        self.assertEqual(error.exception.code, "INVALID_METADATA")
        accepted = media.resolve(self.URL, runner=lambda command, **kwargs: ytdlp_output(command, child))
        self.assertEqual(accepted["quality"], "136", "the standalone control is accepted")

    def test_a_large_playlist_is_rejected_within_the_output_bound(self):
        # Each entry is printed as a block of its own (inferred, see ytdlp_double): the output stays small per
        # entry and the line count no longer matches, so it is rejected as unexpected output.
        playlist = {"_type": "playlist", "id": "PLfixture",
                    "entries": [dict(youtube_metadata(), description="d" * 2000) for _ in range(50)]}
        with self.assertRaises(media.MediaError) as error:
            media.resolve(self.URL, runner=lambda command, **kwargs: ytdlp_output(command, playlist))
        self.assertEqual(error.exception.code, "INVALID_METADATA")
        self.assertNotIn(b"dddd", ytdlp_double.output(["yt-dlp"] + media.YOUTUBE_OUTPUT, playlist))

    def test_a_video_info_with_entries_is_rejected_without_printing_them(self):
        # #54: the full dump rejected any info dict that had `entries`. The trimmed output must too, without
        # carrying the entries themselves (5000 of them would put them all back over the cap).
        fixture = youtube_metadata()
        fixture["entries"] = [{"id": "e%04d" % number, "title": "t" * 2000} for number in range(5000)]
        self.assertGreater(len(json.dumps(fixture)), media.MAX_METADATA_BYTES, "precondition: entries alone exceed the cap")
        with self.assertRaises(media.MediaError) as error:
            media.resolve(self.URL, runner=lambda command, **kwargs: ytdlp_output(command, fixture))
        self.assertEqual(error.exception.code, "INVALID_METADATA")
        printed = ytdlp_double.output(["yt-dlp"] + media.YOUTUBE_OUTPUT, fixture)
        self.assertLess(len(printed), 2000, "the entries are not in the output")
        self.assertNotIn(b"e0001", printed)

    def test_an_empty_entries_list_is_still_a_playlist(self):
        fixture = youtube_metadata()
        fixture["entries"] = []
        with self.assertRaises(media.MediaError) as error:
            media.resolve(self.URL, runner=lambda command, **kwargs: ytdlp_output(command, fixture))
        self.assertEqual(error.exception.code, "INVALID_METADATA")

    def test_an_error_field_is_unavailable(self):
        # #54: resolve() rejected `error` in the full dump with UNAVAILABLE; the trimmed output dropped the field.
        fixture = youtube_metadata()
        fixture["error"] = "Video unavailable"
        with self.assertRaises(media.MediaError) as error:
            media.resolve(self.URL, runner=lambda command, **kwargs: ytdlp_output(command, fixture))
        self.assertEqual(error.exception.code, "UNAVAILABLE")

    def test_unexpected_output_shapes_are_sanitized_metadata_errors(self):
        for payload in ["", "{}", '{"id":"jNQXAC9IVRw"}\n[]\n[]\n0', '["not","an","object"]\n[]\n0\n0',
                        "not-json https://private.example/?t=secret\n[]\n0\n0", '{"id":"jNQXAC9IVRw"}\nNA\n0\n0',
                        '{"id":"jNQXAC9IVRw"}\nNA', '{"id":"jNQXAC9IVRw"}\n[]\n0', '{"id":"jNQXAC9IVRw"}\n[]\n0\n0\n0',
                        '{"id":"jNQXAC9IVRw"}\n[]\n2\n0', '{"id":"jNQXAC9IVRw"}\n[]\n0\n2',
                        '{"id":"jNQXAC9IVRw"}\n[]\n0\nNA', '{"id":"jNQXAC9IVRw"}\n[]\nNA\n0']:
            with self.subTest(payload=payload[:40]), self.assertRaises(media.MediaError) as error:
                media.resolve(self.URL, runner=lambda *args, **kwargs: payload)
            self.assertEqual(error.exception.code, "INVALID_METADATA")
            self.assertNotIn("secret", str(error.exception))


def real_ytdlp():
    """A yt-dlp executable that runs, or None. STREAMS_TEST_YTDLP overrides; otherwise the one IINA ships, then PATH."""
    candidates = [os.environ.get("STREAMS_TEST_YTDLP"), "/Applications/IINA.app/Contents/MacOS/youtube-dl",
                  shutil.which("yt-dlp"), media.YTDLP]
    for candidate in candidates:  # not run at import: starting yt-dlp takes seconds
        if not candidate or not os.access(candidate, os.X_OK):
            continue
        try:
            version = subprocess.run([candidate, "--version"], capture_output=True, text=True, timeout=60)
        except (OSError, subprocess.SubprocessError):
            continue
        if version.returncode == 0 and version.stdout.strip():
            return candidate
    return None


class RealYtDlpTests(unittest.TestCase):
    """The helper's real command, run by a real yt-dlp over a local info file: no network, no double (#54).

    `--load-info-json` makes yt-dlp process an info as if it had just extracted it, so a playlist info goes
    through its own playlist expansion. `--no-clean-info-json` keeps `entries` (the default clean-up drops it).
    The proxy points at a closed local port, so an accidental request fails instead of leaving the machine.
    """
    URL = "https://youtu.be/jNQXAC9IVRw"

    @classmethod
    def setUpClass(cls):
        # One yt-dlp start takes several seconds, so each info is run once and the tests share the output.
        cls.ytdlp = real_ytdlp()
        if not cls.ytdlp:
            raise unittest.SkipTest("no runnable yt-dlp (set STREAMS_TEST_YTDLP to one)")
        cls.standalone, cls.playlist = cls.infos()
        cls.standalone_output = cls.real_output(cls.standalone)
        cls.playlist_output = cls.real_output(cls.playlist)

    @classmethod
    def real_output(cls, info):
        captured = []

        def capture(command, **kwargs):
            captured.append(command)
            return ytdlp_output(command, youtube_metadata())
        media.resolve(cls.URL, runner=capture)
        command = [cls.ytdlp] + captured[0][1:-1]  # the helper's own arguments, minus yt-dlp and the URL
        with tempfile.TemporaryDirectory() as scratch:
            path = os.path.join(scratch, "info.json")
            with open(path, "w") as handle:
                json.dump(info, handle)
            command += ["--proxy", "http://127.0.0.1:9", "--no-clean-info-json", "--load-info-json", path]
            run = subprocess.run(command, capture_output=True, timeout=120, cwd=scratch,
                                 env={"PATH": os.environ.get("PATH", ""), "HOME": scratch})
        assert run.returncode == 0, run.stderr.decode("utf-8", "replace")[-500:]
        return run.stdout

    @staticmethod
    def infos():
        child = youtube_metadata()
        child.pop("description")
        return child, {"_type": "playlist", "id": "PLfixture", "title": "p", "extractor_key": "YoutubeTab",
                       "extractor": "youtube:tab", "entries": [copy.deepcopy(child)]}

    def test_the_playlist_flag_is_1_for_a_one_entry_playlist_child_and_0_for_a_standalone_video(self):
        control = self.standalone_output.decode().strip().split("\n")
        child = self.playlist_output.decode().strip().split("\n")
        self.assertEqual(control[2:], ["0", "0"], "standalone: no entries, no playlist_id")
        self.assertEqual(child[2:], ["0", "1"], "child of a one-entry playlist: no entries, a playlist_id")

    def test_the_double_prints_what_yt_dlp_prints(self):
        command = ["yt-dlp"] + media.YOUTUBE_OUTPUT
        for name, info, printed in (("standalone", self.standalone, self.standalone_output),
                                    ("playlist", self.playlist, self.playlist_output)):
            with self.subTest(info=name):
                real = printed.decode().strip().split("\n")
                double = ytdlp_double.output(command, info).decode().strip().split("\n")
                self.assertEqual(real[2:], double[2:], "the flag lines")
                self.assertEqual(json.loads(real[0]).get("id"), json.loads(double[0]).get("id"))

    def test_the_helper_rejects_the_playlist_child_and_accepts_the_standalone_video(self):
        accepted = media.resolve(self.URL, runner=lambda command, **kwargs: self.standalone_output)
        self.assertEqual(accepted["quality"], "136")
        with self.assertRaises(media.MediaError) as error:
            media.resolve(self.URL, runner=lambda command, **kwargs: self.playlist_output)
        self.assertEqual(error.exception.code, "INVALID_METADATA")


class ProcessTests(unittest.TestCase):
    def test_process_executes_an_argument_array_in_a_minimal_environment(self):
        code = "import json,os;print(json.dumps(dict(os.environ)))"
        with mock.patch.dict(os.environ, {"PRIVATE_FIXTURE_TOKEN": "never-pass", "NODE_OPTIONS": "bad", "PYTHONPATH": "/not-trusted"}):
            output = media.run_command([sys.executable, "-c", code], timeout=2)
        environment = json.loads(output)
        self.assertIn("/opt/homebrew/bin", environment["PATH"])
        for key in ["PRIVATE_FIXTURE_TOKEN", "NODE_OPTIONS", "PYTHONPATH", "HOME"]:
            self.assertNotIn(key, environment)

    def test_argument_text_is_not_interpreted_as_shell_code(self):
        with tempfile.TemporaryDirectory() as directory:
            target = pathlib.Path(directory) / "must-not-exist"
            payload = "$(touch " + str(target) + ")"
            output = media.run_command([sys.executable, "-c", "import sys;print(sys.argv[1])", payload], timeout=2)
            self.assertEqual(output.decode().strip(), payload)
            self.assertFalse(target.exists())

    def test_extractor_failure_discards_stdout_and_stderr_without_logging(self):
        code = "import sys;print('https://bad.example/?token=secret');sys.stderr.write('private-cookie');sys.exit(7)"
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            with self.assertRaises(media.MediaError) as error:
                media.run_command([sys.executable, "-c", code], timeout=2)
        self.assertEqual(error.exception.code, "EXTRACTOR_FAILED")
        self.assertNotIn("secret", str(error.exception))
        self.assertNotIn("private-cookie", str(error.exception))
        self.assertEqual(stdout.getvalue(), "")
        self.assertEqual(stderr.getvalue(), "")

    def test_output_cap_stops_the_extractor_before_unbounded_buffering(self):
        code = "import sys,time;sys.stdout.write('x'*8192);sys.stdout.flush();time.sleep(10)"
        started = time.monotonic()
        with self.assertRaises(media.MediaError) as error:
            media.run_command([sys.executable, "-c", code], timeout=3, max_output_bytes=1024)
        self.assertEqual(error.exception.code, "OUTPUT_LIMIT")
        self.assertLess(time.monotonic() - started, 2)

    def test_timeout_kills_owned_descendants_that_ignore_term(self):
        with tempfile.TemporaryDirectory() as directory:
            pidfile = pathlib.Path(directory) / "child-pid"
            child = ("import os,pathlib,signal,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);"
                     "pathlib.Path(" + repr(str(pidfile)) + ").write_text(str(os.getpid()));"
                     "time.sleep(30)")
            parent = "import subprocess,sys,time;subprocess.Popen([sys.executable,'-c'," + repr(child) + "]);time.sleep(30)"
            try:
                with self.assertRaises(media.MediaError) as error:
                    media.run_command([sys.executable, "-c", parent], timeout=1.5)
                self.assertEqual(error.exception.code, "TIMEOUT")
                self.assertTrue(pidfile.exists(), "descendant must have started for this cleanup test")
                deadline = time.monotonic() + 0.75
                while True:
                    state = subprocess.run(["/bin/ps", "-p", pidfile.read_text(), "-o", "stat="], capture_output=True, text=True, timeout=2)
                    if not state.stdout.strip() or state.stdout.strip().startswith("Z") or time.monotonic() >= deadline:
                        break
                    time.sleep(0.02)
                self.assertTrue(not state.stdout.strip() or state.stdout.strip().startswith("Z"),
                                "a timed-out extractor left its descendant in state " + state.stdout.strip())
            finally:
                if pidfile.exists():
                    try:
                        os.kill(int(pidfile.read_text()), signal.SIGKILL)
                    except ProcessLookupError:
                        pass

    def test_parent_cancellation_terminates_its_extractor(self):
        with tempfile.TemporaryDirectory() as directory:
            ready = pathlib.Path(directory) / "started"
            survived = pathlib.Path(directory) / "survived"
            child = ("import pathlib,time;pathlib.Path(" + repr(str(ready)) + ").write_text('ready');"
                     "time.sleep(1);pathlib.Path(" + repr(str(survived)) + ").write_text('leaked');time.sleep(10)")
            wrapper = ("import importlib.util,json,sys;"
                       "s=importlib.util.spec_from_file_location('media'," + repr(str(HELPER)) + ");"
                       "m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\n"
                       "try:m.run_command([sys.executable,'-c'," + repr(child) + "],timeout=5)\n"
                       "except m.MediaError as e:print(json.dumps({'code':e.code}))\n")
            outer = subprocess.Popen([sys.executable, "-B", "-c", wrapper], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            try:
                deadline = time.monotonic() + 3
                while not ready.exists() and time.monotonic() < deadline:
                    time.sleep(0.02)
                self.assertTrue(ready.exists(), "extractor must start before cancellation")
                outer.terminate()
                stdout, stderr = outer.communicate(timeout=2)
                self.assertEqual(json.loads(stdout), {"code": "CANCELLED"})
                self.assertEqual(stderr, b"")
                time.sleep(1.05)
                self.assertFalse(survived.exists())
            finally:
                if outer.poll() is None:
                    outer.kill()
                    outer.communicate(timeout=2)


class AdditionalSafetyTests(unittest.TestCase):
    def test_main_sanitizes_unexpected_failures(self):
        output, errors = io.StringIO(), io.StringIO()
        with mock.patch.object(media, "resolve", side_effect=RuntimeError("https://private.example/?sig=secret")):
            with contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
                try:
                    status = media.main(["resolve", "--url", "https://www.twitch.tv/hutchmf"])
                except Exception:
                    self.fail("CLI leaked an unexpected exception instead of a sanitized JSON error")
        self.assertEqual(status, 1)
        self.assertEqual(json.loads(output.getvalue())["error"]["code"], "INTERNAL_ERROR")
        self.assertEqual(errors.getvalue(), "")
        self.assertNotIn("secret", output.getvalue())

    def test_metadata_caps_bound_injected_runner_and_exported_response(self):
        with self.assertRaises(media.MediaError) as error:
            media.resolve("https://www.twitch.tv/hutchmf", runner=lambda *args: b" " * (media.MAX_METADATA_BYTES + 1))
        self.assertEqual(error.exception.code, "OUTPUT_LIMIT")
        fixture = youtube_metadata()
        fixture["formats"] = [dict(fixture["formats"][0], format_id=str(i)) for i in range(513)]
        with self.assertRaises(media.MediaError) as error:
            media.resolve("https://youtu.be/jNQXAC9IVRw", runner=lambda command, **kwargs: ytdlp_output(command, fixture))
        self.assertEqual(error.exception.code, "OUTPUT_LIMIT")
        with self.assertRaises(media.MediaError) as error:
            media.resolve("https://youtu.be/jNQXAC9IVRw", runner=lambda *args: b"x" * (media.MAX_METADATA_BYTES + 1))
        self.assertEqual(error.exception.code, "OUTPUT_LIMIT", "the size guard still applies to the trimmed output")


class MediaCLITests(unittest.TestCase):
    def test_unsupported_source_returns_one_sanitized_json_error(self):
        secret = "https://127.0.0.1/private?token=do-not-echo"
        proc = subprocess.run(
            [sys.executable, "-B", str(HELPER), "resolve", "--url", secret],
            capture_output=True, text=True, timeout=5,
        )
        self.assertTrue(proc.stdout.startswith("{"), "resolver must emit a JSON error")
        payload = json.loads(proc.stdout)
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"]["code"], "UNSUPPORTED_SOURCE")
        self.assertNotEqual(proc.returncode, 0)
        self.assertEqual(proc.stderr, "")
        self.assertNotIn("do-not-echo", proc.stdout)
        self.assertNotIn("127.0.0.1", proc.stdout)

    def test_malformed_cli_never_emits_argparse_echo_or_traceback(self):
        proc = subprocess.run(
            [sys.executable, "-B", str(HELPER), "resolve", "--secret=not-for-logs"],
            capture_output=True, text=True, timeout=5,
        )
        self.assertTrue(proc.stdout.startswith("{"), "resolver must emit a JSON error")
        payload = json.loads(proc.stdout)
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"]["code"], "INVALID_ARGUMENTS")
        self.assertNotEqual(proc.returncode, 0)
        self.assertEqual(proc.stderr, "")
        self.assertNotIn("not-for-logs", proc.stdout)


if __name__ == "__main__":
    unittest.main()
