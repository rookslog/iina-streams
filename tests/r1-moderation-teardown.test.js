'use strict';

// v0.5.5 review r1 #3: a terminal transport failure must not discard queued moderation.
// Runs the real ui/live.js, ui/live-history.js and ui/overlay-live.js against a fake WebSocket,
// as tests/overlay-live.test.js does. A clear is queued for a row the player already holds, then a
// terminal event arrives before the 200 ms batch timer fires. The overlay must still post the
// moderation to the player, under the running session, exactly once.
// Scope: proves the bridge post only. The player hiding the row is covered by its own tests.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {createWebViewIina} = require('./support/iina-shim.js');

const root = path.join(__dirname, '../ui');
const SESSION = 41;
const CHANNEL = 'fixture_r1_mod';

function runtime() {
  const page = createWebViewIina();
  const sockets = [];
  const timers = new Map();
  let clock = 0;
  let nextTimer = 0;
  class Socket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.sent = [];
      sockets.push(this);
    }
    open() {
      this.readyState = 1;
      if (this.onopen) this.onopen();
    }
    receive(data) {
      if (this.onmessage) this.onmessage({data});
    }
    send(data) {
      this.sent.push(data);
    }
    close() {
      this.readyState = 3;
    }
  }
  const ctx = {
    WebSocket: Socket,
    iina: page.iina,
    addEventListener() {},
    setTimeout(fn, ms) {
      const id = ++nextTimer;
      timers.set(id, {fn, due: clock + ms});
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    Date: class extends Date {
      static now() {
        return clock;
      }
    },
  };
  ctx.window = ctx;
  const context = vm.createContext(ctx);
  for (const name of ['live.js', 'live-history.js', 'overlay-live.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), context, {filename: name});
  }
  function advance(ms) {
    const target = clock + ms;
    for (;;) {
      const due = [...timers].filter(([, value]) => value.due <= target);
      const entry = due.sort((a, b) => a[1].due - b[1].due)[0];
      if (!entry) break;
      clock = entry[1].due;
      timers.delete(entry[0]);
      entry[1].fn();
    }
    clock = target;
  }
  // Read at call time so assertions never see a frozen copy.
  const posts = () => page.messages('live-messages').map(post => post.data);
  const states = () => page.messages('live-state').map(post => post.data);
  const log = () => page.posts.map(post => post.name);

  page.receiveEnvelope('live-config', {session: SESSION, channel: CHANNEL, login: 'reader', token: 'fake_r1_token'});
  assert.equal(sockets.length, 1, 'live-config opens one socket');
  const socket = sockets[0];
  socket.open();
  socket.receive(`:tmi.twitch.tv 001 reader :Welcome\r\n@room-id=1 :tmi.twitch.tv ROOMSTATE #${CHANNEL}\r\n`);
  return {socket, advance, posts, states, log, timers};
}

function privmsg(id, login, userId) {
  return `@id=${id};display-name=${login};user-id=${userId};tmi-sent-ts=1234 ` +
    `:${login}!${login}@${login}.tmi.twitch.tv PRIVMSG #${CHANNEL} :pending row\r\n`;
}

const CLEARS = [
  {
    kind: 'clear-message',
    line: `@target-msg-id=target-row :tmi.twitch.tv CLEARMSG #${CHANNEL} :pending row\r\n`,
    carries: data => data.removed.includes('target-row'),
  },
  {
    kind: 'clear-user',
    line: `@target-user-id=77 :tmi.twitch.tv CLEARCHAT #${CHANNEL} :target\r\n`,
    carries: data => data.removedUsers.some(user => user.userId === '77' && user.login === 'target'),
  },
  {
    kind: 'clear-all',
    line: `:tmi.twitch.tv CLEARCHAT #${CHANNEL}\r\n`,
    carries: data => data.clearedAll === true,
  },
];

const TERMINALS = [
  {kind: 'CAP NAK', line: ':tmi.twitch.tv CAP * NAK :twitch.tv/tags twitch.tv/commands\r\n'},
  {kind: 'authentication failure', line: ':tmi.twitch.tv NOTICE * :Login authentication failed\r\n'},
  {kind: 'protocol limit', frame: 'x'.repeat(65537)},
];

function deliverTerminal(socket, terminal) {
  socket.receive(terminal.frame || terminal.line);
}

for (const clear of CLEARS) {
  for (const terminal of TERMINALS) {
    test(`${clear.kind} queued before a terminal ${terminal.kind} still reaches the player`, () => {
      const r = runtime();
      r.socket.receive(privmsg('target-row', 'target', '77'));
      r.advance(200);
      assert.equal(r.posts().length, 1, 'precondition: the target row reached the player in its own batch');
      assert.deepEqual(r.posts()[0].messages.map(row => row.id), ['target-row']);

      r.socket.receive(clear.line);
      assert.equal(r.posts().length, 1, 'precondition: the clear is still queued, not yet posted');

      deliverTerminal(r.socket, terminal);
      const states = r.states();
      assert.equal(states.at(-1).state, 'error', 'the terminal event ended the transport');
      assert.equal(r.posts().length, 2, 'the queued clear is posted as one final batch');
      const final = r.posts()[1];
      assert.equal(final.session, SESSION, 'the final batch keeps the running session');
      assert.ok(clear.carries(final), `the final batch carries the ${clear.kind} moderation`);

      r.advance(10_000);
      assert.equal(r.posts().length, 2, 'no further batch after teardown');
      assert.equal(r.timers.size, 0, 'teardown leaves no timers');
    });
  }
}

test('the final batch is posted before the error state', () => {
  const r = runtime();
  r.socket.receive(privmsg('target-row', 'target', '77'));
  r.advance(200);
  r.socket.receive(CLEARS[0].line);
  const before = r.log().length;
  r.socket.receive(TERMINALS[0].line);
  assert.deepEqual(r.log().slice(before), ['live-messages', 'live-state'], 'moderation first, then the error');
});

test('a terminal event with nothing queued posts no empty batch', () => {
  const r = runtime();
  r.socket.receive(privmsg('target-row', 'target', '77'));
  r.advance(200);
  assert.equal(r.posts().length, 1);
  r.socket.receive(TERMINALS[0].line);
  assert.equal(r.posts().length, 1, 'no empty final batch');
});
