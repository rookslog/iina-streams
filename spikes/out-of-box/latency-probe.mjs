// Live-edge lag from the media playlist itself: now - (PROGRAM-DATE-TIME + EXTINF) of the newest listed segment, and of
// the segment 3 from the end (where FFmpeg/mpv's HLS demuxer starts a live stream by default). Compares fast_bread on/off.
// Uses the local clock (assumed NTP-synced); good to ~+-1 s. Usage: node latency-probe.mjs <channel> [samples=5]
import { http } from './iina-http-shim.mjs';
import { accessToken, usherURL, parseMaster } from './twitch-resolve.mjs';
const [, , channel, nArg] = process.argv;
const N = +(nArg || 5);
const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';
async function lag(lowLatency) {
  const tok = await accessToken('live', channel, ua);
  const [u, q] = usherURL('live', channel, tok, { lowLatency });
  const m = await http.get(u, { params: q, headers: { 'User-Agent': ua } });
  const v = parseMaster(m.text).find(x => x.res.endsWith('x720')) || parseMaster(m.text)[0];
  const mp = await http.get(v.uri, { headers: { 'User-Agent': ua }, measureOnly: true });
  const now = Date.now();
  const lines = mp.text.split('\n'); const segs = []; let pdt = null;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('#EXT-X-PROGRAM-DATE-TIME:')) pdt = Date.parse(lines[i].slice(25));
    if (lines[i].startsWith('#EXTINF:')) { const d = parseFloat(lines[i].slice(8)); if (pdt !== null) { segs.push({ start: pdt, dur: d }); pdt += d * 1000; } }
  }
  const last = segs[segs.length - 1], third = segs[segs.length - 3];
  const prefetch = lines.filter(l => l.startsWith('#EXT-X-TWITCH-PREFETCH')).length;
  return { prefetch, newestFullSegmentEndLagS: +((now - (last.start + last.dur * 1000)) / 1000).toFixed(1), mpvDefaultStartLagS: +((now - third.start) / 1000).toFixed(1), segDur: last.dur };
}
const rows = { fastBreadOn: [], fastBreadOff: [] };
for (let i = 0; i < N; i++) { rows.fastBreadOn.push(await lag(true)); rows.fastBreadOff.push(await lag(false)); }
console.log(JSON.stringify(rows));
