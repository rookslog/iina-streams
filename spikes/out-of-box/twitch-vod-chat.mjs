// Twitch VOD chat window in plain JS through the iina.http shim: a port of helpers/acquire.py twitch_acquire/twitch_page
// (same persisted query, same offset pagination, same bounds, same normalisation).
// Usage: node twitch-vod-chat.mjs <vodId> <atSeconds> <outFile.jsonl>
// Writes the normalised records to <outFile> (private content is public chat text; nothing secret is involved)
// and prints only counts/timings.
import { writeFileSync } from 'node:fs';
import { http } from './iina-http-shim.mjs';

const CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const QUERY_HASH = 'b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a';
const MAX_SECONDS = 50, MAX_PAGES = 64, MAX_MESSAGES = 15000, LOOKBACK = 8, LOOKAHEAD = 60;

async function page(videoID, offset) {
  const res = await http.post('https://gql.twitch.tv/gql', {
    headers: { 'Client-ID': CLIENT_ID, 'Content-Type': 'application/json', Accept: 'application/json' },
    data: {
      operationName: 'VideoCommentsByOffsetOrCursor',
      variables: { videoID, contentOffsetSeconds: Math.trunc(offset) },
      extensions: { persistedQuery: { version: 1, sha256Hash: QUERY_HASH } },
    },
  });
  const d = res.data;
  if (!d || d.errors) throw Error('gql-error');
  const comments = d.data && d.data.video && d.data.video.comments;
  if (!comments) throw Error('no-replay');
  return { edges: comments.edges, more: comments.pageInfo.hasNextPage };
}

function normalize(edge) {
  const node = edge && edge.node;
  if (!node) return null;
  const when = node.contentOffsetSeconds;
  if (typeof when !== 'number' || !isFinite(when) || when < 0 || when > 2592000) return null;
  const message = node.message;
  if (!message || !Array.isArray(message.fragments)) return null;
  const body = message.fragments.slice(0, 3000).filter(f => f && typeof f.text === 'string').map(f => f.text).join('').slice(0, 16000);
  if (!body.trim()) return null;
  const c = node.commenter;
  const author = c ? (c.displayName || c.login) : null;
  const color = typeof message.userColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(message.userColor) ? message.userColor : '';
  const badges = Array.isArray(message.userBadges) ? message.userBadges.slice(0, 16).filter(b => b && typeof b.id === 'string').map(b => b.id.slice(0, 40)) : [];
  return { id: typeof node.id === 'string' ? node.id.slice(0, 256) : '', time: when, author: typeof author === 'string' ? author.slice(0, 128) : 'Unknown', text: body, color, badges };
}

const [, , vod, atArg, outFile] = process.argv;
const at = Number(atArg);
const t0 = performance.now(), deadline = t0 + MAX_SECONDS * 1000;
let offset = Math.max(0, Math.trunc(at) - LOOKBACK);
const target_end = Math.min(2592000, Math.trunc(at) + LOOKAHEAD);
const rows = [], seen = new Set(), pageMs = [];
let pages = 0, maximum = -1, more = true, bounded = false, bytes = 0;
while (more && maximum < target_end) {
  if (pages >= MAX_PAGES || rows.length >= MAX_MESSAGES) { bounded = true; break; }
  if (performance.now() > deadline) throw Error('timeout');
  pages++;
  const t = performance.now();
  const r = await page(vod, offset);
  pageMs.push(Math.round(performance.now() - t));
  if (!r.edges.length) { if (r.more) throw Error('invalid'); break; }
  more = r.more;
  let pageMax = -1;
  for (const e of r.edges) {
    const w = e.node && e.node.contentOffsetSeconds;
    if (typeof w === 'number' && isFinite(w) && w >= 0 && w <= 2592000) pageMax = Math.max(pageMax, w);
    const row = normalize(e);
    if (!row || (row.id && seen.has(row.id))) continue;
    if (row.id) seen.add(row.id);
    rows.push(row); maximum = Math.max(maximum, row.time);
  }
  if (pageMax < 0) throw Error('invalid');
  offset = Math.max(offset + 1, Math.trunc(pageMax) + 1);
}
const out = '{"version":1,"provider":"twitch","sourceId":"' + vod + '","records":[' + rows.map(r => JSON.stringify(r)).join(',') + ']}';
bytes = Buffer.byteLength(out);
if (outFile) writeFileSync(outFile, out);
console.log(JSON.stringify({ vod, at, ok: true, pages, count: rows.length, bytes, bounded, hasMore: more,
  start: rows.length ? rows[0].time : null, end: maximum, totalMs: Math.round(performance.now() - t0), pageMs }));
