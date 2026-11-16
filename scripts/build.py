#!/usr/bin/env python3
"""Build the Streams IINA plugin bundle and .iinaplgz archive."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT
HELPER_ORDER = {'runner': 0, 'media': 1, 'acquire': 2, 'replay': 3}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def build(output):
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    info = json.loads((SOURCE / 'Info.json').read_text())
    version = info['version']
    identifier = info['identifier']

    PLUGIN_ENTRIES = ['Info.json', 'config.js', 'global.js', 'main.js', 'src', 'ui', 'helpers']
    source_files = sorted(
        p for entry in PLUGIN_ENTRIES for p in ([SOURCE / entry] if (SOURCE / entry).is_file() else (SOURCE / entry).rglob('*'))
        if p.is_file() and '__pycache__' not in p.parts and p.suffix != '.pyc'
    )
    helper_paths = sorted(
        SOURCE.joinpath('helpers').glob('*.py'),
        key=lambda p: (HELPER_ORDER.get(p.stem, len(HELPER_ORDER)), p.name),
    )
    embedded = {p.stem: {'digest': digest(p.read_bytes()), 'source': p.read_text()} for p in helper_paths}

    bundle = output / 'streams.iinaplugin'
    archive = output / f'iina-streams-{version}.iinaplgz'

    temp = Path(tempfile.mkdtemp(prefix='.build-', dir=str(output)))
    try:
        for path in source_files:
            target = temp / path.relative_to(SOURCE)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(path.read_bytes())
        (temp / 'src' / 'embedded-helpers.js').write_text(
            '"use strict";\nmodule.exports=' + json.dumps(embedded, ensure_ascii=True, separators=(',', ':')) + ';\n'
        )
        if bundle.exists():
            shutil.rmtree(bundle)
        temp.rename(bundle)
    finally:
        if temp.exists():
            shutil.rmtree(temp)

    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as packed:
        for path in sorted(bundle.rglob('*')):
            if not path.is_file():
                continue
            item = zipfile.ZipInfo(str(path.relative_to(bundle)), (2026, 11, 15, 0, 0, 0))
            item.compress_type = zipfile.ZIP_DEFLATED
            item.external_attr = 0o100644 << 16
            packed.writestr(item, path.read_bytes())
    with zipfile.ZipFile(archive) as packed:
        assert packed.testzip() is None

    try:
        commit = subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], stderr=subprocess.DEVNULL, text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        commit = 'working-copy'

    manifest = {
        'sourceCommit': commit,
        'name': info['name'],
        'identifier': identifier,
        'version': version,
        'archive': archive.name,
        'sha256': digest(archive.read_bytes()),
    }
    (output / 'build-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default=str(ROOT / 'dist' / 'release'))
    args = parser.parse_args()
    print(json.dumps(build(args.output), indent=2))


if __name__ == '__main__':
    main()
