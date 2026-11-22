"""QA mode is dev-only: build flags, deploy plumbing, and control.py's wait logic."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def load(name, relative):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


BUILD = load('streams_build_qa', 'scripts/build.py')
DEV = load('streams_dev_qa', 'scripts/dev.py')
CONTROL = load('streams_control_qa', 'qa/control.py')


class QaBuildTests(unittest.TestCase):
    def test_only_the_dev_variant_accepts_qa(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(ValueError):
                BUILD.build(Path(temp) / 'beta', beta=True, qa=True)
            with self.assertRaises(ValueError):
                BUILD.build(Path(temp) / 'stable', qa=True)

    def test_cli_rejects_qa_without_dev(self):
        for flags in (['--beta', '--qa'], ['--qa']):
            result = subprocess.run(
                [sys.executable, '-B', str(ROOT / 'scripts/build.py'), *flags, '--output', tempfile.gettempdir() + '/never-built'],
                capture_output=True, text=True, timeout=30,
            )
            self.assertNotEqual(result.returncode, 0, flags)
            self.assertIn('--qa requires --dev', result.stderr)

    def test_harness_ships_byte_identical_to_the_source(self):
        with tempfile.TemporaryDirectory() as temp:
            manifest = BUILD.build(Path(temp), dev=True, qa=True)
            self.assertIs(manifest['qa'], True)
            with zipfile.ZipFile(Path(temp) / manifest['archive']) as package:
                self.assertEqual(package.read('qa-harness.js'), (ROOT / 'qa/qa-harness.js').read_bytes())

    def test_dev_deploy_with_qa_stages_the_harness_and_records_it(self):
        with tempfile.TemporaryDirectory() as temp:
            stage = Path(temp) / 'stage'
            record = DEV.deploy(stage, tests=None, qa=True)
            self.assertIs(record['qa'], True)
            self.assertTrue((stage / 'current/qa-harness.js').is_file())
            plain = DEV.deploy(stage, tests=None)
            self.assertIs(plain['qa'], False)
            self.assertFalse((stage / 'current/qa-harness.js').exists())

    def test_qa_flag_is_refused_outside_deploy(self):
        with self.assertRaises(SystemExit):
            with mock.patch('sys.stderr'):
                DEV.main(['status', '--qa'])


class ControlConditionTests(unittest.TestCase):
    STATE = {'controller': {'phase': 'playing', 'chat': {'mode': 'live'}, 'messages': [{'id': 'a'}]},
             'native': {'height': 720, 'paused': False}}

    def test_conditions(self):
        holds = lambda expression: CONTROL.condition_holds(self.STATE, expression)
        self.assertTrue(holds('controller.phase=playing'))
        self.assertTrue(holds('controller.chat.mode==live'))
        self.assertTrue(holds('native.paused=false'))
        self.assertTrue(holds('native.height>=720'))
        self.assertTrue(holds('controller.messages.0.id=a'))
        self.assertTrue(holds('controller.phase!=idle'))
        self.assertFalse(holds('native.height>720'))
        self.assertFalse(holds('native.missing>0'))
        self.assertFalse(holds('native.paused>0'), 'booleans are not numbers')

    def test_malformed_condition_is_refused(self):
        with self.assertRaises(ValueError):
            CONTROL.condition_holds({}, 'just words')

    def test_wait_polls_until_the_condition_holds(self):
        states = iter([{'native': {'height': 0}}, {'native': {'height': 0}}, {'native': {'height': 720}}])
        clock = mock.Mock()
        now = [0]
        clock.monotonic.side_effect = lambda: now[0]
        clock.sleep.side_effect = lambda seconds: now.__setitem__(0, now[0] + seconds)
        with mock.patch.object(CONTROL, 'time', clock), \
                mock.patch.object(CONTROL, 'call', lambda *a: {'id': 'x', 'state': next(states)}):
            response = CONTROL.wait_for('native.height>0', timeout=10, interval=1)
        self.assertEqual(response['state']['native']['height'], 720)
        self.assertEqual(clock.sleep.call_count, 2)

    def test_wait_gives_up_after_the_timeout(self):
        clock = mock.Mock()
        now = [0]
        clock.monotonic.side_effect = lambda: now[0]
        clock.sleep.side_effect = lambda seconds: now.__setitem__(0, now[0] + seconds)
        with mock.patch.object(CONTROL, 'time', clock), \
                mock.patch.object(CONTROL, 'call', lambda *a: {'id': 'x', 'state': {}}):
            self.assertIsNone(CONTROL.wait_for('native.height>0', timeout=3, interval=1))

    def test_scrub_drops_credential_fields(self):
        cleaned = CONTROL.scrub({'auth': {'phase': 'ready', 'userCode': 'X', 'access_token': 'Y'}, 'native': {'videoCodec': 'h264'}})
        self.assertEqual(cleaned, {'auth': {'phase': 'ready'}, 'native': {'videoCodec': 'h264'}})


if __name__ == '__main__':
    unittest.main()
