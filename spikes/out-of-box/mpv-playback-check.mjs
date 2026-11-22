// End-to-end check that a URL built by the JS prototype actually plays in mpv (same libmpv family IINA embeds).
// Modes: master  = hand mpv the usher master playlist (mpv chooses a variant)
//        variant = hand mpv the chosen variant's media playlist (what Streamlink --json gives the plugin today)
// Usage: node mpv-playback-check.mjs <live|vod> <id> <master|variant> [seconds=8] [--no-fast-bread]
// mpv logs the URL, so every line containing http or token-like text is dropped; only timings and stream facts are kept.
import { spawn } from 'node:child_process';
import { http } from './iina-http-shim.mjs';
import { accessToken, usherURL, parseMaster } from './twitch-resolve.mjs';
const [, , kind, id, mode, secArg, ...rest] = process.argv;
const seconds = +(secArg || 8);
const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';
const t0 = performance.now();
const tok = await accessToken(kind, id, ua);
const [u, q] = usherURL(kind, id, tok, { lowLatency: !rest.includes('--no-fast-bread') });
const full = new URL(u);
for (const [k, v] of Object.entries(q)) full.searchParams.set(k, String(v));
let target = full.toString();
let resolveMs = null;
if (mode === 'variant') {
  const m = await http.get(u, { params: q, headers: { 'User-Agent': ua, Referer: 'https://player.twitch.tv', Origin: 'https://player.twitch.tv' } });
  target = (parseMaster(m.text).find(x => x.res.endsWith('x720')) || parseMaster(m.text)[0]).uri;
}
resolveMs = Math.round(performance.now() - t0);
const args = ['--no-config', '--vo=null', '--ao=null', '--really-quiet=no', '--msg-level=all=info', `--length=${seconds}`,
  `--user-agent=${ua}`, '--http-header-fields=Referer: https://player.twitch.tv,Origin: https://player.twitch.tv', '--', target];
const t1 = performance.now();
const p = spawn('/opt/homebrew/bin/mpv', args, { stdio: ['ignore', 'pipe', 'pipe'] });
const facts = { firstVideoMs: null, firstAVStatusMs: null, video: null, hlsVariantsSeen: null, errors: [] };
const onData = chunk => {
  for (const line of String(chunk).split(/[\r\n]+/)) {
    if (!line || /https?:|token|sig=|nauth/i.test(line)) continue;
    const now = Math.round(performance.now() - t1);
    if (facts.firstAVStatusMs === null && /^AV: /.test(line)) facts.firstAVStatusMs = now;
    if (facts.firstVideoMs === null && /Video\s+--vid=1|\(\+\) Video/.test(line)) { facts.firstVideoMs = now; facts.video = line.replace(/\s+/g, ' ').slice(0, 120); }
    if (/\[ffmpeg\].*(error|fail)/i.test(line) || /^Error|Failed/i.test(line)) facts.errors.push(line.slice(0, 120));
  }
};
p.stdout.on('data', onData); p.stderr.on('data', onData);
p.on('close', code => {
  console.log(JSON.stringify({ kind, mode, seconds, resolveMs, mpvExit: code, ...facts, errors: facts.errors.slice(0, 3), mpvWallMs: Math.round(performance.now() - t1) }));
});
