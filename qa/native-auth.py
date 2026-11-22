#!/usr/bin/env python3
"""Native broker/UI/storage checks using no registered client or OAuth grant."""
import argparse
import json
import subprocess
import time
from control import call, ROOT, DATA

parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--keychain',action='store_true');args=parser.parse_args()
client_file=DATA/'twitch-client.json'
if client_file.exists() and json.loads(client_file.read_text()).get('clientID')=='invalidpublicclientid000000':client_file.unlink()
source='hutchmf'
def command(name,data=None):return call(name,data or {},source)
command('pause',{'value':True});command('ui',{'name':'click','data':{'id':'chat-tab'}})
command('ui',{'name':'click','data':{'id':'connect'}});time.sleep(.5)
initial=command('snapshot');variant=initial['state']['controller']['variant']
result={'provenance':'Native setup and rejection path; no registered client, OAuth grant, or authenticated chat session.',
        'initial':initial,'checks':{'nativeStateDelivery':initial['state']['controller']['auth']['phase']=='needs-client'}}
path=ROOT/'evidence/native'/(variant+'-final-native-auth.json')
path.write_text(json.dumps(result,indent=2)+'\n')
assert result['checks']['nativeStateDelivery'], 'Native auth state was not delivered'
command('ui',{'name':'change','data':{'id':'client-id','value':'invalidpublicclientid000000'}})
command('ui',{'name':'click','data':{'id':'authorize'}})
deadline=time.monotonic()+30
while time.monotonic()<deadline:
    time.sleep(.5);invalid=command('snapshot')
    if invalid['state']['controller']['auth']['phase']=='error':break
result['invalidClient']=invalid
result['checks']['invalidClientActionableError']=invalid['state']['controller']['auth']['phase']=='error'
result['checks']['videoUnaffected']=not invalid['state']['controller']['error'] and bool(invalid['state']['native']['height'])
command('ui',{'name':'inspect'});time.sleep(.3)
events=json.loads((DATA/('qa-events-'+source+'.json')).read_text())
inspection=next(e for e in reversed(events) if e['phase']=='ui-result')
result['formInspection']=inspection
result['checks']['clientIDEditableAfterError']=inspection.get('authPanelVisible') is True
command('off');result['off']=command('snapshot')
result['checks']['offCleared']=result['off']['state']['controller']['chat']['mode']=='off' and not result['off']['state']['native']['activeHelpers']
path.write_text(json.dumps(result,indent=2)+'\n')
if args.keychain:
    probe=command('keychain-probe');result['keychainProbe']=probe['result']
    result['checks']['nativeKeychainRoundTrip']=all(probe['result'].get(k) is True for k in ['wrote','matched','cleared'])
    if probe['result'].get('wrote'):
        removed=subprocess.run(['/usr/bin/security','delete-generic-password','-s','local.iina.streams.dev - native-qa-probe','-a','noncredential'],capture_output=True)
        result['checks']['temporaryKeychainItemRemoved']=removed.returncode==0
result['callbacks']=[e for e in json.loads((DATA/('qa-events-'+source+'.json')).read_text()) if e['phase'] in ['auth-state-received','auth-stop-received']]
path.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'checks':result['checks'],'initialAuth':initial['state']['controller']['auth'],'rejection':invalid['state']['controller']['auth'],'keychainProbe':result.get('keychainProbe','not requested')},indent=2))
raise SystemExit(0 if all(result['checks'].values()) else 1)
