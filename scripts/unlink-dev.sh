#!/bin/sh
# Safe rollback of dev linkage only. Never touches Bridge/stable plugins or IINA windows.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
IINA=/Applications/IINA.app/Contents/MacOS/iina-plugin
DEST='/Users/rookslog/Library/Application Support/com.colliderli.iina/plugins/plugin-dev.iinaplugin-dev'
if [ -L "$DEST" ]; then
  if [ "$(readlink "$DEST")" != "$ROOT/plugin-dev" ]; then
    echo 'Unexpected link target; refusing to unlink.' >&2; exit 3
  fi
  HOME=/Users/rookslog "$IINA" unlink "$ROOT/plugin-dev"
fi
defaults write com.colliderli.iina 'PluginEnabled.local.iina.streams.dev' -bool false
echo 'Development plugin unlinked/disabled. Running IINA is untouched; restart manually for full unload.'
