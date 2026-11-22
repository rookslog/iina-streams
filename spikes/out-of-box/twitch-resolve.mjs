// Twitch live/VOD playback resolution using only the iina.http shim.
// Usage: node twitch-resolve.mjs live <channel> | vod <id> [--ua browser|cfnetwork] [--no-fast-bread] [--summary]
// Prints ONLY redacted shapes/timings. Never prints token, signature, or URLs.
import { http, stats } from './iina-http-shim.mjs';

const CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'; // public web client id, same one Streamlink uses
const HASH = 'ed230aa1e33e07eebb8928504583da78a5173989fadfb1ac94be06a04f3cdbe9'; // PlaybackAccessToken persisted query, copied from Streamlink 8.6.3
const UAS = {
  browser: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  cfnetwork: 'IINA/1.5.1 CFNetwork/3860.100.1 Darwin/25.1.0', // approximates URLSession's default User-Agent
};

export async function accessToken(kind, id, ua) {
  const isLive = kind === 'live';
  const res = await http.post('https://gql.twitch.tv/gql', {
    headers: { 'Client-ID': CLIENT_ID, 'Content-Type': 'application/json', 'User-Agent': ua },
    data: {
      operationName: 'PlaybackAccessToken',
      extensions: { persistedQuery: { version: 1, sha256Hash: HASH } },
      variables: { isLive, login: isLive ? id : '', isVod: !isLive, vodID: isLive ? '' : id, playerType: 'embed', platform: 'site' },
    },
  });
  const t = res.data && res.data.data && (res.data.data.streamPlaybackAccessToken || res.data.data.videoPlaybackAccessToken);
  if (!t) return null;
  return { value: t.value, signature: t.signature };
}

export function usherURL(kind, id, tok, { lowLatency = true } = {}) {
  const common = { platform: 'web', p: Math.floor(Math.random() * 999999), allow_source: 'true', allow_audio_only: 'true',
    playlist_include_framerate: 'true', multigroup_video: 'true', supported_codecs: 'h264' };
  if (kind === 'live') {
    const q = { ...common, sig: tok.signature, token: tok.value };
    if (lowLatency) q.fast_bread = 'true';
    return ['https://usher.ttvnw.net/api/v2/channel/hls/' + id.toLowerCase() + '.m3u8', q];
  }
  return ['https://usher.ttvnw.net/vod/v2/' + id + '.m3u8', { ...common, nauthsig: tok.signature, nauth: tok.value }];
}

function attrs(s) {
  const o = {};
  for (const m of s.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g)) o[m[1]] = m[2].replace(/^"|"$/g, '');
  return o;
}

export function parseMaster(text) {
  const lines = text.split(/\r?\n/), out = [];
  const media = new Map();
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('#EXT-X-MEDIA:')) {
      const a = attrs(l.slice(13));
      media.set(a['GROUP-ID'], a);
    } else if (l.startsWith('#EXT-X-STREAM-INF:')) {
      const a = attrs(l.slice(18));
      const m = media.get(a.VIDEO) || {};
      // multigroup_video=true yields no EXT-X-MEDIA; the quality name is STABLE-VARIANT-ID.
      out.push({ name: a['STABLE-VARIANT-ID'] || m.NAME || a['IVS-NAME'] || '', source: a['IVS-VARIANT-SOURCE'] || '', group: a.VIDEO, res: a.RESOLUTION || '', fps: a['FRAME-RATE'] || '', codecs: a.CODECS || '', bw: Number(a.BANDWIDTH) || 0, uri: lines[i + 1] });
    }
  }
  return out;
}

export function mediaShape(text) {
  const lines = text.split(/\r?\n/);
  return {
    segments: lines.filter(l => l.startsWith('#EXTINF')).length,
    prefetch: lines.filter(l => l.startsWith('#EXT-X-TWITCH-PREFETCH')).length,
    stitchedAdDateRanges: lines.filter(l => l.startsWith('#EXT-X-DATERANGE') && /stitched-ad/.test(l)).length,
    adTitledSegments: lines.filter(l => l.startsWith('#EXTINF') && /Amazon/i.test(l)).length,
    discontinuities: lines.filter(l => l.startsWith('#EXT-X-DISCONTINUITY')).length,
    endlist: lines.some(l => l.startsWith('#EXT-X-ENDLIST')),
    twitchLiveSequence: lines.some(l => l.startsWith('#EXT-X-TWITCH-LIVE-SEQUENCE')),
    twitchInfo: lines.some(l => l.startsWith('#EXT-X-TWITCH-INFO')),
    version: (lines.find(l => l.startsWith('#EXT-X-VERSION')) || '').split(':')[1] || '',
    targetDuration: (lines.find(l => l.startsWith('#EXT-X-TARGETDURATION')) || '').split(':')[1] || '',
  };
}

async function main() {
  const [, , kind, id, ...rest] = process.argv;
  const opt = n => (rest.includes(n) ? rest[rest.indexOf(n) + 1] : undefined);
  const uaName = opt('--ua') || 'browser';
  const ua = UAS[uaName] || UAS.browser;
  const lowLatency = !rest.includes('--no-fast-bread');
  const T = {};
  const t0 = performance.now();
  let tok;
  try { tok = await accessToken(kind, id, ua); } catch (e) { console.log(JSON.stringify({ kind, ok: false, stage: 'token', status: e.statusCode, T })); return; }
  T.accessTokenMs = Math.round(performance.now() - t0);
  if (!tok) { console.log(JSON.stringify({ kind, ok: false, stage: 'token-null', T })); return; }
  let tokenShape;
  let tokenFlags = null;
  try {
    const p = JSON.parse(tok.value);
    tokenShape = Object.keys(p).sort();
    // Ad-relevant, non-identifying fields only (never user_ip, device_id, user_id, or the token value itself).
    tokenFlags = Object.fromEntries(['adblock', 'hide_ads', 'server_ads', 'show_ads', 'turbo', 'subscriber', 'geoblock_reason', 'player_type', 'platform'].filter(k => k in p).map(k => [k, p[k]]));
  } catch (_) { tokenShape = 'unparsed'; }
  const t1 = performance.now();
  const [u, q] = usherURL(kind, id, tok, { lowLatency });
  let master;
  try { master = await http.get(u, { params: q, headers: { 'User-Agent': ua, Referer: 'https://player.twitch.tv', Origin: 'https://player.twitch.tv' } }); }
  catch (e) { console.log(JSON.stringify({ kind, ok: false, stage: 'usher', status: e.statusCode, T })); return; }
  T.usherMs = Math.round(performance.now() - t1);
  const variants = parseMaster(master.text);
  const pick = variants.find(v => v.res.endsWith('x720')) || variants[0];
  const t2 = performance.now();
  let shape = null;
  if (pick) {
    // The plugin itself never needs this fetch (mpv fetches the media playlist); it is here only to measure ads/low-latency tags.
    const mp = await http.get(pick.uri, { headers: { 'User-Agent': ua }, measureOnly: true });
    T.mediaPlaylistMs = Math.round(performance.now() - t2);
    shape = mediaShape(mp.text);
  }
  T.totalMs = Math.round(performance.now() - t0);
  console.log(JSON.stringify({
    kind, ok: true, ua: uaName, tokenFlags, fastBread: lowLatency, tokenShape, variantCount: variants.length,
    variants: variants.map(v => ({ name: v.name, source: v.source, res: v.res, fps: v.fps, codec: v.codecs.split(',')[0], bwKbps: Math.round(v.bw / 1000) })),
    masterBytes: master.text.length, picked: pick && pick.name, media: shape, T,
    mediaHostBlockedByAllowedDomains: [...stats.wouldBeBlocked], requests: stats.requests, hosts: [...stats.hosts].map(h => h.replace(/^[^.]+\./, '*.')),
  }));
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.log('ERR', e && e.statusCode, e && e.reason); process.exit(1); });
