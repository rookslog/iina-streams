'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const StreamsLive = require('../ui/live.js');

function harness(overrides = {}) {
  let clock = 1700000000000, nextId = 0;
  const tasks = new Map(), sockets = [], batches = [], states = [];
  class Socket {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; this.closes = []; sockets.push(this); }
    send(text) { if (this.readyState !== 1) throw new Error('not open'); this.sent.push(text); }
    close(code, reason) { this.closes.push({code, reason}); this.readyState = 3; if (this.onclose) this.onclose({code}); }
    open() { this.readyState = 1; if (this.onopen) this.onopen({}); }
    receive(data) { if (this.onmessage) this.onmessage({data}); }
    drop() { this.readyState = 3; if (this.onclose) this.onclose({code: 1006, reason: 'untrusted secret'}); }
  }
  const deps = {
    WebSocket: Socket,
    setTimeout(fn, ms) { const id = ++nextId; tasks.set(id, {fn, at: clock + ms}); return id; },
    clearTimeout(id) { tasks.delete(id); },
    now: () => clock,
    random: () => 0.5,
    onBatch(events) { batches.push({at: clock, events}); },
    onStatus(state) { states.push(state); },
    ...overrides
  };
  const client = StreamsLive.create(deps);
  function advance(ms) {
    const target = clock + ms; let steps = 0;
    while (true) {
      let item = null;
      for (const [id, task] of tasks) if (task.at <= target && (!item || task.at < item.task.at || task.at === item.task.at && id < item.id)) item = {id, task};
      if (!item) break;
      assert.ok(++steps < 10000, 'timer loop is bounded');
      tasks.delete(item.id); clock = item.task.at; item.task.fn();
    }
    clock = target;
  }
  function start() { assert.equal(client.start({channel: '#Example', login: 'reader', token: 'private-access-token'}), true); return sockets.at(-1); }
  function ready() {
    const socket = start(); socket.open();
    socket.receive(':tmi.twitch.tv 001 reader :Welcome\r\n');
    socket.receive('@room-id=42 :tmi.twitch.tv ROOMSTATE #example\r\n');
    assert.equal(client.getState().phase, 'connected');
    return socket;
  }
  return {client, sockets, batches, states, tasks, advance, start, ready, now: () => clock};
}
const msg = (id, text = 'hello', tags = '', channel = 'example', login = 'alice') =>
  `@id=${id};display-name=Alice;user-id=7;${tags} :${login}!${login}@${login}.tmi.twitch.tv PRIVMSG #${channel} :${text}\r\n`;
const allEvents = r => r.batches.flatMap(b => b.events);

test('construction is inert and Off has no timers or socket', () => {
  const r = harness();
  assert.equal(r.sockets.length, 0); assert.equal(r.tasks.size, 0);
  assert.equal(r.client.getState().phase, 'off');
  r.client.stop(); assert.equal(r.tasks.size, 0);
  assert.equal(r.client.getState().active, false);
});

test('explicit start authenticates, waits for welcome, then joins only its channel', () => {
  const r = harness(), s = r.start();
  assert.equal(s.url, 'wss://irc-ws.chat.twitch.tv:443'); assert.equal(s.sent.length, 0);
  s.open();
  assert.deepEqual(s.sent, ['CAP REQ :twitch.tv/tags twitch.tv/commands\r\n', 'PASS oauth:private-access-token\r\n', 'NICK reader\r\n']);
  s.receive(':tmi.twitch.tv 001 reader :Welcome\r\n');
  assert.equal(s.sent.at(-1), 'JOIN #example\r\n');
  s.receive(':tmi.twitch.tv 001 reader :Duplicate\r\n');
  assert.equal(s.sent.filter(x => x.startsWith('JOIN ')).length, 1);
  s.receive(':reader!reader@reader.tmi.twitch.tv JOIN #example\r\n');
  assert.equal(r.client.getState().phase, 'connected');
  assert.ok(s.sent.every(x => /^(CAP|PASS|NICK|JOIN|PONG) /.test(x)));
  assert.equal(typeof r.client.send, 'undefined');
  assert.equal(JSON.stringify(r.states).includes('private-access-token'), false);
  r.client.stop();
  assert.equal(r.tasks.size, 0); assert.equal(s.readyState, 3);
});

test('invalid identity or credential never creates a socket and cannot inject protocol', () => {
  for (const config of [
    {channel: 'example', username: 'reader', token: 'token\r\nPRIVMSG #example :injected'},
    {channel: 'example\r\nJOIN #else', username: 'reader', token: 'token'},
    {channel: 'example', username: 'bad name', token: 'token'},
    {channel: 'example', username: 'reader', token: ''}
  ]) {
    const r = harness(); assert.equal(r.client.start(config), false);
    assert.equal(r.sockets.length, 0); assert.equal(r.tasks.size, 0);
    assert.equal(r.client.getState().phase, 'error');
    assert.equal(JSON.stringify(r.states).includes('injected'), false);
  }
  const r = harness(); assert.equal(r.client.start({channel: 'example', username: 'reader', token: 'oauth:token'}), true);
  r.sockets[0].open(); assert.ok(r.sockets[0].sent.includes('PASS oauth:token\r\n')); r.client.stop();
});

test('tags, Unicode, CTCP actions and server pings preserve plain text', () => {
  const r = harness(), s = r.ready();
  s.receive('PING :tmi.twitch.tv\r\n'); assert.equal(s.sent.at(-1), 'PONG :tmi.twitch.tv\r\n');
  s.receive(msg('one', '<img onerror=bad()> 😀 : hello', 'color=#ABCDEF;tmi-sent-ts=1700000000123;badges=moderator/1;emotes=25:0-4'));
  s.receive('@id=two;display-name=A\\sB\\:C\\\\D;user-id=8 :bob!bob@bob.tmi.twitch.tv PRIVMSG #example :\u0001ACTION waves\u0001\r\n');
  assert.equal(r.batches.length, 0); r.advance(200);
  const events = allEvents(r); assert.equal(events.length, 2);
  assert.equal(events[0].text, '<img onerror=bad()> 😀 : hello');
  assert.equal(events[0].timestampMs, 1700000000123); assert.equal(events[0].color, '#ABCDEF');
  assert.equal(events[0].badges, 'moderator/1'); assert.equal(events[0].emotes, '25:0-4');
  assert.equal(events[1].author, 'A B;C\\D'); assert.equal(events[1].text, 'waves'); assert.equal(events[1].action, true);
  r.client.stop();
});

test('busy rooms are capped at 150 pending events and callbacks run at most five times per second', () => {
  const r = harness(), s = r.ready();
  for (let i = 0; i < 600; i++) s.receive(msg(String(i)));
  assert.ok(r.client.getState().queued <= 150); r.advance(200);
  assert.equal(r.batches.length, 1); assert.equal(r.batches[0].events.length, 150);
  assert.equal(r.batches[0].events[0].id, '450');
  for (let i = 0; i < 50; i++) { s.receive(msg(`later-${i}`)); r.advance(20); }
  assert.ok(r.batches.length <= 6);
  for (let i = 1; i < r.batches.length; i++) assert.ok(r.batches[i].at - r.batches[i - 1].at >= 200);
  assert.ok(r.batches.every(b => b.events.length <= 150)); r.client.stop();
});

test('moderation removes pending messages and conveys deletion for already rendered history', () => {
  const r = harness(), s = r.ready();
  s.receive(msg('delivered')); r.advance(200);
  s.receive(msg('pending-one')); s.receive(msg('pending-two'));
  s.receive('@target-msg-id=pending-one :tmi.twitch.tv CLEARMSG #example :deleted\r\n');
  s.receive('@target-user-id=7;ban-duration=60 :tmi.twitch.tv CLEARCHAT #example :alice\r\n');
  r.advance(200);
  assert.deepEqual(r.batches.at(-1).events, [
    {type: 'clear-message', channel: 'example', id: 'pending-one'},
    {type: 'clear-user', channel: 'example', userId: '7', login: 'alice'}
  ]);
  s.receive(msg('last')); s.receive(':tmi.twitch.tv CLEARCHAT #example\r\n'); r.advance(200);
  assert.deepEqual(r.batches.at(-1).events, [{type: 'clear-all', channel: 'example'}]);
  r.client.stop();
});

test('moderation pressure cannot drop deletion safety or grow the pending queue', () => {
  const r = harness(), s = r.ready();
  for (let i = 0; i < 500; i++) s.receive(`@target-msg-id=${i} :tmi.twitch.tv CLEARMSG #example :deleted\r\n`);
  assert.ok(r.client.getState().queued <= 150); r.advance(200);
  assert.ok(allEvents(r).some(e => e.type === 'clear-all'));
  assert.ok(allEvents(r).length <= 150); r.client.stop();
});

test('foreign room messages and malformed tags cannot alter the selected room', () => {
  const r = harness(), s = r.ready();
  s.receive(msg('foreign', 'wrong room', '', 'other'));
  s.receive('@target-user-id=7 :tmi.twitch.tv CLEARCHAT #other :alice\r\n');
  s.receive('@msg-id=notice :tmi.twitch.tv NOTICE #example :Room notice\r\n');
  s.receive('@__proto__=polluted;id=okay;user-id=7 :alice!alice@host PRIVMSG #example :safe\r\n');
  r.advance(200); assert.equal(allEvents(r).length, 2);
  assert.deepEqual(allEvents(r)[0], {type: 'notice', channel: 'example', id: 'notice', text: 'Room notice'});
  assert.equal(allEvents(r)[1].id, 'okay'); assert.equal({}.polluted, undefined); r.client.stop();
});

test('failed authentication and rejected capabilities are terminal and do not expose server text', () => {
  for (const line of [
    ':tmi.twitch.tv NOTICE * :Login authentication failed\r\n',
    ':tmi.twitch.tv NOTICE * :Improperly formatted auth\r\n',
    ':tmi.twitch.tv CAP * NAK :twitch.tv/tags twitch.tv/commands\r\n'
  ]) {
    const r = harness(), s = r.start(); s.open(); s.receive(line);
    assert.equal(r.client.getState().phase, 'error'); assert.equal(r.client.getState().active, false);
    assert.equal(r.tasks.size, 0); r.advance(600000); assert.equal(r.sockets.length, 1);
    assert.equal(JSON.stringify(r.states).includes('private-access-token'), false);
  }
});

test('connection retries use capped backoff and eventually require explicit start again', () => {
  const r = harness(); r.start(); const delays = [];
  while (r.client.getState().active) {
    r.sockets.at(-1).drop(); const state = r.client.getState();
    if (!state.active) break;
    assert.equal(state.phase, 'reconnecting'); assert.ok(state.retryInMs >= 1000 && state.retryInMs <= 30000);
    delays.push(state.retryInMs); r.advance(state.retryInMs);
    assert.ok(r.sockets.length <= 10, 'retry count is bounded');
  }
  assert.ok(delays.length >= 3 && delays.length <= 8); assert.equal(delays[0], 1000);
  assert.ok(delays.at(-1) <= 30000); assert.equal(r.tasks.size, 0);
  assert.equal(r.client.getState().reason, 'retry-exhausted');
  assert.equal(JSON.stringify(r.states).includes('untrusted secret'), false);
});

test('server RECONNECT uses the same bounded reconnect path', () => {
  const r = harness(), s = r.ready();
  s.receive(':tmi.twitch.tv RECONNECT\r\n');
  assert.equal(r.client.getState().phase, 'reconnecting'); assert.equal(s.readyState, 3);
  const delay = r.client.getState().retryInMs; r.advance(delay);
  assert.equal(r.sockets.length, 2); r.client.stop(); assert.equal(r.tasks.size, 0);
});

test('Off invalidates socket events, pending batches and retries, and destroy prohibits restart', () => {
  const r = harness(), s = r.ready(); s.receive(msg('never-delivered'));
  const staleMessage = s.onmessage, staleClose = s.onclose;
  r.client.stop(); assert.equal(r.tasks.size, 0); assert.equal(r.client.getState().timers, 0);
  staleMessage({data: 'PING :late\r\n' + msg('late')}); staleClose({code: 1006});
  r.advance(1000000); assert.equal(r.batches.length, 0); assert.equal(r.sockets.length, 1);
  assert.equal(r.client.getState().phase, 'off');
  r.ready(); r.client.destroy(); assert.equal(r.tasks.size, 0);
  assert.equal(r.client.start({channel: 'example', username: 'reader', token: 'token'}), false);
  assert.equal(r.client.getState().phase, 'destroyed'); assert.equal(r.sockets.length, 2);
});

test('replacement start invalidates the previous connection without mixing rooms', () => {
  const r = harness(), old = r.ready(), oldHandler = old.onmessage;
  old.receive(msg('old-pending'));
  assert.equal(r.client.start({channel: 'second', username: 'reader', token: 'new-token'}), true);
  oldHandler({data: msg('old-stale')}); const socket = r.sockets.at(-1); socket.open();
  socket.receive(':tmi.twitch.tv 001 reader :Welcome\r\n@room-id=2 :tmi.twitch.tv ROOMSTATE #second\r\n');
  socket.receive(msg('new', 'new room', '', 'second')); r.advance(200);
  assert.deepEqual(allEvents(r).map(e => e.id), ['new']); r.client.stop();
});

test('split frames are assembled and oversized input is bounded', () => {
  const r = harness(), s = r.ready(), line = msg('split');
  s.receive(line.slice(0, 17)); s.receive(line.slice(17)); r.advance(200);
  assert.equal(allEvents(r)[0].id, 'split');
  s.receive('x'.repeat(70000));
  assert.equal(r.client.getState().phase, 'error'); assert.equal(r.tasks.size, 0);
  assert.equal(r.client.getState().reason, 'protocol-limit');
});

test('message ids deduplicate Twitch redelivery without repeated UI rows', () => {
  const r = harness(), s = r.ready(); s.receive(msg('same')); s.receive(msg('same')); r.advance(200);
  s.receive(msg('same')); s.receive(msg('different')); r.advance(200);
  assert.deepEqual(allEvents(r).map(e => e.id), ['same', 'different']); r.client.stop();
});

test('a batch callback can stop immediately without resurrecting any timers', () => {
  let client, deliveries = 0;
  const r = harness({onBatch() { deliveries++; client.stop(); }}); client = r.client;
  r.ready().receive(msg('stop')); r.advance(200);
  assert.equal(deliveries, 1); assert.equal(r.tasks.size, 0); assert.equal(client.getState().phase, 'off');
});

test('a stalled connection times out and the watchdog itself stops at Off', () => {
  const r = harness(); r.start(); r.advance(15000);
  assert.equal(r.client.getState().phase, 'reconnecting'); r.client.stop(); assert.equal(r.tasks.size, 0);
  r.ready(); r.advance(300000);
  assert.equal(r.client.getState().phase, 'reconnecting'); r.client.stop(); assert.equal(r.tasks.size, 0);
});
