"use strict";
const { menu, utils, console: pluginConsole } = iina;

const STREAMLINK = "/opt/homebrew/bin/streamlink";
const IINA_CLI = "/Applications/IINA.app/Contents/MacOS/iina-cli";
const QUALITY_720 = "720p60,720p,480p60,480p,best";

function normalizedTwitchUrl(input) {
  if (typeof input !== "string") return null;
  const value = input.trim();
  // Only accept Twitch channels. Never pass arbitrary text to an executable.
  if (/^[A-Za-z0-9_]{3,25}$/.test(value)) {
    return "https://www.twitch.tv/" + value;
  }
  const match = value.match(/^(?:https?:\/\/)?(?:www\.|m\.)?twitch\.tv\/([A-Za-z0-9_]{3,25})(?:[/?#].*)?$/i);
  return match ? "https://www.twitch.tv/" + match[1] : null;
}

function launchTwitch(input, quality) {
  const url = normalizedTwitchUrl(input);
  if (!url) {
    utils.ask("Please provide a Twitch channel URL, such as https://www.twitch.tv/twitchplayspokemon.");
    return;
  }
  if (!utils.fileInPath(STREAMLINK) || !utils.fileInPath(IINA_CLI)) {
    utils.ask("Streamlink or IINA's command-line player is missing. See the Streamlink Bridge installation.");
    return;
  }
  // Executables are invoked with an argument array; never through a shell.
  // Streamlink stays running only while the player is playing.
  utils.exec(STREAMLINK, [
    "--loglevel=info",
    "--player=" + IINA_CLI,
    "--player-args=--stdin --mpv-hwdec=auto",
    url,
    quality
  ]).then((result) => {
    pluginConsole.log("Streamlink finished (status " + result.status + ")");
    if (result.status !== 0 && result.stderr && /(?:^|\n)error:/im.test(result.stderr)) {
      utils.ask("Streamlink could not play this channel. It may be offline.\n\n" + result.stderr.slice(-250));
    }
  }).catch((error) => {
    pluginConsole.error(String(error));
    utils.ask("Streamlink could not be started. See IINA > Window > Log Viewer.");
  });
}

function fromClipboard(quality) {
  utils.exec("/usr/bin/pbpaste", []).then((result) => {
    if (result.status !== 0) {
      utils.ask("Could not read the clipboard.");
      return;
    }
    launchTwitch(result.stdout, quality);
  }).catch(() => utils.ask("Could not read the clipboard."));
}

function fromPrompt() {
  const value = utils.prompt("Enter a Twitch channel name or URL");
  if (value && value.trim()) launchTwitch(value, QUALITY_720);
}

menu.addItem(menu.item("Twitch via Streamlink: Play Copied URL", () => fromClipboard(QUALITY_720)));
menu.addItem(menu.item("Twitch via Streamlink: Enter URL…", fromPrompt));
menu.addItem(menu.item("Twitch via Streamlink: Play Copied URL (Best Quality)", () => fromClipboard("best")));
pluginConsole.log("Streamlink Bridge loaded; Streamlink will launch only on demand.");
