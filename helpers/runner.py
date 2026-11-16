#!/usr/bin/env python3
"""Run one bundled helper in-process and bridge an owned marker to one SIGINT."""
import argparse
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import re
import runpy
import signal
import stat
import sys
import threading

MAX_SCRIPT_BYTES = 256 * 1024
MAX_RESPONSE_BYTES = 8 * 1024 * 1024
POLL_SECONDS = 0.05
SCRIPT_NAME = re.compile(r'(?:media|replay|acquire)-([a-f0-9]{64})\.py\Z')
CANCEL_NAME = re.compile(r'cancel-[A-Za-z0-9_-]{1,160}(?:\.flag)?\Z')
MESSAGES = {
    'INVALID_ARGUMENTS': 'The helper request is invalid.',
    'INVALID_HELPER': 'The bundled helper could not be verified.',
    'INVALID_CANCEL_MARKER': 'The helper cancellation marker is invalid.',
    'CANCELLED': 'The request was cancelled.',
    'OUTPUT_LIMIT': 'The helper response exceeded its size limit.',
    'INVALID_RESPONSE': 'The helper returned an unreadable response.',
    'HELPER_FAILED': 'The helper could not complete its request.',
}


class RunnerError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(MESSAGES[code])


def failure(code):
    return {'ok': False, 'error': {'code': code, 'message': MESSAGES[code]}}


def reject_json_constant(value):
    raise ValueError()


class SafeParser(argparse.ArgumentParser):
    def error(self, message):
        raise RunnerError('INVALID_ARGUMENTS')


class BoundedOutput(io.TextIOBase):
    def __init__(self):
        self.parts, self.size = [], 0

    def writable(self):
        return True

    def write(self, value):
        self.size += len(value.encode('utf-8', 'replace'))
        if self.size > MAX_RESPONSE_BYTES:
            raise RunnerError('OUTPUT_LIMIT')
        self.parts.append(value)
        return len(value)

    def value(self):
        return ''.join(self.parts)


class DiscardOutput(io.TextIOBase):
    def writable(self):
        return True

    def write(self, value):
        return len(value)


def owned_regular(info):
    return stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and not info.st_mode & 0o022


def absolute_path(value, code):
    if (not isinstance(value, str) or not value or len(value) > 4096 or
            re.search(r'[\x00-\x1f\x7f\\]', value) or not os.path.isabs(value) or
            os.path.normpath(value) != value):
        raise RunnerError(code)
    return Path(value)


def validate_paths(cancel_file, script_file):
    if threading.current_thread() is not threading.main_thread():
        raise RunnerError('INVALID_ARGUMENTS')
    directory = Path(__file__).resolve().parent
    directory_info = directory.stat()
    if (directory_info.st_uid != os.geteuid() or not stat.S_ISDIR(directory_info.st_mode) or
            directory_info.st_mode & 0o022):
        raise RunnerError('INVALID_HELPER')
    script = absolute_path(script_file, 'INVALID_HELPER')
    marker = absolute_path(cancel_file, 'INVALID_CANCEL_MARKER')
    match = SCRIPT_NAME.fullmatch(script.name)
    if not match or script.parent.resolve(strict=True) != directory:
        raise RunnerError('INVALID_HELPER')
    if not CANCEL_NAME.fullmatch(marker.name) or marker.parent.resolve(strict=True) != directory:
        raise RunnerError('INVALID_CANCEL_MARKER')
    info = script.lstat()
    if not owned_regular(info) or info.st_size > MAX_SCRIPT_BYTES or info.st_size <= 0:
        raise RunnerError('INVALID_HELPER')
    flags = os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_NONBLOCK', 0)
    with os.fdopen(os.open(script, flags), 'rb') as stream:
        opened = os.fstat(stream.fileno())
        if not owned_regular(opened) or (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
            raise RunnerError('INVALID_HELPER')
        data = stream.read(MAX_SCRIPT_BYTES + 1)
    if len(data) > MAX_SCRIPT_BYTES or hashlib.sha256(data).hexdigest() != match.group(1):
        raise RunnerError('INVALID_HELPER')
    return marker, script


def marker_exists(marker):
    try:
        info = marker.lstat()
    except FileNotFoundError:
        return False
    if not owned_regular(info) or info.st_size > 4096:
        raise RunnerError('INVALID_CANCEL_MARKER')
    return True


def remove_owned_marker(marker):
    try:
        if marker_exists(marker):
            marker.unlink()
    except (OSError, RunnerError):
        # Never follow links, delete directories, or remove a different owner's file.
        pass


class CancellationWatch:
    def __init__(self, marker):
        self.marker = marker
        self.finished = threading.Event()
        self.cancelled = False
        self.error = None
        self.thread = threading.Thread(target=self.watch, name='iina-helper-cancel', daemon=True)

    def watch(self):
        while not self.finished.wait(POLL_SECONDS):
            try:
                present = marker_exists(self.marker)
            except (OSError, RunnerError):
                self.error, present = 'INVALID_CANCEL_MARKER', True
            if present:
                self.cancelled = True
                if not self.finished.is_set():
                    # Python handles process signals on its main thread. There is
                    # no child PID discovery, guessed PID, or process-group kill here.
                    os.kill(os.getpid(), signal.SIGINT)
                return

    def stop(self):
        self.finished.set()
        self.thread.join(timeout=0.25)


def execute(cancel_file, script_file, arguments):
    marker, script = validate_paths(cancel_file, script_file)
    if marker_exists(marker):
        remove_owned_marker(marker)
        return failure('CANCELLED')
    output, discarded = BoundedOutput(), DiscardOutput()
    previous_handler, previous_argv = signal.getsignal(signal.SIGINT), sys.argv
    watcher = CancellationWatch(marker)
    status, error = 0, None
    watcher_started = False

    def finish():
        # Disarm delivery before joining: a marker racing normal completion must
        # not interrupt JSON publication or resurrect a watcher after completion.
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        if watcher_started:
            watcher.stop()
        remove_owned_marker(marker)
        sys.argv = previous_argv

    try:
        try:
            signal.signal(signal.SIGINT, signal.default_int_handler)
            sys.argv = [str(script)] + list(arguments)
            watcher.thread.start()
            watcher_started = True
            with contextlib.redirect_stdout(output), contextlib.redirect_stderr(discarded):
                try:
                    runpy.run_path(str(script), run_name='__main__')
                except SystemExit as exit_signal:
                    status = 0 if exit_signal.code is None else exit_signal.code
                except RunnerError as exception:
                    error = exception.code
                except KeyboardInterrupt:
                    error = 'CANCELLED'
                except BaseException:
                    error = 'HELPER_FAILED'
        finally:
            finish()
    except KeyboardInterrupt:
        # The one signal may arrive between runpy returning and finish disarming
        # it. Cleanup is idempotent, and the watcher never sends a second signal.
        error = 'CANCELLED'
        finish()
    except BaseException:
        error = 'HELPER_FAILED'
        finish()
    finally:
        signal.signal(signal.SIGINT, previous_handler)
    if watcher.error:
        return failure(watcher.error)
    if error and error != 'CANCELLED':
        return failure(error)
    cancelled = watcher.cancelled or error == 'CANCELLED'
    try:
        result = json.loads(output.value(), parse_constant=reject_json_constant)
    except (ValueError, UnicodeError, RecursionError):
        return failure('CANCELLED' if cancelled else 'INVALID_RESPONSE')
    if (not isinstance(result, dict) or type(result.get('ok')) is not bool or
            not isinstance(status, int) or bool(status == 0) != result['ok']):
        return failure('CANCELLED' if cancelled else 'INVALID_RESPONSE')
    # A complete successful response is the helper's ownership receipt. If
    # cancellation races completion, preserve it so the host's generation fence
    # can discard the stale state and delete only that exact owned output.
    if cancelled and not result['ok']:
        return failure('CANCELLED')
    return result


def main(argv=None):
    marker_argument = None
    try:
        parser = SafeParser(add_help=False, allow_abbrev=False)
        parser.add_argument('--cancel-file', required=True)
        parser.add_argument('--script', required=True)
        parser.add_argument('arguments', nargs=argparse.REMAINDER)
        args = parser.parse_args(argv)
        marker_argument = args.cancel_file
        if not args.arguments or args.arguments[0] != '--':
            raise RunnerError('INVALID_ARGUMENTS')
        result = execute(args.cancel_file, args.script, args.arguments[1:])
    except RunnerError as error:
        result = failure(error.code)
    except KeyboardInterrupt:
        result = failure('CANCELLED')
    except BaseException:
        result = failure('HELPER_FAILED')
    finally:
        # A valid control marker still belongs to this invocation if script
        # verification fails before execute starts its watcher.
        if marker_argument is not None:
            try:
                marker = absolute_path(marker_argument, 'INVALID_CANCEL_MARKER')
                if (CANCEL_NAME.fullmatch(marker.name) and
                        marker.parent.resolve(strict=True) == Path(__file__).resolve().parent):
                    remove_owned_marker(marker)
            except (OSError, RunnerError):
                pass
    try:
        serialized = json.dumps(result, ensure_ascii=True, allow_nan=False, separators=(',', ':'))
        if len(serialized) + 1 > MAX_RESPONSE_BYTES:
            result = failure('OUTPUT_LIMIT')
            serialized = json.dumps(result, separators=(',', ':'))
    except (ValueError, TypeError, RecursionError):
        result = failure('INVALID_RESPONSE')
        serialized = json.dumps(result, separators=(',', ':'))
    try:
        print(serialized)
    except OSError:
        # stdout is IPC; an abandoned native context must not produce a traceback.
        return 1
    return 0 if result['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
