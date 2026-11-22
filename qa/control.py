#!/usr/bin/env python3
"""Drive Streams Dev (local.iina.streams.dev) built with `npm run qa:deploy`.

    control.py open <url>          open a stream through the production managed-player path
    control.py click <id>          click a sidebar element by id ("refresh" or "#refresh")
    control.py state               print the redacted player and chat state
    control.py wait <condition>    poll state until e.g. controller.phase=playing or native.height>0
    control.py <command> --data J  any other harness command (snapshot, pause, seek, ...)

Each command is a request file in the dev plugin's @data folder; the harness answers with a
response file. State is redacted by the harness; this script drops credential-named fields again
before printing or saving.
"""
import argparse
import json
from pathlib import Path
import re
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
IDENTIFIER = 'local.iina.streams.dev'
# IINA keeps a plugin's @data folder at <IINA support>/plugins/.data/<identifier>/ (checked on disk).
DATA = Path.home() / 'Library/Application Support/com.colliderli.iina/plugins/.data' / IDENTIFIER
RESPONSE_TIMEOUT = 15
SECRET_KEY = re.compile(
    r'token|secret|password|passwd|authorization|credential|keychain|(?:device|user)[_-]?code|^code$', re.I
)
CONDITION = re.compile(r'^\s*([A-Za-z_][\w.-]*)\s*(==|=|!=|>=|<=|>|<)\s*(.*?)\s*$')


def call(command, data, target_source=None):
    """Send one request and return the response that acknowledges it."""
    if not DATA.is_dir():
        raise RuntimeError(f'No data folder at {DATA}. Run `npm run qa:deploy`, relaunch IINA and enable Streams Dev.')
    identifier = uuid.uuid4().hex
    request = {'id': identifier, 'command': command, 'data': data, 'targetSource': target_source}
    temporary = DATA / 'qa-request.tmp'
    temporary.write_text(json.dumps(request))
    temporary.replace(DATA / 'qa-request.json')
    deadline = time.monotonic() + RESPONSE_TIMEOUT
    while time.monotonic() < deadline:
        try:
            result = json.loads((DATA / 'qa-response.json').read_text())
            if result.get('id') == identifier:
                return result
        except (OSError, ValueError):
            pass
        time.sleep(.1)
    raise RuntimeError('QA plugin did not acknowledge ' + command)


def scrub(value):
    """Drop credential-named fields. The harness already redacts; this keeps saved files clean too."""
    if isinstance(value, dict):
        return {key: scrub(item) for key, item in value.items() if not SECRET_KEY.search(key)}
    if isinstance(value, list):
        return [scrub(item) for item in value]
    return value


def lookup(state, path):
    """Follow a dotted path such as controller.chat.mode; a missing part gives None."""
    current = state
    for part in path.split('.'):
        if isinstance(current, dict) and part in current:
            current = current[part]
        elif isinstance(current, list) and part.isdigit() and int(part) < len(current):
            current = current[int(part)]
        else:
            return None
    return current


def parse_value(text):
    try:
        return json.loads(text)
    except ValueError:
        return text


def is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def condition_holds(state, expression):
    """True when state satisfies `path OP value` (OP: = == != > >= < <=). Raises ValueError if malformed."""
    match = CONDITION.match(expression)
    if not match:
        raise ValueError(f'Not a condition: {expression!r}. Use path=value, e.g. controller.phase=playing')
    path, operator, text = match.groups()
    actual, expected = lookup(state, path), parse_value(text)
    if operator in ('=', '=='):
        return actual == expected
    if operator == '!=':
        return actual != expected
    if not (is_number(actual) and is_number(expected)):
        return False
    return {'>': actual > expected, '>=': actual >= expected, '<': actual < expected, '<=': actual <= expected}[operator]


def wait_for(expression, timeout, interval, target_source=None):
    """Poll `state` until the condition holds. Returns the matching response, or None on timeout."""
    condition_holds({}, expression)  # reject a malformed expression before polling
    deadline = time.monotonic() + timeout
    while True:
        response = call('state', {}, target_source)
        if condition_holds(response.get('state') or {}, expression):
            return response
        if time.monotonic() >= deadline:
            return None
        time.sleep(interval)


def summarize(result):
    summary = {'id': result.get('id'), 'result': result.get('result')}
    state = result.get('state') or {}
    summary['native'] = state.get('native')
    controller = state.get('controller') or {}
    for key in ['phase', 'quality', 'busy', 'error', 'source', 'view', 'chat']:
        summary[key] = controller.get(key)
    recent = (controller.get('messages') or [])[-3:]
    summary['messages'] = [{key: m.get(key) for key in ['id', 'time', 'author']} for m in recent]
    return summary


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('command')
    parser.add_argument('argument', nargs='?', help='url for open, element id for click, condition for wait')
    parser.add_argument('--data', default='{}', help='JSON data for a raw command')
    parser.add_argument('--settle', type=float, default=0)
    parser.add_argument('--save')
    parser.add_argument('--target-source')
    parser.add_argument('--timeout', type=float, default=30, help='wait: seconds before giving up')
    parser.add_argument('--interval', type=float, default=.5, help='wait: seconds between polls')
    return parser


def run(args, parser):
    target = args.target_source
    if args.command == 'open':
        if not args.argument:
            parser.error('open needs a url')
        return call('open', {'url': args.argument}, target)
    if args.command == 'click':
        if not args.argument:
            parser.error('click needs an element id')
        return call('click', {'id': args.argument}, target)
    if args.command == 'wait':
        if not args.argument:
            parser.error('wait needs a condition such as controller.phase=playing')
        try:
            response = wait_for(args.argument, args.timeout, args.interval, target)
        except ValueError as error:
            parser.error(str(error))
        if response is None:
            raise RuntimeError(f'Timed out after {args.timeout:g}s waiting for {args.argument}')
        return response
    return call(args.command, json.loads(args.data), target)


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        result = run(args, parser)
        if args.settle:
            time.sleep(max(0, min(30, args.settle)))
            after = call('snapshot', {}, args.target_source)
            after['actionResult'] = result
            result = after
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        return 1
    result = scrub(result)
    if args.save:
        if not re.fullmatch(r'[A-Za-z0-9_-]+', args.save):
            parser.error('Save name must be a plain basename')
        folder = ROOT / 'evidence/native'
        folder.mkdir(parents=True, exist_ok=True)
        (folder / (args.save + '.json')).write_text(json.dumps(result, indent=2) + '\n')
    shown = result.get('state') if args.command == 'state' else summarize(result)
    print(json.dumps(shown, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
