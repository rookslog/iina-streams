#!/bin/sh
# Static and mocked-runtime checks. No IINA launch, no network required.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
NODE=/opt/homebrew/bin/node
test -x "$NODE" || { echo 'Node.js missing: /opt/homebrew/bin/node' >&2; exit 2; }
cd "$ROOT"
"$NODE" --test tests/*.test.js
for f in plugin-dev/global.js plugin-dev/main.js plugin-dev/src/*.js plugin-dev/ui/*.js; do
  "$NODE" --check "$f"
done
/usr/bin/python3 -m json.tool plugin-dev/Info.json >/dev/null
/usr/bin/python3 - <<'PY'
import json, pathlib
root=pathlib.Path('plugin-dev')
x=json.loads((root/'Info.json').read_text())
assert x['identifier']=='local.iina.streams.dev'
assert (root/x['entry']).is_file() and (root/x['globalEntry']).is_file()
assert (root/'ui/streams.html').is_file()
assert x['permissions']==['file-system','show-alert']
PY
echo 'All static and mocked-runtime checks passed.'
