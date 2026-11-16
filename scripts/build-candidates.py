#!/usr/bin/env python3
"""Build isolated candidate archives. Never installs a plugin or writes a stable ID."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'candidate-plugin'
IDS = {'unified': 'local.iina.streams.candidate.unified', 'focus': 'local.iina.streams.candidate.focus', 'qa': 'local.iina.streams.qa'}
HASH = re.compile(r'[0-9a-f]{64}')
VERSION = re.compile(r'[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?')
# Preserve the published 0.5.0 archive bytes across filesystem enumeration orders.
HELPER_ORDER = {'runner': 0, 'media': 1, 'acquire': 2, 'replay': 3}

def digest(data):
    return hashlib.sha256(data).hexdigest()


def metadata(stream):
    data = stream.read(1024 * 1024 + 1)
    if len(data) > 1024 * 1024:
        raise ValueError('Output metadata is too large')
    return json.loads(data)


def output_state(path, validate):
    """Only inspect regular files owned by this account; never follow a link."""
    try:
        before = path.lstat()
    except FileNotFoundError:
        return None
    if not stat.S_ISREG(before.st_mode) or before.st_uid != os.geteuid() or before.st_size > 32 * 1024 * 1024:
        raise ValueError('Refusing a linked, nonregular, foreign, or oversized output file')
    fingerprint = lambda value: (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns)
    try:
        flags = os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_NONBLOCK', 0)
        with os.fdopen(os.open(path, flags), 'rb') as stream:
            if fingerprint(os.fstat(stream.fileno())) != fingerprint(before):
                raise ValueError('Output changed during inspection')
            validate(stream)
    except (OSError, UnicodeError, json.JSONDecodeError, zipfile.BadZipFile, KeyError, TypeError) as error:
        raise ValueError('Refusing an unrecognized output file') from error
    return fingerprint(before)


def validate_archive(stream, variant, version):
    with zipfile.ZipFile(stream) as packed:
        names = packed.namelist()
        if (len(names) > 256 or len(names) != len(set(names)) or 'qa-harness.js' in names or
                any(PurePosixPath(name).is_absolute() or '..' in PurePosixPath(name).parts for name in names)):
            raise ValueError('Refusing an unrecognized archive')
        for name in ['Info.json', 'config.js', 'main.js', 'global.js', 'src/embedded-helpers.js']:
            packed.getinfo(name)
        if packed.getinfo('Info.json').file_size > 65536 or packed.getinfo('config.js').file_size > 65536:
            raise ValueError('Archive identity metadata is too large')
        info = json.loads(packed.read('Info.json'))
        raw_config = packed.read('config.js').decode('utf-8')
        match = re.fullmatch(r'\s*["\']use strict["\'];\s*module\.exports\s*=\s*(\{.*\})\s*;\s*', raw_config, re.S)
        config = json.loads(match.group(1)) if match else None
        if (not isinstance(info, dict) or info.get('identifier') != IDS[variant] or info.get('version') != version or
                not isinstance(config, dict) or config.get('identifier') != IDS[variant] or
                config.get('variant') != variant or config.get('qa') is not False):
            raise ValueError('Refusing another plugin archive')


def validate_manifest(stream, qa):
    value = metadata(stream)
    if (not isinstance(value, dict) or set(value) != {'sourceCommit', 'files', 'packages'} or
            not isinstance(value['sourceCommit'], str) or not 1 <= len(value['sourceCommit']) <= 128 or
            not isinstance(value['files'], dict) or not {'Info.json', 'main.js', 'global.js'} <= set(value['files']) or
            not isinstance(value['packages'], list)):
        raise ValueError('Refusing an unrecognized build manifest')
    for name, checksum in value['files'].items():
        if (not isinstance(name, str) or not name or PurePosixPath(name).is_absolute() or '..' in PurePosixPath(name).parts or
                not isinstance(checksum, str) or not HASH.fullmatch(checksum)):
            raise ValueError('Refusing an unrecognized build manifest')
    expected = set() if qa else {IDS['unified'], IDS['focus']}
    actual = set()
    for item in value['packages']:
        if (not isinstance(item, dict) or set(item) != {'name', 'identifier', 'sha256'} or
                item['identifier'] not in expected or not isinstance(item['name'], str) or
                not isinstance(item['sha256'], str) or not HASH.fullmatch(item['sha256'])):
            raise ValueError('Refusing an unrecognized package manifest')
        variant = item['identifier'].rsplit('.', 1)[1]
        prefix = 'iina-streams-' + variant + '-'
        if not item['name'].startswith(prefix) or not item['name'].endswith('.iinaplgz') or not VERSION.fullmatch(item['name'][len(prefix):-9]):
            raise ValueError('Refusing an unrecognized package filename')
        actual.add(item['identifier'])
    if actual != expected or len(value['packages']) != len(expected):
        raise ValueError('Refusing an incomplete or foreign build manifest')


def candidate_state(path, variant):
    try:
        before = path.lstat()
    except FileNotFoundError:
        return None
    if not stat.S_ISDIR(before.st_mode) or before.st_uid != os.geteuid():
        raise ValueError('Refusing to replace a linked or foreign output directory')
    def identity(stream):
        value = metadata(stream)
        if not isinstance(value, dict) or value.get('identifier') != IDS[variant]:
            raise ValueError('Refusing to replace another plugin')
    if output_state(path / 'Info.json', identity) is None:
        raise ValueError('Refusing to replace an unrecognized output directory')
    return before.st_dev, before.st_ino


def publish_file(path, previous, validate, write):
    descriptor, name = tempfile.mkstemp(prefix='.package-', dir=str(path.parent))
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, 'w+b') as stream:
            write(stream)
            stream.flush()
            os.fsync(stream.fileno())
            stream.seek(0)
            validate(stream)
        if output_state(path, validate) != previous:
            raise ValueError('Output changed before publication')
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def build(output, qa=None):
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    try:
        commit = subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], stderr=subprocess.DEVNULL, text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        commit = 'working-copy'
    source_files = sorted(p for p in SOURCE.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix != '.pyc')
    manifest = {'sourceCommit': commit, 'files': {str(p.relative_to(SOURCE)): digest(p.read_bytes()) for p in source_files}, 'packages': []}
    helper_paths = sorted(SOURCE.joinpath('helpers').glob('*.py'),
                          key=lambda p: (HELPER_ORDER.get(p.stem, len(HELPER_ORDER)), p.name))
    embedded = {p.stem: {'digest': digest(p.read_bytes()), 'source': p.read_text()} for p in helper_paths}
    if not {'media', 'replay'}.issubset(embedded):
        raise ValueError('Required helper source is absent')
    variants = ['qa'] if qa else ['unified', 'focus']
    version = json.loads((SOURCE / 'Info.json').read_text()).get('version')
    if not isinstance(version, str) or not VERSION.fullmatch(version):
        raise ValueError('Invalid candidate version')
    manifest_path = output / ('qa-build.json' if qa else 'build-manifest.json')
    manifest_validator = lambda stream: validate_manifest(stream, bool(qa))
    manifest_previous = output_state(manifest_path, manifest_validator)
    plans = []
    # Validate every selected destination before replacing the first candidate.
    for variant in variants:
        name = 'streams-' + variant + '.iinaplugin'
        dest = output / name
        previous = candidate_state(dest, variant)
        archive = output / ('iina-streams-' + variant + '-' + version + '.iinaplgz') if not qa else None
        validator = lambda stream, variant=variant: validate_archive(stream, variant, version)
        archive_previous = output_state(archive, validator) if archive else None
        plans.append((variant, dest, previous, archive, archive_previous, validator))
    for variant, dest, previous, archive, archive_previous, validator in plans:
        temp = Path(tempfile.mkdtemp(prefix='.build-', dir=str(output)))
        try:
            for path in source_files:
                relative = path.relative_to(SOURCE)
                target = temp / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(path.read_bytes())
            info = json.loads((temp / 'Info.json').read_text())
            info.update(identifier=IDS[variant], name='Streams ' + ('QA Harness' if qa else variant.title() + ' Candidate'))
            info['sidebarTab'] = {'name': 'Streams ' + (qa.get('variant', 'unified') if qa else variant).title()}
            (temp / 'Info.json').write_text(json.dumps(info, indent=2) + '\n')
            config = {'identifier': IDS[variant], 'variant': qa.get('variant', 'unified') if qa else variant, 'qa': qa or False}
            (temp / 'config.js').write_text('"use strict";\nmodule.exports=' + json.dumps(config, separators=(',', ':')) + ';\n')
            (temp / 'src' / 'embedded-helpers.js').write_text('"use strict";\nmodule.exports=' + json.dumps(embedded, ensure_ascii=True, separators=(',', ':')) + ';\n')
            if qa:
                shutil.copyfile(ROOT / 'qa' / 'qa-harness.js', temp / 'qa-harness.js')
            if candidate_state(dest, variant) != previous:
                raise ValueError('Candidate directory changed during build')
            if previous is not None:
                shutil.rmtree(dest)
            temp.rename(dest)
        finally:
            if temp.exists():
                shutil.rmtree(temp)
        if not qa:
            def write_archive(stream):
                with zipfile.ZipFile(stream, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as packed:
                    for path in sorted(dest.rglob('*')):
                        if not path.is_file():
                            continue
                        item = zipfile.ZipInfo(str(path.relative_to(dest)), (2026, 11, 8, 0, 0, 0))
                        item.compress_type = zipfile.ZIP_DEFLATED
                        item.external_attr = 0o100644 << 16
                        packed.writestr(item, path.read_bytes())
                stream.seek(0)
                with zipfile.ZipFile(stream) as packed:
                    assert packed.testzip() is None
            publish_file(archive, archive_previous, validator, write_archive)
            manifest['packages'].append({'name': archive.name, 'identifier': IDS[variant], 'sha256': digest(archive.read_bytes())})
    publish_file(manifest_path, manifest_previous, manifest_validator,
                 lambda stream: stream.write((json.dumps(manifest, indent=2) + '\n').encode('utf-8')))
    return manifest

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default=str(ROOT / 'dist' / 'candidates'))
    parser.add_argument('--qa-config')
    args = parser.parse_args()
    qa = json.loads(Path(args.qa_config).read_text()) if args.qa_config else None
    if qa is not None and (qa.get('variant') not in ('unified', 'focus') or not isinstance(qa.get('source'), dict)):
        parser.error('QA configuration requires a variant and explicit source')
    print(json.dumps(build(args.output, qa), indent=2))

if __name__ == '__main__':
    main()
