#!/usr/bin/env python3
"""Check actual WKWebView-rendered rows against the native replay controller."""
import json
import subprocess
import time
from control import call, ROOT, DATA

source='92h_kU8O58M'
def command(name,data=None):return call(name,data or {},source)
initial=command('snapshot')['state']
if not initial['controller']['chat']['available']:
    result=command('import',{'path':str(ROOT/'evidence/raw/real-youtube-replay-92h_kU8O58M/replay.jsonl')})
    assert result['result'] is True
else:
    command('show');command('ui',{'name':'click','data':{'id':'resume'}})
command('pause',{'value':True});command('speed',{'value':1});command('seek',{'seconds':120})
command('frame',{'x':140,'y':140,'width':1280,'height':800})
subprocess.run(['/usr/bin/osascript','-e','tell application "IINA" to activate'],check=True)
for _ in range(30):
    time.sleep(.5);native=command('snapshot')['state']['native']
    if not native.get('seeking') and not native.get('pausedForCache'):break
else:raise RuntimeError('Video seek did not settle')
records=[];checks={}
for mode in ['sidebar','overlay']:
    command('view',{'presentation':mode,'editing':False,'fontSize':14,'lines':6,'opacity':.64,'x':1,'y':0})
    command('show');command('ui',{'name':'click','data':{'id':'chat-tab'}})
    time.sleep(.7)
    state=command('snapshot')['state'];variant=state['controller']['variant']
    result=command('overlay' if mode=='overlay' else 'ui',{'name':'inspect'})
    time.sleep(.5)
    events=json.loads((DATA/('qa-events-'+source+'.json')).read_text())
    phase='overlay-ui-result' if mode=='overlay' else 'ui-result'
    inspection=next(e for e in reversed(events) if e['phase']==phase and e.get('action')=='inspect')
    expected=state['controller']['messages'][-(6 if mode=='overlay' else 12):]
    rendered=inspection['renderedMessages']
    checks[mode+'-rendered-rows']=len(rendered)==len(expected) and all(text.endswith(m['author']+m['text']) for text,m in zip(rendered,expected))
    if mode=='overlay':checks['overlay-message-identities']=inspection['messageIds']==[m['id'] for m in expected]
    else:
        checks['sidebar-message-count']=inspection['messageCount']==len(state['controller']['messages'])
        checks['sidebar-follows-latest']=inspection.get('following') is True and inspection['scrollHeight']-inspection['clientHeight']-inspection['scrollTop']<35
    records.append({'mode':mode,'state':state,'inspection':inspection})
    if mode=='overlay':command('ui',{'name':'click','data':{'id':'playback-tab'}})
    time.sleep(.5)
    subprocess.run(['/usr/bin/osascript','-e','tell application "IINA" to activate'],check=True);time.sleep(.4)
    windows=json.loads(subprocess.check_output(['/usr/bin/swift',str(ROOT/'qa/windows.swift')],text=True))
    window=next(w for w in windows if 'All Aboard' in w['title'])
    image=ROOT/'evidence/native'/(variant+'-final-render-'+mode+'.png')
    subprocess.run(['/usr/sbin/screencapture','-x','-l',str(window['id']),str(image)],check=True)
    subprocess.run(['/usr/bin/sips','-Z','1440','-s','format','jpeg',str(image),'--out',str(image.with_suffix('.jpg'))],check=True,stdout=subprocess.DEVNULL)
record={'checks':checks,'records':records,'provenance':'Actual loaded sidebar/overlay WKWebView reports its DOM text; matched to actual mpv-clock replay rows after seek/buffering settle.'}
(ROOT/'evidence/native'/(variant+'-final-render-check.json')).write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({'variant':variant,'checks':checks,'lastMessageTime':expected[-1]['time'] if expected else None},indent=2))
raise SystemExit(0 if all(checks.values()) else 1)
