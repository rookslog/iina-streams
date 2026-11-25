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


def _load_builder(root=ROOT):
    spec = importlib.util.spec_from_file_location('streams_builder', root / 'scripts/build.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run_tests(root=ROOT, output=None):
    """Run both suites from the given source; optionally capture their output."""
    for command in TEST_COMMANDS:
        # node --test expands its own globs on Node >= 21; a shell keeps older Nodes working too.
        shell = command[0] == 'node'
        cmd = ' '.join(command) if shell else command
        line = '$ ' + (cmd if shell else ' '.join(command))
        if output is None:
            print(line, flush=True)
            code = subprocess.run(cmd, cwd=root, shell=shell).returncode
        else:
            output((line + '\n').encode())
            with subprocess.Popen(cmd, cwd=root, shell=shell, stdout=subprocess.PIPE,
                                  stderr=subprocess.STDOUT) as process:
                for chunk in iter(lambda: process.stdout.read1(8192), b''):
                    output(chunk)
                code = process.wait()
        if code != 0:
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
               or (p.name in {'pending.json', 'pending.json.tmp', 'auto.lock', 'auto.log'} and p.is_file() and not p.is_symlink())
               for p in stage.iterdir())


def deploy(stage=DEFAULT_STAGE, tests=run_tests, qa=False, before_swap=None):
    stage = Path(stage)
    with _manual_lock(stage):
        return _deploy_locked(stage, tests, qa, before_swap)


def _deploy_locked(stage, tests, qa, before_swap=None, source=ROOT, branch=None):
    """Build and swap while the caller holds the shared stage lock."""
    stage = Path(stage)
    with _auto_guard(stage):
        _check_owned_stage(stage)
    if tests is not None and not tests():
        raise DevError('Tests failed; the staged dev build was left unchanged.')
    builder = _load_builder(source)
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
        'branch': branch if branch is not None else _git('rev-parse', '--abbrev-ref', 'HEAD'),
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
    if not stage.is_dir():
        raise DevError('No previous dev build is staged; nothing was changed.')
    with _manual_lock(stage):
        return _rollback_locked(stage)


def _rollback_locked(stage):
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


def _prepare_stage(stage):
    if stage.is_symlink() or (stage.exists() and not stage.is_dir()):
        raise DevError(f'{stage} is not an owned stage; nothing was changed.')
    stage.mkdir(parents=True, exist_ok=True)


def _check_owned_stage(stage):
    if not _owned_stage(stage):
        raise DevError(f'{stage} holds files this tool did not create; nothing was changed.')


def _try_stage_lock(stage, mode):
    """Called under the directory guard. The open file owns the lifetime flock."""
    handle = (stage / 'auto.lock').open('a+')
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        handle.close()
        return None
    except Exception:
        handle.close()
        raise
    try:
        handle.seek(0)
        handle.truncate()
        json.dump({'pid': os.getpid(), 'mode': mode}, handle)
        handle.flush()
        return handle
    except Exception:
        handle.close()
        raise


def _release_stage_lock(stage, handle):
    # Keep the directory guard held across unlink and close: no cooperating
    # contender can open a different lock inode while we still own this one.
    try:
        (stage / 'auto.lock').unlink(missing_ok=True)
    finally:
        handle.close()


def _read_json(path):
    try:
        value = json.loads(path.read_text())
        return value if isinstance(value, dict) else None
    except (OSError, ValueError):
        return None


@contextmanager
def _manual_lock(stage):
    _prepare_stage(stage)
    with _auto_guard(stage):
        _check_owned_stage(stage)
        handle = _try_stage_lock(stage, 'manual')
        if handle is None:
            raise DevError('A Dev build or automatic waiter holds the stage lock; nothing was changed.')
    try:
        yield
    finally:
        with _auto_guard(stage):
            _release_stage_lock(stage, handle)


def _write_pending(stage, request, state, reason):
    """Publish one complete request atomically, with queue guard held."""
    updated = {**request, 'state': state, 'reason': reason}
    temp = stage / 'pending.json.tmp'
    temp.write_text(json.dumps(updated) + '\n')
    temp.replace(stage / 'pending.json')
    return updated


LOG_LIMIT = 900_000


def _append_log_locked(stage, data):
    path = stage / 'auto.log'
    with path.open('ab+') as log:
        log.seek(0, os.SEEK_END)
        if log.tell() + len(data) > LOG_LIMIT:
            keep = max(0, LOG_LIMIT - len(data))
            log.seek(max(0, log.tell() - keep))
            tail = log.read(keep)
            log.seek(0)
            log.truncate()
            log.write(tail)
        log.write(data[-LOG_LIMIT:])


def _log_locked(stage, message):
    _append_log_locked(stage, (time.strftime('%Y-%m-%dT%H:%M:%S%z') + ' ' + message + '\n').encode())


def _auto_log(stage, message):
    with _auto_guard(stage):
        _log_locked(stage, message)


class _AutoRetry(Exception):
    """The conditions for staging changed while building."""


def auto_run(stage, branch, running, deploy, sleep, max_wait_seconds=12*3600):
    """Coalesce requests until the sole stage owner can finish the latest one."""
    if auto_decision(branch, False) == 'skip':
        return 'skipped'
    handle = None
    owned = False
    try:
        stage = Path(stage)
        _prepare_stage(stage)
        pending = stage / 'pending.json'
        waited = 0
        with _auto_guard(stage):
            _check_owned_stage(stage)
            owned = True
            _write_pending(stage, {'branch': branch, 'requestedAt': time.time_ns()},
                           'waiting', 'Automatic update requested.')
        while handle is None:
            with _auto_guard(stage):
                if not pending.exists():
                    return 'already-waiting'  # Another owner finished our request.
                handle = _try_stage_lock(stage, 'auto')
                if handle is not None:
                    (stage / 'auto.log').write_bytes(b'')
                    _log_locked(stage, 'Automatic update requested.')
                    break
                lock_info = _read_json(stage / 'auto.lock') or {}
                if lock_info.get('mode') != 'manual':
                    _log_locked(stage, 'Already waiting; pending build updated.')
                    return 'already-waiting'
                request = _read_json(pending)
                if waited >= max_wait_seconds:
                    _write_pending(stage, request, 'failed', 'Wait limit reached while a manual build held the stage.')
                    _log_locked(stage, 'Wait limit reached while a manual build held the stage.')
                    return 'gave-up'
                _write_pending(stage, request, 'waiting', 'Waiting for the manual stage operation.')
            interval = min(10, max_wait_seconds - waited)
            sleep(interval)
            waited += interval

        while True:
            with _auto_guard(stage):
                _write_pending(stage, _read_json(pending), 'waiting', 'Waiting for IINA to quit.')
            while running():
                if waited >= max_wait_seconds:
                    with _auto_guard(stage):
                        _write_pending(stage, _read_json(pending), 'failed', 'Wait limit reached; retry auto.')
                        _log_locked(stage, 'Wait limit reached; build remains pending.')
                        _release_stage_lock(stage, handle)
                        handle = None
                    return 'gave-up'
                interval = min(10, max_wait_seconds - waited)
                sleep(interval)
                waited += interval
            with _auto_guard(stage):
                request = _write_pending(stage, _read_json(pending), 'waiting', 'Building clean HEAD snapshot.')
            error = None
            try:
                deploy(stage, qa=True)
            except _AutoRetry as retry:
                _auto_log(stage, str(retry))
                if waited >= max_wait_seconds:
                    with _auto_guard(stage):
                        _write_pending(stage, _read_json(pending), 'failed', 'Wait limit reached; retry auto.')
                        _release_stage_lock(stage, handle)
                        handle = None
                    return 'gave-up'
                interval = min(10, max_wait_seconds - waited)
                sleep(interval)
                waited += interval
                continue
            except Exception as failure:
                error = failure
            with _auto_guard(stage):
                if error is not None:
                    _log_locked(stage, f'Automatic update failed: {error}')
                latest = _read_json(pending)
                if latest['requestedAt'] != request['requestedAt']:
                    # A newer request must survive both success and failure.
                    continue
                if error is not None:
                    _write_pending(stage, latest, 'failed', str(error))
                    result = 'failed'
                else:
                    pending.unlink()
                    _log_locked(stage, 'Deployed Streams Dev with the QA harness.')
                    result = 'deployed'
                _release_stage_lock(stage, handle)
                handle = None
                return result
    except Exception as error:
        try:
            if owned:
                with _auto_guard(stage):
                    _log_locked(stage, f'Automatic update failed: {error}')
                    if handle is not None and not handle.closed:
                        request = _read_json(pending)
                        if request is not None:
                            _write_pending(stage, request, 'failed', str(error))
                        _release_stage_lock(stage, handle)
                        handle = None
            else:
                print(f'Automatic update failed: {error}', file=sys.stderr)
        except Exception:
            pass
        return 'failed'
    finally:
        if handle is not None and not handle.closed:
            try:
                with _auto_guard(stage):
                    _release_stage_lock(stage, handle)
            except OSError:
                handle.close()  # Kernel releases the flock even after a crash.


def snapshot_head(repo, dest):
    """Copy a pinned HEAD into a detached, independent local checkout.

    Retain Git metadata for version stamps and release metadata tests. The
    temporary clone neither changes the source checkout nor uses its hooks.
    """
    repo, dest = Path(repo).resolve(), Path(dest).resolve()
    head = subprocess.check_output(['git', '-C', str(repo), 'rev-parse', 'HEAD'], text=True).strip()
    subprocess.run(['git', '-c', 'core.hooksPath=/dev/null', 'clone', '--quiet', '--no-checkout',
                    '--no-hardlinks', '--', str(repo), str(dest)], check=True)
    subprocess.run(['git', '-C', str(dest), '-c', 'core.hooksPath=/dev/null', 'checkout', '--quiet',
                    '--detach', head], check=True)
    # The release metadata suite compares against the local main ref.
    if subprocess.run(['git', '-C', str(dest), 'show-ref', '--verify', '--quiet', 'refs/remotes/origin/main']).returncode == 0:
        subprocess.run(['git', '-C', str(dest), 'branch', '-f', 'main', 'refs/remotes/origin/main'], check=True,
                       stdout=subprocess.DEVNULL)
    return head


def _auto_deploy(stage, qa=False):
    """Test and stage an immutable commit snapshot, not the live checkout."""
    if _git('rev-parse', '--abbrev-ref', 'HEAD') != 'next':
        raise DevError('Checkout is no longer on next; build remains pending.')
    with tempfile.TemporaryDirectory(prefix='streams-dev-snapshot-') as temp:
        source = Path(temp) / 'source'
        head = snapshot_head(ROOT, source)

        def before_swap(record):
            if _git('rev-parse', '--abbrev-ref', 'HEAD') != 'next':
                raise DevError('Checkout is no longer on next; build remains pending.')
            if record.get('sourceDirty') or record.get('sourceCommit') != head:
                raise DevError('Snapshot changed during tests; the staged build was left unchanged.')
            if _iina_running() or _git('rev-parse', 'HEAD') != head:
                raise _AutoRetry('IINA reopened or HEAD changed during the build; retrying.')

        def output(data):
            with _auto_guard(stage):
                _append_log_locked(stage, data)

        return _deploy_locked(stage, lambda: run_tests(source, output), qa, before_swap, source, branch='next')


HOOK_BEGIN = '# BEGIN IINA Streams Dev auto update'
HOOK_END = '# END IINA Streams Dev auto update'


def install_auto_hooks(hooks_dir):
    """Append our marked shell snippet to the shared repository hooks."""
    hooks_dir = Path(hooks_dir)
    hooks_dir.mkdir(parents=True, exist_ok=True)
    marker = HOOK_BEGIN
    # Git invokes non-bare repository hooks from the triggering worktree root.
    # Resolve that root at invocation, not the worktree that installed the hook.
    snippet = f'''{marker}
if [ "$(git rev-parse --abbrev-ref HEAD)" = next ]; then
    streams_stage={shlex.quote(str(DEFAULT_STAGE))}
    if [ ! -L "$streams_stage" ]; then
        (
            # Do not inherit a short-lived commit index or worktree override.
            unset $(git rev-parse --local-env-vars)
            exec nohup python3 -B "$(pwd)/scripts/dev.py" auto
        ) > /dev/null 2>&1 < /dev/null &
    fi
fi
{HOOK_END}
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


def uninstall_auto_hooks(hooks_dir):
    """Remove only our complete marked block; leave foreign hook bytes intact."""
    edits = []
    for name in ('post-commit', 'post-merge'):
        hook = Path(hooks_dir) / name
        if not hook.exists():
            continue
        original = hook.read_bytes()
        lines = original.splitlines(keepends=True)
        begin = [i for i, line in enumerate(lines) if line.rstrip(b'\r\n') == HOOK_BEGIN.encode()]
        end = [i for i, line in enumerate(lines) if line.rstrip(b'\r\n') == HOOK_END.encode()]
        if not begin and not end:
            continue
        if len(begin) != 1 or len(end) != 1 or begin[0] >= end[0]:
            raise DevError(f'{hook} has an incomplete automatic update block; nothing was changed.')
        edits.append((hook, b''.join(lines[:begin[0]] + lines[end[0] + 1:])))
    for hook, content in edits:
        hook.write_bytes(content)


def _stage_lock_active(stage):
    try:
        with _auto_guard(stage):
            with (stage / 'auto.lock').open('r') as handle:
                try:
                    fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    return True
                return False
    except OSError:
        return False


def live_warning(running=_iina_running, enabled=_enabled_pref):
    """The warning to print after a deploy, or None. Reads only; never touches IINA."""
    return LIVE_WARNING if running() and enabled() == 'enabled' else None


def status(plugins=DEFAULT_PLUGINS, stage=DEFAULT_STAGE, read_prefs=True):
    stage = Path(stage)
    dest, target = Path(plugins) / LINK_NAME, Path(stage) / 'current'
    staged = _read_build(target)
    head = _git('rev-parse', 'HEAD')
    if dest.is_symlink():
        linked = 'linked' if Path(os.readlink(dest)) == target else 'foreign link'
    else:
        linked = 'foreign item' if dest.exists() else 'not linked'
    pending = _read_json(stage / 'pending.json')
    if pending is None and (stage / 'pending.json').exists():
        pending = {'state': 'failed', 'reason': 'Unreadable pending request; retry auto.'}
    return {
        'link': linked,
        'enabled': _enabled_pref() if read_prefs else 'not read',
        'staged': staged and {k: staged.get(k) for k in ('version', 'branch', 'sourceCommit', 'sourceDirty', 'testsRan', 'stagedAt', 'worktree', 'qa')},
        'thisWorktreeHead': head,
        'stagedMatchesHead': bool(staged and head and staged.get('sourceCommit') == head and not staged.get('sourceDirty')),
        'previousStaged': bool(_read_build(Path(stage) / 'previous')),
        'pending': pending,
        'stageLockActive': _stage_lock_active(stage),
    }


RELOAD_HINT = ('Next: quit IINA (Cmd-Q) and reopen it. Do NOT use Plugin › Reload All Plugins: on IINA 1.5.1 '
               'it crashed IINA on 2026-11-22 (trap in JavascriptAPISidebarView.loadFile during the re-emitted events).')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('command', choices=['deploy', 'link', 'unlink', 'status', 'rollback', 'auto', 'install-hooks', 'uninstall-hooks'])
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
        elif args.command in ('install-hooks', 'uninstall-hooks'):
            common_dir = _git('rev-parse', '--git-common-dir')
            if not common_dir:
                raise DevError('Could not locate the repository common directory.')
            hooks = ROOT / common_dir / 'hooks'
            if args.command == 'install-hooks':
                install_auto_hooks(hooks)
                print(f'Installed automatic Dev update hooks in {hooks}.')
            else:
                uninstall_auto_hooks(hooks)
                print(f'Removed automatic Dev update hook blocks from {hooks}.')
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
