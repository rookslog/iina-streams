#!/usr/bin/env python3
"""Compile/run bounded normal-menu IINA window cycles; no QA bridge.

Default is read-only inspect. --run explicitly enables native menu/prompt/close
actions. Run at most five cycles per invocation; use a second output file for
another batch. Swift retains AX references for the anchor and each new child.
Only the public YouTube source below is submitted. No mpv-clock claims.
"""
import argparse
import datetime
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_SOURCE = "https://www.youtube.com/watch?v=jNQXAC9IVRw"


def options(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--pid", required=True, type=int)
    p.add_argument("--anchor-title", default="All Aboard (ish) — YouTube")
    p.add_argument("--child-title", default="Me at the zoo — YouTube")
    p.add_argument("--cycles", type=int, default=5)
    p.add_argument("--variant", choices=("unified", "focus"), required=True,
                   help="Candidate command available in the paused anchor's native Plugin menu")
    p.add_argument("--run", action="store_true")
    p.add_argument("--output", required=True, type=Path)
    a = p.parse_args(argv)
    if a.pid <= 0 or not 1 <= a.cycles <= 5:
        p.error("PID must be positive; cycles must be 1–5")
    if not a.anchor_title.startswith("All Aboard") or not a.child_title.startswith("Me at the zoo"):
        p.error("Use the observed exact titles for the two allowlisted YouTube sources")
    if any(len(t) > 180 or any(ord(c) < 32 for c in t) for t in (a.anchor_title, a.child_title)):
        p.error("Invalid window title")
    a.output = a.output.expanduser().absolute()
    destination = ROOT / "evidence" / "native"
    if a.output.parent.resolve() != destination.resolve() or a.output.suffix != ".json":
        p.error("Output must be a new .json file directly in this checkout's evidence/native directory")
    if a.output.exists() or a.output.is_symlink():
        p.error("Output already exists; use a new name to preserve earlier evidence")
    return a


def main(argv=None):
    a = options(argv)
    if sys.platform != "darwin":
        raise SystemExit("Native Accessibility harness requires macOS; no actions performed")
    a.output.parent.mkdir(parents=True, exist_ok=True)
    initial = {"schemaVersion": 1, "pid": a.pid, "mode": "run" if a.run else "inspect",
               "publicURL": PUBLIC_SOURCE, "variant": a.variant, "plannedCycles": a.cycles, "completedCycles": 0,
               "complete": False, "allPassed": False, "phase": "compiling",
               "startedUTC": datetime.datetime.now(datetime.timezone.utc).isoformat(), "records": []}
    fd = os.open(str(a.output), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(initial, f, indent=2); f.write("\n")
    try:
        with tempfile.TemporaryDirectory(prefix="streams-normal-cycles-") as td:
            binary = Path(td) / "native-normal-cycles"
            compiled = subprocess.run(["/usr/bin/swiftc", str(Path(__file__).with_suffix(".swift")), "-o", str(binary)],
                                      capture_output=True, text=True, timeout=60)
            if compiled.returncode:
                raise RuntimeError("Swift compile failed: " + compiled.stderr[-6000:])
            args = [str(binary), str(a.pid), a.anchor_title, a.child_title, str(a.cycles),
                    str(a.output), "run" if a.run else "inspect", a.variant]
            result = subprocess.run(args, timeout=a.cycles * 45 + 25)
            if result.returncode:
                return result.returncode
            saved = json.loads(a.output.read_text())
            return 0 if saved.get("ok") else 1
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
        saved = json.loads(a.output.read_text())
        saved.update(complete=False, allPassed=False, ok=False, wrapperError=str(error),
                     wrapperEndedUTC=datetime.datetime.now(datetime.timezone.utc).isoformat())
        temporary = a.output.with_name(a.output.name + ".wrapper-tmp")
        with temporary.open("x") as f:
            json.dump(saved, f, indent=2); f.write("\n")
        os.replace(temporary, a.output)
        print(json.dumps({"ok": False, "output": str(a.output), "error": str(error)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
