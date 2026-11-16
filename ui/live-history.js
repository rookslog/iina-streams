/* Pure bounded history for StreamsLive batches. DOM rendering remains text-only. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StreamsLiveHistory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MAX_HISTORY = 150;
  const clip = (value, length) => typeof value === 'string' ? value.slice(0, length) : '';
  const room = value => clip(value, 26).replace(/^#/, '').toLowerCase();
  const login = value => clip(value, 25).toLowerCase();
  function record(value, kind) {
    const timestamp = Number(value.timestampMs);
    return {
      type: kind, kind, id: clip(value.id, 128), channel: room(value.channel),
      author: clip(value.author, 80), login: login(value.login), userId: clip(value.userId, 128),
      text: clip(value.text, 2000), color: /^#[0-9a-f]{6}$/i.test(value.color || '') ? value.color : '',
      timestampMs: Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0,
      badges: clip(value.badges, 1024), emotes: clip(value.emotes, 2048), action: value.action === true
    };
  }
  function reduce(history, events, limit) {
    const requested = limit === undefined ? MAX_HISTORY : Number(limit);
    const maximum = Number.isFinite(requested) ? Math.max(0, Math.min(MAX_HISTORY, Math.floor(requested))) : MAX_HISTORY;
    if (maximum === 0) return [];
    let result = (Array.isArray(history) ? history.slice(-maximum) : [])
      .filter(value => value && typeof value === 'object')
      .map(value => record(value, value.kind === 'notice' || value.type === 'notice' ? 'notice' : 'message'));
    for (const event of Array.isArray(events) ? events : []) {
      if (!event || typeof event !== 'object') continue;
      const channel = room(event.channel);
      if (event.type === 'message' || event.type === 'notice') {
        const item = record(event, event.type);
        if (item.kind === 'message' && item.id && result.some(old =>
          old.kind === 'message' && old.channel === channel && old.id === item.id)) continue;
        result.push(item);
        if (result.length > maximum) result.shift();
      } else if (channel && event.type === 'clear-all') {
        result = result.filter(old => old.channel !== channel);
      } else if (channel && event.type === 'clear-message') {
        const id = clip(event.id, 128);
        if (id) result = result.filter(old => old.kind !== 'message' || old.channel !== channel || old.id !== id);
      } else if (channel && event.type === 'clear-user') {
        const userId = clip(event.userId, 128), target = login(event.login);
        if (userId || target) result = result.filter(old => old.kind !== 'message' || old.channel !== channel ||
          !(userId && old.userId === userId || target && old.login === target));
      }
    }
    return result;
  }
  return Object.freeze({reduce});
});
