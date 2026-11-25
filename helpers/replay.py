#!/usr/bin/env python3
"""Offline, bounded archive import. Does not acquire content or make network requests."""
import argparse
import contextlib
import gzip
import io
import json
import math
import os
from pathlib import Path
import re
import shutil
import signal
import sqlite3
import stat
import sys
import tempfile
import threading
import time

MAX_INPUT_BYTES = 1024 * 1024 * 1024
MAX_VALUE_CHARS = 2 * 1024 * 1024
MAX_MESSAGES = 2000000
MAX_CHUNKS = 10000
MAX_CHUNK_BYTES = 1024 * 1024
MAX_OUTPUT_BYTES = 512 * 1024 * 1024
MAX_INDEX_BYTES = 4 * 1024 * 1024
MAX_SECONDS = 365 * 24 * 3600
MAX_IMPORT_SECONDS = 180
SID = re.compile(r'^[A-Za-z0-9_-]{1,128}$')
COLOR = re.compile(r'^#[A-Fa-f0-9]{6}$')
SPECIAL = re.compile(r'["\\\x00-\x1f]')
NUMBER = re.compile(r'-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?\Z')
CONTROL = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]')


class ImportFailure(Exception):
    def __init__(self, code, message):
        self.code, self.message = code, message


def malformed():
    raise ImportFailure('MALFORMED_ARCHIVE', 'The archive contains malformed or unsupported JSON.')


def limit_failure():
    raise ImportFailure('IMPORT_LIMIT', 'The archive exceeds the bounded import limits. Export a smaller section.')


def seconds(value):
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return None
    try:
        value = float(value)
    except (ValueError, OverflowError):
        return None
    return value if math.isfinite(value) and 0 <= value <= MAX_SECONDS else None


def text(value, maximum):
    if not isinstance(value, str):
        return ''
    cleaned = CONTROL.sub('', value[:maximum]).encode('utf-8', 'replace').decode('utf-8')
    return cleaned.encode('utf-16-le')[:maximum * 2].decode('utf-16-le', 'ignore')


def source_id(value):
    value = str(value) if isinstance(value, int) and not isinstance(value, bool) else value
    return value if isinstance(value, str) and SID.fullmatch(value) else ''


def dump(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':'))


class JSONStream:
    """Validates/skips JSON incrementally; only selected values are materialized."""
    def __init__(self, stream, deadline):
        self.stream, self.deadline = stream, deadline
        self.buf, self.pos, self.total = '', 0, 0
        self.capture, self.captured = None, 0

    def peek(self):
        if self.pos == len(self.buf):
            if time.monotonic() > self.deadline:
                limit_failure()
            self.buf, self.pos = self.stream.read(65536), 0
            self.total += len(self.buf.encode('utf-8'))
            if self.total > MAX_INPUT_BYTES:
                limit_failure()
        return self.buf[self.pos:self.pos + 1]

    def advance(self, count=1):
        if self.capture is not None:
            self.captured += count
            if self.captured > MAX_VALUE_CHARS:
                limit_failure()
            self.capture.append(self.buf[self.pos:self.pos + count])
        self.pos += count

    def expect(self, value):
        if self.peek() != value:
            malformed()
        self.advance()

    def ws(self):
        while self.peek() and self.peek() in ' \r\n\t':
            self.advance()

    def string(self):
        self.expect('"')
        while self.peek():
            match = SPECIAL.search(self.buf, self.pos)
            if match is None:
                self.advance(len(self.buf) - self.pos)
                continue
            self.advance(match.start() - self.pos)
            char = self.peek()
            self.advance()
            if char == '"':
                return
            if char != '\\':
                malformed()
            escape = self.peek()
            if not escape or escape not in '"\\/bfnrtu':
                malformed()
            self.advance()
            if escape == 'u':
                for _ in range(4):
                    digit = self.peek()
                    if not digit or digit not in '0123456789abcdefABCDEF':
                        malformed()
                    self.advance()
        malformed()

    def skip(self, depth=0):
        if depth > 64:
            limit_failure()
        self.ws()
        char = self.peek()
        if char == '"':
            self.string()
        elif char in ('{', '['):
            closer = '}' if char == '{' else ']'
            self.advance()
            self.ws()
            if self.peek() == closer:
                self.advance()
                return
            while True:
                if char == '{':
                    self.string()
                    self.ws()
                    self.expect(':')
                self.skip(depth + 1)
                self.ws()
                if self.peek() == closer:
                    self.advance()
                    return
                self.expect(',')
                self.ws()
        else:
            token = ''
            while self.peek() and self.peek() not in ' \r\n\t,]}':
                token += self.peek()
                self.advance()
                if len(token) > 128:
                    limit_failure()
            if token not in ('true', 'false', 'null') and not NUMBER.fullmatch(token):
                malformed()

    def value(self):
        self.capture, self.captured = [], 0
        try:
            self.skip()
            raw = ''.join(self.capture)
        finally:
            self.capture = None
        try:
            return json.loads(raw, parse_constant=lambda _: malformed())
        except (ValueError, RecursionError):
            malformed()

    def root(self, consumer):
        self.ws()
        self.expect('{')
        self.ws()
        meta, seen, fields = {}, set(), 0
        if self.peek() == '}':
            self.advance()
            return meta
        while True:
            key = self.value()
            if not isinstance(key, str) or len(key) > 256:
                malformed()
            if key in seen:
                malformed()
            seen.add(key)
            fields += 1
            if fields > 1024:
                limit_failure()
            self.ws()
            self.expect(':')
            self.ws()
            if key in ('comments', 'records', 'messages'):
                consumer.begin_array(key)
                self.expect('[')
                self.ws()
                if self.peek() != ']':
                    while True:
                        consumer.record(key, self.value())
                        self.ws()
                        if self.peek() == ']':
                            break
                        self.expect(',')
                        self.ws()
                self.expect(']')
            elif key in ('version', 'provider', 'sourceId', 'title', 'video', 'timeline', 'replayChatItemAction', 'isLive', 'addChatItemAction'):
                meta[key] = self.value()
            else:
                # In particular, do not decode TwitchDownloader's embedded image data.
                self.skip()
            self.ws()
            if self.peek() == '}':
                self.advance()
                return meta
            self.expect(',')
            self.ws()


def runs(value):
    if not isinstance(value, dict):
        return ''
    if isinstance(value.get('simpleText'), str):
        return text(value['simpleText'], 16000)
    out, size = [], 0
    for run in value.get('runs', []) if isinstance(value.get('runs'), list) else []:
        if not isinstance(run, dict):
            continue
        piece = run.get('text')
        if not isinstance(piece, str):
            emoji = run.get('emoji')
            if not isinstance(emoji, dict):
                continue
            shortcuts = emoji.get('shortcuts')
            piece = shortcuts[0] if isinstance(shortcuts, list) and shortcuts and isinstance(shortcuts[0], str) else emoji.get('emojiId', '[emote]')
        piece = text(piece, max(0, 16000 - size))
        out.append(piece)
        size += len(piece)
        if size >= 16000:
            break
    return ''.join(out)


class Importer:
    def __init__(self, connection, deadline):
        self.db, self.deadline = connection, deadline
        self.seq, self.count, self.events, self.format, self.array_count = 0, 0, 0, '', 0
        self.meta = {}
        self.warnings = dict(invalidRecords=0, duplicates=0, missingTimestamp=0, unsupportedActions=0, sourceMismatch=0)
        self.db.executescript('''
            PRAGMA cache_size=-4096;
            PRAGMA journal_mode=OFF;
            PRAGMA synchronous=OFF;
            PRAGMA max_page_count=262144;
            CREATE TABLE messages(seq INTEGER PRIMARY KEY,id TEXT UNIQUE NOT NULL,t REAL NOT NULL,author_key TEXT NOT NULL,data TEXT NOT NULL,deleted_at REAL);
            CREATE TABLE deletions(target TEXT NOT NULL,t REAL NOT NULL,scope TEXT NOT NULL);
            CREATE INDEX deletion_lookup ON deletions(scope,target,t);
        ''')
        self.db.set_progress_handler(lambda: int(time.monotonic() > deadline), 10000)

    def begin_array(self, key):
        self.array_count += 1
        if self.array_count != 1:
            malformed()
        self.format = 'twitchdownloader' if key == 'comments' else 'iina-streams-replay-v1'

    def add(self, value, t, author_key=''):
        self.seq += 1
        if self.seq > MAX_MESSAGES or time.monotonic() > self.deadline:
            limit_failure()
        if t is None or not isinstance(value, dict):
            self.warnings['invalidRecords'] += 1
            return
        body = text(value.get('text'), 16000)
        if not body.strip():
            self.warnings['invalidRecords'] += 1
            return
        row = {'id': text(value.get('id'), 256) or 'import-' + str(self.seq), 'time': t,
               'author': text(value.get('author'), 128) or 'Unknown', 'text': body,
               'color': value.get('color') if isinstance(value.get('color'), str) and COLOR.fullmatch(value['color']) else '',
               'badges': [text(b, 40) for b in value.get('badges', [])[:16] if isinstance(b, str)] if isinstance(value.get('badges'), list) else [],
               'kind': 'message'}
        emotes = value.get('emotes')
        # Do not keep offsets if text normalization has changed the message.
        if isinstance(emotes, str) and len(emotes) <= 2048 and emotes.isascii() and body == value.get('text'):
            row['emotes'] = emotes
        deleted = None
        if 'deletedAt' in value:
            deleted = seconds(value['deletedAt'])
            if deleted is None or deleted < t:
                self.warnings['invalidRecords'] += 1
                return
        cursor = self.db.execute('INSERT OR IGNORE INTO messages VALUES(?,?,?,?,?,?)', (self.seq, row['id'], t, text(author_key, 256), dump(row), deleted))
        if cursor.rowcount:
            self.count += 1
        else:
            self.warnings['duplicates'] += 1

    def record(self, key, value):
        if not isinstance(value, dict):
            self.add(None, None)
            return
        if key != 'comments':
            self.add(value, seconds(value.get('time')))
            return
        message = value.get('message') if isinstance(value.get('message'), dict) else {}
        commenter = value.get('commenter') if isinstance(value.get('commenter'), dict) else {}
        body = message.get('body')
        if not isinstance(body, str) or not body:
            fragments = message.get('fragments')
            body = ''.join(text(x.get('text'), 16000) for x in fragments[:5000] if isinstance(x, dict))[:16000] if isinstance(fragments, list) else ''
        badges = message.get('user_badges')
        self.add({'id': value.get('_id'), 'text': body, 'author': commenter.get('display_name') or commenter.get('name'),
                  'color': message.get('user_color'), 'badges': [b.get('_id') for b in badges[:16] if isinstance(b, dict)] if isinstance(badges, list) else []}, seconds(value.get('content_offset_seconds')), commenter.get('_id', ''))

    def root(self, root):
        if root.get('isLive') is True:
            raise ImportFailure('LIVE_CAPTURE_NOT_REPLAY', 'This is a live capture with a download-relative clock. Export a VOD replay archive instead.')
        if 'replayChatItemAction' in root:
            if self.format and self.format != 'yt-dlp-live-chat-replay':
                malformed()
            self.format = 'yt-dlp-live-chat-replay'
            action = root['replayChatItemAction']
            if not isinstance(action, dict):
                self.warnings['invalidRecords'] += 1
                return
            try:
                raw = action.get('videoOffsetTimeMsec')
                offset = None if isinstance(raw, bool) else float(raw) / 1000
                t = seconds(offset)
            except (TypeError, ValueError, OverflowError):
                t = None
            if t is None:
                self.warnings['missingTimestamp'] += 1
                return
            actions = action.get('actions')
            if not isinstance(actions, list):
                self.warnings['invalidRecords'] += 1
                return
            for item in actions:
                self.youtube_action(item, t)
        elif 'addChatItemAction' in root:
            self.warnings['missingTimestamp'] += 1
        self.meta.update({k: v for k, v in root.items() if k in ('version', 'provider', 'sourceId', 'title', 'video', 'timeline')})

    def youtube_action(self, action, t):
        self.events += 1
        if self.events > MAX_MESSAGES * 2:
            limit_failure()
        if not isinstance(action, dict):
            self.warnings['unsupportedActions'] += 1
            return
        deletion = action.get('markChatItemAsDeletedAction') or action.get('removeChatItemAction')
        author_deletion = action.get('markChatItemsByAuthorAsDeletedAction')
        if isinstance(deletion, dict) or isinstance(author_deletion, dict):
            scope = 'id' if isinstance(deletion, dict) else 'author'
            target = deletion.get('targetItemId') if scope == 'id' else author_deletion.get('externalChannelId')
            if isinstance(target, str) and target:
                self.db.execute('INSERT INTO deletions VALUES(?,?,?)', (text(target, 256), t, scope))
            else:
                self.warnings['unsupportedActions'] += 1
            return
        add = action.get('addChatItemAction')
        item = add.get('item') if isinstance(add, dict) else None
        renderer = next((item[k] for k in ('liveChatTextMessageRenderer', 'liveChatPaidMessageRenderer', 'liveChatMembershipItemRenderer', 'liveChatPaidStickerRenderer') if isinstance(item.get(k), dict)), None) if isinstance(item, dict) else None
        if renderer is None:
            self.warnings['unsupportedActions'] += 1
            return
        body = runs(renderer.get('message')) or runs(renderer.get('headerSubtext'))
        if not body and isinstance(renderer.get('sticker'), dict):
            accessibility = renderer['sticker'].get('accessibility', {})
            data = accessibility.get('accessibilityData', {}) if isinstance(accessibility, dict) else {}
            body = text(data.get('label'), 1000) if isinstance(data, dict) else ''
        badges = []
        for badge in renderer.get('authorBadges', [])[:16] if isinstance(renderer.get('authorBadges'), list) else []:
            data = badge.get('liveChatAuthorBadgeRenderer') if isinstance(badge, dict) else None
            if isinstance(data, dict) and isinstance(data.get('tooltip'), str):
                badges.append(data['tooltip'])
        self.add({'id': renderer.get('id'), 'author': runs(renderer.get('authorName')), 'text': body, 'badges': badges}, t, renderer.get('authorExternalChannelId', ''))

    def finish(self, stage, requested_provider, requested_id):
        if self.format == 'iina-streams-replay-v1':
            if type(self.meta.get('version')) is not int or self.meta['version'] != 1:
                raise ImportFailure('UNSUPPORTED_VERSION', 'Generic replay archives must use version 1.')
            timeline = self.meta.get('timeline')
            if isinstance(timeline, dict) and timeline.get('unit', 'seconds') != 'seconds':
                raise ImportFailure('UNSUPPORTED_TIMELINE', 'Generic replay archives must use source-relative seconds.')
            provider = self.meta.get('provider', 'generic')
            if provider not in ('twitch', 'youtube', 'generic'):
                provider = 'generic'
            embedded_id, title = source_id(self.meta.get('sourceId')), text(self.meta.get('title'), 300)
        elif self.format == 'twitchdownloader':
            provider = 'twitch'
            video = self.meta.get('video') if isinstance(self.meta.get('video'), dict) else {}
            embedded_id, title = source_id(video.get('id')), text(video.get('title'), 300)
        elif self.format == 'yt-dlp-live-chat-replay':
            provider, embedded_id, title = 'youtube', '', ''
        else:
            raise ImportFailure('UNSUPPORTED_FORMAT', 'Use a TwitchDownloader JSON, yt-dlp replay JSONL, or version 1 generic replay archive.')
        if requested_provider and requested_provider != provider:
            raise ImportFailure('PROVIDER_MISMATCH', 'The archive format does not match the selected provider.')
        if not self.count:
            raise ImportFailure('EMPTY_ARCHIVE', 'No displayable messages with valid replay timestamps were found.')
        self.db.execute('CREATE INDEX messages_time ON messages(t,seq)')
        for scope, column in [('id', 'id'), ('author', 'author_key')]:
            # Identifiers come only from this fixed tuple, never from the input file.
            self.db.execute('UPDATE messages SET deleted_at=(SELECT MIN(d.t) FROM deletions d WHERE d.scope=? AND d.target=messages.' + column + ' AND d.t>=messages.t AND (messages.deleted_at IS NULL OR d.t<messages.deleted_at)) WHERE EXISTS (SELECT 1 FROM deletions d WHERE d.scope=? AND d.target=messages.' + column + ' AND d.t>=messages.t AND (messages.deleted_at IS NULL OR d.t<messages.deleted_at))', (scope, scope))
        self.db.commit()
        chunks, pending, chunk_bytes, output_bytes = [], [], 2, 0

        def flush():
            nonlocal pending, chunk_bytes, output_bytes
            if not pending:
                return
            if len(chunks) >= MAX_CHUNKS:
                limit_failure()
            payload = ('[' + ','.join(row[1] for row in pending) + ']').encode('utf-8')
            output_bytes += len(payload)
            if len(payload) > MAX_CHUNK_BYTES or output_bytes > MAX_OUTPUT_BYTES:
                limit_failure()
            filename = 'chunk-%06d.json' % len(chunks)
            write_private(stage / filename, payload)
            chunks.append({'file': filename, 'start': pending[0][0], 'end': pending[-1][0], 'count': len(pending)})
            pending, chunk_bytes = [], 2

        for t, data, deleted_at in self.db.execute('SELECT t,data,deleted_at FROM messages ORDER BY t,seq'):
            if time.monotonic() > self.deadline:
                limit_failure()
            if deleted_at is not None:
                row = json.loads(data)
                row['deletedAt'] = deleted_at
                data = dump(row)
            size = len(data.encode('utf-8'))
            if pending and (len(pending) >= 1000 or chunk_bytes + size + 1 > MAX_CHUNK_BYTES):
                flush()
            pending.append((t, data))
            chunk_bytes += size + (1 if len(pending) > 1 else 0)
        flush()
        index = {'version': 1, 'provider': provider, 'sourceId': embedded_id or requested_id, 'title': title,
                 'sourceIdEvidence': 'archive' if embedded_id else ('user-supplied' if requested_id else 'unknown'),
                 'count': self.count, 'chunks': chunks,
                 'timeline': {'unit': 'seconds', 'origin': 'source', 'mediaOriginSeconds': 0, 'availableStart': chunks[0]['start'], 'availableEnd': chunks[-1]['end']},
                 'provenance': {'format': self.format, 'acquisition': 'user-import', 'verified': False},
                 'warnings': self.warnings}
        if embedded_id and requested_id and embedded_id != requested_id:
            index['sourceMismatch'] = {'requested': requested_id, 'embedded': embedded_id}
            self.warnings['sourceMismatch'] = 1
        payload = dump(index).encode('utf-8')
        if len(payload) > MAX_INDEX_BYTES:
            limit_failure()
        write_private(stage / 'index.json', payload)
        return index


def write_private(path, payload):
    with open(path, 'xb') as stream:
        os.chmod(path, 0o600)
        stream.write(payload)


@contextlib.contextmanager
def publication_receipt():
    """Cancellation after a committed import must not hide its ownership."""
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


def import_archive(input_file, output_dir, provider='', requested_id='', on_published=None):
    if requested_id and not source_id(requested_id):
        raise ImportFailure('INVALID_SOURCE_ID', 'The source identifier must be a plain platform identifier.')
    destination = Path(os.path.abspath(output_dir))
    if destination.is_symlink() or (destination.exists() and (not destination.is_dir() or any(destination.iterdir()))):
        raise ImportFailure('DESTINATION_NOT_EMPTY', 'Choose a new or empty destination directory.')
    if not destination.parent.is_dir():
        raise ImportFailure('INVALID_DESTINATION', 'The destination parent directory does not exist.')
    stage = Path(tempfile.mkdtemp(prefix='.replay-', dir=str(destination.parent)))
    owned_directory = stage.stat()
    deadline = time.monotonic() + MAX_IMPORT_SECONDS
    try:
        with contextlib.ExitStack() as stack:
            descriptor = os.open(input_file, os.O_RDONLY | getattr(os, 'O_NONBLOCK', 0))
            raw = stack.enter_context(os.fdopen(descriptor, 'rb'))
            info = os.fstat(raw.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_size > MAX_INPUT_BYTES:
                limit_failure()
            magic = raw.read(2)
            raw.seek(0)
            binary = stack.enter_context(gzip.GzipFile(fileobj=raw, mode='rb')) if magic == b'\x1f\x8b' else raw
            stream = stack.enter_context(io.TextIOWrapper(binary, encoding='utf-8-sig', errors='strict'))
            connection = stack.enter_context(contextlib.closing(sqlite3.connect(str(stage / 'sort.sqlite'))))
            importer, parser = Importer(connection, deadline), JSONStream(stream, deadline)
            roots = 0
            while True:
                parser.ws()
                if not parser.peek():
                    break
                if roots and importer.array_count:
                    malformed()
                importer.root(parser.root(importer))
                roots += 1
            index = importer.finish(stage, provider, requested_id)
        (stage / 'sort.sqlite').unlink()
        if destination.is_symlink():
            raise ImportFailure('INVALID_DESTINATION', 'The destination changed during import.')
        if destination.exists():
            destination.rmdir()  # Fails safely if another writer made it nonempty.
        os.rename(stage, destination)
        result = {'ok': True, 'indexPath': str(destination / 'index.json'), 'metadata': index}
        if on_published is not None:
            on_published(result)
        return result
    except BaseException:
        # Publication may have completed immediately before an interruption.
        # The staging inode identifies only the output created by this import.
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


class QuietParser(argparse.ArgumentParser):
    def error(self, message):
        raise ImportFailure('INVALID_ARGUMENTS', 'Use import with an input file and an empty output directory.')


def _main(argv=None, on_published=None):
    try:
        parser = QuietParser(add_help=False)
        parser.add_argument('action', choices=['import'])
        parser.add_argument('--input', required=True)
        parser.add_argument('--output', required=True)
        parser.add_argument('--source-id', default='')
        parser.add_argument('--provider', choices=['twitch', 'youtube', 'generic'], default='')
        args = parser.parse_args(argv)
        response = import_archive(args.input, args.output, args.provider, args.source_id, on_published)
    except ImportFailure as error:
        response = {'ok': False, 'error': {'code': error.code, 'message': error.message}}
    except (ValueError, UnicodeError, EOFError, RecursionError):
        response = {'ok': False, 'error': {'code': 'MALFORMED_ARCHIVE', 'message': 'The archive is not valid supported UTF-8 JSON.'}}
    except (OSError, sqlite3.Error):
        response = {'ok': False, 'error': {'code': 'IMPORT_FAILED', 'message': 'Import could not finish. Check the file, available disk space, and bounded import limits.'}}
    except KeyboardInterrupt:
        response = {'ok': False, 'error': {'code': 'CANCELLED', 'message': 'Import cancelled.'}}
    print(dump(response))
    return 0 if response['ok'] else 1


def main(argv=None):
    with publication_receipt() as published:
        return _main(argv, published)


if __name__ == '__main__':
    sys.exit(main())
