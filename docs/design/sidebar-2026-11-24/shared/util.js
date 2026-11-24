"use strict";
// Small helpers shared by every direction. Values only: no sentences.
window.U = (function () {
  const S = window.SNAPSHOT, V = window.VIEWER;
  const NOW = Date.parse(S.takenAt);
  const byLogin = Object.fromEntries(S.people.map(p => [p.login, p]));
  const ranked = V.rank.map(l => byLogin[l]).filter(Boolean);
  function compact(n) {            // 36677 -> "36.7K"
    if (n == null) return "";
    if (n < 1000) return String(n);
    return (n / 1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, "") + "K";
  }
  function duration(sec) {         // 26400 -> "7:20:00"
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0");
  }
  function ago(iso) {              // "3h", "2d", "3w", "5mo"
    const d = (NOW - Date.parse(iso)) / 1000;
    if (d < 3600) return Math.max(1, Math.round(d / 60)) + "m";
    if (d < 86400) return Math.round(d / 3600) + "h";
    if (d < 86400 * 14) return Math.round(d / 86400) + "d";
    if (d < 86400 * 60) return Math.round(d / 604800) + "w";
    return Math.round(d / 2592000) + "mo";
  }
  function uptime(iso) {           // live for "2:20"
    const m = Math.floor((NOW - Date.parse(iso)) / 60000);
    return Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0");
  }
  function person(login) { return byLogin[login]; }
  function unfinished() {
    return V.unfinished.map(u => ({ ...u, person: byLogin[u.login], video: byLogin[u.login].vods[u.vod] }));
  }
  function progressOf(login, vodIndex) {
    const u = V.unfinished.find(x => x.login === login && x.vod === vodIndex);
    return u ? u.fraction : null;
  }
  function isNew(login, iso) {     // broadcast newer than the viewer's last visit
    const d = V.lastVisitDaysAgo[login];
    return d != null && Date.parse(iso) > NOW - d * 86400000;
  }
  // Tell the IINA frame to switch what plays. In IINA this is the plugin's own message to its player.
  function play(login, vodIndex) { parent.postMessage({ type: "play", login, vod: vodIndex ?? null }, "*"); }
  function closePanel() { parent.postMessage({ type: "close-panel" }, "*"); }
  return { NOW, ranked, compact, duration, ago, uptime, person, unfinished, progressOf, isNew, play, closePanel };
})();
