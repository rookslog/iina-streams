#!/bin/sh
# Retired only in the isolated candidate portfolio. Never build a stable-ID archive.
set -eu
cat >&2 <<'MESSAGE'
Retired packaging command: no archive was built and no plugin was installed.
The inherited script copied plugin-dev and rewrote its identifier to
local.iina.streams. Installing that archive could collide with a stable plugin.
Build the isolated Unified/Focus candidates instead:
  /usr/bin/python3 scripts/build-candidates.py --output dist/candidates
See README.md for candidate identities, installation boundaries, and rollback.
MESSAGE
exit 2
