#!/usr/bin/env python3
"""Export this commission's clean source and sanitized review artifacts.

Reads the isolated checkout only. Does not install, enable, launch, or publish.
Original PNGs, raw chats, private diagnostics, caches and Git history stay local.
"""
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
RELEASE = '127f6b98587bbdb8a6f2c532ad2a97665b4a7611'
OUT = ROOT / 'dist' / 'delivery'
REPORTS = ['SELECTION-REPORT.md', 'EVIDENCE-APPENDIX.md', 'COMMISSION-AUDIT.md',
           'INSTALL-AND-ROLLBACK.md', 'CONTINUATION.md', 'PRESERVATION-AUDIT.md',
           'CHAT-AND-HELPER-AUDIT.md', 'RESOURCE-METHODOLOGY.md', 'RESOURCE-RESULTS.md',
           'EXECUTION-JOURNAL.md']
TOP_SOURCE = {'.gitignore', 'README.md', 'CHANGELOG.md', 'HANDOFF-GPT6-PRO.md'}
SOURCE_DIRS = {'candidate-plugin', 'plugin-dev', 'scripts', 'tests', 'tests_candidate', 'qa', 'docs'}
PRIVATE_VALUE = re.compile(r'(?:[?&](?:sig|signature|token|access_token|refresh_token|oauth_token|expire|Expires|Key-Pair-Id|Policy)=|Bearer [A-Za-z0-9._-]{12,}|oauth:[A-Za-z0-9]{12,})', re.I)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args], text=True).strip()


def checked_read(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError('Not a regular owned export input: ' + str(path))
    return path.read_bytes()


def archive(path, prefix, files, identity):
    ledger = {name: {'bytes': len(data), 'sha256': sha(data)} for name, data in sorted(files.items())}
    payload = dict(identity, members=ledger)
    files = dict(files, **{'PACKAGE-INDEX.json': (json.dumps(payload, indent=2) + '\n').encode()})
    with zipfile.ZipFile(path, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, data in sorted(files.items()):
            if PurePosixPath(name).is_absolute() or '..' in PurePosixPath(name).parts:
                raise ValueError('Unsafe archive member')
            info = zipfile.ZipInfo(prefix + '/' + name, (2026, 11, 8, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            z.writestr(info, data)
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None
        assert len(z.namelist()) == len(files)
        for name, row in ledger.items():
            assert sha(z.read(prefix + '/' + name)) == row['sha256']
    return {'file': path.name, 'bytes': path.stat().st_size, 'sha256': sha(path.read_bytes()), 'members': len(files)}


def main():
    if OUT.exists():
        raise SystemExit('Refusing to overwrite an existing delivery directory')
    if git('status', '--porcelain'):
        raise SystemExit('Commit the reviewed checkpoint before exporting')
    if git('diff', RELEASE, '--', 'candidate-plugin', 'scripts/manage-candidates.py'):
        raise SystemExit('Release product differs from the recorded production commit')
    changed_tests = set(git('diff', '--name-only', RELEASE, '--', 'tests_candidate').splitlines())
    if changed_tests - {'tests_candidate/test_build.py'}:
        raise SystemExit('Unexpected runtime test changes after the recorded production commit')
    head = git('rev-parse', 'HEAD')
    manifest = json.loads(checked_read(ROOT / 'dist/candidates/build-manifest.json'))
    assert manifest['sourceCommit'] == RELEASE
    for name, expected in manifest['files'].items():
        assert sha(checked_read(ROOT / 'candidate-plugin' / name)) == expected
    identity = {'productionCodeCommit': RELEASE, 'handoffCommit': head,
                'branch': git('branch', '--show-current'), 'stableDeployment': False,
                'normalCandidateVersion': '0.5.0',
                'buildScriptSHA256': sha(checked_read(ROOT / 'scripts/build-candidates.py')),
                'buildRegressionSHA256': sha(checked_read(ROOT / 'tests_candidate/test_build.py')),
                'packagingOnlyChange': 'Stable embedded-helper ordering reproduces the exact published R2 bytes; candidate-plugin is unchanged from the production commit.',
                'scope': 'Conditional candidate evaluation; see explicit gates in docs/SELECTION-REPORT.md.'}
    source = {}
    for name in git('ls-files').splitlines():
        parts = PurePosixPath(name).parts
        if name in TOP_SOURCE or parts[0] in SOURCE_DIRS:
            if '__pycache__' in parts or parts[:2] == ('qa', 'bin'):
                continue
            source[name] = checked_read(ROOT / name)
    source['release/build-manifest.json'] = checked_read(ROOT / 'dist/candidates/build-manifest.json')
    review = {'README.md': ('''# IINA Streams — review pack

Start with `docs/SELECTION-REPORT.md`. Unified is recommended for the first adoption review; Focus is the quieter contextual alternative. Both are isolated normal IINA candidates. Stable deployment is not authorized or performed.

`docs/EVIDENCE-APPENDIX.md` indexes the test evidence. `docs/COMMISSION-AUDIT.md` gives the detailed requirement matrix. Installation/rollback and the current continuation handoff are separate documents in `docs/`.

The two native archives and original build manifest are in `dist/candidates/`. Exact installed acceptance, final native cycles, and cleanup are in `evidence/native/`. Source is delivered separately as `IINA-Streams-Source-127f6b9.zip`.

Ten native JPEG captures are included. `evidence/native/capture-provenance.json` maps them to the exact original PNG hashes retained on Apollo. PNG paths in older evidence refer to those originals; the corresponding JPEG is the review derivative. Final R2 captures are ordinary installed-package states at different source times. Earlier matched QA captures at120seconds predate the last scroll-intent correction. No generated UI images are used.

Raw downloaded chat, the synthetic100k fixture, private process samples, full crash reports, unrelated Safari screenshots, compiled QA binaries, credentials and Git history are excluded. The fixture generator, acquisition commands, provenance and hashes remain available in the source and evidence. Source tests use controlled inputs; native and external acceptance limits are explicitly distinguished.

`PACKAGE-INDEX.json` hashes every other file in this archive. The separate delivery manifest records the exact production and documentation checkpoint identities.
''').encode()}
    for name in REPORTS:
        review['docs/' + name] = checked_read(ROOT / 'docs' / name)
    for path in sorted((ROOT / 'evidence').rglob('*')):
        if not path.is_file() or path.suffix not in {'.json', '.txt', '.md'}:
            continue
        relative = path.relative_to(ROOT)
        if 'raw' in relative.parts or 'private' in path.name:
            continue
        data = checked_read(path)
        if PRIVATE_VALUE.search(data.decode('utf-8', errors='replace')):
            raise ValueError('Potential signed/auth value in ' + str(relative))
        review[str(relative)] = data
    captures = json.loads(checked_read(ROOT / 'evidence/native/capture-provenance.json'))
    for item in captures['images']:
        p = ROOT / item['reviewImage']
        data = checked_read(p)
        assert sha(data) == item['reviewSHA256']
        review[item['reviewImage']] = data
    review['dist/candidates/build-manifest.json'] = checked_read(ROOT / 'dist/candidates/build-manifest.json')
    for item in manifest['packages']:
        data = checked_read(ROOT / 'dist/candidates' / item['name'])
        assert sha(data) == item['sha256']
        review['dist/candidates/' + item['name']] = data
    OUT.mkdir(parents=True)
    artifacts = [archive(OUT / 'IINA-Streams-Source-127f6b9.zip', 'IINA-Streams-Source', source, identity),
                 archive(OUT / 'IINA-Streams-Review-Pack.zip', 'IINA-Streams-Review', review, identity)]
    copies = [('docs/SELECTION-REPORT.md', 'IINA-Streams-Selection-Report.md'),
              ('docs/EVIDENCE-APPENDIX.md', 'IINA-Streams-Evidence-Appendix.md'),
              ('docs/COMMISSION-AUDIT.md', 'IINA-Streams-Technical-Audit.md'),
              ('docs/INSTALL-AND-ROLLBACK.md', 'IINA-Streams-Install-and-Rollback.md')]
    copies += [('dist/candidates/' + i['name'], i['name']) for i in manifest['packages']]
    copies += [(i['reviewImage'], Path(i['reviewImage']).name) for i in captures['images'] if '-r2-' in i['reviewImage']]
    for source_name, output_name in copies:
        data = checked_read(ROOT / source_name)
        (OUT / output_name).write_bytes(data)
        artifacts.append({'file': output_name, 'bytes': len(data), 'sha256': sha(data)})
    delivery = dict(identity, artifacts=artifacts, rawOriginalsRetainedOnApollo=True,
                    privateDiagnosticMaterialExcluded=True,
                    screenshotDerivativeIndex='evidence/native/capture-provenance.json')
    (OUT / 'DELIVERY-MANIFEST.json').write_text(json.dumps(delivery, indent=2) + '\n')
    files = sorted(p for p in OUT.iterdir() if p.is_file())
    (OUT / 'SHA256SUMS.txt').write_text(''.join(sha(p.read_bytes()) + '  ' + p.name + '\n' for p in files))
    print(json.dumps({'output': str(OUT), 'productionCodeCommit': RELEASE, 'handoffCommit': head,
                      'files': [{'name': p.name, 'bytes': p.stat().st_size, 'sha256': sha(p.read_bytes())} for p in sorted(OUT.iterdir())]}, indent=2))


if __name__ == '__main__':
    main()
