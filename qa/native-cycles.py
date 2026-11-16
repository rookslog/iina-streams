#!/usr/bin/env python3
"""Bounded real open/close acceptance, preserving the paused archive anchor."""
import json
import subprocess
import time
from control import call, ROOT, DATA

anchor='92h_kU8O58M'
initial=call('snapshot',{},anchor)
pid=int(subprocess.check_output(['/usr/bin/pgrep','-x','IINA'],text=True).strip())
records=[]
output=ROOT/'evidence/native/focus-final-open-close-cycles.json'
for index in range(10):
    source,url=('hutchmf','https://www.twitch.tv/hutchmf') if index<5 else ('jNQXAC9IVRw','https://www.youtube.com/watch?v=jNQXAC9IVRw')
    before=call('snapshot',{},anchor)
    started=time.monotonic();call('open',{'url':url},anchor)
    deadline=time.monotonic()+30
    while time.monotonic()<deadline:
        state=call('snapshot',{},source)['state']
        if state['controller']['error']:raise RuntimeError(state['controller']['error'])
        if state['native']['height'] and state['native']['audioCodec'] and not state['native']['activeHelpers']:break
        time.sleep(.3)
    else:raise RuntimeError('Decoded media did not become ready')
    time.sleep(1);call('pause',{'value':True},source)
    state=call('snapshot',{},source)['state']
    title=state['controller']['title']+' — '+state['controller']['source']['provider']
    quoted=json.dumps(title,ensure_ascii=False)
    script='tell application "IINA" to activate\ndelay 0.3\ntell application "System Events" to tell process "IINA"\nset matching to every window whose name is '+quoted+'\nif (count of matching) is not 1 then error "Expected exactly one owned source window"\nset w to item 1 of matching\nperform action "AXPress" of (first button of w whose subrole is "AXCloseButton")\nend tell'
    closed=subprocess.run(['/usr/bin/osascript','-e',script],capture_output=True,text=True)
    if closed.returncode:raise RuntimeError('Owned-window close failed: '+closed.stderr.strip())
    time.sleep(.5)
    trace=json.loads((DATA/('qa-events-'+source+'.json')).read_text())
    after=call('snapshot',{},anchor)
    checks={'videoDecoded':state['native']['height']>0,'audioDecoded':bool(state['native']['audioCodec']),'chatOff':state['controller']['chat']['mode']=='off','noActiveHelpers':not state['native']['activeHelpers'],'windowCloseDelivered':any(e['phase']=='window-closed' for e in trace),'anchorUnchanged':all(before['state']['native'][k]==after['state']['native'][k] for k in ['position','paused','speed','width','height','frame']),'sameAppProcess':subprocess.check_output(['/usr/bin/pgrep','-x','IINA'],text=True).strip()==str(pid)}
    records.append({'cycle':index+1,'source':source,'elapsedSeconds':time.monotonic()-started,'checks':checks,'decoded':state['native'],'lastTrace':trace[-4:]})
    output.write_text(json.dumps({'pid':pid,'records':records,'plannedCycles':10,'completedCycles':len(records),'complete':len(records)==10,'allPassed':len(records)==10 and all(all(r['checks'].values()) for r in records),'provenance':'Planned five real Twitch live and five ordinary YouTube opens; each exact owned window closed through native AXCloseButton. No unrelated window/process closed.'},indent=2)+'\n')
    print(json.dumps({'cycle':index+1,'source':source,'checks':checks}),flush=True)
    if not all(checks.values()):raise RuntimeError('Native cycle failed')
