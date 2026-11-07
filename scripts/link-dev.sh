#!/bin/sh
# Link only the separate development plugin. Never restarts IINA or enables plugins.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
IINA=/Applications/IINA.app/Contents/MacOS/iina-plugin
DEST='/Users/rookslog/Library/Application Support/com.colliderli.iina/plugins/plugin-dev.iinaplugin-dev'
test -x "$IINA"
if [ -e "$DEST" ] || [ -L "$DEST" ]; then
  if [ -L "$DEST" ] && [ "$(readlink "$DEST")" = "$ROOT/plugin-dev" ]; then
    echo 'Development link already points to checkout.'
  else
    echo 'Existing plugin-dev link does not belong to this project; refusing.' >&2
    exit 3
  fi
else
  HOME=/Users/rookslog "$IINA" link "$ROOT/plugin-dev"
fi
echo 'Linked development plugin only. Enable it in IINA Preferences > Plugins when ready; relaunch manually if needed.'
