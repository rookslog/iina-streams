// Prototype JS port of the YouTube live-chat-replay half of helpers/replay.py (yt-dlp JSONL -> sorted chunks).
// Only what iina.file offers is assumed: read the whole file as one string (no streaming API, no sqlite).
// Usage: node replay-import.mjs <replay.jsonl> [python-index.json]
import { readFileSync, existsSync } from 'node:fs';
const [, , input, pyIndex] = process.argv;
const t0 = performance.now();
const raw = readFileSync(input, 'utf8');                   // iina.file.read equivalent: one big string
const tRead = performance.now();
const runs = v => {
  if (!v || typeof v !== 'object') return '';
  if (typeof v.simpleText === 'string') return v.simpleText.slice(0, 16000);
  let out = '';
  for (const r of Array.isArray(v.runs) ? v.runs : []) {
    if (!r || typeof r !== 'object') continue;
    let piece = r.text;
    if (typeof piece !== 'string') { const e = r.emoji; if (!e || typeof e !== 'object') continue; piece = (Array.isArray(e.shortcuts) && typeof e.shortcuts[0] === 'string') ? e.shortcuts[0] : (e.emojiId || '[emote]'); }
    out += piece; if (out.length >= 16000) break;
  }
  return out.slice(0, 16000);
};
const rows = new Map(); const dels = []; let events = 0, unsupported = 0, lines = 0;
for (const line of raw.split('\n')) {
  if (!line.trim()) continue;
  lines++;
  const root = JSON.parse(line);
  const a = root.replayChatItemAction; if (!a) continue;
  const t = Number(a.videoOffsetTimeMsec) / 1000; if (!isFinite(t) || t < 0) continue;
  for (const act of Array.isArray(a.actions) ? a.actions : []) {
    events++;
    const del = act.markChatItemAsDeletedAction || act.removeChatItemAction, adel = act.markChatItemsByAuthorAsDeletedAction;
    if (del || adel) { dels.push({ scope: del ? 'id' : 'author', target: del ? del.targetItemId : adel.externalChannelId, t }); continue; }
    const item = act.addChatItemAction && act.addChatItemAction.item;
    const rend = item && ['liveChatTextMessageRenderer', 'liveChatPaidMessageRenderer', 'liveChatMembershipItemRenderer', 'liveChatPaidStickerRenderer'].map(k => item[k]).find(x => x && typeof x === 'object');
    if (!rend) { unsupported++; continue; }
    const body = runs(rend.message) || runs(rend.headerSubtext); if (!body.trim()) continue;
    const id = rend.id || 'import-' + events; if (rows.has(id)) continue;
    rows.set(id, { id, time: t, author: runs(rend.authorName) || 'Unknown', text: body, authorKey: rend.authorExternalChannelId || '', kind: 'message' });
  }
}
const all = [...rows.values()].sort((x, y) => x.time - y.time);
for (const d of dels) for (const r of all) if ((d.scope === 'id' ? r.id : r.authorKey) === d.target && d.t >= r.time) r.deletedAt = Math.min(r.deletedAt ?? Infinity, d.t);
const chunks = []; for (let i = 0; i < all.length; i += 1000) chunks.push(JSON.stringify(all.slice(i, i + 1000)));
const out = { inputBytes: raw.length, lines, events, messages: all.length, deletions: dels.length, unsupported, chunks: chunks.length, readMs: Math.round(tRead - t0), totalMs: Math.round(performance.now() - t0), nodeHeapUsedMB: +(process.memoryUsage().heapUsed / 1048576).toFixed(1), nodeRssMB: +(process.memoryUsage().rss / 1048576).toFixed(1) };
if (pyIndex && existsSync(pyIndex)) { const j = JSON.parse(readFileSync(pyIndex, 'utf8')); out.pythonCount = j.count; out.pythonChunks = j.chunks.length; }
console.log(JSON.stringify(out));
