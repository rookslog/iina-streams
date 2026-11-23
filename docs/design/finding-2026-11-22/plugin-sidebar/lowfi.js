"use strict";
// Shared helpers for the low-fidelity structures. Data: ../open-stream/sample-data.js, plus the few extra
// sample VODs below (live people's past broadcasts and half-watched VODs). All invented. No network.
window.LowFi = (function () {
  const D = window.STREAMS_SAMPLE;
  const NOW = Date.parse("2026-11-22T22:00:00-05:00");
  const day = 86400000;

  // Live people's earlier broadcasts, so VODs are reachable for live people too (brief, Reuse).
  const EXTRA_VODS = {
    ohnepixel: [
      { title: "Major day 3 watch party", at: NOW - 1 * day, seconds: 21400 },
      { title: "Trade-ups until 3 a.m.", at: NOW - 3 * day, seconds: 16200 },
      { title: "Inventory review with chat", at: NOW - 5 * day, seconds: 11800 }
    ],
    mira_plays: [{ title: "Silksong attempt 13", at: NOW - 1 * day, seconds: 12900 }],
    kestrel_vt: [{ title: "Character sheets, part 2", at: NOW - 2 * day, seconds: 9300 }]
  };
  // Half-watched VODs: person, VOD, fraction watched (a "continue watching" candidate).
  const CONTINUE = [
    { login: "ohayo_nori", vod: 3, watched: 0.42 },
    { login: "ohnepixel", vod: 0, watched: 0.18 }
  ];
  const NOW_PLAYING = "ohnepixel";

  const byLogin = login => D.people.find(p => p.login === login) || D.remoteFor("oh").find(p => p.login === login);
  const vodsOf = p => (p.vods && p.vods.length ? p.vods : EXTRA_VODS[p.login] || []);

  function status(text) {
    const el = document.getElementById("status");
    if (el) el.textContent = text;
  }

  // The person row: avatar with live dot, name, one secondary line, viewers or time since last live, and a
  // VODs disclosure. No reason text (operator feedback, ../open-stream/README.md).
  function row(p) {
    const wrap = document.createElement("div");
    wrap.className = "person";
    const go = document.createElement("button");
    go.className = "go";
    go.type = "button";
    go.setAttribute("aria-label", D.spoken(p));
    const sub = p.state === "live" ? p.category + " · " + p.title : (vodsOf(p)[0] || {}).title || "";
    const meta = p.state === "live" ? D.compact(p.viewers) : p.state === "offline" ? D.ago(p.lastLive) : "";
    go.innerHTML = `<span class="av ${p.state}" aria-hidden="true">${p.name[0].toUpperCase()}</span>
      <span class="nm"></span><span class="sub"></span><span class="meta">${meta}</span>`;
    go.querySelector(".nm").textContent = p.name;
    go.querySelector(".sub").textContent = sub;
    go.addEventListener("click", () => status(p.state === "offline" ? "Offline: showing " + p.name + "'s VODs." : "Would switch this window to " + p.name + "."));
    const vb = document.createElement("button");
    vb.className = "vodbtn";
    vb.type = "button";
    vb.textContent = "›";
    vb.setAttribute("aria-expanded", "false");
    vb.setAttribute("aria-label", "VODs, " + p.name);
    const list = vodList(p);
    list.hidden = true;
    vb.addEventListener("click", () => {
      list.hidden = !list.hidden;
      vb.setAttribute("aria-expanded", String(!list.hidden));
    });
    go.addEventListener("click", () => { if (p.state === "offline") { list.hidden = false; vb.setAttribute("aria-expanded", "true"); } });
    wrap.append(go, vb, list);
    return wrap;
  }

  function vodList(p, limit) {
    const ul = document.createElement("ul");
    ul.className = "vods";
    ul.setAttribute("aria-label", "VODs, " + p.name);
    const vods = vodsOf(p).slice(0, limit || 5);
    if (!vods.length) {
      const li = document.createElement("li");
      li.className = "dim";
      li.textContent = "No recent broadcasts";
      ul.append(li);
    }
    vods.forEach(v => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.innerHTML = `<span class="t"></span><span class="meta">${D.date(v.at)} · ${D.length(v.seconds)}</span>`;
      b.querySelector(".t").textContent = v.title;
      b.addEventListener("click", () => status("Would switch this window to " + p.name + "'s VOD “" + v.title + "”, with chat replay."));
      li.append(b);
      ul.append(li);
    });
    return ul;
  }

  function continueRow(c) {
    const p = byLogin(c.login);
    const v = vodsOf(p)[c.vod];
    const b = document.createElement("button");
    b.type = "button";
    b.className = "go";
    b.style.cssText = "display:grid;grid-template-columns:20px minmax(0,1fr) auto;gap:7px;width:100%;border:0;background:none;text-align:left;padding:4px;border-radius:6px";
    b.innerHTML = `<span class="av" aria-hidden="true">${p.name[0].toUpperCase()}</span><span class="sub" style="color:var(--fg)"></span><span class="meta">${Math.round(c.watched * 100)}%</span><span class="bar" aria-hidden="true"><i style="width:${c.watched * 100}%"></i></span>`;
    b.querySelector(".sub").textContent = p.name + " · " + v.title;
    b.setAttribute("aria-label", p.name + ", " + v.title + ", " + Math.round(c.watched * 100) + " percent watched");
    b.addEventListener("click", () => status("Would resume " + p.name + "'s VOD “" + v.title + "” where you stopped."));
    return b;
  }

  // People in shared-ranking order (sample order), split live first. The playing channel is left out.
  function people(signedIn) {
    const all = D.local("", signedIn !== false).filter(p => p.login !== NOW_PLAYING);
    return { live: all.filter(p => p.state === "live"), rest: all.filter(p => p.state !== "live") };
  }

  // Search: Quick Open's matching. Local matches first, then Twitch search results, in one list.
  function search(q) {
    q = (q || "").trim();
    if (!q) return [];
    return D.local(q, true).concat(D.remoteFor(q));
  }

  function categories() {
    const map = new Map();
    D.people.concat(D.remoteFor("oh")).filter(p => p.state === "live").forEach(p => {
      if (!map.has(p.category)) map.set(p.category, []);
      map.get(p.category).push(p);
    });
    return [...map.entries()];
  }

  // Wire a search field to a results container; hide `others` while searching.
  function wireSearch(input, results, others) {
    input.addEventListener("input", () => {
      const hits = search(input.value);
      results.replaceChildren(...hits.map(row));
      if (input.value.trim() && !hits.length) results.innerHTML = '<p class="dim" style="margin:6px">No match</p>';
      results.hidden = !input.value.trim();
      others.forEach(el => { el.hidden = !!input.value.trim(); });
    });
    input.addEventListener("keydown", e => {
      if (e.key === "Escape" && input.value) { input.value = ""; input.dispatchEvent(new Event("input")); }
    });
  }

  function widthSwitch() {
    document.querySelectorAll("[data-width]").forEach(b => b.addEventListener("click", () => {
      document.querySelector(".panel").classList.toggle("w300", b.dataset.width === "300");
      document.querySelectorAll("[data-width]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    }));
  }

  return { D, NOW_PLAYING, CONTINUE, byLogin, vodsOf, row, vodList, continueRow, people, search, categories, wireSearch, widthSwitch, status };
})();
