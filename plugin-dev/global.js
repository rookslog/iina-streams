"use strict";
const providers = require("./src/providers.js");
const STREAMLINK = "/opt/homebrew/bin/streamlink";
const { menu, utils, global: app, console: log } = iina;
let extracting = false;
// Streamlink extracts and exits; IINA owns native playback and cleanup.
// Never write signed HLS URLs, credentials, or extraction stdout to logs.
function openStream(input, qaMode) {
  const qa = qaMode === true;
  const chosen = providers.parseInput(input);
  if (chosen.kind === "unsupported" || chosen.kind === "twitch-vod") {
    utils.ask("IINA Streams supports Twitch channels and YouTube URLs. Twitch VODs are not supported in this build.");
    return Promise.resolve(false);
  }
  if (chosen.kind === "youtube") {
    // Experimental M4 path, delegated to IINA Online Media.
    app.createPlayerInstance({ url: chosen.url, enablePlugins: true, label: "streams:youtube" });
    return Promise.resolve(true);
  }
  if (extracting) {
    utils.ask("IINA Streams is already opening a stream. Please retry shortly.");
    return Promise.resolve(false);
  }
  if (!utils.fileInPath(STREAMLINK)) {
    utils.ask("Streamlink is missing. Expected /opt/homebrew/bin/streamlink.");
    return Promise.resolve(false);
  }
  extracting = true;
  log.log("Extracting Twitch stream for " + chosen.channel + ".");
  return utils.exec(STREAMLINK, [
    "--no-config", "--loglevel", "error", "--stream-url",
    chosen.url, qa ? "160p30" : providers.selectedQuality("auto720")
  ]).then(function (res) {
    extracting = false;
    if (qa) iina.file.write("@data/qa-global.json", JSON.stringify({phase:"extract-returned",status:res.status}));
    const extracted = (res.stdout || "").trim();
    if (res.status !== 0 || !providers.validExtractedUrl(extracted)) {
      if (qa) iina.file.write("@data/qa-global.json", JSON.stringify({phase:"extract-failed",status:res.status}));
      else utils.ask("The Twitch channel could not be opened. It may be offline, unavailable, or temporarily rate limited.");
      return false;
    }
    // Unrelated plugins are disabled only for this newly created Twitch player.
    const playerID = app.createPlayerInstance({
      url: extracted, enablePlugins: false, label: qa ? "streams:qa:" + chosen.channel : "streams:twitch:" + chosen.channel
    });
    log.log("Twitch player created (ID " + playerID + ").");
    if (qa) iina.file.write("@data/qa-global.json", JSON.stringify({phase:"player-created",playerID:playerID,channel:chosen.channel}));
    return true;
  }).catch(function (error) {
    extracting = false;
    log.error("Twitch extraction failed (details redacted).");
    if (qa) {
      const text = String(error || "unknown").replace(/https?:\/\/[^\s]+/g, "[redacted-url]").slice(0, 180);
      const hostMatch = String(error || "").match(/https?:\/\/([^\/\s?]+)/i);
      iina.file.write("@data/qa-global.json", JSON.stringify({phase:"exception",message:text,hostname:hostMatch ? hostMatch[1] : null}));
    }
    else utils.ask("Could not open Twitch. Check that Streamlink is installed and the channel is live.");
    return false;
  });
}
menu.addItem(menu.item("Open Stream…", function () {
  const entered = utils.prompt("Enter a Twitch channel or YouTube URL");
  if (typeof entered === "string" && entered.trim()) openStream(entered);
}));
log.log("IINA Streams development launcher loaded.");
// Single-use opt-in QA request for automated integration validation. This code
// runs only when a specific file exists in the development plugin data folder.
try {
  const qaFile = "@data/qa-request.json";
  if (iina.file.exists(qaFile)) {
    const request = JSON.parse(iina.file.read(qaFile));
    iina.file.delete(qaFile);
    if (request.approved === "hutchmf-360p-bounded" &&
        request.url === "https://www.twitch.tv/hutchmf") {
      iina.file.write("@data/qa-global.json", JSON.stringify({phase:"request-accepted"}));
      openStream(request.url, true);
    }
  }
} catch (_) { log.error("Development QA request error (details redacted)"); }
