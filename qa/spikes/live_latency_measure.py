#!/usr/bin/env python3
"""Measure how far behind live headless mpv plays a Twitch channel, and how far ahead chat runs (#16, #31, #51).

Per channel it runs, at the same time and on the same playlist:
  A  mpv on the plain media-playlist URL, as Streams hands it to IINA's mpv today.
  B  as A with FFmpeg's HLS option live_start_index=-1 (start at the newest segment instead of three back).
  C  Streamlink --twitch-low-latency serving MPEG-TS on a local port, mpv playing that.
It also polls the media playlist every 2 s, reads anonymous chat (nick justinfanNNNN, IRCv3 tags) for
tmi-sent-ts, and drives scripted stress events on A (pause, seeks, Go Live attempts, quality change).

Output: <out>/rows.jsonl, one JSON object per line, numbers and tag names only (no URLs, tokens, IPs, chat text,
chat names). Analyse it with live_latency_analyze.py.

  python3 qa/spikes/live_latency_measure.py <channel> --out <dir> [--duration 600] [--no-events]
"""

import argparse
import json
import os
import random
import socket
import ssl
import shutil
import subprocess
import sys
import tempfile
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import live_lib as lib  # noqa: E402

PROPS = ["time-pos", "pause", "paused-for-cache", "core-idle", "idle-active", "eof-reached", "seeking",
         "demuxer-cache-state", "duration"]


class Log:
    def __init__(self, path):
        self.handle = open(path, "a", buffering=1)
        self.lock = threading.Lock()

    def write(self, row):
        with self.lock:
            self.handle.write(json.dumps(row) + "\n")


class State:
    """Shared, mutable run state: the phase label stamped on every sample, and the current rendition."""

    def __init__(self):
        self.phase = "startup"
        self.quality = None
        self.stop = threading.Event()


class Mpv:
    """One headless mpv with a JSON IPC socket."""

    def __init__(self, name, extra_args, socket_path, log):
        self.name = name
        self.log = log
        self.socket_path = socket_path
        self.extra_args = extra_args
        self.process = None
        self.sock = None
        self.pending = {}
        self.event_counts = {}
        self.counter = 0
        self.lock = threading.Lock()

    def start(self, headers):
        if os.path.exists(self.socket_path):
            os.unlink(self.socket_path)
        header_list = ",".join(k + ": " + v for k, v in headers.items())
        command = [lib.MPV, "--no-config", "--no-video", "--ao=null", "--idle=yes", "--rebase-start-time=no",
                   "--really-quiet", "--input-ipc-server=" + self.socket_path,
                   "--http-header-fields=" + header_list] + self.extra_args
        self.process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                self.sock = socket.socket(socket.AF_UNIX)
                self.sock.connect(self.socket_path)
                break
            except OSError:
                self.sock.close()
                time.sleep(0.1)
        threading.Thread(target=self.read_loop, daemon=True).start()

    def read_loop(self):
        buffer = b""
        while True:
            try:
                chunk = self.sock.recv(65536)
            except OSError:
                return
            if not chunk:
                return
            buffer += chunk
            while b"\n" in buffer:
                line, buffer = buffer.split(b"\n", 1)
                self.handle_line(line)

    def handle_line(self, line):
        try:
            obj = json.loads(line)
        except ValueError:
            return
        if "request_id" in obj and obj["request_id"] in self.pending:
            slot = self.pending[obj["request_id"]]
            slot["reply"] = obj
            slot["event"].set()
        elif "event" in obj and obj["event"] in ("start-file", "file-loaded", "end-file", "seek", "playback-restart"):
            self.event_counts[obj["event"]] = self.event_counts.get(obj["event"], 0) + 1
            self.log.write({"k": "mev", "v": self.name, "e": obj["event"], "t": time.time(),
                            "reason": obj.get("reason")})

    def request(self, *command, timeout=3):
        with self.lock:
            self.counter += 1
            number = self.counter
        slot = {"event": threading.Event(), "reply": None}
        self.pending[number] = slot
        try:
            self.sock.sendall((json.dumps({"command": list(command), "request_id": number}) + "\n").encode())
        except OSError:
            return {"error": "socket closed"}
        slot["event"].wait(timeout)
        self.pending.pop(number, None)
        return slot["reply"] or {"error": "timeout"}

    def get(self, name):
        reply = self.request("get_property", name)
        return reply.get("data") if reply.get("error") == "success" else None

    def stop(self):
        if self.process:
            self.process.terminate()


def sample_loop(mpv, state, log):
    """1 Hz: read the properties the issues name, stamped with the wall clock at the middle of the reads."""
    while not state.stop.is_set():
        start = time.time()
        values = {name: mpv.get(name) for name in PROPS}
        end = time.time()
        cache = values.pop("demuxer-cache-state") or {}
        log.write({"k": "mpv", "v": mpv.name, "t": (start + end) / 2, "ph": state.phase, "q": state.quality,
                   "tp": values["time-pos"], "pause": values["pause"], "pfc": values["paused-for-cache"],
                   "corei": values["core-idle"], "idle": values["idle-active"], "eof": values["eof-reached"],
                   "seeking": values["seeking"], "dur": values["duration"],
                   "cache_end": cache.get("cache-end"), "reader_pts": cache.get("reader-pts"),
                   "cache_dur": cache.get("cache-duration"), "underrun": cache.get("underrun"),
                   "ranges": [[r.get("start"), r.get("end")] for r in cache.get("seekable-ranges", [])]})
        state.stop.wait(max(0, 1.0 - (time.time() - start)))


def playlist_loop(streams_ref, state, log):
    """Every 2 s fetch the media playlist and log its numbers (window, edge, prefetch, ad tags)."""
    while not state.stop.is_set():
        stream = streams_ref["stream"]
        t0 = time.time()
        try:
            _, body, headers = lib.fetch(stream["url"], stream["headers"])
            log.write(lib.playlist_row(body.decode(), t0, time.time(), headers.get("Date")))
        except Exception as error:
            log.write({"k": "pl_error", "t": t0, "error": lib.mask(error)})
        state.stop.wait(2.0)


def chat_loop(channel, state, log):
    """Anonymous IRC; log (tmi-sent-ts, local receive time) only, never message text or names."""
    nick = "justinfan" + str(random.randint(10000, 99999))
    while not state.stop.is_set():
        try:
            raw = socket.create_connection(("irc.chat.twitch.tv", 6697), timeout=15)
            sock = ssl.create_default_context().wrap_socket(raw, server_hostname="irc.chat.twitch.tv")
            sock.settimeout(30)
            for line in ("CAP REQ :twitch.tv/tags twitch.tv/commands", "PASS SCHMOOZE", "NICK " + nick,
                         "JOIN #" + channel):
                sock.sendall((line + "\r\n").encode())
            log.write({"k": "chat_joined", "t": time.time()})
            buffer = ""
            while not state.stop.is_set():
                buffer += sock.recv(65536).decode("utf-8", "replace")
                received = time.time()
                while "\r\n" in buffer:
                    line, buffer = buffer.split("\r\n", 1)
                    if line.startswith("PING"):
                        sock.sendall(("PONG" + line[4:] + "\r\n").encode())
                    elif " PRIVMSG " in line and line.startswith("@"):
                        tags = dict(p.split("=", 1) for p in line[1:].split(" ", 1)[0].split(";") if "=" in p)
                        if "tmi-sent-ts" in tags:
                            log.write({"k": "chat", "S": int(tags["tmi-sent-ts"]) / 1000.0, "R": received})
        except (OSError, ssl.SSLError) as error:
            log.write({"k": "chat_error", "t": time.time(), "error": lib.mask(error)})
            state.stop.wait(3)


def start_streamlink_ll(channel, quality, port, log):
    """Streamlink low latency: prefetch segments and live edge 2, served as MPEG-TS on a local HTTP port."""
    command = [lib.STREAMLINK, "--no-config", "--no-plugin-cache", "--loglevel", "none", "--twitch-low-latency",
               "--player-external-http", "--player-external-http-port", str(port),
               "--player-external-http-interface", "127.0.0.1", "twitch.tv/" + channel, quality]
    process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    log.write({"k": "ev", "t": time.time(), "name": "streamlink-ll-start"})
    return process


def calibrate_into_log(label, stream, log):
    try:
        result = lib.calibrate(stream["url"], stream["headers"])
        log.write({"k": "cal", "t": time.time(), "q": label, **result})
    except Exception as error:
        log.write({"k": "cal_error", "t": time.time(), "q": label, "error": lib.mask(error)})


def build_schedule(streams, channel, quality, switch_quality, state, mpv_a, log, streams_ref):
    """The stress script, as (seconds after start, phase label, action). Everything acts on A only."""

    def mark(phase):
        state.phase = phase
        log.write({"k": "ev", "t": time.time(), "name": phase})

    def cmd(phase, *command):
        def run():
            mark(phase)
            reply = mpv_a.request(*command)
            log.write({"k": "cmd", "t": time.time(), "phase": phase, "command": command[0],
                       "error": reply.get("error")})
        return run

    def load(phase, stream_key, fresh):
        def run():
            mark(phase)
            if fresh:
                streams_ref["all"] = lib.resolve_twitch(channel)
            chosen = streams_ref["all"][stream_key]
            streams_ref["stream"] = streams_ref["all"][quality]
            state.quality = stream_key
            reply = mpv_a.request("loadfile", chosen["url"], "replace")
            log.write({"k": "cmd", "t": time.time(), "phase": phase, "command": "loadfile", "error": reply.get("error")})
            calibrate_into_log(stream_key, chosen, log)
        return run

    def seek_to_cache_end():
        mark("golive-seek-cache-end")
        cache_end = (mpv_a.get("demuxer-cache-state") or {}).get("cache-end")
        reply = mpv_a.request("seek", cache_end, "absolute") if cache_end is not None else {"error": "no cache-end"}
        log.write({"k": "cmd", "t": time.time(), "phase": "golive-seek-cache-end", "command": "seek-cache-end",
                   "error": reply.get("error")})

    return [
        (150, "pause30", lambda: (mark("pause30"), mpv_a.request("set_property", "pause", True))),
        (180, "after-pause30", lambda: (mark("after-pause30"), mpv_a.request("set_property", "pause", False))),
        (220, "rewind30", cmd("rewind30", "seek", -30, "relative")),
        (260, "rewind120", cmd("rewind120", "seek", -120, "relative")),
        (300, "rewind30-b", cmd("rewind30-b", "seek", -30, "relative")),
        (320, "golive-seek-end", cmd("golive-seek-end", "seek", 100, "absolute-percent")),
        (350, "rewind30-c", cmd("rewind30-c", "seek", -30, "relative")),
        (370, "golive-seek-cache-end", seek_to_cache_end),
        (400, "rewind30-d", cmd("rewind30-d", "seek", -30, "relative")),
        (420, "golive-reload-same-url", load("golive-reload-same-url", quality, False)),
        (470, "quality-change", load("quality-change", switch_quality, False)),
        (520, "pause30-b", lambda: (mark("pause30-b"), mpv_a.request("set_property", "pause", True))),
        (550, "after-pause30-b", lambda: (mark("after-pause30-b"), mpv_a.request("set_property", "pause", False))),
        (570, "golive-fresh-resolve", load("golive-fresh-resolve", quality, True)),
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("channel")
    parser.add_argument("--out", required=True)
    parser.add_argument("--duration", type=float, default=630)
    parser.add_argument("--quality", default="160p30")
    parser.add_argument("--switch-quality", default="360p30")
    parser.add_argument("--port", type=int, default=18741, help="local port for the Streamlink MPEG-TS server (C)")
    parser.add_argument("--no-events", action="store_true", help="baseline only, no stress events")
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)
    log = Log(os.path.join(args.out, "rows.jsonl"))
    state = State()
    state.quality = args.quality
    all_streams = lib.resolve_twitch(args.channel)
    streams_ref = {"all": all_streams, "stream": all_streams[args.quality]}
    stream = streams_ref["stream"]
    headers = stream["headers"]
    log.write({"k": "meta", "t": time.time(), "channel": args.channel,
               "qualities": sorted(all_streams)})

    # Calibration: PDT - raw PTS, for the base rendition and the one used by the quality-change event.
    for label in (args.quality, args.switch_quality):
        if label in all_streams:
            calibrate_into_log(label, all_streams[label], log)

    # A Unix socket path must be under about 100 bytes on macOS, so the sockets live in a short /tmp folder.
    sock_dir = tempfile.mkdtemp(prefix="ls-", dir="/tmp")
    mpv_a = Mpv("A", [], os.path.join(sock_dir, "a.sock"), log)
    mpv_b = Mpv("B", ["--demuxer-lavf-o=live_start_index=-1"], os.path.join(sock_dir, "b.sock"), log)
    mpv_c = Mpv("C", [], os.path.join(sock_dir, "c.sock"), log)
    players = [mpv_a, mpv_b, mpv_c]
    for player in players:
        player.start(headers)

    streamlink = start_streamlink_ll(args.channel, args.quality, args.port, log)
    threads = [threading.Thread(target=chat_loop, args=(args.channel, state, log), daemon=True),
               threading.Thread(target=playlist_loop, args=(streams_ref, state, log), daemon=True)]
    for player in players:
        threads.append(threading.Thread(target=sample_loop, args=(player, state, log), daemon=True))
    for thread in threads:
        thread.start()

    t_start = time.time()
    mpv_a.request("loadfile", stream["url"], "replace")
    mpv_b.request("loadfile", stream["url"], "replace")
    time.sleep(6)  # let Streamlink open its port
    mpv_c.request("loadfile", "http://127.0.0.1:" + str(args.port) + "/", "replace")
    log.write({"k": "ev", "t": time.time(), "name": "loaded-all", "since_start": time.time() - t_start})

    schedule = [] if args.no_events else build_schedule(
        all_streams, args.channel, args.quality, args.switch_quality, state, mpv_a, log, streams_ref)
    schedule.insert(0, (30, "baseline", lambda: setattr(state, "phase", "baseline")))
    for offset, name, action in schedule:
        delay = t_start + offset - time.time()
        if delay > 0:
            time.sleep(delay)
        action()
        print("t+%4ds %s" % (time.time() - t_start, name), flush=True)

    time.sleep(max(0, t_start + args.duration - time.time()))
    calibrate_into_log(args.quality + "-end", streams_ref["stream"], log)
    state.stop.set()
    time.sleep(1.5)
    for player in players:
        player.stop()
    streamlink.terminate()
    shutil.rmtree(sock_dir, ignore_errors=True)
    print("done", flush=True)


if __name__ == "__main__":
    main()
