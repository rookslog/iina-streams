#!/bin/sh
# Reproducible unsigned candidate. Never installs or replaces stable.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PACK=/Applications/IINA.app/Contents/MacOS/iina-plugin
test -x "$PACK"
"$ROOT/scripts/verify.sh" >/dev/null
VERSION=$(/usr/bin/python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$ROOT/plugin-dev/Info.json")
case "$VERSION" in *[!0-9A-Za-z._-]*|'') echo 'Bad version' >&2; exit 2;; esac
mkdir -p "$ROOT/releases"
DEST="$ROOT/releases/iina-streams-$VERSION-rc1.iinaplgz"
test ! -e "$DEST" || { echo "Candidate already exists: $DEST" >&2; exit 3; }
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
# The IINA 1.4.4 pack command can fail with "Cannot read plugin package content"
# on this installation. Record the fallback rather than claiming CLI pack worked.
if "$PACK" pack "$PKG" > "$STAGING/pack-output.txt" 2>&1; then
  FOUND=$(find "$STAGING" -maxdepth 2 -type f -name '*.iinaplgz' -print -quit)
else
  FOUND=''
fi
if [ -n "$FOUND" ]; then
  cp "$FOUND" "$DEST"
  METHOD='IINA plugin CLI'
else
  echo 'IINA CLI pack failed; falling back to documented ZIP-format .iinaplgz.' >&2
  cat "$STAGING/pack-output.txt" >&2
  (cd "$PKG" && /usr/bin/zip -q -r -X "$DEST" .)
  METHOD='ZIP-format fallback (unverified by IINA installer)'
fi
/usr/bin/python3 - "$DEST" <<'PY'
import json,sys,zipfile
with zipfile.ZipFile(sys.argv[1]) as f:
 bad=f.testzip()
 assert bad is None, bad
 names=f.namelist()
 assert 'Info.json' in names, names[:6]
 m=json.loads(f.read('Info.json'))
 assert m['identifier']=='local.iina.streams'
 assert m['version']=='0.2.0'
 for name in ['main.js','global.js','src/providers.js','src/formats.js','ui/streams.html']:
  assert name in names,name
print('Archive ZIP integrity and required files verified.')
PY
/usr/bin/shasum -a 256 "$DEST" > "$DEST.sha256"
(cd "$ROOT" && git rev-parse HEAD) > "$DEST.commit"
echo "$METHOD" > "$DEST.pack-method"
echo "Candidate: $DEST"
cat "$DEST.sha256"
echo 'NOT INSTALLED; package installer compatibility and stable promotion require separate gates.'
