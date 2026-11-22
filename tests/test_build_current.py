"""Current root-layout IINA Streams build contract (legacy candidate tests are separate)."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('streams_current_builder', ROOT/'scripts/build.py')
BUILD=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILD)
VERSION=json.loads((ROOT/'Info.json').read_text())['version']  # the next release, per D-020/D-021
TAG='v'+VERSION

class CurrentBuilderTests(unittest.TestCase):
    def test_beta_identity_archive_integrity_and_embedded_source(self):
        with tempfile.TemporaryDirectory() as temp:
            manifest=BUILD.build(Path(temp),beta=True)
            archive=Path(temp)/manifest['archive']
            self.assertEqual(manifest['identifier'],'local.iina.streams.beta')
            self.assertEqual(manifest['targetVersion'],VERSION)
            self.assertEqual(manifest['version'],VERSION+'-beta+'+manifest['buildRef'])
            self.assertTrue(manifest['buildRef'].startswith('g'))
            self.assertIn(manifest['buildRef'],manifest['archive'])
            self.assertEqual(hashlib.sha256(archive.read_bytes()).hexdigest(),manifest['sha256'])
            with zipfile.ZipFile(archive) as zip:
                self.assertIsNone(zip.testzip())
                names=zip.namelist()
                self.assertEqual(len(names),len(set(names)))
                self.assertNotIn('qa-harness.js',names)
                self.assertFalse(any(Path(name).name == 'qa-harness.js' for name in names))
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
            # Mocked, not the real checkout: on a release tag's own CI run HEAD is tagged and clean,
            # so an unmocked call would build successfully (the v0.5.4 tag CI, 2026-11-22).
            with mock.patch.object(BUILD,'git_state',return_value=('a'*40,False,set())):
                with self.assertRaisesRegex(ValueError,'matching release tag'):
                    BUILD.build(path,beta=False)
            self.assertFalse(path.exists())
            with mock.patch.object(BUILD,'git_state',return_value=('a'*40,True,{TAG})):
                with self.assertRaisesRegex(ValueError,'matching release tag'):
                    BUILD.build(path,beta=False)
            with mock.patch.object(BUILD,'git_state',return_value=('a'*40,False,{'v0.5.2'})):
                with self.assertRaisesRegex(ValueError,'matching release tag'):
                    BUILD.build(path,beta=False)
            with mock.patch.object(BUILD,'git_state',return_value=('a'*40,False,{TAG})):
                manifest=BUILD.build(path,beta=False)
            self.assertEqual(manifest['version'],VERSION)
            self.assertEqual(manifest['targetVersion'],VERSION)
            self.assertEqual(manifest['identifier'],'local.iina.streams')
            with zipfile.ZipFile(path/manifest['archive']) as zip:
                info=json.loads(zip.read('Info.json'))
                self.assertEqual(info['version'],VERSION)
                self.assertEqual(info['identifier'],'local.iina.streams')
                self.assertFalse(any(n.endswith('settings.json') or n.startswith('.data/') for n in zip.namelist()))
                self.assertNotIn('qa-harness.js',zip.namelist())
                self.assertFalse(any(Path(name).name == 'qa-harness.js' for name in zip.namelist()))
                self.assertRegex(zip.read('config.js').decode(), r'["\']?qa["\']?\s*:\s*false\b')

    def test_dev_build_packages_qa_only_when_opted_in(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            plain = BUILD.build(root / 'plain', dev=True)
            with zipfile.ZipFile(root / 'plain' / plain['archive']) as package:
                self.assertIn('"qa":false', package.read('config.js').decode())
                self.assertFalse(any(Path(name).name == 'qa-harness.js' for name in package.namelist()))

            output = root / 'with-qa'
            result = subprocess.run(
                [sys.executable, '-B', str(ROOT / 'scripts/build.py'), '--dev', '--qa', '--output', str(output)],
                cwd=ROOT,
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertEqual(result.returncode, 0, 'The build CLI must accept --qa with --dev')
            manifest = json.loads((output / 'build-manifest.json').read_text())
            with zipfile.ZipFile(output / manifest['archive']) as package:
                info = json.loads(package.read('Info.json'))
                self.assertEqual(info['identifier'], 'local.iina.streams.dev')
                config = package.read('config.js').decode()
                runtime = json.loads(config.split('module.exports', 1)[1].partition('=')[2].strip().removesuffix(';'))
                qa = runtime.get('qa')
                self.assertTrue(qa is True or isinstance(qa, dict), 'The archive must enable config.qa')
                self.assertIn('qa-harness.js', package.namelist(), 'main.js requires the harness at the bundle root')

    def test_beta_commit_identifiers_change_without_release_version_bump(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            with mock.patch.object(BUILD,'git_state',return_value=('a'*40,False,set())):
                first=BUILD.build(root/'a',beta=True)
            with mock.patch.object(BUILD,'git_state',return_value=('b'*40,False,set())):
                second=BUILD.build(root/'b',beta=True)
            self.assertEqual(first['targetVersion'],second['targetVersion'])
            self.assertEqual(first['targetVersion'],VERSION)
            self.assertNotEqual(first['version'],second['version'])
            self.assertNotEqual(first['archive'],second['archive'])
            self.assertNotEqual(first['sha256'],second['sha256'])
            self.assertEqual(first['version'],VERSION+'-beta+gaaaaaaaa')
            self.assertEqual(second['version'],VERSION+'-beta+gbbbbbbbb')
            self.assertFalse(first['sourceDirty'])

    def test_uncommitted_sources_are_marked_dirty(self):
        with tempfile.TemporaryDirectory() as temp:
            with mock.patch.object(BUILD,'git_state',return_value=('a'*40,True,set())):
                manifest=BUILD.build(Path(temp),beta=True)
            self.assertTrue(manifest['sourceDirty'])
            self.assertEqual(manifest['buildRef'],'gaaaaaaaa.dirty')
            self.assertEqual(manifest['version'],VERSION+'-beta+gaaaaaaaa.dirty')
            self.assertIn('gaaaaaaaa.dirty',manifest['archive'])

    def test_reproducible_zip_even_when_helper_enumeration_order_changes(self):
        with tempfile.TemporaryDirectory() as temp:
            original=Path.glob
            def patched(reverse):
                def enumerate_(path,pattern,*args,**kwargs):
                    # Python 3.13's rglob delegates to glob with keyword arguments.
                    rows=list(original(path,pattern,*args,**kwargs))
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
