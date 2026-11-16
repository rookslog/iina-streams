#!/usr/bin/env python3
"""Native seek/pause/rate/offset checks using the imported synthetic stress archive."""
import json,time
from control import call,ROOT

records=[]
def snapshot(label):
    result=call('snapshot',{});records.append({'label':label,'state':result['state']});return result['state']
def seek(value,label):
    call('seek',{'seconds':value});time.sleep(.7);return snapshot(label)
def aligned(s):
    rows=s['controller']['messages'];clock=s['native']['position']+s['controller']['chat']['offset']
    # Fixture messages are 0.4 s apart; active rendering is capped at 5 Hz.
    tolerance=.45 if s['native']['paused'] else .45+.2*s['native']['speed']+.1
    return bool(rows) and len(rows)<=150 and all(m['time']<=clock+.001 for m in rows) and 0<=clock-rows[-1]['time']<tolerance

call('pause',{'value':True})
a=seek(300,'seek-forward-300');b=seek(12.75,'seek-backward-12_75');time.sleep(1);c=snapshot('paused-after-one-second')
checks={'forward':aligned(a),'backward':aligned(b),'pausedClock':abs(b['native']['position']-c['native']['position'])<.001,'pausedMessages':[m['id'] for m in b['controller']['messages']]==[m['id'] for m in c['controller']['messages']]}
call('speed',{'value':1.5});call('pause',{'value':False});time.sleep(2);d=snapshot('playing-at-1_5');call('pause',{'value':True})
checks.update(rateClockFollowsPlayer=aligned(d),rateAdvanced=2.5<d['native']['position']-c['native']['position']<4.5)
call('ui',{'name':'change','data':{'id':'offset','value':30}});time.sleep(.4);e=snapshot('offset-plus-30');checks['offset']=aligned(e)
call('ui',{'name':'change','data':{'id':'offset','value':0}});seek(83.25,'restored-83_25')
variant=records[0]['state']['controller']['variant']
(ROOT/'evidence/native'/(variant+'-replay-clock.json')).write_text(json.dumps({'checks':checks,'records':records},indent=2)+'\n')
print(json.dumps({'checks':checks,'samples':[{'label':r['label'],'position':r['state']['native']['position'],'lastChat':r['state']['controller']['messages'][-1]['time'],'visibleCount':len(r['state']['controller']['messages'])} for r in records]},indent=2))
raise SystemExit(0 if all(checks.values()) else 1)
