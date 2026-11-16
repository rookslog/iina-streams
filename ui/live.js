/* Read-only Twitch IRC transport. Construction is inert; start requires an explicit,
 * validated chat:read credential. No OAuth, persistent storage, logging or chat-send API.
 * Protocol reference: https://dev.twitch.tv/docs/chat/irc/ (checked 2026-11-08).
 */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StreamsLive = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const ENDPOINT = 'wss://irc-ws.chat.twitch.tv:443';
  const MAX_PENDING = 150, BATCH_MS = 200, MAX_RETRIES = 8;
  const MAX_FRAME = 65536, MAX_LINE = 16384, MAX_SEEN = 600;
  const LOGIN = /^[a-z0-9_]{1,25}$/;
  const OWN = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const clip = (text, limit) => typeof text === 'string' ? text.slice(0, limit) : '';
  const name = text => clip(text, 64).replace(/[\x00-\x1f\x7f]/g, '');
  const room = text => typeof text === 'string' ? text.replace(/^#/, '').toLowerCase() : '';

  function unescapeTag(value) {
    return value.replace(/\\(.)/g, function (_, c) {
      return ({s: ' ', ':': ';', r: '\r', n: '\n', '\\': '\\'})[c] || c;
    });
  }

  function parse(line) {
    const tags = Object.create(null), params = [];
    let rest = line, prefix = '';
    if (rest[0] === '@') {
      const end = rest.indexOf(' ');
      if (end < 0) return null;
      for (const tag of rest.slice(1, end).split(';').slice(0, 128)) {
        const eq = tag.indexOf('=');
        const key = eq < 0 ? tag : tag.slice(0, eq);
        if (key) tags[key] = unescapeTag(eq < 0 ? '' : tag.slice(eq + 1, eq + 4097));
      }
      rest = rest.slice(end + 1).replace(/^ +/, '');
    }
    if (rest[0] === ':') {
      const end = rest.indexOf(' ');
      if (end < 0) return null;
      prefix = rest.slice(1, end); rest = rest.slice(end + 1).replace(/^ +/, '');
    }
    const end = rest.indexOf(' ');
    const command = (end < 0 ? rest : rest.slice(0, end)).toUpperCase();
    rest = end < 0 ? '' : rest.slice(end + 1);
    while (rest && params.length < 15) {
      rest = rest.replace(/^ +/, '');
      if (!rest) break;
      if (rest[0] === ':') { params.push(rest.slice(1)); break; }
      const space = rest.indexOf(' ');
      params.push(space < 0 ? rest : rest.slice(0, space));
      rest = space < 0 ? '' : rest.slice(space + 1);
    }
    return command ? {tags, prefix, command, params} : null;
  }

  function create(options) {
    const deps = options || {};
    const Socket = deps.WebSocket || root.WebSocket;
    const setTimer = deps.setTimeout || root.setTimeout.bind(root);
    const cancelTimer = deps.clearTimeout || root.clearTimeout.bind(root);
    const now = deps.now || Date.now, random = deps.random || Math.random;
    const onBatch = typeof deps.onBatch === 'function' ? deps.onBatch : function () {};
    const onStatus = typeof deps.onStatus === 'function' ? deps.onStatus : function () {};
    const timers = Object.create(null), seen = new Set(), seenOrder = [];
    let phase = 'off', channel = '', username = '', credential = null;
    let active = false, destroyed = false, generation = 0, attempts = 0;
    let reason = '', retryInMs = 0, socket = null, joined = false;
    let buffer = '', queue = [], lastReceived = 0, lastFlushAt = -Infinity;

    function snapshot() { return {phase, channel, attempts, reason, retryInMs, queued: queue.length}; }
    function emit() { try { onStatus(snapshot()); } catch (_) { /* Host callback must not break cleanup. */ } }
    function clear(key) {
      if (!OWN(timers, key)) return;
      const id = timers[key]; delete timers[key]; cancelTimer(id);
    }
    function schedule(key, fn, delay) {
      clear(key);
      const capturedGeneration = generation;
      const id = setTimer(function () {
        if (timers[key] !== id) return;
        delete timers[key];
        if (active && !destroyed && generation === capturedGeneration) fn();
      }, delay);
      timers[key] = id;
    }
    function detach() {
      const old = socket; socket = null; buffer = ''; joined = false;
      if (!old) return;
      old.onopen = old.onmessage = old.onclose = old.onerror = null;
      try { if (old.readyState !== 3) old.close(1000, 'Client stopped'); } catch (_) {}
    }
    function reset() {
      active = false; generation++;
      for (const key of Object.keys(timers)) clear(key);
      detach(); queue = []; seen.clear(); seenOrder.length = 0;
      credential = null; username = ''; retryInMs = 0;
    }
    function terminal(why) {
      reset(); phase = 'error'; reason = why; emit();
    }
    function remember(id) {
      if (!id || seen.has(id)) return;
      seen.add(id); seenOrder.push(id);
      if (seenOrder.length > MAX_SEEN) seen.delete(seenOrder.shift());
    }
    function requestBatch() {
      if (!active || !queue.length || OWN(timers, 'batch')) return;
      schedule('batch', function () {
        const events = queue; queue = []; lastFlushAt = now();
        try { onBatch(events); } catch (_) { /* No untrusted callback text is logged. */ }
        if (active && queue.length) requestBatch();
      }, Math.max(BATCH_MS, BATCH_MS - (now() - lastFlushAt)));
    }
    function enqueue(event) {
      if (!active) return;
      if (event.type === 'message') {
        if (event.id && seen.has(event.id)) return;
        remember(event.id);
      } else if (event.type === 'clear-all') {
        queue = [];
      } else if (event.type === 'clear-message') {
        remember(event.id);
        queue = queue.filter(e => e.type !== 'message' || e.id !== event.id);
      } else if (event.type === 'clear-user') {
        queue = queue.filter(e => e.type !== 'message' ||
          !(event.userId && e.userId === event.userId || event.login && e.login === event.login));
      }
      if (queue.length >= MAX_PENDING) {
        const disposable = queue.findIndex(e => e.type === 'message' || e.type === 'notice');
        if (disposable >= 0) queue.splice(disposable, 1);
        else queue = [{type: 'clear-all', channel}];
      }
      queue.push(event); requestBatch();
    }
    function reconnect(why) {
      if (!active || destroyed) return;
      clear('handshake'); clear('watchdog'); clear('retry'); detach();
      if (attempts >= MAX_RETRIES) { terminal('retry-exhausted'); return; }
      attempts++;
      const sample = Number(random());
      const jitter = Number.isFinite(sample) ? 0.8 + Math.max(0, Math.min(1, sample)) * 0.4 : 1;
      retryInMs = Math.max(1000, Math.min(30000, Math.round(1000 * Math.pow(2, attempts - 1) * jitter)));
      phase = 'reconnecting'; reason = why;
      const current = generation; emit();
      if (active && generation === current) schedule('retry', connect, retryInMs);
    }
    function write(command, argument) {
      // This whitelist applies even if a future caller accidentally adds a new command.
      if (!active || !socket || socket.readyState !== 1 || !/^(CAP|PASS|NICK|JOIN|PONG)$/.test(command) || /[\r\n]/.test(argument)) return false;
      try { socket.send(command + ' ' + argument + '\r\n'); return true; }
      catch (_) { reconnect('transport-error'); return false; }
    }
    function watchdog() {
      schedule('watchdog', function () {
        if (now() - lastReceived >= 300000) reconnect('idle-timeout');
        else watchdog();
      }, 60000);
    }
    function connected() {
      if (!active || !joined || phase === 'connected') return;
      clear('handshake'); phase = 'connected'; reason = ''; retryInMs = 0;
      const current = generation; emit();
      if (active && current === generation) watchdog();
    }
    function handleLine(line) {
      const data = parse(line);
      if (!data) return;
      const {tags, prefix, command, params} = data;
      if (command === 'PING') {
        const payload = params[0] || 'tmi.twitch.tv';
        if (payload.length <= 256 && !/[\r\n]/.test(payload)) write('PONG', ':' + payload);
        return;
      }
      if (command === 'RECONNECT') { reconnect('server-reconnect'); return; }
      if (command === 'CAP' && params.includes('NAK')) { terminal('capability-rejected'); return; }
      if (command === 'NOTICE') {
        const text = (params[1] || '').toLowerCase(), id = tags['msg-id'] || '';
        if (text.includes('login authentication failed') || text.includes('improperly formatted auth') ||
            id === 'login_authentication_failed' || id === 'improperly_formatted_auth') {
          terminal('authentication-failed'); return;
        }
      }
      if (command === '001' && params[0] && params[0].toLowerCase() === username && !joined) {
        joined = true; phase = 'joining'; reason = '';
        const current = generation; emit();
        if (active && generation === current) write('JOIN', '#' + channel);
        return;
      }
      const login = prefix.split(/[!@]/, 1)[0].toLowerCase();
      if (command === '366' && room(params[1]) === channel) { connected(); return; }
      if (room(params[0]) !== channel || !joined) return;
      if (command === 'ROOMSTATE' || command === 'JOIN' && login === username) { connected(); return; }
      if (command === 'CLEARMSG') {
        const id = clip(tags['target-msg-id'], 128);
        enqueue(id ? {type: 'clear-message', channel, id} : {type: 'clear-all', channel}); return;
      }
      if (command === 'CLEARCHAT') {
        const userId = clip(tags['target-user-id'], 128), target = room(params[1]);
        enqueue(userId || target ? {type: 'clear-user', channel, userId, login: LOGIN.test(target) ? target : ''} :
          {type: 'clear-all', channel}); return;
      }
      if (command === 'NOTICE') {
        enqueue({type: 'notice', channel, id: clip(tags['msg-id'], 128), text: clip(params[1], 2000)}); return;
      }
      if (command !== 'PRIVMSG' || !LOGIN.test(login)) return;
      let text = clip(params[1], 4000), action = false;
      if (text.startsWith('\x01ACTION ') && text.endsWith('\x01')) { text = text.slice(8, -1); action = true; }
      const stamp = Number(tags['tmi-sent-ts']);
      enqueue({
        type: 'message', id: clip(tags.id, 128), channel,
        author: name(tags['display-name']) || login, login, userId: clip(tags['user-id'], 128),
        text, color: /^#[0-9a-f]{6}$/i.test(tags.color || '') ? tags.color : '',
        timestampMs: Number.isFinite(stamp) && stamp > 0 && stamp <= 8640000000000000 ? stamp : now(),
        badges: clip(tags.badges, 1024), emotes: clip(tags.emotes, 2048), action
      });
    }
    function connect() {
      if (!active || destroyed) return;
      phase = 'connecting'; reason = ''; retryInMs = 0;
      const capturedGeneration = generation; emit();
      if (!active || capturedGeneration !== generation) return;
      let ws;
      try { ws = new Socket(ENDPOINT); } catch (_) { reconnect('transport-error'); return; }
      socket = ws; buffer = ''; joined = false; lastReceived = now();
      const current = () => active && !destroyed && generation === capturedGeneration && socket === ws;
      ws.onopen = function () {
        if (!current()) return;
        phase = 'authenticating'; emit();
        if (!current()) return;
        if (!write('CAP', 'REQ :twitch.tv/tags twitch.tv/commands')) return;
        if (!write('PASS', 'oauth:' + credential)) return;
        write('NICK', username);
      };
      ws.onmessage = function (event) {
        if (!current()) return;
        if (typeof event.data !== 'string' || event.data.length > MAX_FRAME) { terminal('protocol-limit'); return; }
        lastReceived = now(); buffer += event.data;
        let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end).replace(/\r$/, ''); buffer = buffer.slice(end + 1);
          if (line.length > MAX_LINE) { terminal('protocol-limit'); return; }
          if (line) handleLine(line);
          if (!current()) return;
        }
        if (buffer.length > MAX_LINE) terminal('protocol-limit');
      };
      ws.onclose = function () { if (current()) reconnect('connection-closed'); };
      ws.onerror = function () { if (current()) reconnect('transport-error'); };
      schedule('handshake', function () { if (current()) reconnect('handshake-timeout'); }, 15000);
    }
    function start(config) {
      if (destroyed) return false;
      reset(); attempts = 0; channel = ''; reason = ''; lastFlushAt = -Infinity;
      const value = config || {};
      const newChannel = room(value.channel), newUsername = typeof (value.username || value.login) === 'string' ? (value.username || value.login).toLowerCase() : '';
      const newCredential = typeof value.token === 'string' ? value.token.replace(/^oauth:/, '') : '';
      if (!LOGIN.test(newChannel) || !LOGIN.test(newUsername) || !/^[A-Za-z0-9._~-]{1,2048}$/.test(newCredential)) {
        phase = 'error'; reason = 'invalid-configuration'; emit(); return false;
      }
      if (typeof Socket !== 'function') { phase = 'error'; reason = 'transport-unavailable'; emit(); return false; }
      channel = newChannel; username = newUsername; credential = newCredential; active = true;
      connect(); return active;
    }
    function stop() {
      if (destroyed) return;
      reset(); channel = ''; attempts = 0; phase = 'off'; reason = ''; emit();
    }
    function destroy() {
      if (destroyed) return;
      reset(); destroyed = true; channel = ''; attempts = 0; phase = 'destroyed'; reason = ''; emit();
    }
    return Object.freeze({start, stop, destroy,
      getState: () => Object.assign(snapshot(), {active, timers: Object.keys(timers).length})});
  }
  return Object.freeze({create});
});
