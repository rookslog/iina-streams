#!/usr/bin/env python3
"""Generate clearly synthetic TwitchDownloader-format timing/stress data."""
import hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
folder=ROOT/'evidence/raw';folder.mkdir(parents=True,exist_ok=True)
path=folder/'synthetic-twitch-100k.json'
sentences=['Timing test: this message follows the video clock.','Backward seeks should restore this earlier conversation.','Pause the video: the chat clock should pause too.','A quality change should keep our place.','Unicode test: café, 日本語, 👋','Literal text test: <script>not code</script> `${notCode}`','Overlay test: the latest messages remain readable.','This is synthetic QA content, not the original broadcast chat.']
with path.open('w') as f:
    f.write(json.dumps({'FileInfo':{'Version':{'Major':1,'Minor':4,'Patch':0}},'video':{'id':'2922164492','start':0,'end':45140,'title':'Synthetic timing & stress fixture · 100,000 messages'}},separators=(',',':'))[:-1]+',"comments":[')
    for i in range(100000):
        row={'_id':'synthetic-'+str(i),'content_offset_seconds':i*.4,'commenter':{'display_name':['Fixture_A','Fixture_B','Fixture_C','Fixture_D'][i%4]},'message':{'body':sentences[i%len(sentences)]}}
        if i:f.write(',')
        f.write(json.dumps(row,ensure_ascii=False,separators=(',',':')))
    f.write(']}')
print(json.dumps({'path':str(path),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'provenance':'synthetic QA fixture; never original chat'}))
