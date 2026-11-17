"""Current root-layout IINA Streams build contract (legacy candidate tests are separate)."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('streams_current_builder', ROOT/'scripts/build.py')
BUILD=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILD)

class CurrentBuilderTests(unittest.TestCase):
    def test_beta_identity_archive_integrity_and_embedded_source(self):
        with tempfile.TemporaryDirectory() as temp:
            manifest=BUILD.build(Path(temp),beta=True)
            archive=Path(temp)/manifest['archive']
            self.assertEqual(manifest['identifier'],'local.iina.streams.beta')
            self.assertEqual(manifest['targetVersion'],'0.5.4')
            self.assertEqual(manifest['version'],'0.5.4-beta+'+manifest['buildRef'])
            self.assertTrue(manifest['buildRef'].startswith('g'))
            self.assertIn(manifest['buildRef'],manifest['archive'])
            self.assertEqual(hashlib.sha256(archive.read_bytes()).hexdigest(),manifest['sha256'])
            with zipfile.ZipFile(archive) as zip:
                self.assertIsNone(zip.testzip())
                names=zip.namelist()
                self.assertEqual(len(names),len(set(names)))
                self.assertNotIn('qa-harness.js',names)
                self.assertFalse(any(name.startswith('../') or name.startswith('/') for name in names))
                info=json.loads(zip.read('Info.json'))
                self.assertEqual(info['identifier'],manifest['identifier'])
                self.assertEqual(info['version'],manifest['version'])
                self.assertNotIn('ghRepo',info)
                config=zip.read('config.js').decode()
                self.assertIn('"beta":true',config)
                self.assertIn('"qa":false',config)
                embedded=zip.read('src/embedded-helpers.js').decode()
                self.assertIn('VideoCommentsByOffsetOrCursor',embedded)
                self.assertIn('TWITCH_LOOKBACK_SECONDS',embedded)
                for name in ('runner','media','acquire','replay'):
                    self.assertIn('"'+name+'":{',embedded)

    def test_stable_build_requires_matching_release_tag_and_clean_tree(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'stable'
            with self.assertRaisesRegex(ValueError,'matching release tag'):
                BUILD.build(path,beta=False)
            self.assertFalse(path.exists())
            with mock.patch.object(BUILD,'git_state',return_value=('a'*40,True,{'v0.5.4'})):
                with self.assertRaisesRegex(ValueError,'matching release tag'):
                    BUILD.build(path,beta=False)
            with mock.patch.object(BUILD,'git_state',return_value=('a'*40,False,{'v0.5.2'})):
                with self.assertRaisesRegex(ValueError,'matching release tag'):
                    BUILD.build(path,beta=False)
            with mock.patch.object(BUILD,'git_state',return_value=('a'*40,False,{'v0.5.4'})):
                manifest=BUILD.build(path,beta=False)
            self.assertEqual(manifest['version'],'0.5.4')
            self.assertEqual(manifest['targetVersion'],'0.5.4')
            self.assertEqual(manifest['identifier'],'local.iina.streams')
            with zipfile.ZipFile(path/manifest['archive']) as zip:
                info=json.loads(zip.read('Info.json'))
                self.assertEqual(info['version'],'0.5.4')
                self.assertEqual(info['identifier'],'local.iina.streams')
                self.assertFalse(any(n.endswith('settings.json') or n.startswith('.data/') for n in zip.namelist()))
                self.assertNotIn('qa-harness.js',zip.namelist())

    def test_beta_commit_identifiers_change_without_release_version_bump(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            with mock.patch.object(BUILD,'git_state',return_value=('a'*40,False,set())):
                first=BUILD.build(root/'a',beta=True)
            with mock.patch.object(BUILD,'git_state',return_value=('b'*40,False,set())):
                second=BUILD.build(root/'b',beta=True)
            self.assertEqual(first['targetVersion'],second['targetVersion'])
            self.assertEqual(first['targetVersion'],'0.5.4')
            self.assertNotEqual(first['version'],second['version'])
            self.assertNotEqual(first['archive'],second['archive'])
            self.assertNotEqual(first['sha256'],second['sha256'])
            self.assertEqual(first['version'],'0.5.4-beta+gaaaaaaaa')
            self.assertEqual(second['version'],'0.5.4-beta+gbbbbbbbb')
            self.assertFalse(first['sourceDirty'])

    def test_uncommitted_sources_are_marked_dirty(self):
        with tempfile.TemporaryDirectory() as temp:
            with mock.patch.object(BUILD,'git_state',return_value=('a'*40,True,set())):
                manifest=BUILD.build(Path(temp),beta=True)
            self.assertTrue(manifest['sourceDirty'])
            self.assertEqual(manifest['buildRef'],'gaaaaaaaa.dirty')
            self.assertEqual(manifest['version'],'0.5.4-beta+gaaaaaaaa.dirty')
            self.assertIn('gaaaaaaaa.dirty',manifest['archive'])

    def test_reproducible_zip_even_when_helper_enumeration_order_changes(self):
        with tempfile.TemporaryDirectory() as temp:
            original=Path.glob
            def patched(reverse):
                def enumerate_(path,pattern):
                    rows=list(original(path,pattern))
                    if path==ROOT/'helpers' and pattern=='*.py':
                        rows.sort(key=lambda p:p.name,reverse=reverse)
                    return iter(rows)
                return enumerate_
            with mock.patch.object(Path,'glob',patched(False)):
                a=BUILD.build(Path(temp)/'forward',beta=True)
            with mock.patch.object(Path,'glob',patched(True)):
                b=BUILD.build(Path(temp)/'reverse',beta=True)
            self.assertEqual(a['sha256'],b['sha256'])

    def test_preexisting_beta_archive_is_replaced_only_inside_requested_build_directory(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            sibling=root/'do-not-touch'
            sibling.write_text('preserved')
            out=root/'build'
            one=BUILD.build(out,beta=True)
            two=BUILD.build(out,beta=True)
            self.assertEqual(one['sha256'],two['sha256'])
            self.assertEqual(sibling.read_text(),'preserved')
            self.assertFalse((root/'local.iina.streams.iinaplugin').exists())


if __name__=='__main__': unittest.main()
