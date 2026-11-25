"""Offline replay contract tests. Every archive here is deliberately synthetic."""
import gzip
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

HELPER = pathlib.Path(__file__).resolve().parents[1] / 'helpers/replay.py'


class ReplayImportTests(unittest.TestCase):
    def invoke(self, raw, extra=(), name='synthetic.json', output_setup=None):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        base = pathlib.Path(temp.name)
        src, out = base / name, base / 'normalized'
        src.write_bytes(raw if isinstance(raw, bytes) else raw.encode())
        if output_setup:
            output_setup(out)
        result = subprocess.run([sys.executable, '-B', str(HELPER), 'import', '--input', str(src), '--output', str(out), *extra], capture_output=True, text=True, timeout=30)
        self.assertTrue(result.stdout.startswith('{'), 'importer must return a structured result')
        response = json.loads(result.stdout)
        self.assertEqual(result.stderr, '', 'file-controlled text must not leak via errors')
        self.assertEqual(src.read_bytes(), raw if isinstance(raw, bytes) else raw.encode())
        return response, result, out

    def unpack(self, response, out):
        self.assertTrue(response['ok'], response)
        self.assertEqual(pathlib.Path(response['indexPath']), out / 'index.json')
        index = json.loads((out / 'index.json').read_text())
        records = []
        for chunk in index['chunks']:
            self.assertRegex(chunk['file'], r'^chunk-\d{6}\.json$')
            data = (out / chunk['file']).read_bytes()
            self.assertLessEqual(len(data), 1048576)
            rows = json.loads(data)
            self.assertEqual(len(rows), chunk['count'])
            self.assertLessEqual(len(rows), 1000)
            records.extend(rows)
        self.assertEqual(index['count'], len(records))
        return index, records

    def test_twitch_keeps_full_vod_offsets_sorts_and_preserves_source_identity(self):
        # Regressions: rebasing by video.start, duplicate pagination, unsafe HTML or ID override.
        raw = json.dumps({'FileInfo': {'Version': {'Major': 1, 'Minor': 4, 'Patch': 0}}, 'video': {'id': '12345', 'start': 60, 'end': 600, 'title': 'Synthetic archive'}, 'comments': [
            {'_id': 'b', 'content_offset_seconds': 65.25, 'commenter': {'display_name': 'Beta'}, 'message': {'body': '<script>unsafe()</script>', 'user_color': '#aBc123', 'user_badges': [{'_id': 'moderator', 'version': '1'}]}},
            {'_id': 'a', 'content_offset_seconds': '62.5', 'commenter': {'name': 'Alpha'}, 'message': {'body': 'First'}},
            {'_id': 'b', 'content_offset_seconds': 65.25, 'message': {'body': 'Duplicate'}}]})
        response, result, out = self.invoke(raw, ['--provider', 'twitch', '--source-id', '999'])
        index, rows = self.unpack(response, out)
        self.assertEqual(result.returncode, 0)
        self.assertEqual([(x['id'], x['time']) for x in rows], [('a', 62.5), ('b', 65.25)])
        self.assertEqual(rows[1]['text'], '<script>unsafe()</script>')
        self.assertEqual(rows[1]['badges'], ['moderator'])
        self.assertEqual(index['sourceId'], '12345')
        self.assertEqual(index['sourceMismatch'], {'requested': '999', 'embedded': '12345'})
        self.assertEqual(index['timeline']['mediaOriginSeconds'], 0)
        self.assertEqual(index['warnings']['duplicates'], 1)
        self.assertFalse(index['provenance']['verified'])

    def test_youtube_offsets_are_wrapper_milliseconds_and_removals_are_historical(self):
        # Regressions: use Unix timestamp, lose sibling actions or fail to fold deletion time.
        def message(mid, author, runs):
            return {'addChatItemAction': {'item': {'liveChatTextMessageRenderer': {'id': mid, 'authorName': {'simpleText': author}, 'authorExternalChannelId': 'UCsynthetic', 'timestampUsec': '1700000000000000', 'message': {'runs': runs}}}}}
        raw = '\n'.join(json.dumps(x) for x in [
            {'replayChatItemAction': {'videoOffsetTimeMsec': '1250', 'actions': [message('m1', 'A', [{'text': 'Hi '}, {'emoji': {'emojiId': '❤'}}]), message('m2', 'B', [{'text': 'Two'}])]}},
            {'replayChatItemAction': {'videoOffsetTimeMsec': '5000', 'actions': [{'markChatItemAsDeletedAction': {'targetItemId': 'm1'}}]}},
            {'addChatItemAction': {'item': {'liveChatTextMessageRenderer': {'id': 'untimed', 'message': {'runs': [{'text': 'Do not guess'}]}, 'timestampUsec': '1700000001000000'}}}}
        ]) + '\n'
        response, _, out = self.invoke(raw, ['--source-id', 'abcDEF123_-'], 'synthetic.live_chat.json')
        index, rows = self.unpack(response, out)
        self.assertEqual(index['provider'], 'youtube')
        self.assertEqual(index['sourceId'], 'abcDEF123_-')
        self.assertEqual([(x['id'], x['time'], x['text']) for x in rows], [('m1', 1.25, 'Hi ❤'), ('m2', 1.25, 'Two')])
        self.assertEqual(rows[0]['deletedAt'], 5)
        self.assertNotIn('deletedAt', rows[1])
        self.assertGreaterEqual(index['warnings']['missingTimestamp'], 1)

    def test_generic_burst_produces_bounded_chunks_and_stable_equal_time_order(self):
        # Regressions: all-at-once chunks, unstable ties or trusting provenance supplied by file.
        rows = [{'id': str(i), 'time': 10 if i < 1100 else 5, 'author': 'Synthetic', 'text': str(i)} for i in range(2205)]
        response, _, out = self.invoke(json.dumps({'version': 1, 'provider': 'generic', 'records': rows, 'provenance': {'verified': True}}))
        index, actual = self.unpack(response, out)
        self.assertGreaterEqual(len(index['chunks']), 3)
        self.assertEqual([x['id'] for x in actual[:3]], ['1100', '1101', '1102'])
        self.assertEqual(actual[1105]['id'], '0')
        self.assertEqual(index['provenance']['format'], 'iina-streams-replay-v1')
        self.assertFalse(index['provenance']['verified'])

    def test_emotes_tag_survives_import_only_when_the_text_is_unchanged(self):
        # #87 (lead, 2026-11-24): acquired Twitch rows carry the live `emotes` tag; the importer stores it with the
        # row (Codex found this stage dropped it), but only when the stored text is the text the offsets index.
        rows = [
            {'id': 'a', 'time': 1, 'author': 'S', 'text': 'hi sumLove', 'emotes': '80958:3-9'},
            {'id': 'b', 'time': 2, 'author': 'S', 'text': 'plain'},
            {'id': 'c', 'time': 3, 'author': 'S', 'text': 'odd', 'emotes': 7},
            {'id': 'd', 'time': 4, 'author': 'S', 'text': 'long', 'emotes': '25:0-1/' * 400},
            {'id': 'e', 'time': 5, 'author': 'S', 'text': 'x' * 20000, 'emotes': '25:0-1'},
        ]
        response, _, out = self.invoke(json.dumps({'version': 1, 'provider': 'generic', 'records': rows}))
        _, actual = self.unpack(response, out)
        by_id = {x['id']: x for x in actual}
        self.assertEqual(by_id['a'].get('emotes'), '80958:3-9')
        for key in 'bcd':
            self.assertNotIn('emotes', by_id[key], key)
        self.assertNotIn('emotes', by_id['e'], 'text shortened on import: the offsets no longer index it')

    def test_gzip_and_large_embedded_assets_are_streamed_without_decoding_assets(self):
        # Regressions: extension-only gzip detection, materializing unknown asset trees.
        root = {'video': {'id': '2'}, 'comments': [{'_id': 'x', 'content_offset_seconds': 0, 'message': {'fragments': [{'text': 'Fallback fragments'}]}}], 'embeddedData': {'firstParty': [{'data': 'x' * (3 * 1048576)}]}}
        response, _, out = self.invoke(gzip.compress(json.dumps(root).encode()), name='synthetic.data')
        _, rows = self.unpack(response, out)
        self.assertEqual(rows[0]['text'], 'Fallback fragments')
        self.assertEqual(sorted(p.name for p in out.iterdir()), ['chunk-000000.json', 'index.json'])

    def test_bad_records_are_counted_without_inventing_timestamps(self):
        response, _, out = self.invoke(json.dumps({'version': 1, 'records': [
            {'time': -1, 'text': 'bad'}, {'time': 'NaN', 'text': 'bad'}, {'text': 'bad'}, {'time': 1, 'text': 'okay', 'color': 'url(javascript:attack)'}, {'time': 2, 'text': ''}]}))
        index, rows = self.unpack(response, out)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['time'], 1)
        self.assertEqual(rows[0]['color'], '')
        self.assertEqual(index['warnings']['invalidRecords'], 4)

    def test_nonempty_destination_is_never_overwritten(self):
        def setup(out):
            out.mkdir()
            (out / 'keep').write_text('preserve')
        response, result, out = self.invoke('{"version":1,"records":[]}', output_setup=setup)
        self.assertFalse(response['ok'])
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((out / 'keep').read_text(), 'preserve')

    def test_malformed_input_does_not_publish_or_echo_file_controlled_data(self):
        for raw in ['{"version":1,"records":[{"text":"secret-NEVER-ECHO"}', '{"version":2,"records":[{"time":0,"text":"secret-NEVER-ECHO"}]}']:
            with self.subTest(raw=raw[:25]):
                response, result, out = self.invoke(raw)
                self.assertFalse(response['ok'])
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(out.exists())
                self.assertNotIn('secret-NEVER-ECHO', result.stdout)
                self.assertFalse(list(out.parent.glob('.replay-*')))

    def test_an_archive_without_replay_offsets_is_not_claimed_as_replay(self):
        response, result, out = self.invoke('{"addChatItemAction":{"item":{"liveChatTextMessageRenderer":{"id":"x","timestampUsec":"1000000","message":{"runs":[{"text":"hello"}]}}}}\n')
        self.assertFalse(response['ok'])
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(out.exists())

    def test_unicode_lengths_match_the_javascript_render_contract(self):
        # A non-BMP character occupies two JavaScript string code units.
        response, _, out = self.invoke(json.dumps({'version': 1, 'records': [{'time': 0, 'text': '😀' * 9000, 'author': '😀' * 100}]}))
        _, rows = self.unpack(response, out)
        self.assertLessEqual(len(rows[0]['text'].encode('utf-16-le')), 32000)
        self.assertLessEqual(len(rows[0]['author'].encode('utf-16-le')), 256)

    @unittest.skipUnless(hasattr(__import__('os'), 'mkfifo'), 'POSIX named pipes only')
    def test_nonregular_input_cannot_block_before_validation(self):
        import os
        with tempfile.TemporaryDirectory() as tmp:
            fifo = pathlib.Path(tmp) / 'not-an-archive'
            os.mkfifo(fifo)
            try:
                proc = subprocess.run([sys.executable, '-B', str(HELPER), 'import', '--input', str(fifo), '--output', str(pathlib.Path(tmp) / 'out')], capture_output=True, text=True, timeout=2)
            except subprocess.TimeoutExpired:
                self.fail('nonregular input must be rejected without blocking on open')
            self.assertFalse(json.loads(proc.stdout)['ok'])
            self.assertEqual(proc.stderr, '')

    def test_live_capture_pseudo_offsets_are_rejected(self):
        response, result, out = self.invoke(json.dumps({'replayChatItemAction': {'actions': []}, 'videoOffsetTimeMsec': '5000', 'isLive': True}))
        self.assertFalse(response['ok'])
        self.assertEqual(response['error']['code'], 'LIVE_CAPTURE_NOT_REPLAY')
        self.assertFalse(out.exists())

    def test_unicode_bursts_obey_byte_caps_not_only_record_counts(self):
        response, _, out = self.invoke(json.dumps({'version': 1, 'records': [{'id': str(i), 'time': i, 'text': '漢' * 15000} for i in range(50)]}))
        index, rows = self.unpack(response, out)
        self.assertGreater(len(index['chunks']), 1)
        self.assertEqual(len(rows), 50)

    def test_cli_errors_are_structured_and_do_not_echo_arguments(self):
        proc = subprocess.run([sys.executable, '-B', str(HELPER), 'import', '--secret=secret-NEVER-ECHO'], capture_output=True, text=True, timeout=5)
        self.assertTrue(proc.stdout.startswith('{'), 'invalid arguments must be sanitized JSON')
        self.assertEqual(json.loads(proc.stdout)['error']['code'], 'INVALID_ARGUMENTS')
        self.assertEqual(proc.stderr, '')
        self.assertNotIn('secret-NEVER-ECHO', proc.stdout)


if __name__ == '__main__':
    unittest.main()
