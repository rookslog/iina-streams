"""Synthetic, offline interruption probes at the atomic publication boundary."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

HELPERS = Path(__file__).resolve().parents[1] / 'candidate-plugin' / 'helpers'


def load(name):
    spec = importlib.util.spec_from_file_location('publication_' + name, HELPERS / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PublicationTests(unittest.TestCase):
    def exercise(self, name, replace_with_foreign=False):
        helper = load(name)
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp).resolve()
            output, input_file = base / 'published', base / 'synthetic.json'
            input_file.write_text('{"version":1,"records":[{"id":"fixture","time":0,"text":"synthetic"}]}')
            original = helper.os.rename

            def interrupt_after_publication(src, dst, *args, **kwargs):
                result = original(src, dst, *args, **kwargs)
                if Path(dst) == output:
                    if replace_with_foreign:
                        original(output, base / 'moved-owned-output')
                        output.mkdir()
                        (output / 'must-preserve').write_text('foreign directory')
                    raise KeyboardInterrupt()
                return result

            identifier = '92h_kU8O58M'
            url = 'https://www.youtube.com/watch?v=' + identifier

            def fake(command, **kwargs):
                if '--dump-single-json' in command:
                    return json.dumps({'id':identifier,'is_live':False,'live_status':'was_live',
                        'subtitles':{'live_chat':[{'ext':'json','protocol':'youtube_live_chat_replay',
                        'video_id':identifier,'url':url}]}}).encode()
                (kwargs['watch_dir'] / 'archive.live_chat.json').write_text(
                    '{"replayChatItemAction":{"videoOffsetTimeMsec":"0","actions":[{}]}}\n')
                return b''

            with mock.patch.object(helper.os, 'rename', interrupt_after_publication), self.assertRaises(KeyboardInterrupt):
                if name == 'acquire':
                    helper.acquire(url, str(output), runner=fake)
                else:
                    helper.import_archive(str(input_file), str(output))
            if replace_with_foreign:
                self.assertEqual((output / 'must-preserve').read_text(), 'foreign directory')
            else:
                self.assertFalse(output.exists(), 'owned publication must be removed after interruption')
            self.assertEqual(list(base.glob('.replay-*')), [])

    def test_acquisition_interruption_cleans_its_published_directory(self):
        self.exercise('acquire')

    def test_replay_interruption_cleans_its_published_directory(self):
        self.exercise('replay')

    def test_acquisition_never_removes_a_foreign_replacement_at_its_destination(self):
        self.exercise('acquire', True)

    def test_replay_never_removes_a_foreign_replacement_at_its_destination(self):
        self.exercise('replay', True)


if __name__ == '__main__':
    unittest.main()
