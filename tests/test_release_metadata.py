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


    def test_a_new_version_raises_gh_version_above_main(self):
        # IINA v1.5.1 offers a GitHub update only when ghVersion is strictly greater (JavascriptPlugin.swift
        # L511-L526); v0.5.5 release review round 1, finding 4. Skipped where `main` isn't available.
        import subprocess
        shown = subprocess.run(['git', 'show', 'main:Info.json'], cwd=ROOT, capture_output=True, text=True)
        if shown.returncode != 0:
            self.skipTest('main is not available in this checkout')
        released = json.loads(shown.stdout)
        if released['version'] == self.info['version']:
            return
        self.assertGreater(int(self.info['ghVersion']), int(released['ghVersion']))

    def test_checked_in_embedded_helpers_match_helpers_sources(self):
        # A source install (IINA's main.zip fallback) runs this checked-in copy, not a rebuilt one.
        # Release review 2026-11-22 found 'acquire' stale. Fix: python3 scripts/build.py --sync-embedded
        import importlib.util
        spec = importlib.util.spec_from_file_location('build_module', ROOT / 'scripts' / 'build.py')
        build_module = importlib.util.module_from_spec(spec); spec.loader.exec_module(build_module)
        checked_in = (ROOT / 'src' / 'embedded-helpers.js').read_text()
        self.assertEqual(checked_in, build_module.embedded_helpers_js(),
                         'src/embedded-helpers.js is stale: run python3 scripts/build.py --sync-embedded')

    def test_no_npm_script_deletes_the_installed_stable_plugin(self):
        # #21: stable deployment goes through a Release with a backup, never rm -rf.
        for name, command in self.package['scripts'].items():
            self.assertFalse('rm -rf' in command and 'local.iina.streams.iinaplugin' in command, name)

if __name__ == '__main__':
    unittest.main()
