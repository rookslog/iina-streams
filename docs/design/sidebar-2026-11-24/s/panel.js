"use strict";
(function () {
  const S = window.SNAPSHOT;
  const V = window.VIEWER;
  const U = window.U;

  const heroEl = document.getElementById("hero");
  const searchEl = document.getElementById("search");
  const clearEl = document.getElementById("search-clear");
  const listEl = document.getElementById("vod-list");

  let playing = { ...V.playing };
  let hashState = readHash(window.location.hash);
  let selectedIndex = -1;
  let menuOpen = false;
  let menuIndex = 0;

  function readHash(raw) {
    if (raw === "#signed-out" || raw === "#new" || raw === "#many") return raw;
    try {
      const ph = window.parent && window.parent.location && window.parent.location.hash;
      if (ph === "#signed-out" || ph === "#new" || ph === "#many") return ph;
    } catch (_) {}
    return "";
  }

  function hasHistory() {
    return hashState !== "#new";
  }

  function shortQuality(q) {
    const m = q && q.match(/\(([^)]+)\)/);
    return m ? m[1] : q;
  }

  function progressFor(login, vodIdx) {
    if (!hasHistory()) return null;
    return U.progressOf(login, vodIdx);
  }

  function currentPerson() {
    return U.person(playing.login) || U.ranked[0] || S.people[0] || null;
  }

  function getBroadcasts(person) {
    if (!person) return [];
    const q = searchEl.value.trim().toLowerCase();
    return person.vods
      .map((vod, index) => ({ vod, index }))
      .sort((a, b) => Date.parse(b.vod.at) - Date.parse(a.vod.at))
      .filter(entry => !q || entry.vod.title.toLowerCase().includes(q));
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderHero() {
    const person = currentPerson();
    if (!person) {
      heroEl.innerHTML = '<div class="error-state">Unavailable</div>';
      return;
    }

    const isVod = playing.kind === "vod" && playing.vod != null && person.vods[playing.vod];
    const activeVod = isVod ? person.vods[playing.vod] : null;
    const title = activeVod ? activeVod.title : (person.title || (person.vods[0] && person.vods[0].title) || "");
    const avatarClass = "avatar large" + (person.live ? " live" : " offline");
    const qVal = shortQuality(playing.quality);

    let metaHtml = "";
    if (isVod) {
      const fixed = U.duration(activeVod.seconds) + " · " + U.ago(activeVod.at);
      metaHtml =
        '<span class="hero-meta-fixed num">' + esc(fixed) + '</span>' +
        (activeVod.category ? '<span>·</span><span class="hero-meta-cat">' + esc(activeVod.category) + '</span>' : "");
    } else if (person.live) {
      const fixed = "LIVE " + U.uptime(person.startedAt) + " · " + U.compact(person.viewers);
      metaHtml =
        '<span class="dot" aria-hidden="true"></span>' +
        '<span class="hero-meta-fixed num">' + esc(fixed) + '</span>' +
        (person.category ? '<span>·</span><span class="hero-meta-cat">' + esc(person.category) + '</span>' : "");
    } else {
      const last = person.lastLive ? U.ago(person.lastLive) : "";
      metaHtml = last ? '<span class="hero-meta-fixed num">' + esc(last) + '</span>' : "";
    }

    const liveBtnHtml = isVod && person.live
      ? '<button type="button" class="live-action" id="hero-live" title="' + esc(person.name) + ' LIVE">' +
        '<span class="dot" aria-hidden="true"></span><span>LIVE</span></button>'
      : "";

    let posHtml = "";
    if (isVod) {
      const frac = progressFor(person.login, playing.vod);
      const pct = frac != null ? Math.round(frac * 100) : 0;
      posHtml = '<div class="progress hero-pos" aria-hidden="true"><i style="width:' + pct + '%"></i></div>';
    }

    const menuItemsHtml = V.qualities.map((q, idx) => {
      const checked = shortQuality(q) === shortQuality(playing.quality);
      return '<button type="button" class="quality-option" role="menuitemradio" aria-checked="' + checked + '" data-q="' + esc(q) + '" data-idx="' + idx + '">' +
        '<svg class="quality-check" viewBox="0 0 16 16" aria-hidden="true">' +
        '<path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '<span>' + esc(q) + '</span></button>';
    }).join("");

    heroEl.innerHTML =
      '<div class="hero-top">' +
        '<img class="' + avatarClass + '" src="../shared/' + esc(person.avatar) + '" alt="">' +
        '<div class="hero-id">' +
          '<div class="hero-name-row">' +
            '<span class="name" title="' + esc(person.name) + '">' + esc(person.name) + '</span>' +
            '<div class="hero-actions">' +
              liveBtnHtml +
              '<div class="quality-wrap">' +
                '<button type="button" class="quality-btn" id="quality-btn" aria-haspopup="menu" aria-expanded="false" aria-label="' + esc(qVal) + '" title="' + esc(playing.quality) + '">' +
                  '<span>' + esc(qVal) + '</span>' +
                  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 6.2 8 9.7 11.5 6.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
                '</button>' +
                '<div class="quality-menu" id="quality-menu" role="menu" aria-label="Quality">' + menuItemsHtml + '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="hero-meta meta" title="' + esc(metaTitleText(person, activeVod)) + '">' + metaHtml + '</div>' +
        '</div>' +
      '</div>' +
      (title ? '<div class="hero-title" title="' + esc(title) + '">' + esc(title) + '</div>' : "") +
      posHtml;

    bindHeroEvents(person);
  }

  function metaTitleText(person, activeVod) {
    if (activeVod) {
      return [U.duration(activeVod.seconds), U.ago(activeVod.at), activeVod.category].filter(Boolean).join(" · ");
    }
    if (person.live) {
      return ["LIVE " + U.uptime(person.startedAt), U.compact(person.viewers), person.category].filter(Boolean).join(" · ");
    }
    return person.lastLive ? U.ago(person.lastLive) : person.name;
  }

  function closeAndReturnFocus() {
    if (document.activeElement && typeof document.activeElement.blur === "function") {
      document.activeElement.blur();
    }
    try {
      if (window.parent && typeof window.parent.focus === "function") window.parent.focus();
    } catch (_) {}
    U.closePanel();
  }

  function bindHeroEvents(person) {
    const liveBtn = document.getElementById("hero-live");
    if (liveBtn) {
      liveBtn.addEventListener("click", () => {
        U.play(person.login, null);
        closeAndReturnFocus();
      });
    }

    const qBtn = document.getElementById("quality-btn");
    const qMenu = document.getElementById("quality-menu");
    if (!qBtn || !qMenu) return;

    qBtn.addEventListener("click", e => {
      e.stopPropagation();
      toggleQualityMenu(!menuOpen);
    });

    qBtn.addEventListener("keydown", e => {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleQualityMenu(true);
      }
    });

    qMenu.addEventListener("click", e => {
      const opt = e.target.closest(".quality-option");
      if (!opt) return;
      selectQuality(opt.dataset.q);
    });

    qMenu.addEventListener("keydown", e => {
      const opts = Array.from(qMenu.querySelectorAll(".quality-option"));
      if (e.key === "ArrowDown") {
        e.preventDefault();
        menuIndex = (menuIndex + 1) % opts.length;
        focusMenuOption(opts);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        menuIndex = (menuIndex - 1 + opts.length) % opts.length;
        focusMenuOption(opts);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (opts[menuIndex]) selectQuality(opts[menuIndex].dataset.q);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        toggleQualityMenu(false);
        qBtn.focus();
      } else if (e.key === "Tab") {
        toggleQualityMenu(false);
      }
    });
  }

  function toggleQualityMenu(open) {
    const qBtn = document.getElementById("quality-btn");
    const qMenu = document.getElementById("quality-menu");
    if (!qBtn || !qMenu) return;
    menuOpen = open;
    qBtn.setAttribute("aria-expanded", String(open));
    qMenu.classList.toggle("open", open);
    if (open) {
      const opts = Array.from(qMenu.querySelectorAll(".quality-option"));
      const activeIdx = opts.findIndex(o => o.getAttribute("aria-checked") === "true");
      menuIndex = activeIdx >= 0 ? activeIdx : 0;
      focusMenuOption(opts);
    }
  }

  function focusMenuOption(opts) {
    opts.forEach((o, i) => o.classList.toggle("focused", i === menuIndex));
    if (opts[menuIndex]) opts[menuIndex].focus();
  }

  function selectQuality(q) {
    playing.quality = shortQuality(q);
    try {
      if (window.parent && window.parent.VIEWER && window.parent.VIEWER.playing) {
        window.parent.VIEWER.playing.quality = playing.quality;
      }
    } catch (_) {}
    menuOpen = false;
    renderHero();
    const qBtn = document.getElementById("quality-btn");
    if (qBtn) qBtn.focus();
  }

  function broadcastAccessibleName(person, vod, frac) {
    const parts = [person.name];
    if (person.live) parts.push("live");
    parts.push(vod.title);
    parts.push(U.duration(vod.seconds));
    parts.push(U.ago(vod.at));
    if (frac != null) parts.push(Math.round(frac * 100) + "%");
    return parts.join(", ");
  }

  function renderList() {
    const person = currentPerson();
    if (!person) {
      listEl.innerHTML = "";
      return;
    }

    listEl.setAttribute("aria-label", person.name);
    const items = getBroadcasts(person);

    if (items.length === 0) {
      selectedIndex = -1;
      listEl.innerHTML =
        '<div class="empty-state">' +
          '<svg viewBox="0 0 16 16" aria-hidden="true">' +
            '<circle cx="6.8" cy="6.8" r="4.5" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
            '<path d="M10.2 10.2 13.8 13.8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>' +
          '</svg>' +
          '<button type="button" class="action-btn" id="empty-clear">Clear</button>' +
        '</div>';
      const emptyClear = document.getElementById("empty-clear");
      if (emptyClear) emptyClear.addEventListener("click", clearSearch);
      return;
    }

    if (selectedIndex >= items.length) selectedIndex = items.length - 1;

    listEl.innerHTML = items.map((entry, rowIdx) => {
      const v = entry.vod;
      const frac = progressFor(person.login, entry.index);
      const isCurrent = playing.kind === "vod" && playing.vod === entry.index;
      const isSelected = rowIdx === selectedIndex;
      const thumbHtml = v.thumb
        ? '<img class="thumb vod-thumb" src="../shared/' + esc(v.thumb) + '" alt="">'
        : '<div class="vod-thumb-fallback" aria-hidden="true">' +
            '<svg viewBox="0 0 16 16"><path fill="currentColor" d="M5.5 3.8v8.4l7-4.2-7-4.2Z"/></svg>' +
          '</div>';
      const progHtml = frac != null
        ? '<div class="progress" aria-hidden="true"><i style="width:' + Math.round(frac * 100) + '%"></i></div>'
        : "";
      const tip = [v.title, U.duration(v.seconds), U.ago(v.at), frac != null ? Math.round(frac * 100) + "%" : ""].filter(Boolean).join(" · ");

      return '<div class="vod-row row" role="option" tabindex="0" ' +
        'aria-selected="' + isSelected + '" ' +
        (isCurrent ? 'aria-current="true" ' : "") +
        'aria-label="' + esc(broadcastAccessibleName(person, v, frac)) + '" ' +
        'title="' + esc(tip) + '" ' +
        'data-row="' + rowIdx + '" data-vod="' + entry.index + '">' +
        thumbHtml +
        '<div class="vod-info">' +
          '<div class="vod-title">' + esc(v.title) + '</div>' +
          '<div class="meta">' + esc(U.duration(v.seconds) + " · " + U.ago(v.at)) + '</div>' +
          progHtml +
        '</div>' +
      '</div>';
    }).join("");
  }

  function updateSelection(nextIdx, shouldScroll) {
    const rows = Array.from(listEl.querySelectorAll(".vod-row"));
    if (rows.length === 0) {
      selectedIndex = -1;
      return;
    }
    selectedIndex = Math.max(0, Math.min(nextIdx, rows.length - 1));
    rows.forEach((r, i) => r.setAttribute("aria-selected", String(i === selectedIndex)));
    if (shouldScroll && rows[selectedIndex]) {
      rows[selectedIndex].scrollIntoView({ block: "nearest" });
    }
  }

  function playSelected() {
    const person = currentPerson();
    const rows = listEl.querySelectorAll(".vod-row");
    const row = selectedIndex >= 0 ? rows[selectedIndex] : rows[0];
    if (!person || !row) return;
    U.play(person.login, Number(row.dataset.vod));
    closeAndReturnFocus();
  }

  function clearSearch() {
    searchEl.value = "";
    clearEl.hidden = true;
    selectedIndex = -1;
    renderList();
    searchEl.focus();
  }

  function applyHash(nextHash) {
    const normalized = nextHash === "#signed-out" || nextHash === "#new" || nextHash === "#many" ? nextHash : "";
    if (normalized === hashState) return;
    hashState = normalized;
    selectedIndex = -1;
    renderHero();
    renderList();
    if (hashState === "#new" && document.hasFocus()) searchEl.focus();
  }

  searchEl.addEventListener("input", () => {
    clearEl.hidden = searchEl.value.length === 0;
    selectedIndex = -1;
    renderList();
  });

  clearEl.addEventListener("click", clearSearch);

  listEl.addEventListener("click", e => {
    const row = e.target.closest(".vod-row");
    if (!row) return;
    const person = currentPerson();
    if (!person) return;
    updateSelection(Number(row.dataset.row), false);
    U.play(person.login, Number(row.dataset.vod));
    closeAndReturnFocus();
  });

  listEl.addEventListener("focusin", e => {
    const row = e.target.closest(".vod-row");
    if (!row) return;
    updateSelection(Number(row.dataset.row), false);
  });

  document.addEventListener("click", e => {
    if (menuOpen && !e.target.closest(".quality-wrap")) {
      toggleQualityMenu(false);
    }
  });

  document.addEventListener("keydown", e => {
    if (e.metaKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      searchEl.focus();
      searchEl.select();
      return;
    }

    if (menuOpen) return;

    if (e.key === "Escape") {
      e.preventDefault();
      if (searchEl.value.length > 0) {
        clearSearch();
      } else {
        closeAndReturnFocus();
      }
      return;
    }

    const rows = listEl.querySelectorAll(".vod-row");
    if (e.key === "ArrowDown") {
      if (rows.length === 0) return;
      e.preventDefault();
      const next = selectedIndex < 0 ? 0 : selectedIndex + 1;
      updateSelection(next, true);
      if (document.activeElement !== searchEl && rows[selectedIndex]) rows[selectedIndex].focus();
    } else if (e.key === "ArrowUp") {
      if (rows.length === 0) return;
      e.preventDefault();
      const next = selectedIndex <= 0 ? 0 : selectedIndex - 1;
      updateSelection(next, true);
      if (document.activeElement !== searchEl && rows[selectedIndex]) rows[selectedIndex].focus();
    } else if (e.key === "Enter") {
      if (e.target.closest(".quality-wrap") || e.target.id === "hero-live" || e.target.id === "search-clear" || e.target.id === "empty-clear") {
        return;
      }
      if (rows.length > 0 && (document.activeElement === searchEl || e.target.closest(".vod-row"))) {
        e.preventDefault();
        playSelected();
      }
    }
  });

  window.addEventListener("message", e => {
    const m = e.data || {};
    if (m.type === "playing" && m.playing) {
      playing = { ...playing, ...m.playing };
      selectedIndex = -1;
      renderHero();
      renderList();
    } else if (m.type === "hash") {
      applyHash(m.hash);
    } else if (m.type === "panel-opened" && hashState === "#new") {
      searchEl.focus();
    }
  });

  window.addEventListener("hashchange", () => applyHash(window.location.hash));

  renderHero();
  renderList();
  if (hashState === "#new" && document.hasFocus()) searchEl.focus();
})();
