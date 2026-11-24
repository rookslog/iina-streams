"use strict";
(function () {
  var S = window.SNAPSHOT;
  var V = window.VIEWER;
  var U = window.U;
  var app = document.getElementById("app");
  if (!S || !V || !U || !app) {
    if (app) app.innerHTML = '<div class="error-state">No data</div>';
    return;
  }

  var ICONS = {
    back: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5L5.5 8 10 12.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    search: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.5 10.5L14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    chevrons: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 6.5L8 3.5l3 3M5 9.5L8 12.5l3-3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  var state = {
    mode: readHashMode(),
    playing: clonePlaying(V.playing),
    playingDisplayLogin: V.playing.login,
    pendingDisplayLogin: null,
    viewedLogin: V.playing.login,
    searchOpen: false,
    query: "",
    qualityOpen: false,
    selectedVod: 0,
    selectedSearch: 0,
    stripFocusIndex: 0
  };

  var dataset = buildDataset(state.mode);

  function clonePlaying(p) {
    return { login: p.login, kind: p.kind || "live", vod: p.vod ?? null, quality: p.quality || "1080p60" };
  }

  function readHashMode() {
    var h = window.location.hash || "";
    if (!h && window.parent !== window) {
      try { h = window.parent.location.hash || ""; } catch (e) { h = ""; }
    }
    if (h === "#signed-out" || h === "#new" || h === "#many") return h.slice(1);
    return "default";
  }

  function applyHash(raw) {
    var next = (raw === "#signed-out" || raw === "#new" || raw === "#many") ? raw.slice(1) : "default";
    if (next === state.mode) return;
    state.mode = next;
    dataset = buildDataset(state.mode);
    if (!dataset.byLogin[state.viewedLogin]) state.viewedLogin = state.playingDisplayLogin;
    if (!dataset.byLogin[state.viewedLogin]) state.viewedLogin = dataset.people[0].login;
    state.selectedVod = 0;
    state.selectedSearch = 0;
    state.stripFocusIndex = 0;
    render();
  }

  function historySet() {
    var set = {};
    Object.keys(V.lastVisitDaysAgo || {}).forEach(function (k) { set[k] = true; });
    (V.unfinished || []).forEach(function (u) { set[u.login] = true; });
    return set;
  }

  function buildDataset(mode) {
    var basePeople = S.people.map(function (p) {
      return Object.assign({}, p, { baseLogin: p.login });
    });
    var people;
    if (mode === "many") {
      people = [];
      for (var copy = 1; copy <= 22; copy++) {
        for (var i = 0; i < basePeople.length; i++) {
          var src = basePeople[i];
          if (copy === 1) {
            people.push(src);
          } else {
            people.push(Object.assign({}, src, {
              login: src.login + "-" + copy,
              name: src.name + " " + copy,
              baseLogin: src.login
            }));
          }
        }
      }
    } else if (mode === "signed-out") {
      var hist = historySet();
      people = basePeople.filter(function (p) { return hist[p.login]; });
    } else {
      people = basePeople;
    }

    var byLogin = Object.create(null);
    people.forEach(function (p) { byLogin[p.login] = p; });

    var ranked = [];
    if (mode === "new") {
      ranked = people.slice();
    } else {
      var seen = Object.create(null);
      V.rank.forEach(function (login) {
        if (byLogin[login]) { ranked.push(byLogin[login]); seen[login] = true; }
      });
      people.forEach(function (p) {
        if (!seen[p.login]) ranked.push(p);
      });
    }

    var unfinishedMap = Object.create(null);
    var unfinishedPeople = [];
    if (mode !== "new") {
      V.unfinished.forEach(function (u) {
        var p = byLogin[u.login];
        if (!p || !p.vods[u.vod]) return;
        if (!unfinishedMap[p.login]) {
          unfinishedMap[p.login] = Object.create(null);
          if (!p.live) unfinishedPeople.push({ person: p, fraction: u.fraction, vod: u.vod });
        }
        unfinishedMap[p.login][u.vod] = u.fraction;
      });
    }

    var liveStrip = ranked.filter(function (p) { return p.live; });
    return { people: people, byLogin: byLogin, ranked: ranked, unfinishedMap: unfinishedMap, unfinishedPeople: unfinishedPeople, liveStrip: liveStrip };
  }

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function imgSrc(relPath) {
    return "../shared/" + relPath;
  }

  function progressFor(person, vodIndex) {
    if (state.mode === "new") return null;
    var map = dataset.unfinishedMap[person.baseLogin];
    if (!map) return null;
    return map[vodIndex] != null ? map[vodIndex] : null;
  }

  function isViewingPlaying(person) {
    return person.login === state.playingDisplayLogin || (person.baseLogin === state.playing.login && !dataset.byLogin[state.playingDisplayLogin]);
  }

  function qualityLabel(q) {
    return q || "1080p60";
  }

  function qualityMatches(option, current) {
    if (option === current) return true;
    return option === "Source (1080p60)" && current === "1080p60";
  }

  function stripAriaLabel(person, fraction) {
    var parts = [person.name];
    if (person.live) {
      parts.push("live " + U.uptime(person.startedAt));
      parts.push(U.compact(person.viewers) + " viewers");
    } else {
      parts.push("offline");
      if (fraction != null) parts.push(Math.round(fraction * 100) + "% watched");
    }
    return parts.join(", ");
  }

  function vodAriaLabel(person, v, frac) {
    var parts = [v.title, U.duration(v.seconds), U.ago(v.at)];
    if (frac != null) parts.push(Math.round(frac * 100) + "% watched");
    return parts.join(", ");
  }

  function personSearchAriaLabel(person) {
    if (person.live) {
      return person.name + ", live " + U.uptime(person.startedAt) + ", " + person.category + ", " + U.compact(person.viewers) + " viewers";
    }
    return person.name + ", offline, " + U.ago(person.lastLive);
  }

  function renderTopBlock(person) {
    var isCurrentPlaying = isViewingPlaying(person);
    var isVodPlaying = isCurrentPlaying && state.playing.kind === "vod" && state.playing.vod != null;
    var activeVod = isVodPlaying ? person.vods[state.playing.vod] : null;
    var showBack = !isCurrentPlaying;
    var showLiveAction = person.live && (!isCurrentPlaying || isVodPlaying);
    var titleText = activeVod ? activeVod.title : (person.live ? person.title : (person.vods[0] ? person.vods[0].title : ""));
    var metaHtml = "";

    if (activeVod) {
      metaHtml =
        '<span class="meta-cat">' + esc(activeVod.category || person.category || "") + '</span>' +
        '<span class="meta-sep" aria-hidden="true">·</span>' +
        '<span class="meta-fixed num">' + esc(U.duration(activeVod.seconds)) + '</span>' +
        '<span class="meta-sep" aria-hidden="true">·</span>' +
        '<span class="meta-fixed num">' + esc(U.ago(activeVod.at)) + '</span>';
    } else if (person.live) {
      metaHtml =
        '<span class="dot" aria-hidden="true"></span>' +
        '<span class="meta-fixed meta-live-label num">LIVE ' + esc(U.uptime(person.startedAt)) + '</span>' +
        '<span class="meta-sep" aria-hidden="true">·</span>' +
        '<span class="meta-cat">' + esc(person.category) + '</span>' +
        '<span class="meta-sep" aria-hidden="true">·</span>' +
        '<span class="meta-fixed num">' + esc(U.compact(person.viewers)) + '</span>';
    } else {
      metaHtml = '<span class="meta-fixed num">' + esc(U.ago(person.lastLive)) + '</span>';
    }

    var vodPosHtml = "";
    if (activeVod) {
      var frac = progressFor(person, state.playing.vod);
      var pct = frac != null ? Math.round(frac * 100) : 0;
      vodPosHtml = '<div class="progress top-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>';
    }

    var qMenuHtml = "";
    if (isCurrentPlaying) {
      var qLabel = qualityLabel(state.playing.quality);
      var optionsHtml = V.qualities.map(function (q, idx) {
        var active = qualityMatches(q, state.playing.quality);
        return '<button type="button" class="quality-option' + (active ? ' is-active' : '') + '" role="menuitemradio" aria-checked="' + active + '" data-quality="' + esc(q) + '" data-q-idx="' + idx + '">' +
          '<span class="quality-check">' + ICONS.check + '</span><span>' + esc(q) + '</span></button>';
      }).join("");
      qMenuHtml =
        '<div class="top-footer-end">' +
          '<button type="button" id="quality-btn" class="quality-btn" aria-haspopup="menu" aria-expanded="' + state.qualityOpen + '" title="' + esc(qLabel) + '">' +
            '<span>' + esc(qLabel) + '</span>' + ICONS.chevrons +
          '</button>' +
          '<div id="quality-menu" class="quality-menu" role="menu"' + (state.qualityOpen ? '' : ' hidden') + '>' + optionsHtml + '</div>' +
        '</div>';
    }

    var footerHtml = (showLiveAction || isCurrentPlaying) ? (
      '<div class="top-footer">' +
        (showLiveAction ? '<button type="button" id="live-action" class="live-action" data-login="' + esc(person.login) + '"><span class="dot" aria-hidden="true"></span><span>LIVE</span></button>' : '<span></span>') +
        qMenuHtml +
      '</div>'
    ) : "";

    var avatarClass = "avatar large " + (person.live ? "live" : "offline");
    return (
      '<section class="top-block">' +
        '<div class="top-header">' +
          (showBack ? '<button type="button" id="top-back" class="icon-button top-back" aria-label="Back" title="' + esc((dataset.byLogin[state.playingDisplayLogin] || person).name) + '">' + ICONS.back + '</button>' : '') +
          '<img class="' + avatarClass + '" src="' + esc(imgSrc(person.avatar)) + '" alt="">' +
          '<div class="top-identity">' +
            '<div class="name top-name" title="' + esc(person.name) + '">' + esc(person.name) + '</div>' +
            '<div class="meta top-meta" title="' + esc(person.live ? person.category : "") + '">' + metaHtml + '</div>' +
          '</div>' +
        '</div>' +
        (titleText ? '<p class="top-title" title="' + esc(titleText) + '">' + esc(titleText) + '</p>' : '') +
        vodPosHtml +
        footerHtml +
      '</section>'
    );
  }

  function sortedVods(person) {
    return person.vods.map(function (v, idx) {
      return { v: v, idx: idx, ts: Date.parse(v.at) || 0 };
    }).sort(function (a, b) {
      return b.ts - a.ts;
    });
  }

  function sortedIndexOfVod(person, vodIdx) {
    if (vodIdx == null) return 0;
    var list = sortedVods(person);
    for (var i = 0; i < list.length; i++) {
      if (list[i].idx === vodIdx) return i;
    }
    return 0;
  }

  function renderBroadcasts(person) {
    var list = sortedVods(person);
    if (state.selectedVod >= list.length) state.selectedVod = 0;
    var activeAttr = list.length ? ' aria-activedescendant="vod-opt-' + state.selectedVod + '"' : "";
    var rows = list.map(function (item, pos) {
      var v = item.v;
      var thumb = v.thumb || person.preview || person.avatar;
      var frac = progressFor(person, item.idx);
      var pct = frac != null ? Math.round(frac * 100) : null;
      var isSelected = pos === state.selectedVod;
      var isPlayingVod = isViewingPlaying(person) && state.playing.kind === "vod" && state.playing.vod === item.idx;
      var cls = "vod-row" + (isPlayingVod ? " is-playing" : "");
      return (
        '<button type="button" id="vod-opt-' + pos + '" class="' + cls + '" role="option" aria-selected="' + isSelected + '" aria-label="' + esc(vodAriaLabel(person, v, frac)) + '" data-vod-idx="' + item.idx + '" data-pos="' + pos + '" title="' + esc(v.title) + '" tabindex="-1">' +
          '<img class="thumb vod-thumb" src="' + esc(imgSrc(thumb)) + '" alt="">' +
          '<div class="vod-body">' +
            '<div class="vod-title">' + esc(v.title) + '</div>' +
            '<div class="meta">' + esc(U.duration(v.seconds)) + ' · ' + esc(U.ago(v.at)) + '</div>' +
            (pct != null ? '<div class="progress vod-progress"><i style="width:' + pct + '%"></i></div>' : '') +
          '</div>' +
        '</button>'
      );
    }).join("");
    return '<div id="broadcasts" class="broadcasts scroll" role="listbox" tabindex="0"' + activeAttr + ' aria-label="' + esc(person.name) + '">' + rows + '</div>';
  }

  function filteredPeople() {
    var q = state.query.trim().toLowerCase();
    var live = [];
    var offline = [];
    for (var i = 0; i < dataset.ranked.length; i++) {
      var p = dataset.ranked[i];
      if (q && p.name.toLowerCase().indexOf(q) === -1 && p.login.toLowerCase().indexOf(q) === -1) continue;
      if (p.live) live.push(p); else offline.push(p);
    }
    return live.concat(offline);
  }

  function renderSearchRows(matches) {
    if (state.selectedSearch >= matches.length) state.selectedSearch = Math.max(0, matches.length - 1);
    return matches.map(function (p, pos) {
      var selected = pos === state.selectedSearch;
      var avatarCls = "avatar " + (p.live ? "live" : "offline");
      var meta = p.live
        ? '<span class="dot" aria-hidden="true"></span><span>LIVE ' + esc(U.uptime(p.startedAt)) + ' · ' + esc(p.category) + '</span>'
        : '<span>' + esc(U.ago(p.lastLive)) + '</span>';
      var endText = p.live ? U.compact(p.viewers) : "";
      var tip = p.live ? (p.name + " — " + p.title) : p.name;
      return (
        '<button type="button" id="search-opt-' + pos + '" class="row person-row" role="option" aria-selected="' + selected + '" aria-label="' + esc(personSearchAriaLabel(p)) + '" data-login="' + esc(p.login) + '" data-pos="' + pos + '" title="' + esc(tip) + '" tabindex="-1">' +
          '<img class="' + avatarCls + '" src="' + esc(imgSrc(p.avatar)) + '" alt="" loading="lazy">' +
          '<div class="text">' +
            '<div class="name">' + esc(p.name) + '</div>' +
            '<div class="meta top-meta">' + meta + '</div>' +
          '</div>' +
          (endText ? '<span class="person-row-end">' + esc(endText) + '</span>' : '') +
        '</button>'
      );
    }).join("");
  }

  function renderSearchView() {
    var matches = filteredPeople();
    var rows = renderSearchRows(matches);
    var activeDesc = matches.length ? ' aria-activedescendant="search-opt-' + state.selectedSearch + '"' : "";
    return (
      '<div class="search-bar">' +
        '<button type="button" id="search-back" class="icon-button" aria-label="Back" title="Back">' + ICONS.back + '</button>' +
        '<div class="search">' +
          ICONS.search +
          '<input id="search-input" type="search" placeholder="Search" autocomplete="off" spellcheck="false" value="' + esc(state.query) + '" aria-label="Search">' +
        '</div>' +
      '</div>' +
      '<div id="people-list" class="people-list scroll" role="listbox" tabindex="0"' + activeDesc + ' aria-label="People">' + rows + '</div>'
    );
  }

  function renderStrip() {
    var r = 17;
    var circ = 2 * Math.PI * r;
    var items = [];
    dataset.liveStrip.forEach(function (p) {
      items.push({ person: p, fraction: null });
    });
    var hasLive = items.length > 0;
    var hasUnfinished = dataset.unfinishedPeople.length > 0;
    dataset.unfinishedPeople.forEach(function (u) {
      items.push({ person: u.person, fraction: u.fraction });
    });

    if (state.stripFocusIndex >= items.length) state.stripFocusIndex = Math.max(0, items.length - 1);

    var html = "";
    items.forEach(function (entry, idx) {
      if (hasLive && hasUnfinished && idx === dataset.liveStrip.length) {
        html += '<span class="strip-sep" aria-hidden="true"></span>';
      }
      var p = entry.person;
      var viewed = !state.searchOpen && p.login === state.viewedLogin;
      var playing = isViewingPlaying(p);
      var cls = "strip-avatar-btn" + (viewed ? " is-viewed" : "") + (playing ? " is-playing" : "");
      var avCls = "strip-avatar " + (p.live ? "live" : "offline");
      var arcHtml = "";
      if (!p.live && entry.fraction != null) {
        var offset = (circ * (1 - entry.fraction)).toFixed(2);
        arcHtml =
          '<svg class="strip-arc" viewBox="0 0 38 38" aria-hidden="true">' +
            '<circle class="strip-arc-track" cx="19" cy="19" r="' + r + '"></circle>' +
            '<circle class="strip-arc-fill" cx="19" cy="19" r="' + r + '" stroke-dasharray="' + circ.toFixed(2) + '" stroke-dashoffset="' + offset + '"></circle>' +
          '</svg>';
      }
      var tab = idx === state.stripFocusIndex ? "0" : "-1";
      html +=
        '<button type="button" class="' + cls + '" data-strip-idx="' + idx + '" data-login="' + esc(p.login) + '" tabindex="' + tab + '" aria-label="' + esc(stripAriaLabel(p, entry.fraction)) + '" title="' + esc(p.name) + '">' +
          '<img class="' + avCls + '" src="' + esc(imgSrc(p.avatar)) + '" alt="">' +
          arcHtml +
        '</button>';
    });

    return (
      '<nav class="strip" aria-label="Channels">' +
        '<div id="strip-track" class="strip-track" role="toolbar">' + html + '</div>' +
        '<button type="button" id="strip-search-btn" class="icon-button strip-search-btn" aria-label="Search" title="Search" aria-pressed="' + state.searchOpen + '">' + ICONS.search + '</button>' +
      '</nav>'
    );
  }

  function render() {
    var viewed = dataset.byLogin[state.viewedLogin] || dataset.byLogin[state.playingDisplayLogin] || dataset.people[0];
    state.viewedLogin = viewed.login;
    var mainHtml = state.searchOpen
      ? renderSearchView()
      : (renderTopBlock(viewed) + renderBroadcasts(viewed));

    app.innerHTML = '<div class="main">' + mainHtml + '</div>' + renderStrip();
    syncSelectedVisibility();
  }

  function syncSelectedVisibility() {
    if (state.searchOpen) {
      var sel = document.getElementById("search-opt-" + state.selectedSearch);
      if (sel) sel.scrollIntoView({ block: "nearest" });
    } else {
      var vod = document.getElementById("vod-opt-" + state.selectedVod);
      if (vod) vod.scrollIntoView({ block: "nearest" });
    }
  }

  function playPerson(person, vodIndex) {
    state.pendingDisplayLogin = person.login;
    U.play(person.baseLogin, vodIndex);
    U.closePanel();
  }

  function actOnPerson(person) {
    if (!person) return;
    if (person.live) {
      if (isViewingPlaying(person) && state.playing.kind === "live") {
        state.viewedLogin = person.login;
        state.searchOpen = false;
        render();
      } else {
        state.searchOpen = false;
        playPerson(person, null);
      }
    } else {
      state.viewedLogin = person.login;
      state.selectedVod = 0;
      state.searchOpen = false;
      state.qualityOpen = false;
      render();
    }
  }

  function openSearch(focusInput) {
    state.searchOpen = true;
    state.qualityOpen = false;
    state.selectedSearch = 0;
    render();
    if (focusInput !== false) {
      var input = document.getElementById("search-input");
      if (input) { input.focus(); input.select(); }
    }
  }

  function closeSearch(focusTarget) {
    state.searchOpen = false;
    state.query = "";
    render();
    if (focusTarget === "magnifier") {
      var btn = document.getElementById("strip-search-btn");
      if (btn) btn.focus();
    }
  }

  function updateSearchListOnly() {
    var list = document.getElementById("people-list");
    if (!list) return;
    var matches = filteredPeople();
    list.innerHTML = renderSearchRows(matches);
    if (matches.length) list.setAttribute("aria-activedescendant", "search-opt-" + state.selectedSearch);
    else list.removeAttribute("aria-activedescendant");
    syncSelectedVisibility();
  }

  function moveVodSelection(delta) {
    var box = document.getElementById("broadcasts");
    if (!box) return;
    var opts = box.querySelectorAll(".vod-row");
    if (!opts.length) return;
    if (document.activeElement === document.body || document.activeElement === app) box.focus();
    state.selectedVod = Math.max(0, Math.min(opts.length - 1, state.selectedVod + delta));
    for (var i = 0; i < opts.length; i++) {
      opts[i].setAttribute("aria-selected", String(i === state.selectedVod));
    }
    box.setAttribute("aria-activedescendant", "vod-opt-" + state.selectedVod);
    opts[state.selectedVod].scrollIntoView({ block: "nearest" });
  }

  function moveSearchSelection(delta) {
    var list = document.getElementById("people-list");
    if (!list) return;
    var opts = list.querySelectorAll(".person-row");
    if (!opts.length) return;
    state.selectedSearch = Math.max(0, Math.min(opts.length - 1, state.selectedSearch + delta));
    for (var i = 0; i < opts.length; i++) {
      opts[i].setAttribute("aria-selected", String(i === state.selectedSearch));
    }
    list.setAttribute("aria-activedescendant", "search-opt-" + state.selectedSearch);
    opts[state.selectedSearch].scrollIntoView({ block: "nearest" });
  }

  function moveStripFocus(delta) {
    var track = document.getElementById("strip-track");
    if (!track) return;
    var btns = track.querySelectorAll(".strip-avatar-btn");
    if (!btns.length) return;
    state.stripFocusIndex = Math.max(0, Math.min(btns.length - 1, state.stripFocusIndex + delta));
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute("tabindex", i === state.stripFocusIndex ? "0" : "-1");
    }
    btns[state.stripFocusIndex].focus();
    btns[state.stripFocusIndex].scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function toggleQualityMenu(open) {
    state.qualityOpen = open != null ? open : !state.qualityOpen;
    var btn = document.getElementById("quality-btn");
    var menu = document.getElementById("quality-menu");
    if (!btn || !menu) return;
    btn.setAttribute("aria-expanded", String(state.qualityOpen));
    menu.hidden = !state.qualityOpen;
    if (state.qualityOpen) {
      var active = menu.querySelector(".is-active") || menu.querySelector(".quality-option");
      if (active) active.focus();
    } else {
      btn.focus();
    }
  }

  app.addEventListener("click", function (e) {
    var target = e.target;
    var qOpt = target.closest(".quality-option");
    if (qOpt) {
      var q = qOpt.dataset.quality;
      state.playing.quality = q;
      V.playing.quality = q;
      state.qualityOpen = false;
      render();
      var qb = document.getElementById("quality-btn");
      if (qb) qb.focus();
      return;
    }

    var qBtn = target.closest("#quality-btn");
    if (qBtn) {
      toggleQualityMenu();
      return;
    }

    if (state.qualityOpen && !target.closest("#quality-menu")) {
      state.qualityOpen = false;
      render();
    }

    if (target.closest("#top-back")) {
      state.viewedLogin = state.playingDisplayLogin;
      state.selectedVod = 0;
      render();
      return;
    }

    var liveBtn = target.closest("#live-action");
    if (liveBtn) {
      var lp = dataset.byLogin[liveBtn.dataset.login];
      if (lp) playPerson(lp, null);
      return;
    }

    var vodRow = target.closest(".vod-row");
    if (vodRow) {
      state.selectedVod = Number(vodRow.dataset.pos) || 0;
      var viewed = dataset.byLogin[state.viewedLogin];
      if (viewed) playPerson(viewed, Number(vodRow.dataset.vodIdx));
      return;
    }

    if (target.closest("#search-back")) {
      closeSearch("magnifier");
      return;
    }

    var personRow = target.closest(".person-row");
    if (personRow) {
      state.selectedSearch = Number(personRow.dataset.pos) || 0;
      actOnPerson(dataset.byLogin[personRow.dataset.login]);
      return;
    }

    var stripBtn = target.closest(".strip-avatar-btn");
    if (stripBtn) {
      state.stripFocusIndex = Number(stripBtn.dataset.stripIdx) || 0;
      actOnPerson(dataset.byLogin[stripBtn.dataset.login]);
      return;
    }

    if (target.closest("#strip-search-btn")) {
      if (state.searchOpen) closeSearch("magnifier");
      else openSearch(true);
    }
  });

  app.addEventListener("wheel", function (e) {
    var track = e.target && e.target.closest("#strip-track");
    if (!track || track.scrollWidth <= track.clientWidth) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      track.scrollLeft += e.deltaY;
    }
  }, { passive: false });

  app.addEventListener("input", function (e) {
    if (e.target && e.target.id === "search-input") {
      state.query = e.target.value;
      state.selectedSearch = 0;
      updateSearchListOnly();
    }
  });

  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
      e.preventDefault();
      openSearch(true);
      return;
    }

    if (state.qualityOpen) {
      var menu = document.getElementById("quality-menu");
      if (e.key === "Escape") {
        e.preventDefault();
        toggleQualityMenu(false);
        return;
      }
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && menu) {
        e.preventDefault();
        var opts = Array.prototype.slice.call(menu.querySelectorAll(".quality-option"));
        var cur = opts.indexOf(document.activeElement);
        var next = e.key === "ArrowDown" ? (cur + 1) % opts.length : (cur - 1 + opts.length) % opts.length;
        opts[next].focus();
        return;
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      if (state.searchOpen) {
        if (state.query) {
          state.query = "";
          state.selectedSearch = 0;
          var input = document.getElementById("search-input");
          if (input) { input.value = ""; input.focus(); }
          updateSearchListOnly();
        } else {
          closeSearch("magnifier");
        }
      } else {
        U.closePanel();
      }
      return;
    }

    if (document.activeElement && document.activeElement.closest("#strip-track")) {
      if (e.key === "ArrowRight") { e.preventDefault(); moveStripFocus(1); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); moveStripFocus(-1); return; }
      if (e.key === "Home") { e.preventDefault(); moveStripFocus(-9999); return; }
      if (e.key === "End") { e.preventDefault(); moveStripFocus(9999); return; }
    }

    if (state.searchOpen) {
      if (e.key === "ArrowDown") { e.preventDefault(); moveSearchSelection(1); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); moveSearchSelection(-1); return; }
      if (e.key === "Enter" && (document.activeElement.id === "search-input" || document.activeElement.id === "people-list")) {
        e.preventDefault();
        var selRow = document.getElementById("search-opt-" + state.selectedSearch);
        if (selRow) actOnPerson(dataset.byLogin[selRow.dataset.login]);
        return;
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveVodSelection(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveVodSelection(-1);
    } else if ((e.key === "Enter" || e.key === " ") && document.activeElement && document.activeElement.id === "broadcasts") {
      e.preventDefault();
      var selVod = document.getElementById("vod-opt-" + state.selectedVod);
      var viewed = dataset.byLogin[state.viewedLogin];
      if (selVod && viewed) playPerson(viewed, Number(selVod.dataset.vodIdx));
    }
  });

  window.addEventListener("hashchange", function () {
    applyHash(window.location.hash);
  });

  if (window.parent !== window) {
    try {
      window.parent.addEventListener("hashchange", function () {
        applyHash(window.parent.location.hash);
      });
    } catch (e) {}
  }

  window.addEventListener("message", function (e) {
    var m = e.data || {};
    if (m.type === "hash") {
      applyHash(m.hash);
      return;
    }
    if (m.type === "playing" && m.playing) {
      state.playing = clonePlaying(m.playing);
      if (state.pendingDisplayLogin && dataset.byLogin[state.pendingDisplayLogin] && dataset.byLogin[state.pendingDisplayLogin].baseLogin === m.playing.login) {
        state.playingDisplayLogin = state.pendingDisplayLogin;
      } else {
        state.playingDisplayLogin = dataset.byLogin[m.playing.login] ? m.playing.login : dataset.people[0].login;
      }
      state.pendingDisplayLogin = null;
      state.viewedLogin = state.playingDisplayLogin;
      var viewedObj = dataset.byLogin[state.viewedLogin];
      state.selectedVod = (m.playing.kind === "vod" && viewedObj) ? sortedIndexOfVod(viewedObj, m.playing.vod) : 0;
      state.qualityOpen = false;
      render();
    }
  });

  render();
})();
