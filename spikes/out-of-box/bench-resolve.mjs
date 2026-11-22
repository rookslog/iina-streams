// Latency: JS resolve (token + usher master + parse) vs Streamlink --json (as media.py runs it), N runs each, interleaved.
// Usage: node bench-resolve.mjs <live|vod> <id-or-channel> [N=8]
import { spawnSync } from 'node:child_process';
import { http } from './iina-http-shim.mjs';
import { accessToken, usherURL, parseMaster } from './twitch-resolve.mjs';
const [, , kind, id, nArg] = process.argv;
const N = +(nArg || 8);
const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';
const page = kind === 'live' ? 'https://www.twitch.tv/' + id : 'https://www.twitch.tv/videos/' + id;
const js = [], sl = [];
for (let i = 0; i < N; i++) {
  let t = performance.now();
  const tok = await accessToken(kind, id, ua);
  const [u, q] = usherURL(kind, id, tok);
  const m = await http.get(u, { params: q, headers: { 'User-Agent': ua, Referer: 'https://player.twitch.tv', Origin: 'https://player.twitch.tv' } });
  parseMaster(m.text);
  js.push(Math.round(performance.now() - t));
  t = performance.now();
  spawnSync('/opt/homebrew/bin/streamlink', ['--no-config', '--no-plugin-cache', '--no-plugin-sideloading', '--http-ignore-env', '--webbrowser', 'false', '--loglevel', 'none', '--http-timeout', '12', '--json', page], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  sl.push(Math.round(performance.now() - t));
}
const med = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log(JSON.stringify({ kind, N, jsMs: js, jsMedian: med(js), jsFirstIsCold: js[0], streamlinkMs: sl, streamlinkMedian: med(sl) }));
