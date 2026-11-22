// Mimics ONLY what IINA 1.5.1 iina.http can do (JavascriptAPIHttp.swift + Just).
//  - request(method, url, {params, headers, data}); the only body is `data`
//    (a JS object bridged to [String: Any]). data -> JSON only if a Content-Type
//    header equals application/json (case-insensitive), else form-urlencoded.
//    A top-level JSON array body is impossible.
//  - Response exposes ONLY {statusCode, reason, data (parsed JSON or null), text (UTF-8 or null)}.
//    No response headers, no binary, no streaming, no cookie access.
//  - status 400..599 or transport error => promise rejects with the same dict.
//  - redirects followed; cache disabled; URL host must match plugin allowedDomains.
//  - Never logs URLs/headers/bodies: callers handle redaction.
import { URL } from 'node:url';

export const ALLOWED = ["twitch.tv", "*.twitch.tv", "*.ttvnw.net", "*.twitchcdn.net",
  "d2vi6trrdongqn.cloudfront.net", "youtube.com", "*.youtube.com", "youtu.be", "*.googlevideo.com"];
function allowed(host) {
  return ALLOWED.some(p => p.startsWith('*.') ? host.endsWith(p.slice(1)) : host === p);
}
export const stats = { requests: 0, bytes: 0, hosts: new Set(), wouldBeBlocked: new Set() };

export async function request(method, url, options = {}) {
  const u = new URL(url);
  // options.measureOnly bypasses the allowlist so we can still measure the response; the call is
  // recorded in stats.wouldBeBlocked because a real plugin could NOT make it.
  if (!allowed(u.hostname) && options.measureOnly) stats.wouldBeBlocked.add(u.hostname);
  else if (!allowed(u.hostname)) throw { statusCode: null, reason: 'URL not allowed', data: null, text: null, blocked: u.hostname };
  for (const [k, v] of Object.entries(options.params || {})) u.searchParams.set(k, String(v));
  const headers = {};
  for (const [k, v] of Object.entries(options.headers || {})) headers[k] = v;
  let body;
  const data = options.data;
  if (data && Object.keys(data).length) {
    const ct = Object.keys(headers).find(k => k.toLowerCase() === 'content-type');
    if (ct && headers[ct].toLowerCase() === 'application/json') body = JSON.stringify(data);
    else {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(Object.entries(data).map(([k, v]) => [k, String(v)])).toString();
    }
  }
  stats.requests++; stats.hosts.add(u.hostname);
  let res;
  try { res = await fetch(u, { method: method.toUpperCase(), headers, body, redirect: 'follow', cache: 'no-store' }); }
  catch (e) { throw { statusCode: null, reason: 'transport', data: null, text: null }; }
  const buf = Buffer.from(await res.arrayBuffer());
  stats.bytes += buf.length;
  let text = null; try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (_) {}
  let json = null; try { json = JSON.parse(text); } catch (_) {}
  const out = { statusCode: res.status, reason: res.statusText, data: json, text };
  if (res.status >= 400 && res.status < 600) throw out;
  return out;
}
export const http = {
  get: (u, o) => request('GET', u, o), post: (u, o) => request('POST', u, o),
};
