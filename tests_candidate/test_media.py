"""Media resolver contract tests; fake extractors never contact a network."""

import json
import importlib.util
import contextlib
import io
import os
import pathlib
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock


HELPER = pathlib.Path(__file__).resolve().parents[1] / "candidate-plugin" / "helpers" / "media.py"
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


class MetadataTests(unittest.TestCase):
    def resolve_fixture(self, source, fixture, quality="auto720"):
        self.commands = []
        def runner(command, **kwargs):
            self.commands.append(command)
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

    def test_observed_twitch_vod_distribution_is_allowed_without_general_cloudfront_access(self):
        fixture = twitch_metadata()
        fixture["streams"]["720p60"]["url"] = "https://d2vi6trrdongqn.cloudfront.net/fixture/720p60/index-dvr.m3u8"
        try:
            result = self.resolve_fixture("https://www.twitch.tv/videos/2923174759", fixture)
        except media.MediaError as error:
            self.fail("the observed public Twitch VOD distribution was rejected: " + error.code)
        self.assertEqual(result["mediaURL"], "https://d2vi6trrdongqn.cloudfront.net/fixture/720p60/index-dvr.m3u8")
        self.assertFalse(result["live"])

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
        for flag in ["--ignore-config", "--no-plugin-dirs", "--no-cache-dir", "--simulate", "--dump-single-json", "--no-playlist", "--no-remote-components"]:
            self.assertIn(flag, cmd)
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
            media.resolve("https://youtu.be/jNQXAC9IVRw", runner=lambda *args: json.dumps(fixture))
        self.assertEqual(error.exception.code, "OUTPUT_LIMIT")


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
