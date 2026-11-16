#!/usr/bin/env python3
"""Verify actual decoded quality and native continuity through the production UI handler."""
import argparse
import json
from pathlib import Path
import time
from control import call,ROOT

parser=argparse.ArgumentParser()
parser.add_argument('--quality',required=True)
parser.add_argument('--height',required=True,type=int)
parser.add_argument('--name',required=True)
parser.add_argument('--target-source',default='2922164492')
parser.add_argument('--fullscreen',action='store_true')
args=parser.parse_args()
raw_call=call
def call(command,data): return raw_call(command,data,args.target_source)
call('fullscreen',{'value':args.fullscreen})
if args.fullscreen:time.sleep(1.5)
call('pause',{'value':True})
call('speed',{'value':1.5})
call('seek',{'seconds':83.25})
if not args.fullscreen:call('frame',{'x':180,'y':170,'width':1180,'height':720})
time.sleep(1)
before=call('snapshot',{})
print('Before:',json.dumps(before['state']['native']),flush=True)
action=call('ui',{'name':'change','data':{'id':'quality','value':args.quality}})
deadline=time.monotonic()+22
while time.monotonic()<deadline:
    time.sleep(.5)
    after=call('snapshot',{})
    state=after['state']
    if state['controller']['quality']==args.quality and not state['controller']['busy'] and state['native']['height']==args.height and not state['native'].get('seeking') and not state['native'].get('pausedForCache'):
        time.sleep(.5)
        after=call('snapshot',{})
        break
a,b=after['state']['native'],before['state']['native']
checks={'actualHeight':a['height']==args.height,'seekComplete':not a.get('seeking'),'notBuffering':not a.get('pausedForCache'),'selectedQuality':after['state']['controller']['quality']==args.quality,'paused':a['paused'] is True,'speed':a['speed']==1.5,'position':abs(a['position']-b['position'])<.5,'playlistCount':a['playlistCount']==b['playlistCount']==1,'sameFrame':a['frame']==b['frame'],'fullscreenPreserved':a['fullscreen']==b['fullscreen']==args.fullscreen,'noError':not after['state']['controller']['error']}
record={'before':before,'action':action,'after':after,'checks':checks}
path=ROOT/'evidence/native'/(args.name+'.json')
path.write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({'checks':checks,'before':b,'after':a},indent=2))
raise SystemExit(0 if all(checks.values()) else 1)
