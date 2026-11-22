#!/bin/sh
# Spike #47: build and run spike-47-libmpv-margin.c headless, then print each step's picture box.
# Needs: Homebrew mpv (headers and libmpv), ffmpeg, python3 with numpy and PIL.
# Usage: sh spike-47-libmpv.sh [outdir]    (default outdir: a fresh temp directory)
set -eu

here=$(cd "$(dirname "$0")" && pwd)
out=${1:-$(mktemp -d)}
mkdir -p "$out"

ffmpeg -v error -y -f lavfi -i "color=c=0x2060c0:s=640x360:r=10:d=3,drawbox=x=0:y=0:w=iw:h=ih:color=red:t=6" \
  -pix_fmt yuv420p "$out/test.mp4"

cc -o "$out/spike-47-libmpv-margin" "$here/spike-47-libmpv-margin.c" \
  -I/opt/homebrew/include -L/opt/homebrew/lib -lmpv -Wl,-rpath,/opt/homebrew/lib

"$out/spike-47-libmpv-margin" "$out/test.mp4" "$out"

for ppm in "$out"/*.ppm; do
  python3 -I -c "
import sys
from PIL import Image
Image.open(sys.argv[1]).save(sys.argv[1][:-4] + '.png')
" "$ppm"
  python3 -I "$here/spike-47-bbox.py" "${ppm%.ppm}.png"
done
