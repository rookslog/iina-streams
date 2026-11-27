// Shared by global.js and main.js: the arm config and string work that makes many short (atom-prone) strings.
const {file} = iina;
function readConfig() {
  try { return JSON.parse(file.read('@data/arm.json') || '{}'); } catch (e) { return {}; }
}
// An object with 24 short keys and values; keys repeat across calls, so the engine interns them.
function words(i) {
  const o = {};
  for (let k = 0; k < 24; k++) o['k' + ((i + k) % 97)] = 'v' + ((i * 31 + k) % 1009);
  return o;
}
// Build, split and rejoin a 200-character string; returns the piece count.
function churn(i) {
  let s = '';
  for (let k = 0; k < 200; k++) s += String.fromCharCode(97 + ((i + k) % 26));
  return s.split('a').join('-').length;
}
function writeStatus(name, stats) {
  stats.time = new Date().toISOString();
  try { file.write('@data/' + name, JSON.stringify(stats)); } catch (e) { stats.errors += 1; }
}
module.exports = {readConfig, words, churn, writeStatus};
