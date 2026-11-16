#!/usr/bin/env python3
"""Exercise Chat Off during a real helper import in the isolated native QA package."""
import json
import time
from pathlib import Path
from control import call, ROOT, DATA

before = sorted(p.name for p in DATA.iterdir() if p.is_dir())
started = time.monotonic()
call('import-start', {'path': str(ROOT / 'evidence/raw/synthetic-twitch-100k.json')})
during = call('snapshot', {})
call('off', {})
deadline = time.monotonic() + 5
while True:
    after = call('snapshot', {})
    if not after['state']['native']['activeHelpers'] or time.monotonic() >= deadline:
        break
    time.sleep(.1)
time.sleep(.3)
directories = sorted(p.name for p in DATA.iterdir() if p.is_dir())
checks = {
    'chatOff': after['state']['controller']['chat']['mode'] == 'off',
    'noActiveHelpers': not after['state']['native']['activeHelpers'],
    'noMessages': not after['state']['controller']['messages'],
    'noNewOutputOrStaging': not (set(directories) - set(before)),
}
result = {'checks': checks, 'elapsedSeconds': time.monotonic() - started,
          'directoriesBefore': before, 'directoriesAfter': directories,
          'during': during, 'after': after}
variant = after['state']['controller']['variant']
(ROOT / 'evidence/native' / (variant + '-native-cancel.json')).write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'checks': checks, 'elapsedSeconds': result['elapsedSeconds'],
                  'helpersDuring': during['state']['native']['activeHelpers']}, indent=2))
raise SystemExit(0 if all(checks.values()) else 1)
