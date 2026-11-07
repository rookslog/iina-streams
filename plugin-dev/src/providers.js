"use strict";
const RESERVED_TWITCH = /^(videos|directory|search|settings|subscriptions|following|downloads|login|signup|products|p|popout)$/i;
const CHANNEL = /^[A-Za-z0-9_]{3,25}$/;
const DEFAULT_QUALITY = "720p60,720p,480p30,360p30,best";
const TEST_QUALITY = "360p30,360p,160p30,best";
function parseInput(input) {
  if (typeof input !== "string") return { kind: "unsupported", reason: "Not text" };
  const s = input.trim();
  if (s.length < 3 || s.length > 2048 || /[\x00-\x1f\x7f]/.test(s)) {
    return { kind: "unsupported", reason: "Invalid URL" };
  }
  if (CHANNEL.test(s) && !RESERVED_TWITCH.test(s)) {
    return { kind: "twitch-live", url: "https://www.twitch.tv/" + s, channel: s.toLowerCase() };
  }
  const twitch = s.match(/^(?:https?:\/\/)?(?:(?:www|m)\.)?twitch\.tv\/([^?#]*)(?:[?#].*)?$/i);
  if (twitch) {
    const segments = twitch[1].split("/").filter(Boolean);
    if (segments[0] && segments[0].toLowerCase() === "videos" && /^\d+$/.test(segments[1] || "")) {
      return { kind: "twitch-vod", url: "https://www.twitch.tv/videos/" + segments[1] };
    }
    if (segments.length === 1 && CHANNEL.test(segments[0]) && !RESERVED_TWITCH.test(segments[0])) {
      return { kind: "twitch-live", url: "https://www.twitch.tv/" + segments[0], channel: segments[0].toLowerCase() };
    }
    return { kind: "unsupported", reason: "Unsupported Twitch path" };
  }
  const youtube = s.match(/^https?:\/\/(?:(?:www|m|music)\.)?(youtube\.com|youtu\.be)\/(.+)$/i);
  if (youtube) {
    if (!/^[-A-Za-z0-9_?=&%#/.]+$/.test(youtube[2])) return { kind: "unsupported", reason: "Invalid YouTube URL" };
    return { kind: "youtube", url: s.replace(/^http:/i, "https:") };
  }
  return { kind: "unsupported", reason: "Only Twitch and YouTube are supported" };
}
function selectedQuality(value) {
  if (value === "best") return "best";
  if (value === "test-360") return TEST_QUALITY;
  return DEFAULT_QUALITY;
}
function validExtractedUrl(value) {
  return typeof value === "string" && value.length <= 4096 &&
    /^https:\/\/[^\s\x00-\x1f]+$/i.test(value) && !/[\r\n]/.test(value);
}
module.exports = { parseInput, selectedQuality, validExtractedUrl, DEFAULT_QUALITY, TEST_QUALITY };
