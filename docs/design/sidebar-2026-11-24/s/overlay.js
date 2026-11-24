"use strict";
(function () {
  const S = window.SNAPSHOT;
  const V = window.VIEWER;
  const U = window.U;

  const backdropEl = document.getElementById("backdrop");
  const searchEl = document.getElementById("search");
  const clearEl = document.getElementById("search-clear");
  const rowLiveEl = document.getElementById("row-live");
  const rowSepEl = document.getElementById("row-sep");
  const rowVodsEl = document.getElementById("row-vods");
  const emptyRowEl = document.getElementById("empty-row");
  const emptyClearEl = document.getElementById("empty-clear");

  let active = false;
  let hashState = readHash(window.location.hash);
  let playing = { ...V.playing, id: V.playing.login };
  let previous = initialPrevious();
  let activeRow = 0;
  let activeCol = 0;
  let liveItems = [];
  let vodItems = [];

  function readHash(raw) {
    if (raw === "#signed-out" || raw === "#new" || raw === "#many") return raw;
    try {
      const ph = window.parent && window.parent.location && window.parent.location.hash;
      if (ph === "#signed-out" || ph === "#new" || ph === "#many") return ph;
    } catch (_) {}
    return "";
  }

  function initialPrevious() {
    const firstOther = U.ranked.find(p => p.live && p.login !== V.playing.login);
    return firstOther ? { kind: "live", login: firstOther.login, id: firstOther.login, vod: null } : null;
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function buildPeoplePool() {
    const base = hashState === "#new" ? S.people : U.ranked;
    if (hashState !== "#many") {
      return base.map(p => ({ ...p, id: p.login, baseLogin: p.login }));
    }
    const pool = [];
    let copyNum = 1;
    while (pool.length < 300) {
      for (const p of base) {
        if (pool.length >= 300) break;
        const suffix = copyNum === 1 ? "" : " " + copyNum;
        pool.push({
          ...p,
          id: copyNum === 1 ? p.login : p.login + "-" + copyNum,
          baseLogin: p.login,
          name: p.name + suffix
        });
      }
      copyNum += 1;
    }
    return pool;
  }

  function computeRows() {
    const q = searchEl.value.trim().toLowerCase();
    liveItems = buildPeoplePool()
      .filter(p => p.live)
      .filter(p => !q || p.name.toLowerCase().includes(q) || (p.category && p.category.toLowerCase().includes(q)));

    vodItems = hashState === "#new"
      ? []
      : U.unfinished().filter(u =>
          !q || u.person.name.toLowerCase().includes(q) || u.video.title.toLowerCase().includes(q)
        );
  }

  function isCurrentLive(p) {
    return playing.kind === "live" && (playing.id ? playing.id === p.id : playing.login === p.baseLogin);
  }

  function isCurrentVod(u) {
    return playing.kind === "vod" && playing.login === u.login && playing.vod === u.vod;
  }

  function selectPrevious() {
    if (liveItems.length === 0 && vodItems.length === 0) return;
    if (previous) {
      if (previous.kind === "vod") {
        const vIdx = vodItems.findIndex(u => u.login === previous.login && u.vod === previous.vod);
        if (vIdx >= 0) {
          activeRow = 1;
          activeCol = vIdx;
          return;
        }
      } else {
        const lIdx = liveItems.findIndex(p => (previous.id ? p.id === previous.id : p.baseLogin === previous.login));
        if (lIdx >= 0) {
          activeRow = 0;
          activeCol = lIdx;
          return;
        }
      }
    }
    if (liveItems.length > 0) {
      const otherIdx = liveItems.findIndex(p => !isCurrentLive(p));
      activeRow = 0;
      activeCol = otherIdx >= 0 ? otherIdx : 0;
    } else {
      activeRow = 1;
      activeCol = 0;
    }
  }

  function clampSelection() {
    if (liveItems.length === 0 && vodItems.length === 0) {
      activeRow = 0;
      activeCol = 0;
      return;
    }
    if (activeRow === 0 && liveItems.length === 0) activeRow = 1;
    if (activeRow === 1 && vodItems.length === 0) activeRow = 0;
    const len = activeRow === 0 ? liveItems.length : vodItems.length;
    activeCol = Math.max(0, Math.min(activeCol, len - 1));
  }

  function render() {
    computeRows();
    clampSelection();

    rowLiveEl.hidden = liveItems.length === 0;
    rowVodsEl.hidden = vodItems.length === 0;
    rowSepEl.hidden = liveItems.length === 0 || vodItems.length === 0;
    emptyRowEl.hidden = liveItems.length > 0 || vodItems.length > 0;
    clearEl.hidden = searchEl.value.length === 0;

    rowLiveEl.innerHTML = liveItems.map((p, idx) => {
      const selected = activeRow === 0 && activeCol === idx;
      const current = isCurrentLive(p);
      const viewers = U.compact(p.viewers);
      const aria = [p.name, "live", viewers, p.category].filter(Boolean).join(", ");
      const tip = [p.name, viewers, p.category, p.title].filter(Boolean).join(" · ");
      return '<div class="person-tile" role="option" tabindex="0" ' +
        'aria-selected="' + selected + '" ' +
        (current ? 'aria-current="true" ' : "") +
        'aria-label="' + esc(aria) + '" ' +
        'title="' + esc(tip) + '" ' +
        'data-col="' + idx + '">' +
        '<img class="avatar live avatar-56" src="../shared/' + esc(p.avatar) + '" alt="">' +
        '<span class="name">' + esc(p.name) + '</span>' +
        '<span class="meta num">' + esc(viewers) + '</span>' +
      '</div>';
    }).join("");

    rowVodsEl.innerHTML = vodItems.map((u, idx) => {
      const selected = activeRow === 1 && activeCol === idx;
      const current = isCurrentVod(u);
      const pct = Math.round(u.fraction * 100);
      const aria = [u.person.name, u.video.title, U.duration(u.video.seconds), pct + "%"].join(", ");
      const tip = [u.person.name, u.video.title, U.duration(u.video.seconds), pct + "%"].join(" · ");
      const thumbSrc = u.video.thumb || u.person.preview || u.person.avatar;
      return '<div class="vod-tile" role="option" tabindex="0" ' +
        'aria-selected="' + selected + '" ' +
        (current ? 'aria-current="true" ' : "") +
        'aria-label="' + esc(aria) + '" ' +
        'title="' + esc(tip) + '" ' +
        'data-col="' + idx + '">' +
        '<img class="thumb thumb-120" src="../shared/' + esc(thumbSrc) + '" alt="">' +
        '<div class="progress" aria-hidden="true"><i style="width:' + pct + '%"></i></div>' +
        '<span class="name">' + esc(u.person.name) + '</span>' +
      '</div>';
    }).join("");

    scrollSelectedIntoView();
  }

  function scrollSelectedIntoView() {
    const rowEl = activeRow === 0 ? rowLiveEl : rowVodsEl;
    const tile = rowEl.querySelector('[aria-selected="true"]');
    if (tile) tile.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function updateSelectionOnly() {
    clampSelection();
    for (const el of rowLiveEl.children) {
      el.setAttribute("aria-selected", String(activeRow === 0 && Number(el.dataset.col) === activeCol));
    }
    for (const el of rowVodsEl.children) {
      el.setAttribute("aria-selected", String(activeRow === 1 && Number(el.dataset.col) === activeCol));
    }
    scrollSelectedIntoView();
  }

  function setOverlayActive(nextActive) {
    active = nextActive;
    backdropEl.classList.toggle("active", active);
    backdropEl.setAttribute("aria-hidden", String(!active));
    parent.postMessage({ type: "overlay-active", active }, "*");

    if (active) {
      searchEl.value = "";
      computeRows();
      selectPrevious();
      render();
      if (hashState === "#new") {
        requestAnimationFrame(() => searchEl.focus());
      }
    }
  }

  function playChoice(row, col) {
    const item = row === 0 ? liveItems[col] : vodItems[col];
    if (!item) return;

    const next = row === 0
      ? { kind: "live", login: item.baseLogin, id: item.id, vod: null }
      : { kind: "vod", login: item.login, id: item.login, vod: item.vod };

    if (playing.login !== next.login || playing.kind !== next.kind || playing.vod !== next.vod || playing.id !== next.id) {
      previous = { ...playing };
      playing = { ...playing, ...next };
    }

    U.play(next.login, next.vod);
    setOverlayActive(false);
  }

  function moveHorizontal(delta) {
    const len = activeRow === 0 ? liveItems.length : vodItems.length;
    if (len === 0) return;
    activeCol = Math.max(0, Math.min(activeCol + delta, len - 1));
    updateSelectionOnly();
  }

  function moveVertical(targetRow) {
    if (targetRow === 0 && liveItems.length > 0) {
      activeRow = 0;
      activeCol = Math.min(activeCol, liveItems.length - 1);
      updateSelectionOnly();
    } else if (targetRow === 1 && vodItems.length > 0) {
      activeRow = 1;
      activeCol = Math.min(activeCol, vodItems.length - 1);
      updateSelectionOnly();
    }
  }

  function handleKeyEvent(e, fromFrame) {
    if (e.key === "Tab") {
      if (!active) {
        setOverlayActive(true);
        return true;
      }
      if (e.shiftKey) {
        moveHorizontal(-1);
      } else {
        const len = activeRow === 0 ? liveItems.length : vodItems.length;
        if (len > 0) {
          activeCol = (activeCol + 1) % len;
          updateSelectionOnly();
        }
      }
      return true;
    }

    if (!active) return false;

    if (e.key === "Escape") {
      if (searchEl.value.length > 0) {
        searchEl.value = "";
        selectPrevious();
        render();
      } else {
        setOverlayActive(false);
      }
      return true;
    }

    if (e.key === "ArrowLeft") {
      moveHorizontal(-1);
      return true;
    }
    if (e.key === "ArrowRight") {
      moveHorizontal(1);
      return true;
    }
    if (e.key === "ArrowDown") {
      moveVertical(1);
      return true;
    }
    if (e.key === "ArrowUp") {
      moveVertical(0);
      return true;
    }
    if (e.key === "Enter") {
      if (liveItems.length === 0 && vodItems.length === 0) {
        searchEl.value = "";
        selectPrevious();
        render();
      } else {
        playChoice(activeRow, activeCol);
      }
      return true;
    }

    if (fromFrame || document.activeElement !== searchEl) {
      if (e.key === "Backspace") {
        searchEl.value = searchEl.value.slice(0, -1);
        activeCol = 0;
        render();
        return true;
      }
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key && e.key.length === 1) {
        searchEl.value += e.key;
        activeRow = 0;
        activeCol = 0;
        render();
        return true;
      }
    }
    return false;
  }

  function applyHash(nextHash) {
    const normalized = nextHash === "#signed-out" || nextHash === "#new" || nextHash === "#many" ? nextHash : "";
    if (normalized === hashState) return;
    hashState = normalized;
    computeRows();
    selectPrevious();
    render();
    if (active && hashState === "#new") {
      requestAnimationFrame(() => searchEl.focus());
    }
  }

  searchEl.addEventListener("input", () => {
    activeRow = 0;
    activeCol = 0;
    render();
  });

  clearEl.addEventListener("click", () => {
    searchEl.value = "";
    selectPrevious();
    render();
    searchEl.focus();
  });

  emptyClearEl.addEventListener("click", () => {
    searchEl.value = "";
    selectPrevious();
    render();
    searchEl.focus();
  });

  backdropEl.addEventListener("click", e => {
    if (e.target === backdropEl) setOverlayActive(false);
  });

  rowLiveEl.addEventListener("click", e => {
    const tile = e.target.closest(".person-tile");
    if (!tile) return;
    playChoice(0, Number(tile.dataset.col));
  });

  rowVodsEl.addEventListener("click", e => {
    const tile = e.target.closest(".vod-tile");
    if (!tile) return;
    playChoice(1, Number(tile.dataset.col));
  });

  document.addEventListener("keydown", e => {
    if (handleKeyEvent(e, false)) e.preventDefault();
  });

  window.addEventListener("message", e => {
    const m = e.data || {};
    if (m.type === "key") {
      handleKeyEvent(m, true);
    } else if (m.type === "playing" && m.playing) {
      const next = {
        kind: m.playing.kind || "live",
        login: m.playing.login,
        id: playing.login === m.playing.login && playing.id ? playing.id : m.playing.login,
        vod: m.playing.vod ?? null
      };
      if (playing.login !== next.login || playing.kind !== next.kind || playing.vod !== next.vod) {
        previous = { ...playing };
        playing = { ...playing, ...next };
      }
      if (active) render();
    } else if (m.type === "hash") {
      applyHash(m.hash);
    }
  });

  window.addEventListener("hashchange", () => applyHash(window.location.hash));

  computeRows();
  selectPrevious();
  render();
})();
