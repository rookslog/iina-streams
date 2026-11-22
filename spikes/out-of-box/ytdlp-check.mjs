// Runs a yt-dlp binary the way iina.utils.exec would (environment = {LC_ALL: en_US.UTF-8} ONLY: no PATH, no HOME)
// against a YouTube video, and prints a REDACTED summary of the metadata: counts, heights, codecs, protocols, wall/CPU/RSS.
// Usage: node ytdlp-check.mjs <binary> <videoId> [variant]   variants: iina (default), iina-no-flags, with-path
//   iina          = media.py's flags minus the node runtime (IINA has none), env = LC_ALL only
//   with-path     = same flags but PATH includes /opt/homebrew/bin (so node/deno are discoverable): shows what a JS runtime changes
//   minimal       = bare `--dump-single-json --no-playlist`, env = LC_ALL only
import { spawnSync } from 'node:child_process';
const [, , bin, id, variant = 'iina'] = process.argv;
const base = ['--ignore-config', '--no-plugin-dirs', '--no-cache-dir', '--no-playlist', '--simulate', '--dump-single-json',
  '--no-progress', '--no-check-formats', '--socket-timeout', '12', '--retries', '1', '--extractor-retries', '1'];
let args, env = { LC_ALL: 'en_US.UTF-8' };
if (variant === 'iina') args = [...base, '--no-warnings', '--no-remote-components'];
else if (variant === 'minimal') args = ['--dump-single-json', '--no-playlist', '--no-cache-dir'];
else if (variant === 'with-path') { args = [...base, '--no-warnings', '--no-remote-components']; env.PATH = '/opt/homebrew/bin:/usr/bin:/bin'; }
else if (variant === 'trim') {
  // Same flags as `iina`, but --print with a field selector instead of --dump-single-json: drops mhtml/DASH fragment lists.
  // (a single nested selector returned NA; three flat selectors work). Root cause of the large dump: automatic_captions
  // is ~96% of --dump-single-json bytes (11.15 of 11.66 MB for fTDvp9CBXoQ); formats are ~0.48 MB.
  const meta = '%(.{id,title,live_status,is_live,duration,availability,extractor_key,_type})j';
  const fmts = '%(formats.:.{format_id,url,protocol,vcodec,acodec,audio_ext,height,fps,abr,language_preference,quality,source_preference,asr,has_drm,http_headers})j';
  const chat = '%(subtitles.live_chat)j';
  args = base.filter(a => a !== '--dump-single-json' && a !== '--simulate').concat(['--skip-download', '--no-warnings', '--no-remote-components', '-O', meta, '-O', fmts, '-O', chat]);
} else if (variant === 'iina-remote') args = [...base]; // lets yt-dlp download its EJS solver from GitHub (needs a JS runtime anyway)
args.push('https://www.youtube.com/watch?v=' + id);
const t0 = performance.now();
const r = spawnSync('/usr/bin/time', ['-l', bin, ...args], { encoding: 'utf8', env, maxBuffer: 256 * 1024 * 1024 });
const wallMs = Math.round(performance.now() - t0);
const rss = /(\d+)\s+maximum resident set size/.exec(r.stderr);
const user = /([\d.]+)\s+user/.exec(r.stderr), sys = /([\d.]+)\s+sys/.exec(r.stderr);
const out = { bin: bin.includes('IINA.app') ? 'IINA.app/youtube-dl' : bin, variant, exit: r.status, wallMs,
  peakRssMB: rss ? +(Number(rss[1]) / 1048576).toFixed(1) : null, cpuUserSec: user && +user[1], cpuSysSec: sys && +sys[1], stdoutBytes: r.stdout.length };
const errLines = r.stderr.split('\n').filter(l => /^(ERROR|WARNING)/.test(l)).map(l => l.replace(/https?:\/\/\S+/g, '<url>').slice(0, 200));
out.stderrIssues = [...new Set(errLines)].slice(0, 6);
try {
  let j, f;
  if (variant === 'trim') {
    const [m, fm, ch] = r.stdout.trim().split('\n');
    j = JSON.parse(m); f = JSON.parse(fm) || []; const c = ch && ch !== 'NA' ? JSON.parse(ch) : null;
    j.subtitles = c ? { live_chat: c } : null;
  } else { j = JSON.parse(r.stdout); f = j.formats || []; }
  out.liveStatus = j.live_status; out.isLive = j.is_live; out.duration = j.duration; out.availability = j.availability;
  out.formatCount = f.length;
  out.protocols = Object.fromEntries([...new Set(f.map(x => x.protocol))].map(p => [p, f.filter(x => x.protocol === p).length]));
  const video = f.filter(x => x.vcodec && x.vcodec !== 'none');
  out.videoFormats = video.length;
  out.heights = [...new Set(video.map(x => x.height).filter(Boolean))].sort((a, b) => b - a);
  out.vcodecFamilies = [...new Set(video.map(x => String(x.vcodec).split('.')[0]))];
  out.combinedAV = f.filter(x => x.vcodec !== 'none' && x.acodec && x.acodec !== 'none').length;
  out.audioOnly = f.filter(x => x.vcodec === 'none' && x.acodec && x.acodec !== 'none').length;
  out.formatsWithoutUrl = f.filter(x => !x.url).length;
  out.liveChatTrack = !!(j.subtitles && j.subtitles.live_chat);
  out.liveChatTrackShape = j.subtitles && j.subtitles.live_chat ? j.subtitles.live_chat.map(t => ({ protocol: t.protocol, ext: t.ext })) : null;
  out.extractor = j.extractor_key;
} catch (_) { out.parse = 'no-json'; }
console.log(JSON.stringify(out));
