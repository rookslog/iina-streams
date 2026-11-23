'use strict';

// #67: global checks a Twitch channel with one anonymous GQL request, user(login){stream{id}}, before it creates the
// channel's player (src/twitch-vods.js channelStatus). The reply's continuation only arms a 0 ms handoff timer; on
// that main-thread turn the deadline is cleared and the answer delivered, and global then makes the player on a
// further main-thread turn (global.js onMainThread). So a channel open is asynchronous. Harnesses written before the
// check call routeLiveCheck(shim) before running global.js and settleOpens() after an open:
//   - the status request is held here and recorded in `checks`; every other request still reaches the shim's own
//     HTTP double, so those harnesses' traffic assertions count everything but this request;
//   - settleOpens answers each held check (live by default) and runs exactly the turns that answer causes. A turn is
//     attributed by identity: it is the one 0 ms timer armed while that check's previous step ran (its reply's
//     promise jobs, then its handoff turn), with nothing else running. Any other count fails the fixture.
// The route also audits what it hides: it fails on an Authorization header, on a deadline timer that is cleared
// before the handoff turn (a clearTimeout off IINA's main thread), and on a deadline still armed after it.
// Tests of the check itself are in tests/offline-precheck.test.js.

const assert = require('node:assert/strict');

const STREAM_QUERY = /^query\{user\(login:"[A-Za-z0-9_]{1,25}"\)\{stream\{id\}\}\}$/;
const CHECK_TIMEOUT_MS = 1500;

const REPLIES = {
  live: {statusCode: 200, data: {data: {user: {stream: {id: '1'}}}}},
  offline: {statusCode: 200, data: {data: {user: {stream: null}}}},
};

// Every shim routed by this module, with its checks, so settleOpens() needs no arguments.
const routed = [];

function isStatusCheck(url, options) {
  const query = options && options.data && options.data.query;
  return url === 'https://gql.twitch.tv/gql' && typeof query === 'string' && STREAM_QUERY.test(query);
}

// Returns the recorded checks. `checks.isCheckTimer(timer)` is true for a check's deadline and its two turns, so a
// harness that counts timers keeps counting only the ones it was written for.
function routeLiveCheck(shim, status = 'live') {
  const http = shim.iina.http;
  const checks = [];
  const post = (url, options) => {
    if (!isStatusCheck(url, options)) return http.post(url, options);
    const headers = options.headers || {};
    const check = {
      url,
      query: options.data.query,
      // Recorded here and asserted in settleOpens: a throw here would only make the check 'unknown'.
      authorized: Object.keys(headers).some(name => name.toLowerCase() === 'authorization'),
      deadline: shim.timers.all.at(-1),
      turns: [],
      answered: false,
    };
    checks.push(check);
    return new Promise(resolve => {
      check.answer = () => resolve(REPLIES[status]);
    });
  };
  shim.iina.http = Object.assign({}, http, {post});
  checks.isCheckTimer = timer => checks.some(check => check.deadline === timer || check.turns.includes(timer));
  routed.push({shim, checks});
  return checks;
}

async function rounds() {
  for (let round = 0; round < 5; round++) await new Promise(resolve => setImmediate(resolve));
}

// Runs `step`, lets its promise jobs finish, and returns the one 0 ms timer armed meanwhile.
async function turnArmedBy(shim, step, what) {
  const start = shim.timers.all.length;
  step();
  await rounds();
  const armed = shim.timers.all.slice(start).filter(timer => timer.delay === 0);
  assert.equal(armed.length, 1, `live-check fixture: exactly one 0 ms turn is armed by ${what}`);
  return armed[0];
}

// Answers every held status check and runs the turns its answer causes, one check at a time.
async function settleOpens() {
  await rounds();
  for (const {shim, checks} of routed) {
    for (const check of checks) {
      if (check.answered) continue;
      check.answered = true;
      assert.equal(check.authorized, false, 'live-check fixture: the status request must carry no Authorization header');
      assert.ok(check.deadline && check.deadline.delay === CHECK_TIMEOUT_MS,
        'live-check fixture: the deadline timer is the newest timer when the request is sent');
      const handoff = await turnArmedBy(shim, check.answer, 'the reply');
      assert.equal(check.deadline.cancelled, false, 'live-check fixture: no clearTimeout before the main-thread turn');
      check.turns.push(handoff);
      const finish = await turnArmedBy(shim, () => shim.timers.fire(handoff), 'the handoff turn');
      assert.equal(check.deadline.cancelled, true, 'live-check fixture: the handoff turn clears the deadline');
      check.turns.push(finish);
      shim.timers.fire(finish);
    }
  }
  await rounds();
}

module.exports = {routeLiveCheck, settleOpens};
