import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('candidate_build', ROOT / 'scripts' / 'build-candidates.py')
BUILD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILD)

@unittest.skipUnless((ROOT / 'candidate-plugin').is_dir(), 'Legacy candidate-plugin layout absent; current root builder tested in test_build_current.py')
class BuildTests(unittest.TestCase):
    def test_isolated_ids_reproducibility_and_no_autostart(self):
        with tempfile.TemporaryDirectory() as temp:
            original_glob = Path.glob
            def helper_enumeration(reverse):
                def enumerate_paths(path, pattern):
                    rows = list(original_glob(path, pattern))
                    if path == BUILD.SOURCE / 'helpers' and pattern == '*.py':
                        rows.sort(key=lambda p: p.name, reverse=reverse)
                    return iter(rows)
                return enumerate_paths
            # Different filesystems/source extractions can enumerate helpers differently.
            with mock.patch.object(Path, 'glob', helper_enumeration(False)):
                first = BUILD.build(temp)
            with mock.patch.object(Path, 'glob', helper_enumeration(True)):
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

    def test_archive_symlink_is_refused_before_any_candidate_is_replaced(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            result = BUILD.build(root)
            archive = root / result['packages'][1]['name']
            foreign = root / 'preserve.txt'
            foreign.write_text('synthetic foreign contents')
            archive.unlink()
            archive.symlink_to(foreign)
            marker = root / 'streams-unified.iinaplugin' / 'preserve-before-rejection'
            marker.write_text('previous candidate')
            with self.assertRaises(ValueError):
                BUILD.build(root)
            self.assertEqual(foreign.read_text(), 'synthetic foreign contents')
            self.assertTrue(archive.is_symlink())
            self.assertTrue(marker.exists())

    def test_archive_foreign_or_nonregular_outputs_are_refused(self):
        for kind in ('foreign-file', 'foreign-archive', 'directory', 'fifo'):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                result = BUILD.build(root)
                archive = root / result['packages'][1]['name']
                archive.unlink()
                if kind == 'foreign-file':
                    archive.write_text('synthetic foreign contents')
                elif kind == 'foreign-archive':
                    with zipfile.ZipFile(archive, 'w') as packed:
                        packed.writestr('Info.json', json.dumps({'identifier': 'local.iina.streams'}))
                elif kind == 'directory':
                    archive.mkdir()
                else:
                    os.mkfifo(archive)
                marker = root / 'streams-unified.iinaplugin' / 'preserve-before-rejection'
                marker.write_text('previous candidate')
                with self.assertRaises(ValueError):
                    BUILD.build(root)
                self.assertTrue(marker.exists())
                if kind == 'foreign-file':
                    self.assertEqual(archive.read_text(), 'synthetic foreign contents')

    def test_manifest_symlink_or_foreign_schema_is_refused_before_overwrite(self):
        for kind in ('symlink', 'foreign-schema'):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                BUILD.build(root)
                manifest = root / 'build-manifest.json'
                manifest.unlink()
                foreign = root / 'preserve.txt'
                foreign.write_text('synthetic foreign contents')
                if kind == 'symlink':
                    manifest.symlink_to(foreign)
                else:
                    manifest.write_text(json.dumps({'sourceCommit': 'foreign', 'files': {}, 'packages': []}))
                marker = root / 'streams-unified.iinaplugin' / 'preserve-before-rejection'
                marker.write_text('previous candidate')
                with self.assertRaises(ValueError):
                    BUILD.build(root)
                self.assertEqual(foreign.read_text(), 'synthetic foreign contents')
                self.assertTrue(marker.exists())

    def test_a_later_foreign_candidate_is_rejected_before_replacing_the_first(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            BUILD.build(root)
            marker = root / 'streams-unified.iinaplugin' / 'preserve-before-rejection'
            marker.write_text('previous candidate')
            protected = root / 'streams-focus.iinaplugin' / 'Info.json'
            protected.write_text(json.dumps({'identifier': 'local.iina.streams.dev'}))
            with self.assertRaises(ValueError):
                BUILD.build(root)
            self.assertTrue(marker.exists())
            self.assertEqual(json.loads(protected.read_text())['identifier'], 'local.iina.streams.dev')

    def test_failed_archive_creation_preserves_owned_previous_archives(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            result = BUILD.build(root)
            before = {item['name']: (root / item['name']).read_bytes() for item in result['packages']}
            with mock.patch.object(BUILD.zipfile.ZipFile, 'writestr', side_effect=RuntimeError('synthetic writer failure')):
                with self.assertRaises(RuntimeError):
                    BUILD.build(root)
            for name, data in before.items():
                self.assertEqual((root / name).read_bytes(), data)
            self.assertFalse(any(path.name.startswith('.package-') for path in root.iterdir()))

    def test_owned_qa_manifest_remains_rebuildable_without_normal_archives(self):
        with tempfile.TemporaryDirectory() as temp:
            qa = {'variant': 'focus', 'source': {'kind': 'local-test', 'url': '/synthetic/local.mp4'}}
            first = BUILD.build(temp, qa)
            second = BUILD.build(temp, qa)
            self.assertEqual(first, second)
            self.assertEqual(first['packages'], [])
            self.assertFalse(list(Path(temp).glob('*.iinaplgz')))

if __name__ == '__main__':
    unittest.main()
