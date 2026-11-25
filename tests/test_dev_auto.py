"""Automatic Streams Dev updates (lead, 2026-11-24; operator: "good for automatic dev updates").

Contract for `scripts/dev.py auto` and its git hooks. A commit or merge on `next` builds and stages Streams Dev:
at once when IINA is closed, otherwise queued until IINA quits (IINA reads plugin code at launch, and swapping
files under a running IINA mixes old and new code). Other branches do nothing. Never touches real IINA, the real
stage or the real repository's hooks.
"""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('streams_dev_auto', ROOT / 'scripts/dev.py')
DEV = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DEV)


class AutoDecisionTests(unittest.TestCase):
    def test_decide_builds_only_for_next_and_waits_for_iina(self):
        self.assertEqual(DEV.auto_decision(branch='next', running=False), 'deploy')
        self.assertEqual(DEV.auto_decision(branch='next', running=True), 'queue')
        for branch in ['main', 'beta', 'feat/x', '', None]:
            with self.subTest(branch=branch):
                self.assertEqual(DEV.auto_decision(branch=branch, running=False), 'skip')
                self.assertEqual(DEV.auto_decision(branch=branch, running=True), 'skip')


class AutoRunTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.stage = Path(temp.name) / 'stage'
        self.stage.mkdir()
        self.assertNotEqual(self.stage, DEV.DEFAULT_STAGE)
        self.deploys = []

    def fake_deploy(self, stage, tests=None, qa=False):
        self.deploys.append({'stage': Path(stage), 'qa': qa})
        return {'version': '0.0.0-dev+gtest', 'branch': 'next', 'testsRan': True, 'qa': qa}

    def test_closed_iina_deploys_now_with_the_qa_harness(self):
        result = DEV.auto_run(self.stage, branch='next', running=lambda: False, deploy=self.fake_deploy,
                              sleep=lambda s: self.fail('no wait when IINA is closed'))
        self.assertEqual(result, 'deployed')
        self.assertEqual(self.deploys, [{'stage': self.stage, 'qa': True}])
        self.assertFalse((self.stage / 'pending.json').exists())

    def test_running_iina_queues_then_deploys_once_after_it_quits(self):
        calls = []
        def running():  # running for the first three checks, closed from then on
            calls.append(1)
            return len(calls) <= 3
        waits = []
        result = DEV.auto_run(self.stage, branch='next', running=running, deploy=self.fake_deploy,
                              sleep=waits.append)
        self.assertEqual(result, 'deployed')
        self.assertEqual(len(self.deploys), 1, 'one deploy, after IINA quits')
        self.assertGreaterEqual(len(waits), 2, 'it waited while IINA ran')
        self.assertTrue(all(0 < s <= 60 for s in waits), 'polls at a modest interval')
        self.assertFalse((self.stage / 'pending.json').exists(), 'the queue is cleared after the deploy')

    def test_a_queued_build_is_visible_while_waiting(self):
        seen = []
        def running():
            seen.append((self.stage / 'pending.json').exists())
            return len(seen) < 3
        DEV.auto_run(self.stage, branch='next', running=running, deploy=self.fake_deploy, sleep=lambda s: None)
        self.assertIn(True, seen[1:], 'pending.json exists while the build waits for IINA to quit')

    def test_a_second_waiter_does_not_start_while_one_is_waiting(self):
        (self.stage / 'auto.lock').write_text(json.dumps({'pid': 1}))  # pid 1 (launchd) is always alive
        result = DEV.auto_run(self.stage, branch='next', running=lambda: True, deploy=self.fake_deploy,
                              sleep=lambda s: self.fail('a second waiter must not wait'))
        self.assertEqual(result, 'already-waiting')
        self.assertEqual(self.deploys, [])
        self.assertTrue((self.stage / 'pending.json').exists(), 'the newer commit is still queued for the waiter')

    def test_a_stale_lock_from_a_dead_process_is_replaced(self):
        (self.stage / 'auto.lock').write_text(json.dumps({'pid': 999999}))
        result = DEV.auto_run(self.stage, branch='next', running=lambda: False, deploy=self.fake_deploy, sleep=lambda s: None)
        self.assertEqual(result, 'deployed')

    def test_it_gives_up_after_the_wait_limit_and_leaves_the_build_queued(self):
        result = DEV.auto_run(self.stage, branch='next', running=lambda: True, deploy=self.fake_deploy,
                              sleep=lambda s: None, max_wait_seconds=60)
        self.assertEqual(result, 'gave-up')
        self.assertEqual(self.deploys, [])
        self.assertTrue((self.stage / 'pending.json').exists())
        self.assertFalse((self.stage / 'auto.lock').exists(), 'the lock is released')

    def test_a_failed_deploy_is_logged_and_does_not_raise(self):
        def failing(stage, tests=None, qa=False):
            raise RuntimeError('tests failed')
        result = DEV.auto_run(self.stage, branch='next', running=lambda: False, deploy=failing, sleep=lambda s: None)
        self.assertEqual(result, 'failed')
        self.assertIn('tests failed', (self.stage / 'auto.log').read_text())

    def test_other_branches_do_nothing(self):
        result = DEV.auto_run(self.stage, branch='feat/x', running=lambda: False, deploy=self.fake_deploy,
                              sleep=lambda s: self.fail('no wait'))
        self.assertEqual(result, 'skipped')
        self.assertEqual(self.deploys, [])


class HookInstallTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.hooks = Path(temp.name) / 'hooks'
        self.hooks.mkdir()

    def test_installs_post_commit_and_post_merge_that_run_auto_in_the_background(self):
        DEV.install_auto_hooks(self.hooks)
        for name in ['post-commit', 'post-merge']:
            with self.subTest(hook=name):
                hook = self.hooks / name
                self.assertTrue(hook.exists())
                self.assertTrue(hook.stat().st_mode & 0o111, 'executable')
                text = hook.read_text()
                self.assertIn('scripts/dev.py', text)
                self.assertIn('auto', text)
                self.assertIn('&', text, 'runs detached so the commit returns at once')

    def test_install_is_idempotent_and_keeps_a_foreign_hook(self):
        foreign = self.hooks / 'post-commit'
        foreign.write_text('#!/bin/sh\necho someone-else\n')
        foreign.chmod(0o755)
        DEV.install_auto_hooks(self.hooks)
        DEV.install_auto_hooks(self.hooks)
        text = foreign.read_text()
        self.assertIn('echo someone-else', text, 'an existing hook is kept')
        self.assertEqual(text.count('scripts/dev.py'), 1, 'installed once')


if __name__ == '__main__':
    unittest.main()
