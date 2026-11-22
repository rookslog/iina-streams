// Ad exposure sampling for a live channel: N fresh sessions (new token, new usher request), each polling the
// 720p media playlist a few times. Counts stitched-ad DATERANGEs and ad-titled/ad-flagged segments.
// Streamlink skips ad segments only while IT reads segments; this measures what a player handed the URL would see.
// Usage: node ad-watch.mjs <channel> [sessions=6] [polls=3] [pollSeconds=4]
import { http } from './iina-http-shim.mjs';
import { accessToken, usherURL, parseMaster } from './twitch-resolve.mjs';
const [, , channel, sessionsArg, pollsArg, secArg] = process.argv;
const sessions = +(sessionsArg || 6), polls = +(pollsArg || 3), sec = +(secArg || 4);
const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rows = [];
for (let s = 0; s < sessions; s++) {
  const tok = await accessToken('live', channel, ua);
  const [u, q] = usherURL('live', channel, tok);
  const m = await http.get(u, { params: q, headers: { 'User-Agent': ua, Referer: 'https://player.twitch.tv', Origin: 'https://player.twitch.tv' } });
  const v = parseMaster(m.text).find(x => x.res.endsWith('x720')) || parseMaster(m.text)[0];
  const row = { session: s, polls: [] };
  for (let p = 0; p < polls; p++) {
    const mp = await http.get(v.uri, { headers: { 'User-Agent': ua }, measureOnly: true });
    const lines = mp.text.split(/\r?\n/);
    const dr = lines.filter(l => l.startsWith('#EXT-X-DATERANGE'));
    row.polls.push({
      segs: lines.filter(l => l.startsWith('#EXTINF')).length,
      prefetch: lines.filter(l => l.startsWith('#EXT-X-TWITCH-PREFETCH')).length,
      dateRanges: dr.length,
      stitchedAd: dr.filter(l => /stitched-ad/.test(l)).length,
      adTitled: lines.filter(l => l.startsWith('#EXTINF') && /Amazon|stitched/i.test(l)).length,
      discontinuity: lines.filter(l => l.startsWith('#EXT-X-DISCONTINUITY')).length,
      adDateRangeAttrs: [...new Set(dr.filter(l => /stitched-ad/.test(l)).flatMap(l => [...l.matchAll(/(X-TV-TWITCH-AD-[A-Z-]+|CLASS|ID)=/g)].map(x => x[1].replace(/^ID$/, 'ID'))))],
    });
    if (p < polls - 1) await sleep(sec * 1000);
  }
  rows.push(row);
}
console.log(JSON.stringify({ channel, sessions, polls, sec, totalPolls: sessions * polls,
  pollsWithStitchedAd: rows.flatMap(r => r.polls).filter(p => p.stitchedAd > 0).length,
  pollsWithAdTitledSegments: rows.flatMap(r => r.polls).filter(p => p.adTitled > 0).length,
  rows }));
