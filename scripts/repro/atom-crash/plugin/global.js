// Global side of the harness for #90. One arm per IINA bridge path that Streams uses; see ../README.md.
const {global: g, http, utils, standaloneWindow: win} = iina;
const {readConfig, words, churn, writeStatus} = require('./common.js');
const cfg = readConfig();
const arm = cfg.arm || 'control';
const stats = {side: 'global', arm, started: new Date().toISOString(), httpOk: 0, httpFail: 0, httpFirst: null,
  pageIn: 0, pongs: 0, hooked: 0, execOk: 0, execFail: 0, churn: 0, errors: 0, lastError: ''};
const want = name => arm === name || arm === 'all';
function note(e) { stats.errors += 1; stats.lastError = String((e && e.message) || e).slice(0, 200); }
let player = null;

if (arm === 'control') {
  let i = 0;
  (function loop() { for (let j = 0; j < 20; j++) { i += 1; stats.churn += churn(i); JSON.parse(JSON.stringify(words(i))); } setTimeout(loop, 5); })();
}

if (want('page') || arm === 'http-cross') {
  win.loadFile('page.html');
  win.onMessage('m', data => {
    stats.pageIn += 1;
    churn(stats.pageIn);
    win.postMessage('r', words(stats.pageIn));
  });
  win.open();
  try { win.setFrame(220, 120, 0, 0); } catch (e) { note(e); }
}

if (want('players') || want('hook') || arm === 'http-cross') {
  // Listeners first: a player's first message can arrive inside createPlayerInstance.
  // Global<->player messages are synchronous both ways (Streams defers its own, global.js:96-103), so each reply
  // is answered once and the next ping goes out from a timer, never from inside the reply.
  g.onMessage('pong', () => {
    stats.pongs += 1;
    if (want('players') && player !== null) setTimeout(() => g.postMessage(player, 'ping', words(stats.pongs)), 0);
  });
  g.onMessage('hooked', () => { stats.hooked += 1; });
  player = g.createPlayerInstance({url: cfg.media, enablePlugins: true, disableWindowAnimation: true, label: 'atomrepro'});
  if (want('players')) setTimeout(() => { for (let c = 0; c < 4; c++) g.postMessage(player, 'ping', words(c)); }, 2000);
}

// Requests to a local server; the continuation after await runs where IINA settles the promise (off the main thread).
async function httpWorker(w) {
  let i = w * 1000000;
  for (;;) {
    i += 1;
    try {
      const r = await http.get('http://localhost:' + cfg.port + '/j?i=' + i);
      stats.httpOk += 1;
      if (stats.httpFirst === null) stats.httpFirst = 'ok';
      const o = JSON.parse(r.text);
      stats.churn += churn(i) + Object.keys(o).length;
      if (arm === 'http-cross' || arm === 'all') {
        if (player !== null) g.postMessage(player, 'ping', o);
        win.postMessage('r', o);
      }
    } catch (e) {
      stats.httpFail += 1;
      if (stats.httpFirst === null) stats.httpFirst = 'fail';
      note(e);
      await new Promise(res => setTimeout(res, 50));
    }
  }
}
if (want('http') || arm === 'http-cross') for (let w = 0; w < 4; w++) httpWorker(w);

async function execWorker() {
  let i = 0;
  for (;;) {
    i += 1;
    try { await utils.exec('/bin/echo', ['x'.repeat(40) + i, JSON.stringify(words(i))]); stats.execOk += 1; }
    catch (e) { stats.execFail += 1; note(e); await new Promise(res => setTimeout(res, 50)); }
  }
}
if (want('exec')) execWorker();

function tick() { writeStatus('status-global.json', stats); setTimeout(tick, 5000); }
tick();
