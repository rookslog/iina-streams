// Player side of the harness. Arms: players (answer pings), hook (on_load hook on repeated loads), all.
const {global: g, mpv, event, core} = iina;
const {readConfig, words, churn, writeStatus} = require('./common.js');
const cfg = readConfig();
const arm = cfg.arm || 'control';
const stats = {side: 'player', arm, pings: 0, hooks: 0, loads: 0, errors: 0};
try { mpv.set('mute', true); } catch (e) { stats.errors += 1; }
if (arm !== 'hook') { try { mpv.set('loop-file', 'inf'); } catch (e) { stats.errors += 1; } }
if (arm === 'players' || arm === 'http-cross' || arm === 'all') {
  g.onMessage('ping', data => {
    stats.pings += 1;
    churn(stats.pings);
    g.postMessage('pong', words(stats.pings));
  });
  g.postMessage('hello', {arm});
}
if (arm === 'hook' || arm === 'all') {
  mpv.addHook('on_load', 20, next => {
    stats.hooks += 1;
    churn(stats.hooks);
    JSON.stringify(words(stats.hooks));
    next();
  });
  event.on('iina.file-loaded', () => {
    stats.loads += 1;
    setTimeout(() => { try { core.open(cfg.media); } catch (e) { stats.errors += 1; } }, 150);
  });
}
function tick() { writeStatus('status-player.json', stats); setTimeout(tick, 5000); }
tick();
