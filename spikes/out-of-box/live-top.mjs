// Lists currently-live channels (login, viewers) via public GQL, plus the CLASS/ID prefixes of DATERANGE tags
// in each channel's 720p media playlist (to see what the daterange tags are, ad or not). No tokens/URLs printed.
// Usage: node live-top.mjs [count=8]
import { http } from './iina-http-shim.mjs';
import { accessToken, usherURL, parseMaster } from './twitch-resolve.mjs';
const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';
const n = +(process.argv[2] || 8);
const r = await http.post('https://gql.twitch.tv/gql', {
  headers: { 'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'application/json' },
  data: { query: `query{streams(first:${n}){edges{node{broadcaster{login} viewersCount}}}}` },
});
for (const e of r.data.data.streams.edges) {
  const login = e.node.broadcaster.login;
  try {
    const tok = await accessToken('live', login, ua);
    const [u, q] = usherURL('live', login, tok);
    const m = await http.get(u, { params: q, headers: { 'User-Agent': ua } });
    const v = parseMaster(m.text).find(x => x.res.endsWith('x720')) || parseMaster(m.text)[0];
    const mp = await http.get(v.uri, { headers: { 'User-Agent': ua }, measureOnly: true });
    const dr = mp.text.split('\n').filter(l => l.startsWith('#EXT-X-DATERANGE'));
    const cls = [...new Set(dr.map(l => (/CLASS="([^"]*)"/.exec(l) || [])[1] + '/' + ((/ID="([^"]*)"/.exec(l) || [])[1] || '').replace(/[0-9]+/g, 'N')))];
    console.log(login, e.node.viewersCount, 'dateRanges=' + dr.length, 'stitchedAd=' + dr.filter(l => /stitched-ad/.test(l)).length, JSON.stringify(cls));
  } catch (err) { console.log(login, 'err', err.statusCode); }
}
