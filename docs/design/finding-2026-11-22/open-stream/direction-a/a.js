"use strict";
// Direction A: Quick list. One renderer draws the live window and every gallery frame from the same state.
(function () {
  const D = window.STREAMS_SAMPLE;

  const ICON = {
    mag: '<svg class="mag" viewBox="0 0 16 16" aria-hidden="true"><circle cx="6.8" cy="6.8" r="4.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.3 10.3 14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    clear: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="var(--window)" stroke-width="1.5" stroke-linecap="round"/></svg>',
    twitch: '<svg class="mark" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M3.2 1 1.8 3.8V13h3.3v2h1.8l2-2h2.7L15 9.6V1H3.2Zm10.3 7.9-1.9 1.9H8.8l-1.9 1.9v-1.9H3.6V2.5h9.9v6.4ZM10.2 4.6h1.4v3.6h-1.4V4.6Zm-3.5 0h1.4v3.6H6.7V4.6Z"/></svg>',
    youtube: '<svg class="mark" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M15.3 4.3a2 2 0 0 0-1.4-1.4C12.7 2.6 8 2.6 8 2.6s-4.7 0-5.9.3A2 2 0 0 0 .7 4.3C.4 5.5.4 8 .4 8s0 2.5.3 3.7a2 2 0 0 0 1.4 1.4c1.2.3 5.9.3 5.9.3s4.7 0 5.9-.3a2 2 0 0 0 1.4-1.4c.3-1.2.3-3.7.3-3.7s0-2.5-.3-3.7ZM6.5 10.4V5.6L10.6 8l-4.1 2.4Z"/></svg>',
    info: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 7.2v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="4.9" r=".95" fill="currentColor"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 1.8 6.8 5 3.5 8.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    link: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.6 9.4 9.4 6.6M7.2 4.4l1.1-1.1a2.6 2.6 0 0 1 3.7 3.7l-1.1 1.1M8.8 11.6l-1.1 1.1A2.6 2.6 0 0 1 4 9l1.1-1.1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    noNet: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.8 6.2a9 9 0 0 1 12.4 0M4 8.6a5.8 5.8 0 0 1 8 0M6.3 11a2.4 2.4 0 0 1 3.4 0" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M2.5 2.5l11 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    alert: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8 15 14H1L8 1.8Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 6.3v3.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11.8" r=".9" fill="currentColor"/></svg>'
  };

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const hue = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

  // No history yet: signed-in follows, live first, then newest follow first (spec §3: live splits; follow date orders).
  const FOLLOW_REASONS = { sable_rr: "Followed last week", kestrel_vt: "Followed in March", ohnepixel: "Followed in 2024" };
  function followsOnly() {
    return ["kestrel_vt", "ohnepixel", "sable_rr"].map(login => {
      const p = D.people.find(x => x.login === login);
      return Object.assign({}, p, { reason: FOLLOW_REASONS[login] });
    });
  }

  // The options, in order, for a state. Each option is {id, type, person|vod|direct, group}.
  function model(st) {
    const q = (st.query || "").trim();
    const out = { local: [], remote: [], direct: null, slot: null };
    if (D.isURL(q)) {
      const parsed = D.parse(q);
      out.direct = parsed ? { type: "direct", id: "direct", parsed } : null;
      return out;
    }
    const people = st.history ? D.local(q, st.signedIn) : (st.signedIn && !q ? followsOnly() : []);
    out.local = people.map(p => ({ type: "person", id: p.login, person: p, group: "local" }));
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

  // Flattened navigable options, including the broadcasts of an expanded offline person.
  function options(st, m) {
    const list = [];
    if (m.direct && !m.local.length) list.push(m.direct);
    const add = o => {
      list.push(o);
      if (o.type === "person" && st.expanded.has(o.id) && o.person.vods && st.vodState[o.id] !== "loading") {
        o.person.vods.forEach((v, i) => list.push({ type: "vod", id: o.id + "/v" + i, vod: v, owner: o.person, index: i }));
      }
    };
    m.local.forEach(add);
    m.remote.forEach(add);
    return list;
  }

  function personLive(p, st) {
    // With no connection, live status can't refresh: the dot becomes the hollow "unknown" ring.
    if (st.network === "offline" && p.state === "live") return Object.assign({}, p, { state: "unknown", staleTitle: true });
    return p;
  }

  function rowHTML(o, st, prefix, pos, size) {
    const p = personLive(o.person, st);
    const sel = st.selectedId === o.id;
    const isOffline = p.state === "offline";
    const expanded = isOffline && st.expanded.has(o.id);
    let sub = "", meta = "", tip = p.reason;
    if (p.state === "live") {
      sub = esc(p.category) + " · " + esc(p.title);
      meta = D.compact(p.viewers);
      tip = p.reason + "\n" + p.title;
    } else if (isOffline) {
      sub = p.vods && p.vods.length ? esc(p.vods[0].title) : "";
      meta = D.ago(p.lastLive) + " " + ICON.chev;
      tip = p.reason + "\nLast live " + D.agoLong(p.lastLive);
    } else if (p.state === "unknown") {
      // Stale: the last-known title stays, the viewer count goes (it would be a guess).
      if (p.staleTitle) sub = esc(p.category) + " · " + esc(p.title);
      tip = p.reason + "\nStatus unavailable";
    }
    const dot = p.state === "live" ? '<span class="dot"></span>' : p.state === "unknown" ? '<span class="dot unknown"></span>' : "";
    const hover = st.forceHover === o.id ? " show-tail" : "";
    const reason = st.reasonFor === o.id ? `<div class="reason" role="tooltip" id="${prefix}-reason">${esc(p.reason)}</div>` : "";
    return `<div class="row${p.state === "unknown" ? " error-row" : ""}${hover}" role="option" id="${prefix}-${o.id}" data-id="${o.id}"
      aria-selected="${sel}" aria-posinset="${pos}" aria-setsize="${size}" aria-label="${esc(D.spoken(p))}"
      aria-description="${esc(p.reason)}" ${isOffline ? `aria-expanded="${expanded}"` : ""} title="${esc(tip)}"
      style="${st.forceHover === o.id && !sel ? "background:var(--hover)" : ""}">
      <span class="av" style="--av:hsl(${hue(p.login)} 34% 34%)">${esc(p.name[0].toUpperCase())}${dot}</span>
      <span class="name">${esc(p.name)}</span>${p.platform === "youtube" ? ICON.youtube : ICON.twitch}
      <span class="sub">${sub}</span>
      <span class="meta">${meta}</span>
      <span class="tail"><button type="button" tabindex="-1" data-info="${o.id}" aria-label="Why ${esc(p.name)} is here" title="Why it's here (⌘I)">${ICON.info}</button></span>
      ${reason}
    </div>`;
  }

  function vodsHTML(o, st, prefix, opts) {
    const p = o.person;
    if (!st.expanded.has(o.id) || p.state !== "offline") return "";
    const vs = st.vodState[o.id];
    if (vs === "loading") return `<div class="vods" role="group"><div class="busy" role="status" aria-label="Loading recent broadcasts"><span class="ring"></span></div></div>`;
    if (vs === "error") return `<div class="vods" role="group"><div class="none" role="status">Recent broadcasts unavailable</div></div>`;
    if (!p.vods || !p.vods.length) return `<div class="vods" role="group"><div class="none" role="status">No recent broadcasts</div></div>`;
    const items = p.vods.map((v, i) => {
      const id = o.id + "/v" + i;
      const pos = opts.findIndex(x => x.id === id) + 1;
      return `<div class="vod" role="option" id="${prefix}-${id.replace("/", "-")}" data-id="${id}" aria-selected="${st.selectedId === id}"
        aria-posinset="${pos}" aria-setsize="${opts.length}"
        aria-label="${esc("Broadcast, " + v.title + ", " + D.date(v.at) + ", " + D.length(v.seconds))}" title="${esc(v.title)}">
        <span class="vtitle">${esc(v.title)}</span><span class="vmeta">${D.date(v.at)}</span><span class="vmeta">${D.length(v.seconds)}</span></div>`;
    }).join("");
    return `<div class="vods" role="group" aria-label="Recent broadcasts, ${esc(p.name)}">${items}</div>`;
  }

  function directHTML(o, st, prefix, pos, size) {
    const sel = st.selectedId === o.id;
    const mark = o.parsed.platform === "youtube" ? ICON.youtube : ICON.twitch;
    return `<div class="row direct" role="option" id="${prefix}-direct" data-id="direct" aria-selected="${sel}"
      aria-posinset="${pos}" aria-setsize="${size}" aria-label="${esc("Open " + o.parsed.label)}">
      <span class="glyph">${D.isURL(st.query) ? ICON.link : mark}</span>
      <span class="val">${esc(o.parsed.label)}</span><kbd>↩</kbd></div>`;
  }

  function slotHTML(slot) {
    if (slot === "loading") return `<div class="row skeleton shimmer" role="status" aria-label="Searching Twitch"><span class="av"></span><span class="bar" style="width:90px"></span><span></span><span class="bar" style="width:70%"></span><span></span><span></span></div>`;
    if (slot === "offline") return `<div class="slot-msg" role="status">${ICON.noNet}<span>No connection</span></div>`;
    if (slot === "error") return `<div class="slot-msg err" role="status">${ICON.alert}<span>Twitch didn't respond</span><button type="button" data-retry tabindex="-1">Retry</button></div>`;
    return "";
  }

  function render(host, st, prefix, interactive) {
    const m = model(st);
    const opts = options(st, m);
    if (!opts.some(o => o.id === st.selectedId)) st.selectedId = opts.length ? opts[0].id : null;
    const size = opts.length;
    const posOf = id => opts.findIndex(o => o.id === id) + 1;
    let list = "";
    if (m.direct && !m.local.length) list += directHTML(m.direct, st, prefix, posOf("direct"), size);
    if (m.local.length) list += `<div role="group" aria-label="Your People">` + m.local.map(o => rowHTML(o, st, prefix, posOf(o.id), size) + vodsHTML(o, st, prefix, opts)).join("") + `</div>`;
    const remoteBody = m.slot ? slotHTML(m.slot) : m.remote.map(o => rowHTML(o, st, prefix, posOf(o.id), size) + vodsHTML(o, st, prefix, opts)).join("");
    if (remoteBody) list += (list ? `<div class="divider" role="separator"></div>` : "") + `<div role="group" aria-label="Twitch search">${remoteBody}</div>`;
    const active = st.selectedId ? `${prefix}-${st.selectedId.replace("/", "-")}` : "";
    host.innerHTML = `
      <div class="titlebar" aria-hidden="true"><span class="lights"><i></i><i></i><i></i></span><span class="t">Open Stream</span><span></span></div>
      <div class="content">
        <div class="field">${ICON.mag}
          <input type="text" role="combobox" aria-label="Channel or URL" placeholder="Channel or URL" spellcheck="false" autocomplete="off"
            aria-autocomplete="list" aria-controls="${prefix}-list" aria-expanded="${size > 0}" aria-activedescendant="${active}"
            value="${esc(st.query)}" ${interactive ? "" : 'tabindex="-1" readonly'}>
          <button type="button" class="clear" aria-label="Clear" tabindex="-1" ${st.query ? "" : "hidden"}>${ICON.clear}</button>
        </div>
        <div class="list" role="listbox" id="${prefix}-list" aria-label="Suggestions">${list}</div>
      </div>`;
  }

  // ---------- Static gallery ----------
  function base(over) {
    return Object.assign({ query: "", signedIn: true, history: true, network: "ok", remote: "ready", selectedId: null,
      expanded: new Set(), vodState: {}, reasonFor: null, forceHover: null }, over);
  }

  const FRAMES = [
    { s: base({}), cap: "<b>Empty field: top People.</b> Ranked by local history (frecency). mira_plays (1.2K viewers) sits above kestrel_vt (31.2K): viewers are shown, never the sort key. dunewalker's hollow ring means its status couldn't be read." },
    { s: base({ history: false }), cap: "<b>No history yet, signed in (J1).</b> Followed channels until history exists: live first, then by follow date, newest first." },
    { s: base({ history: false, signedIn: false }), cap: "<b>No history yet, signed out (J1).</b> The field alone, as today. Typing still reaches Twitch search (anonymous GQL, D-034)." },
    { s: base({ query: "oh", remote: "loading" }), cap: "<b>Typing “oh”, Twitch search pending.</b> Local matches appear at once; a skeleton row holds the remote slot below a hairline." },
    { s: base({ query: "oh", selectedId: "ohayo_nori", forceHover: "ohnepixel" }), cap: "<b>Typing “oh”, remote rows arrived.</b> They were appended under the hairline. The keyboard selection (ohayo_nori) and the hovered row (Ohnepixel) did not move." },
    { s: base({ query: "oh", selectedId: "ohayo_nori/v0", expanded: new Set(["ohayo_nori"]) }), cap: "<b>Offline match expanded (J4).</b> Return or → on ohayo_nori opens its recent broadcasts inline; the first is selected, and Return plays it with chat replay." },
    { s: base({ query: "oh", selectedId: "ohayo_nori", expanded: new Set(["ohayo_nori"]), vodState: { ohayo_nori: "loading" } }), cap: "<b>Broadcasts loading.</b> Today's busy ring, in place of the rows." },
    { s: base({ query: "https://www.twitch.tv/videos/2291834470" }), cap: "<b>Pasted URL.</b> One row with the parsed address; Return opens it. No suggestions compete with a URL." },
    { s: base({ query: "zzq9" }), cap: "<b>No match.</b> No person rows; the typed name is still offered as a Twitch channel, as today's parser treats a bare name. Twitch search found nothing, so nothing is drawn below." },
    { s: base({ query: "oh", signedIn: false }), cap: "<b>Signed out.</b> The same local order; ohana_vee, known only from Twitch follows, is absent; signed in, ohana_vee would rank after ohayo_nori. Remote rows come from anonymous GQL search." },
    { s: base({ query: "oh", network: "offline" }), cap: "<b>No network connection.</b> Local rows stay usable; live dots turn to hollow rings because status can't refresh. The remote slot says so once." },
    { s: base({ query: "oh", network: "error" }), cap: "<b>Twitch error.</b> The remote slot shows the error and Retry; local rows are untouched." },
    { s: base({ query: "", reasonFor: "mira_plays", selectedId: "mira_plays" }), cap: "<b>Why it's here, on demand.</b> The info button on the selected or hovered row, or ⌘I, shows the reason. It is also the row's tooltip and VoiceOver description." }
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
    });
  }

  // ---------- Person-row sheet: every row state, light and dark ----------
  function sheets() {
    const people = Object.fromEntries(D.people.map(p => [p.login, p]));
    const rows = [
      ["Live", base({}), "ohnepixel", null],
      ["Offline", base({}), "ohayo_nori", null],
      ["Loading", null],
      ["Error", base({}), "dunewalker", null],
      ["Selected", base({ selectedId: "mira_plays" }), "mira_plays", null],
      ["Hover", base({ forceHover: "kestrel_vt", selectedId: "none" }), "kestrel_vt", null],
      ["Expanded", base({ selectedId: "ohayo_nori", expanded: new Set(["ohayo_nori"]) }), "ohayo_nori", null]
    ];
    ["force-light", "force-dark"].forEach((theme, t) => {
      const sheet = document.createElement("div");
      sheet.className = "sheet inert " + theme;
      sheet.setAttribute("aria-hidden", "true");
      const dl = document.createElement("dl");
      rows.forEach(([label, st, login]) => {
        const dt = document.createElement("dt");
        dt.textContent = label;
        const dd = document.createElement("dd");
        if (!st) dd.innerHTML = slotHTML("loading");
        else {
          const o = { type: "person", id: login, person: people[login] };
          dd.innerHTML = rowHTML(o, st, "s" + t, 1, 1) + (label === "Expanded" ? vodsHTML(o, st, "s" + t, [o]) : "");
        }
        dl.append(dt, dd);
      });
      sheet.append(dl);
      document.getElementById("rows").append(sheet);
    });
  }

  // ---------- Live window ----------
  const live = base({ remote: "ready" });
  let remoteTimer = 0;
  const host = document.getElementById("live");
  const closed = document.getElementById("closed");
  const outcome = document.getElementById("outcome");

  function say(html) { outcome.innerHTML = html; }

  function draw(keepFocus) {
    const caret = keepFocus ? host.querySelector("input")?.selectionStart : null;
    render(host, live, "L", true);
    const input = host.querySelector("input");
    if (keepFocus) {
      input.focus();
      if (caret !== null) input.setSelectionRange(caret, caret);
    }
    const sel = host.querySelector('[aria-selected="true"]');
    if (sel) sel.scrollIntoView({ block: "nearest" });
  }

  function searchRemote() {
    clearTimeout(remoteTimer);
    if ((live.query || "").trim().length < 2) return;
    live.remote = "loading";
    remoteTimer = setTimeout(() => { live.remote = "ready"; draw(document.activeElement === host.querySelector("input")); }, 900);
  }

  function current() {
    const m = model(live);
    return options(live, m);
  }

  function openOption(o) {
    if (!o) return;
    if (o.type === "direct") return say(`Would open <strong>${esc(o.parsed.label)}</strong> and close this window.`);
    if (o.type === "vod") return say(`Would open <strong>${esc(o.owner.name)}</strong>'s broadcast “${esc(o.vod.title)}” with chat replay.`);
    const p = personLive(o.person, live);
    if (p.state === "offline") return expand(o.id, true);
    say(`Would open <strong>${esc(p.name)}</strong>${p.state === "live" ? " live, with chat" : ""} and close this window.`);
  }

  function expand(id, selectFirst) {
    live.expanded.add(id);
    const p = current().find(o => o.id === id)?.person;
    if (selectFirst && p && p.vods && p.vods.length) live.selectedId = id + "/v0";
    draw(true);
  }

  function collapse(id) {
    live.expanded.delete(id);
    live.selectedId = id;
    draw(true);
  }

  function move(delta) {
    const opts = current();
    if (!opts.length) return;
    const i = Math.max(0, opts.findIndex(o => o.id === live.selectedId));
    live.selectedId = opts[Math.min(opts.length - 1, Math.max(0, i + delta))].id;
    live.reasonFor = null;
    draw(true);
  }

  host.addEventListener("input", e => {
    if (e.target.tagName !== "INPUT") return;
    live.query = e.target.value;
    live.selectedId = null;
    live.expanded.clear();
    live.reasonFor = null;
    say("");
    searchRemote();
    draw(true);
  });

  host.addEventListener("keydown", e => {
    if (e.target.tagName !== "INPUT") return;
    const opts = current();
    const sel = opts.find(o => o.id === live.selectedId);
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") { e.preventDefault(); openOption(sel); }
    else if (e.key === "ArrowRight" && sel && sel.type === "person" && sel.person.state === "offline" && e.target.selectionStart === e.target.value.length) { e.preventDefault(); expand(sel.id, false); }
    else if (e.key === "ArrowLeft" && sel && (sel.type === "vod" || live.expanded.has(sel.id)) && e.target.selectionStart === e.target.value.length) { e.preventDefault(); collapse(sel.type === "vod" ? sel.owner.login : sel.id); }
    else if (e.key === "Tab" && !e.shiftKey && sel) {
      // Tab reaches the broadcast list: the selected offline person's, or the first expanded one.
      const owner = sel.type === "person" && sel.person.state === "offline" ? sel.id : [...live.expanded][0];
      if (owner && sel.type !== "vod") { e.preventDefault(); expand(owner, true); }
    }
    else if (e.key === "Tab" && e.shiftKey && sel && sel.type === "vod") { e.preventDefault(); live.selectedId = sel.owner.login; draw(true); }
    else if (e.key === "i" && e.metaKey && sel && sel.type === "person") { e.preventDefault(); live.reasonFor = live.reasonFor === sel.id ? null : sel.id; draw(true); }
    else if (e.key === "Escape") {
      e.preventDefault();
      if (live.reasonFor) { live.reasonFor = null; draw(true); }
      else if (live.query) { live.query = ""; live.selectedId = null; live.expanded.clear(); clearTimeout(remoteTimer); say(""); draw(true); }
      else { host.hidden = true; closed.hidden = false; closed.querySelector("button").focus(); say("Escape on an empty field closes the window."); }
    }
  });

  host.addEventListener("click", e => {
    const info = e.target.closest("[data-info]");
    if (info) { live.selectedId = info.dataset.info; live.reasonFor = live.reasonFor === info.dataset.info ? null : info.dataset.info; draw(true); return; }
    if (e.target.closest("[data-retry]")) { live.network = "ok"; syncControls(); searchRemote(); draw(true); return; }
    if (e.target.closest(".clear")) { live.query = ""; live.selectedId = null; live.expanded.clear(); draw(true); return; }
    const row = e.target.closest("[data-id]");
    if (!row) return;
    const o = current().find(x => x.id === row.dataset.id);
    live.selectedId = o.id;
    if (o.type === "person" && o.person.state === "offline") {
      live.expanded.has(o.id) ? collapse(o.id) : expand(o.id, false);
    } else { draw(true); openOption(o); }
  });

  closed.querySelector("button").addEventListener("click", () => { closed.hidden = true; host.hidden = false; say(""); draw(true); });

  // Scenario controls.
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
    live.selectedId = null;
    syncControls();
    searchRemote();
    draw(false);
  }));
  document.getElementById("replay").addEventListener("click", () => {
    if ((live.query || "").trim().length < 2) { live.query = "oh"; live.selectedId = null; }
    searchRemote();
    draw(false);
    say("Twitch rows will land below the hairline in about a second. Hover or select a row now and watch it stay put.");
  });

  // Theme switch for the whole page.
  document.querySelectorAll("[data-theme-set]").forEach(b => b.addEventListener("click", () => {
    const v = b.dataset.themeSet;
    if (v === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", v);
    document.querySelectorAll("[data-theme-set]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  }));

  syncControls();
  draw(false);
  gallery();
  sheets();
  // ?theme=light or ?theme=dark opens the page in that appearance (for review screenshots).
  const wanted = new URLSearchParams(location.search).get("theme");
  if (wanted) document.querySelector(`[data-theme-set="${wanted}"]`)?.click();
})();
