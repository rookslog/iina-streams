#!/usr/bin/env python3
"""Opt-in real mpv headless HLS quality replacement probe. No IINA processes touched.

Requires --live. The command is bounded; every child belongs to this script.
Signed playlist URLs are held only in memory and never printed or persisted.
"""
import json
import os
import pathlib
import socket
import subprocess
import sys
import tempfile
import time

MPV = "/opt/homebrew/bin/mpv"
STREAMLINK = "/opt/homebrew/bin/streamlink"
SOURCE = "https://www.twitch.tv/hutchmf"

def extract(quality):
    p = subprocess.run(
        [STREAMLINK, "--no-config", "--loglevel", "error", "--stream-url", SOURCE, quality],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, timeout=15, check=True
    )
    url = p.stdout.strip()
    if not url.startswith("https://") or "\n" in url or len(url) > 4096:
        raise RuntimeError("Streamlink did not produce a safe HTTPS URL")
    return url

def send(sock, command, rid):
    sock.sendall((json.dumps({"command": command, "request_id": rid}) + "\n").encode())

def reply(sock, rid, deadline=6):
    sock.settimeout(deadline)
    buf = bytearray()
    t = time.monotonic() + deadline
    while time.monotonic() < t:
        c = sock.recv(16384)
        if not c: raise RuntimeError("mpv IPC closed")
        buf.extend(c)
        while b"\n" in buf:
            row, _, rest = buf.partition(b"\n")
            buf = bytearray(rest)
            res = json.loads(row)
            if res.get("request_id") == rid:
                return {k: v for k, v in res.items() if k in ("error", "data", "request_id")}
    raise TimeoutError("mpv request timed out")

def get(sock, name, rid):
    send(sock, ["get_property", name], rid)
    return reply(sock, rid)

def main():
    if sys.argv[1:] != ["--live"]:
        print("No playback started. Pass --live to run bounded stream test.")
        return 0
    with tempfile.TemporaryDirectory(prefix="iina-streams-mpv-") as tmp:
        path = str(pathlib.Path(tmp) / "mpv.sock")
        process = subprocess.Popen(
            [MPV, "--no-config", "--idle=yes", "--no-terminal", "--ytdl=no",
             "--vo=null", "--ao=null", "--hwdec=no", "--force-window=no",
             "--msg-level=all=error", "--input-ipc-server=" + path],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        try:
            for _ in range(60):
                if pathlib.Path(path).exists(): break
                if process.poll() is not None: raise RuntimeError("mpv exited early")
                time.sleep(.1)
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
                sock.connect(path)
                pid = process.pid
                print("mpv subprocess PID:", pid)
                for i, quality in enumerate(["160p30", "360p30"]):
                    url = extract(quality)
                    send(sock, ["loadfile", url, "replace"], 100+i)
                    status = reply(sock, 100+i)
                    print("loadfile", quality, "result:", status.get("error"))
                    if status.get("error") != "success":
                        raise RuntimeError("loadfile rejected by mpv")
                    time.sleep(6)
                    w = get(sock, "video-params/w", 200+i)
                    h = get(sock, "video-params/h", 300+i)
                    elapsed = get(sock, "playback-time", 400+i)
                    print("quality", quality, "width", w.get("data"),
                          "height", h.get("data"), "playback_seconds", elapsed.get("data"),
                          "mpv_same_pid", process.poll() is None)
                    if w.get("error") != "success" or not elapsed.get("data", 0) > 0:
                        raise RuntimeError("mpv decoder did not advance")
                print("PASS: mpv replaced HLS quality in same process")
        finally:
            process.terminate()
            try: process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=3)
            print("test-owned mpv process exited:", process.returncode is not None)
    return 0

if __name__ == "__main__":
    sys.exit(main())
