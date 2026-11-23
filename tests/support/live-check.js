'use strict';

// #67: global checks a Twitch channel with one anonymous GQL request, user(login){stream{id}}, before it creates the
// channel's player (src/twitch-vods.js channelStatus), and makes the player on a main-thread timer turn after the
// reply (global.js onMainThread). So a channel open is asynchronous. Harnesses written before the check call
// routeLiveCheck(shim) before running global.js and settleOpens() after an open:
//   - the status request is answered here (live by default) and recorded in `checks`; every other request still
//     reaches the shim's own HTTP double, so those harnesses' traffic assertions count everything but this request;
//   - settleOpens fires each answered check's 0 ms main-thread turn (the first 0 ms timer armed after the check's
//     own deadline timer) unless the harness already flushed it, and nothing else.
// The route also audits what it hides: it fails on an Authorization header, and settleOpens fails if a check's
// 1.5 s deadline timer is still armed or registered after its answer. Tests of the check itself are in
// tests/offline-precheck.test.js.

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

// Returns the recorded checks. `checks.isCheckTimer(timer)` is true for a check's deadline timer and its main-thread
// turn, so a harness that counts timers keeps counting only the ones it was written for.
function routeLiveCheck(shim, status = 'live') {
  const http = shim.iina.http;
  const checks = [];
  const post = (url, options) => {
    if (!isStatusCheck(url, options)) return http.post(url, options);
    // Recorded here and asserted in settleOpens: a throw here would only make the check 'unknown'.
    const headers = options.headers || {};
    const authorized = Object.keys(headers).some(name => name.toLowerCase() === 'authorization');
    const deadline = shim.timers.all.at(-1);
    checks.push({url, query: options.data.query, deadline, authorized, finished: false});
    return Promise.resolve(REPLIES[status]);
  };
  shim.iina.http = Object.assign({}, http, {post});
  checks.turns = [];
  checks.isCheckTimer = timer => checks.some(check => check.deadline === timer) || checks.turns.includes(timer);
  routed.push({shim, checks});
  return checks;
}

async function rounds() {
  for (let round = 0; round < 5; round++) await new Promise(resolve => setImmediate(resolve));
}

// Lets each answered status check finish: its reply's promise jobs, then its main-thread turn. The turns are the
// 0 ms timers armed after the earliest unfinished check's deadline timer; they are fired in order, once, unless the
// harness already flushed them. Nothing armed before that deadline is touched.
async function settleOpens() {
  await rounds();
  for (const {shim, checks} of routed) {
    const open = checks.filter(check => !check.finished);
    if (!open.length) continue;
    for (const check of open) {
      assert.equal(check.authorized, false, 'live-check fixture: the status request must carry no Authorization header');
      assert.ok(check.deadline && check.deadline.delay === CHECK_TIMEOUT_MS,
        'live-check fixture: the deadline timer is the newest timer when the request is sent');
      assert.equal(check.deadline.cancelled, true, 'live-check fixture: the deadline timer is cleared after the answer');
    }
    const start = shim.timers.all.indexOf(open[0].deadline) + 1;
    const turns = shim.timers.all.slice(start).filter(timer => timer.delay === 0);
    assert.ok(turns.length >= open.length, 'live-check fixture: each answer schedules its main-thread turn');
    for (const turn of turns) {
      if (!checks.turns.includes(turn)) checks.turns.push(turn);
      if (!turn.fired && !turn.cancelled) shim.timers.fire(turn);
    }
    for (const check of open) check.finished = true;
  }
  await rounds();
}

module.exports = {routeLiveCheck, settleOpens};
