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
    return {'report': os.path.basename(path), 'verdict': verdict, 'x0': x0, 'top': top, 'jsc': jsc}


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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--arm', required=True, choices=ARMS)
    ap.add_argument('--minutes', type=float, default=15)
    args = ap.parse_args()

    running = iina_pids()
    if running:
        stuck = [p for p, s in running if 'E' in s]
        sys.exit('IINA is running%s; quit it first. Nothing was changed.' % (' with a stuck exit' if stuck else ''))

    found = plugin_switches()
    stamp = datetime.now().strftime('%Y%m%dT%H%M%S')
    result = {'arm': args.arm, 'minutes': args.minutes, 'start': stamp, 'switchesFound': found}
    os.makedirs(os.path.join(HERE, 'results'), exist_ok=True)
    out_path = os.path.join(HERE, 'results', '%s-%s.json' % (stamp, args.arm))

    server = http.server.ThreadingHTTPServer(('localhost', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    before = crash_reports()
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
            json.dump({'arm': args.arm, 'port': server.server_address[1], 'media': media}, fh)
        for key, on in found.items():
            if key.startswith('PluginEnabled.local.iina.streams') and on:
                set_switch(key, False)
        set_switch('PluginEnabled.' + PLUGIN_ID, True)

        subprocess.run(['/usr/bin/open', '-a', IINA], check=True)
        t0 = time.time()
        early = None
        crashed = None
        while time.time() - t0 < args.minutes * 60:
            time.sleep(10)
            if early is None and time.time() - t0 > 30:
                early = {'global': read_json(os.path.join(DATA, 'status-global.json')),
                         'player': read_json(os.path.join(DATA, 'status-player.json'))}
            new = crash_reports() - before
            if new:
                time.sleep(5)
                crashed = sorted(new)
                break
            if not iina_pids():
                time.sleep(20)
                crashed = sorted(crash_reports() - before) or ['IINA exited with no crash report']
                break
        result['elapsedMinutes'] = round((time.time() - t0) / 60, 1)
        result['early'] = early
        result['final'] = {'global': read_json(os.path.join(DATA, 'status-global.json')),
                           'player': read_json(os.path.join(DATA, 'status-player.json'))}
        if crashed:
            result['crashes'] = [classify(p) if p.endswith('.ips') else {'verdict': p} for p in crashed]
        else:
            result['crashes'] = []
            result['verdict'] = 'no crash in the run (clears nothing)'
    finally:
        if iina_pids():
            subprocess.run(['/usr/bin/osascript', '-e', 'tell application "IINA" to quit'], capture_output=True)
            for _ in range(30):
                if not iina_pids():
                    break
                time.sleep(1)
        result['iinaStillRunning'] = bool(iina_pids())
        server.shutdown()
        if not result['iinaStillRunning']:
            for key, on in found.items():
                set_switch(key, on)
            subprocess.run(['/usr/bin/defaults', 'delete', DOMAIN, 'PluginEnabled.' + PLUGIN_ID], capture_output=True)
            if os.path.exists(INSTALLED):
                shutil.rmtree(INSTALLED)
            result['restored'] = plugin_switches() == found
        else:
            result['restored'] = False
            result['note'] = 'IINA did not quit within 30 s; switches and the harness plugin were left as set.'
        with open(out_path, 'w') as fh:
            json.dump(result, fh, indent=1)
    print(json.dumps({k: result.get(k) for k in ('arm', 'elapsedMinutes', 'crashes', 'verdict', 'restored', 'iinaStillRunning')}, indent=1))
    print('result:', out_path)


if __name__ == '__main__':
    main()
