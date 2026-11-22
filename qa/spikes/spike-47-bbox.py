#!/usr/bin/env python3
"""Print the bounding box of non-black pixels in an image, as pixels and as fractions.

Usage: python3 -I spike-47-bbox.py image.png [threshold]

The spike's test picture is a solid blue frame with a red border on a black
background, so the bounding box of non-black pixels is the rectangle mpv drew
the picture into.
"""
import sys

import numpy
from PIL import Image


def bounding_box(path, threshold):
    pixels = numpy.asarray(Image.open(path).convert("RGB"))
    height, width = pixels.shape[:2]
    lit = pixels.max(axis=2) > threshold
    rows = numpy.where(lit.any(axis=1))[0]
    columns = numpy.where(lit.any(axis=0))[0]
    if rows.size == 0:
        return width, height, None
    box = (int(columns[0]), int(rows[0]), int(columns[-1]) + 1, int(rows[-1]) + 1)
    return width, height, box


def main():
    path = sys.argv[1]
    threshold = int(sys.argv[2]) if len(sys.argv) > 2 else 24
    width, height, box = bounding_box(path, threshold)
    if box is None:
        print(f"{path}: image {width}x{height}, no non-black pixels")
        return 1
    left, top, right, bottom = box
    print(
        f"{path}: image {width}x{height}; picture x {left}..{right} y {top}..{bottom} "
        f"(w {right - left}, h {bottom - top}); "
        f"fractions left {left / width:.3f} right {right / width:.3f} "
        f"top {top / height:.3f} bottom {bottom / height:.3f}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
