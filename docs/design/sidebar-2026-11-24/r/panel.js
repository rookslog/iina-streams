"use strict";
(function () {
  const S = window.SNAPSHOT;
  const V = window.VIEWER;
  const U = window.U;
  const OFFLINE_CAP_MANY = 30;
  const MANY_TOTAL = 300;
  const ARC_RADIUS = 17;
  const ARC_CIRCUMFERENCE = 2 * Math.PI * ARC_RADIUS;

  const dom = {
    app: document.getElementById("app"),
    viewList: document.getElementById("view-list"),
    viewPerson: document.getElementById("view-person"),
    listSearch: document.getElementById("list-search"),
    listClear: document.getElementById("list-clear"),
    listRows: document.getElementById("list-rows"),
    personBack: document.getElementById("person-back"),
    personAvatar: document.getElementById("person-avatar"),
    personName: document.getElementById("person-name"),
    personStatus: document.getElementById("person-status"),
    personSearch: document.getElementById("person-search"),
    personClear: document.getElementById("person-clear"),
    personRows: document.getElementById("person-rows"),
    qualityMenu: document.getElementById("quality-menu")
  };

  const state = {
    mode: "default",
    playing: { ...V.playing },
    qualityOverride: null,
    listQuery: "",
    personQuery: "",
    selectedListIndex: 0,
    selectedPersonIndex: 0,
    activePersonLogin: null,
    showAllOffline: false,
    manyPeople: null,
    listItems: [],
    personItems: []
  };

  function readHash() {
    let h = window.location.hash || "";
    if (!h && window.parent && window.parent !== window) {
      try { h = window.parent.location.hash || ""; } catch (_) {}
    }
    if (h === "#signed-out" || h === "#new" || h === "#many") return h.slice(1);
    return "default";
  }

  function buildManyPeople() {
    if (state.manyPeople) return state.manyPeople;
    const base = U.ranked.length ? U.ranked : S.people;
    const out = [];
    let round = 1;
    while (out.length < MANY_TOTAL) {
      for (let i = 0; i < base.length && out.length < MANY_TOTAL; i++) {
        const p = base[i];
        out.push(round === 1 ? p : {
          ...p,
          login: p.login + "-" + round,
          name: p.name + " " + round,
          baseLogin: p.login
        });
      }
      round++;
    }
    state.manyPeople = out;
    return out;
  }

  function findPerson(login) {
    const direct = U.person(login);
    if (direct) return direct;
    if (state.mode === "many") return buildManyPeople().find(p => p.login === login) || null;
    return null;
  }

  function currentPeoplePool() {
    if (state.mode === "new") return S.people.filter(p => p.live);
    if (state.mode === "signed-out") {
      return U.ranked.filter(p => Object.prototype.hasOwnProperty.call(V.lastVisitDaysAgo, p.login));
    }
    if (state.mode === "many") return buildManyPeople();
    return U.ranked;
  }

  function unfinishedInfo(person) {
    if (state.mode === "new" || person.baseLogin) return null;
    const item = V.unfinished.find(u => u.login === person.login);
    return item ? item.fraction : null;
  }

  function compactQuality(q) {
    if (!q) return "1080p60";
    const m = /^Source \((.+)\)$/.exec(q);
    return m ? m[1] : q;
  }

  function activeQuality() {
    return state.qualityOverride || state.playing.quality || "1080p60";
  }

  function isSameQuality(option, current) {
    return option === current || compactQuality(option) === compactQuality(current);
  }

  const SVG_NS = dom.app.querySelector("svg").namespaceURI;

  function svgEl(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    return node;
  }

  function makeAvatarWrap(person, fraction) {
    const wrap = document.createElement("div");
    wrap.className = "avatar-wrap";
    const img = document.createElement("img");
    img.className = "avatar " + (person.live ? "live" : "offline");
    img.src = "../shared/" + person.avatar;
    img.alt = "";
    wrap.appendChild(img);

    if (fraction != null) {
      const svg = svgEl("svg", { class: "avatar-arc", viewBox: "0 0 36 36", "aria-hidden": "true" });
      if (!person.live) {
        svg.appendChild(svgEl("circle", { class: "avatar-arc-track", cx: 18, cy: 18, r: ARC_RADIUS }));
      }
      const dash = (Math.max(0.05, Math.min(1, fraction)) * ARC_CIRCUMFERENCE).toFixed(2);
      svg.appendChild(svgEl("circle", {
        class: "avatar-arc-fill",
        cx: 18,
        cy: 18,
        r: ARC_RADIUS,
        "stroke-dasharray": dash + " " + ARC_CIRCUMFERENCE.toFixed(2)
      }));
      wrap.appendChild(svg);
    }
    return wrap;
  }

  function makeChevronIcon() {
    const svg = svgEl("svg", { viewBox: "0 0 16 16", "aria-hidden": "true" });
    svg.appendChild(svgEl("path", {
      d: "M6 3.5 10.5 8 6 12.5",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 1.6,
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    }));
    return svg;
  }

  function makeCheckIcon() {
    const svg = svgEl("svg", { class: "quality-check", viewBox: "0 0 16 16", "aria-hidden": "true" });
    svg.appendChild(svgEl("path", {
      d: "M3.5 8.5 6.5 11.5 12.5 4.5",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 1.8,
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    }));
    return svg;
  }

  function personRowAccessibleName(person, isPlaying, fraction) {
    const parts = [person.name];
    if (isPlaying) parts.push("playing");
    if (person.live) {
      parts.push("live " + U.uptime(person.startedAt));
      parts.push(person.category);
      parts.push(U.compact(person.viewers) + " viewers");
    } else {
      parts.push("offline");
      parts.push(U.ago(person.lastLive));
    }
    if (fraction != null) parts.push(Math.round(fraction * 100) + "% watched");
    if (person.live && person.title) parts.push(person.title);
    return parts.join(", ");
  }

  function createPersonRow(person, index, isPlaying) {
    const row = document.createElement("div");
    row.className = "row" + (isPlaying ? " playing" : "");
    row.dataset.index = String(index);

    if (isPlaying) {
      const bar = document.createElement("span");
      bar.className = "row-bar";
      bar.setAttribute("aria-hidden", "true");
      row.appendChild(bar);
    }

    const fraction = unfinishedInfo(person);
    const hit = document.createElement("button");
    hit.type = "button";
    hit.className = "row-hit";
    hit.title = person.live ? person.title : person.name + " · " + U.ago(person.lastLive);
    hit.setAttribute("aria-label", personRowAccessibleName(person, isPlaying, fraction));

    hit.appendChild(makeAvatarWrap(person, fraction));

    const text = document.createElement("div");
    text.className = "text";
    const nameEl = document.createElement("div");
    nameEl.className = "name";
    nameEl.textContent = person.name;
    const metaEl = document.createElement("div");
    metaEl.className = "meta";
    metaEl.textContent = person.live
      ? person.category + " · " + U.compact(person.viewers)
      : U.ago(person.lastLive);
    text.append(nameEl, metaEl);
    hit.appendChild(text);

    hit.addEventListener("click", () => {
      state.selectedListIndex = index;
      updateListSelection(false);
      actOnPersonRow(person);
    });
    row.appendChild(hit);

    if (isPlaying) {
      const qBtn = document.createElement("button");
      qBtn.type = "button";
      qBtn.className = "quality-btn";
      const qVal = compactQuality(activeQuality());
      qBtn.textContent = qVal;
      qBtn.title = activeQuality();
      qBtn.setAttribute("aria-haspopup", "menu");
      qBtn.setAttribute("aria-expanded", "false");
      qBtn.setAttribute("aria-label", "Quality, " + activeQuality());
      qBtn.addEventListener("click", e => {
        e.stopPropagation();
        toggleQualityMenu(qBtn);
      });
      row.appendChild(qBtn);
    }

    const chev = document.createElement("button");
    chev.type = "button";
    chev.className = "row-chevron";
    chev.setAttribute("aria-label", person.name);
    chev.title = person.name;
    chev.appendChild(makeChevronIcon());
    chev.addEventListener("click", e => {
      e.stopPropagation();
      state.selectedListIndex = index;
      openPersonPage(person.login);
    });
    row.appendChild(chev);

    return row;
  }

  function createTailAction(label, index, onClick) {
    const wrap = document.createElement("div");
    wrap.className = "tail-wrap";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tail-action";
    btn.dataset.index = String(index);
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    wrap.appendChild(btn);
    return wrap;
  }

  function partitionPeople() {
    const pool = currentPeoplePool();
    const q = state.listQuery.trim().toLowerCase();
    const matches = p => !q || p.name.toLowerCase().includes(q) || p.login.toLowerCase().includes(q);

    const playingPerson = pool.find(p => p.login === state.playing.login) || null;
    const playingMatches = playingPerson && matches(playingPerson);

    const live = [];
    const offline = [];
    for (const p of pool) {
      if (playingMatches && p.login === playingPerson.login) continue;
      if (!matches(p)) continue;
      if (p.live) live.push(p);
      else if (state.mode !== "new") offline.push(p);
    }
    return { playing: playingMatches ? playingPerson : null, live, offline };
  }

  function renderList() {
    closeQualityMenu(false);
    dom.listClear.hidden = state.listQuery.length === 0;
    const { playing, live, offline } = partitionPeople();
    const frag = document.createDocumentFragment();
    const items = [];

    if (playing) {
      const idx = items.length;
      items.push({ kind: "person", person: playing });
      frag.appendChild(createPersonRow(playing, idx, true));
    }

    for (const p of live) {
      const idx = items.length;
      items.push({ kind: "person", person: p });
      frag.appendChild(createPersonRow(p, idx, false));
    }

    const hasLiveGroup = Boolean((playing && playing.live) || live.length || (playing && !playing.live && offline.length));
    const showOffline = state.mode === "many" && !state.showAllOffline
      ? offline.slice(0, OFFLINE_CAP_MANY)
      : offline;

    if (hasLiveGroup && showOffline.length && (playing || live.length)) {
      const line = document.createElement("div");
      line.className = "split-hairline";
      line.setAttribute("role", "separator");
      frag.appendChild(line);
    }

    for (const p of showOffline) {
      const idx = items.length;
      items.push({ kind: "person", person: p });
      frag.appendChild(createPersonRow(p, idx, false));
    }

    if (state.mode === "many" && !state.showAllOffline && offline.length > OFFLINE_CAP_MANY) {
      const idx = items.length;
      items.push({ kind: "show-all" });
      frag.appendChild(createTailAction("Show All", idx, () => {
        state.showAllOffline = true;
        renderList();
      }));
    }

    if (items.length === 0 && state.listQuery.trim()) {
      const idx = items.length;
      items.push({ kind: "clear" });
      frag.appendChild(createTailAction("Clear", idx, () => clearListSearch(true)));
    }

    state.listItems = items;
    if (state.selectedListIndex >= items.length) state.selectedListIndex = Math.max(0, items.length - 1);
    dom.listRows.replaceChildren(frag);
    updateListSelection(false);
  }

  function updateListSelection(scrollIntoView) {
    const rows = dom.listRows.querySelectorAll("[data-index]");
    let activeEl = null;
    for (const el of rows) {
      const isSelected = Number(el.dataset.index) === state.selectedListIndex;
      el.classList.toggle("selected", isSelected);
      const primary = el.classList.contains("row") ? el.querySelector(".row-hit") : el;
      const chev = el.classList.contains("row") ? el.querySelector(".row-chevron") : null;
      if (primary) primary.tabIndex = isSelected ? 0 : -1;
      if (chev) chev.tabIndex = isSelected ? 0 : -1;
      if (isSelected) activeEl = el;
    }
    if (scrollIntoView && activeEl) activeEl.scrollIntoView({ block: "nearest" });
  }

  function actOnPersonRow(person) {
    if (person.live) {
      const targetLogin = person.baseLogin || person.login;
      state.playing = { ...state.playing, login: person.login, kind: "live", vod: null };
      U.play(targetLogin);
      U.closePanel();
      renderList();
      return;
    }
    openPersonPage(person.login);
  }

  function openPersonPage(login) {
    const person = findPerson(login);
    if (!person) return;
    closeQualityMenu(false);
    state.activePersonLogin = login;
    state.personQuery = "";
    dom.personSearch.value = "";
    state.selectedPersonIndex = 0;

    renderPersonPage();
    dom.viewPerson.removeAttribute("aria-hidden");
    dom.viewPerson.inert = false;
    dom.viewList.setAttribute("aria-hidden", "true");
    dom.viewList.inert = true;
    dom.app.classList.add("in-person");

    requestAnimationFrame(() => {
      const active = dom.personRows.querySelector(".selected .row-hit, .selected");
      if (active) active.focus();
      else dom.personSearch.focus();
    });
  }

  function closePersonPage() {
    if (!dom.app.classList.contains("in-person")) return;
    dom.viewList.removeAttribute("aria-hidden");
    dom.viewList.inert = false;
    dom.viewPerson.setAttribute("aria-hidden", "true");
    dom.viewPerson.inert = true;
    dom.app.classList.remove("in-person");
    state.activePersonLogin = null;
    renderList();

    requestAnimationFrame(() => {
      const active = dom.listRows.querySelector(".selected .row-hit, .selected");
      if (active) active.focus();
      else dom.listSearch.focus();
    });
  }

  function personBroadcasts(person) {
    const entries = [];
    if (person.live) {
      entries.push({ kind: "live", title: person.title, startedAt: person.startedAt, category: person.category, viewers: person.viewers });
    }
    const startMs = person.startedAt ? Date.parse(person.startedAt) : null;
    const vods = person.vods.map((vod, vodIndex) => ({ vod, vodIndex }));
    vods.sort((a, b) => Date.parse(b.vod.at) - Date.parse(a.vod.at));

    for (const { vod, vodIndex } of vods) {
      const isLiveRecording = person.live && vod.thumb == null && startMs != null
        && Math.abs(Date.parse(vod.at) - startMs) < 120000;
      if (isLiveRecording) continue;
      entries.push({ kind: "vod", vod, vodIndex, title: vod.title });
    }
    return entries;
  }

  function createBroadcastRow(person, entry, index) {
    const row = document.createElement("div");
    const isCurrentLive = entry.kind === "live"
      && state.playing.login === person.login
      && state.playing.kind === "live";
    const isCurrentVod = entry.kind === "vod"
      && state.playing.login === person.login
      && state.playing.kind === "vod"
      && state.playing.vod === entry.vodIndex;
    const isPlaying = isCurrentLive || isCurrentVod;

    row.className = "row vod-row" + (isPlaying ? " playing" : "");
    row.dataset.index = String(index);

    if (isPlaying) {
      const bar = document.createElement("span");
      bar.className = "row-bar";
      bar.setAttribute("aria-hidden", "true");
      row.appendChild(bar);
    }

    const hit = document.createElement("button");
    hit.type = "button";
    hit.className = "row-hit";
    hit.title = entry.title;

    const frac = entry.kind === "vod" && state.mode !== "new" && !person.baseLogin
      ? U.progressOf(person.login, entry.vodIndex)
      : null;

    if (entry.kind === "live") {
      hit.setAttribute("aria-label", [
        entry.title,
        "live " + U.uptime(entry.startedAt),
        entry.category,
        U.compact(entry.viewers) + " viewers"
      ].join(", "));
    } else {
      const labelParts = [entry.title, U.duration(entry.vod.seconds), U.ago(entry.vod.at)];
      if (frac != null) labelParts.push(Math.round(frac * 100) + "% watched");
      hit.setAttribute("aria-label", labelParts.join(", "));
    }

    const text = document.createElement("div");
    text.className = "text";

    const titleEl = document.createElement("div");
    titleEl.className = "name";
    titleEl.textContent = entry.title;
    text.appendChild(titleEl);

    if (entry.kind === "live") {
      const metaLine = document.createElement("div");
      metaLine.className = "meta meta-line";
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.setAttribute("aria-hidden", "true");
      const metaText = document.createElement("span");
      metaText.textContent = "LIVE " + U.uptime(entry.startedAt) + " · " + entry.category + " · " + U.compact(entry.viewers);
      metaLine.append(dot, metaText);
      text.appendChild(metaLine);
    } else {
      const metaEl = document.createElement("div");
      metaEl.className = "meta";
      metaEl.textContent = U.duration(entry.vod.seconds) + " · " + U.ago(entry.vod.at);
      text.appendChild(metaEl);

      if (frac != null) {
        const prog = document.createElement("div");
        prog.className = "progress";
        const bar = document.createElement("i");
        bar.style.width = Math.round(frac * 100) + "%";
        prog.appendChild(bar);
        text.appendChild(prog);
      }
    }

    hit.appendChild(text);
    hit.addEventListener("click", () => {
      state.selectedPersonIndex = index;
      updatePersonSelection(false);
      actOnBroadcast(person, entry);
    });
    row.appendChild(hit);
    return row;
  }

  function renderPersonPage() {
    const person = findPerson(state.activePersonLogin);
    if (!person) return;

    dom.personClear.hidden = state.personQuery.length === 0;
    dom.personAvatar.hidden = false;
    dom.personAvatar.src = "../shared/" + person.avatar;
    dom.personAvatar.className = "avatar person-avatar " + (person.live ? "live" : "offline");
    dom.personName.textContent = person.name;

    dom.personStatus.replaceChildren();
    if (person.live) {
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = "LIVE " + U.uptime(person.startedAt);
      dom.personStatus.append(dot, label);
    } else {
      dom.personStatus.textContent = U.ago(person.lastLive);
    }

    const q = state.personQuery.trim().toLowerCase();
    const entries = personBroadcasts(person).filter(e => !q || e.title.toLowerCase().includes(q));
    const frag = document.createDocumentFragment();
    const items = [];

    for (const entry of entries) {
      const idx = items.length;
      items.push({ kind: "broadcast", entry });
      frag.appendChild(createBroadcastRow(person, entry, idx));
    }

    if (items.length === 0 && q) {
      const idx = items.length;
      items.push({ kind: "clear" });
      frag.appendChild(createTailAction("Clear", idx, () => clearPersonSearch(true)));
    }

    state.personItems = items;
    if (state.selectedPersonIndex >= items.length) state.selectedPersonIndex = Math.max(0, items.length - 1);
    dom.personRows.replaceChildren(frag);
    updatePersonSelection(false);
  }

  function updatePersonSelection(scrollIntoView) {
    const rows = dom.personRows.querySelectorAll("[data-index]");
    let activeEl = null;
    for (const el of rows) {
      const isSelected = Number(el.dataset.index) === state.selectedPersonIndex;
      el.classList.toggle("selected", isSelected);
      const primary = el.classList.contains("row") ? el.querySelector(".row-hit") : el;
      if (primary) primary.tabIndex = isSelected ? 0 : -1;
      if (isSelected) activeEl = el;
    }
    if (scrollIntoView && activeEl) activeEl.scrollIntoView({ block: "nearest" });
  }

  function actOnBroadcast(person, entry) {
    const targetLogin = person.baseLogin || person.login;
    if (entry.kind === "live") {
      state.playing = { ...state.playing, login: person.login, kind: "live", vod: null };
      U.play(targetLogin);
    } else {
      state.playing = { ...state.playing, login: person.login, kind: "vod", vod: entry.vodIndex };
      U.play(targetLogin, entry.vodIndex);
    }
    U.closePanel();
    renderPersonPage();
  }

  function toggleQualityMenu(anchorBtn) {
    if (!dom.qualityMenu.hidden) {
      closeQualityMenu(true);
      return;
    }
    const current = activeQuality();
    const frag = document.createDocumentFragment();
    for (const q of V.qualities) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "quality-item";
      item.setAttribute("role", "menuitemradio");
      item.setAttribute("aria-checked", String(isSameQuality(q, current)));
      item.appendChild(makeCheckIcon());
      const span = document.createElement("span");
      span.textContent = q;
      item.appendChild(span);
      item.addEventListener("click", e => {
        e.stopPropagation();
        state.qualityOverride = q;
        state.playing.quality = q;
        closeQualityMenu(true);
        renderList();
        const refreshedBtn = dom.listRows.querySelector(".quality-btn");
        if (refreshedBtn) refreshedBtn.focus();
      });
      frag.appendChild(item);
    }

    dom.qualityMenu.replaceChildren(frag);
    dom.qualityMenu.hidden = false;
    anchorBtn.setAttribute("aria-expanded", "true");

    const rect = anchorBtn.getBoundingClientRect();
    const menuWidth = dom.qualityMenu.offsetWidth || 152;
    const menuHeight = dom.qualityMenu.offsetHeight || 150;
    const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth));
    const fitsBelow = rect.bottom + 4 + menuHeight <= window.innerHeight - 8;
    const top = fitsBelow ? rect.bottom + 4 : Math.max(8, rect.top - menuHeight - 4);
    dom.qualityMenu.style.left = left + "px";
    dom.qualityMenu.style.top = top + "px";

    requestAnimationFrame(() => {
      dom.qualityMenu.classList.add("open");
      const checked = dom.qualityMenu.querySelector('[aria-checked="true"]') || dom.qualityMenu.firstElementChild;
      if (checked) checked.focus();
    });
  }

  function closeQualityMenu(restoreFocus) {
    if (dom.qualityMenu.hidden) return;
    dom.qualityMenu.classList.remove("open");
    dom.qualityMenu.hidden = true;
    const qBtn = dom.listRows.querySelector(".quality-btn");
    if (qBtn) {
      qBtn.setAttribute("aria-expanded", "false");
      if (restoreFocus) qBtn.focus();
    }
  }

  function clearListSearch(focusInput) {
    state.listQuery = "";
    dom.listSearch.value = "";
    state.selectedListIndex = 0;
    renderList();
    if (focusInput) dom.listSearch.focus();
  }

  function clearPersonSearch(focusInput) {
    state.personQuery = "";
    dom.personSearch.value = "";
    state.selectedPersonIndex = 0;
    renderPersonPage();
    if (focusInput) dom.personSearch.focus();
  }

  function moveSelection(delta) {
    if (dom.app.classList.contains("in-person")) {
      const len = state.personItems.length;
      if (!len) return;
      state.selectedPersonIndex = Math.max(0, Math.min(len - 1, state.selectedPersonIndex + delta));
      updatePersonSelection(true);
      if (document.activeElement !== dom.personSearch) {
        const active = dom.personRows.querySelector(".selected .row-hit, .selected");
        if (active) active.focus({ preventScroll: true });
      }
      return;
    }
    const len = state.listItems.length;
    if (!len) return;
    state.selectedListIndex = Math.max(0, Math.min(len - 1, state.selectedListIndex + delta));
    updateListSelection(true);
    if (document.activeElement !== dom.listSearch) {
      const active = dom.listRows.querySelector(".selected .row-hit, .selected");
      if (active) active.focus({ preventScroll: true });
    }
  }

  function triggerSelected() {
    if (dom.app.classList.contains("in-person")) {
      const item = state.personItems[state.selectedPersonIndex];
      if (!item) return;
      if (item.kind === "clear") clearPersonSearch(true);
      else actOnBroadcast(findPerson(state.activePersonLogin), item.entry);
      return;
    }
    const item = state.listItems[state.selectedListIndex];
    if (!item) return;
    if (item.kind === "show-all") {
      state.showAllOffline = true;
      renderList();
    } else if (item.kind === "clear") {
      clearListSearch(true);
    } else {
      actOnPersonRow(item.person);
    }
  }

  function handleMenuKey(e) {
    const items = Array.from(dom.qualityMenu.querySelectorAll(".quality-item"));
    const cur = items.indexOf(document.activeElement);
    if (e.key === "Escape") {
      e.preventDefault();
      closeQualityMenu(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(cur + 1 + items.length) % items.length].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(cur - 1 + items.length) % items.length].focus();
    } else if (e.key === "Tab") {
      closeQualityMenu(false);
    }
  }

  function handleKeydown(e) {
    if (!dom.qualityMenu.hidden) {
      handleMenuKey(e);
      return;
    }
    const inPerson = dom.app.classList.contains("in-person");
    const activeInput = inPerson ? dom.personSearch : dom.listSearch;
    const isInputFocused = document.activeElement === activeInput;

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
      e.preventDefault();
      activeInput.focus();
      activeInput.select();
      return;
    }
    if (inPerson && e.metaKey && e.key === "[") {
      e.preventDefault();
      closePersonPage();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (inPerson && state.personQuery) clearPersonSearch(true);
      else if (!inPerson && state.listQuery) clearListSearch(true);
      else U.closePanel();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveSelection(1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      moveSelection(-1);
      return;
    }
    if (e.key === "ArrowRight" && !inPerson && (!isInputFocused || activeInput.value === "")) {
      const item = state.listItems[state.selectedListIndex];
      if (item && item.kind === "person") {
        e.preventDefault();
        openPersonPage(item.person.login);
      }
      return;
    }
    if (e.key === "ArrowLeft" && inPerson && (!isInputFocused || activeInput.value === "")) {
      e.preventDefault();
      closePersonPage();
      return;
    }
    if (e.key === "Enter" && isInputFocused) {
      e.preventDefault();
      triggerSelected();
    }
  }

  function applyHashMode() {
    state.mode = readHash();
    state.showAllOffline = false;
    state.listQuery = "";
    state.personQuery = "";
    state.selectedListIndex = 0;
    state.selectedPersonIndex = 0;
    dom.listSearch.value = "";
    dom.personSearch.value = "";

    if (dom.app.classList.contains("in-person")) {
      dom.viewList.removeAttribute("aria-hidden");
      dom.viewList.inert = false;
      dom.viewPerson.setAttribute("aria-hidden", "true");
      dom.viewPerson.inert = true;
      dom.app.classList.remove("in-person");
      state.activePersonLogin = null;
    }

    renderList();
    if (state.mode === "new") {
      requestAnimationFrame(() => dom.listSearch.focus());
    }
  }

  function handleMessage(e) {
    const m = e.data || {};
    if (m.type !== "playing" || !m.playing) return;
    state.playing = {
      ...m.playing,
      quality: state.qualityOverride || m.playing.quality || state.playing.quality
    };
    if (dom.app.classList.contains("in-person")) renderPersonPage();
    else renderList();
  }

  dom.listSearch.addEventListener("input", () => {
    state.listQuery = dom.listSearch.value;
    state.selectedListIndex = 0;
    renderList();
  });
  dom.listClear.addEventListener("click", () => clearListSearch(true));
  dom.personSearch.addEventListener("input", () => {
    state.personQuery = dom.personSearch.value;
    state.selectedPersonIndex = 0;
    renderPersonPage();
  });
  dom.personClear.addEventListener("click", () => clearPersonSearch(true));
  dom.personBack.addEventListener("click", closePersonPage);

  document.addEventListener("keydown", handleKeydown);
  document.addEventListener("click", e => {
    if (!dom.qualityMenu.hidden && !dom.qualityMenu.contains(e.target)) closeQualityMenu(false);
  });
  window.addEventListener("message", handleMessage);
  window.addEventListener("hashchange", applyHashMode);
  if (window.parent && window.parent !== window) {
    try { window.parent.addEventListener("hashchange", applyHashMode); } catch (_) {}
  }

  applyHashMode();
})();
