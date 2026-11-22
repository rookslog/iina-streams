#!/usr/bin/env python3
"""Turn rows.jsonl from live_latency_measure.py into markdown tables.

  python3 qa/spikes/live_latency_analyze.py <run dir> [<run dir> ...]

Definitions (all in seconds):
  behind     = wall clock at the sample - (mpv time-pos + c), where c = PROGRAM-DATE-TIME - raw PTS of a segment
               (measured with ffprobe; mpv ran with --rebase-start-time=no so time-pos is the raw PTS).
  chat lead  = tmi-sent-ts - (video wall time at the moment the message arrived), i.e. how far into the video's
               future the message's send time sits. Equals behind - (arrival - tmi-sent-ts).
  edge age   = playlist response time - end of the newest regular segment (how stale the playlist's edge is).
"""

import json
import statistics
import sys
from collections import defaultdict


def load(path):
    rows = defaultdict(list)
    with open(path + "/rows.jsonl") as handle:
        for line in handle:
            row = json.loads(line)
            rows[row["k"]].append(row)
    return rows


def percentile(values, fraction):
    ordered = sorted(values)
    if not ordered:
        return None
    index = min(len(ordered) - 1, max(0, round(fraction * (len(ordered) - 1))))
    return ordered[index]


def summary(values):
    if not values:
        return {"n": 0}
    return {"n": len(values), "min": min(values), "p5": percentile(values, 0.05), "med": statistics.median(values),
            "p95": percentile(values, 0.95), "max": max(values)}


def fmt(value, digits=2):
    return "-" if value is None else ("%.*f" % (digits, value))


def table(headers, body):
    lines = ["| " + " | ".join(headers) + " |", "|" + "|".join(["---"] * len(headers)) + "|"]
    for row in body:
        lines.append("| " + " | ".join(str(cell) for cell in row) + " |")
    return "\n".join(lines)


def offsets(rows):
    """c per rendition label: mean of the calibrations, plus every raw value for the spread table."""
    by_label = defaultdict(list)
    for row in rows["cal"]:
        by_label[row["q"].replace("-end", "")].append(row["c"])
    return {label: statistics.mean(values) for label, values in by_label.items()}, by_label


def playing(sample):
    return sample["tp"] is not None and not sample["idle"]


def behind_series(rows, variant, c_by_label):
    series = []
    for s in rows["mpv"]:
        if s["v"] != variant or not playing(s):
            continue
        c = c_by_label.get(s["q"]) or next(iter(c_by_label.values()))
        series.append((s["t"], s["ph"], s["t"] - (s["tp"] + c), s))
    return series


def playhead_wall_time(series, when):
    """Video wall time at `when`, from the newest sample at or before it (advancing unless paused)."""
    previous = None
    for t, _, behind, sample in series:
        if t > when:
            break
        previous = (t, behind, sample)
    if previous is None:
        return None
    t, behind, sample = previous
    if when - t > 3:
        return None
    moving = not (sample["pause"] or sample["pfc"])
    return t - behind + ((when - t) if moving else 0)


def report(path):
    rows = load(path)
    channel = rows["meta"][0]["channel"]
    c_by_label, raw_c = offsets(rows)
    out = ["## %s  (%s)" % (channel, path.rstrip("/").split("/")[-1])]
    if not c_by_label:
        return "\n".join(out + ["No calibration rows; cannot compute behind-live."])

    out += ["", "### Calibration c = PDT - raw PTS (epoch seconds, last 6 digits shown)", ""]
    cal_rows = [[r["q"], "%.3f" % (r["c_first"] % 1e6), "%.3f" % (r["c_last"] % 1e6),
                 "%.3f" % ((r["c_first"] - r["c_last"]))] for r in rows["cal"]]
    out.append(table(["rendition", "c from oldest segment", "c from newest segment", "difference (s)"], cal_rows))

    out += ["", "### Behind live, by variant and phase (seconds)", ""]
    body = []
    series_by_variant = {v: behind_series(rows, v, c_by_label) for v in ("A", "B", "C")}
    for variant, series in series_by_variant.items():
        phases = []
        for _, phase, _, _ in series:
            if phase not in phases:
                phases.append(phase)
        for phase in phases:
            values = [b for _, ph, b, _ in series if ph == phase]
            s = summary(values)
            body.append([variant, phase, s["n"], fmt(values[0]), fmt(s["min"]), fmt(s["med"]), fmt(s["p95"]),
                         fmt(s["max"]), fmt(values[-1])])
    out.append(table(["variant", "phase", "n", "first", "min", "median", "p95", "max", "last"], body))

    out += ["", "### Baseline steady state: how well does a constant offset hold? (seconds)", ""]
    body = []
    for variant, series in series_by_variant.items():
        values = [b for _, ph, b, _ in series if ph == "baseline"]
        if len(values) < 5:
            continue
        median = statistics.median(values)
        deviations = [abs(v - median) for v in values]
        body.append([variant, len(values), fmt(median), fmt(statistics.pstdev(values)),
                     fmt(percentile(deviations, 0.5)), fmt(percentile(deviations, 0.95)), fmt(max(deviations))])
    out.append(table(["variant", "n", "median behind", "stdev", "median |dev|", "p95 |dev|", "max |dev|"], body))

    out += ["", "### Buffer ahead of the playhead and stalls (baseline phase)", ""]
    body = []
    for variant in ("A", "B", "C"):
        samples = [s for s in rows["mpv"] if s["v"] == variant and s["ph"] == "baseline" and playing(s)]
        ahead = [s["cache_end"] - s["tp"] for s in samples if s["cache_end"] is not None]
        stalls = sum(1 for s in samples if s["pfc"])
        underruns = sum(1 for s in samples if s["underrun"])
        s = summary(ahead)
        body.append([variant, len(samples), fmt(s.get("med")), fmt(s.get("min")), fmt(s.get("max")), stalls, underruns])
    out.append(table(["variant", "samples", "cache-end minus time-pos (median)", "min", "max",
                      "samples with paused-for-cache", "samples with underrun"], body))

    out += ["", "### Live playlist (every 2 s)", ""]
    playlists = [p for p in rows["pl"] if "last_end" in p]
    edge_age = [p["t1"] - p["last_end"] for p in playlists]
    prefetch_lead = [p["prefetch_end"] - p["t1"] for p in playlists if "prefetch_end" in p]
    windows = [p["window_s"] for p in playlists]
    out.append(table(["quantity", "n", "min", "median", "p95", "max"], [
        ["window of regular segments (s)", len(windows)] + [fmt(summary(windows)[k]) for k in ("min", "med", "p95", "max")],
        ["edge age: response - newest regular segment end (s)", len(edge_age)] +
        [fmt(summary(edge_age)[k]) for k in ("min", "med", "p95", "max")],
        ["prefetch end - response (s)", len(prefetch_lead)] +
        [fmt(summary(prefetch_lead)[k]) for k in ("min", "med", "p95", "max")]]))
    out.append("")
    out.append("regular segments per playlist: %s; prefetch tags per playlist: %s; playlist errors: %d; "
               "DATERANGE classes seen: %s; unknown classes: %s; discontinuity tags seen: %d" % (
                   sorted({p["n"] for p in playlists}), sorted({p["np"] for p in playlists}), len(rows["pl_error"]),
                   sorted({c for p in rows["pl"] for c in p["ranges"]}),
                   sorted({c for p in rows["pl"] for c in p["unknown_ranges"]}) or "none",
                   max([p["disc"] for p in rows["pl"]] or [0])))

    out += ["", "### Chat", ""]
    chats = rows["chat"]
    delivery = [m["R"] - m["S"] for m in chats]
    span = (chats[-1]["R"] - chats[0]["R"]) if len(chats) > 1 else 0
    out.append("messages: %d over %.0f s (%.1f per s). Delivery lag, arrival minus tmi-sent-ts: median %s, p5 %s, p95 %s, "
               "min %s (a negative value would mean clock skew)." % (
                   len(chats), span, len(chats) / span if span else 0, fmt(summary(delivery).get("med")),
                   fmt(summary(delivery).get("p5")), fmt(summary(delivery).get("p95")), fmt(summary(delivery).get("min"))))
    out.append("")
    body = []
    for variant, series in series_by_variant.items():
        for phase_filter in ("baseline", "all"):
            leads = []
            for m in chats:
                wall = playhead_wall_time(series, m["R"])
                if wall is None:
                    continue
                phase = next((ph for t, ph, _, _ in reversed(series) if t <= m["R"]), None)
                if phase_filter == "baseline" and phase != "baseline":
                    continue
                leads.append(m["S"] - wall)
            s = summary(leads)
            body.append([variant, phase_filter, s["n"], fmt(s.get("p5")), fmt(s.get("med")), fmt(s.get("p95")),
                         fmt(statistics.pstdev(leads) if len(leads) > 1 else None)])
    out.append(table(["variant", "messages", "n", "p5", "median chat lead", "p95", "stdev"], body))

    out += ["", "### Commands and player events on A", ""]
    out.append(table(["t (s from first row)", "command/phase", "mpv answer"],
                     [[fmt(c["t"] - rows["meta"][0]["t"], 0), c["phase"] + " / " + c["command"], c["error"]]
                      for c in rows["cmd"]]))
    out.append("")
    ranges = []
    for s in rows["mpv"]:
        if s["v"] == "A" and s["ranges"] and s["tp"] is not None:
            ranges.append((s["ph"], s["ranges"][0][1] - s["ranges"][0][0], s["tp"] - s["ranges"][0][0]))
    last_by_phase = {}
    for phase, span_s, position in ranges:
        last_by_phase[phase] = (span_s, position)
    out.append(table(["A phase", "seekable range length at the phase's last sample (s)", "playhead offset inside it (s)"],
                     [[ph, fmt(v[0]), fmt(v[1])] for ph, v in last_by_phase.items()]))
    mev_by_event = defaultdict(list)
    for e in rows["mev"]:
        if e["v"] == "A":
            mev_by_event[e["e"]].append(round(e["t"] - rows["meta"][0]["t"]))
    out.append("")
    out.append("A events (seconds from the first row): " + "; ".join("%s at %s" % (k, v) for k, v in mev_by_event.items()))
    return "\n".join(out)


def main():
    for path in sys.argv[1:]:
        print(report(path))
        print()


if __name__ == "__main__":
    main()
