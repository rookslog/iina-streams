#!/usr/bin/env python3
"""Summarize six existing resource captures; read-only, no native/UI actions."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import statistics
import sys

MODES = ('off', 'sidebar', 'overlay')
MATCH_KEYS = ('sourceId', 'quality', 'videoCodec', 'videoWidth', 'videoHeight', 'videoFps',
              'audioCodec', 'audioSampleRate', 'hardwareDecode', 'windowWidth', 'windowHeight',
              'sidebarWidth', 'fullscreen', 'playbackSpeed', 'paused', 'chatMode', 'presentation',
              'fontSize', 'opacity', 'replayOffset', 'rowLimit', 'otherPlayerCount')


def read_json(path):
    with path.open('rb') as stream:
        raw = stream.read(8 * 1024 * 1024 + 1)
    if len(raw) > 8 * 1024 * 1024:
        raise ValueError('FILE_LIMIT')
    return json.loads(raw), hashlib.sha256(raw).hexdigest()


def stats(values, divisor=1):
    numbers = [v / divisor for v in values if isinstance(v, (float, int)) and not isinstance(v, bool) and math.isfinite(v)]
    if not numbers:
        return None
    return {'n': len(numbers), 'min': round(min(numbers), 3), 'median': round(statistics.median(numbers), 3),
            'max': round(max(numbers), 3)}


def summarize(directory):
    output = {'schemaVersion': 1, 'runs': [], 'conditions': {}, 'missingOrUnreadable': [], 'pairs': [],
              'limitations': ['Short QA-host observations, not production-plugin overhead or long-session evidence.',
                              'WindowServer and system memory/swap are shared; unowned WebKit remains excluded.',
                              'No total-efficiency, battery, energy, or leak conclusion is generated.']}
    for variant in ('unified', 'focus'):
        conditions = {}
        try:
            record, conditions_hash = read_json(directory / (variant + '-conditions.json'))
            conditions = {item['mode']: item for item in record.get('conditions', [])}
            off = record.get('afterOff', {})
            output['conditions'][variant] = {'sha256': conditions_hash, 'completedUTC': record.get('completedUTC'),
                'pid': record.get('pid'), 'checks': record.get('checks'),
                'afterOff': {'mode': off.get('controller', {}).get('chat', {}).get('mode'),
                             'messageCount': len(off.get('controller', {}).get('messages', [])),
                             'activeHelpers': off.get('native', {}).get('activeHelpers')}}
        except (OSError, ValueError, KeyError, TypeError):
            conditions_hash = None
        for mode in MODES:
            name = variant + '-' + mode + '.json'
            try:
                data, digest = read_json(directory / name)
                samples = data.get('samples', [])
                if not isinstance(samples, list) or not samples:
                    raise ValueError('NO_SAMPLES')
                condition = conditions.get(mode, {})
                before, after = condition.get('before', {}).get('native', {}), condition.get('after', {}).get('native', {})
                roots = [item.get('root', {}) for item in samples]
                windows = [row for item in samples for row in item.get('windowServer', [])]
                errors = list(data.get('queryErrors', []))
                for item in samples:
                    errors.extend(item.get('system', {}).get('errors', []))
                run = {'file': name, 'sha256': digest, 'conditionsSHA256': conditions_hash,
                       'conditionChecksumMatches': condition.get('sha256') == digest if condition else None,
                       'ok': data.get('ok'), 'label': data.get('label'), 'rootPID': data.get('rootPID'),
                       'startedUTC': data.get('startedUTC'), 'endedUTC': data.get('endedUTC'),
                       'elapsedSeconds': data.get('elapsedSeconds'), 'sampleCount': len(samples),
                       'terminationReason': data.get('terminationReason'), 'warmupSeconds': condition.get('warmupSeconds'),
                       'samplerSHA256': data.get('samplerSHA256'), 'environment': data.get('environment'),
                       'metadata': data.get('operatorMetadata', {}), 'queryErrors': errors,
                       'rootCPUPercent': stats([r.get('cpuPercent') for r in roots]),
                       'rootRSSMiB': stats([r.get('rssKiB') for r in roots], 1024),
                       'scopedCPUPercent': stats([s.get('scopedTotal', {}).get('cpuPercent') for s in samples]),
                       'scopedRSSMiB': stats([s.get('scopedTotal', {}).get('rssKiB') for s in samples], 1024),
                       'windowServerCPUPercent': stats([r.get('cpuPercent') for r in windows]),
                       'windowServerRSSMiB': stats([r.get('rssKiB') for r in windows], 1024),
                       'descendantCounts': sorted({len(s.get('descendants', [])) for s in samples}),
                       'explicitHelperCounts': sorted({len(s.get('explicitHelpers', [])) for s in samples}),
                       'unattributedWebKitCounts': sorted({s.get('unattributedWebKitCount', 0) for s in samples}),
                       'memoryFreePercent': stats([s.get('system', {}).get('memoryFreePercent') for s in samples]),
                       'swapUsedChangeBytes': data.get('swapUsedChangeBytes'), 'vmCounterDeltas': data.get('vmCounterDeltas'),
                       'beforeAfter': {key: [before.get(key), after.get(key)] for key in
                                       ('position', 'paused', 'speed', 'height', 'videoCodec', 'videoFps', 'audioCodec',
                                        'audioRate', 'hwdec', 'activeHelpers', 'droppedFrames', 'pausedForCache', 'fullscreen', 'frame')}}
                run['rootIdentityStable'] = len({(r.get('pid'), r.get('startedUTC')) for r in roots}) == 1
                output['runs'].append(run)
            except (OSError, ValueError, KeyError, TypeError):
                output['missingOrUnreadable'].append(name)
    for mode in MODES:
        left = next((r for r in output['runs'] if r['file'] == 'unified-' + mode + '.json'), None)
        right = next((r for r in output['runs'] if r['file'] == 'focus-' + mode + '.json'), None)
        if left and right:
            mismatches = {k: [left['metadata'].get(k), right['metadata'].get(k)] for k in MATCH_KEYS
                          if left['metadata'].get(k) != right['metadata'].get(k)}
            missing = [k for k in MATCH_KEYS if k not in left['metadata'] or k not in right['metadata']]
            output['pairs'].append({'mode': mode, 'metadataDifferences': mismatches, 'missingMetadata': missing,
                                    'elapsedSeconds': [left['elapsedSeconds'], right['elapsedSeconds']],
                                    'totalWebKitAttributionComplete': False})
    output['allSixAvailable'] = len(output['runs']) == 6
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, required=True)
    args = parser.parse_args()
    result = summarize(args.directory)
    print(json.dumps(result, ensure_ascii=True, allow_nan=False, indent=2))
    return 0 if result['allSixAvailable'] else 1


if __name__ == '__main__':
    sys.exit(main())
