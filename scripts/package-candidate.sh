#!/bin/sh
# Builds a candidate for review. Does NOT install or promote to stable.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PACK=/Applications/IINA.app/Contents/MacOS/iina-plugin
test -x "$PACK"
"$ROOT/scripts/verify.sh" >/dev/null
VERSION=$(/usr/bin/python3 -c 'import json; print(json.load(open("plugin-dev/Info.json"))["version"])' 2>/dev/null) || VERSION=''
if [ -z "$VERSION" ]; then
  VERSION=$(/usr/bin/python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$ROOT/plugin-dev/Info.json")
fi
mkdir -p "$ROOT/releases"
STAGING=$(mktemp -d "$ROOT/releases/.build.XXXXXXXX")
trap 'rm -rf "$STAGING"' EXIT HUP INT TERM
PKG="$STAGING/iina-streams.iinaplugin"
mkdir "$PKG"
cp -R "$ROOT/plugin-dev/." "$PKG/"
/usr/bin/python3 - "$PKG/Info.json" <<'PY'
import json,sys
p=sys.argv[1]
o=json.load(open(p))
o['identifier']='local.iina.streams'
o['name']='IINA Streams'
with open(p,'w') as f:
 json.dump(o,f,indent=2)
 f.write('\n')
PY
cd "$STAGING"
"$PACK" pack "$PKG"
FOUND=$(find "$STAGING" -maxdepth 2 -type f -name '*.iinaplgz' -print -quit)
if [ -z "$FOUND" ]; then
  echo 'IINA CLI did not produce a package' >&2
  exit 2
fi
DEST="$ROOT/releases/iina-streams-$VERSION-rc1.iinaplgz"
test ! -e "$DEST" || { echo "Archive already exists (immutable): $DEST" >&2; exit 3; }
mv "$FOUND" "$DEST"
/usr/bin/shasum -a 256 "$DEST" > "$DEST.sha256"
( cd "$ROOT" && git rev-parse HEAD ) > "$DEST.commit"
echo "Candidate: $DEST"
cat "$DEST.sha256"
echo 'Not installed. Explicit user acceptance required for any stable promotion.'
