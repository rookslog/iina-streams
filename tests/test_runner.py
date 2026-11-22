"""Offline lifecycle tests using real owned subprocesses and helper cleanup."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock

HELPERS = Path(__file__).resolve().parents[1] / 'helpers'
RUNNER = HELPERS / 'runner.py'
SPEC = importlib.util.spec_from_file_location('candidate_runner', RUNNER)
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name).resolve()
        self.data = self.base / 'data'
        self.data.mkdir(mode=0o700)
        self.wrapper = self.materialize('runner', RUNNER.read_bytes())
        self.cancel = self.data / 'cancel-fixture-123456.flag'
        self.processes = []

    def tearDown(self):
        for process in self.processes:
            if process.poll() is None:
                self.cancel.write_text('cancel')
                try: process.communicate(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.communicate(timeout=2)
        self.tmp.cleanup()

    def materialize(self, name, source):
        data = source.encode() if isinstance(source, str) else source
        path = self.data / (name + '-' + hashlib.sha256(data).hexdigest() + '.py')
        path.write_bytes(data)
        path.chmod(0o600)
        return path

    def command(self, script, args=(), cancel=None):
        return [sys.executable, '-B', str(self.wrapper), '--cancel-file', str(cancel or self.cancel),
                '--script', str(script), '--', *args]

    def run_once(self, script, args=(), cancel=None):
        completed = subprocess.run(self.command(script, args, cancel), capture_output=True, timeout=5)
        self.assertEqual(completed.stderr, b'')
        result = json.loads(completed.stdout)
        self.assertEqual(completed.returncode, 0 if result['ok'] else 1)
        return result

    def start(self, script, args=()):
        process = subprocess.Popen(self.command(script, args), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.processes.append(process)
        return process

    def wait_ready(self, predicate, process):
        deadline = time.monotonic() + 4
        while not predicate() and process.poll() is None and time.monotonic() < deadline:
            time.sleep(0.01)
        self.assertTrue(predicate(), 'helper must reach its owned work before cancellation')

    def cancel_running(self, process):
        started = time.monotonic()
        self.cancel.write_text('cancel')
        stdout, stderr = process.communicate(timeout=3)
        self.assertLess(time.monotonic() - started, 2)
        self.assertEqual(stderr, b'')
        self.assertEqual(json.loads(stdout)['error']['code'], 'CANCELLED')
        self.assertFalse(self.cancel.exists())

    def test_runs_hash_named_bundled_helper_in_process_and_preserves_argument_boundaries(self):
        helper = self.materialize('media', 'import json,os,sys\nprint(json.dumps({"ok":True,"pid":os.getpid(),"args":sys.argv[1:]}))\n')
        process = self.start(helper, ['literal $(not-a-command)', 'two words', '--example'])
        stdout, stderr = process.communicate(timeout=3)
        result = json.loads(stdout)
        self.assertTrue(result['ok'])
        self.assertEqual(result['pid'], process.pid)
        self.assertEqual(result['args'], ['literal $(not-a-command)', 'two words', '--example'])
        self.assertEqual(stderr, b'')

    def test_cancel_before_start_never_executes_helper_and_removes_marker(self):
        started = self.base / 'must-not-start'
        helper = self.materialize('media', 'from pathlib import Path\nPath(' + repr(str(started)) + ').write_text("started")\n')
        self.cancel.write_text('cancel')
        result = self.run_once(helper)
        self.assertEqual(result['error']['code'], 'CANCELLED')
        self.assertFalse(started.exists())
        self.assertFalse(self.cancel.exists())

    def test_rejects_relative_paths_unhashed_targets_wrong_digest_and_symlinks(self):
        helper = self.materialize('media', 'print("should-not-run")\n')
        relative = Path(helper.name)
        outside = self.base / helper.name
        outside.write_bytes(helper.read_bytes())
        plain = self.data / 'media.py'
        plain.write_bytes(helper.read_bytes())
        symlink = self.data / ('replay-' + 'a' * 64 + '.py')
        symlink.symlink_to(helper)
        for value in [relative, outside, plain, symlink]:
            with self.subTest(value=str(value)):
                self.assertFalse(self.run_once(value)['ok'])
        helper.write_text('print("changed-source-secret")\n')
        result = self.run_once(helper)
        self.assertFalse(result['ok'])
        self.assertNotIn('secret', json.dumps(result))
        self.assertFalse(self.run_once(helper, cancel=Path('cancel-relative.flag'))['ok'])

    def test_an_owned_marker_is_removed_even_when_helper_verification_fails(self):
        helper = self.materialize('media', 'print("should-not-run")\n')
        helper.write_text('print("tampered")\n')
        self.cancel.write_text('cancel')
        self.assertFalse(self.run_once(helper)['ok'])
        self.assertFalse(self.cancel.exists())

    def test_does_not_follow_or_delete_an_unsafe_cancel_marker(self):
        helper = self.materialize('media', 'print("should-not-run")\n')
        private = self.base / 'private'
        private.write_text('must stay')
        self.cancel.symlink_to(private)
        self.assertFalse(self.run_once(helper)['ok'])
        self.assertEqual(private.read_text(), 'must stay')
        self.assertTrue(self.cancel.is_symlink())

    def test_group_writable_code_or_data_is_rejected_before_execution(self):
        helper = self.materialize('media', 'print("should-not-run")\n')
        helper.chmod(0o660)
        self.assertFalse(self.run_once(helper)['ok'])
        helper.chmod(0o600)
        self.data.chmod(0o770)
        self.assertFalse(self.run_once(helper)['ok'])
        self.data.chmod(0o700)

    def test_wrapper_failure_sanitizes_exceptions_stderr_and_partial_stdout(self):
        helper = self.materialize('media', 'import sys\nprint("private-partial-stdout")\nsys.stderr.write("credential-secret")\nraise RuntimeError("private-source-path")\n')
        result = self.run_once(helper)
        self.assertFalse(result['ok'])
        self.assertNotIn('private', json.dumps(result))
        self.assertNotIn('credential', json.dumps(result))
        self.assertNotIn('secret', json.dumps(result))

    def test_invalid_or_oversized_helper_response_is_not_forwarded(self):
        for source in ['print("not JSON with private-source")\n',
                       'print(\'{"ok":true,"value":NaN}\')\n',
                       'print("x" * (8 * 1024 * 1024 + 1))\n',
                       'import json\nprint(json.dumps({"ok":True,"text":"\\u00e9"*1500000},ensure_ascii=False))\n',
                       'print(\'{"ok":true}\')\nraise SystemExit(2)\n']:
            with self.subTest(source=source[:20]):
                result = self.run_once(self.materialize('media', source))
                self.assertFalse(result['ok'])
                self.assertNotIn('private-source', json.dumps(result))

    def test_normal_completion_stops_watcher_and_restores_process_state(self):
        helper = self.materialize('media', 'print(\'{"ok":true}\')\n')
        before_threads = {t.ident for t in threading.enumerate()}
        before_handler, before_argv = signal.getsignal(signal.SIGINT), sys.argv[:]
        with mock.patch.object(runner, '__file__', str(self.wrapper)):
            result = runner.execute(str(self.cancel), str(helper), [])
        self.assertTrue(result['ok'])
        self.assertEqual({t.ident for t in threading.enumerate()}, before_threads)
        self.assertEqual(signal.getsignal(signal.SIGINT), before_handler)
        self.assertEqual(sys.argv, before_argv)
        self.assertFalse(self.cancel.exists())

    def test_completed_success_is_preserved_when_cancellation_arrives_after_publication(self):
        output = self.base / 'completed'
        source = ('import json,signal,time\nfrom pathlib import Path\n'
                  'Path(' + repr(str(output)) + ').write_text("owned synthetic artifact")\n'
                  'print(json.dumps({"ok":True,"path":' + repr(str(output)) + '}))\n'
                  'signal.signal(signal.SIGINT,signal.SIG_IGN)\n'
                  'Path(' + repr(str(self.cancel)) + ').write_text("cancel");time.sleep(0.2)\n')
        result = self.run_once(self.materialize('acquire', source))
        self.assertEqual(result, {'ok': True, 'path': str(output)})
        self.assertTrue(output.exists(), 'host must receive the success ownership receipt before its stale-result cleanup')
        self.assertFalse(self.cancel.exists())

    def test_cancel_during_real_acquisition_publication_removes_only_its_owned_output(self):
        output = self.base / 'published'
        url = 'https://www.youtube.com/watch?v=92h_kU8O58M'
        meta = {'id':'92h_kU8O58M','is_live':False,'live_status':'was_live','availability':'public',
                'subtitles':{'live_chat':[{'ext':'json','protocol':'youtube_live_chat_replay','video_id':'92h_kU8O58M','url':url}]}}
        archive = b'{"replayChatItemAction":{"videoOffsetTimeMsec":"0","actions":[{}]}}\n'
        source = ('import importlib.util,json,sys,time\nfrom pathlib import Path\n'
                  's=importlib.util.spec_from_file_location("real_acquire",' + repr(str(HELPERS / 'acquire.py')) + ')\n'
                  'm=importlib.util.module_from_spec(s);s.loader.exec_module(m)\n'
                  'original=m.os.rename\n'
                  'def publish(src,dst,*args,**kwargs):\n'
                  ' result=original(src,dst,*args,**kwargs)\n'
                  ' if Path(dst)==Path(' + repr(str(output)) + '):\n'
                  '  Path(' + repr(str(self.cancel)) + ').write_text("cancel");time.sleep(0.2)\n'
                  ' return result\n'
                  'm.os.rename=publish\n'
                  'def fake(command,**kwargs):\n'
                  ' if "--dump-single-json" in command:return ' + repr(json.dumps(meta).encode()) + '\n'
                  ' (kwargs["watch_dir"]/"archive.live_chat.json").write_bytes(' + repr(archive) + ');return b""\n'
                  'try:\n print(json.dumps(m.acquire(' + repr(url) + ',' + repr(str(output)) + ',runner=fake)))\n'
                  'except m.AcquireError as e:\n print(json.dumps({"ok":False,"error":{"code":e.code,"message":str(e)}}));sys.exit(1)\n')
        result = self.run_once(self.materialize('acquire', source))
        self.assertEqual(result['error']['code'], 'CANCELLED')
        self.assertFalse(output.exists())
        self.assertEqual(list(self.base.glob('.replay-fetch-*')), [])

    def check_cancel_between_helper_return_and_main_response(self, name):
        output = self.base / ('finished-' + name)
        input_file = self.base / 'synthetic.json'
        input_file.write_text('{"version":1,"records":[{"id":"fixture","time":0,"text":"synthetic"}]}')
        url = 'https://www.youtube.com/watch?v=92h_kU8O58M'
        meta = {'id':'92h_kU8O58M','is_live':False,'live_status':'was_live',
                'subtitles':{'live_chat':[{'ext':'json','protocol':'youtube_live_chat_replay','video_id':'92h_kU8O58M','url':url}]}}
        function = 'acquire' if name == 'acquire' else 'import_archive'
        arguments = ['--url',url,'--output',str(output)] if name == 'acquire' else ['import','--input',str(input_file),'--output',str(output)]
        source = ('import importlib.util,json,sys,time\nfrom pathlib import Path\n'
                  's=importlib.util.spec_from_file_location("real_helper",' + repr(str(HELPERS / (name + '.py'))) + ')\n'
                  'm=importlib.util.module_from_spec(s);s.loader.exec_module(m)\n'
                  'def fake(command,**kwargs):\n'
                  ' if "--dump-single-json" in command:return ' + repr(json.dumps(meta).encode()) + '\n'
                  ' (kwargs["watch_dir"]/"archive.live_chat.json").write_text(\'{"replayChatItemAction":{"videoOffsetTimeMsec":"0","actions":[{}]}}\\n\');return b""\n'
                  'original=m.' + function + '\n'
                  'def delayed(*args,**kwargs):\n' +
                  (' kwargs["runner"]=fake\n' if name == 'acquire' else '') +
                  ' result=original(*args,**kwargs)\n'
                  ' Path(' + repr(str(self.cancel)) + ').write_text("cancel");time.sleep(0.2)\n'
                  ' return result\n'
                  'm.' + function + '=delayed\n'
                  'sys.exit(m.main(' + repr(arguments) + '))\n')
        result = self.run_once(self.materialize(name, source))
        self.assertTrue(result['ok'], result)
        self.assertTrue(output.is_dir())
        self.assertFalse(self.cancel.exists())

    def test_acquisition_commit_receipt_survives_cancel_before_main_serializes_it(self):
        self.check_cancel_between_helper_return_and_main_response('acquire')

    def test_replay_commit_receipt_survives_cancel_before_main_serializes_it(self):
        self.check_cancel_between_helper_return_and_main_response('replay')

    def test_cancellation_interrupts_real_media_process_group_cleanup(self):
        ready, pidfile = self.base / 'ready', self.base / 'child-pid'
        child = ('import os,pathlib,signal,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);'
                 'pathlib.Path(' + repr(str(pidfile)) + ').write_text(str(os.getpid()));'
                 'pathlib.Path(' + repr(str(ready)) + ').write_text("ready");time.sleep(30)')
        parent = 'import subprocess,sys,time;subprocess.Popen([sys.executable,"-c",' + repr(child) + ']);time.sleep(30)'
        source = ('import importlib.util,json,sys\n'
                  's=importlib.util.spec_from_file_location("real_media",' + repr(str(HELPERS / 'media.py')) + ')\n'
                  'm=importlib.util.module_from_spec(s);s.loader.exec_module(m)\n'
                  'try:\n m.run_command([sys.executable,"-c",' + repr(parent) + '],timeout=20)\n'
                  'except m.MediaError as e:\n print(json.dumps({"ok":False,"error":{"code":e.code,"message":str(e)}}));sys.exit(1)\n')
        process = self.start(self.materialize('media', source))
        try:
            self.wait_ready(ready.exists, process)
            self.cancel_running(process)
            deadline = time.monotonic() + 0.75
            while True:
                state = subprocess.run(['/bin/ps', '-p', pidfile.read_text(), '-o', 'stat='],
                                       capture_output=True, text=True, timeout=2).stdout.strip()
                if not state or state.startswith('Z') or time.monotonic() >= deadline:
                    break
                time.sleep(0.02)
            self.assertTrue(not state or state.startswith('Z'), 'owned descendant survived: ' + state)
        finally:
            if pidfile.exists():
                try: os.kill(int(pidfile.read_text()), signal.SIGKILL)
                except ProcessLookupError: pass

    def test_cancellation_runs_real_acquisition_staging_cleanup(self):
        ready = self.base / 'ready'
        output = self.base / 'fetched'
        url = 'https://www.youtube.com/watch?v=92h_kU8O58M'
        meta = {'id':'92h_kU8O58M','_type':'video','extractor_key':'Youtube','is_live':False,'live_status':'was_live',
                'availability':'public','subtitles':{'live_chat':[{'ext':'json','protocol':'youtube_live_chat_replay','video_id':'92h_kU8O58M','url':url}]}}
        child = 'import pathlib,time;pathlib.Path(' + repr(str(ready)) + ').write_text("ready");time.sleep(30)'
        source = ('import importlib.util,json,sys\nfrom pathlib import Path\n'
                  's=importlib.util.spec_from_file_location("real_acquire",' + repr(str(HELPERS / 'acquire.py')) + ')\n'
                  'm=importlib.util.module_from_spec(s);s.loader.exec_module(m)\n'
                  'def fake(command,**kwargs):\n'
                  ' if "--dump-single-json" in command:return ' + repr(json.dumps(meta).encode()) + '\n'
                  ' (kwargs["watch_dir"]/"archive.live_chat.json.part").write_text("partial")\n'
                  ' return m.run_command([sys.executable,"-c",' + repr(child) + '],**kwargs)\n'
                  'try:\n m.acquire(' + repr(url) + ',' + repr(str(output)) + ',runner=fake)\n'
                  'except m.AcquireError as e:\n print(json.dumps({"ok":False,"error":{"code":e.code,"message":str(e)}}));sys.exit(1)\n')
        process = self.start(self.materialize('acquire', source))
        self.wait_ready(ready.exists, process)
        self.cancel_running(process)
        self.assertFalse(output.exists())
        self.assertEqual(list(self.base.glob('.replay-fetch-*')), [])

    def test_cancellation_runs_real_replay_import_staging_cleanup(self):
        archive, output = self.base / 'archive.json', self.base / 'indexed'
        with archive.open('w') as stream:
            stream.write('{"version":1,"records":[')
            for i in range(80000):
                if i: stream.write(',')
                stream.write(json.dumps({'id':str(i),'time':i,'author':'Synthetic','text':'fixture ' * 20}))
            stream.write(']}')
        helper = self.materialize('replay', (HELPERS / 'replay.py').read_bytes())
        process = self.start(helper, ['import','--input',str(archive),'--output',str(output)])
        self.wait_ready(lambda:bool(list(self.base.glob('.replay-*'))), process)
        self.cancel_running(process)
        self.assertFalse(output.exists())
        self.assertEqual(list(self.base.glob('.replay-*')), [])


if __name__ == '__main__':
    unittest.main()
