"""Synthetic contract tests for public Twitch VOD chat acquisition."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import urllib.error

ROOT = Path(__file__).resolve().parents[1]


def load(name, relative):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


acquire = load('auto_twitch_acquire', 'helpers/acquire.py')
replay = load('auto_twitch_replay', 'helpers/replay.py')
URL = 'https://www.twitch.tv/videos/2922164492'


def edge(identifier='m1', seconds=3.25, cursor='c1', *, body='Hello <world>', color='#Aa00CC'):
    return {'cursor': cursor, 'node': {
        'id': identifier, 'contentOffsetSeconds': seconds,
        'commenter': {'displayName': 'Viewer', 'login': 'viewer'},
        'message': {'fragments': [{'text': body}],
                    'userColor': color, 'userBadges': [{'id': 'moderator'}]}}}


class TwitchAcquisitionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.output = self.base / 'result'

    def test_pages_to_atomic_archive_importable_by_existing_replay_parser(self):
        seen = []
        def fetch(video_id, offset, **kwargs):
            seen.append((video_id, offset))
            return ([edge('m1', 3.25, 'c1')], True) if offset == 0 else (
                [edge('m2', 5.25, 'c2', body='second')], False)
        result = acquire.twitch_acquire(URL, str(self.output), fetch_page=fetch)
        self.assertEqual(seen, [('2922164492', 0), ('2922164492', 3)])
        self.assertEqual(result, {'ok': True, 'path': str(self.output.resolve() / 'replay.jsonl')})
        path = Path(result['path'])
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(sorted(p.name for p in self.output.iterdir()), ['replay.jsonl'])
        raw = json.loads(path.read_text())
        self.assertEqual(raw['sourceId'], '2922164492')
        self.assertEqual(raw['provider'], 'twitch')
        self.assertEqual([m['time'] for m in raw['records']], [3.25, 5.25])
        self.assertEqual(raw['records'][0]['text'], 'Hello <world>')
        self.assertEqual(raw['records'][0]['color'], '#Aa00CC')
        self.assertEqual(raw['records'][0]['badges'], ['moderator'])
        normalized = self.base / 'indexed'
        imported = replay.import_archive(str(path), str(normalized), 'twitch', '2922164492')
        index = imported['metadata']
        self.assertEqual(index['count'], 2)
        self.assertEqual(index['sourceId'], '2922164492')
        chunk = json.loads((normalized / index['chunks'][0]['file']).read_text())
        self.assertEqual(chunk[0]['text'], 'Hello <world>')
        self.assertEqual(chunk[1]['time'], 5.25)

    def test_time_offset_overlap_is_deduplicated_without_cursors(self):
        def fetch(video_id, offset, **kwargs):
            if offset == 0:
                return [edge('m1', 3.25, 'c1')], True
            self.assertEqual(offset, 3)
            return [edge('m1', 3.25, 'c1'), edge('m2', 5.25, 'c2')], False
        result = acquire.twitch_acquire(URL, str(self.output), fetch_page=fetch)
        raw = json.loads(Path(result['path']).read_text())
        self.assertEqual([x['id'] for x in raw['records']], ['m1', 'm2'])

    def test_canonical_public_source_only_and_no_output_on_bad_input(self):
        bad = ['https://twitch.tv/videos/123456', 'http://www.twitch.tv/videos/123456',
               'https://www.twitch.tv/videos/123456?secret=1', 'https://www.twitch.tv/videos/123456#anchor',
               'https://www.twitch.tv.evil.example/videos/123456', 'file:///etc/passwd',
               'https://www.twitch.tv/videos/12%0A', 'https://www.twitch.tv/videos/123/other']
        for url in bad:
            with self.subTest(url=url), self.assertRaises(acquire.AcquireError) as raised:
                acquire.twitch_acquire(url, str(self.output), fetch_page=lambda *a, **kw: (_ for _ in ()).throw(AssertionError('network')))
            self.assertEqual(raised.exception.code, 'UNSUPPORTED_SOURCE')
        self.assertEqual(list(self.base.iterdir()), [])

    def test_no_replay_and_partial_failures_never_publish(self):
        cases = [
            (lambda *a, **kw: ([], False), 'NO_REPLAY'),
            (lambda *a, **kw: ([edge()], True) if a[1] == 0 else ([edge(cursor='c1')], True), 'INVALID_ARCHIVE'),
            (lambda *a, **kw: (_ for _ in ()).throw(acquire.AcquireError('EXTRACTOR_FAILED')), 'EXTRACTOR_FAILED'),
        ]
        for fetch, code in cases:
            with self.subTest(code=code), self.assertRaises(acquire.AcquireError) as raised:
                acquire.twitch_acquire(URL, str(self.output), fetch_page=fetch)
            self.assertEqual(raised.exception.code, code)
            self.assertEqual(list(self.base.iterdir()), [])

    def test_bounded_size_and_cancellation(self):
        with mock.patch.object(acquire, 'TWITCH_MAX_BYTES', 200), self.assertRaises(acquire.AcquireError) as error:
            acquire.twitch_acquire(URL, str(self.output), fetch_page=lambda *a, **kw: ([edge()], False))
        self.assertEqual(error.exception.code, 'OUTPUT_LIMIT')
        self.assertEqual(list(self.base.iterdir()), [])
        with mock.patch.object(acquire, 'TWITCH_MAX_SECONDS', -1), self.assertRaises(acquire.AcquireError) as error:
            acquire.twitch_acquire(URL, str(self.output), fetch_page=lambda *a, **kw: ([edge()], False))
        self.assertEqual(error.exception.code, 'TIMEOUT')
        self.assertEqual(list(self.base.iterdir()), [])

    def test_preexisting_data_or_symlinks_are_never_touched(self):
        self.output.mkdir()
        (self.output / 'keep').write_text('do not touch')
        with self.assertRaises(acquire.AcquireError):
            acquire.twitch_acquire(URL, str(self.output))
        self.assertEqual((self.output / 'keep').read_text(), 'do not touch')
        self.assertEqual(sorted(p.name for p in self.base.iterdir()), ['result'])

    def test_request_is_fixed_public_query_with_no_credentials(self):
        captured = {}
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *a): pass
            def geturl(self): return acquire.TWITCH_GQL_URL
            def read(self, limit):
                captured['max_read'] = limit
                return json.dumps({'data': {'video': {'comments': {
                    'edges': [edge()], 'pageInfo': {'hasNextPage': False}}}}}).encode()
        def urlopen(req, **kwargs):
            captured['request'] = req
            return Response()
        with mock.patch.object(acquire.urllib.request, 'urlopen', urlopen):
            rows, more = acquire.twitch_page('2922164492', 42)
        self.assertEqual(len(rows), 1)
        self.assertFalse(more)
        req = captured['request']
        self.assertEqual(req.full_url, 'https://gql.twitch.tv/gql')
        self.assertEqual(req.get_method(), 'POST')
        self.assertNotIn('Authorization', req.headers)
        self.assertNotIn('Cookie', req.headers)
        self.assertEqual(json.loads(req.data)['variables'], {'videoID': '2922164492', 'contentOffsetSeconds': 42})
        self.assertEqual(captured['max_read'], acquire.TWITCH_MAX_PAGE_BYTES + 1)

    def test_bounded_http_errors_do_not_attempt_authentication(self):
        def error(code):
            def throw(req, **kwargs):
                raise urllib.error.HTTPError(req.full_url, code, 'synthetic', {}, None)
            return throw
        for code, expected in [(401, 'ACCESS_REQUIRED'), (403, 'ACCESS_REQUIRED'),
                               (429, 'RATE_LIMITED'), (500, 'EXTRACTOR_FAILED')]:
            with self.subTest(code=code), mock.patch.object(acquire.urllib.request, 'urlopen', error(code)):
                with self.assertRaises(acquire.AcquireError) as raised:
                    acquire.twitch_page('2922164492')
                self.assertEqual(raised.exception.code, expected)

    def test_invalid_nodes_do_not_invent_replay_timestamps(self):
        for value in [-1, float('nan'), None, True, 2592001]:
            self.assertIsNone(acquire.normalize_twitch_comment(edge(seconds=value)))
        self.assertIsNone(acquire.normalize_twitch_comment({'cursor': 'x', 'node': {'message': {}}}))


if __name__ == '__main__':
    unittest.main()
