/* Provider-neutral chat content. The UI consumes segments ({type:'text'|'emote'}); provider
 * specifics (Twitch IRC tag formats, CDN URLs) live only in the `twitch` adapter below.
 * Pure and DOM-free except renderSegments, which never uses innerHTML.
 * Issue #34 (first half). Not yet wired into sidebar.js / overlay.js.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StreamsChatContent = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const EMOTE_CDN = 'https://static-cdn.jtvnw.net/emoticons/v2/';
  const EMOTE_ID = /^[A-Za-z0-9_]{1,64}$/;
  const SAFE_URL = /^https:\/\/static-cdn\.jtvnw\.net\/emoticons\/v2\/[A-Za-z0-9_]+\/default\/dark\/[123]\.0$/;
  const MAX_EMOTES = 500;

  function emoteUrl(id, scale) { return EMOTE_CDN + id + '/default/dark/' + (scale === 2 || scale === 3 ? scale : 1) + '.0'; }

  /* Parse the IRC `emotes` tag ("25:0-4,6-10/1902:12-16") into [{id,start,end}] in
   * code-point units, or null if any part is malformed. '' / undefined -> []. */
  function parseEmoteTag(tag) {
    if (tag === undefined || tag === null || tag === '') return [];
    if (typeof tag !== 'string') return null;
    const out = [];
    for (const group of tag.split('/')) {
      const colon = group.indexOf(':');
      if (colon < 1) return null;
      const id = group.slice(0, colon);
      if (!EMOTE_ID.test(id)) return null;
      for (const range of group.slice(colon + 1).split(',')) {
        const m = /^(\d{1,7})-(\d{1,7})$/.exec(range);
        if (!m) return null;
        out.push({id, start: Number(m[1]), end: Number(m[2])});
        if (out.length > MAX_EMOTES) return null;
      }
    }
    return out;
  }

  function plain(text) { return text ? [{type: 'text', text}] : []; }

  /* text + emotes tag -> segments. Positions count Unicode code points (not UTF-16 units).
   * Any malformed, overlapping, reversed or out-of-range position yields the whole text as
   * one text segment. Never throws. */
  function twitchSegments(text, emotesTag) {
    try {
      text = typeof text === 'string' ? text : '';
      const ranges = parseEmoteTag(emotesTag);
      if (!ranges || !ranges.length || !text) return plain(text);
      const cps = Array.from(text);
      ranges.sort((a, b) => a.start - b.start);
      let prevEnd = -1;
      for (const r of ranges) {
        if (r.end < r.start || r.end >= cps.length || r.start <= prevEnd) return plain(text);
        prevEnd = r.end;
      }
      const out = []; let cursor = 0;
      for (const r of ranges) {
        if (r.start > cursor) out.push({type: 'text', text: cps.slice(cursor, r.start).join('')});
        out.push({type: 'emote', name: cps.slice(r.start, r.end + 1).join(''), url: emoteUrl(r.id, 1), url2x: emoteUrl(r.id, 2), provider: 'twitch'});
        cursor = r.end + 1;
      }
      if (cursor < cps.length) out.push({type: 'text', text: cps.slice(cursor).join('')});
      return out;
    } catch (_) { return plain(typeof text === 'string' ? text : ''); }
  }

  /* IRC `badges` tag ("moderator/1,subscriber/12") -> [{set,version}]; bad entries skipped.
   * Image lookup (Twitch badge API) is out of scope here. */
  function twitchBadges(tag) {
    if (typeof tag !== 'string' || !tag) return [];
    const out = [];
    for (const part of tag.split(',')) {
      const slash = part.indexOf('/');
      if (slash < 1) continue;
      const set = part.slice(0, slash), version = part.slice(slash + 1);
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(set) || !/^[A-Za-z0-9_.-]{1,64}$/.test(version)) continue;
      out.push({set, version});
      if (out.length >= 32) break;
    }
    return out;
  }

  /* Segments -> array of DOM nodes. Text goes in as text nodes, never innerHTML. Emote <img>
   * has alt/title = name and fixed width/height; a failed image is replaced by its name as
   * text. Only the Twitch emote CDN URL shape is ever assigned to src. */
  function renderSegments(segments, opts) {
    const o = opts || {}, doc = o.document || (typeof document !== 'undefined' ? document : null);
    const size = Number.isFinite(o.size) && o.size > 0 ? Math.round(o.size) : 24;
    const nodes = [];
    if (!doc || !Array.isArray(segments)) return nodes;
    for (const seg of segments) {
      if (!seg) continue;
      if (seg.type === 'emote' && typeof seg.name === 'string' && typeof seg.url === 'string' && SAFE_URL.test(seg.url)) {
        const img = doc.createElement('img');
        img.className = 'emote';
        img.alt = seg.name; img.title = seg.name;
        img.width = size; img.height = size;
        img.loading = 'lazy'; img.decoding = 'async';
        if (typeof seg.url2x === 'string' && SAFE_URL.test(seg.url2x)) img.srcset = seg.url2x + ' 2x';
        img.src = seg.url;
        if (typeof img.addEventListener === 'function') img.addEventListener('error', () => {
          const span = doc.createElement('span'); span.textContent = seg.name;
          if (img.parentNode && typeof img.replaceWith === 'function') img.replaceWith(span);
        }, {once: true});
        nodes.push(img);
      } else if (typeof seg.text === 'string' || typeof seg.name === 'string') {
        nodes.push(doc.createTextNode(typeof seg.text === 'string' ? seg.text : seg.name));
      }
    }
    return nodes;
  }

  return {twitch: {segments: twitchSegments, badges: twitchBadges, parseEmoteTag, emoteUrl}, renderSegments};
});
