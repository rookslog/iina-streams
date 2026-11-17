#!/usr/bin/env python3
"""Opt-in real-source Twitch VOD chat smoke through the packaged helper runner.

Runs only when passed --run, using an isolated temporary directory and public
Twitch VOD. No cookies, tokens, user data, playback or IINA window changes.
Prints only position, message counts, page counts and elapsed time.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time

ROOT=Path(__file__).resolve().parents[1]
VOD='2930971003'
URL='https://www.twitch.tv/videos/'+VOD
POSITIONS=(290,500,32000)

def call(runner,helper,marker,args,timeout=75):
    result=subprocess.run(
        [sys.executable,'-B',str(runner),'--cancel-file',str(marker),
         '--script',str(helper),'--',*map(str,args)],
        capture_output=True,text=True,timeout=timeout)
    try: response=json.loads(result.stdout)
    except (ValueError,TypeError) as ex: raise RuntimeError('Helper returned invalid structured output') from ex
    if result.returncode!=0 or not response.get('ok'):
        raise RuntimeError('Helper failed: '+str((response.get('error') or {}).get('code','invalid')))
    return response

def run():
    with tempfile.TemporaryDirectory(prefix='iina-twitch-live-check-') as tmp:
        base=Path(tmp)
        def install(name):
            source=(ROOT/'helpers'/f'{name}.py').read_bytes()
            digest=hashlib.sha256(source).hexdigest()
            target=base/f'{name}-{digest}.py'
            target.write_bytes(source)
            target.chmod(0o600)
            return target
        runner,acquire,replay=(install(name) for name in ('runner','acquire','replay'))
        for idx,position in enumerate(POSITIONS):
            begin=time.monotonic()
            raw=call(runner,acquire,base/f'cancel-acquire-{idx}.flag',
                ('--url',URL,'--output',str(base/f'download-{idx}'),'--at',position))
            window=raw['window']
            normalized=call(runner,replay,base/f'cancel-replay-{idx}.flag',
                ('import','--input',raw['path'],'--output',str(base/f'normalized-{idx}'),
                 '--provider','twitch','--source-id',VOD))
            index=json.loads(Path(normalized['indexPath']).read_text())
            if index.get('sourceId')!=VOD or index.get('count',0)<=0:
                raise RuntimeError('Replay index has no valid messages for selected VOD')
            if not window['start']<=position<=window['end']:
                raise RuntimeError('Acquired window does not cover the playback position')
            print(json.dumps({'position':position,'messages':index['count'],
                'pages':window['pages'],'start':window['start'],'end':window['end'],
                'seconds':round(time.monotonic()-begin,2)},sort_keys=True),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run',action='store_true',help='Explicitly fetch only public Twitch chat; never video or credentials')
    args=parser.parse_args()
    if not args.run:
        parser.error('No network requests made. Pass --run for a real-source smoke test.')
    run()
