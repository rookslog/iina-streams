// Runs a command under /usr/bin/time -l and prints wall time, CPU user/sys (children included), the largest single
// process RSS (`time -l`), AND the peak SUM of RSS across the whole process tree sampled every ~100 ms with `ps`
// (so Python + yt-dlp + any grandchild are counted together; sampling can miss sub-100 ms spikes).
// Prints a REDACTED view of stdout (counts/keys only).
// Usage: node measure-helper.mjs [--json-keys] [--env LC_ALL-only] -- <cmd> [args...]
import { spawn, spawnSync } from 'node:child_process';
const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const mode = argv.slice(0, sep);
const cmd = argv.slice(sep + 1);
const opts = { stdio: ['ignore', 'pipe', 'pipe'] };
if (mode.includes('--env-lc-all-only')) opts.env = { LC_ALL: 'en_US.UTF-8' }; // what iina.utils.exec provides

function tree(rootPid) {
  const ps = spawnSync('/bin/ps', ['-axo', 'pid=,ppid=,rss='], { encoding: 'utf8' }).stdout.trim().split('\n').map(l => l.trim().split(/\s+/).map(Number));
  const kids = new Map(); const rss = new Map();
  for (const [pid, ppid, r] of ps) { rss.set(pid, r); (kids.get(ppid) || kids.set(ppid, []).get(ppid)).push(pid); }
  let sum = 0, n = 0; const stack = [rootPid];
  while (stack.length) { const p = stack.pop(); if (rss.has(p)) { sum += rss.get(p); n++; } for (const c of kids.get(p) || []) stack.push(c); }
  return { sumKB: sum, procs: n };
}

const t0 = performance.now();
const child = spawn('/usr/bin/time', ['-l', ...cmd], opts);
let stdout = '', stderr = '', peakSum = 0, peakProcs = 0;
child.stdout.on('data', d => { stdout += d; });
child.stderr.on('data', d => { stderr += d; });
const timer = setInterval(() => { try { const t = tree(child.pid); if (t.sumKB > peakSum) peakSum = t.sumKB; if (t.procs > peakProcs) peakProcs = t.procs; } catch (_) {} }, 100);
child.on('close', code => {
  clearInterval(timer);
  const wallMs = Math.round(performance.now() - t0);
  const rss = /(\d+)\s+maximum resident set size/.exec(stderr);
  const user = /([\d.]+)\s+user/.exec(stderr), sys = /([\d.]+)\s+sys/.exec(stderr);
  const out = { wallMs, cpuUserSec: user && +user[1], cpuSysSec: sys && +sys[1], cpuTotalSec: user && sys && +(+user[1] + +sys[1]).toFixed(2),
    largestProcessRssMB: rss ? +(Number(rss[1]) / 1048576).toFixed(1) : null, peakTreeRssSumMB: +(peakSum / 1024).toFixed(1), peakTreeProcs: peakProcs, exit: code, stdoutBytes: stdout.length };
  if (mode.includes('--json-keys')) {
    try {
      const j = JSON.parse(stdout);
      out.ok = j.ok; if (j.error) out.errorCode = j.error.code; if (j.window) out.window = j.window;
      if (j.formats) out.formatCount = j.formats.length; if (j.quality) out.quality = j.quality;
      out.keys = Object.keys(j);
    } catch (_) { out.parse = 'not-json'; }
  }
  console.log(JSON.stringify(out));
});
