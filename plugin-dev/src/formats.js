"use strict";
const FORMAT_ID = /^(?:audio_only|[1-9][0-9]{1,3}p(?:[1-9][0-9]{1,2})?)$/;
const AUTO = "auto720";
function parseFormats(stdout) {
  if (typeof stdout !== "string" || stdout.length > 1048576) throw Error("Unexpected format response");
  const obj = JSON.parse(stdout);
  if (!obj || !obj.streams || typeof obj.streams !== "object" || Array.isArray(obj.streams)) throw Error("Invalid format response");
  const names = Object.keys(obj.streams).filter(function (key) { return FORMAT_ID.test(key); });
  if (!names.length) throw Error("No formats available");
  return [AUTO].concat(names);
}
function commandQuality(format, known) {
  if (format === AUTO) return "720p60,720p,480p30,480p,360p30,360p,best";
  if (!Array.isArray(known) || !known.includes(format) || !FORMAT_ID.test(format)) return null;
  return format;
}
module.exports = { AUTO, FORMAT_ID, parseFormats, commandQuality };
