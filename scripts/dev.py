#!/usr/bin/env python3
"""Linked development workflow for Streams Dev (`local.iina.streams.dev`).

One-time:  dev.py deploy && dev.py link   (then enable "Streams Dev" in IINA › Settings › Plugins)
Per change: dev.py deploy                 (then quit and reopen IINA)

`deploy` runs the full JS + Python suites, builds the dev variant from this worktree,
and swaps it into a fixed stage directory. The IINA plugins folder holds a single
symlink to that stage, so any worktree can deploy without relinking. The previous
stage is kept for `rollback`. Nothing here enables, reloads, launches or quits IINA,
and nothing touches the stable or beta identities.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
DEV_ID = 'local.iina.streams.dev'
LINK_NAME = DEV_ID + '.iinaplugin-dev'
DEFAULT_PLUGINS = Path.home() / 'Library/Application Support/com.colliderli.iina/plugins'
DEFAULT_STAGE = Path.home() / 'Library/Application Support/iina-streams-dev'
TEST_COMMANDS = [
    ['node', '--test', 'tests/*.test.js'],
    [sys.executable, '-B', '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py'],
]


class DevError(Exception):
    """A refusal. The message says what was left untouched."""


def _load_builder():
    spec = importlib.util.spec_from_file_location('streams_builder', ROOT / 'scripts/build.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run_tests():
    """Run both suites from ROOT; return True only if every suite passes."""
    for command in TEST_COMMANDS:
        # node --test expands its own globs on Node >= 21; a shell keeps older Nodes working too.
        shell = command[0] == 'node'
        cmd = ' '.join(command) if shell else command
        print('$ ' + (cmd if shell else ' '.join(command)), flush=True)
        if subprocess.run(cmd, cwd=ROOT, shell=shell).returncode != 0:
            return False
    return True


def _git(*args):
    try:
        return subprocess.check_output(['git', '-C', str(ROOT), *args], text=True, stderr=subprocess.DEVNULL).strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def _read_build(path):
    try:
        return json.loads((path / 'BUILD.json').read_text())
    except (OSError, ValueError):
        return None


def _owned_stage(stage):
    """A stage dir is ours if it is absent or holds only our current/previous bundles."""
    if not stage.exists():
        return True
    if stage.is_symlink() or not stage.is_dir():
        return False
    return all(p.name in {'current', 'previous', '.DS_Store'} or p.name.startswith('.incoming-') for p in stage.iterdir())


def deploy(stage=DEFAULT_STAGE, tests=run_tests, qa=False):
    stage = Path(stage)
    if not _owned_stage(stage):
        raise DevError(f'{stage} holds files this tool did not create; nothing was changed.')
    if tests is not None and not tests():
        raise DevError('Tests failed; the staged dev build was left unchanged.')
    builder = _load_builder()
    stage.mkdir(parents=True, exist_ok=True)
    for stale in stage.glob('.incoming-*'):  # left by an interrupted deploy
        shutil.rmtree(stale, ignore_errors=True)
    with tempfile.TemporaryDirectory(prefix='streams-dev-build-') as temp:
        manifest = builder.build(temp, dev=True, qa=True) if qa else builder.build(temp, dev=True)
        incoming = stage / f'.incoming-{os.getpid()}'
        if incoming.exists():
            shutil.rmtree(incoming)
        shutil.copytree(Path(temp) / 'streams-dev.iinaplugin', incoming)
    record = dict(manifest)
    record.update({
        'branch': _git('rev-parse', '--abbrev-ref', 'HEAD'),
        'worktree': str(ROOT),
        'testsRan': tests is not None,
        'stagedAt': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
    })
    (incoming / 'BUILD.json').write_text(json.dumps(record, indent=2) + '\n')
    current, previous = stage / 'current', stage / 'previous'
    if previous.exists():
        shutil.rmtree(previous)
    if current.exists():
        current.rename(previous)
    incoming.rename(current)
    return record


def rollback(stage=DEFAULT_STAGE):
    stage = Path(stage)
    current, previous = stage / 'current', stage / 'previous'
    if not previous.is_dir():
        raise DevError('No previous dev build is staged; nothing was changed.')
    swap = stage / f'.incoming-{os.getpid()}'
    current.rename(swap)
    previous.rename(current)
    swap.rename(previous)
    return _read_build(current)


def _identifier_of(path):
    try:
        return json.loads((path / 'Info.json').read_text()).get('identifier')
    except (OSError, ValueError, AttributeError):
        return None


def link(plugins=DEFAULT_PLUGINS, stage=DEFAULT_STAGE):
    plugins, target = Path(plugins), Path(stage) / 'current'
    if not plugins.is_dir():
        raise DevError(f'IINA plugins folder not found at {plugins}; nothing was changed.')
    if not (target / 'Info.json').is_file() or _identifier_of(target) != DEV_ID:
        raise DevError('No dev build is staged yet. Run `dev.py deploy` first; nothing was changed.')
    dest = plugins / LINK_NAME
    if dest.is_symlink() and Path(os.readlink(dest)) == target:
        return 'already-linked'
    if dest.exists() or dest.is_symlink():
        raise DevError(f'{dest} exists and is not this tool\'s link; it was left untouched.')
    for entry in plugins.iterdir():
        if entry.suffix in {'.iinaplugin', '.iinaplugin-dev'} and _identifier_of(entry.resolve()) == DEV_ID:
            raise DevError(f'{entry.name} already provides {DEV_ID}; IINA would rename one of them. Nothing was changed.')
    dest.symlink_to(target)
    return 'linked'


def unlink(plugins=DEFAULT_PLUGINS, stage=DEFAULT_STAGE):
    dest, target = Path(plugins) / LINK_NAME, Path(stage) / 'current'
    if not dest.is_symlink() and not dest.exists():
        return 'not-linked'
    if not dest.is_symlink() or Path(os.readlink(dest)) != target:
        raise DevError(f'{dest} is not this tool\'s link; it was left untouched.')
    dest.unlink()
    return 'unlinked'


def _enabled_pref():
    try:
        out = subprocess.run(['defaults', 'read', 'com.colliderli.iina', 'PluginEnabled.' + DEV_ID],
                             capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        return 'unknown'
    return {'1': 'enabled', '0': 'disabled'}.get(out.stdout.strip(), 'unset (IINA treats as disabled)')


def status(plugins=DEFAULT_PLUGINS, stage=DEFAULT_STAGE, read_prefs=True):
    dest, target = Path(plugins) / LINK_NAME, Path(stage) / 'current'
    staged = _read_build(target)
    head = _git('rev-parse', 'HEAD')
    if dest.is_symlink():
        linked = 'linked' if Path(os.readlink(dest)) == target else 'foreign link'
    else:
        linked = 'foreign item' if dest.exists() else 'not linked'
    return {
        'link': linked,
        'enabled': _enabled_pref() if read_prefs else 'not read',
        'staged': staged and {k: staged.get(k) for k in ('version', 'branch', 'sourceCommit', 'sourceDirty', 'testsRan', 'stagedAt', 'worktree', 'qa')},
        'thisWorktreeHead': head,
        'stagedMatchesHead': bool(staged and head and staged.get('sourceCommit') == head and not staged.get('sourceDirty')),
        'previousStaged': bool(_read_build(Path(stage) / 'previous')),
    }


RELOAD_HINT = ('Next: quit IINA (Cmd-Q) and reopen it. Do NOT use Plugin › Reload All Plugins: on IINA 1.5.1 '
               'it crashed IINA on 2026-11-22 (trap in JavascriptAPISidebarView.loadFile during the re-emitted events).')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('command', choices=['deploy', 'link', 'unlink', 'status', 'rollback'])
    parser.add_argument('--plugins-dir', default=str(DEFAULT_PLUGINS))
    parser.add_argument('--stage-dir', default=str(DEFAULT_STAGE))
    parser.add_argument('--qa', action='store_true',
                        help='deploy only: package the native QA harness (dev identity only; drive it with qa/control.py).')
    parser.add_argument('--skip-tests', action='store_true', help='Stage without running the suites (marked testsRan=false).')
    args = parser.parse_args(argv)
    custom_plugins = Path(args.plugins_dir) != DEFAULT_PLUGINS
    if args.qa and args.command != 'deploy':
        parser.error('--qa applies to deploy only')
    try:
        if args.command == 'deploy':
            record = deploy(args.stage_dir, tests=None if args.skip_tests else run_tests, qa=args.qa)
            print(f"Staged {record['version']} from {record['branch']} (tests {'passed' if record['testsRan'] else 'SKIPPED'}"
                  f"{', QA harness included' if record.get('qa') else ''}).")
            print(RELOAD_HINT)
        elif args.command == 'rollback':
            record = rollback(args.stage_dir)
            print(f"Restored {record and record.get('version')}. " + RELOAD_HINT)
        elif args.command == 'link':
            result = link(args.plugins_dir, args.stage_dir)
            print(f'{result}: {Path(args.plugins_dir) / LINK_NAME} -> {Path(args.stage_dir) / "current"}')
            if result == 'linked':
                print('IINA sees it after a relaunch (not Reload All Plugins, which crashed IINA 1.5.1). Then enable "Streams Dev" in '
                      'Settings › Plugins (disable Streams Beta to avoid two Streams menus). Streams Dev has '
                      'its own data and Keychain entry: re-enter the Twitch Client ID and sign in once.')
        elif args.command == 'unlink':
            print(unlink(args.plugins_dir, args.stage_dir) + '. IINA drops it after a relaunch.')
        else:
            print(json.dumps(status(args.plugins_dir, args.stage_dir, read_prefs=not custom_plugins), indent=2))
    except DevError as error:
        print('Refused: ' + str(error), file=sys.stderr)
        return 3
    return 0


if __name__ == '__main__':
    sys.exit(main())
