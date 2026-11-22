#!/bin/sh
# Spike #47: does plain mpv shrink the picture for --video-margin-ratio-*?
# Opens a short-lived mpv window (vo=gpu, never focused), saves a window screenshot,
# and prints the bounding box of the picture. Needs: mpv, ffmpeg, python3 with numpy and PIL.
# Usage: sh spike-47-plain-mpv.sh [outdir]    (default outdir: a fresh temp directory)
set -eu

here=$(cd "$(dirname "$0")" && pwd)
out=${1:-$(mktemp -d)}
mkdir -p "$out"

# Solid blue frame, 6px red border, 640x360: 16:9, so any shrink or crop is easy to see.
ffmpeg -v error -y -f lavfi -i "color=c=0x2060c0:s=640x360:r=10:d=3,drawbox=x=0:y=0:w=iw:h=ih:color=red:t=6" \
  -pix_fmt yuv420p "$out/test.mp4"

cat > "$out/shot.lua" <<'LUA'
local out = os.getenv("SPIKE_SHOT")
mp.register_event("playback-restart", function()
  mp.add_timeout(0.7, function()
    mp.commandv("screenshot-to-file", out, "window")
    mp.add_timeout(0.3, function() mp.command("quit") end)
  end)
end)
LUA

shoot() {
  name=$1
  shift
  SPIKE_SHOT="$out/$name.png" mpv --no-config --vo=gpu --focus-on=never --no-audio --pause \
    --geometry=1000x600+80+80 --no-osc --no-osd-bar --osd-level=0 --script="$out/shot.lua" \
    "$@" "$out/test.mp4" > "$out/$name.log" 2>&1 || true
  python3 -I "$here/spike-47-bbox.py" "$out/$name.png"
}

shoot baseline
shoot margin-right-0.3 --video-margin-ratio-right=0.3
shoot margin-left-0.3 --video-margin-ratio-left=0.3
shoot margin-right-0.3-bottom-0.1 --video-margin-ratio-right=0.3 --video-margin-ratio-bottom=0.1
shoot margin-right-0.3-keepaspect-no --video-margin-ratio-right=0.3 --keepaspect=no
echo "outputs in $out"
