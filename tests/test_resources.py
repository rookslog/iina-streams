"""Read-only sampler scope and duration contracts; no native processes are queried."""
import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location('resources', Path(__file__).resolve().parents[1] / 'qa' / 'measure-resources.py')
resources = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(resources)

PS = '''100 1 12.5 102400 Sun Nov 8 12:00:00 2026 /Applications/IINA.app/Contents/MacOS/IINA
101 100 2.5 20480 Sun Nov 8 12:00:01 2026 /System/Library/com.apple.WebKit.WebContent
102 101 1.0 1024 Sun Nov 8 12:00:02 2026 /opt/homebrew/bin/python3
200 1 4.0 40960 Sun Nov 8 11:00:00 2026 /Applications/Safari.app/Contents/MacOS/Safari
201 200 6.0 51200 Sun Nov 8 11:00:01 2026 /System/Library/com.apple.WebKit.WebContent
202 1 3.0 30720 Sun Nov 8 12:00:03 2026 /System/Library/com.apple.WebKit.Networking
300 1 7.0 153600 Sun Nov 8 09:00:00 2026 /System/Library/WindowServer
'''


class ResourceTests(unittest.TestCase):
    def test_scope_uses_descendants_not_all_webkit_or_other_app(self):
        rows = resources.parse_processes(PS)
        result = resources.scope_processes(rows, 100, 'IINA', rows[100]['startedUTC'], {})
        self.assertEqual([p['pid'] for p in result['descendants']], [101, 102])
        self.assertEqual(result['scopedTotal']['rssKiB'], 123904)
        self.assertEqual(result['scopedTotal']['cpuPercent'], 16)
        self.assertEqual([p['pid'] for p in result['unattributedWebKit']], [201, 202])
        self.assertEqual([p['pid'] for p in result['windowServer']], [300])

    def test_explicit_webkit_requires_matching_initial_identity(self):
        rows = resources.parse_processes(PS)
        expected = {202: rows[202]['startedUTC']}
        result = resources.scope_processes(rows, 100, 'IINA', rows[100]['startedUTC'], expected)
        self.assertEqual([p['pid'] for p in result['explicitHelpers']], [202])
        rows[202]['startedUTC'] = '2026-11-08T12:00:30Z'
        result = resources.scope_processes(rows, 100, 'IINA', rows[100]['startedUTC'], expected)
        self.assertEqual(result['explicitHelpers'], [])
        self.assertEqual(result['missingOrChangedHelpers'], [202])

    def test_reused_or_missing_root_pid_never_counts_new_process(self):
        rows = resources.parse_processes(PS)
        with self.assertRaises(resources.MeasurementError):
            resources.scope_processes(rows, 100, 'IINA', '2026-11-08T00:00:00Z', {})
        with self.assertRaises(resources.MeasurementError):
            resources.scope_processes(rows, 999, 'IINA', None, {})

    def test_invalid_durations_intervals_and_pids_are_rejected(self):
        for duration, interval, pid in [(31, 2, 100), (0, 2, 100), (20, 0, 100), (20, 21, 100), (20, 2, 0)]:
            with self.subTest(duration=duration, interval=interval, pid=pid), self.assertRaises(resources.MeasurementError):
                resources.validate_options(pid, 'unified-off', duration, interval, [])
        resources.validate_options(100, 'unified-off', 30, 5, [202])

    def test_system_queries_are_read_only_and_parse_swap_as_bytes(self):
        calls = []
        def run(command):
            calls.append(command)
            if command[0].endswith('memory_pressure'):
                return 'System-wide memory free percentage: 42%'
            if command[0].endswith('vm_stat'):
                return 'Mach Virtual Memory Statistics: (page size of 16384 bytes)\nSwapins: 12.\nSwapouts: 3.\n'
            return 'vm.swapusage: total = 1024.00M  used = 12.00M  free = 1012.00M (encrypted)'
        result = resources.system_snapshot(run)
        self.assertEqual(result['memoryFreePercent'], 42)
        self.assertEqual(result['swap']['usedBytes'], 12 * 1024 * 1024)
        self.assertEqual(result['vm']['Swapins'], 12)
        self.assertEqual(calls, [['/usr/bin/memory_pressure', '-Q'], ['/usr/sbin/sysctl', 'vm.swapusage'], ['/usr/bin/vm_stat']])


if __name__ == '__main__':
    unittest.main()
