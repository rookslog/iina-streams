#!/usr/bin/env python3
"""Open a public source through the production managed-player path and record decoding."""
import argparse
import json
import time
from control import call, ROOT

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', required=True)
parser.add_argument('--source', required=True)
parser.add_argument('--from-source', default='2922164492')
parser.add_argument('--name', required=True)
args = parser.parse_args()
before = call('snapshot', {}, args.from_source)
started = time.monotonic()
call('open', {'url': args.url}, args.from_source)
deadline = time.monotonic() + 55
while time.monotonic() < deadline:
    result = call('snapshot', {}, args.source)
    n = result['state']['native']
    if n.get('height') and n.get('audioCodec') and not n.get('idle'):
        time.sleep(2)  # Allow the host's initial file-open sizing/resume sequence to settle.
        call('pause', {'value': True}, args.source)
        time.sleep(.5)
        result = call('snapshot', {}, args.source)
        break
    if result['state']['controller'].get('error'):
        break
    time.sleep(.5)
original = call('snapshot', {}, args.from_source)
n = result['state']['native']
checks = {'videoDecoded': bool(n.get('height')), 'audioDecoded': bool(n.get('audioCodec')),
          'sourceMatched': result['state']['controller']['source']['id'] == args.source,
          'chatOffByDefault': result['state']['controller']['chat']['mode'] == 'off',
          'noError': not result['state']['controller'].get('error'),
          'originalWindowUnchanged': original['state']['native'] == before['state']['native']}
record = {'publicURL': args.url, 'elapsedSeconds': time.monotonic()-started,
          'checks': checks, 'beforeOriginal': before, 'afterOriginal': original, 'opened': result}
(ROOT/'evidence/native'/(args.name+'.json')).write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({'checks':checks,'elapsedSeconds':record['elapsedSeconds'],
                  'native':n,'source':result['state']['controller']['source'],
                  'error':result['state']['controller'].get('error')},indent=2))
raise SystemExit(0 if all(checks.values()) else 1)
