#!/usr/bin/env python3
"""Build isolated candidate archives. Never installs a plugin or writes a stable ID."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'candidate-plugin'
IDS = {'unified': 'local.iina.streams.candidate.unified', 'focus': 'local.iina.streams.candidate.focus', 'qa': 'local.iina.streams.qa'}

def digest(data):
    return hashlib.sha256(data).hexdigest()

def build(output, qa=None):
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    try:
        commit = subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], stderr=subprocess.DEVNULL, text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        commit = 'working-copy'
    source_files = sorted(p for p in SOURCE.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix != '.pyc')
    manifest = {'sourceCommit': commit, 'files': {str(p.relative_to(SOURCE)): digest(p.read_bytes()) for p in source_files}, 'packages': []}
    embedded = {p.stem: {'digest': digest(p.read_bytes()), 'source': p.read_text()} for p in SOURCE.joinpath('helpers').glob('*.py')}
    if not {'media', 'replay'}.issubset(embedded):
        raise ValueError('Required helper source is absent')
    variants = ['qa'] if qa else ['unified', 'focus']
    for variant in variants:
        name = 'streams-' + variant + '.iinaplugin'
        dest = output / name
        if dest.exists():
            try:
                previous = json.loads((dest / 'Info.json').read_text())
            except (OSError, ValueError):
                raise ValueError('Refusing to replace an unrecognized output directory')
            if dest.is_symlink() or previous.get('identifier') != IDS[variant]:
                raise ValueError('Refusing to replace another plugin')
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
            if dest.exists():
                shutil.rmtree(dest)
            temp.rename(dest)
        finally:
            if temp.exists():
                shutil.rmtree(temp)
        if not qa:
            archive = output / ('iina-streams-' + variant + '-' + info['version'] + '.iinaplgz')
            with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as packed:
                for path in sorted(dest.rglob('*')):
                    if not path.is_file():
                        continue
                    item = zipfile.ZipInfo(str(path.relative_to(dest)), (2026, 11, 8, 0, 0, 0))
                    item.compress_type = zipfile.ZIP_DEFLATED
                    item.external_attr = 0o100644 << 16
                    packed.writestr(item, path.read_bytes())
            with zipfile.ZipFile(archive) as packed:
                assert packed.testzip() is None
                assert json.loads(packed.read('Info.json'))['identifier'] == IDS[variant]
                assert 'qa-harness.js' not in packed.namelist()
            manifest['packages'].append({'name': archive.name, 'identifier': IDS[variant], 'sha256': digest(archive.read_bytes())})
    (output / ('qa-build.json' if qa else 'build-manifest.json')).write_text(json.dumps(manifest, indent=2) + '\n')
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
