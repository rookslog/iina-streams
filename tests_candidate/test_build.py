import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('candidate_build', ROOT / 'scripts' / 'build-candidates.py')
BUILD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILD)

class BuildTests(unittest.TestCase):
    def test_isolated_ids_reproducibility_and_no_autostart(self):
        with tempfile.TemporaryDirectory() as temp:
            first = BUILD.build(temp)
            second = BUILD.build(temp)
            self.assertEqual(first['packages'], second['packages'])
            self.assertEqual(len(first['packages']), 2)
            for item in first['packages']:
                self.assertNotEqual(item['identifier'], 'local.iina.streams')
                with zipfile.ZipFile(Path(temp) / item['name']) as packed:
                    self.assertNotIn('qa-harness.js', packed.namelist())
                    self.assertIn('"qa":false', packed.read('config.js').decode())
                    self.assertIn('src/embedded-helpers.js', packed.namelist())

    def test_refuses_to_replace_unrecognized_plugin(self):
        with tempfile.TemporaryDirectory() as temp:
            dest = Path(temp) / 'streams-unified.iinaplugin'
            dest.mkdir()
            (dest / 'Info.json').write_text(json.dumps({'identifier': 'local.iina.streams'}))
            with self.assertRaises(ValueError):
                BUILD.build(temp)
            self.assertEqual(json.loads((dest / 'Info.json').read_text())['identifier'], 'local.iina.streams')

if __name__ == '__main__':
    unittest.main()
