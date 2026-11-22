"""Release metadata contract read by IINA's GitHub installer/updater and by CI."""
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('streams_check_version', ROOT / 'scripts/check_version.py')
CHECK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECK)


class ReleaseMetadataTests(unittest.TestCase):
    def setUp(self):
        self.info = json.loads((ROOT / 'Info.json').read_text())
        self.package = json.loads((ROOT / 'package.json').read_text())

    def test_repository_metadata_is_consistent(self):
        self.assertEqual(CHECK.problems(self.info, self.package), [])

    def test_matching_tag_passes_and_mismatches_fail(self):
        self.assertEqual(CHECK.problems(self.info, self.package, 'v' + self.info['version']), [])
        self.assertEqual(len(CHECK.problems(self.info, self.package, 'v0.0.0')), 1)

    def test_version_drift_and_bad_gh_fields_are_reported(self):
        info = dict(self.info, version='9.9.9', ghVersion='3')
        info.pop('ghRepo')
        self.assertEqual(len(CHECK.problems(info, self.package)), 3)
        self.assertEqual(len(CHECK.problems(dict(self.info, ghVersion=True), self.package)), 1)


if __name__ == '__main__':
    unittest.main()
