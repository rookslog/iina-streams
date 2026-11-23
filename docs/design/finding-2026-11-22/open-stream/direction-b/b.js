"use strict";
// Direction B: List and detail. One renderer draws the live window and every gallery frame from the same state.
(function () {
  const D = window.STREAMS_SAMPLE;

  const ICON = {
    mag: '<svg class="mag" viewBox="0 0 16 16" aria-hidden="true"><circle cx="6.8" cy="6.8" r="4.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.3 10.3 14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    clear: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="var(--window)" stroke-width="1.5" stroke-linecap="round"/></svg>',
    twitch: '<svg class="mark" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M3.2 1 1.8 3.8V13h3.3v2h1.8l2-2h2.7L15 9.6V1H3.2Zm10.3 7.9-1.9 1.9H8.8l-1.9 1.9v-1.9H3.6V2.5h9.9v6.4ZM10.2 4.6h1.4v3.6h-1.4V4.6Zm-3.5 0h1.4v3.6H6.7V4.6Z"/></svg>',
    youtube: '<svg class="mark" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M15.3 4.3a2 2 0 0 0-1.4-1.4C12.7 2.6 8 2.6 8 2.6s-4.7 0-5.9.3A2 2 0 0 0 .7 4.3C.4 5.5.4 8 .4 8s0 2.5.3 3.7a2 2 0 0 0 1.4 1.4c1.2.3 5.9.3 5.9.3s4.7 0 5.9-.3a2 2 0 0 0 1.4-1.4c.3-1.2.3-3.7.3-3.7s0-2.5-.3-3.7ZM6.5 10.4V5.6L10.6 8l-4.1 2.4Z"/></svg>',
    person: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="5.2" r="2.8" fill="currentColor"/><path d="M2.6 14c.4-3 2.6-4.6 5.4-4.6s5 1.6 5.4 4.6H2.6Z" fill="currentColor"/></svg>',
    history: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.6 8a5.4 5.4 0 1 0 1.6-3.8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M2.3 2.2v2.6h2.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 5.2V8l2 1.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    link: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.6 9.4 9.4 6.6M7.2 4.4l1.1-1.1a2.6 2.6 0 0 1 3.7 3.7l-1.1 1.1M8.8 11.6l-1.1 1.1A2.6 2.6 0 0 1 4 9l1.1-1.1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    noNet: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.8 6.2a9 9 0 0 1 12.4 0M4 8.6a5.8 5.8 0 0 1 8 0M6.3 11a2.4 2.4 0 0 1 3.4 0" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M2.5 2.5l11 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    alert: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8 15 14H1L8 1.8Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 6.3v3.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11.8" r=".9" fill="currentColor"/></svg>'
  };

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const hue = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const markOf = p => (p.platform === "youtube" ? ICON.youtube : ICON.twitch);

  const FOLLOW_REASONS = { sable_rr: "Followed last week", kestrel_vt: "Followed in March", ohnepixel: "Followed in 2024" };
  function followsOnly() {
    return ["kestrel_vt", "ohnepixel", "sable_rr"].map(login => Object.assign({}, D.people.find(x => x.login === login), { reason: FOLLOW_REASONS[login] }));
  }

  function staleAware(p, st) {
    if (st.network === "offline" && p.state === "live") return Object.assign({}, p, { state: "unknown", stale: true });
    return p;
  }

  function model(st) {
    const q = (st.query || "").trim();
    const out = { local: [], remote: [], direct: null, slot: null };
    if (D.isURL(q)) {
      const parsed = D.parse(q);
      out.direct = parsed ? { type: "direct", id: "direct", parsed } : null;
      return out;
    }
    const people = st.history ? D.local(q, st.signedIn) : (st.signedIn && !q ? followsOnly() : []);
    out.local = people.map(p => ({ type: "person", id: p.login, person: staleAware(p, st), group: "local" }));
    if (q && !out.local.length) {
      const parsed = D.parse(q);
      if (parsed) out.direct = { type: "direct", id: "direct", parsed };
    }
    if (q.length >= 2) {
      if (st.network === "offline") out.slot = "offline";
      else if (st.network === "error") out.slot = "error";
      else if (st.remote === "loading") out.slot = "loading";
      else out.remote = D.remoteFor(q).map(p => ({ type: "person", id: p.login, person: p, group: "remote" }));
    }
    return out;
  }

  const optionsOf = m => [].concat(m.direct ? [m.direct] : [], m.local, m.remote);

  function rowHTML(o, st, prefix, pos, size) {
    const p = o.person;
    const sel = st.selectedId === o.id;
    let sub = "", meta = "";
    if (p.state === "live") { sub = esc(p.category) + " · " + esc(p.title); meta = D.compact(p.viewers); }
    else if (p.state === "offline") { sub = D.ago(p.lastLive) + (p.vods && p.vods.length ? " · " + esc(p.vods[0].title) : ""); }
    else if (p.stale) { sub = esc(p.category) + " · " + esc(p.title); }
    const dot = p.state === "live" ? '<span class="dot"></span>' : p.state === "unknown" ? '<span class="dot unknown"></span>' : "";
    return `<div class="row${st.forceHover === o.id ? " hovered" : ""}" role="option" id="${prefix}-${o.id}" data-id="${o.id}" aria-selected="${sel}"
      aria-posinset="${pos}" aria-setsize="${size}" aria-label="${esc(D.spoken(p))}" aria-description="${esc(p.reason)}" title="${esc(p.reason)}">
      <span class="av" style="--av:hsl(${hue(p.login)} 34% 34%)">${esc(p.name[0].toUpperCase())}${dot}</span>
      <span class="line1"><span class="name">${esc(p.name)}</span>${markOf(p)}</span>
      <span class="meta">${meta}</span>
      <span class="sub">${sub}</span>
    </div>`;
  }

  function directHTML(o, st, prefix, pos, size) {
    const isUrl = D.isURL(st.query);
    return `<div class="row direct" role="option" id="${prefix}-direct" data-id="direct" aria-selected="${st.selectedId === "direct"}"
      aria-posinset="${pos}" aria-setsize="${size}" aria-label="${esc("Open " + o.parsed.label)}">
      <span class="glyph">${isUrl ? ICON.link : ICON.twitch}</span>
      <span class="line1"><span class="name">${esc(o.parsed.label)}</span></span><span class="meta"></span>
      <span class="sub">${esc(o.parsed.kind)}</span></div>`;
  }

  function slotHTML(slot) {
    const sk = `<div class="row skeleton shimmer" aria-hidden="true"><span class="av"></span><span class="bar" style="width:96px"></span><span></span><span class="bar" style="grid-column:2/4;width:85%"></span></div>`;
    if (slot === "loading") return `<div role="status" aria-label="Searching Twitch">${sk}${sk}</div>`;
    if (slot === "offline") return `<div class="slot-msg" role="status">${ICON.noNet}<span>No connection</span></div>`;
    if (slot === "error") return `<div class="slot-msg err" role="status">${ICON.alert}<span>Twitch didn't respond</span><button type="button" data-retry tabindex="-1">Retry</button></div>`;
    return "";
  }

  function vodList(p, st, prefix) {
    const vs = st.vodState[p.login];
    const focused = st.pane ? " focused" : "";
    if (vs === "loading") return `<div class="vods" role="status" aria-label="Loading recent broadcasts"><div class="busy"><span class="ring"></span></div></div>`;
    if (vs === "error") return `<div class="vods"><div class="none" role="status">Recent broadcasts unavailable</div></div>`;
    if (!p.vods || !p.vods.length) return `<div class="vods"><div class="none" role="status">No recent broadcasts</div></div>`;
    const items = p.vods.map((v, i) => `<li class="vod" role="option" id="${prefix}-v${i}" data-vod="${i}" aria-selected="${st.vodSel === i}"
      aria-label="${esc(v.title + ", " + D.date(v.at) + ", " + D.length(v.seconds))}" title="${esc(v.title)}">
      <span class="vtitle">${esc(v.title)}</span><span class="vmeta">${D.date(v.at)}</span><span class="vmeta">${D.length(v.seconds)}</span></li>`).join("");
    return `<ul class="vods${focused}" role="listbox" tabindex="0" aria-label="Recent broadcasts, ${esc(p.name)}" aria-activedescendant="${prefix}-v${st.vodSel}">${items}</ul>`;
  }

  function detailHTML(o, st, prefix) {
    if (!o) return `<div class="detail" aria-hidden="true"></div>`;
    if (o.type === "direct") {
      return `<section class="detail" aria-label="${esc(o.parsed.label)}">
        <div class="head"><span class="av" style="--av:var(--hover);color:var(--secondary)">${D.isURL(st.query) ? ICON.link : ICON.twitch}</span>
          <div><h3><span>${esc(o.parsed.label)}</span></h3><div class="facts">${o.parsed.platform === "youtube" ? ICON.youtube : ICON.twitch}<span>${esc(o.parsed.kind)}</span></div></div></div>
        <div class="actions"><button type="button" class="btn primary" data-open tabindex="-1">Open <kbd>↩</kbd></button></div></section>`;
    }
    const p = o.person;
    const dot = p.state === "live" ? '<span class="dot"></span>' : p.state === "unknown" ? '<span class="dot unknown"></span>' : "";
    let facts = "", body = "", action = "";
    if (p.state === "live") {
      facts = `<span class="live-pill">LIVE</span><span class="viewers" title="Viewers">${ICON.person}${p.viewers.toLocaleString("en-US")}</span>`;
      body = `<p class="stitle">${esc(p.title)}</p><div class="scat">${esc(p.category)}</div>`;
      action = `<button type="button" class="btn primary" data-open tabindex="-1">Open <kbd>↩</kbd></button>`;
    } else if (p.state === "offline") {
      facts = `<span title="Last live">${esc("Last live " + D.agoLong(p.lastLive))}</span>`;
      body = vodList(p, st, prefix);
    } else {
      facts = `<span>${p.stale ? esc(p.category) : ""}</span>`;
      body = `<div class="err-line">${ICON.alert}<span>Status unavailable</span></div>`;
      action = `<button type="button" class="btn" data-open tabindex="-1">Open</button>`;
    }
    return `<section class="detail" aria-label="${esc(p.name)}">
      <div class="head"><span class="av" style="--av:hsl(${hue(p.login)} 34% 34%)">${esc(p.name[0].toUpperCase())}${dot}</span>
        <div style="min-width:0"><h3><span>${esc(p.name)}</span>${markOf(p)}</h3><div class="facts">${facts}</div></div></div>
      <div class="why">${ICON.history}<span>${esc(p.reason)}</span></div>
      ${body}
      ${action ? `<div class="actions">${action}</div>` : ""}
    </section>`;
  }

  function render(host, st, prefix, interactive) {
    const m = model(st);
    const opts = optionsOf(m);
    if (!opts.some(o => o.id === st.selectedId)) st.selectedId = opts.length ? opts[0].id : null;
    const size = opts.length;
    const posOf = id => opts.findIndex(o => o.id === id) + 1;
    const open = size > 0 || !!m.slot;
    let list = "";
    if (m.direct) list += `<div class="group" role="group" aria-label="Open directly">${directHTML(m.direct, st, prefix, posOf("direct"), size)}</div>`;
    if (m.local.length) list += `<div class="group" role="group" aria-label="Your People"><div class="scope" aria-hidden="true">${ICON.history}Your People</div>${m.local.map(o => rowHTML(o, st, prefix, posOf(o.id), size)).join("")}</div>`;
    const remote = m.slot ? slotHTML(m.slot) : m.remote.map(o => rowHTML(o, st, prefix, posOf(o.id), size)).join("");
    if (remote) list += `<div class="group" role="group" aria-label="Twitch search"><div class="scope" aria-hidden="true">${ICON.twitch}Twitch</div>${remote}</div>`;
    const sel = opts.find(o => o.id === st.selectedId);
    if (sel && sel.type === "person" && st.vodSel == null) st.vodSel = 0;
    host.classList.toggle("open", open);
    host.innerHTML = `
      <div class="titlebar" aria-hidden="true"><span class="lights"><i></i><i></i><i></i></span><span class="t">Open Stream</span><span></span></div>
      <div class="content">
        <div class="field">${ICON.mag}
          <input type="text" role="combobox" aria-label="Channel or URL" placeholder="Channel or URL" spellcheck="false" autocomplete="off"
            aria-autocomplete="list" aria-controls="${prefix}-list" aria-expanded="${open}" aria-activedescendant="${st.selectedId && !st.pane ? prefix + "-" + st.selectedId : ""}"
            value="${esc(st.query)}" ${interactive ? "" : 'tabindex="-1" readonly'}>
          <button type="button" class="clear" aria-label="Clear" tabindex="-1" ${st.query ? "" : "hidden"}>${ICON.clear}</button>
        </div>
        ${open ? `<div class="split"><div class="list" role="listbox" id="${prefix}-list" aria-label="Suggestions">${list}</div><div class="rule"></div>${detailHTML(sel, st, prefix)}</div>` : ""}
      </div>`;
  }

  // ---------- Static gallery ----------
  function base(over) {
    return Object.assign({ query: "", signedIn: true, history: true, network: "ok", remote: "ready", selectedId: null,
      vodState: {}, vodSel: null, pane: false, forceHover: null }, over);
  }

  const FRAMES = [
    { s: base({}), cap: "<b>Empty field: top People.</b> Ranked by local history (frecency). mira_plays (1.2K viewers) sits above kestrel_vt (31.2K): viewers are shown, never the sort key. The pane shows the selected person, with why they're here." },
    { s: base({ history: false }), cap: "<b>No history yet, signed in (J1).</b> Followed channels until history exists: live first, then by follow date, newest first." },
    { s: base({ history: false, signedIn: false }), cap: "<b>No history yet, signed out (J1).</b> The field alone, at today's height. Typing still reaches Twitch search (anonymous GQL, D-034)." },
    { s: base({ query: "oh", remote: "loading" }), cap: "<b>Typing “oh”, Twitch search pending.</b> Local matches at once; two skeleton rows reserve the Twitch group. The frame is already at full height, so nothing will grow." },
    { s: base({ query: "oh", selectedId: "ohayo_nori", forceHover: "ohnepixel" }), cap: "<b>Typing “oh”, remote rows arrived.</b> They filled the reserved group. The selection (ohayo_nori) and the hovered row (Ohnepixel) did not move. The pane shows ohayo_nori's broadcasts." },
    { s: base({ query: "oh", selectedId: "ohayo_nori", pane: true, vodSel: 0 }), cap: "<b>Offline match, broadcasts focused (J4).</b> Return or Tab on ohayo_nori moves focus into the pane's list; Return plays the selected broadcast with chat replay." },
    { s: base({ query: "oh", selectedId: "ohayo_nori", vodState: { ohayo_nori: "loading" } }), cap: "<b>Broadcasts loading.</b> Today's busy ring, in the pane." },
    { s: base({ query: "https://www.twitch.tv/videos/2291834470" }), cap: "<b>Pasted URL.</b> One row with the parsed address and its kind; Return opens it." },
    { s: base({ query: "zzq9" }), cap: "<b>No match.</b> No person rows; the typed name is offered as a Twitch channel, as today's parser reads a bare name. Twitch search found nothing, so its group is absent." },
    { s: base({ query: "oh", signedIn: false }), cap: "<b>Signed out.</b> The same local order; ohana_vee, known only from Twitch follows, is absent; signed in, ohana_vee would rank after ohayo_nori. Twitch rows come from anonymous GQL search." },
    { s: base({ query: "oh", network: "offline" }), cap: "<b>No network connection.</b> Local rows stay usable; live dots become hollow rings because status can't refresh. The Twitch group says so once." },
    { s: base({ query: "oh", network: "error" }), cap: "<b>Twitch error.</b> The Twitch group shows the error and Retry; local rows are untouched." },
    { s: base({ selectedId: "dunewalker" }), cap: "<b>Row error: status unavailable.</b> dunewalker's live state couldn't be read; the pane says so and still offers Open." }
  ];

  function gallery() {
    const g = document.getElementById("gallery");
    FRAMES.forEach((f, i) => {
      const fig = document.createElement("figure");
      const win = document.createElement("div");
      win.className = "win inert";
      win.setAttribute("aria-hidden", "true");
      render(win, f.s, "g" + i, false);
      const cap = document.createElement("figcaption");
      cap.innerHTML = f.cap;
      fig.append(win, cap);
      g.append(fig);
      // Keep the selected row in view inside the frame's list, without scrolling the page.
      const list = win.querySelector(".list"), row = win.querySelector('.list [aria-selected="true"]');
      if (list && row) {
        const bottom = row.offsetTop + row.offsetHeight - list.offsetTop;
        if (bottom > list.clientHeight) list.scrollTop = bottom - list.clientHeight + 4;
      }
    });
  }

  function sheets() {
    const people = Object.fromEntries(D.people.map(p => [p.login, p]));
    const rows = [["Live", "ohnepixel", {}], ["Offline", "ohayo_nori", {}], ["Loading", null], ["Error", "dunewalker", {}],
      ["Selected", "mira_plays", { selectedId: "mira_plays" }], ["Hover", "kestrel_vt", { forceHover: "kestrel_vt" }]];
    ["force-light", "force-dark"].forEach((theme, t) => {
      const sheet = document.createElement("div");
      sheet.className = "sheet inert " + theme;
      sheet.setAttribute("aria-hidden", "true");
      const dl = document.createElement("dl");
      rows.forEach(([label, login, over]) => {
        const dt = document.createElement("dt");
        dt.textContent = label;
        const dd = document.createElement("dd");
        dd.innerHTML = login ? rowHTML({ id: login, person: people[login] }, base(over), "s" + t, 1, 1)
          : `<div class="row skeleton shimmer"><span class="av"></span><span class="bar" style="width:96px"></span><span></span><span class="bar" style="grid-column:2/4;width:85%"></span></div>`;
        dl.append(dt, dd);
      });
      sheet.append(dl);
      document.getElementById("rows").append(sheet);
    });
  }

  // ---------- Live window ----------
  const live = base({});
  let remoteTimer = 0;
  const host = document.getElementById("live");
  const closed = document.getElementById("closed");
  const outcome = document.getElementById("outcome");
  const say = html => { outcome.innerHTML = html; };
  const field = () => host.querySelector("input");
  const current = () => optionsOf(model(live));

  function draw(focus) {
    const caret = focus === "field" && field() ? field().selectionStart : null;
    render(host, live, "L", true);
    if (focus === "field") { field().focus(); if (caret !== null) field().setSelectionRange(caret, caret); }
    if (focus === "pane") host.querySelector(".vods[role=listbox]")?.focus();
    host.querySelector('.list [aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    host.querySelector('.vods [aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }

  function searchRemote() {
    clearTimeout(remoteTimer);
    if ((live.query || "").trim().length < 2) return;
    live.remote = "loading";
    remoteTimer = setTimeout(() => { live.remote = "ready"; draw(live.pane ? "pane" : document.activeElement === field() ? "field" : null); }, 900);
  }

  function selected() { return current().find(o => o.id === live.selectedId); }

  function openSelected() {
    const o = selected();
    if (!o) return;
    if (o.type === "direct") return say(`Would open <strong>${esc(o.parsed.label)}</strong> and close this window.`);
    const p = o.person;
    if (p.state === "offline") {
      if (!p.vods || !p.vods.length) return;
      live.pane = true; live.vodSel = live.vodSel ?? 0; draw("pane"); return;
    }
    say(`Would open <strong>${esc(p.name)}</strong>${p.state === "live" ? " live, with chat" : ""} and close this window.`);
  }

  function select(id) { live.selectedId = id; live.vodSel = 0; live.pane = false; }

  host.addEventListener("input", e => {
    if (e.target !== field()) return;
    live.query = e.target.value;
    select(null);
    say("");
    searchRemote();
    draw("field");
  });

  host.addEventListener("keydown", e => {
    const inPane = e.target.matches(".vods");
    if (inPane) {
      const o = selected();
      const n = o && o.person && o.person.vods ? o.person.vods.length : 0;
      if (e.key === "ArrowDown") { e.preventDefault(); live.vodSel = Math.min(n - 1, live.vodSel + 1); draw("pane"); }
      else if (e.key === "ArrowUp") { e.preventDefault(); live.vodSel = Math.max(0, live.vodSel - 1); draw("pane"); }
      else if (e.key === "Enter") { e.preventDefault(); const v = o.person.vods[live.vodSel]; say(`Would open <strong>${esc(o.person.name)}</strong>'s broadcast “${esc(v.title)}” with chat replay.`); }
      else if (e.key === "Escape" || (e.key === "Tab" && e.shiftKey)) { e.preventDefault(); live.pane = false; draw("field"); }
      return;
    }
    if (e.target !== field()) return;
    const opts = current();
    const i = Math.max(0, opts.findIndex(o => o.id === live.selectedId));
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!opts.length) return;
      select(opts[Math.min(opts.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)))].id);
      draw("field");
    } else if (e.key === "Enter") { e.preventDefault(); openSelected(); }
    else if (e.key === "Tab" && !e.shiftKey) {
      const o = selected();
      if (o && o.type === "person" && o.person.state === "offline" && o.person.vods && o.person.vods.length) { e.preventDefault(); live.pane = true; draw("pane"); }
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (live.query) { live.query = ""; select(null); clearTimeout(remoteTimer); say(""); draw("field"); }
      else { host.hidden = true; closed.hidden = false; closed.querySelector("button").focus(); say("Escape on an empty field closes the window."); }
    }
  });

  // Pointer: a click selects (the pane follows), a double-click or the Open button opens, as in a macOS list.
  host.addEventListener("click", e => {
    if (e.target.closest("[data-retry]")) { live.network = "ok"; syncControls(); searchRemote(); draw("field"); return; }
    if (e.target.closest(".clear")) { live.query = ""; select(null); draw("field"); return; }
    if (e.target.closest("[data-open]")) { openSelected(); return; }
    const vod = e.target.closest("[data-vod]");
    if (vod) { live.vodSel = Number(vod.dataset.vod); live.pane = true; draw("pane"); return; }
    const row = e.target.closest(".list [data-id]");
    if (row) { select(row.dataset.id); draw("field"); }
  });
  host.addEventListener("dblclick", e => {
    if (e.target.closest("[data-vod]")) { const o = selected(); const v = o.person.vods[live.vodSel]; say(`Would open <strong>${esc(o.person.name)}</strong>'s broadcast “${esc(v.title)}” with chat replay.`); return; }
    if (e.target.closest(".list [data-id]")) openSelected();
  });

  closed.querySelector("button").addEventListener("click", () => { closed.hidden = true; host.hidden = false; say(""); draw("field"); });

  const controls = { account: ["signedIn", { in: true, out: false }], net: ["network", { ok: "ok", offline: "offline", error: "error" }], history: ["history", { yes: true, no: false }] };
  function syncControls() {
    document.querySelectorAll("[data-ctl]").forEach(b => {
      const [key, map] = controls[b.dataset.ctl];
      b.setAttribute("aria-pressed", String(live[key] === map[b.dataset.val]));
    });
  }
  document.querySelectorAll("[data-ctl]").forEach(b => b.addEventListener("click", () => {
    const [key, map] = controls[b.dataset.ctl];
    live[key] = map[b.dataset.val];
    select(null);
    syncControls();
    searchRemote();
    draw(null);
  }));
  document.getElementById("replay").addEventListener("click", () => {
    if ((live.query || "").trim().length < 2) { live.query = "oh"; select(null); }
    searchRemote();
    draw(null);
    say("Twitch rows will fill the reserved group in about a second. Hover or select a row now and watch it stay put.");
  });

  document.querySelectorAll("[data-theme-set]").forEach(b => b.addEventListener("click", () => {
    const v = b.dataset.themeSet;
    if (v === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", v);
    document.querySelectorAll("[data-theme-set]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  }));

  syncControls();
  draw(null);
  gallery();
  sheets();
  // ?theme=light or ?theme=dark opens the page in that appearance (for review screenshots).
  const wanted = new URLSearchParams(location.search).get("theme");
  if (wanted) document.querySelector(`[data-theme-set="${wanted}"]`)?.click();
})();
