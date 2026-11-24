"use strict";
// Direction Q: Round 2 rebuilt at shared macOS polish on ../shared/ data and base.css.
(function () {
  const S = window.SNAPSHOT;
  const V = window.VIEWER;
  const U = window.U;
  const $ = id => document.getElementById(id);
  const DATE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

  const state = {
    mode: "default",      // "default" | "signed-out" | "new" | "many"
    hashOverride: null,
    signedIn: V.signedIn,
    playing: { ...V.playing },
    people: [],
    byLogin: new Map(),
    unfinished: [],
    current: null,        // person open in channel view, or null
    selectedEl: null,
    textSize: 14,
    forgotten: new Set(),
    historyCleared: false
  };

  function el(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === "class") node.className = v;
        else if (k === "text") node.textContent = v;
        else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? "" : String(v));
      }
    }
    for (const kid of kids) {
      if (kid != null) node.append(kid);
    }
    return node;
  }

  function formatDate(iso) {
    return DATE_FMT.format(Date.parse(iso));
  }

  function expandManyPeople() {
    const base = U.ranked;
    const out = [];
    for (let copy = 0; copy < 22; copy++) {
      for (const p of base) {
        if (copy === 0) {
          out.push(p);
        } else {
          const suffix = String(copy + 1);
          out.push({
            ...p,
            login: p.login + "-" + suffix,
            name: p.name + " " + suffix
          });
        }
      }
    }
    return out;
  }

  function hasHistory(login) {
    return V.lastVisitDaysAgo[login] != null;
  }

  function currentHash() {
    if (state.hashOverride != null) return state.hashOverride.toLowerCase();
    if (location.hash) return location.hash.toLowerCase();
    try {
      if (window.parent && window.parent !== window) {
        return (window.parent.location.hash || "").toLowerCase();
      }
    } catch (_) {}
    return "";
  }

  function applyHash() {
    const hash = currentHash();
    state.current = null;
    state.forgotten.clear();
    state.historyCleared = false;

    if (hash === "#signed-out") {
      state.mode = "signed-out";
      state.signedIn = false;
      state.people = U.ranked.filter(p => hasHistory(p.login));
      state.unfinished = U.unfinished();
    } else if (hash === "#new") {
      state.mode = "new";
      state.signedIn = false;
      state.people = S.people.slice();
      state.unfinished = [];
    } else if (hash === "#many") {
      state.mode = "many";
      state.signedIn = true;
      state.people = expandManyPeople();
      state.unfinished = U.unfinished();
    } else {
      state.mode = "default";
      state.signedIn = true;
      state.people = U.ranked.slice();
      state.unfinished = U.unfinished();
    }

    state.byLogin = new Map(S.people.map(p => [p.login, p]));
    for (const p of state.people) state.byLogin.set(p.login, p);

    $("q").value = "";
    renderAll();

    if (hash === "#channel") {
      const target = personFor(state.playing.login) || state.people[0];
      if (target) openChannel(target);
    } else if (hash === "#offline") {
      const off = state.people.find(p => !p.live);
      if (off) openChannel(off);
    } else if (hash === "#new") {
      $("q").focus();
    }
  }

  function personFor(login) {
    return state.byLogin.get(login) || U.person(login);
  }

  function qualityLabel(q) {
    const list = V.qualities;
    if (list.includes(q)) return q;
    return list.find(item => item.includes(q)) || list[0];
  }

  function renderPlaying() {
    const p = personFor(state.playing.login) || S.people[0];
    const isVod = state.playing.kind === "vod" && state.playing.vod != null;
    const v = isVod ? p.vods[state.playing.vod] : null;
    const summary = $("playing");
    summary.replaceChildren();

    if (v) {
      summary.title = p.name + " — " + v.title;
      summary.append(
        el("span", { class: "name", text: p.name + " · " + v.title }),
        el("span", { class: "meta num", text: U.duration(v.seconds) })
      );
    } else {
      summary.title = p.title || p.name;
      summary.append(
        el("span", { class: "pill", text: "LIVE" }),
        el("span", { class: "name", text: p.name }),
        el("span", { class: "meta num", text: U.compact(p.viewers) })
      );
    }

    const sel = $("quality");
    if (!sel.options.length) {
      for (const q of V.qualities) sel.append(el("option", { value: q, text: q }));
    }
    sel.value = qualityLabel(state.playing.quality);

    const forget = $("forget");
    forget.textContent = "Forget " + p.name;
    forget.disabled = state.mode === "new" || state.historyCleared || state.forgotten.has(p.login);
  }

  function renderTwitch() {
    const host = $("twitch-body");
    host.replaceChildren();
    if (state.signedIn) {
      host.append(el("div", { class: "line" },
        el("span", { class: "grow handle", text: "you_handle" }),
        el("button", {
          class: "btn",
          type: "button",
          text: "Sign out",
          onclick: () => {
            state.signedIn = false;
            if (state.mode === "default") {
              state.people = U.ranked.filter(p => hasHistory(p.login));
              renderLists();
            }
            renderTwitch();
          }
        })
      ));
    } else {
      host.append(el("div", { class: "line" },
        el("button", {
          class: "btn primary",
          type: "button",
          text: "Sign in with Twitch",
          onclick: () => {
            state.signedIn = true;
            if (state.mode !== "new") {
              state.people = state.mode === "many" ? expandManyPeople() : U.ranked.slice();
              state.byLogin = new Map(state.people.map(p => [p.login, p]));
              renderLists();
            }
            renderTwitch();
          }
        })
      ));
    }
  }

  function vodThumbSrc(owner, v, vodIndex) {
    if (v.thumb) return "../shared/" + v.thumb;
    if (vodIndex === 0 && owner.live && owner.preview) return "../shared/" + owner.preview;
    return null;
  }

  function vodButton(v, owner, vodIndex, showOwner) {
    const frac = U.progressOf(owner.login, vodIndex);
    const showNew = !showOwner && U.isNew(owner.login, v.at);
    const len = U.duration(v.seconds);
    const dateStr = formatDate(v.at);
    const pctText = frac != null ? ", " + Math.round(frac * 100) + "% watched" : "";
    const label = (showOwner ? owner.name + ", " : "") + v.title + ", " + dateStr + ", " + len + pctText + (showNew ? ", new" : "");
    const src = vodThumbSrc(owner, v, vodIndex);

    const thumbWrap = el("span", { class: "thumb-wrap" + (frac != null ? " has-progress" : ""), "aria-hidden": "true" },
      src ? el("img", { class: "thumb", src, alt: "" }) : null,
      el("span", { class: "len num", text: len }),
      frac != null ? el("span", { class: "progress" }, el("i", { style: "width:" + (frac * 100) + "%" })) : null
    );

    const titleNode = showOwner
      ? el("span", { class: "vod-title-text" }, el("span", { class: "who", text: owner.name + " " }), v.title)
      : el("span", { class: "vod-title-text", text: v.title });

    const btn = el("button", {
      type: "button",
      class: "row vod",
      "aria-label": label,
      "aria-selected": "false",
      title: v.title,
      onclick: () => playAndClose(owner.login, vodIndex)
    },
      thumbWrap,
      el("span", { class: "vod-text" },
        el("span", { class: "vod-title-line" },
          showNew ? el("span", { class: "newdot", title: "New" }) : null,
          titleNode
        ),
        el("span", { class: "meta num", text: dateStr })
      )
    );
    return btn;
  }

  function personRow(p) {
    const sub = p.live
      ? (p.category ? p.category + " · " + p.title : p.title)
      : ((p.vods[0] && p.vods[0].title) || "");
    const trailing = p.live ? U.compact(p.viewers) : U.ago(p.lastLive);
    const stateWord = p.live ? "live, " + trailing + " viewers" : "offline, " + trailing;
    const label = p.name + ", " + stateWord + (sub ? ", " + sub : "");

    return el("button", {
      type: "button",
      class: "row",
      "aria-label": label,
      "aria-selected": "false",
      title: p.live ? p.title : sub,
      onclick: () => openChannel(p)
    },
      el("img", { class: "avatar " + (p.live ? "live" : "offline"), src: "../shared/" + p.avatar, alt: "" }),
      el("span", { class: "text" },
        el("span", { class: "row-top" },
          el("span", { class: "name", text: p.name }),
          el("span", { class: "meta num", text: trailing })
        ),
        el("span", { class: "meta row-sub", text: sub })
      )
    );
  }

  function renderCapped(host, list, limit) {
    const frag = document.createDocumentFragment();
    list.slice(0, limit).forEach(p => frag.append(personRow(p)));
    if (list.length > limit) {
      const more = el("button", {
        type: "button",
        class: "more",
        text: "Show more",
        onclick: () => {
          const rest = document.createDocumentFragment();
          list.slice(limit).forEach(p => rest.append(personRow(p)));
          host.insertBefore(rest, more);
          more.remove();
        }
      });
      frag.append(more);
    }
    host.replaceChildren(frag);
  }

  function renderLists() {
    const contHost = $("cont");
    const contList = state.historyCleared
      ? []
      : state.unfinished.filter(u => !state.forgotten.has(u.login));
    $("sec-cont").hidden = contList.length === 0;
    contHost.replaceChildren(...contList.map(u => vodButton(u.video, u.person, u.vod, true)));

    const visible = state.people.filter(p => p.login !== state.playing.login);
    const live = visible.filter(p => p.live);
    const offline = state.mode === "new" ? [] : visible.filter(p => !p.live);

    $("sec-live").hidden = live.length === 0;
    renderCapped($("live"), live, 5);

    $("sec-off").hidden = offline.length === 0;
    renderCapped($("off"), offline, 3);

    updateSearch();
  }

  function searchMatches(term) {
    const q = term.toLowerCase();
    const starts = [];
    const contains = [];
    for (const p of state.people) {
      const name = p.name.toLowerCase();
      const login = p.login.toLowerCase();
      if (name.startsWith(q) || login.startsWith(q)) starts.push(p);
      else if (name.includes(q) || login.includes(q)) contains.push(p);
    }
    return starts.concat(contains);
  }

  function updateSearch() {
    const input = $("q");
    const term = input.value.trim();
    const results = $("results");
    const lists = $("lists");
    const count = $("q-count");
    const wrap = input.parentElement;

    if (!term) {
      results.replaceChildren();
      results.hidden = true;
      lists.hidden = false;
      count.hidden = true;
      wrap.classList.remove("has-count");
      return;
    }

    const hits = searchMatches(term);
    const frag = document.createDocumentFragment();
    hits.forEach(p => frag.append(personRow(p)));
    results.replaceChildren(frag);
    results.hidden = false;
    lists.hidden = true;
    count.hidden = false;
    count.textContent = String(hits.length);
    wrap.classList.add("has-count");
  }

  function playAndClose(login, vodIndex) {
    // Numeric suffixes in #many reuse the real snapshot channel underneath.
    const baseLogin = U.person(login) ? login : login.replace(/-\d+$/, "");
    U.play(baseLogin, vodIndex);
    U.closePanel();
  }

  // ----- Channel view -----
  function openChannel(p) {
    state.current = p;
    clearSelection();
    $("list-top").hidden = true;
    $("list-view").hidden = true;
    $("chan-top").hidden = false;
    $("chan-view").hidden = false;

    $("chan-name").textContent = p.name;
    $("vq").value = "";
    $("sort").value = "time";
    $("type").value = "all";

    const liveHost = $("chan-live");
    liveHost.replaceChildren();
    if (p.live) {
      const viewers = U.compact(p.viewers);
      const card = el("button", {
        type: "button",
        class: "card live-now",
        "aria-label": p.name + ", live, " + viewers + " viewers, " + p.title,
        "aria-selected": "false",
        title: p.title,
        onclick: () => playAndClose(p.login, null)
      },
        el("span", { class: "live-thumb-wrap", "aria-hidden": "true" },
          p.preview ? el("img", { class: "thumb", src: "../shared/" + p.preview, alt: "" }) : null,
          el("span", { class: "pill", text: "LIVE" })
        ),
        el("span", { class: "live-now-text" },
          el("span", { class: "ttl", text: p.title }),
          el("span", { class: "live-now-meta" },
            el("span", { class: "meta", text: p.category }),
            el("span", { class: "meta num", text: viewers })
          )
        )
      );
      liveHost.append(card);
    }

    renderVods();
    $("chan-view").scrollTop = 0;
    $("back").focus();
  }

  function renderVods() {
    if (!state.current) return;
    const p = state.current;
    const input = $("vq");
    const term = input.value.trim().toLowerCase();
    const sort = $("sort").value;
    const type = $("type").value;

    let items = p.vods.map((v, idx) => ({ v, idx }));
    if (type !== "all" && type !== "archive") items = [];
    if (term) items = items.filter(item => item.v.title.toLowerCase().includes(term));
    items.sort((a, b) => sort === "views"
      ? b.v.views - a.v.views
      : Date.parse(b.v.at) - Date.parse(a.v.at));

    const frag = document.createDocumentFragment();
    items.forEach(item => frag.append(vodButton(item.v, p, item.idx, false)));
    $("chan-vods").replaceChildren(frag);

    $("vq-count").hidden = !term;
    $("vq-count").textContent = String(items.length);
    input.parentElement.classList.toggle("has-count", Boolean(term));
  }

  function backToList() {
    clearSelection();
    state.current = null;
    $("chan-top").hidden = true;
    $("chan-view").hidden = true;
    $("list-top").hidden = false;
    $("list-view").hidden = false;
    $("q").focus();
  }

  // ----- Keyboard row navigation -----
  function visibleRows() {
    if (state.current) {
      return [...$("chan-view").querySelectorAll("button.live-now, button.row")];
    }
    if (!$("results").hidden) {
      return [...$("results").querySelectorAll("button.row")];
    }
    return [...$("lists").querySelectorAll("section:not([hidden]) button.row, section:not([hidden]) button.more")];
  }

  function clearSelection() {
    if (state.selectedEl) {
      state.selectedEl.setAttribute("aria-selected", "false");
      state.selectedEl = null;
    }
  }

  function selectRow(node) {
    clearSelection();
    if (!node) return;
    state.selectedEl = node;
    node.setAttribute("aria-selected", "true");
    node.focus();
    node.scrollIntoView({ block: "nearest" });
  }

  function moveSelection(delta) {
    const rows = visibleRows();
    if (!rows.length) return;
    const active = document.activeElement;
    const idx = rows.indexOf(active);
    if (idx === -1) {
      selectRow(delta > 0 ? rows[0] : rows[rows.length - 1]);
      return;
    }
    const next = idx + delta;
    if (next < 0) {
      clearSelection();
      (state.current ? $("vq") : $("q")).focus();
      return;
    }
    if (next < rows.length) selectRow(rows[next]);
  }

  function renderAll() {
    renderPlaying();
    renderLists();
    renderTwitch();
    if (state.current) {
      const updated = personFor(state.current.login);
      if (updated) openChannel(updated);
      else backToList();
    }
  }

  // ----- Event wiring -----
  $("q").addEventListener("input", updateSearch);
  $("vq").addEventListener("input", renderVods);
  $("sort").addEventListener("change", renderVods);
  $("type").addEventListener("change", renderVods);
  $("back").addEventListener("click", backToList);

  $("quality").addEventListener("change", e => {
    state.playing.quality = e.target.value;
  });

  $("reload").addEventListener("click", () => {
    const baseLogin = U.person(state.playing.login)
      ? state.playing.login
      : state.playing.login.replace(/-\d+$/, "");
    U.play(baseLogin, state.playing.vod ?? null);
  });

  $("chat-on").addEventListener("click", e => e.stopPropagation());
  $("hist-on").addEventListener("click", e => e.stopPropagation());

  $("chat-place").addEventListener("click", e => {
    const btn = e.target.closest("button[data-place]");
    if (!btn) return;
    for (const b of $("chat-place").children) {
      b.setAttribute("aria-checked", String(b === btn));
    }
  });

  $("text-smaller").addEventListener("click", () => {
    state.textSize = Math.max(11, state.textSize - 1);
    $("text-size").textContent = String(state.textSize);
  });
  $("text-larger").addEventListener("click", () => {
    state.textSize = Math.min(22, state.textSize + 1);
    $("text-size").textContent = String(state.textSize);
  });

  $("forget").addEventListener("click", () => {
    const p = personFor(state.playing.login);
    if (!p) return;
    state.forgotten.add(p.login);
    renderPlaying();
    renderLists();
  });

  $("delete-all").addEventListener("click", () => {
    state.historyCleared = true;
    renderPlaying();
    renderLists();
  });

  document.addEventListener("focusin", e => {
    const row = e.target.closest("button.row, button.live-now");
    if (row) {
      if (state.selectedEl && state.selectedEl !== row) {
        state.selectedEl.setAttribute("aria-selected", "false");
      }
      state.selectedEl = row;
      row.setAttribute("aria-selected", "true");
    } else if (state.selectedEl) {
      clearSelection();
    }
  });

  document.addEventListener("keydown", e => {
    if (e.metaKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      (state.current ? $("vq") : $("q")).focus();
      return;
    }
    if (e.key === "ArrowDown") {
      if (document.activeElement && document.activeElement.tagName === "SELECT") return;
      e.preventDefault();
      moveSelection(1);
      return;
    }
    if (e.key === "ArrowUp") {
      if (document.activeElement && document.activeElement.tagName === "SELECT") return;
      e.preventDefault();
      moveSelection(-1);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (state.current) {
        if ($("vq").value) {
          $("vq").value = "";
          renderVods();
        } else {
          backToList();
        }
      } else if ($("q").value) {
        $("q").value = "";
        updateSearch();
      } else {
        U.closePanel();
      }
    }
  });

  window.addEventListener("message", e => {
    const m = e.data || {};
    if (m.type === "playing" && m.playing) {
      state.playing = { ...m.playing };
      renderPlaying();
      renderLists();
    } else if (m.type === "hash" && typeof m.hash === "string") {
      const next = m.hash.toLowerCase();
      if (next !== currentHash()) {
        state.hashOverride = m.hash;
        applyHash();
      }
    }
  });

  window.addEventListener("hashchange", applyHash);
  try {
    if (window.parent && window.parent !== window) {
      window.parent.addEventListener("hashchange", applyHash);
    }
  } catch (_) {}
  applyHash();
})();
