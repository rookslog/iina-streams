"""Guarded candidate-link tests. Temporary folders stand in for IINA's plugin directory."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'manage-candidates.py'
SPEC = importlib.util.spec_from_file_location('manage_candidates', SCRIPT)
manager = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(manager)


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name).resolve()
        self.source, self.plugins = self.base / 'built', self.base / 'plugins'
        self.source.mkdir()
        self.plugins.mkdir()
        for variant in ('unified', 'focus'):
            self.make_package(variant)
        self.protected = {}
        for name, identifier in [('stable.iinaplugin', 'local.iina.streams'),
                                 ('plugin-dev.iinaplugin-dev', 'local.iina.streams.dev'),
                                 ('preview.iinaplugin', 'local.iina.streams.preview'),
                                 ('streams-qa.iinaplugin-dev', 'local.iina.streams.qa')]:
            folder = self.base / ('original-' + name)
            folder.mkdir()
            (folder / 'Info.json').write_text(json.dumps({'identifier': identifier}))
            (folder / 'keep.txt').write_text('preserve ' + identifier)
            (self.plugins / name).symlink_to(folder, target_is_directory=True)
            self.protected[name] = (str(folder), (folder / 'Info.json').read_bytes(), (folder / 'keep.txt').read_bytes())

    def tearDown(self):
        for name, (target, info, kept) in self.protected.items():
            self.assertEqual(os.readlink(self.plugins / name), target)
            self.assertEqual(Path(target, 'Info.json').read_bytes(), info)
            self.assertEqual(Path(target, 'keep.txt').read_bytes(), kept)
        self.tmp.cleanup()

    def make_package(self, variant):
        folder = self.source / ('streams-' + variant + '.iinaplugin')
        folder.mkdir()
        identifier = 'local.iina.streams.candidate.' + variant
        (folder / 'Info.json').write_text(json.dumps({'identifier': identifier, 'name': 'Streams ' + variant.title() + ' Candidate',
                                                   'version': '0.5.0', 'entry': 'main.js', 'globalEntry': 'global.js'}))
        (folder / 'config.js').write_text('"use strict";\nmodule.exports=' + json.dumps({'identifier':identifier,'variant':variant,'qa':False}) + ';\n')
        (folder / 'main.js').write_text('// synthetic built entry')
        (folder / 'global.js').write_text('// synthetic built global entry')
        (folder / 'src').mkdir()
        (folder / 'src' / 'embedded-helpers.js').write_text('// synthetic embedded source')
        return folder

    def call(self, action, variant='all', dry_run=False):
        return manager.manage(action, str(self.plugins), str(self.source), variant=variant, dry_run=dry_run)

    def link(self, variant):
        return self.plugins / ('streams-' + variant + '.iinaplugin-dev')

    def test_dry_run_is_reviewable_and_does_not_create_links_or_other_files(self):
        before = sorted(p.name for p in self.plugins.iterdir())
        result = self.call('install', dry_run=True)
        self.assertTrue(result['ok'])
        self.assertTrue(result['dryRun'])
        self.assertEqual([item['operation'] for item in result['links']], ['link', 'link'])
        self.assertEqual(sorted(p.name for p in self.plugins.iterdir()), before)

    def test_install_and_rollback_only_the_two_exact_candidate_links(self):
        result = self.call('install')
        self.assertTrue(result['ok'])
        for variant in ('unified', 'focus'):
            self.assertEqual(os.readlink(self.link(variant)), str(self.source / ('streams-' + variant + '.iinaplugin')))
        second = self.call('install')
        self.assertEqual([item['operation'] for item in second['links']], ['none', 'none'])
        status = self.call('status')
        self.assertEqual([item['state'] for item in status['links']], ['linked', 'linked'])
        preview = self.call('rollback', dry_run=True)
        self.assertEqual([item['operation'] for item in preview['links']], ['unlink', 'unlink'])
        self.assertTrue(self.link('unified').is_symlink())
        removed = self.call('rollback')
        self.assertTrue(removed['ok'])
        self.assertFalse(os.path.lexists(self.link('unified')))
        self.assertFalse(os.path.lexists(self.link('focus')))
        self.assertTrue((self.source / 'streams-unified.iinaplugin' / 'main.js').is_file())
        self.assertEqual([item['operation'] for item in self.call('rollback')['links']], ['none', 'none'])

    def test_selecting_one_variant_does_not_install_the_other(self):
        self.call('install', variant='focus')
        self.assertTrue(self.link('focus').is_symlink())
        self.assertFalse(self.link('unified').exists())
        self.call('rollback', variant='focus')

    def test_preflight_refuses_foreign_file_directory_or_symlink_without_partial_install(self):
        for mode in ('file', 'directory', 'foreign-link', 'relative-link'):
            conflict = self.link('focus')
            if mode == 'file': conflict.write_text('preserve')
            elif mode == 'directory': conflict.mkdir()
            elif mode == 'foreign-link': conflict.symlink_to(self.base / 'foreign')
            else: conflict.symlink_to(os.path.relpath(self.source / 'streams-focus.iinaplugin', self.plugins))
            with self.subTest(mode=mode), self.assertRaises(manager.InstallError):
                self.call('install')
            self.assertFalse(os.path.lexists(self.link('unified')))
            if mode == 'directory': conflict.rmdir()
            else: conflict.unlink()

    def test_rollback_refuses_a_changed_foreign_link_and_removes_nothing_else(self):
        self.call('install')
        self.link('focus').unlink()
        self.link('focus').symlink_to(self.base / 'somebody-elses-folder')
        with self.assertRaises(manager.InstallError):
            self.call('rollback')
        self.assertTrue(self.link('unified').is_symlink())
        self.assertEqual(os.readlink(self.link('focus')), str(self.base / 'somebody-elses-folder'))

    def test_only_exact_candidate_identifiers_are_accepted(self):
        manifest = self.source / 'streams-unified.iinaplugin' / 'Info.json'
        original = json.loads(manifest.read_text())
        for identifier in ['local.iina.streams', 'local.iina.streams.dev', 'local.iina.streams.preview',
                           'local.iina.streams.qa', 'local.iina.streams.candidate.focus', 'other.plugin']:
            value = dict(original, identifier=identifier)
            manifest.write_text(json.dumps(value))
            with self.subTest(identifier=identifier), self.assertRaises(manager.InstallError):
                self.call('install')
            self.assertFalse(os.path.lexists(self.link('unified')))
        manifest.write_text(json.dumps(original))

    def test_source_links_and_qa_configuration_are_rejected(self):
        package = self.source / 'streams-unified.iinaplugin'
        config = package / 'config.js'
        saved = config.read_text()
        config.write_text('"use strict";\nmodule.exports={"identifier":"local.iina.streams.candidate.unified","variant":"unified","qa":{"source":{}}};\n')
        with self.assertRaises(manager.InstallError): self.call('install')
        config.write_text(saved)
        (package / 'main.js').unlink()
        (package / 'main.js').symlink_to(self.base / 'external-code')
        with self.assertRaises(manager.InstallError): self.call('install')
        self.assertFalse(os.path.lexists(self.link('unified')))

    def test_a_duplicate_candidate_identity_at_another_plugin_path_is_not_adopted(self):
        duplicate = self.plugins / 'existing-release.iinaplugin'
        duplicate.mkdir()
        (duplicate / 'Info.json').write_text(json.dumps({'identifier':'local.iina.streams.candidate.unified'}))
        with self.assertRaises(manager.InstallError) as error:
            self.call('install')
        self.assertEqual(error.exception.code, 'DUPLICATE_ID')
        self.assertFalse(self.link('unified').exists())
        self.assertTrue(duplicate.is_dir())

    def test_rollback_removes_only_an_exact_dangling_owned_candidate_link(self):
        target = self.source / 'streams-focus.iinaplugin'
        # Renaming is only fixture setup; the utility itself never removes a tree.
        target.rename(self.base / 'moved-focus')
        self.link('focus').symlink_to(target)
        result = self.call('rollback', variant='focus')
        self.assertFalse(os.path.lexists(self.link('focus')))
        self.assertFalse(result['links'][0]['identityVerified'])
        self.assertTrue((self.base / 'moved-focus' / 'main.js').exists())

    def test_failed_second_link_rolls_back_only_the_first_new_link(self):
        real = os.symlink
        def symlink(target, name, **kwargs):
            if str(name).endswith('streams-focus.iinaplugin-dev'):
                raise PermissionError('synthetic failure')
            return real(target, name, **kwargs)
        with mock.patch.object(manager.os, 'symlink', side_effect=symlink):
            with self.assertRaises(manager.InstallError): self.call('install')
        self.assertFalse(os.path.lexists(self.link('unified')))
        self.assertFalse(os.path.lexists(self.link('focus')))

    def test_fresh_candidate_builder_output_passes_install_and_rollback(self):
        spec = importlib.util.spec_from_file_location('candidate_builder_for_install', SCRIPT.parent / 'build-candidates.py')
        builder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(builder)
        built = self.base / 'fresh-built'
        builder.build(built)
        result = manager.manage('install', str(self.plugins), str(built))
        self.assertTrue(result['ok'])
        self.assertEqual([r['identityVerified'] for r in result['links']], [True, True])
        manager.manage('rollback', str(self.plugins), str(built))
        self.assertFalse(os.path.lexists(self.link('unified')))
        self.assertFalse(os.path.lexists(self.link('focus')))

    def test_explicit_action_and_plugin_directory_are_required(self):
        for args in [[], ['install'], ['--plugins-dir', str(self.plugins)]]:
            completed = subprocess.run([sys.executable, '-B', str(SCRIPT), *args],
                                       capture_output=True, timeout=4)
            self.assertNotEqual(completed.returncode, 0)
            self.assertFalse(json.loads(completed.stdout)['ok'])
            self.assertEqual(completed.stderr, b'')
        with self.assertRaises(manager.InstallError): manager.manage('install', 'relative/plugins', str(self.source))


if __name__ == '__main__':
    unittest.main()
