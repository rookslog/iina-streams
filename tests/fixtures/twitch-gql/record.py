#!/usr/bin/env python3
"""Record sanitized public Twitch comment pages as replay fixtures (issue #17).

Not run by the test suite. Usage, from the repository root:

    python3 -I tests/fixtures/twitch-gql/record.py <case-name>

It drives the real twitch_acquire() with a wrapper around the real twitch_page()
(the same public VideoCommentsByOffsetOrCursor request the product makes), saves
every page the product asked for, and writes tests/fixtures/twitch-gql/<case>.json.

Only fields that helpers/acquire.py reads are kept. Display names are replaced by
stable pseudonyms, and URLs, e-mail addresses, IPv4/IPv6 addresses and long
token-like strings in message text are masked. No request headers, cookies,
signed URLs or user ids are stored. Comment ids are kept because the product
deduplicates on them.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys
import tempfile
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]

CASES = {
    # case name: (video id, kind, [seek positions in seconds])
    'bursty': ('2930971003', 'bursty chat; regression VOD for the same-second page stall', [290, 4000]),
    'quiet': ('2935071414', 'quiet chat; one page spans hours, window start far past the seek', [0, 12000, 16000]),
    'end-of-vod': ('2923174759', 'windows that reach the end of the VOD (hasNextPage false)', [18540, 18590]),
    'long-vod': ('2922164492', 'VOD of more than 9 hours (12.5 h)', [0, 22000, 45100]),
}

URL = re.compile(r'(?i)\b(?:https?://|www\.)\S+')
EMAIL = re.compile(r'(?i)\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b')
IPV4 = re.compile(r'\b(?:\d{1,3}\.){3}\d{1,3}\b')
IPV6 = re.compile(r'(?i)\b(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}\b')
TOKEN = re.compile(r'\b(?:oauth:)?[A-Za-z0-9_\-]{28,}\b')
MENTION = re.compile(r'(?<![\w@])@\w{2,40}')


def mask_text(text):
    for pattern, label in ((URL, '[link]'), (EMAIL, '[email]'), (MENTION, '@viewer'), (IPV4, '[ip]'),
                           (IPV6, '[ip]'), (TOKEN, '[masked]')):
        text = pattern.sub(label, text)
    return text


def pseudonym(name, salt):
    digest = hashlib.sha256((salt + '|' + str(name)).encode('utf-8')).hexdigest()
    return 'viewer' + digest[:6]


def sanitize_edge(edge, salt):
    node = edge['node']
    commenter = node.get('commenter')
    message = node['message']
    name = (commenter.get('displayName') or commenter.get('login')) if isinstance(commenter, dict) else None
    clean = {'node': {
        'id': node.get('id'),
        'contentOffsetSeconds': node['contentOffsetSeconds'],
        'commenter': {'displayName': pseudonym(name, salt)} if name else None,
        'message': {
            'fragments': [{'text': mask_text(f['text'])} for f in message['fragments']
                          if isinstance(f, dict) and isinstance(f.get('text'), str)],
            'userColor': message.get('userColor'),
            'userBadges': [{'id': b['id']} for b in (message.get('userBadges') or [])
                           if isinstance(b, dict) and isinstance(b.get('id'), str)],
        },
    }}
    return clean


def load_acquire():
    spec = importlib.util.spec_from_file_location('recording_acquire', ROOT / 'helpers' / 'acquire.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def record(case):
    video_id, kind, positions = CASES[case]
    acquire = load_acquire()
    pages = {}

    def fetch(vid, offset, **kwargs):
        time.sleep(0.25)
        edges, more = acquire.twitch_page(vid, offset, timeout=kwargs.get('timeout', 12))
        pages[str(offset)] = {'edges': [sanitize_edge(e, video_id) for e in edges], 'hasNextPage': more}
        return edges, more

    for position in positions:
        with tempfile.TemporaryDirectory() as temp:
            result = acquire.twitch_acquire(
                'https://www.twitch.tv/videos/' + video_id, str(Path(temp) / 'out'),
                at=position, fetch_page=fetch)
            print(case, position, 'pages', result['window']['pages'], 'count', result['window']['count'],
                  'more', result['window']['hasMore'], 'bounded', result['window']['bounded'])
    body = {'videoId': video_id, 'kind': kind, 'recorded': time.strftime('%Y-%m-%d'),
            'seeks': positions, 'pages': dict(sorted(pages.items(), key=lambda kv: int(kv[0])))}
    target = HERE / (case + '.json')
    target.write_text(json.dumps(body, separators=(',', ':'), ensure_ascii=True) + '\n', encoding='utf-8')
    print('wrote', target.name, target.stat().st_size, 'bytes,', len(pages), 'pages')


if __name__ == '__main__':
    record(sys.argv[1])
