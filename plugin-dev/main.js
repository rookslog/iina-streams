"use strict";
const { core, menu, sidebar, event, utils, console: log, global: app } = iina;
const providers = require("./src/providers.js");
const formats = require("./src/formats.js");
const STREAMLINK = "/opt/homebrew/bin/streamlink";
const label = app.getLabel() || "";
const qa = label === "streams:qa:hutchmf";
const isTwitch = qa || label.startsWith("streams:twitch:");
const channel = qa ? "hutchmf" : isTwitch ? label.slice("streams:twitch:".length) : "";
const owned = isTwitch && /^[A-Za-z0-9_]{3,25}$/.test(channel);
let sidebarLoaded = false, sidebarReady = false, windowLoaded = false;
let loadingFormats = false, changingQuality = false;
let available = [formats.AUTO], selected = formats.AUTO;
let state = "Connecting", lastError = "", hasMedia = false;
let generation = 0;
function snapshot() {
  return { channel: channel, provider: "Twitch",
    quality: selected, formats: available,
    busy: loadingFormats || changingQuality, status: state, error: lastError };
}
function sendState() {
  if (sidebarReady) sidebar.postMessage("state", snapshot());
}
function ensureSidebar() {
  if (!windowLoaded) return;
  if (!sidebarLoaded) {
    sidebarLoaded = true;
    try {
      sidebar.loadFile("ui/streams.html");
      if (qa) qaSave("sidebar-load-called");
    } catch (_) {
      sidebarLoaded = false;
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
function changeQuality(requested) {
  if (!owned || changingQuality || loadingFormats) return Promise.resolve(false);
  const q = formats.commandQuality(requested, available);
  if (!q) {
    lastError = "That quality is unavailable. Refresh the available formats.";
    sendState(); return Promise.resolve(false);
  }
  if (requested === selected) return Promise.resolve(true);
  changingQuality = true; state = "Reconnecting"; lastError = ""; sendState();
  const myGeneration = ++generation;
  return utils.exec(STREAMLINK, [
    "--no-config", "--loglevel", "error", "--stream-url",
    "https://www.twitch.tv/" + channel, q
  ]).then(function (res) {
    if (generation !== myGeneration) return false;
    changingQuality = false;
    const streamURL = (res.stdout || "").trim();
    if (res.status !== 0 || !providers.validExtractedUrl(streamURL)) {
      state = "Playing"; lastError = "Could not select quality. Original playback was retained.";
      sendState(); return false;
    }
    const previous = selected;
    selected = requested; state = "Opening quality"; sendState();
    try {
      // Official per-player API. Replaces this player's media only.
      core.open(streamURL);
    } catch (_) {
      selected = previous; state = "Playing";
      lastError = "IINA could not reopen that quality; the original player may need reopening.";
      sendState(); return false;
    }
    return true;
  }).catch(function () {
    if (generation !== myGeneration) return false;
    changingQuality = false; state = "Playing";
    lastError = "Quality change failed. Original playback was retained.";
    sendState(); return false;
  });
}
if (owned) {
  menu.addItem(menu.item("Show Streams Controls", ensureSidebar));
  sidebar.onMessage("ready", function () {
    sidebarReady = true; sendState();
    if (qa) qaSave("sidebar-ready");
    if (available.length === 1) queryFormats();
  });
  sidebar.onMessage("refresh-qualities", queryFormats);
  sidebar.onMessage("change-quality", changeQuality);
  sidebar.onMessage("hide", function () { sidebar.hide(); });
  event.on("iina.window-loaded", function () {
    windowLoaded = true;
    if (qa) {
      qaSave("window-loaded");
      ensureSidebar();
    }
  });
  event.on("iina.file-started", function () { state = "Connecting"; sendState(); });
  event.on("iina.file-loaded", function () {
    hasMedia = true; state = "Playing"; lastError = ""; sendState();
    if (qa) qaSave("file-loaded");
  });
  event.on("mpv.end-file", function () {
    hasMedia = false; state = "Stopped"; sendState();
    if (qa) qaSave("end-file");
  });
  event.on("iina.window-will-close", function () {
    sidebarReady = false; sidebarLoaded = false; windowLoaded = false;
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
    formats: available,
    chosenQuality: selected,
    formatQueryBusy: loadingFormats,
    reconnectBusy: changingQuality,
    error: lastError,
    videoWidth: safeNumber("video-params/w"),
    videoHeight: safeNumber("video-params/h"),
    videoFrames: safeNumber("vo-frame-count"),
    droppedFrames: safeNumber("vo-drop-frame-count"),
    playbackSeconds: safeNumber("playback-time"),
    audioChannels: safeNumber("audio-params/channel-count")
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
