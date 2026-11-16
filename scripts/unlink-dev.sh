#!/bin/sh
# Safe rollback of dev linkage. Never touches built-in IINA plugins or windows.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
IINA=/Applications/IINA.app/Contents/MacOS/iina-plugin
DEST='/Users/rookslog/Library/Application Support/com.colliderli.iina/plugins/candidate-plugin.iinaplugin-dev'
if [ -L "$DEST" ]; then
  if [ "$(readlink "$DEST")" != "$ROOT/candidate-plugin" ]; then
    echo 'Unexpected link target; refusing to unlink.' >&2; exit 3
  fi
  HOME=/Users/rookslog "$IINA" unlink "$ROOT/candidate-plugin"
fi
defaults write com.colliderli.iina 'PluginEnabled.local.iina.streams' -bool false
echo 'Streams development plugin unlinked/disabled.'
