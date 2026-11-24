"use strict";
// Builds the imitation IINA window around one direction: video, IINA's on-screen controller, IINA's leading
// sidebar with its plugin header, and the direction's plugin page in it (an iframe, as IINA uses a web view).
// Optional: an overlay page over the video (data-overlay). Not part of any design.
(function () {
  const me = document.currentScript;
  const panelSrc = me.dataset.panel;
  const overlaySrc = me.dataset.overlay || null;
  const label = me.dataset.label || "";
  const startOpen = me.dataset.open !== "false";
  const S = window.SNAPSHOT;
  const byLogin = Object.fromEntries(S.people.map(p => [p.login, p]));
  const icon = {
    puzzle: '<svg viewBox="0 0 16 16"><path fill="currentColor" d="M6 1.5a1.6 1.6 0 0 1 1.6 1.6V4H11a1 1 0 0 1 1 1v3.4h.9a1.6 1.6 0 1 1 0 3.2H12V15a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-3.4h.9a1.6 1.6 0 1 0 0-3.2H1V5a1 1 0 0 1 1-1h2.4v-.9A1.6 1.6 0 0 1 6 1.5Z"/></svg>',
    chevron: '<svg viewBox="0 0 16 16"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    sidebar: '<svg viewBox="0 0 16 16"><rect x="1.5" y="2.5" width="13" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M6 2.5v11" stroke="currentColor" stroke-width="1.3"/></svg>',
    pause: '<svg viewBox="0 0 16 16"><path fill="currentColor" d="M4 3h3v10H4zM9 3h3v10H9z"/></svg>'
  };
  document.body.innerHTML = `
    <div class="chrome"><b>${label}</b>
      <span>Panel width</span><span class="seg" id="w"><button data-w="300">300</button><button data-w="360" aria-pressed="true">360</button></span>
      <span>State</span><span class="seg" id="st"><button data-s="" aria-pressed="true">Default</button><button data-s="signed-out">Signed out</button><button data-s="new">New</button><button data-s="many">Many</button></span>
      <span class="spacer"></span><span class="faint">Snapshot ${S.takenAt.replace("T", " ")} · data public, viewer history invented</span></div>
    <div class="window" id="win">
      <div class="video" id="video"></div>
      <div class="titlebar"><span class="title" id="title"></span></div>
      <div class="lights top"><i></i><i></i><i></i></div>
      <button class="sidebar-button" id="sbtn" title="Plugins" aria-label="Plugins">${icon.sidebar}</button>
      <div class="osc">${icon.pause}<div class="bar"><i id="pos"></i></div><span id="clock" class="num">LIVE</span></div>
      ${overlaySrc ? `<iframe class="overlay" id="overlay" src="${overlaySrc}" title="Streams overlay"></iframe>` : ""}
      <aside class="sidebar ${startOpen ? "" : "closed"}" id="sidebar" aria-label="IINA plugin sidebar">
        <div class="sb-header"><div class="sb-seg"><span>${icon.puzzle}Streams</span><span>${icon.chevron}</span></div></div>
        <div class="sb-sep"></div>
        <iframe id="panel" src="${panelSrc}" title="Streams"></iframe>
      </aside>
    </div>`;
  const $ = id => document.getElementById(id);
  const sidebar = $("sidebar"), video = $("video");
  function setWidth(w) {
    sidebar.style.setProperty("--sidebar-width", w + "px");
    for (const b of $("w").children) b.setAttribute("aria-pressed", String(b.dataset.w === String(w)));
  }
  $("w").addEventListener("click", e => { if (e.target.dataset.w) setWidth(+e.target.dataset.w); });
  // The states each direction supports (#signed-out, #new, #many), reloading its pages with that hash.
  $("st").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    for (const x of $("st").children) x.setAttribute("aria-pressed", String(x === b));
    const hash = b.dataset.s ? "#" + b.dataset.s : "";
    $("panel").src = panelSrc + hash;
    if ($("overlay")) $("overlay").src = overlaySrc + hash;
  });
  $("sbtn").addEventListener("click", () => sidebar.classList.toggle("closed"));
  // Clicking the video closes the panel, as IINA does when Edge-to-Edge Video is on.
  video.addEventListener("click", () => sidebar.classList.add("closed"));
  function show(login, vod) {
    const p = byLogin[login];
    if (!p) return;
    const v = vod != null ? p.vods[vod] : null;
    const img = v ? (v.thumb || p.preview || p.avatar) : (p.preview || p.avatar);
    video.classList.add("loading");
    // The old picture keeps playing until the new one starts (a short delay stands in for loading).
    setTimeout(() => { video.style.backgroundImage = `url("../shared/${img}")`; video.classList.remove("loading"); }, 450);
    $("title").textContent = v ? `${p.name} — ${v.title}` : p.name;
    $("clock").textContent = v ? "0:00 / " + window.U.duration(v.seconds) : "LIVE";
    window.VIEWER.playing = { login, kind: v ? "vod" : "live", vod: vod ?? null, quality: window.VIEWER.playing.quality };
    broadcast({ type: "playing", playing: window.VIEWER.playing });
  }
  function broadcast(msg) {
    for (const f of document.querySelectorAll("iframe")) f.contentWindow && f.contentWindow.postMessage(msg, "*");
  }
  window.addEventListener("message", e => {
    const m = e.data || {};
    if (m.type === "play") show(m.login, m.vod);
    if (m.type === "close-panel") sidebar.classList.add("closed");
    if (m.type === "open-panel") sidebar.classList.remove("closed");
    if (m.type === "overlay-active" && $("overlay")) {
      $("overlay").classList.toggle("active", !!m.active);
      if (m.active) $("overlay").focus(); else window.focus();
    }
  });
  // Keys pressed over the video go to the overlay, as IINA's input.onKeyDown would deliver them to the plugin.
  document.addEventListener("keydown", e => {
    const o = $("overlay");
    if (!o) return;
    o.contentWindow.postMessage({ type: "key", key: e.key, meta: e.metaKey, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey }, "*");
    if (e.key === "Tab" || (e.metaKey && e.key.toLowerCase() === "k")) e.preventDefault();
  });
  const start = window.VIEWER.playing;
  video.style.backgroundImage = `url("../shared/${byLogin[start.login].preview}")`;
  $("title").textContent = byLogin[start.login].name;
})();
