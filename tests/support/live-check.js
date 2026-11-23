'use strict';

// #67: since round 2, global checks a Twitch channel with one anonymous GQL request, user(login){stream{id}},
// before it creates the channel's player (src/twitch-vods.js channelStatus), so a channel open is asynchronous.
// Harnesses written before that check call routeLiveCheck(shim) before running global.js. The status request is
// answered here (live by default) and recorded in `checks`; every other request still reaches the shim's own HTTP
// double, so the assertions those harnesses make about their traffic are unchanged. Tests of the check itself are
// in tests/offline-precheck.test.js.

const STREAM_QUERY = /^query\{user\(login:"[A-Za-z0-9_]{1,25}"\)\{stream\{id\}\}\}$/;

const CHECK_TIMEOUT_MS = 1500;

const REPLIES = {
  live: {statusCode: 200, data: {data: {user: {stream: {id: '1'}}}}},
  offline: {statusCode: 200, data: {data: {user: {stream: null}}}},
};

function isStatusCheck(url, options) {
  const query = options && options.data && options.data.query;
  return url === 'https://gql.twitch.tv/gql' && typeof query === 'string' && STREAM_QUERY.test(query);
}

// Returns the recorded checks. channelStatus arms its 1.5 s timeout just before it sends the request, so each
// check also records that timer (the newest shim timer at that moment); `checks.isCheckTimer(timer)` lets a
// harness that counts timers keep counting only the ones it was written for.
function routeLiveCheck(shim, status = 'live') {
  const http = shim.iina.http;
  const checks = [];
  const post = (url, options) => {
    if (!isStatusCheck(url, options)) return http.post(url, options);
    const timer = shim.timers.all.at(-1);
    if (!timer || timer.delay !== CHECK_TIMEOUT_MS) throw new Error('live-check fixture: the check timer was not the newest');
    checks.push({url, query: options.data.query, timer});
    return Promise.resolve(REPLIES[status]);
  };
  shim.iina.http = Object.assign({}, http, {post});
  checks.isCheckTimer = timer => checks.some(check => check.timer === timer);
  return checks;
}

// Lets a channel open's status check and the player creation after it run.
async function settleOpens() {
  for (let round = 0; round < 5; round++) await new Promise(resolve => setImmediate(resolve));
}

module.exports = {routeLiveCheck, settleOpens};
