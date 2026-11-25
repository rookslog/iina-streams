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
from contextlib import contextmanager
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import shutil
import shlex
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
    return all(p.name in {'current', 'previous', '.DS_Store'} or p.name.startswith('.incoming-')
               or (p.name in {'pending.json', 'auto.lock', 'auto.log'} and p.is_file() and not p.is_symlink())
               for p in stage.iterdir())


def deploy(stage=DEFAULT_STAGE, tests=run_tests, qa=False, before_swap=None):
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
    if before_swap is not None:
        try:
            before_swap(record)
        except Exception:
            shutil.rmtree(incoming)
            raise
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


LIVE_WARNING = ('Warning: IINA is running with Streams Dev enabled. Open windows keep the old build, and a window '
                'opened now may load a mix of old and new files. Quit IINA (Cmd-Q) and reopen it before using Streams Dev. '
                'Watch with Streams Beta, not Dev (docs/RELEASE.md, "Who runs which copy").')


def _iina_running():
    try:
        out = subprocess.run(['pgrep', '-x', 'IINA'], capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        return True  # Unknown process state is not permission to replace live files.
    return out.returncode != 1  # pgrep: 1 means no matching process.


def auto_decision(branch, running):
    if branch != 'next':
        return 'skip'
    return 'queue' if running else 'deploy'


@contextmanager
def _auto_guard(stage):
    """Serialize short queue/lease updates, not the wait or the build."""
    fd = os.open(stage, os.O_RDONLY)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        os.close(fd)


def _lock_alive(lock):
    try:
        pid = json.loads(lock.read_text())['pid']
        if not isinstance(pid, int) or pid <= 0:
            return False
        os.kill(pid, 0)
    except (FileNotFoundError, ProcessLookupError, ValueError, KeyError, TypeError):
        return False
    except PermissionError:
        return True
    return True


def _auto_log(stage, message):
    with (stage / 'auto.log').open('a') as log:
        print(f'{time.strftime("%Y-%m-%dT%H:%M:%S%z")} {message}', file=log)


class _AutoRetry(Exception):
    """The conditions for staging changed while building."""


def auto_run(stage, branch, running, deploy, sleep, max_wait_seconds=12*3600):
    """Coalesce next commits and stage the latest checkout once IINA is closed."""
    if auto_decision(branch, False) == 'skip':
        return 'skipped'
    owned = acquired = False
    try:
        stage = Path(stage)
        if stage.is_symlink() or (stage.exists() and not stage.is_dir()):
            raise DevError(f'{stage} is not an owned stage; nothing was changed.')
        stage.mkdir(parents=True, exist_ok=True)
        pending, lock = stage / 'pending.json', stage / 'auto.lock'
        with _auto_guard(stage):
            if not _owned_stage(stage):
                raise DevError(f'{stage} is not an owned stage; nothing was changed.')
            owned = True
            pending.write_text(json.dumps({'branch': branch, 'requestedAt': time.time_ns()}) + '\n')
            if _lock_alive(lock):
                _auto_log(stage, 'Already waiting; pending build updated.')
                return 'already-waiting'
            lock.write_text(json.dumps({'pid': os.getpid()}) + '\n')
            acquired = True

        waited = 0
        _auto_log(stage, 'Automatic update requested.')
        while True:
            while running():
                if waited >= max_wait_seconds:
                    _auto_log(stage, 'Wait limit reached; build remains pending.')
                    return 'gave-up'
                interval = min(10, max_wait_seconds - waited)
                sleep(interval)
                waited += interval
            with _auto_guard(stage):
                request = pending.read_text()
            try:
                deploy(stage, qa=True)
            except _AutoRetry as error:
                _auto_log(stage, str(error))
                if waited >= max_wait_seconds:
                    return 'gave-up'
                interval = min(10, max_wait_seconds - waited)
                sleep(interval)
                waited += interval
                continue
            with _auto_guard(stage):
                if pending.read_text() != request:
                    # Another commit arrived during the build, not just while waiting.
                    continue
                pending.unlink()
                lock.unlink()
                acquired = False
            _auto_log(stage, 'Deployed Streams Dev with the QA harness.')
            return 'deployed'
    except Exception as error:
        try:
            if owned:
                _auto_log(stage, f'Automatic update failed: {error}')
            else:
                print(f'Automatic update failed: {error}', file=sys.stderr)
        except Exception:
            pass
        return 'failed'
    finally:
        if acquired:
            try:
                with _auto_guard(stage):
                    lock.unlink(missing_ok=True)
            except OSError:
                pass  # The next invocation can recover a dead PID's lock.


def _auto_deploy(stage, qa=False):
    """Recheck the live conditions immediately before replacing the stage."""
    if _git('rev-parse', '--abbrev-ref', 'HEAD') != 'next':
        raise DevError('Checkout is no longer on next; build remains pending.')
    head = _git('rev-parse', 'HEAD')
    if not head:
        raise DevError('Could not resolve HEAD; build remains pending.')

    def before_swap(record):
        if _git('rev-parse', '--abbrev-ref', 'HEAD') != 'next':
            raise DevError('Checkout is no longer on next; build remains pending.')
        if _iina_running() or head != record.get('sourceCommit') or _git('rev-parse', 'HEAD') != head:
            raise _AutoRetry('IINA reopened or HEAD changed during the build; retrying.')

    return deploy(stage, qa=qa, before_swap=before_swap)


def install_auto_hooks(hooks_dir):
    """Append our marked shell snippet to the shared repository hooks."""
    hooks_dir = Path(hooks_dir)
    hooks_dir.mkdir(parents=True, exist_ok=True)
    marker = '# BEGIN IINA Streams Dev auto update'
    # Git invokes non-bare repository hooks from the triggering worktree root.
    # Resolve that root at invocation, not the worktree that installed the hook.
    snippet = f'''{marker}
if [ "$(git rev-parse --abbrev-ref HEAD)" = next ]; then
    streams_stage={shlex.quote(str(DEFAULT_STAGE))}
    if [ ! -L "$streams_stage" ] && mkdir -p "$streams_stage" && [ ! -L "$streams_stage/auto.log" ]; then
        (
            # Do not inherit a short-lived commit index or worktree override.
            unset $(git rev-parse --local-env-vars)
            exec nohup python3 -B "$(pwd)/scripts/dev.py" auto
        ) >> "$streams_stage/auto.log" 2>&1 < /dev/null &
    fi
fi
# END IINA Streams Dev auto update
'''
    hooks = [(hooks_dir / name) for name in ('post-commit', 'post-merge')]
    originals = [hook.read_text() if hook.exists() else '#!/bin/sh\n' for hook in hooks]
    for hook, existing in zip(hooks, originals):
        if existing.startswith('#!') and marker not in existing:
            interpreter = shlex.split(existing.splitlines()[0][2:])
            if interpreter and Path(interpreter[0]).name == 'env':
                interpreter = interpreter[1:]
                if interpreter and interpreter[0] == '-S':
                    interpreter = interpreter[1:]
            if not interpreter or Path(interpreter[0]).name not in {'sh', 'bash', 'dash', 'zsh', 'ksh'}:
                raise DevError(f'{hook} is not a shell hook; cannot append shell commands safely.')
    for hook, existing in zip(hooks, originals):
        if marker not in existing:
            if hook.exists():
                with hook.open('a') as stream:
                    stream.write('\n\n' + snippet)
            else:
                hook.write_text(existing + '\n' + snippet)
        hook.chmod(hook.stat().st_mode | 0o111)


def live_warning(running=_iina_running, enabled=_enabled_pref):
    """The warning to print after a deploy, or None. Reads only; never touches IINA."""
    return LIVE_WARNING if running() and enabled() == 'enabled' else None


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
        'pending': (Path(stage) / 'pending.json').exists(),
    }


RELOAD_HINT = ('Next: quit IINA (Cmd-Q) and reopen it. Do NOT use Plugin › Reload All Plugins: on IINA 1.5.1 '
               'it crashed IINA on 2026-11-22 (trap in JavascriptAPISidebarView.loadFile during the re-emitted events).')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('command', choices=['deploy', 'link', 'unlink', 'status', 'rollback', 'auto', 'install-hooks'])
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
            if Path(args.stage_dir) == DEFAULT_STAGE:
                warning = live_warning()
                if warning:
                    print(warning, file=sys.stderr)
        elif args.command == 'auto':
            result = auto_run(args.stage_dir, _git('rev-parse', '--abbrev-ref', 'HEAD'),
                              _iina_running, _auto_deploy, time.sleep)
            print(result)
            return 3 if result == 'failed' else 0
        elif args.command == 'install-hooks':
            common_dir = _git('rev-parse', '--git-common-dir')
            if not common_dir:
                raise DevError('Could not locate the repository common directory.')
            hooks = ROOT / common_dir / 'hooks'
            install_auto_hooks(hooks)
            print(f'Installed automatic Dev update hooks in {hooks}.')
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
