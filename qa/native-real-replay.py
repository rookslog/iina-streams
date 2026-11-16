#!/usr/bin/env python3
"""Compare genuine replay rows with actual mpv time in the isolated native QA player."""
import argparse
import json
import time
from control import call, ROOT

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source',default='92h_kU8O58M')
parser.add_argument('--fetch',action='store_true')
args=parser.parse_args()
def command(name,data=None): return call(name,data or {},args.source)
indexed=ROOT/'evidence/raw/real-youtube-replay-92h_kU8O58M-index'
index=json.loads((indexed/'index.json').read_text())
rows=[]
for chunk in index['chunks']: rows.extend(json.loads((indexed/chunk['file']).read_text()))
if args.fetch:
    command('show');command('ui',{'name':'click','data':{'id':'chat-tab'}})
    command('ui',{'name':'click','data':{'id':'fetch'}})
    deadline=time.monotonic()+125
    while time.monotonic()<deadline:
        state=command('snapshot')['state']['controller']
        if state['chat']['mode']=='replay' or state['chat']['state'] in ['error','unavailable']:break
        time.sleep(.5)
    if state['chat']['mode']!='replay':raise RuntimeError('Native Fetch Replay did not complete: '+state['chat']['error'])
records=[];checks={}
def sample(label,exact=True):
    result=command('snapshot');s=result['state'];actual=s['controller']['messages'];clock=s['native']['position']+s['controller']['chat']['offset']
    expected=[m for m in rows if max(0,clock-120)<=m['time']<=clock and m.get('deletedAt',float('inf'))>clock][-150:]
    checks[label+'-bounded']=len(actual)<=150
    checks[label+'-no-future']=all(m['time']<=clock+.001 for m in actual)
    if exact:checks[label+'-exact-rows']=[m['id'] for m in actual]==[m['id'] for m in expected]
    records.append({'label':label,'clock':clock,'expectedIds':[m['id'] for m in expected],'state':s})
    return s
command('pause',{'value':True});command('view',{'presentation':'overlay','editing':False})
for value,label in [(0,'beginning'),(120,'forward-120'),(3600,'forward-3600'),(120,'backward-120'),(5910,'near-end'),(300,'backward-300')]:
    command('seek',{'seconds':value});time.sleep(.6);sample(label)
before=sample('paused-before');time.sleep(1);after=sample('paused-after')
checks['pause-clock']=before['native']['position']==after['native']['position']
checks['pause-rows']=before['controller']['messages']==after['controller']['messages']
for speed in [.5,2]:
    command('speed',{'value':speed});before=sample('rate-'+str(speed)+'-before');command('pause',{'value':False});time.sleep(2);after=sample('rate-'+str(speed)+'-playing',False);command('pause',{'value':True});time.sleep(.3)
    checks['rate-'+str(speed)+'-clock']=1.5*speed<after['native']['position']-before['native']['position']<3.5*speed
    sample('rate-'+str(speed)+'-paused')
command('ui',{'name':'change','data':{'id':'offset','value':30}});time.sleep(.4);sample('offset-plus-30')
command('ui',{'name':'change','data':{'id':'offset','value':0}});command('speed',{'value':1});command('seek',{'seconds':120});time.sleep(.5);final=sample('restored-120')
checks['genuine-count']=final['controller']['chat']['count']==693
variant=final['controller']['variant']
result={'provenance':'Public YouTube ended livestream 92h_kU8O58M; authentic yt-dlp chat replay, not synthetic','fetchButtonTested':args.fetch,'checks':checks,'records':records}
(ROOT/'evidence/native'/(variant+'-real-youtube-replay.json')).write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'variant':variant,'fetchButtonTested':args.fetch,'checks':checks,'samples':[{'label':r['label'],'clock':r['clock'],'rows':len(r['state']['controller']['messages'])} for r in records]},indent=2))
raise SystemExit(0 if all(checks.values()) else 1)
