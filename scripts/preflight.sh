#!/bin/sh
# Read-only local environment check. --live only resolves metadata; no playback.
set -eu
IINA_APP="/Applications/IINA.app"
STREAMLINK="/opt/homebrew/bin/streamlink"
YTDLP="/opt/homebrew/bin/yt-dlp"
MPV="/opt/homebrew/bin/mpv"
TARGET="https://www.twitch.tv/hutchmf"
echo "== IINA Streams preflight =="
if [ -d "$IINA_APP" ]; then
  echo "IINA: $(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$IINA_APP/Contents/Info.plist" 2>/dev/null || echo unknown)"
else
  echo "IINA missing: $IINA_APP"
  exit 2
fi
for t in "$STREAMLINK" "$YTDLP" "$MPV"; do
  if [ ! -x "$t" ]; then echo "missing executable: $t"; exit 2; fi
  case "$t" in
    *streamlink) "$t" --version ;;
    *yt-dlp) "$t" --version ;;
    *mpv) "$t" --version | head -1 ;;
  esac
done
echo "IINA CLI: $IINA_APP/Contents/MacOS/iina-cli"
test -x "$IINA_APP/Contents/MacOS/iina-cli"
echo "No media playback started; no configuration was changed."
if [ "${1:-}" = "--live" ]; then
  echo "== Read-only live availability: $TARGET =="
  "$STREAMLINK" --loglevel error "$TARGET"
fi
