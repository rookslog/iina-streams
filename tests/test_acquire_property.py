"""Recorded-fixture replay and seeded property tests for Twitch VOD acquisition (issue #17).

Fixtures under tests/fixtures/twitch-gql/ are sanitized pages of real public Twitch VOD chat,
recorded with record.py through the product's own request. The network is faked at
urllib.request.urlopen, so the real twitch_page() parser and request builder run too.

Model of the host: the page server below follows what the recorded pages show. A page holds up to a
fixed number of comments, starts at the first comment at or shortly before the requested offset
(or at the next comment after a gap, which can be hours later), and says whether more follow. It
is not a model of Twitch's integrity checks, rate limits or error responses.
"""
import importlib.util
import json
from pathlib import Path
import random
import re
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / 'tests' / 'fixtures' / 'twitch-gql'


def load(name, relative):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


acquire = load('property_twitch_acquire', 'helpers/acquire.py')
replay = load('property_twitch_replay', 'helpers/replay.py')
MAX_SECONDS = 2592000


class Response:
    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def geturl(self):
        return acquire.TWITCH_GQL_URL

    def read(self, limit):
        return self.body[:limit]


def envelope(edges, has_next):
    return json.dumps({'data': {'video': {'comments': {
        'edges': edges, 'pageInfo': {'hasNextPage': has_next}}}}}).encode('utf-8')


class FakeNetwork:
    """Stands in for urllib.request.urlopen. Subclasses decide the page for an offset."""

    def __init__(self):
        self.offsets = []

    def __call__(self, request, **kwargs):
        variables = json.loads(request.data)['variables']
        offset = variables['contentOffsetSeconds']
        self.offsets.append(offset)
        edges, has_next = self.page(variables['videoID'], offset)
        return Response(envelope(edges, has_next))

    def page(self, video_id, offset):
        raise NotImplementedError


class FixtureNetwork(FakeNetwork):
    """Serves recorded pages by exact offset. A new offset means the fixture no longer matches."""

    def __init__(self, fixture):
        super().__init__()
        self.fixture = fixture

    def page(self, video_id, offset):
        assert video_id == self.fixture['videoId'], 'unexpected video id'
        recorded = self.fixture['pages'].get(str(offset))
        assert recorded is not None, 'offset %d is not in the fixture; re-record it' % offset
        return recorded['edges'], recorded['hasNextPage']


class ScriptedNetwork(FakeNetwork):
    """Serves a list of (edges, has_next) answers in order; the last one repeats."""

    def __init__(self, answers):
        super().__init__()
        self.answers = answers

    def page(self, video_id, offset):
        index = min(len(self.offsets) - 1, len(self.answers) - 1)
        return self.answers[index]


def comment(identifier, seconds, name='viewer000000', text='hi'):
    return {'node': {
        'id': identifier, 'contentOffsetSeconds': seconds, 'commenter': {'displayName': name},
        'message': {'fragments': [{'text': text}], 'userColor': '#112233', 'userBadges': []}}}


class AcquisitionCase(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.output = self.base / 'result'
        self.counter = 0

    def acquire(self, network, at=0, video_id='2922164492'):
        url = 'https://www.twitch.tv/videos/' + video_id
        with mock.patch.object(acquire.urllib.request, 'urlopen', network):
            return acquire.twitch_acquire(url, str(self.output), at=at)

    def acquire_fresh(self, network, at=0, video_id='2922164492'):
        self.counter += 1
        self.output = self.base / ('result%d' % self.counter)
        return self.acquire(network, at, video_id)

    def archive(self, result):
        return json.loads(Path(result['path']).read_text())

    def leftovers(self):
        return sorted(path.name for path in self.base.iterdir())


def assert_offsets_never_decrease(case, offsets):
    """Query offsets only grow. The single allowed repeat is the one retry of an empty page."""
    for before, after in zip(offsets, offsets[1:]):
        case.assertGreaterEqual(after, before, offsets)
    for position in range(2, len(offsets)):
        case.assertFalse(offsets[position] == offsets[position - 1] == offsets[position - 2], offsets)


# case -> seek -> (pages, count, hasMore), copied from the first run against the recorded data.
GOLDEN = {
    'bursty': {290: (10, 402, True), 4000: (5, 224, True)},
    'quiet': {0: (1, 59, True), 12000: (1, 59, True), 16000: (1, 19, False)},
    'end-of-vod': {18540: (3, 123, False), 18590: (1, 22, False)},
    'long-vod': {0: (1, 59, True), 22000: (1, 58, True), 45100: (3, 111, False)},
}


def load_fixture(case):
    return json.loads((FIXTURES / (case + '.json')).read_text())


class RecordedFixtureTests(AcquisitionCase):
    def test_every_recorded_seek_terminates_with_increasing_offsets_and_a_valid_archive(self):
        for case, expected in GOLDEN.items():
            fixture = load_fixture(case)
            self.assertEqual(sorted(expected), sorted(fixture['seeks']), case)
            for seek, (pages, count, has_more) in expected.items():
                with self.subTest(case=case, seek=seek):
                    network = FixtureNetwork(fixture)
                    result = self.acquire_fresh(network, at=seek, video_id=fixture['videoId'])
                    window = result['window']
                    self.assertLessEqual(len(network.offsets), acquire.TWITCH_MAX_PAGES)
                    self.assertEqual(network.offsets, sorted(set(network.offsets)))
                    self.assertEqual((window['pages'], window['count'], window['hasMore']),
                                     (pages, count, has_more))
                    self.assertFalse(window['bounded'])
                    self.assertNotIn('diagnostic', window)
                    records = self.archive(result)['records']
                    ids = [row['id'] for row in records]
                    self.assertEqual(len(ids), len(set(ids)))
                    self.assertTrue(all(0 <= row['time'] <= MAX_SECONDS for row in records))
                    self.assertEqual(window['start'], min(row['time'] for row in records))
                    self.assertEqual(window['end'], max(row['time'] for row in records))

    def test_archives_import_with_the_replay_parser_in_time_order(self):
        for case in GOLDEN:
            fixture = load_fixture(case)
            for seek in fixture['seeks']:
                with self.subTest(case=case, seek=seek):
                    result = self.acquire_fresh(FixtureNetwork(fixture), at=seek, video_id=fixture['videoId'])
                    target = self.base / ('indexed-%s-%d' % (case, seek))
                    imported = replay.import_archive(result['path'], str(target), 'twitch', fixture['videoId'])
                    self.assertEqual(imported['metadata']['count'], result['window']['count'])
                    times = []
                    for chunk in imported['metadata']['chunks']:
                        times += [row['time'] for row in json.loads((target / chunk['file']).read_text())]
                    self.assertEqual(times, sorted(times))

    def test_end_of_vod_windows_stop_when_twitch_says_no_more_pages(self):
        fixture = load_fixture('end-of-vod')
        network = FixtureNetwork(fixture)
        result = self.acquire(network, at=18540, video_id=fixture['videoId'])
        self.assertFalse(result['window']['hasMore'])
        self.assertFalse(fixture['pages'][str(network.offsets[-1])]['hasNextPage'])
        self.assertEqual(result['window']['pages'], len(network.offsets))

    def test_long_vod_seek_past_nine_hours(self):
        fixture = load_fixture('long-vod')
        late = max(fixture['seeks'])
        self.assertGreaterEqual(late, 9 * 3600)
        result = self.acquire(FixtureNetwork(fixture), at=late, video_id=fixture['videoId'])
        self.assertGreaterEqual(result['window']['start'], 9 * 3600)
        self.assertGreaterEqual(result['window']['end'], late)

    def test_quiet_vod_window_can_start_far_after_the_seek(self):
        # Observed: in a gap Twitch returns the next comments, hours after the requested offset.
        fixture = load_fixture('quiet')
        result = self.acquire(FixtureNetwork(fixture), at=0, video_id=fixture['videoId'])
        self.assertEqual(result['window']['pages'], 1)
        self.assertGreater(result['window']['start'], 3600)
        self.assertEqual(result['window']['requested'], 0)

    def test_bursty_regression_window_is_not_lost_to_same_second_pages(self):
        fixture = load_fixture('bursty')
        network = FixtureNetwork(fixture)
        result = self.acquire(network, at=290, video_id=fixture['videoId'])
        self.assertGreater(result['window']['end'], 290 + acquire.TWITCH_LOOKAHEAD_SECONDS - 10)
        self.assertEqual(network.offsets, sorted(set(network.offsets)))


class FixtureSanitizationTests(unittest.TestCase):
    UNSAFE = [re.compile(pattern) for pattern in (
        r'(?i)https?:', r'(?i)www\.', r'(?i)oauth', r'(?i)token', r'(?i)signature',
        r'\b(?:\d{1,3}\.){3}\d{1,3}\b', r'(?i)\b[\w.+-]+@[\w-]+\.\w+', r'\S{28,}')]
    NODE_KEYS = {'id', 'contentOffsetSeconds', 'commenter', 'message'}
    MESSAGE_KEYS = {'fragments', 'userColor', 'userBadges'}

    def test_fixtures_keep_only_parser_fields_and_no_secrets_or_identities(self):
        names = sorted(path.name for path in FIXTURES.glob('*.json'))
        self.assertEqual(names, sorted(case + '.json' for case in GOLDEN))
        for name in names:
            fixture = json.loads((FIXTURES / name).read_text())
            self.assertEqual(set(fixture), {'videoId', 'kind', 'recorded', 'seeks', 'pages'})
            for offset, page in fixture['pages'].items():
                self.assertEqual(set(page), {'edges', 'hasNextPage'})
                for edge in page['edges']:
                    node = edge['node']
                    self.assertEqual(set(edge), {'node'})
                    self.assertEqual(set(node), self.NODE_KEYS)
                    self.assertEqual(set(node['message']), self.MESSAGE_KEYS)
                    if node['commenter'] is not None:  # Twitch sends null for deleted accounts.
                        self.assertEqual(set(node['commenter']), {'displayName'})
                        self.assertRegex(node['commenter']['displayName'], r'^viewer[0-9a-f]{6}$')
                    for fragment in node['message']['fragments']:
                        for pattern in self.UNSAFE:
                            self.assertIsNone(pattern.search(fragment['text']), (name, offset, pattern.pattern))


class EmptyPageWithMorePagesTests(AcquisitionCase):
    """Decision (issue #17): an empty page that says more follow is retried once at the same
    offset. If it is still empty, acquisition ends: the messages already gathered are published
    with hasMore true and a diagnostic, or NO_REPLAY if there are none. Never INVALID_ARCHIVE."""

    def test_one_empty_page_is_retried_once_then_acquisition_continues(self):
        network = ScriptedNetwork([
            ([comment('a', 3)], True), ([], True), ([comment('b', 9)], False)])
        result = self.acquire(network)
        self.assertEqual(network.offsets, [0, 4, 4])
        self.assertEqual([row['id'] for row in self.archive(result)['records']], ['a', 'b'])
        self.assertFalse(result['window']['hasMore'])
        self.assertNotIn('diagnostic', result['window'])

    def test_second_empty_page_ends_with_partial_window_and_diagnostic(self):
        network = ScriptedNetwork([([comment('a', 3)], True), ([], True)])
        result = self.acquire(network)
        self.assertEqual(network.offsets, [0, 4, 4])
        self.assertEqual([row['id'] for row in self.archive(result)['records']], ['a'])
        self.assertTrue(result['window']['hasMore'])
        self.assertFalse(result['window']['bounded'])
        self.assertEqual(result['window']['diagnostic'], 'EMPTY_PAGE_WITH_MORE')

    def test_empty_first_page_with_more_ends_as_no_replay_after_one_retry(self):
        network = ScriptedNetwork([([], True)])
        with self.assertRaises(acquire.AcquireError) as raised:
            self.acquire(network)
        self.assertEqual(raised.exception.code, 'NO_REPLAY')
        self.assertEqual(network.offsets, [0, 0])
        self.assertEqual(self.leftovers(), [])

    def test_retry_budget_resets_after_a_non_empty_page(self):
        network = ScriptedNetwork([
            ([comment('a', 3)], True), ([], True), ([comment('b', 9)], True),
            ([], True), ([comment('c', 90)], False)])
        result = self.acquire(network)
        self.assertEqual(network.offsets, [0, 4, 4, 10, 10])
        self.assertEqual([row['id'] for row in self.archive(result)['records']], ['a', 'b', 'c'])
        self.assertNotIn('diagnostic', result['window'])

    def test_empty_page_without_more_pages_still_ends_quietly(self):
        network = ScriptedNetwork([([comment('a', 3)], True), ([], False)])
        result = self.acquire(network)
        self.assertEqual(network.offsets, [0, 4])
        self.assertFalse(result['window']['hasMore'])
        self.assertNotIn('diagnostic', result['window'])

    def test_malformed_pages_still_fail_as_invalid_archive(self):
        for body in (b'[]', b'{', json.dumps({'data': {'video': {'comments': {
                'edges': {}, 'pageInfo': {'hasNextPage': True}}}}}).encode()):
            def urlopen(request, **kwargs):
                return Response(body)
            with self.subTest(body=body[:12]), mock.patch.object(acquire.urllib.request, 'urlopen', urlopen):
                with self.assertRaises(acquire.AcquireError) as raised:
                    acquire.twitch_acquire('https://www.twitch.tv/videos/1', str(self.base / 'x'))
            self.assertEqual(raised.exception.code, 'INVALID_ARCHIVE')


class GeneratedTimelineNetwork(FakeNetwork):
    """A seeded random chat timeline served the way the recordings behave."""

    def __init__(self, seed, empty_rate):
        super().__init__()
        rng = random.Random(seed)
        self.seed = seed
        self.empty_rate = empty_rate
        self.page_size = rng.choice([1, 2, 5, 20, 59, 59, 80, 500])
        self.lookback_limit = rng.choice([0, 0, 10, 50])
        length = rng.choice([90, 700, 3600, 40000])
        self.comments = self.make_comments(rng, length)
        self.served = 0
        self.injected = []

    @staticmethod
    def make_comments(rng, length):
        times = []
        for _ in range(rng.randint(0, 40)):
            centre = rng.uniform(0, length)
            for _ in range(rng.choice([1, 3, 10, 80, 300])):
                moment = min(length, centre + rng.uniform(0, rng.choice([0, 1, 5, 60])))
                times.append(int(moment) if rng.random() < 0.5 else round(moment, 3))
        times.sort()
        return [comment('c%d' % number, moment) for number, moment in enumerate(times)]

    def page(self, video_id, offset):
        rng = random.Random('%s:%d:%d' % (self.seed, offset, len(self.offsets)))
        if self.empty_rate and rng.random() < self.empty_rate:
            self.injected.append(True)
            return [], True
        self.injected.append(False)
        floor = offset - rng.randint(0, self.lookback_limit)
        start = next((i for i, edge in enumerate(self.comments)
                      if edge['node']['contentOffsetSeconds'] >= floor), len(self.comments))
        edges = self.comments[start:start + self.page_size]
        self.served += len(edges)
        return edges, start + len(edges) < len(self.comments)


class GeneratedPageSequenceTests(AcquisitionCase):
    SEEDS = 400

    def run_seed(self, seed):
        rng = random.Random(seed * 7919 + 1)
        empty_rate = rng.choice([0, 0, 0.1, 0.5, 1])
        network = GeneratedTimelineNetwork(seed, empty_rate)
        seek = rng.choice([0, 0, 30, 640, 3500, 39000])
        try:
            return network, self.acquire_fresh(network, at=seek), None
        except acquire.AcquireError as error:
            return network, None, error.code

    def test_generated_sequences_terminate_keep_offsets_and_avoid_invalid_archive(self):
        outcomes = {'published': 0, 'NO_REPLAY': 0, 'diagnostic': 0, 'bounded': 0}
        for seed in range(self.SEEDS):
            network, result, code = self.run_seed(seed)
            with self.subTest(seed=seed):
                self.assertLessEqual(len(network.offsets), acquire.TWITCH_MAX_PAGES)
                assert_offsets_never_decrease(self, network.offsets)
                self.assertTrue(all(isinstance(offset, int) and offset >= 0 for offset in network.offsets))
                if result is None:
                    self.assertEqual(code, 'NO_REPLAY')
                    self.assertEqual(network.served, 0)
                    outcomes['NO_REPLAY'] += 1
                    continue
                window = result['window']
                records = self.archive(result)['records']
                ids = [row['id'] for row in records]
                self.assertEqual(len(ids), len(set(ids)))
                self.assertEqual(window['count'], len(records))
                self.assertGreater(len(records), 0)
                self.assertEqual(window['pages'], len(network.offsets))
                self.assertLessEqual(window['start'], window['end'])
                self.assertTrue(all(0 <= row['time'] <= MAX_SECONDS for row in records))
                if 'diagnostic' in window:
                    self.assertEqual(window['diagnostic'], 'EMPTY_PAGE_WITH_MORE')
                    self.assertTrue(window['hasMore'])
                    self.assertEqual(network.injected[-2:], [True, True])
                    self.assertEqual(network.offsets[-1], network.offsets[-2])
                    outcomes['diagnostic'] += 1
                if network.empty_rate == 0:
                    self.assertNotIn('diagnostic', window)
                outcomes['published'] += 1
                outcomes['bounded'] += 1 if window['bounded'] else 0
        for name in ('published', 'NO_REPLAY', 'diagnostic', 'bounded'):
            self.assertGreater(outcomes[name], 0, 'the generator never produced %s: %s' % (name, outcomes))

    def test_generated_sequences_are_deterministic_for_a_seed(self):
        first = self.run_seed(17)[0].offsets
        second = self.run_seed(17)[0].offsets
        self.assertEqual(first, second)


if __name__ == '__main__':
    unittest.main()
