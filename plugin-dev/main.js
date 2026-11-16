"use strict";
const { core, menu, sidebar, event, utils, console: log, global: app } = iina;
const providers = require("./src/providers.js");
const formats = require("./src/formats.js");
const STREAMLINK = "/opt/homebrew/bin/streamlink";
const { mpv } = iina;
const label = app.getLabel() || "";
const qa = label === "streams:qa:hutchmf";
const isTwitch = qa || label.startsWith("streams:twitch:");
const channel = qa ? "hutchmf" : isTwitch ? label.slice("streams:twitch:".length) : "";
const owned = isTwitch && /^[A-Za-z0-9_]{3,25}$/.test(channel);
let sidebarLoaded = false, sidebarReady = false, windowLoaded = false;
let controlsRevealed = false;
let controlsDesired = false;
const displayTitle = channel ? channel + " — Twitch" : "";
let loadingFormats = false, changingQuality = false;
let pendingQuality = null, qualityDeadline = null;
let available = [formats.AUTO], selected = qa ? "160p30" : formats.AUTO;
let state = "Connecting", lastError = "", hasMedia = false;
let generation = 0;
let qaWindowOpenCount = 0, qaWindowCloseCount = 0;
function snapshot() {
  return { channel: channel, provider: "Twitch",
    quality: selected, formats: available,
    busy: loadingFormats || changingQuality, status: state, error: lastError };
}
function sendState() {
  if (sidebarReady) sidebar.postMessage("state", snapshot());
}
function registerSidebarMessages() {
  sidebar.onMessage("ready", function () {
    sidebarReady = true;
    sendState();
    if (qa) qaSave("sidebar-ready");
    if (available.length === 1) queryFormats();
  });
  sidebar.onMessage("refresh-qualities", queryFormats);
  sidebar.onMessage("change-quality", changeQuality);
  sidebar.onMessage("hide", function () {
    controlsDesired = false;
    sidebar.hide();
  });
}

function ensureSidebar() {
  controlsDesired = true;
  if (!windowLoaded) {
    try { windowLoaded = !!core.window.loaded; } catch (_) {}
  }
  if (!windowLoaded) return;
  if (!sidebarLoaded) {
    try {
      sidebar.loadFile("ui/streams.html");
      // IINA clears registered listeners each time loadFile is called.
      // Register the bridge AFTER loading, or no messages will arrive.
      registerSidebarMessages();
      sidebarLoaded = true;
      sidebarReady = false;
      if (qa) qaSave("sidebar-load-called");
    } catch (_) {
      lastError = "Sidebar could not be loaded.";
      if (qa) qaSave("sidebar-load-failed");
      return;
    }
  }
  try {
    sidebar.show();
    if (qa) qaSave("sidebar-show-called");
  } catch (_) {
    lastError = "Sidebar could not be shown.";
    if (qa) qaSave("sidebar-show-failed");
  }
}

function setStreamTitle() {
  if (!owned) return;
  try {
    // File-local mpv metadata is used by IINA's native window titlebar.
    // It does not modify the underlying network URL or any other player.
    mpv.set("file-local-options/force-media-title", displayTitle);
  } catch (_) {
    log.warn("IINA Streams: Could not set friendly title.");
  }
}
function queryFormats() {
  if (!owned || loadingFormats || changingQuality) return Promise.resolve(false);
  loadingFormats = true; state = "Checking qualities"; lastError = ""; sendState();
  return utils.exec(STREAMLINK, [
    "--no-config", "--loglevel", "error", "--json", "https://www.twitch.tv/" + channel
  ]).then(function (res) {
    loadingFormats = false;
    if (res.status !== 0) throw Error("Format query failed");
    // JSON may contain signed stream URLs: parse only keys, never persist/log stdout.
    available = formats.parseFormats(res.stdout || "");
    state = hasMedia ? "Playing" : "Connecting"; sendState(); return true;
  }).catch(function () {
    loadingFormats = false; state = hasMedia ? "Playing" : "Connecting";
    lastError = "Could not retrieve current qualities. You can retry.";
    sendState(); return false;
  });
}
function cancelQualityDeadline() {
  if (qualityDeadline !== null) {
    clearTimeout(qualityDeadline);
    qualityDeadline = null;
  }
}
function armQualityDeadline(quality) {
  cancelQualityDeadline();
  qualityDeadline = setTimeout(function () {
    qualityDeadline = null;
    if (pendingQuality !== quality) return;
    pendingQuality = null;
    changingQuality = false;
    state = hasMedia ? "Playing" : "Connection stalled";
    lastError = "Quality switch did not finish. Try another quality or reopen the stream.";
    sendState();
    if (qa) qaSave("quality-timeout");
  }, 18000);
}
function changeQuality(requested) {
  if (!owned || changingQuality || loadingFormats) return Promise.resolve(false);
  if (!hasMedia) {
    lastError = "Start playback before changing quality.";
    sendState();
    return Promise.resolve(false);
  }
  const quality = formats.commandQuality(requested, available);
  if (!quality) {
    lastError = "That quality is unavailable. Refresh the available formats.";
    sendState();
    return Promise.resolve(false);
  }
  if (requested === selected) return Promise.resolve(true);
  changingQuality = true;
  state = "Switching quality";
  lastError = "";
  sendState();
  const myGeneration = ++generation;
  return utils.exec(STREAMLINK, [
    "--no-config", "--loglevel", "error", "--stream-url",
    "https://www.twitch.tv/" + channel, quality
  ]).then(function (res) {
    if (generation !== myGeneration) return false;
    const streamURL = (res.stdout || "").trim();
    if (res.status !== 0 || !providers.validExtractedUrl(streamURL)) {
      changingQuality = false;
      state = hasMedia ? "Playing" : "Stopped";
      lastError = "Couldn't retrieve that quality. Playback was not changed.";
      sendState();
      return false;
    }
    try {
      pendingQuality = requested;
      armQualityDeadline(requested);
      // core.open() explicitly closes IINA's window for network media.
      // mpv's "loadfile replace" changes media inside the existing player.
      // This returns when dispatched, not when the new stream has loaded.
      mpv.command("loadfile", [streamURL, "replace"]);
      state = "Buffering " + requested;
      sendState();
      if (qa) qaSave("quality-dispatched");
      return true;
    } catch (_) {
      changingQuality = false;
      pendingQuality = null;
      cancelQualityDeadline();
      state = hasMedia ? "Playing" : "Stopped";
      lastError = "IINA could not switch quality. The current player remains open.";
      sendState();
      if (qa) qaSave("quality-command-error");
      return false;
    }
  }).catch(function () {
    if (generation !== myGeneration) return false;
    changingQuality = false;
    pendingQuality = null;
    cancelQualityDeadline();
    state = hasMedia ? "Playing" : "Stopped";
    lastError = "Could not retrieve the requested quality.";
    sendState();
    return false;
  });
}
if (owned) {
  menu.addItem(menu.item("Show Streams Controls", ensureSidebar));
  mpv.addHook("on_load", 20, setStreamTitle);
  event.on("iina.window-loaded", function () {
    windowLoaded = true;
    if (qa) qaWindowOpenCount++;
    if (qa) qaSave("window-loaded");
    if (controlsDesired && !sidebarLoaded) ensureSidebar();
  });
  event.on("iina.file-started", function () {
    state = pendingQuality ? "Buffering " + pendingQuality : "Connecting";
    sendState();
  });
  event.on("iina.file-loaded", function () {
    hasMedia = true;
    if (pendingQuality) {
      selected = pendingQuality;
      pendingQuality = null;
      changingQuality = false;
      cancelQualityDeadline();
      if (qa) qaSave("quality-loaded");
    }
    state = "Playing"; lastError = "";
    setStreamTitle();
    sendState();
    if (!controlsRevealed) {
      controlsRevealed = true;
      controlsDesired = true;
    }
    if (controlsDesired) ensureSidebar();
    if (qa) qaSave("file-loaded");
  });
  event.on("mpv.end-file", function () {
    hasMedia = false;
    // Replacing a playlist entry ends the old file without closing the window.
    state = pendingQuality ? "Buffering " + pendingQuality : "Stopped";
    sendState();
    if (qa) qaSave("end-file");
  });
  event.on("iina.window-will-close", function () {
    if (qa) qaWindowCloseCount++;
    if (pendingQuality && qa) qaSave("window-closed-during-quality");
    generation++;
    pendingQuality = null;
    changingQuality = false;
    cancelQualityDeadline();
    sidebarReady = false;
    sidebarLoaded = false;
    windowLoaded = false;
  });
  log.log("Streams Twitch controls available for " + channel);
}

function qaSave(phase) {
  if (!qa) return;
  const safeNumber = function (name) {
    try {
      const n = iina.mpv.getNumber(name);
      return Number.isFinite(n) ? n : null;
    } catch (_) { return null; }
  };
  const sample = {
    phase: phase,
    time: new Date().toISOString(),
    loaded: hasMedia,
    status: state,
    sidebarReady: sidebarReady,
    sidebarLoaded: sidebarLoaded,
    controlsDesired: controlsDesired,
    windowLoaded: windowLoaded,
    formats: available,
    chosenQuality: selected,
    pendingQuality: pendingQuality,
    qaWindowOpenCount: qaWindowOpenCount,
    qaWindowCloseCount: qaWindowCloseCount,
    formatQueryBusy: loadingFormats,
    reconnectBusy: changingQuality,
    error: lastError,
    videoWidth: safeNumber("video-params/w"),
    videoHeight: safeNumber("video-params/h"),
    videoFrames: safeNumber("vo-frame-count"),
    droppedFrames: safeNumber("vo-drop-frame-count"),
    playbackSeconds: safeNumber("playback-time"),
    audioChannels: safeNumber("audio-params/channel-count"),
    mediaTitle: (() => { try { return (mpv.getString("media-title") || "").slice(0, 100); } catch (_) { return ""; } })(),
    forcedTitle: (() => { try { return (mpv.getString("force-media-title") || "").slice(0, 100); } catch (_) { return ""; } })(),
    sidebarSelection: (() => { try { return core.window.sidebar || null; } catch (_) { return null; } })()
  };
  try { iina.file.write("@data/qa-" + phase + ".json", JSON.stringify(sample, null, 2)); }
  catch (_) { log.error("QA snapshot write failed"); }
}

if (qa) {
  qaSave("entry");
  setTimeout(function () {
    qaSave("sample-5s");
    if (!loadingFormats && available.length === 1) queryFormats();
  }, 5000);
  setTimeout(function () {
    qaSave("before-quality");
    if (available.indexOf("360p30") !== -1) {
      changeQuality("360p30").then(function (ok) {
        qaSave(ok ? "quality-command-succeeded" : "quality-command-failed");
      });
    } else qaSave("quality-not-available");
  }, 12000);
  setTimeout(function () { qaSave("sample-20s"); }, 20000);
  setTimeout(function () {
    qaSave("before-test-stop");
    try {
      core.stop();
      qaSave("test-stop-invoked");
    } catch (_) { qaSave("test-stop-failed"); }
  }, 24000);
}
