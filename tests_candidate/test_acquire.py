"""Offline acquisition contract tests. All extractor output here is synthetic."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import resource
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock

HELPER = Path(__file__).resolve().parents[1] / 'candidate-plugin' / 'helpers' / 'acquire.py'
SPEC = importlib.util.spec_from_file_location('candidate_acquire', HELPER)
acquire = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(acquire)
ID = '92h_kU8O58M'
URL = 'https://www.youtube.com/watch?v=' + ID


def metadata():
    return {'id': ID, 'extractor_key': 'Youtube', '_type': 'video', 'is_live': False,
            'live_status': 'was_live', 'availability': 'public',
            'subtitles': {'live_chat': [{'ext': 'json', 'protocol': 'youtube_live_chat_replay',
                                         'video_id': ID, 'url': URL}]}}


def archive():
    return json.dumps({'replayChatItemAction': {'videoOffsetTimeMsec': '1250', 'actions': [
        {'addChatItemAction': {'item': {'liveChatTextMessageRenderer': {
            'id': 'synthetic-1', 'authorName': {'simpleText': 'Synthetic Example'},
            'message': {'runs': [{'text': '<script>literal hostile text</script>'}]}}}}}]}}).encode() + b'\n'


class AcquisitionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name)
        self.output = self.base / 'result'
        self.commands = []

    def tearDown(self):
        self.tmp.cleanup()

    def runner(self, command, **kwargs):
        self.commands.append((command, kwargs))
        if '--dump-single-json' in command:
            return json.dumps(metadata()).encode()
        template = Path(command[command.index('--output') + 1])
        template.with_name('archive.live_chat.json').write_bytes(archive())
        return b''

    def test_explicit_success_preflights_and_publishes_only_a_valid_archive(self):
        result = acquire.acquire(URL, str(self.output), runner=self.runner)
        path = Path(result['path'])
        self.assertEqual(result, {'ok': True, 'path': str(self.output.resolve() / 'replay.jsonl')})
        self.assertTrue(path.is_absolute())
        self.assertEqual(path.read_bytes(), archive())
        self.assertEqual(sorted(p.name for p in self.output.iterdir()), ['replay.jsonl'])
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.output.stat().st_mode & 0o777, 0o700)
        self.assertEqual(len(self.commands), 2)
        for command, kwargs in self.commands:
            for flag in ['--ignore-config', '--no-plugin-dirs', '--no-cache-dir', '--no-remote-components',
                         '--no-cookies', '--no-cookies-from-browser', '--no-playlist', '--skip-download']:
                self.assertIn(flag, command)
            self.assertEqual(command[0], '/opt/homebrew/bin/yt-dlp')
            self.assertEqual(command[-1], URL)
            self.assertLessEqual(kwargs['timeout'], 120)
            self.assertNotIn('--cookies', command)
            self.assertNotIn('--exec', command)
            self.assertNotIn('--update', command)
        download = self.commands[1][0]
        self.assertEqual(download[download.index('--sub-langs') + 1], 'live_chat')
        self.assertEqual(download[download.index('--sub-format') + 1], 'json')
        self.assertIn('--abort-on-unavailable-fragments', download)
        self.assertEqual(download[download.index('--match-filters') + 1], '!is_live')

    def test_only_canonical_public_youtube_identity_can_invoke_extractor(self):
        bad = ['file:///etc/passwd', 'https://www.youtube.com.evil.example/watch?v=' + ID,
               'https://name:secret@www.youtube.com/watch?v=' + ID,
               URL + '&list=private', URL + '\n--exec=bad', URL + '#x', URL + '&v=aaaaaaaaaaa',
               'http://www.youtube.com/watch?v=' + ID, 'https://www.youtube.com:443/watch?v=' + ID,
               'https://www.youtube.com/watch?v=short', '--cookies-from-browser=firefox']
        for value in bad:
            with self.subTest(value=value), self.assertRaises(acquire.AcquireError) as error:
                acquire.acquire(value, str(self.output), runner=self.runner)
            self.assertEqual(error.exception.code, 'UNSUPPORTED_SOURCE')
        self.assertEqual(self.commands, [])
        self.assertFalse(self.output.exists())

    def test_metadata_prevents_live_upcoming_unavailable_and_missing_replay(self):
        cases = [('LIVE_NOT_REPLAY', {'is_live': True}), ('LIVE_NOT_REPLAY', {'live_status': 'is_live'}),
                 ('LIVE_NOT_REPLAY', {'live_status': 'is_upcoming'}), ('LIVE_NOT_REPLAY', {'live_status': 'post_live'}),
                 ('ACCESS_REQUIRED', {'availability': 'private'}), ('ACCESS_REQUIRED', {'availability': 'subscriber_only'}),
                 ('INVALID_METADATA', {'id': 'aaaaaaaaaaa'}), ('INVALID_METADATA', {'_type': 'playlist'}),
                 ('NO_REPLAY', {'subtitles': {}}),
                 ('NO_REPLAY', {'subtitles': {'live_chat': [{'ext': 'json', 'protocol': 'youtube_live_chat'}]}})]
        for code, changes in cases:
            with self.subTest(changes=changes):
                self.commands.clear()
                def preflight(command, **kwargs):
                    self.commands.append(command)
                    value = metadata()
                    value.update(changes)
                    return json.dumps(value).encode()
                with self.assertRaises(acquire.AcquireError) as error:
                    acquire.acquire(URL, str(self.output), runner=preflight)
                self.assertEqual(error.exception.code, code)
                self.assertEqual(len(self.commands), 1)
                self.assertEqual(list(self.base.iterdir()), [])

    def test_installed_ytdlp_watch_parameters_keep_the_same_public_video_identity(self):
        # Observed installed 2026.08.19 metadata; not credentials or caller-supplied parameters.
        def observed(command, **kwargs):
            if '--dump-single-json' in command:
                value = metadata()
                value['subtitles']['live_chat'][0]['url'] = URL + '&bpctr=9999999999&has_verified=1'
                return json.dumps(value).encode()
            return self.runner(command, **kwargs)
        result = acquire.acquire(URL, str(self.output), runner=observed)
        self.assertTrue(result['ok'])
        self.assertEqual(self.commands[-1][0][-1], URL)

    def test_metadata_cannot_supply_a_download_address_or_different_video(self):
        for changes in [{'url': 'http://127.0.0.1/private'}, {'video_id': 'aaaaaaaaaaa'},
                        {'url': URL + '&secret=never-echo'}]:
            def bad(command, **kwargs):
                value = metadata()
                value['subtitles']['live_chat'][0].update(changes)
                return json.dumps(value).encode()
            with self.subTest(changes=changes), self.assertRaises(acquire.AcquireError) as error:
                acquire.acquire(URL, str(self.output), runner=bad)
            self.assertEqual(error.exception.code, 'INVALID_METADATA')
        self.assertFalse(self.output.exists())

    def test_failed_download_removes_staging_and_never_publishes_partial_artifact(self):
        def failed(command, **kwargs):
            if '--dump-single-json' in command:
                return json.dumps(metadata()).encode()
            stage = Path(command[command.index('--output') + 1]).parent
            (stage / 'archive.live_chat.json.part').write_bytes(archive())
            raise acquire.AcquireError('TIMEOUT')
        with self.assertRaises(acquire.AcquireError) as error:
            acquire.acquire(URL, str(self.output), runner=failed)
        self.assertEqual(error.exception.code, 'TIMEOUT')
        self.assertEqual(list(self.base.iterdir()), [])

    def test_existing_destination_or_symlink_is_untouched_and_does_not_connect(self):
        self.output.mkdir()
        (self.output / 'keep').write_text('preserve')
        with self.assertRaises(acquire.AcquireError):
            acquire.acquire(URL, str(self.output), runner=self.runner)
        self.assertEqual((self.output / 'keep').read_text(), 'preserve')
        self.assertEqual(self.commands, [])
        link = self.base / 'link'
        link.symlink_to(self.output, target_is_directory=True)
        with self.assertRaises(acquire.AcquireError):
            acquire.acquire(URL, str(link), runner=self.runner)
        self.assertEqual(self.commands, [])

    def test_successful_extractor_exit_does_not_make_partial_live_or_hostile_files_valid(self):
        cases = ['missing', 'part', 'live', 'malformed', 'untimed', 'symlink']
        for mode in cases:
            with self.subTest(mode=mode):
                def bad(command, **kwargs):
                    if '--dump-single-json' in command:
                        return json.dumps(metadata()).encode()
                    stage = Path(command[command.index('--output') + 1]).parent
                    target = stage / 'archive.live_chat.json'
                    if mode == 'part':
                        target.write_bytes(archive())
                        (stage / 'archive.live_chat.json.part').write_bytes(b'partial')
                    elif mode == 'live':
                        row = json.loads(archive())
                        row['isLive'] = True
                        target.write_text(json.dumps(row))
                    elif mode == 'malformed': target.write_text('<html>private</html>')
                    elif mode == 'untimed': target.write_text('{"addChatItemAction":{}}\n')
                    elif mode == 'symlink': target.symlink_to('/etc/passwd')
                    return b''
                with self.assertRaises(acquire.AcquireError):
                    acquire.acquire(URL, str(self.output), runner=bad)
                self.assertEqual(list(self.base.iterdir()), [])

    def test_raw_size_and_json_line_budget_are_enforced(self):
        def oversized(command, **kwargs):
            if '--dump-single-json' in command:
                return json.dumps(metadata()).encode()
            target = Path(command[command.index('--output') + 1]).with_name('archive.live_chat.json')
            target.write_bytes(archive() * 5)
            return b''
        with mock.patch.object(acquire, 'MAX_ARCHIVE_BYTES', 256):
            with self.assertRaises(acquire.AcquireError) as error:
                acquire.acquire(URL, str(self.output), runner=oversized)
            self.assertEqual(error.exception.code, 'OUTPUT_LIMIT')
        with mock.patch.object(acquire, 'MAX_LINE_BYTES', 64):
            with self.assertRaises(acquire.AcquireError) as error:
                acquire.acquire(URL, str(self.output), runner=self.runner)
            self.assertEqual(error.exception.code, 'OUTPUT_LIMIT')
        self.assertEqual(list(self.base.iterdir()), [])

    def test_cli_errors_are_json_and_never_echo_supplied_data(self):
        completed = subprocess.run([sys.executable, str(HELPER), '--url', 'secret-private-input',
                                    '--output', str(self.output)], capture_output=True, timeout=5)
        self.assertNotEqual(completed.returncode, 0)
        result = json.loads(completed.stdout)
        self.assertFalse(result['ok'])
        self.assertNotIn(b'secret-private-input', completed.stdout + completed.stderr)
        self.assertEqual(completed.stderr, b'')


class ProcessTests(unittest.TestCase):
    def test_thread_safe_child_launcher_preserves_literal_argv_and_limits_only_child(self):
        original_popen = subprocess.Popen
        parent_limit = resource.getrlimit(resource.RLIMIT_FSIZE)
        literal = 'spaces ; $(not-a-command) `literal` & --cookies=never'
        code = 'import json,resource,sys;print(json.dumps({"argv":sys.argv[1:],"limit":resource.getrlimit(resource.RLIMIT_FSIZE)}))'

        def checked_popen(*args, **kwargs):
            self.assertIsNone(kwargs.get('preexec_fn'), 'Python callbacks after fork are unsafe under the runner watcher thread')
            return original_popen(*args, **kwargs)

        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(acquire, 'MAX_ARCHIVE_BYTES', 4096), mock.patch.object(subprocess, 'Popen', checked_popen):
            result = acquire.run_command([sys.executable, '-c', code, literal], timeout=2, watch_dir=Path(tmp))
        value = json.loads(result)
        expected = 4096 if parent_limit[1] == resource.RLIM_INFINITY else min(4096, parent_limit[1])
        self.assertEqual(value, {'argv': [literal], 'limit': [expected, expected]})
        self.assertEqual(resource.getrlimit(resource.RLIMIT_FSIZE), parent_limit)

    def test_limited_child_launcher_missing_executable_is_sanitized(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(acquire.AcquireError) as error:
                acquire.run_command([str(Path(tmp, 'private-missing-executable'))], timeout=2, watch_dir=Path(tmp))
        self.assertEqual(error.exception.code, 'MISSING_DEPENDENCY')
        self.assertNotIn('private-missing-executable', str(error.exception))

    def test_stderr_is_sanitized_and_auth_barriers_are_reported_without_retries(self):
        with self.assertRaises(acquire.AcquireError) as error:
            acquire.run_command([sys.executable, '-c',
                'import sys;sys.stderr.write("Sign in to confirm your age secret-signed-url");sys.exit(1)'], timeout=2)
        self.assertEqual(error.exception.code, 'ACCESS_REQUIRED')
        self.assertNotIn('secret', str(error.exception))

    def test_timeout_terminates_owned_descendants_even_if_group_leader_exits(self):
        with tempfile.TemporaryDirectory() as tmp:
            pidfile = Path(tmp, 'child-pid')
            child = ('import os,pathlib,signal,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);'
                     'pathlib.Path(' + repr(str(pidfile)) + ').write_text(str(os.getpid()));time.sleep(30)')
            code = 'import subprocess,sys;subprocess.Popen([sys.executable,"-c",' + repr(child) + '])'
            started = time.monotonic()
            try:
                with self.assertRaises(acquire.AcquireError) as error:
                    acquire.run_command([sys.executable, '-c', code], timeout=0.75)
                self.assertEqual(error.exception.code, 'TIMEOUT')
                self.assertLess(time.monotonic() - started, 2)
                self.assertTrue(pidfile.exists(), 'descendant must start for this test')
                deadline = time.monotonic() + 0.75
                while True:
                    state = subprocess.run(['/bin/ps', '-p', pidfile.read_text(), '-o', 'stat='],
                                           capture_output=True, text=True, timeout=2).stdout.strip()
                    if not state or state.startswith('Z') or time.monotonic() >= deadline:
                        break
                    time.sleep(0.02)
                self.assertTrue(not state or state.startswith('Z'), 'descendant survived cleanup: ' + state)
            finally:
                if pidfile.exists():
                    try: os.kill(int(pidfile.read_text()), signal.SIGKILL)
                    except ProcessLookupError: pass

    def test_parent_cancellation_stops_the_owned_process_without_leaking_raw_errors(self):
        with tempfile.TemporaryDirectory() as tmp:
            ready, survived = Path(tmp, 'ready'), Path(tmp, 'survived')
            child = ('import pathlib,time;pathlib.Path(' + repr(str(ready)) + ').write_text("ready");'
                     'time.sleep(1);pathlib.Path(' + repr(str(survived)) + ').write_text("leaked");time.sleep(10)')
            wrapper = ('import importlib.util,json,sys;'
                       's=importlib.util.spec_from_file_location("acquire",' + repr(str(HELPER)) + ');'
                       'm=importlib.util.module_from_spec(s);s.loader.exec_module(m)\n'
                       'try:m.run_command([sys.executable,"-c",' + repr(child) + '],timeout=5)\n'
                       'except m.AcquireError as e:print(json.dumps({"code":e.code}))\n')
            outer = subprocess.Popen([sys.executable, '-B', '-c', wrapper], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            try:
                deadline = time.monotonic() + 3
                while not ready.exists() and time.monotonic() < deadline:
                    time.sleep(0.02)
                self.assertTrue(ready.exists())
                outer.terminate()
                stdout, stderr = outer.communicate(timeout=2)
                self.assertEqual(json.loads(stdout), {'code': 'CANCELLED'})
                self.assertEqual(stderr, b'')
                time.sleep(1.05)
                self.assertFalse(survived.exists())
            finally:
                if outer.poll() is None:
                    outer.kill()
                    outer.communicate(timeout=2)

    def test_output_and_working_directory_are_bounded(self):
        with self.assertRaises(acquire.AcquireError) as error:
            acquire.run_command([sys.executable, '-c', 'print("x"*10000)'], timeout=2, max_output_bytes=100)
        self.assertEqual(error.exception.code, 'OUTPUT_LIMIT')
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, 'oversized').write_bytes(b'x' * 101)
            with mock.patch.object(acquire, 'MAX_ARCHIVE_BYTES', 100):
                with self.assertRaises(acquire.AcquireError) as error:
                    acquire.run_command([sys.executable, '-c', 'pass'], timeout=2, watch_dir=Path(tmp))
            self.assertEqual(error.exception.code, 'OUTPUT_LIMIT')

    def test_process_receives_only_explicit_minimal_environment(self):
        with mock.patch.dict(os.environ, {'HTTP_PROXY': 'private-proxy', 'PYTHONPATH': '/private/plugin'}):
            data = acquire.run_command([sys.executable, '-c',
                'import os,json;print(json.dumps({k:os.environ.get(k) for k in ["HTTP_PROXY","PYTHONPATH","PYTHONNOUSERSITE"]}))'], timeout=2)
        self.assertEqual(json.loads(data), {'HTTP_PROXY': None, 'PYTHONPATH': None, 'PYTHONNOUSERSITE': '1'})


if __name__ == '__main__':
    unittest.main()
