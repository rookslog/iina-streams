"""Linked dev workflow contract: tested-only staging, owned links, rollback. Never touches real IINA."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('streams_dev_workflow', ROOT / 'scripts/dev.py')
DEV = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DEV)


class DevWorkflowTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        base = Path(temp.name)
        self.plugins, self.stage = base / 'plugins', base / 'stage'
        self.plugins.mkdir()
        # Defaults must never be the real folders inside tests.
        self.assertNotEqual(self.plugins, DEV.DEFAULT_PLUGINS)
        self.assertNotEqual(self.stage, DEV.DEFAULT_STAGE)

    def deploy(self, tests=None):
        return DEV.deploy(self.stage, tests=tests)

    def test_live_warning_only_when_iina_runs_with_dev_enabled(self):
        self.assertIsNotNone(DEV.live_warning(running=lambda: True, enabled=lambda: 'enabled'))
        self.assertIsNone(DEV.live_warning(running=lambda: True, enabled=lambda: 'disabled'))
        self.assertIsNone(DEV.live_warning(running=lambda: False, enabled=lambda: 'enabled'))
        self.assertIsNone(DEV.live_warning(running=lambda: True, enabled=lambda: 'unknown'))

    def test_deploy_to_a_custom_stage_never_reads_iina(self):
        original = DEV.live_warning
        def fail():
            raise AssertionError('read real IINA state')
        DEV.live_warning = fail
        self.addCleanup(setattr, DEV, 'live_warning', original)
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(DEV.main(['deploy', '--skip-tests', '--stage-dir', str(self.stage)]), 0)

    def test_deploy_stages_dev_identity_with_provenance(self):
        record = self.deploy()
        current = self.stage / 'current'
        info = json.loads((current / 'Info.json').read_text())
        self.assertEqual(info['identifier'], 'local.iina.streams.dev')
        self.assertEqual(info['name'], 'Streams Dev')
        self.assertRegex(info['version'], r'^\d+\.\d+\.\d+-dev\+g[0-9a-f]{8}(\.dirty)?$')
        self.assertNotIn('ghRepo', info)
        self.assertNotIn('ghVersion', info)
        self.assertIn('"dev":true', (current / 'config.js').read_text())
        self.assertTrue((current / 'src/embedded-helpers.js').is_file())
        build = json.loads((current / 'BUILD.json').read_text())
        self.assertEqual(build['version'], info['version'])
        self.assertEqual(build['worktree'], str(ROOT))
        self.assertFalse(build['testsRan'])
        self.assertEqual(record['sourceCommit'], build['sourceCommit'])

    def test_failing_tests_leave_the_stage_untouched(self):
        self.deploy()
        before = (self.stage / 'current/BUILD.json').read_bytes()
        with self.assertRaises(DEV.DevError):
            self.deploy(tests=lambda: False)
        self.assertEqual((self.stage / 'current/BUILD.json').read_bytes(), before)
        self.assertFalse((self.stage / 'previous').exists())

    def test_redeploy_keeps_previous_and_rollback_swaps(self):
        self.deploy()
        (self.stage / 'current/marker').write_text('first')
        self.deploy(tests=lambda: True)
        self.assertEqual((self.stage / 'previous/marker').read_text(), 'first')
        self.assertTrue(json.loads((self.stage / 'current/BUILD.json').read_text())['testsRan'])
        DEV.rollback(self.stage)
        self.assertEqual((self.stage / 'current/marker').read_text(), 'first')
        self.assertFalse((self.stage / 'previous/marker').exists())
        self.assertEqual(sorted(p.name for p in self.stage.iterdir()), ['current', 'previous'])

    def test_foreign_stage_content_is_refused(self):
        self.stage.mkdir()
        (self.stage / 'notes.txt').write_text('mine')
        with self.assertRaises(DEV.DevError):
            self.deploy()
        self.assertEqual([p.name for p in self.stage.iterdir()], ['notes.txt'])

    def test_finder_metadata_and_interrupted_deploys_do_not_block_deploy(self):
        self.deploy()
        (self.stage / '.DS_Store').write_bytes(b'finder')
        (self.stage / '.incoming-99999').mkdir()
        self.deploy()
        self.assertFalse((self.stage / '.incoming-99999').exists())
        self.assertTrue((self.stage / '.DS_Store').exists())
        self.assertTrue((self.stage / 'previous/Info.json').is_file())

    def test_link_is_idempotent_and_points_at_the_fixed_stage(self):
        with self.assertRaises(DEV.DevError):
            DEV.link(self.plugins, self.stage)  # nothing staged yet
        self.deploy()
        self.assertEqual(DEV.link(self.plugins, self.stage), 'linked')
        dest = self.plugins / DEV.LINK_NAME
        self.assertTrue(dest.is_symlink())
        self.assertEqual(Path(os.readlink(dest)), self.stage / 'current')
        self.assertEqual(DEV.link(self.plugins, self.stage), 'already-linked')
        # A redeploy swaps directories behind the link without relinking.
        self.deploy()
        self.assertEqual(json.loads((dest / 'Info.json').read_text())['identifier'], 'local.iina.streams.dev')

    def test_link_refuses_foreign_items_and_duplicate_identities(self):
        self.deploy()
        dest = self.plugins / DEV.LINK_NAME
        dest.write_text('foreign')
        with self.assertRaises(DEV.DevError):
            DEV.link(self.plugins, self.stage)
        self.assertEqual(dest.read_text(), 'foreign')
        dest.unlink()
        duplicate = self.plugins / 'someone-else.iinaplugin'
        duplicate.mkdir()
        (duplicate / 'Info.json').write_text(json.dumps({'identifier': 'local.iina.streams.dev'}))
        with self.assertRaises(DEV.DevError):
            DEV.link(self.plugins, self.stage)
        self.assertFalse(dest.exists() or dest.is_symlink())

    def test_link_ignores_other_streams_identities(self):
        self.deploy()
        for ident in ('local.iina.streams', 'local.iina.streams.beta'):
            folder = self.plugins / (ident + '.iinaplugin')
            folder.mkdir()
            (folder / 'Info.json').write_text(json.dumps({'identifier': ident}))
        self.assertEqual(DEV.link(self.plugins, self.stage), 'linked')
        self.assertEqual(len(list(self.plugins.iterdir())), 3)

    def test_unlink_removes_only_its_own_link(self):
        self.assertEqual(DEV.unlink(self.plugins, self.stage), 'not-linked')
        self.deploy()
        DEV.link(self.plugins, self.stage)
        self.assertEqual(DEV.unlink(self.plugins, self.stage), 'unlinked')
        self.assertTrue((self.stage / 'current/Info.json').is_file(), 'unlink must not delete the staged build')
        elsewhere = self.plugins.parent / 'elsewhere'
        elsewhere.mkdir()
        (self.plugins / DEV.LINK_NAME).symlink_to(elsewhere)
        with self.assertRaises(DEV.DevError):
            DEV.unlink(self.plugins, self.stage)
        self.assertTrue((self.plugins / DEV.LINK_NAME).is_symlink())

    def test_status_reports_link_and_staleness_without_reading_prefs(self):
        self.assertEqual(DEV.status(self.plugins, self.stage, read_prefs=False)['link'], 'not linked')
        self.deploy()
        DEV.link(self.plugins, self.stage)
        state = DEV.status(self.plugins, self.stage, read_prefs=False)
        self.assertEqual(state['link'], 'linked')
        self.assertEqual(state['enabled'], 'not read')
        self.assertEqual(state['staged']['sourceCommit'], state['thisWorktreeHead'])
        self.assertIsInstance(state['stagedMatchesHead'], bool)

    def test_cli_refusal_exits_3(self):
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            code = DEV.main(['link', '--plugins-dir', str(self.plugins), '--stage-dir', str(self.stage)])
        self.assertEqual(code, 3)
        self.assertIn('nothing was changed', err.getvalue())


if __name__ == '__main__':
    unittest.main()
