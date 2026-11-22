#!/usr/bin/env python3
"""Fail fast when release metadata disagrees.

- Info.json and package.json carry the same version.
- Info.json keeps the GitHub fields IINA's installer/updater read (ghRepo, integer ghVersion).
- On a tag build (GITHUB_REF_TYPE=tag or --tag), the tag is exactly v<version>.
"""
import argparse
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]


def problems(info, package, tag=None):
    found = []
    if info.get('version') != package.get('version'):
        found.append(f"Info.json version {info.get('version')!r} != package.json version {package.get('version')!r}")
    if info.get('ghRepo') != 'rookslog/iina-streams':
        found.append(f"Info.json ghRepo is {info.get('ghRepo')!r}; IINA's updater needs 'rookslog/iina-streams'")
    if not isinstance(info.get('ghVersion'), int) or isinstance(info.get('ghVersion'), bool):
        found.append('Info.json ghVersion must be an integer (IINA compares it numerically)')
    if tag is not None and tag != 'v' + str(info.get('version')):
        found.append(f"tag {tag!r} does not match Info.json version {info.get('version')!r}")
    return found


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tag', help='Check against this tag (defaults to GITHUB_REF_NAME on tag builds)')
    args = parser.parse_args(argv)
    tag = args.tag
    if tag is None and os.environ.get('GITHUB_REF_TYPE') == 'tag':
        tag = os.environ.get('GITHUB_REF_NAME')
    info = json.loads((ROOT / 'Info.json').read_text())
    package = json.loads((ROOT / 'package.json').read_text())
    found = problems(info, package, tag)
    for line in found:
        print('version check: ' + line, file=sys.stderr)
    if not found:
        print(f"version check: {info['version']} (ghVersion {info['ghVersion']})" + (f', tag {tag}' if tag else ''))
    return 1 if found else 0


if __name__ == '__main__':
    sys.exit(main())
