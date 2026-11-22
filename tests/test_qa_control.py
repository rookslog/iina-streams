"""QA control protocol tests using a temporary mailbox and no IINA process."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

QA_DIR = Path(__file__).resolve().parents[1] / 'qa'


class QaControlTests(unittest.TestCase):
    def test_control_uses_dev_mailbox_and_waits_for_matching_response(self):
        with tempfile.TemporaryDirectory() as temp:
            home = Path(temp)
            data = home / 'Library/Application Support/com.colliderli.iina/plugins/.data/local.iina.streams.dev'
            data.mkdir(parents=True)
            spec = importlib.util.spec_from_file_location('streams_qa_control', QA_DIR / 'control.py')
            control = importlib.util.module_from_spec(spec)
            with mock.patch.dict(os.environ, {'HOME': str(home)}), mock.patch.object(Path, 'home', return_value=home):
                spec.loader.exec_module(control)
                resolved = control.DATA

            request_file = data / 'qa-request.json'
            response_file = data / 'qa-response.json'
            response_file.write_text(json.dumps({'id': 'stale', 'result': False}))
            arguments = {'url': 'https://www.twitch.tv/fixture'}
            now = 0

            def acknowledge(delay):
                nonlocal now
                now += delay
                sent = json.loads(request_file.read_text())
                self.assertIsInstance(sent['id'], str)
                self.assertNotIn(sent['id'], ('', 'stale'))
                self.assertEqual(sent['command'], 'open')
                self.assertEqual(sent['data'], arguments)
                self.assertEqual(sent['targetSource'], 'fixture')
                response_file.write_text(json.dumps({'id': sent['id'], 'result': True, 'state': {}}))

            def expire(_delay):
                nonlocal now
                now += 60

            # Redirect I/O even on the broken baseline so no call can touch a real plugin directory.
            clock = mock.Mock(monotonic=lambda: now)
            clock.sleep.side_effect = acknowledge
            with mock.patch.object(control, 'DATA', data), mock.patch.object(control, 'time', clock):
                reply = control.call('open', arguments, 'fixture')
                self.assertEqual(reply, json.loads(response_file.read_text()))
                self.assertIs(reply['result'], True)

                # Leave the old response in place; it must not satisfy a new request.
                clock.sleep.side_effect = expire
                with self.assertRaisesRegex((RuntimeError, TimeoutError), r'timed out|did not acknowledge'):
                    control.call('state', {})

            self.assertEqual(resolved, data, 'Control must resolve the dev data folder under the current home')

    def test_qa_sources_have_no_retired_paths(self):
        retired = (b'local.iina.streams.qa', b'iina-streams-candidates')
        matches = []
        for path in sorted(QA_DIR.rglob('*')):
            if path.is_file() and '__pycache__' not in path.parts:
                source = path.read_bytes()
                if any(marker in source for marker in retired):
                    matches.append(path.relative_to(QA_DIR).as_posix())
        self.assertEqual(matches, [], 'QA files must no longer reference retired paths')


if __name__ == '__main__':
    unittest.main()
