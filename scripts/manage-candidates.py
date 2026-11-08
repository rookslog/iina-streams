#!/usr/bin/env python3
"""Link or unlink only the isolated Unified/Focus candidate development plugins."""
import argparse
import json
import os
from pathlib import Path
import re
import stat
import sys

ROOT = Path(__file__).resolve().parents[1]
IDS = {'unified': 'local.iina.streams.candidate.unified', 'focus': 'local.iina.streams.candidate.focus'}
MAX_METADATA_BYTES = 64 * 1024
ERRORS = {
    'INVALID_ARGUMENTS': 'Choose install, rollback, or status and supply an absolute --plugins-dir.',
    'UNSAFE_PATH': 'Source and plugin directories must be existing, distinct, absolute directories without symbolic-link roots.',
    'INVALID_SOURCE': 'A selected candidate is missing, incomplete, linked to another location, or has an unexpected identifier/configuration. Build the Unified/Focus candidates first.',
    'DESTINATION_CONFLICT': 'A candidate destination contains a foreign item. No existing file, folder, or foreign link will be replaced.',
    'DUPLICATE_ID': 'This candidate identifier is already installed through another plugin path. Resolve that duplicate before adding a development link.',
    'IO_FAILED': 'The candidate links could not be changed. Check directory access and inspect the reported candidate link state.',
}


class InstallError(Exception):
    def __init__(self, code, *, variant=None, remaining=None):
        self.code, self.variant, self.remaining = code, variant, remaining or []
        super().__init__(ERRORS[code])


class SafeParser(argparse.ArgumentParser):
    def error(self, message):
        raise InstallError('INVALID_ARGUMENTS')


def directory(value):
    if (not isinstance(value, str) or not value or len(value) > 4096 or
            re.search(r'[\x00-\x1f\x7f\\]', value) or not os.path.isabs(value) or os.path.normpath(value) != value):
        raise InstallError('UNSAFE_PATH')
    path = Path(value)
    try:
        if not stat.S_ISDIR(path.lstat().st_mode):
            raise InstallError('UNSAFE_PATH')
        return path.resolve(strict=True)
    except OSError:
        raise InstallError('UNSAFE_PATH') from None


def read_small(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_size > MAX_METADATA_BYTES:
        raise InstallError('INVALID_SOURCE')
    flags = os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_NONBLOCK', 0)
    with os.fdopen(os.open(path, flags), 'rb') as stream:
        opened = os.fstat(stream.fileno())
        if not stat.S_ISREG(opened.st_mode) or (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
            raise InstallError('INVALID_SOURCE')
        data = stream.read(MAX_METADATA_BYTES + 1)
    if len(data) > MAX_METADATA_BYTES:
        raise InstallError('INVALID_SOURCE')
    return data.decode('utf-8')


def validate_source(root, variant, allow_missing=False):
    folder = root / ('streams-' + variant + '.iinaplugin')
    if not os.path.lexists(folder) and allow_missing:
        return folder, {'identityVerified': False, 'version': None, 'sourceState': 'missing'}
    try:
        if not stat.S_ISDIR(folder.lstat().st_mode):
            raise InstallError('INVALID_SOURCE', variant=variant)
        count = 0
        for path in folder.rglob('*'):
            count += 1
            if count > 4096 or not (stat.S_ISREG(path.lstat().st_mode) or stat.S_ISDIR(path.lstat().st_mode)):
                raise InstallError('INVALID_SOURCE', variant=variant)
        info = json.loads(read_small(folder / 'Info.json'))
        if (not isinstance(info, dict) or info.get('identifier') != IDS[variant] or
                info.get('entry') != 'main.js' or info.get('globalEntry') != 'global.js' or
                not isinstance(info.get('version'), str) or
                not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?', info['version'])):
            raise InstallError('INVALID_SOURCE', variant=variant)
        raw_config = read_small(folder / 'config.js')
        match = re.fullmatch(r'\s*["\']use strict["\'];\s*module\.exports\s*=\s*(\{.*\})\s*;\s*', raw_config, re.S)
        config = json.loads(match.group(1)) if match else None
        if (not isinstance(config, dict) or config.get('identifier') != IDS[variant] or
                config.get('variant') != variant or config.get('qa') is not False or
                os.path.lexists(folder / 'qa-harness.js')):
            raise InstallError('INVALID_SOURCE', variant=variant)
        for required in ['main.js', 'global.js', 'src/embedded-helpers.js']:
            if not stat.S_ISREG((folder / required).lstat().st_mode):
                raise InstallError('INVALID_SOURCE', variant=variant)
        return folder, {'identityVerified': True, 'version': info['version'], 'sourceState': 'verified'}
    except InstallError:
        raise
    except (OSError, ValueError, UnicodeError, RecursionError):
        raise InstallError('INVALID_SOURCE', variant=variant) from None


def link_state(directory_fd, name, target):
    try:
        info = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
    except FileNotFoundError:
        return 'absent'
    if (not stat.S_ISLNK(info.st_mode) or info.st_uid != os.geteuid() or
            os.readlink(name, dir_fd=directory_fd) != str(target)):
        raise InstallError('DESTINATION_CONFLICT')
    return 'linked'


def reject_duplicate_ids(plugins, rows):
    wanted = {row['identifier'] for row in rows}
    own_names = {Path(row['link']).name for row in rows}
    for entry in plugins.iterdir():
        if entry.name in own_names or not entry.name.endswith(('.iinaplugin', '.iinaplugin-dev')):
            continue
        try:
            info = json.loads(read_small(entry / 'Info.json'))
        except (OSError, ValueError, UnicodeError, RecursionError, InstallError):
            continue
        if isinstance(info, dict) and info.get('identifier') in wanted:
            raise InstallError('DUPLICATE_ID')


def manage(action, plugins_dir, source_dir=None, *, variant='all', dry_run=False):
    if action not in ('install', 'rollback', 'status') or variant not in ('all', 'unified', 'focus'):
        raise InstallError('INVALID_ARGUMENTS')
    plugins = directory(plugins_dir)
    source = directory(source_dir if source_dir is not None else str(ROOT / 'dist' / 'candidates'))
    if plugins == source or plugins in source.parents or source in plugins.parents:
        raise InstallError('UNSAFE_PATH')
    variants = list(IDS) if variant == 'all' else [variant]
    flags = os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0) | getattr(os, 'O_NOFOLLOW', 0)
    descriptor = os.open(plugins, flags)
    rows, created, removed = [], [], []
    try:
        for name in variants:
            target, metadata = validate_source(source, name, allow_missing=action == 'rollback')
            link = plugins / ('streams-' + name + '.iinaplugin-dev')
            state = link_state(descriptor, link.name, target)
            operation = 'none'
            if action == 'install' and state == 'absent': operation = 'link'
            if action == 'rollback' and state == 'linked': operation = 'unlink'
            rows.append(dict(metadata, variant=name, identifier=IDS[name], link=str(link), target=str(target),
                             state=state, operation=operation, changed=False))
        if action == 'install':
            reject_duplicate_ids(plugins, rows)
        # All selected variants have passed before the first filesystem mutation.
        if not dry_run and action != 'status':
            for row in rows:
                name, target = Path(row['link']).name, Path(row['target'])
                current = link_state(descriptor, name, target)
                if row['operation'] == 'link':
                    if current != 'absent':
                        raise InstallError('DESTINATION_CONFLICT')
                    os.symlink(str(target), name, target_is_directory=True, dir_fd=descriptor)
                    created.append((name, target))
                    row.update(state='linked', changed=True)
                elif row['operation'] == 'unlink':
                    if current != 'linked':
                        raise InstallError('DESTINATION_CONFLICT')
                    os.unlink(name, dir_fd=descriptor)
                    removed.append(name)
                    row.update(state='absent', changed=True)
        return {'ok': True, 'action': action, 'dryRun': bool(dry_run), 'sourceDir': str(source),
                'pluginsDir': str(plugins), 'links': rows}
    except (OSError, InstallError) as error:
        remaining = list(removed)
        for name, target in reversed(created):
            try:
                if link_state(descriptor, name, target) == 'linked':
                    os.unlink(name, dir_fd=descriptor)
            except (OSError, InstallError):
                remaining.append(name)
        if isinstance(error, InstallError) and not remaining:
            raise
        raise InstallError('IO_FAILED', remaining=remaining) from None
    finally:
        os.close(descriptor)


def main(argv=None):
    try:
        parser = SafeParser(description=__doc__, add_help=False, allow_abbrev=False)
        parser.add_argument('action', choices=['install', 'rollback', 'status'])
        parser.add_argument('--plugins-dir', required=True)
        parser.add_argument('--source-dir', default=str(ROOT / 'dist' / 'candidates'))
        parser.add_argument('--variant', choices=['all', 'unified', 'focus'], default='all')
        parser.add_argument('--dry-run', action='store_true')
        args = parser.parse_args(argv)
        result = manage(args.action, args.plugins_dir, args.source_dir, variant=args.variant, dry_run=args.dry_run)
    except InstallError as error:
        result = {'ok': False, 'error': {'code': error.code, 'message': str(error)}}
        if error.variant: result['error']['variant'] = error.variant
        if error.remaining: result['error']['changedLinks'] = error.remaining
    except Exception:
        result = {'ok': False, 'error': {'code': 'IO_FAILED', 'message': ERRORS['IO_FAILED']}}
    print(json.dumps(result, ensure_ascii=True, allow_nan=False, indent=2))
    return 0 if result['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
