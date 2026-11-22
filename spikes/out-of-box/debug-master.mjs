// Prints the redacted directive skeleton of a Twitch master playlist (no URLs, no tokens).
import { accessToken, usherURL } from './twitch-resolve.mjs';
import { http } from './iina-http-shim.mjs';
const [, , kind, id] = process.argv;
const ua = 'Mozilla/5.0';
const tok = await accessToken(kind, id, ua);
const [u, q] = usherURL(kind, id, tok);
const m = await http.get(u, { params: q, headers: { 'User-Agent': ua } });
for (const l of m.text.split('\n').filter(l => /^#EXT-X-(MEDIA|STREAM-INF)/.test(l)).slice(0, 4)) {
  console.log(l.startsWith('http') ? '<url>' : l.replace(/(sig|token|nauth|nauthsig)=[^&,"]*/g, '$1=<r>').slice(0, 220));
}
