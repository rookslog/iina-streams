#!/bin/sh
# Link the Streams plugin for live development. Never restarts IINA.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
IINA=/Applications/IINA.app/Contents/MacOS/iina-plugin
DEST='/Users/rookslog/Library/Application Support/com.colliderli.iina/plugins/candidate-plugin.iinaplugin-dev'
test -x "$IINA"
if [ -e "$DEST" ] || [ -L "$DEST" ]; then
  if [ -L "$DEST" ] && [ "$(readlink "$DEST")" = "$ROOT/candidate-plugin" ]; then
    echo 'Development link already points to candidate-plugin.'
  else
    echo 'Existing candidate-plugin link does not belong to this project; refusing.' >&2
    exit 3
  fi
else
  HOME=/Users/rookslog "$IINA" link "$ROOT/candidate-plugin"
fi
defaults write com.colliderli.iina 'PluginEnabled.local.iina.streams' -bool true
echo 'Linked Streams (0.5.2) development plugin and enabled local.iina.streams.'
