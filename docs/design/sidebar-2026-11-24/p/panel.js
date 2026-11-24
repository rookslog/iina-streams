"use strict";
(function () {
  const S = window.SNAPSHOT;
  const V = window.VIEWER;
  const U = window.U;

  const TZ_OFFSET_MS = -5 * 3600 * 1000; // Snapshot reference offset (-05:00)
  const PAGE_SIZE = 60;
  const MANY_COPIES = 22; // 14 * 22 = 308 people (~300)
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const searchEl = document.getElementById("search");
  const clearEl = document.getElementById("search-clear");
  const chipsEl = document.getElementById("chips");
  const nowWrapEl = document.getElementById("now-wrap");
  const nowEl = document.getElementById("now");
  const timelineEl = document.getElementById("timeline");

  const state = {
    mode: "default",
    people: [],
    livePeople: [],
    allEntries: [],
    filteredEntries: [],
    renderedCount: 0,
    lastDayKey: null,
    activeLogin: null,
    query: "",
    selectedRow: -1,
    nowIndex: 0,
    playing: { ...V.playing },
    playingCopyLogin: V.playing.login
  };

  let observer = null;

  function readHash() {
    if (location.hash) return location.hash;
    try {
      if (window.parent && window.parent !== window && window.parent.location.hash) {
        return window.parent.location.hash;
      }
    } catch (_) {
      // Cross-origin frame access is unavailable on strict file:// origins.
    }
    return "";
  }

  function getMode() {
    const h = readHash().slice(1);
    if (h === "signed-out" || h === "new" || h === "many") return h;
    return "default";
  }

  function isHistoryLogin(login) {
    if (Object.prototype.hasOwnProperty.call(V.lastVisitDaysAgo, login)) return true;
    if (V.unfinished.some(u => u.login === login)) return true;
    return V.playing && V.playing.login === login;
  }

  function buildManyPeople(basePeople) {
    const list = [];
    for (let c = 0; c < MANY_COPIES; c++) {
      const suffix = c === 0 ? "" : String(c + 1);
      const shiftMs = c * 37 * 60000;
      for (const p of basePeople) {
        list.push({
          ...p,
          sourceLogin: p.login,
          login: p.login + suffix,
          name: c === 0 ? p.name : p.name + " " + suffix,
          copyIndex: c,
          vods: p.vods.map(v => ({
            ...v,
            at: shiftMs ? new Date(Date.parse(v.at) - shiftMs).toISOString() : v.at
          }))
        });
      }
    }
    return list;
  }

  function buildPeople(mode) {
    if (mode === "new") {
      return S.people.map(p => ({ ...p, sourceLogin: p.login, copyIndex: 0 }));
    }
    if (mode === "signed-out") {
      return U.ranked
        .filter(p => isHistoryLogin(p.login))
        .map(p => ({ ...p, sourceLogin: p.login, copyIndex: 0 }));
    }
    if (mode === "many") {
      return buildManyPeople(U.ranked);
    }
    return U.ranked.map(p => ({ ...p, sourceLogin: p.login, copyIndex: 0 }));
  }

  function buildTimelineEntries(people, mode) {
    const entries = [];
    const allowUnfinished = mode !== "new";
    for (const p of people) {
      for (let i = 0; i < p.vods.length; i++) {
        const v = p.vods[i];
        const u = allowUnfinished && p.copyIndex === 0
          ? V.unfinished.find(x => x.login === p.sourceLogin && x.vod === i)
          : null;
        const ts = u ? U.NOW - u.watchedDaysAgo * 86400000 : Date.parse(v.at);
        const ageIso = new Date(ts).toISOString();
        const isLiveVod = i === 0 && p.live;
        const thumb = v.thumb || (isLiveVod ? p.preview : null);
        const isNew = mode !== "new" && !u && p.copyIndex === 0 && U.isNew(p.sourceLogin, v.at);
        entries.push({
          person: p,
          vod: v,
          vodIndex: i,
          ts,
          ageIso,
          progress: u ? u.fraction : null,
          isNew,
          isLiveVod,
          thumb
        });
      }
    }
    entries.sort((a, b) => b.ts - a.ts);
    return entries;
  }

  function refDateParts(ms) {
    const d = new Date(ms + TZ_OFFSET_MS);
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth(),
      date: d.getUTCDate(),
      day: d.getUTCDay(),
      dayEpoch: Math.floor((ms + TZ_OFFSET_MS) / 86400000)
    };
  }

  const NOW_PARTS = refDateParts(U.NOW);

  function dayInfo(ms) {
    const p = refDateParts(ms);
    const key = p.year + "-" + (p.month + 1) + "-" + p.date;
    const diff = NOW_PARTS.dayEpoch - p.dayEpoch;
    let label;
    if (diff === 0) label = "Today";
    else if (diff === 1) label = "Yesterday";
    else if (diff >= 2 && diff <= 6) label = DAYS[p.day] + " " + p.date;
    else if (p.year === NOW_PARTS.year) label = MONTHS[p.month] + " " + p.date;
    else label = MONTHS[p.month] + " " + p.date + ", " + p.year;
    return { key, label };
  }

  function matchingPeople(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const starts = [];
    const contains = [];
    for (const p of state.people) {
      const name = p.name.toLowerCase();
      const login = p.login.toLowerCase();
      if (name.startsWith(q) || login.startsWith(q)) starts.push(p);
      else if (name.includes(q) || login.includes(q)) contains.push(p);
    }
    return starts.concat(contains).slice(0, 12);
  }

  function filteredEntries() {
    const q = state.query.trim().toLowerCase();
    const active = state.activeLogin;
    if (state.mode === "new" && !active && !q) return [];
    return state.allEntries.filter(entry => {
      if (active && entry.person.login !== active) return false;
      if (!q) return true;
      return entry.person.name.toLowerCase().includes(q)
        || entry.person.login.toLowerCase().includes(q)
        || entry.vod.title.toLowerCase().includes(q)
        || entry.vod.category.toLowerCase().includes(q);
    });
  }

  function isNowPlaying(p) {
    if (!state.playing || state.playing.kind !== "live") return false;
    if (state.playingCopyLogin) return p.login === state.playingCopyLogin;
    return p.sourceLogin === state.playing.login && p.copyIndex === 0;
  }

  function isEntryPlaying(entry) {
    if (!state.playing || state.playing.kind !== "vod") return false;
    if (entry.vodIndex !== state.playing.vod) return false;
    if (state.playingCopyLogin) return entry.person.login === state.playingCopyLogin;
    return entry.person.sourceLogin === state.playing.login && entry.person.copyIndex === 0;
  }

  function playLive(p) {
    state.playing = { login: p.sourceLogin, kind: "live", vod: null, quality: state.playing.quality };
    state.playingCopyLogin = p.login;
    updatePlayingMarks();
    U.play(p.sourceLogin, null);
    U.closePanel();
  }

  function playVod(entry) {
    state.playing = { login: entry.person.sourceLogin, kind: "vod", vod: entry.vodIndex, quality: state.playing.quality };
    state.playingCopyLogin = entry.person.login;
    updatePlayingMarks();
    U.play(entry.person.sourceLogin, entry.vodIndex);
    U.closePanel();
  }

  function createSvgPlayPlaceholder() {
    const box = document.createElement("div");
    box.className = "tl-thumb-placeholder";
    box.setAttribute("aria-hidden", "true");
    box.innerHTML = '<svg viewBox="0 0 16 16"><path fill="currentColor" d="M5 3.5l8 4.5-8 4.5z"/></svg>';
    return box;
  }

  function makeChipAvatar(p) {
    const wrap = document.createElement("span");
    wrap.className = "chip-avatar-wrap";
    const img = document.createElement("img");
    img.className = "chip-avatar";
    img.src = "../shared/" + p.avatar;
    img.alt = "";
    img.decoding = "async";
    wrap.appendChild(img);
    if (p.live) {
      const dot = document.createElement("span");
      dot.className = "chip-live-dot";
      wrap.appendChild(dot);
    }
    return wrap;
  }

  function renderChips() {
    chipsEl.textContent = "";
    const activePerson = state.activeLogin
      ? state.people.find(p => p.login === state.activeLogin)
      : null;
    const suggestions = matchingPeople(state.query)
      .filter(p => p.login !== state.activeLogin);

    if (!activePerson && suggestions.length === 0) {
      chipsEl.hidden = true;
      return;
    }

    if (activePerson) {
      const chip = document.createElement("div");
      chip.className = "chip active";
      chip.appendChild(makeChipAvatar(activePerson));
      const name = document.createElement("span");
      name.className = "chip-name";
      name.textContent = activePerson.name;
      chip.appendChild(name);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "chip-remove";
      remove.textContent = "×";
      remove.setAttribute("aria-label", "Remove " + activePerson.name);
      remove.title = "Remove";
      remove.addEventListener("click", () => {
        state.activeLogin = null;
        refreshView();
        searchEl.focus();
      });
      chip.appendChild(remove);
      chipsEl.appendChild(chip);
    }

    for (const p of suggestions) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip suggest";
      btn.title = p.name;
      btn.appendChild(makeChipAvatar(p));
      const name = document.createElement("span");
      name.className = "chip-name";
      name.textContent = p.name;
      btn.appendChild(name);
      btn.addEventListener("click", () => {
        state.activeLogin = p.login;
        state.query = "";
        searchEl.value = "";
        clearEl.hidden = true;
        refreshView();
        searchEl.focus();
      });
      chipsEl.appendChild(btn);
    }
    chipsEl.hidden = false;
  }

  function renderNow() {
    nowEl.textContent = "";
    const live = state.livePeople;
    nowWrapEl.hidden = live.length === 0;
    if (live.length === 0) return;

    const frag = document.createDocumentFragment();
    state.nowIndex = Math.min(state.nowIndex, live.length - 1);
    if (state.nowIndex < 0) state.nowIndex = 0;

    live.forEach((p, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "now-item";
      btn.dataset.login = p.login;
      btn.tabIndex = idx === state.nowIndex ? 0 : -1;

      const playingNow = isNowPlaying(p);
      if (playingNow) {
        btn.classList.add("playing");
        btn.setAttribute("aria-current", "true");
      }

      const viewers = U.compact(p.viewers);
      btn.title = p.name + " · " + p.category + " · " + viewers;
      btn.setAttribute(
        "aria-label",
        p.name + ", Live, " + viewers + " viewers" + (playingNow ? ", playing" : "")
      );

      const img = document.createElement("img");
      img.className = "now-avatar";
      img.src = "../shared/" + p.avatar;
      img.alt = "";
      img.decoding = "async";

      const name = document.createElement("span");
      name.className = "now-name";
      name.textContent = p.name;

      btn.append(img, name);
      btn.addEventListener("click", () => {
        setNowFocusIndex(idx, false);
        playLive(p);
      });
      frag.appendChild(btn);
    });
    nowEl.appendChild(frag);
  }

  function buildTimelineRow(entry, rowIndex) {
    const p = entry.person;
    const v = entry.vod;
    const row = document.createElement("div");
    row.className = "tl-row row";
    row.setAttribute("role", "option");
    row.dataset.index = String(rowIndex);
    row.dataset.login = p.login;
    row.dataset.vod = String(entry.vodIndex);
    const isSelected = rowIndex === state.selectedRow;
    row.setAttribute("aria-selected", isSelected ? "true" : "false");
    row.tabIndex = (state.selectedRow >= 0 ? isSelected : rowIndex === 0) ? 0 : -1;

    const playingNow = isEntryPlaying(entry);
    if (playingNow) {
      row.classList.add("playing");
      row.setAttribute("aria-current", "true");
    }

    const dur = U.duration(v.seconds);
    const age = U.ago(entry.ageIso);
    const progPct = entry.progress != null ? Math.round(entry.progress * 100) : null;
    row.title = p.name + " · " + v.title + " (" + v.category + ")";
    row.setAttribute(
      "aria-label",
      p.name
      + ", " + (entry.isLiveVod ? "Live" : "VOD")
      + ", " + v.title
      + ", " + dur + ", " + age
      + (progPct != null ? ", " + progPct + "% watched" : "")
      + (entry.isNew ? ", new" : "")
      + (playingNow ? ", playing" : "")
    );

    const media = document.createElement("div");
    media.className = "tl-media";
    const thumbWrap = document.createElement("div");
    thumbWrap.className = "tl-thumb-wrap";

    if (entry.thumb) {
      const thumb = document.createElement("img");
      thumb.className = "thumb tl-thumb";
      thumb.src = "../shared/" + entry.thumb;
      thumb.alt = "";
      thumb.decoding = "async";
      thumbWrap.appendChild(thumb);
    } else {
      thumbWrap.appendChild(createSvgPlayPlaceholder());
    }

    const corner = document.createElement("img");
    corner.className = "tl-corner-avatar";
    corner.src = "../shared/" + p.avatar;
    corner.alt = "";
    corner.decoding = "async";
    thumbWrap.appendChild(corner);
    media.appendChild(thumbWrap);

    if (progPct != null) {
      const bar = document.createElement("div");
      bar.className = "progress";
      const fill = document.createElement("i");
      fill.style.width = progPct + "%";
      bar.appendChild(fill);
      media.appendChild(bar);
    }

    const body = document.createElement("div");
    body.className = "tl-body";
    const titleRow = document.createElement("div");
    titleRow.className = "tl-title-row";
    const title = document.createElement("span");
    title.className = "tl-title";
    title.textContent = v.title;
    titleRow.appendChild(title);

    if (entry.isNew) {
      const dot = document.createElement("span");
      dot.className = "tl-new-dot";
      dot.title = "New";
      titleRow.appendChild(dot);
    }

    const meta = document.createElement("div");
    meta.className = "tl-meta";

    const personBtn = document.createElement("button");
    personBtn.type = "button";
    personBtn.className = "row-person";
    personBtn.tabIndex = -1;
    personBtn.textContent = p.name;
    personBtn.title = p.name;
    personBtn.setAttribute("aria-label", p.name);
    personBtn.addEventListener("click", e => {
      e.stopPropagation();
      filterByPerson(p.login);
    });

    const sep = document.createElement("span");
    sep.setAttribute("aria-hidden", "true");
    sep.textContent = "·";

    const rest = document.createElement("span");
    rest.className = "tl-meta-rest";
    rest.textContent = dur + " · " + age;

    meta.append(personBtn, sep, rest);
    body.append(titleRow, meta);
    row.append(media, body);

    row.addEventListener("click", () => {
      selectTimelineRow(rowIndex, false);
      playVod(entry);
    });

    return row;
  }

  function removeSentinel() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    const old = timelineEl.querySelector(".tl-sentinel");
    if (old) old.remove();
  }

  function attachSentinel() {
    removeSentinel();
    if (state.renderedCount >= state.filteredEntries.length) return;
    const sentinel = document.createElement("div");
    sentinel.className = "tl-sentinel";
    timelineEl.appendChild(sentinel);
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(entries => {
        if (entries.some(e => e.isIntersecting)) appendTimelineBatch();
      }, { root: timelineEl, rootMargin: "180px" });
      observer.observe(sentinel);
    }
  }

  function appendTimelineBatch() {
    removeSentinel();
    const total = state.filteredEntries.length;
    if (state.renderedCount >= total) return;
    const batchSize = state.mode === "many" ? PAGE_SIZE : total;
    const end = Math.min(total, state.renderedCount + batchSize);
    const frag = document.createDocumentFragment();

    for (let i = state.renderedCount; i < end; i++) {
      const entry = state.filteredEntries[i];
      const info = dayInfo(entry.ts);
      if (info.key !== state.lastDayKey) {
        state.lastDayKey = info.key;
        const header = document.createElement("div");
        header.className = "day-label";
        header.textContent = info.label;
        frag.appendChild(header);
      }
      frag.appendChild(buildTimelineRow(entry, i));
    }

    state.renderedCount = end;
    timelineEl.appendChild(frag);
    attachSentinel();
  }

  function renderTimeline() {
    removeSentinel();
    timelineEl.textContent = "";
    state.renderedCount = 0;
    state.lastDayKey = null;

    if (state.mode === "new" && !state.activeLogin && !state.query.trim()) {
      timelineEl.hidden = true;
      return;
    }
    timelineEl.hidden = false;

    if (state.filteredEntries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "tl-empty";
      empty.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="6.75" cy="6.75" r="4.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10.2 10.2L13.75 13.75" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tl-empty-action";
      btn.textContent = "Clear";
      btn.addEventListener("click", clearAllFilters);
      empty.appendChild(btn);
      timelineEl.appendChild(empty);
      return;
    }

    appendTimelineBatch();
  }

  function updatePlayingMarks() {
    for (const btn of nowEl.querySelectorAll(".now-item")) {
      const p = state.livePeople.find(x => x.login === btn.dataset.login);
      const active = p ? isNowPlaying(p) : false;
      btn.classList.toggle("playing", active);
      if (active) btn.setAttribute("aria-current", "true");
      else btn.removeAttribute("aria-current");
    }
    for (const row of timelineEl.querySelectorAll(".tl-row")) {
      const idx = Number(row.dataset.index);
      const entry = state.filteredEntries[idx];
      const active = entry ? isEntryPlaying(entry) : false;
      row.classList.toggle("playing", active);
      if (active) row.setAttribute("aria-current", "true");
      else row.removeAttribute("aria-current");
    }
  }

  function filterByPerson(login) {
    state.activeLogin = login;
    state.selectedRow = -1;
    refreshView();
  }

  function clearAllFilters() {
    state.activeLogin = null;
    state.query = "";
    state.selectedRow = -1;
    searchEl.value = "";
    clearEl.hidden = true;
    refreshView();
    searchEl.focus();
  }

  function refreshView() {
    state.filteredEntries = filteredEntries();
    if (state.selectedRow >= state.filteredEntries.length) {
      state.selectedRow = state.filteredEntries.length - 1;
    }
    renderChips();
    renderTimeline();
  }

  function setNowFocusIndex(idx, focusEl) {
    const items = nowEl.querySelectorAll(".now-item");
    if (items.length === 0) return;
    const clamped = Math.max(0, Math.min(items.length - 1, idx));
    state.nowIndex = clamped;
    items.forEach((el, i) => {
      el.tabIndex = i === clamped ? 0 : -1;
    });
    if (focusEl) {
      items[clamped].focus();
      items[clamped].scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  function selectTimelineRow(idx, focusEl) {
    const total = state.filteredEntries.length;
    if (total === 0) return;
    const clamped = Math.max(0, Math.min(total - 1, idx));
    while (clamped >= state.renderedCount && state.renderedCount < total) {
      appendTimelineBatch();
    }
    const prev = timelineEl.querySelector('.tl-row[aria-selected="true"]');
    if (prev) {
      prev.setAttribute("aria-selected", "false");
      prev.tabIndex = -1;
    }
    state.selectedRow = clamped;
    const next = timelineEl.querySelector(`.tl-row[data-index="${clamped}"]`);
    if (next) {
      next.setAttribute("aria-selected", "true");
      next.tabIndex = 0;
      if (focusEl) next.focus();
      next.scrollIntoView({ block: "nearest" });
    }
  }

  function applyHashState() {
    state.mode = getMode();
    state.people = buildPeople(state.mode);
    state.livePeople = state.people.filter(p => p.live);
    state.allEntries = buildTimelineEntries(state.people, state.mode);
    state.activeLogin = null;
    state.query = "";
    state.selectedRow = -1;
    state.nowIndex = 0;
    searchEl.value = "";
    clearEl.hidden = true;
    renderNow();
    refreshView();
    timelineEl.scrollTop = 0;
    nowEl.scrollLeft = 0;
    if (state.mode === "new") {
      requestAnimationFrame(() => searchEl.focus());
    }
  }

  searchEl.addEventListener("input", () => {
    state.query = searchEl.value;
    clearEl.hidden = state.query.length === 0;
    state.selectedRow = -1;
    refreshView();
  });

  clearEl.addEventListener("click", () => {
    state.query = "";
    searchEl.value = "";
    clearEl.hidden = true;
    state.selectedRow = -1;
    refreshView();
    searchEl.focus();
  });

  nowEl.addEventListener("wheel", e => {
    if (nowEl.scrollWidth <= nowEl.clientWidth) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      nowEl.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }, { passive: false });

  timelineEl.addEventListener("scroll", () => {
    if (state.renderedCount >= state.filteredEntries.length) return;
    if (timelineEl.scrollTop + timelineEl.clientHeight >= timelineEl.scrollHeight - 160) {
      appendTimelineBatch();
    }
  });

  document.addEventListener("keydown", e => {
    if (e.metaKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      searchEl.focus();
      searchEl.select();
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      if (state.query || state.activeLogin) {
        clearAllFilters();
      } else {
        U.closePanel();
      }
      return;
    }

    const active = document.activeElement;
    if (active === searchEl) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const firstChip = chipsEl.querySelector(".chip.suggest");
        if (firstChip) firstChip.focus();
        else if (!timelineEl.hidden && state.filteredEntries.length > 0) selectTimelineRow(0, true);
        else if (state.livePeople.length > 0) setNowFocusIndex(state.nowIndex, true);
      } else if (e.key === "Backspace" && searchEl.value === "" && state.activeLogin) {
        state.activeLogin = null;
        refreshView();
      }
      return;
    }

    if (chipsEl.contains(active)) {
      const focusables = Array.from(chipsEl.querySelectorAll("button"));
      const i = focusables.indexOf(active);
      if (e.key === "ArrowRight" && i >= 0 && i < focusables.length - 1) {
        e.preventDefault();
        focusables[i + 1].focus();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (i > 0) focusables[i - 1].focus();
        else searchEl.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (state.livePeople.length > 0) setNowFocusIndex(state.nowIndex, true);
        else if (!timelineEl.hidden && state.filteredEntries.length > 0) selectTimelineRow(0, true);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        searchEl.focus();
      }
      return;
    }

    if (nowEl.contains(active)) {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setNowFocusIndex(state.nowIndex + 1, true);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setNowFocusIndex(state.nowIndex - 1, true);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!timelineEl.hidden && state.filteredEntries.length > 0) {
          selectTimelineRow(Math.max(0, state.selectedRow), true);
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        searchEl.focus();
      }
      return;
    }

    if (timelineEl.contains(active) || active === document.body) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!timelineEl.hidden && state.filteredEntries.length > 0) {
          selectTimelineRow(state.selectedRow < 0 ? 0 : state.selectedRow + 1, true);
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (state.selectedRow > 0) {
          selectTimelineRow(state.selectedRow - 1, true);
        } else if (state.livePeople.length > 0) {
          setNowFocusIndex(state.nowIndex, true);
        } else {
          searchEl.focus();
        }
      } else if (e.key === "ArrowRight" && state.selectedRow >= 0) {
        const entry = state.filteredEntries[state.selectedRow];
        if (entry) {
          e.preventDefault();
          filterByPerson(entry.person.login);
        }
      } else if ((e.key === "Enter" || e.key === " ") && state.selectedRow >= 0) {
        const entry = state.filteredEntries[state.selectedRow];
        if (entry) {
          e.preventDefault();
          playVod(entry);
        }
      }
    }
  });

  window.addEventListener("message", e => {
    const m = e.data || {};
    if (m.type === "playing" && m.playing) {
      state.playing = { ...m.playing };
      if (!state.playingCopyLogin || !state.playingCopyLogin.startsWith(m.playing.login)) {
        state.playingCopyLogin = m.playing.login;
      }
      updatePlayingMarks();
    }
  });

  window.addEventListener("hashchange", applyHashState);
  try {
    if (window.parent && window.parent !== window) {
      window.parent.addEventListener("hashchange", applyHashState);
    }
  } catch (_) {
    // Ignore cross-origin parent listener errors under strict file:// origins.
  }
  applyHashState();
})();
