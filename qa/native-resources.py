#!/usr/bin/env python3
"""Matched short native characterization; explicit QA player, no global changes."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time
from control import call, ROOT

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--pid',required=True,type=int)
p.add_argument('--helper-pid',action='append',type=int,default=[])
p.add_argument('--warmup',type=float,default=20)
p.add_argument('--duration',type=float,default=20)
args=p.parse_args()
assert 1 <= args.warmup <= 30 and 1 <= args.duration <= 30
source='92h_kU8O58M'
def command(name,data=None): return call(name,data or {},source)
initial=command('snapshot')['state']
variant=initial['controller']['variant']
assert initial['controller']['source']['id']==source and initial['native']['height']==720
assert not initial['native']['activeHelpers']
folder=ROOT/'evidence/resources';folder.mkdir(parents=True,exist_ok=True)
archive=ROOT/'evidence/raw/real-youtube-replay-92h_kU8O58M/replay.jsonl'
if not initial['controller']['chat']['available']:
    imported=command('import',{'path':str(archive)})
    assert imported['result'] is True and imported['state']['controller']['chat']['count']==693
command('fullscreen',{'value':False})
command('frame',{'x':140,'y':140,'width':1280,'height':800})
command('speed',{'value':1})
results=[]
for mode in ['off','sidebar','overlay']:
    command('off')
    command('view',{'presentation':'sidebar' if mode!='overlay' else 'overlay','editing':False,'fontSize':14,'opacity':.64,'lines':6,'density':'comfortable','x':1,'y':0})
    command('show')
    command('ui',{'name':'click','data':{'id':'chat-tab' if mode=='sidebar' else 'playback-tab'}})
    if mode!='off':
        command('ui',{'name':'click','data':{'id':'resume'}})
        # Resume uses the production sidebar event, and the state must confirm it.
        if command('snapshot')['state']['controller']['chat']['mode']!='replay':
            raise RuntimeError('Replay Resume UI did not activate')
    if mode=='overlay':command('hide')
    command('seek',{'seconds':120})
    command('pause',{'value':False})
    print(json.dumps({'variant':variant,'mode':mode,'phase':'warmup','seconds':args.warmup}),flush=True)
    time.sleep(args.warmup)
    before=command('snapshot')['state'];n=before['native'];c=before['controller']
    if n['paused'] or n['height']!=720 or n['activeHelpers'] or n.get('seeking') or n.get('pausedForCache'):
        raise RuntimeError('Workload did not settle: '+json.dumps(n))
    metadata={'candidate':variant,'pluginIdentifier':'local.iina.streams.qa','mode':mode,'chatMode':c['chat']['mode'],'presentation':c['view']['presentation'],'sourceURL':'https://www.youtube.com/watch?v='+source,'sourceId':source,'quality':c['quality'],'videoCodec':n.get('videoCodec'),'videoWidth':n['width'],'videoHeight':n['height'],'videoFps':n.get('videoFps'),'audioCodec':n['audioCodec'],'audioSampleRate':n['audioRate'],'hardwareDecode':n['hwdec'],'windowWidth':n['frame']['width'],'windowHeight':n['frame']['height'],'sidebarWidth':0 if mode=='overlay' else 300,'fullscreen':n['fullscreen'],'playbackPosition':n['position'],'playbackSpeed':n['speed'],'paused':n['paused'],'archiveId':source,'messageCount':len(c['messages']),'rowLimit':150,'fontSize':14,'opacity':.64,'replayOffset':0,'otherPlayerCount':0,'droppedFrames':n.get('droppedFrames'),'buffering':n.get('pausedForCache'),'notes':'One fresh QA-managed player. Other IINA plugins retain original enablement. QA command polling every400ms; no acquisition/helper active. RSS excludes unattributed WebKit; short characterization, not battery or long-session proof.'}
    meta=folder/(variant+'-'+mode+'-metadata.json');meta.write_text(json.dumps(metadata,indent=2)+'\n')
    output=folder/(variant+'-'+mode+'.json')
    argv=[sys.executable,'-B',str(ROOT/'qa/measure-resources.py'),'--pid',str(args.pid),'--label',variant+'-'+mode,'--duration',str(args.duration),'--interval','2','--metadata-file',str(meta)]
    for pid in args.helper_pid:argv+=['--helper-pid',str(pid)]
    with output.open('w') as handle:subprocess.run(argv,stdout=handle,check=True)
    after=command('snapshot')['state'];command('pause',{'value':True})
    sample=json.loads(output.read_text())
    assert sample['ok'] and sample['sampleCount']>=5 and sample['terminationReason']=='duration'
    results.append({'mode':mode,'before':before,'after':after,'sample':output.name,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'warmupSeconds':args.warmup})
    print(json.dumps({'variant':variant,'mode':mode,'phase':'sampled','samples':sample['sampleCount'],'fromPosition':n['position'],'toPosition':after['native']['position']}),flush=True)
command('off');off=command('snapshot')['state']
assert off['controller']['chat']['mode']=='off' and not off['controller']['messages'] and not off['native']['activeHelpers']
record={'completedUTC':datetime.now(timezone.utc).isoformat(),'variant':variant,'pid':args.pid,'conditions':results,'afterOff':off,'checks':{'allThreeSamples':len(results)==3,'offClearedMessagesAndHelpers':True}}
(folder/(variant+'-conditions.json')).write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({'variant':variant,'complete':True,'checks':record['checks']}),flush=True)
