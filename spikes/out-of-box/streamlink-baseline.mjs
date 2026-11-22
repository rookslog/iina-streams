// Runs Streamlink exactly as helpers/media.py does and prints a REDACTED summary + wall time + peak RSS.
// Usage: node streamlink-baseline.mjs <twitch url>
// Never prints stream URLs; only names, types, and the URL host.
import { spawnSync } from 'node:child_process';
const url = process.argv[2];
const args = ['--no-config', '--no-plugin-cache', '--no-plugin-sideloading', '--http-ignore-env', '--webbrowser', 'false',
  '--loglevel', 'none', '--http-timeout', '12', '--json', url];
// /usr/bin/time -l reports "maximum resident set size" (bytes on macOS) and user/sys CPU.
const t0 = performance.now();
const r = spawnSync('/usr/bin/time', ['-l', '/opt/homebrew/bin/streamlink', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const wallMs = Math.round(performance.now() - t0);
const rss = /(\d+)\s+maximum resident set size/.exec(r.stderr);
const user = /([\d.]+)\s+user/.exec(r.stderr), sys = /([\d.]+)\s+sys/.exec(r.stderr);
let j; try { j = JSON.parse(r.stdout); } catch (_) { j = null; }
const out = { wallMs, peakRssMB: rss ? +(Number(rss[1]) / 1048576).toFixed(1) : null, cpuUserSec: user && +user[1], cpuSysSec: sys && +sys[1], exit: r.status };
if (j && j.streams) {
  out.plugin = j.plugin;
  out.streams = Object.entries(j.streams).map(([name, s]) => {
    // Hosts are not secret. The CloudFront tenant is kept in full because the plugin allowlists exact tenants.
    let host = ''; try { host = new URL(s.url).hostname; if (!host.endsWith('.cloudfront.net')) host = host.replace(/^[^.]+\./, '*.'); } catch (_) {}
    return { name, type: s.type, urlHost: host };
  });
  out.metadataKeys = j.metadata ? Object.keys(j.metadata) : null;
} else out.error = j && j.error ? 'streamlink-error' : 'no-json';
console.log(JSON.stringify(out));
