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
PLUGIN_ENTRIES = ['Info.json', 'config.js', 'global.js', 'main.js', 'src', 'ui', 'helpers', 'LICENSE']


def digest(data):
    return hashlib.sha256(data).hexdigest()


def git_state():
    """Build identity is the actual source commit, never a made-up release number."""
    try:
        commit = subprocess.check_output(
            ['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], stderr=subprocess.DEVNULL, text=True
        ).strip()
        dirty = bool(subprocess.check_output(
            ['git', '-C', str(ROOT), 'status', '--porcelain', '--untracked-files=all'],
            stderr=subprocess.DEVNULL, text=True
        ).strip())
        tags = set(subprocess.check_output(
            ['git', '-C', str(ROOT), 'tag', '--points-at', 'HEAD'],
            stderr=subprocess.DEVNULL, text=True
        ).splitlines())
        return commit, dirty, tags
    except (OSError, subprocess.CalledProcessError):
        return 'working-copy', True, set()


VARIANTS = {
    # variant: (identifier suffix, name suffix, version tag, bundle stem)
    'release': ('', '', None, 'streams'),
    'beta': ('.beta', ' Beta', 'beta', 'streams-beta'),
    'dev': ('.dev', ' Dev', 'dev', 'streams-dev'),
}


def embedded_helpers_js():
    """The src/embedded-helpers.js text for the current helpers/*.py. Builds and the checked-in copy must match it."""
    helper_paths = sorted(
        SOURCE.joinpath('helpers').glob('*.py'),
        key=lambda p: (HELPER_ORDER.get(p.stem, len(HELPER_ORDER)), p.name),
    )
    embedded = {p.stem: {'digest': digest(p.read_bytes()), 'source': p.read_text()} for p in helper_paths}
    return '"use strict";\nmodule.exports=' + json.dumps(embedded, ensure_ascii=True, separators=(',', ':')) + ';\n'


def sync_embedded():
    """Rewrite the checked-in src/embedded-helpers.js. A source install (IINA's main.zip fallback) runs this copy."""
    target = SOURCE / 'src' / 'embedded-helpers.js'
    text = embedded_helpers_js()
    changed = target.read_text() != text
    target.write_text(text)
    return changed


def build(output, beta=False, dev=False):
    """Build one variant. `dev` is the linked development identity; `beta` the packaged beta."""
    if beta and dev:
        raise ValueError('Choose one variant: beta or dev.')
    variant = 'dev' if dev else 'beta' if beta else 'release'
    id_suffix, name_suffix, tag, stem = VARIANTS[variant]
    isolated = variant != 'release'
    info = json.loads((SOURCE / 'Info.json').read_text())
    version = info['version']
    commit, dirty, tags = git_state()
    ref = ('g' + commit[:8]) if commit != 'working-copy' else 'working'
    if dirty:
        ref += '.dirty'
    if not isolated and (dirty or 'v' + version not in tags):
        raise ValueError('Stable packaging requires a clean checkout at its matching release tag.')
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    identifier = info['identifier'] + id_suffix
    name = info['name'] + name_suffix
    build_version = f'{version}-{tag}+{ref}' if isolated else version

    source_files = sorted(
        p for entry in PLUGIN_ENTRIES for p in ([SOURCE / entry] if (SOURCE / entry).is_file() else (SOURCE / entry).rglob('*'))
        if p.is_file() and '__pycache__' not in p.parts and p.suffix != '.pyc'
    )
    bundle = output / f'{stem}.iinaplugin'
    archive = output / (f'iina-{stem}-{version}-{ref}.iinaplgz' if isolated else f'iina-streams-{version}.iinaplgz')

    temp = Path(tempfile.mkdtemp(prefix='.build-', dir=str(output)))
    try:
        for path in source_files:
            target = temp / path.relative_to(SOURCE)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(path.read_bytes())
        if isolated:
            isolated_info = dict(info)
            isolated_info['name'] = name
            isolated_info['identifier'] = identifier
            isolated_info['version'] = build_version
            # Isolated builds must never answer IINA's GitHub update check.
            isolated_info.pop('ghRepo', None)
            isolated_info.pop('ghVersion', None)
            (temp / 'Info.json').write_text(json.dumps(isolated_info, indent=2) + '\n')
            runtime = {'identifier': identifier, 'variant': 'unified', 'beta': True, 'qa': False}
            if variant == 'dev':
                runtime['dev'] = True
            (temp / 'config.js').write_text(
                '"use strict";\nmodule.exports=' + json.dumps(runtime, separators=(',', ':')) + ';\n'
            )
        (temp / 'src' / 'embedded-helpers.js').write_text(embedded_helpers_js())
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


    manifest = {
        'sourceCommit': commit,
        'sourceDirty': dirty,
        'buildRef': ref,
        'targetVersion': version,
        'name': name,
        'identifier': identifier,
        'variant': variant,
        'version': build_version,
        'archive': archive.name,
        'sha256': digest(archive.read_bytes()),
    }
    (output / 'build-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default=str(ROOT / 'dist' / 'release'))
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--beta', action='store_true', help='Build isolated Streams Beta package')
    group.add_argument('--dev', action='store_true', help='Build isolated Streams Dev bundle (for the linked dev workflow)')
    group.add_argument('--sync-embedded', action='store_true', help='Rewrite the checked-in src/embedded-helpers.js from helpers/*.py')
    args = parser.parse_args()
    if args.sync_embedded:
        print('src/embedded-helpers.js ' + ('updated' if sync_embedded() else 'already current'))
        return
    print(json.dumps(build(args.output, beta=args.beta, dev=args.dev), indent=2))


if __name__ == '__main__':
    main()
