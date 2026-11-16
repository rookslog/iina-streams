#!/bin/sh
# Read-only snapshot. Never conflates accumulated swap with swap rate.
set -eu
echo "Timestamp: $(date -Iseconds)"
echo 'Swap (cumulative allocation, not swap-in/out rate):'
sysctl vm.swapusage
echo 'Processes (resident RSS in KiB; cross-process sums overcount shared mappings):'
ps -axo pid,ppid,%cpu,rss,comm | awk 'NR==1 || /IINA|streamlink|Safari|WebKit|mpv/' | head -60
echo 'Memory pressure:'
memory_pressure -Q 2>/dev/null | tail -8 || true
