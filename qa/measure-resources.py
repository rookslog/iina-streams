#!/usr/bin/env python3
"""Read-only macOS sampling for an explicit IINA/Safari PID; one JSON result on stdout.

No app launch/close, preferences, debugger attachment, memory pressure generation,
network requests, argv inspection, environment inspection, or filesystem writes.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import plistlib
import re
import subprocess
import sys
import time

PS_COMMAND = ['/bin/ps', '-ww', '-axo', 'pid=,ppid=,pcpu=,rss=,lstart=,comm=']
METADATA_KEYS = {
    'candidate', 'buildCommit', 'buildManifestSHA256', 'pluginIdentifier', 'mode', 'chatMode', 'presentation',
    'sourceURL', 'sourceId', 'quality', 'videoCodec', 'videoWidth', 'videoHeight', 'videoFps',
    'audioCodec', 'audioChannels', 'audioSampleRate', 'hardwareDecode', 'windowWidth', 'windowHeight',
    'sidebarWidth', 'fullscreen', 'playbackPosition', 'playbackSpeed', 'paused', 'archiveId',
    'messageCount', 'rowLimit', 'fontSize', 'opacity', 'replayOffset', 'displayScale', 'displayRefreshHz',
    'powerState', 'otherPlayerCount', 'droppedFrames', 'buffering', 'notes',
}


class MeasurementError(Exception):
    pass


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def validate_options(pid, label, duration, interval, helper_pids):
    if (pid <= 0 or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,79}', label) or
            not math.isfinite(duration) or not 1 <= duration <= 30 or
            not math.isfinite(interval) or not 0.5 <= interval <= duration or
            len(helper_pids) > 32 or any(p <= 0 or p == pid for p in helper_pids)):
        raise MeasurementError('INVALID_OPTIONS')


def read_metadata(path):
    if path is None:
        return {}
    with Path(path).open('rb') as handle:
        raw = handle.read(16385)
    if len(raw) > 16384:
        raise MeasurementError('METADATA_LIMIT')
    value = json.loads(raw)
    if not isinstance(value, dict) or set(value) - METADATA_KEYS:
        raise MeasurementError('INVALID_METADATA')
    for key, item in value.items():
        if isinstance(item, str):
            if len(item) > 256 or re.search(r'[\x00-\x1f\x7f]', item):
                raise MeasurementError('INVALID_METADATA')
            if key == 'sourceURL':
                if not re.fullmatch(r'https://www\.(?:twitch\.tv/(?:videos/[0-9]{1,20}|[A-Za-z0-9_]{3,25})|youtube\.com/watch\?v=[A-Za-z0-9_-]{11})', item):
                    raise MeasurementError('PUBLIC_CANONICAL_SOURCE_REQUIRED')
            elif '://' in item:
                raise MeasurementError('URL_NOT_ALLOWED_IN_METADATA')
        elif item is not None and (not isinstance(item, (bool, int, float)) or
                                   isinstance(item, (int, float)) and not math.isfinite(item)):
            raise MeasurementError('INVALID_METADATA')
    return value


def parse_processes(text):
    rows = {}
    for line in text.splitlines():
        fields = line.split(None, 9)
        if len(fields) != 10:
            continue
        try:
            pid, ppid, cpu, rss = int(fields[0]), int(fields[1]), float(fields[2]), int(fields[3])
            started = datetime.strptime(' '.join(fields[4:9]), '%a %b %d %H:%M:%S %Y').replace(tzinfo=timezone.utc)
            if pid <= 0 or ppid < 0 or not math.isfinite(cpu) or cpu < 0 or rss < 0:
                continue
            rows[pid] = {'pid': pid, 'ppid': ppid, 'name': fields[9].rsplit('/', 1)[-1][:128],
                         'cpuPercent': cpu, 'rssKiB': rss, 'startedUTC': started.isoformat().replace('+00:00', 'Z')}
        except (ValueError, OverflowError):
            continue
    return rows


def scope_processes(rows, pid, expected_name, expected_start, explicit):
    root = rows.get(pid)
    if root is None:
        raise MeasurementError('ROOT_EXITED')
    if root['name'] != expected_name or expected_start is not None and root['startedUTC'] != expected_start:
        raise MeasurementError('ROOT_IDENTITY_CHANGED')
    owned = {pid}
    while True:
        expanded = owned | {p for p, row in rows.items() if row['ppid'] in owned}
        if expanded == owned:
            break
        owned = expanded
    descendants = [rows[p] for p in sorted(owned - {pid})]
    helpers, missing = [], []
    for helper_pid, started in explicit.items():
        row = rows.get(helper_pid)
        if row is None or row['startedUTC'] != started or 'WebKit' not in row['name']:
            missing.append(helper_pid)
        elif helper_pid not in owned:
            helpers.append(row)
    scoped = [root] + descendants + helpers
    associated = owned | {row['pid'] for row in helpers}
    unassigned = [rows[p] for p in sorted(rows) if 'WebKit' in rows[p]['name'] and p not in associated]
    return {'root': root, 'descendants': descendants, 'explicitHelpers': helpers,
            'missingOrChangedHelpers': sorted(missing),
            'scopedTotal': {'cpuPercent': round(sum(row['cpuPercent'] for row in scoped), 3),
                            'rssKiB': sum(row['rssKiB'] for row in scoped)},
            'windowServer': [row for row in rows.values() if row['name'] == 'WindowServer'],
            'unattributedWebKit': unassigned[:256], 'unattributedWebKitCount': len(unassigned)}


def system_snapshot(run):
    result = {'errors': []}
    for key, command in [('pressure', ['/usr/bin/memory_pressure', '-Q']),
                         ('swap', ['/usr/sbin/sysctl', 'vm.swapusage']), ('vm', ['/usr/bin/vm_stat'])]:
        try:
            text = run(command)
            if key == 'pressure':
                found = re.search(r'memory free percentage:\s*([0-9]+)%', text, re.I)
                result['memoryFreePercent'] = int(found.group(1)) if found else None
            elif key == 'swap':
                units = {'K': 1024, 'M': 1024 ** 2, 'G': 1024 ** 3, 'T': 1024 ** 4}
                result['swap'] = {name + 'Bytes': round(float(number) * units[unit])
                                  for name, number, unit in re.findall(r'(total|used|free)\s*=\s*([0-9.]+)([KMGT])', text)}
            else:
                size = re.search(r'page size of (\d+) bytes', text)
                result['vmPageSizeBytes'] = int(size.group(1)) if size else None
                result['vm'] = {name: int(number) for name, number in re.findall(r'^([A-Za-z -]+):\s*(\d+)\.?\s*$', text, re.M)}
        except MeasurementError as error:
            result['errors'].append({'query': key, 'code': str(error)})
    return result


def measure(args):
    validate_options(args.pid, args.label, args.duration, args.interval, args.helper_pid)
    metadata = read_metadata(args.metadata_file)
    if sys.platform != 'darwin':
        raise MeasurementError('MACOS_REQUIRED')
    started = time.monotonic()
    deadline = started + args.duration
    report = {'schemaVersion': 1, 'ok': True, 'label': args.label, 'app': args.app, 'rootPID': args.pid,
              'startedUTC': utc_now(), 'requestedSeconds': args.duration, 'intervalSeconds': args.interval,
              'samplerSHA256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'operatorMetadata': metadata, 'samples': [], 'environment': {}, 'queryErrors': [],
              'terminationReason': 'duration', 'network': 'unmeasured',
              'interpretation': ['CPU is native ps %cpu, without whole-machine normalization.',
                                 'RSS is KiB; sums may double-count shared pages and are not physical footprint.',
                                 'The root process includes all its players/tabs, not only the labeled workload.',
                                 'Explicit WebKit helpers are operator-attributed; PID/start identity is checked.',
                                 'WindowServer and unattributed WebKit are excluded from scopedTotal.',
                                 'Memory/swap are system-wide; the sampler does not generate memory pressure.']}

    def run(command):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise MeasurementError('DEADLINE')
        try:
            completed = subprocess.run(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                       stderr=subprocess.DEVNULL, timeout=min(1.0, remaining),
                                       env={'PATH': '/usr/bin:/bin:/usr/sbin:/sbin', 'LC_ALL': 'C', 'TZ': 'UTC'},
                                       shell=False, check=False)
        except subprocess.TimeoutExpired:
            raise MeasurementError('QUERY_TIMEOUT') from None
        except OSError:
            raise MeasurementError('QUERY_UNAVAILABLE') from None
        if completed.returncode != 0 or len(completed.stdout) > 2 * 1024 * 1024:
            raise MeasurementError('QUERY_FAILED')
        return completed.stdout.decode('utf-8', errors='replace')

    rows = parse_processes(run(PS_COMMAND))
    expected_name = {'iina': 'IINA', 'safari': 'Safari'}[args.app]
    initial = scope_processes(rows, args.pid, expected_name, None, {})
    root_start = initial['root']['startedUTC']
    explicit = {}
    for pid in set(args.helper_pid):
        if pid not in rows or 'WebKit' not in rows[pid]['name']:
            raise MeasurementError('EXPLICIT_HELPER_NOT_WEBKIT')
        explicit[pid] = rows[pid]['startedUTC']
    report['explicitHelperIdentities'] = explicit
    commands = [('macOS', ['/usr/bin/sw_vers']),
                ('hardware', ['/usr/sbin/sysctl', 'hw.model', 'hw.memsize', 'hw.logicalcpu', 'hw.physicalcpu']),
                ('repositoryCommit', ['/usr/bin/git', '-C', str(Path(__file__).resolve().parents[1]), 'rev-parse', 'HEAD'])]
    for key, command in commands:
        try:
            report['environment'][key] = run(command).strip()[:2048]
        except MeasurementError as error:
            report['queryErrors'].append({'query': key, 'code': str(error)})
    app_path = Path('/Applications/IINA.app/Contents/Info.plist' if args.app == 'iina' else '/Applications/Safari.app/Contents/Info.plist')
    try:
        with app_path.open('rb') as handle:
            info = plistlib.load(handle)
        report['environment']['installedAppVersion'] = {key: info.get(key) for key in ['CFBundleShortVersionString', 'CFBundleVersion', 'CFBundleIdentifier']}
    except (OSError, ValueError, plistlib.InvalidFileException):
        report['queryErrors'].append({'query': 'appVersion', 'code': 'UNAVAILABLE'})
    while time.monotonic() < deadline:
        sample_started, utc = time.monotonic(), utc_now()
        try:
            snapshot = scope_processes(parse_processes(run(PS_COMMAND)), args.pid, expected_name, root_start, explicit)
        except MeasurementError as error:
            report['terminationReason'] = str(error)
            break
        snapshot.update(utc=utc, elapsedSeconds=round(sample_started - started, 3), system=system_snapshot(run))
        snapshot['collectionSeconds'] = round(time.monotonic() - sample_started, 3)
        report['samples'].append(snapshot)
        delay = min(sample_started + args.interval, deadline) - time.monotonic()
        if delay > 0:
            time.sleep(delay)
    report['endedUTC'], report['elapsedSeconds'] = utc_now(), round(time.monotonic() - started, 3)
    report['sampleCount'], report['ok'] = len(report['samples']), bool(report['samples'])
    if len(report['samples']) >= 2:
        first, last = report['samples'][0]['system'], report['samples'][-1]['system']
        report['vmCounterDeltas'] = {key: last['vm'][key] - first['vm'][key]
                                    for key in ('Swapins', 'Swapouts', 'Pageins', 'Pageouts')
                                    if key in first.get('vm', {}) and key in last.get('vm', {})}
        if 'usedBytes' in first.get('swap', {}) and 'usedBytes' in last.get('swap', {}):
            report['swapUsedChangeBytes'] = last['swap']['usedBytes'] - first['swap']['usedBytes']
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument('--pid', type=int, required=True)
    parser.add_argument('--label', required=True)
    parser.add_argument('--app', choices=['iina', 'safari'], default='iina')
    parser.add_argument('--duration', type=float, default=20)
    parser.add_argument('--interval', type=float, default=2)
    parser.add_argument('--helper-pid', type=int, action='append', default=[])
    parser.add_argument('--metadata-file', help='Bounded workload JSON; no secrets or signed URLs.')
    args = parser.parse_args(argv)
    try:
        result = measure(args)
    except MeasurementError as error:
        result = {'ok': False, 'error': {'code': str(error)}}
    except (OSError, ValueError, TypeError, OverflowError):
        result = {'ok': False, 'error': {'code': 'INVALID_INPUT_OR_QUERY'}}
    except KeyboardInterrupt:
        result = {'ok': False, 'error': {'code': 'CANCELLED'}}
    print(json.dumps(result, ensure_ascii=True, allow_nan=False, indent=2))
    return 0 if result['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
