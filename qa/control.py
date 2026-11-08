#!/usr/bin/env python3
"""Drive the isolated QA plugin; ordinary candidate packages expose no command file."""
import argparse
import json
from pathlib import Path
import re
import time
import uuid

ROOT=Path(__file__).resolve().parents[1]
DATA=Path('/Users/rookslog/Library/Application Support/com.colliderli.iina/plugins/.data/local.iina.streams.qa')

def call(command,data,target_source=None):
    identifier=uuid.uuid4().hex
    request={'id':identifier,'command':command,'data':data,'targetSource':target_source}
    temporary=DATA/'qa-request.tmp'
    temporary.write_text(json.dumps(request))
    temporary.replace(DATA/'qa-request.json')
    deadline=time.monotonic()+15
    while time.monotonic()<deadline:
        try:
            result=json.loads((DATA/'qa-response.json').read_text())
            if result.get('id')==identifier:
                return result
        except (OSError,ValueError):
            pass
        time.sleep(.1)
    raise RuntimeError('QA plugin did not acknowledge '+command)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command')
    parser.add_argument('--data',default='{}')
    parser.add_argument('--settle',type=float,default=0)
    parser.add_argument('--save')
    parser.add_argument('--target-source')
    args=parser.parse_args()
    result=call(args.command,json.loads(args.data),args.target_source)
    if args.settle:
        time.sleep(max(0,min(30,args.settle)))
        after=call('snapshot',{},args.target_source)
        after['actionResult']=result
        result=after
    if args.save:
        if not re.fullmatch(r'[A-Za-z0-9_-]+',args.save):
            parser.error('Save name must be a plain basename')
        folder=ROOT/'evidence/native'
        folder.mkdir(parents=True,exist_ok=True)
        (folder/(args.save+'.json')).write_text(json.dumps(result,indent=2)+'\n')
    summary={'id':result['id'],'result':result['result'],'native':result['state']['native']}
    state=result['state']['controller']
    summary.update({k:state.get(k) for k in ['phase','quality','busy','error','source','view','chat']})
    summary['messages']=[{k:m.get(k) for k in ['id','time','author']} for m in state['messages'][-3:]]
    print(json.dumps(summary,indent=2))

if __name__=='__main__':main()
