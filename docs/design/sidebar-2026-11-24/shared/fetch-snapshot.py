"""Take a one-time snapshot of public Twitch data for the sidebar mocks (2026-11-24).

Public channel data only (no sign-in): names, avatars, live state, titles, recent broadcasts and
their thumbnails. Images are saved next to this file so the mocks work offline.
Run: python3 -I fetch-snapshot.py
"""
import json, os, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko"  # Twitch's public web client, as Streams uses for GQL
LOGINS = ["ohnepixel", "northernlion", "lirik", "cohhcarnage", "tarik", "shroud", "sodapoppin",
          "hasanabi", "moistcr1tikal", "summit1g", "ludwig", "jerma985", "squeex", "vinesauce"]
Q = """query($login:String!){user(login:$login){login displayName profileImageURL(width:70)
 stream{title viewersCount createdAt game{displayName} previewImageURL(width:320,height:180)}
 lastBroadcast{startedAt title game{displayName}}
 videos(first:8,type:ARCHIVE,sort:TIME){edges{node{id title lengthSeconds createdAt viewCount
  previewThumbnailURL(width:320,height:180) game{displayName}}}}}}"""

def gql(login):
    body = json.dumps({"query": Q, "variables": {"login": login}}).encode()
    req = urllib.request.Request("https://gql.twitch.tv/gql", data=body,
                                 headers={"Client-Id": CLIENT_ID, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)["data"]["user"]

def save(url, name):
    if not url or "404_processing" in url:
        return None
    path = os.path.join(HERE, "img", name)
    with urllib.request.urlopen(url, timeout=20) as r, open(path, "wb") as f:
        f.write(r.read())
    return "img/" + name

people = []
for login in LOGINS:
    u = gql(login)
    if not u:
        print("missing", login, file=sys.stderr)
        continue
    s = u.get("stream")
    p = {"login": u["login"], "name": u["displayName"], "avatar": save(u["profileImageURL"], login + ".png"),
         "live": bool(s)}
    if s:
        p.update(title=s["title"], viewers=s["viewersCount"], startedAt=s["createdAt"],
                 category=(s.get("game") or {}).get("displayName"),
                 preview=save(s["previewImageURL"], login + "-live.jpg"))
    lb = u.get("lastBroadcast") or {}
    p["lastLive"] = lb.get("startedAt")
    vods = []
    for i, e in enumerate((u.get("videos") or {}).get("edges", [])):
        n = e["node"]
        vods.append({"id": n["id"], "title": n["title"], "seconds": n["lengthSeconds"], "at": n["createdAt"],
                     "views": n["viewCount"], "category": (n.get("game") or {}).get("displayName"),
                     "thumb": save(n["previewThumbnailURL"], f"{login}-v{i}.jpg") if i < 6 else None})
    p["vods"] = vods
    people.append(p)
    print(login, "live" if s else "offline", len(vods), file=sys.stderr)

with open(os.path.join(HERE, "snapshot.js"), "w") as f:
    f.write("// Public Twitch data snapshot, taken by fetch-snapshot.py. Not live.\n")
    f.write("window.SNAPSHOT = " + json.dumps({"takenAt": __import__("datetime").datetime.now().astimezone().isoformat(timespec="minutes"), "people": people}, indent=1) + ";\n")
