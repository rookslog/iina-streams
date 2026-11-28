#!/usr/bin/env python3
"""Run one arm of the #90 crash harness in the operator's IINA, then put everything back.

Usage: python3 -I scripts/repro/atom-crash/run.py --arm page --minutes 15

Refuses to start while IINA is running or has a stuck (E-state) process. Records every
PluginEnabled.* switch, turns off every Streams copy, installs and enables only the harness,
serves JSON on localhost for the http arms, launches IINA, and watches for a new crash report.
Afterwards it quits IINA, restores the switches exactly as found, removes the harness plugin, and
writes a result file to results/. Only a crash at the same assertion (AtomStringImpl.cpp:462 or
Heap.cpp:2407 in JavaScriptCore) counts as reproduced.
"""
import argparse, glob, http.server, json, os, shutil, subprocess, sys, threading, time, wave
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
IINA = '/Applications/IINA.app'
DOMAIN = 'com.colliderli.iina'
PLUGINS = os.path.expanduser('~/Library/Application Support/com.colliderli.iina/plugins')
PLUGIN_ID = 'local.iina.atomrepro'
INSTALLED = os.path.join(PLUGINS, PLUGIN_ID + '.iinaplugin')
DATA = os.path.join(PLUGINS, '.data', PLUGIN_ID)
REPORTS = os.path.expanduser('~/Library/Logs/DiagnosticReports')
ARMS = ['control', 'page', 'players', 'http', 'http-cross', 'hook', 'exec', 'all']
CHAIN = ['all', 'page', 'players', 'http-cross', 'http', 'hook', 'exec', 'control']
# The counters that must be nonzero 30 s in, per arm: ('global'|'player', key). A zero means the arm never ran: INVALID.
COUNTERS = {
    'control': [('global', 'churn')],
    'page': [('global', 'pageIn')],
    'players': [('global', 'pongs')],
    'http': [('global', 'httpOk')],
    'http-cross': [('global', 'httpOk'), ('global', 'pageIn'), ('global', 'pongs')],
    'hook': [('player', 'hooks')],
    'exec': [('global', 'execOk')],
    'all': [('global', 'httpOk'), ('global', 'pageIn'), ('global', 'pongs'), ('player', 'hooks'), ('global', 'execOk')],
}


def iina_pids():
    out = subprocess.run(['/bin/ps', '-axo', 'pid=,stat=,comm='], capture_output=True, text=True).stdout
    rows = []
    for line in out.splitlines():
        parts = line.split(None, 2)
        if len(parts) == 3 and parts[2] == IINA + '/Contents/MacOS/IINA':
            rows.append((int(parts[0]), parts[1]))
    return rows


def plugin_switches():
    out = subprocess.run(['/usr/bin/defaults', 'read', DOMAIN], capture_output=True, text=True).stdout
    found = {}
    for line in out.splitlines():
        line = line.strip()
        if line.startswith('"PluginEnabled.'):
            key, _, value = line.partition('=')
            found[key.strip().strip('"')] = value.strip().rstrip(';').strip() == '1'
    return found


def set_switch(key, on):
    subprocess.run(['/usr/bin/defaults', 'write', DOMAIN, key, '-bool', 'true' if on else 'false'], check=True)


def crash_reports():
    return set(glob.glob(os.path.join(REPORTS, 'IINA-*.ips')))


def classify(path):
    with open(path) as fh:
        fh.readline()
        body = json.loads(fh.read())
    images = body.get('usedImages', [])
    thread = body['threads'][body['faultingThread']]
    names = [fr.get('symbol', '') for fr in thread['frames'][:4]]
    x0 = (thread.get('threadState', {}).get('x') or [{}])[0].get('value')
    jsc = [im.get('CFBundleVersion') for im in images if im.get('name') == 'JavaScriptCore']
    top = ' < '.join(n[:60] for n in names)
    if x0 == 462 and any('StringImpl' in n for n in names):
        verdict = 'REPRODUCED (AtomStringImpl.cpp:462)'
    elif x0 == 2407 and any('requestCollection' in n for n in names):
        verdict = 'REPRODUCED (Heap.cpp:2407)'
    else:
        verdict = 'OTHER CRASH (a separate finding)'
    return {'report': os.path.basename(path), 'verdict': verdict, 'x0': x0, 'top': top, 'jsc': jsc, 'pid': body.get('pid')}


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        i = self.path.rsplit('=', 1)[-1]
        body = json.dumps({'k%d' % (n % 97): 'value-%s-%d' % (i, n) for n in range(120)}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def write_silence(path):
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(8000)
        w.writeframes(b'\x00\x00' * 16000)


def read_json(path):
    try:
        with open(path) as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def run_arm(arm, minutes):
    """One arm. Returns the result dict; result['status'] is reproduced, other-crash, no-crash, invalid or blocked."""
    running = iina_pids()
    if running:
        return {'arm': arm, 'status': 'blocked', 'note': 'IINA is running%s; nothing was changed.' % (
            ' with a stuck exit' if any('E' in s for _, s in running) else '')}
    found = plugin_switches()
    stamp = datetime.now().strftime('%Y%m%dT%H%M%S')
    result = {'arm': arm, 'minutes': minutes, 'start': stamp, 'switchesFound': found}
    os.makedirs(os.path.join(HERE, 'results'), exist_ok=True)
    out_path = os.path.join(HERE, 'results', '%s-%s.json' % (stamp, arm))
    server = http.server.ThreadingHTTPServer(('localhost', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    before = crash_reports()
    launched = None
    try:
        if os.path.exists(INSTALLED):
            shutil.rmtree(INSTALLED)
        shutil.copytree(os.path.join(HERE, 'plugin'), INSTALLED)
        os.makedirs(DATA, exist_ok=True)
        for name in ('status-global.json', 'status-player.json'):
            if os.path.exists(os.path.join(DATA, name)):
                os.remove(os.path.join(DATA, name))
        media = os.path.join(DATA, 'silence.wav')
        write_silence(media)
        with open(os.path.join(DATA, 'arm.json'), 'w') as fh:
            json.dump({'arm': arm, 'port': server.server_address[1], 'media': media}, fh)
        for key, on in found.items():
            if key.startswith('PluginEnabled.local.iina.streams') and on:
                set_switch(key, False)
        set_switch('PluginEnabled.' + PLUGIN_ID, True)

        # -g: launch in the background, so the operator keeps focus (asked 2026-11-27).
        subprocess.run(['/usr/bin/open', '-g', '-a', IINA], check=True)
        for _ in range(30):
            pids = iina_pids()
            if pids:
                launched = pids[0][0]
                break
            time.sleep(1)
        result['pid'] = launched
        t0 = time.time()
        exited = False
        while time.time() - t0 < minutes * 60:
            time.sleep(10)
            if 'early' not in result and time.time() - t0 > 30:
                snap = {'global': read_json(os.path.join(DATA, 'status-global.json')) or {},
                        'player': read_json(os.path.join(DATA, 'status-player.json')) or {}}
                result['early'] = snap
                zero = [side + '.' + key for side, key in COUNTERS[arm] if not snap[side].get(key)]
                if zero and iina_pids():
                    result['status'] = 'invalid'
                    result['note'] = 'counters still zero at 30 s: ' + ', '.join(zero)
                    break
            if not iina_pids():
                exited = True
                break
        result['elapsedMinutes'] = round((time.time() - t0) / 60, 1)
        result['final'] = {'global': read_json(os.path.join(DATA, 'status-global.json')),
                           'player': read_json(os.path.join(DATA, 'status-player.json'))}
        if exited:
            # Crash reports can take ~30 s to write; wait up to 90 s for one from this IINA.
            mine = []
            for _ in range(18):
                mine = [classify(p) for p in sorted(crash_reports() - before)]
                if any(c.get('pid') == launched for c in mine):
                    break
                time.sleep(5)
            result['crashes'] = mine
            ours = [c for c in mine if c.get('pid') == launched]
            if not ours:
                result['status'] = 'other-crash'
                result['note'] = 'IINA exited with no crash report from pid %s' % launched
            elif any(c['verdict'].startswith('REPRODUCED') for c in ours):
                result['status'] = 'reproduced'
            else:
                result['status'] = 'other-crash'
        elif 'status' not in result:
            result['status'] = 'no-crash'
            result['note'] = 'no crash in the run (clears nothing)'
    finally:
        if iina_pids():
            subprocess.run(['/usr/bin/osascript', '-e', 'tell application "IINA" to quit'], capture_output=True)
            for _ in range(45):
                if not iina_pids():
                    break
                time.sleep(1)
        result['iinaStillRunning'] = bool(iina_pids())
        server.shutdown()
        # Restore the switches on every exit, even if IINA is still running (it only writes them when toggled).
        for key, on in found.items():
            set_switch(key, on)
        subprocess.run(['/usr/bin/defaults', 'delete', DOMAIN, 'PluginEnabled.' + PLUGIN_ID], capture_output=True)
        if not result['iinaStillRunning'] and os.path.exists(INSTALLED):
            shutil.rmtree(INSTALLED)
        result['restored'] = plugin_switches() == found
        with open(out_path, 'w') as fh:
            json.dump(result, fh, indent=1)
    result['path'] = out_path
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--arm', choices=ARMS)
    ap.add_argument('--chain', action='store_true', help='run every arm in order: ' + ' '.join(CHAIN))
    ap.add_argument('--minutes', type=float, default=15)
    args = ap.parse_args()
    if not args.arm and not args.chain:
        ap.error('give --arm or --chain')
    arms = CHAIN if args.chain else [args.arm]
    for arm in arms:
        r = run_arm(arm, args.minutes)
        print(json.dumps({k: r.get(k) for k in ('arm', 'status', 'elapsedMinutes', 'note', 'restored', 'iinaStillRunning', 'path')}), flush=True)
        for c in r.get('crashes') or []:
            print('   crash:', c.get('report'), c.get('verdict'), 'pid', c.get('pid'), flush=True)
        if r['status'] in ('invalid', 'blocked') or r.get('iinaStillRunning') or not r.get('restored'):
            print('chain stopped at', arm, flush=True)
            sys.exit(3)
        time.sleep(5)


if __name__ == '__main__':
    main()
