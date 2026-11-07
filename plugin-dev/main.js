"use strict";
const { core, menu, sidebar, event, utils, console: log, global: app } = iina;
const providers = require("./src/providers.js");
const formats = require("./src/formats.js");
const STREAMLINK = "/opt/homebrew/bin/streamlink";
const label = app.getLabel() || "";
const isTwitch = label.startsWith("streams:twitch:");
const channel = isTwitch ? label.slice("streams:twitch:".length) : "";
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
    sidebar.loadFile("ui/streams.html");
  }
  sidebar.show();
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
    if (available.length === 1) queryFormats();
  });
  sidebar.onMessage("refresh-qualities", queryFormats);
  sidebar.onMessage("change-quality", changeQuality);
  sidebar.onMessage("hide", function () { sidebar.hide(); });
  event.on("iina.window-loaded", function () { windowLoaded = true; });
  event.on("iina.file-started", function () { state = "Connecting"; sendState(); });
  event.on("iina.file-loaded", function () { hasMedia = true; state = "Playing"; lastError = ""; sendState(); });
  event.on("mpv.end-file", function () { hasMedia = false; state = "Stopped"; sendState(); });
  event.on("iina.window-will-close", function () {
    sidebarReady = false; sidebarLoaded = false; windowLoaded = false;
  });
  log.log("Streams Twitch controls available for " + channel);
}
