#!/usr/bin/env python3
"""Explicit, bounded YouTube replay acquisition through the installed yt-dlp.

No authorization, install, update, configuration, cookie, or plugin discovery is
performed. This file is self-contained for IINA's hashed helper installation.
"""
import argparse
import contextlib
import json
import math
import os
from pathlib import Path
import re
import selectors
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import threading
import time
from urllib.parse import parse_qs, urlsplit
import urllib.error
import urllib.request

YTDLP = shutil.which('yt-dlp') or '/opt/homebrew/bin/yt-dlp'
MAX_TOTAL_SECONDS = 120
MAX_PREFLIGHT_SECONDS = 30
MAX_ARCHIVE_BYTES = 64 * 1024 * 1024
MAX_METADATA_BYTES = 8 * 1024 * 1024
MAX_LINE_BYTES = 2 * 1024 * 1024
MAX_LINES = 2000000
LAUNCH_FAILED = b'iina-replay-launch-failed\n'
# A new Python process applies the limit after exec, then replaces itself with
# the exact extractor argv. No Python callback runs between fork and exec while
# runner.py's cancellation watcher thread is active. The PID/session is retained.
LIMIT_LAUNCHER = '''import os,resource,sys
try:
    requested=int(sys.argv[1])
    _,hard=resource.getrlimit(resource.RLIMIT_FSIZE)
    cap=requested if hard==resource.RLIM_INFINITY else min(requested,hard)
    resource.setrlimit(resource.RLIMIT_FSIZE,(cap,cap))
    os.execve(sys.argv[2],sys.argv[2:],os.environ)
except BaseException:
    sys.stderr.write("iina-replay-launch-failed\\n")
    sys.exit(127)
'''
CANONICAL = re.compile(r'https://www\.youtube\.com/watch\?v=([A-Za-z0-9_-]{11})\Z')
ERRORS = {
    'INVALID_ARGUMENTS': 'Use a YouTube URL and a new output directory to fetch replay.',
    'UNSUPPORTED_SOURCE': 'Replay fetch requires a canonical public YouTube video URL.',
    'INVALID_DESTINATION': 'Choose a new output directory whose parent already exists.',
    'MISSING_DEPENDENCY': 'The installed yt-dlp is unavailable. Import an authorized replay file instead.',
    'DEPENDENCY_UNSUPPORTED': 'The installed yt-dlp lacks a required isolation option. Import a replay file instead.',
    'INVALID_METADATA': 'The service returned unexpected replay information. Import a replay file instead.',
    'LIVE_NOT_REPLAY': 'This source is live, upcoming, or still processing. Fetch replay after the archive is available.',
    'ACCESS_REQUIRED': 'This replay requires account access or is restricted. No credentials were requested; import an authorized file instead.',
    'NO_REPLAY': 'No archived live-chat replay is available for this video. You can import an authorized replay file.',
    'EXTRACTOR_FAILED': 'Replay could not be fetched. The service may be unavailable or the archive restricted; you can import a replay file.',
    'TIMEOUT': 'Replay fetch timed out. No partial archive was kept. Try again or import an authorized replay file.',
    'OUTPUT_LIMIT': 'Replay exceeds the fetch size limit. No partial archive was kept. Import a smaller authorized archive.',
    'INVALID_ARCHIVE': 'The downloaded file is not a complete supported chat replay.',
    'CANCELLED': 'Replay fetch was cancelled. No partial archive was kept.',
    'INTERNAL_ERROR': 'Replay fetch could not finish. Check the destination and available disk space.',
    'RATE_LIMITED': 'Twitch is limiting chat requests. Retry later or import an authorized archive.',
}


class AcquireError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(ERRORS[code])


class SafeParser(argparse.ArgumentParser):
    def error(self, message):
        raise AcquireError('INVALID_ARGUMENTS')


@contextlib.contextmanager
def publication_receipt():
    """Finish the ownership response once publication has committed."""
    committed, previous = [], {}

    def cancel(signum, frame):
        if not committed:
            raise KeyboardInterrupt()

    if threading.current_thread() is threading.main_thread():
        for signum in (signal.SIGINT, signal.SIGTERM):
            previous[signum] = signal.getsignal(signum)
            signal.signal(signum, cancel)
    try:
        yield committed.append
    finally:
        for signum, handler in previous.items():
            signal.signal(signum, handler)


@contextlib.contextmanager
def cancellation_scope(existing=None):
    if existing is not None:
        yield existing
        return
    state, previous = [False], {}

    def cancel(signum, frame):
        state[0] = True

    if threading.current_thread() is threading.main_thread():
        for signum in (signal.SIGTERM, signal.SIGINT):
            previous[signum] = signal.getsignal(signum)
            signal.signal(signum, cancel)
    try:
        yield state
    finally:
        for signum, handler in previous.items():
            signal.signal(signum, handler)


def remaining(deadline, cancelled, ceiling=MAX_TOTAL_SECONDS):
    if cancelled[0]:
        raise AcquireError('CANCELLED')
    seconds = deadline - time.monotonic()
    if seconds <= 0:
        raise AcquireError('TIMEOUT')
    return min(seconds, ceiling)


def stop_owned_group(process):
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        process.wait(timeout=0.2)
    except (subprocess.TimeoutExpired, OSError):
        pass
    # A child can outlive an exited group leader, including while holding a pipe.
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    try:
        process.wait(timeout=1)
    except (subprocess.TimeoutExpired, OSError):
        pass


def check_directory(directory):
    if directory is None:
        return
    total, count = 0, 0
    for entry in Path(directory).iterdir():
        count += 1
        info = entry.lstat()
        if not stat.S_ISREG(info.st_mode):
            raise AcquireError('INVALID_ARCHIVE')
        total += info.st_size
        if total >= MAX_ARCHIVE_BYTES or count > 16:
            raise AcquireError('OUTPUT_LIMIT')


def classify_failure(stderr):
    if stderr == LAUNCH_FAILED:
        return 'MISSING_DEPENDENCY'
    message = stderr.decode('utf-8', 'replace').lower()
    if any(word in message for word in ('no such option', 'unrecognized option', 'unknown option')):
        return 'DEPENDENCY_UNSUPPORTED'
    if any(word in message for word in ('sign in', 'log in', 'login', 'authentication', 'members-only',
                                       'members only', 'private video', 'not a bot', 'age-restricted',
                                       'age restricted', 'http error 403', 'http error 401')):
        return 'ACCESS_REQUIRED'
    return 'EXTRACTOR_FAILED'


def run_command(command, *, timeout=MAX_PREFLIGHT_SECONDS, max_output_bytes=MAX_METADATA_BYTES,
                watch_dir=None, cancelled=None):
    """Bound pipes, time, workdir size, and the complete owned process group."""
    process, selector = None, None
    with cancellation_scope(cancelled) as cancel:
        deadline = time.monotonic() + timeout
        try:
            remaining(deadline, cancel)
            check_directory(watch_dir)
            try:
                child_command = ([sys.executable, '-I', '-S', '-B', '-c', LIMIT_LAUNCHER,
                                  str(MAX_ARCHIVE_BYTES), *command]
                                 if watch_dir is not None else command)
                process = subprocess.Popen(
                    child_command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                    shell=False, start_new_session=True, close_fds=True,
                    cwd=str(watch_dir) if watch_dir is not None else None,
                    env={'PATH': '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin', 'LC_ALL': 'en_US.UTF-8',
                         'PYTHONNOUSERSITE': '1', 'PYTHONDONTWRITEBYTECODE': '1'},
                )
            except OSError:
                raise AcquireError('MISSING_DEPENDENCY') from None
            selector = selectors.DefaultSelector()
            selector.register(process.stdout, selectors.EVENT_READ, 'stdout')
            selector.register(process.stderr, selectors.EVENT_READ, 'stderr')
            output, errors, total, stderr_total = [], [], 0, 0
            while selector.get_map():
                wait = min(remaining(deadline, cancel), 0.1)
                check_directory(watch_dir)
                for key, _ in selector.select(wait):
                    data = os.read(key.fd, min(65536, max_output_bytes + 1))
                    if not data:
                        selector.unregister(key.fileobj)
                        continue
                    total += len(data)
                    if key.data == 'stderr':
                        stderr_total += len(data)
                    if total > max_output_bytes or stderr_total > 65536:
                        raise AcquireError('OUTPUT_LIMIT')
                    (output if key.data == 'stdout' else errors).append(data)
            while True:
                wait = min(remaining(deadline, cancel), 0.1)
                check_directory(watch_dir)
                try:
                    status = process.wait(timeout=wait)
                    break
                except subprocess.TimeoutExpired:
                    pass
            remaining(deadline, cancel)
            check_directory(watch_dir)
            if status != 0:
                raise AcquireError(classify_failure(b''.join(errors)))
            return b''.join(output)
        finally:
            if selector is not None:
                selector.close()
            if process is not None:
                stop_owned_group(process)
                process.stdout.close()
                process.stderr.close()


def canonical_source(value):
    match = CANONICAL.fullmatch(value) if isinstance(value, str) else None
    if not match:
        raise AcquireError('UNSUPPORTED_SOURCE')
    return match.group(1)


def replay_track_identity(value, identifier):
    # The installed extractor appends its standard watch-page parameters. We
    # validate the identity but never pass this URL back as the download input.
    if not isinstance(value, str) or len(value) > 1024 or re.search(r'[\x00-\x20\x7f\\]', value):
        return False
    try:
        parsed = urlsplit(value)
        query = parse_qs(parsed.query, keep_blank_values=True, max_num_fields=4)
        if (parsed.scheme != 'https' or parsed.hostname != 'www.youtube.com' or
                parsed.port not in (None, 443) or parsed.username is not None or parsed.password is not None or
                parsed.path != '/watch' or parsed.fragment or set(query) - {'v', 'bpctr', 'has_verified'} or
                query.get('v') != [identifier] or any(len(v) != 1 for v in query.values())):
            return False
        if 'bpctr' in query and not re.fullmatch(r'[0-9]{1,16}', query['bpctr'][0]):
            return False
        return query.get('has_verified', ['1']) == ['1']
    except ValueError:
        return False


def validate_metadata(payload, identifier, url):
    if not isinstance(payload, (bytes, str)) or len(payload) > MAX_METADATA_BYTES:
        raise AcquireError('OUTPUT_LIMIT')
    try:
        value = json.loads(payload)
    except (ValueError, UnicodeError, RecursionError):
        raise AcquireError('INVALID_METADATA') from None
    if (not isinstance(value, dict) or value.get('id') != identifier or
            value.get('_type', 'video') != 'video' or value.get('extractor_key', 'Youtube') != 'Youtube'):
        raise AcquireError('INVALID_METADATA')
    if value.get('is_live') is True or value.get('is_upcoming') is True or value.get('live_status') in ('is_live', 'is_upcoming', 'post_live'):
        raise AcquireError('LIVE_NOT_REPLAY')
    if value.get('availability') not in (None, 'public', 'unlisted'):
        raise AcquireError('ACCESS_REQUIRED')
    if value.get('is_live') not in (False, None) or value.get('live_status') not in ('was_live', 'not_live'):
        raise AcquireError('INVALID_METADATA')
    subtitles = value.get('subtitles')
    tracks = subtitles.get('live_chat') if isinstance(subtitles, dict) else None
    if not isinstance(tracks, list) or not tracks or len(tracks) > 8:
        raise AcquireError('NO_REPLAY')
    for track in tracks:
        if not isinstance(track, dict) or track.get('protocol') != 'youtube_live_chat_replay' or track.get('ext') != 'json':
            raise AcquireError('NO_REPLAY')
        if track.get('video_id') != identifier or not replay_track_identity(track.get('url'), identifier):
            raise AcquireError('INVALID_METADATA')


def validate_replay(path, deadline, cancelled):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_size <= 0:
        raise AcquireError('INVALID_ARCHIVE')
    if info.st_size >= MAX_ARCHIVE_BYTES:
        raise AcquireError('OUTPUT_LIMIT')
    found, lines = False, 0
    with path.open('rb') as stream:
        while True:
            remaining(deadline, cancelled)
            line = stream.readline(MAX_LINE_BYTES + 1)
            if not line:
                break
            lines += 1
            if len(line) > MAX_LINE_BYTES or lines > MAX_LINES:
                raise AcquireError('OUTPUT_LIMIT')
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except (ValueError, UnicodeError, RecursionError):
                raise AcquireError('INVALID_ARCHIVE') from None
            if not isinstance(value, dict):
                raise AcquireError('INVALID_ARCHIVE')
            if value.get('isLive') is True:
                raise AcquireError('LIVE_NOT_REPLAY')
            action = value.get('replayChatItemAction')
            if not isinstance(action, dict):
                continue
            raw = action.get('videoOffsetTimeMsec')
            try:
                offset = float(raw) if not isinstance(raw, bool) else float('nan')
            except (ValueError, TypeError, OverflowError):
                continue
            actions = action.get('actions')
            if math.isfinite(offset) and 0 <= offset <= 31536000000 and isinstance(actions, list) and actions:
                found = True
    if not found:
        raise AcquireError('NO_REPLAY')


def acquire(url, output, *, runner=None, on_published=None):
    identifier = canonical_source(url)
    if not isinstance(output, str) or not output or len(output) > 4096 or re.search(r'[\x00-\x1f\x7f]', output):
        raise AcquireError('INVALID_DESTINATION')
    destination = Path(os.path.abspath(output))
    if destination.exists() or destination.is_symlink() or not destination.parent.is_dir():
        raise AcquireError('INVALID_DESTINATION')
    destination = destination.parent.resolve(strict=True) / destination.name
    run = runner or run_command
    base = [YTDLP, '--ignore-config', '--no-plugin-dirs', '--no-cache-dir', '--no-remote-components',
            '--no-cookies', '--no-cookies-from-browser', '--no-playlist', '--skip-download',
            '--no-js-runtimes', '--js-runtimes', 'node:/opt/homebrew/bin/node', '--quiet', '--no-warnings',
            '--no-progress', '--socket-timeout', '12', '--retries', '1', '--extractor-retries', '1',
            '--ignore-no-formats-error']
    deadline = time.monotonic() + MAX_TOTAL_SECONDS
    stage = Path(tempfile.mkdtemp(prefix='.replay-fetch-', dir=destination.parent))
    owned_directory = stage.stat()
    with cancellation_scope() as cancelled:
        try:
            payload = run(base + ['--simulate', '--dump-single-json', '--no-check-formats', '--', url],
                          timeout=remaining(deadline, cancelled, MAX_PREFLIGHT_SECONDS),
                          max_output_bytes=MAX_METADATA_BYTES, watch_dir=stage, cancelled=cancelled)
            validate_metadata(payload, identifier, url)
            run(base + ['--write-subs', '--sub-langs', 'live_chat', '--sub-format', 'json',
                        '--fragment-retries', '1', '--abort-on-unavailable-fragments', '--no-overwrites',
                        '--no-continue', '--match-filters', '!is_live', '--output', str(stage / 'archive.%(ext)s'),
                        '--', url], timeout=remaining(deadline, cancelled), max_output_bytes=128 * 1024,
                watch_dir=stage, cancelled=cancelled)
            remaining(deadline, cancelled)
            check_directory(stage)
            source = stage / 'archive.live_chat.json'
            if not source.exists():
                raise AcquireError('NO_REPLAY')
            if sorted(p.name for p in stage.iterdir()) != [source.name]:
                raise AcquireError('INVALID_ARCHIVE')
            validate_replay(source, deadline, cancelled)
            source.chmod(0o600)
            source.rename(stage / 'replay.jsonl')
            remaining(deadline, cancelled)
            if destination.exists() or destination.is_symlink():
                raise AcquireError('INVALID_DESTINATION')
            os.rename(stage, destination)
            remaining(deadline, cancelled)
            result = {'ok': True, 'path': str(destination / 'replay.jsonl')}
            if on_published is not None:
                on_published(result)
            return result
        except BaseException:
            # A signal/error can arrive after rename but before the ownership
            # receipt reaches the host. Remove only this invocation's inode.
            try:
                current = destination.lstat()
                if (stat.S_ISDIR(current.st_mode) and
                        (current.st_dev, current.st_ino) == (owned_directory.st_dev, owned_directory.st_ino)):
                    shutil.rmtree(destination)
            except OSError:
                pass
            raise
        finally:
            if stage.exists():
                shutil.rmtree(stage)


# Public Twitch VOD chat retrieval. The GraphQL query is undocumented and may change.
# No cookies, tokens, alternate endpoints, or restriction workarounds are used.
TWITCH_CANONICAL = re.compile(r'https://www\.twitch\.tv/videos/([0-9]{1,20})\Z')
TWITCH_GQL_URL = 'https://gql.twitch.tv/gql'
TWITCH_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'  # Public Twitch web client, not a secret.
TWITCH_QUERY_HASH = 'b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a'
TWITCH_MAX_SECONDS = 600
TWITCH_MAX_PAGES = 30000
TWITCH_MAX_MESSAGES = 2000000
TWITCH_MAX_BYTES = 128 * 1024 * 1024
TWITCH_MAX_PAGE_BYTES = 2 * 1024 * 1024


def twitch_page(video_id, offset=0, *, timeout=12):
    # Offset pagination is supported by the same public operation and does not
    # require the cursor request that may fail Twitch's integrity checks.
    variables = {'videoID': video_id, 'contentOffsetSeconds': int(offset)}
    query = {'operationName': 'VideoCommentsByOffsetOrCursor',
             'variables': variables,
             'extensions': {'persistedQuery': {'version': 1, 'sha256Hash': TWITCH_QUERY_HASH}}}
    request = urllib.request.Request(
        TWITCH_GQL_URL, data=json.dumps(query, separators=(',', ':')).encode('utf-8'),
        headers={'Client-ID': TWITCH_CLIENT_ID, 'Content-Type': 'application/json',
                 'Accept': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(request, timeout=max(1, timeout)) as response:
            if response.geturl() != TWITCH_GQL_URL:
                raise AcquireError('INVALID_ARCHIVE')
            content = response.read(TWITCH_MAX_PAGE_BYTES + 1)
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            raise AcquireError('ACCESS_REQUIRED') from None
        if exc.code == 429:
            raise AcquireError('RATE_LIMITED') from None
        raise AcquireError('EXTRACTOR_FAILED') from None
    except (urllib.error.URLError, OSError, TimeoutError):
        raise AcquireError('EXTRACTOR_FAILED') from None
    if len(content) > TWITCH_MAX_PAGE_BYTES:
        raise AcquireError('OUTPUT_LIMIT')
    try:
        data = json.loads(content)
    except (ValueError, UnicodeError, RecursionError):
        raise AcquireError('INVALID_ARCHIVE') from None
    if not isinstance(data, dict):
        raise AcquireError('INVALID_ARCHIVE')
    if data.get('errors'):
        raise AcquireError('EXTRACTOR_FAILED')
    video = data.get('data', {}).get('video') if isinstance(data.get('data'), dict) else None
    if video is None:
        raise AcquireError('NO_REPLAY')
    comments = video.get('comments') if isinstance(video, dict) else None
    if comments is None:
        raise AcquireError('NO_REPLAY')
    if not isinstance(comments, dict) or not isinstance(comments.get('edges'), list):
        raise AcquireError('INVALID_ARCHIVE')
    page = comments.get('pageInfo')
    if not isinstance(page, dict) or type(page.get('hasNextPage')) is not bool:
        raise AcquireError('INVALID_ARCHIVE')
    edges = comments['edges']
    if len(edges) > 500:
        raise AcquireError('INVALID_ARCHIVE')
    return edges, page['hasNextPage']


def normalize_twitch_comment(edge):
    if not isinstance(edge, dict):
        return None
    node = edge.get('node')
    if not isinstance(node, dict):
        return None
    when = node.get('contentOffsetSeconds')
    if (isinstance(when, bool) or not isinstance(when, (int, float)) or
            not math.isfinite(when) or not 0 <= when <= 2592000):
        return None
    message = node.get('message')
    commenter = node.get('commenter')
    if not isinstance(message, dict):
        return None
    fragments = message.get('fragments')
    if not isinstance(fragments, list):
        return None
    body = ''.join(f.get('text', '') for f in fragments[:3000]
                   if isinstance(f, dict) and isinstance(f.get('text'), str))[:16000]
    if not body.strip():
        return None
    author = (commenter.get('displayName') or commenter.get('login')) if isinstance(commenter, dict) else None
    user_color = message.get('userColor')
    if not isinstance(user_color, str) or not re.fullmatch(r'#[0-9A-Fa-f]{6}', user_color):
        user_color = ''
    badges = message.get('userBadges')
    badge_ids = [b['id'][:40] for b in badges[:16]
                 if isinstance(b, dict) and isinstance(b.get('id'), str)] if isinstance(badges, list) else []
    identifier = node.get('id')
    return {'id': identifier[:256] if isinstance(identifier, str) else '',
            'time': when, 'author': author[:128] if isinstance(author, str) else 'Unknown',
            'text': body, 'color': user_color, 'badges': badge_ids}


def twitch_acquire(url, output, *, fetch_page=twitch_page, on_published=None):
    match = TWITCH_CANONICAL.fullmatch(url) if isinstance(url, str) else None
    if not match:
        raise AcquireError('UNSUPPORTED_SOURCE')
    if not isinstance(output, str) or not output or len(output) > 4096 or re.search(r'[\x00-\x1f\x7f]', output):
        raise AcquireError('INVALID_DESTINATION')
    video_id = match.group(1)
    destination = Path(os.path.abspath(output))
    if destination.exists() or destination.is_symlink() or not destination.parent.is_dir():
        raise AcquireError('INVALID_DESTINATION')
    destination = destination.parent.resolve(strict=True) / destination.name
    stage = Path(tempfile.mkdtemp(prefix='.twitch-chat-', dir=destination.parent))
    owned_directory = stage.stat()
    deadline = time.monotonic() + TWITCH_MAX_SECONDS
    with cancellation_scope() as cancelled:
        try:
            path = stage / 'replay.jsonl'
            total, messages, pages, offset, recent_ids = 0, 0, 0, 0, set()
            with path.open('x', encoding='utf-8') as out:
                os.chmod(path, 0o600)
                def emit(value):
                    nonlocal total
                    encoded = value.encode('utf-8')
                    total += len(encoded)
                    if total > TWITCH_MAX_BYTES:
                        raise AcquireError('OUTPUT_LIMIT')
                    out.write(value)
                emit('{"version":1,"provider":"twitch","sourceId":' + json.dumps(video_id) +
                     ',"title":"Twitch VOD ' + video_id + '","records":[')
                while True:
                    pages += 1
                    if pages > TWITCH_MAX_PAGES:
                        raise AcquireError('OUTPUT_LIMIT')
                    edges, more = fetch_page(video_id, offset, timeout=remaining(deadline, cancelled, 12))
                    remaining(deadline, cancelled)
                    if not isinstance(edges, list) or type(more) is not bool or len(edges) > 500:
                        raise AcquireError('INVALID_ARCHIVE')
                    current_ids = set()
                    page_max = -1
                    for edge in edges:
                        node = edge.get('node') if isinstance(edge, dict) else None
                        value = node.get('contentOffsetSeconds') if isinstance(node, dict) else None
                        if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
                            page_max = max(page_max, value)
                        row = normalize_twitch_comment(edge)
                        if row is None or (row['id'] and row['id'] in recent_ids):
                            continue
                        if row['id']:
                            current_ids.add(row['id'])
                        if messages >= TWITCH_MAX_MESSAGES:
                            raise AcquireError('OUTPUT_LIMIT')
                        emit((',' if messages else '') + json.dumps(row, ensure_ascii=True, separators=(',', ':')))
                        messages += 1
                    if not more:
                        break
                    if not edges:
                        raise AcquireError('INVALID_ARCHIVE')
                    # Request the last observed second again, so the next page
                    # overlaps instead of silently discarding same-second chat.
                    # Refuse to publish a partial archive if it cannot advance.
                    next_offset = int(page_max)
                    if next_offset <= offset or next_offset > 2592000:
                        raise AcquireError('INVALID_ARCHIVE')
                    offset = next_offset
                    recent_ids = current_ids
                emit(']}')
            if not messages:
                raise AcquireError('NO_REPLAY')
            remaining(deadline, cancelled)
            if destination.exists() or destination.is_symlink():
                raise AcquireError('INVALID_DESTINATION')
            os.rename(stage, destination)
            remaining(deadline, cancelled)
            result = {'ok': True, 'path': str(destination / 'replay.jsonl')}
            if on_published is not None:
                on_published(result)
            return result
        except BaseException:
            try:
                current = destination.lstat()
                if (stat.S_ISDIR(current.st_mode) and
                        (current.st_dev, current.st_ino) == (owned_directory.st_dev, owned_directory.st_ino)):
                    shutil.rmtree(destination)
            except OSError:
                pass
            raise
        finally:
            if stage.exists():
                shutil.rmtree(stage)



def _main(argv=None, on_published=None):
    try:
        parser = SafeParser(add_help=False, allow_abbrev=False)
        parser.add_argument('--url', required=True)
        parser.add_argument('--output', required=True)
        args = parser.parse_args(argv)
        response = (twitch_acquire(args.url, args.output, on_published=on_published)
                    if TWITCH_CANONICAL.fullmatch(args.url) else
                    acquire(args.url, args.output, on_published=on_published))
    except AcquireError as error:
        response = {'ok': False, 'error': {'code': error.code, 'message': str(error)}}
    except KeyboardInterrupt:
        response = {'ok': False, 'error': {'code': 'CANCELLED', 'message': ERRORS['CANCELLED']}}
    except Exception:
        response = {'ok': False, 'error': {'code': 'INTERNAL_ERROR', 'message': ERRORS['INTERNAL_ERROR']}}
    print(json.dumps(response, ensure_ascii=True, allow_nan=False, separators=(',', ':')))
    return 0 if response['ok'] else 1


def main(argv=None):
    with publication_receipt() as published:
        return _main(argv, published)


if __name__ == '__main__':
    sys.exit(main())
