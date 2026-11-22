// Do the URLs that yt-dlp returns WITHOUT a JS runtime actually deliver? Fetches 6 MB of one 720p avc1 video format and
// reports status + throughput. Compares the IINA binary under IINA's environment (no PATH => no node/deno)
// with the same binary given a PATH that contains node/deno. The URL is never printed.
// Usage: node ytdlp-throttle.mjs <binary> <videoId> <env: iina|with-path>
import { spawnSync } from 'node:child_process';
const [, , bin, id, envName] = process.argv;
const env = { LC_ALL: 'en_US.UTF-8' };
if (envName === 'with-path') env.PATH = '/opt/homebrew/bin:/usr/bin:/bin';
const t0 = performance.now();
const r = spawnSync(bin, ['--ignore-config', '--no-cache-dir', '--no-playlist', '--no-warnings', '--no-remote-components', '-f', 'bv*[height<=720][vcodec^=avc1]', '-g', 'https://www.youtube.com/watch?v=' + id], { encoding: 'utf8', env });
const resolveMs = Math.round(performance.now() - t0);
const url = r.stdout.trim().split('\n')[0];
if (!/^https:\/\/[a-z0-9.-]+\.googlevideo\.com\//.test(url)) { console.log(JSON.stringify({ envName, resolveMs, ok: false, exit: r.status, err: r.stderr.replace(/https?:\/\/\S+/g, '<url>').slice(0, 200) })); process.exit(0); }
const t1 = performance.now();
const res = await fetch(url, { headers: { Range: 'bytes=0-6291455' } });
const buf = Buffer.from(await res.arrayBuffer());
const secs = (performance.now() - t1) / 1000;
console.log(JSON.stringify({ envName, resolveMs, ok: res.status === 206 || res.status === 200, status: res.status, bytes: buf.length, seconds: +secs.toFixed(2), MBps: +(buf.length / 1048576 / secs).toFixed(2), hasNParam: /[?&]n=/.test(url), host: new URL(url).hostname.replace(/^[^.]+\./, '*.') }));
