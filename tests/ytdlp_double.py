"""A yt-dlp stand-in for the helper tests: what it prints for a command, given the info it "extracted".

Modelled on a real yt-dlp 2026.08.19 run over a fabricated info file (`--load-info-json`, 2026-11-22), not on
what the helpers do with the output:
  - `--dump-single-json` prints the whole info dict as one line.
  - each `-O TEMPLATE` prints one line. `%(.{a,b})j` prints an object holding the keys that exist,
    `%(formats.:.{a,b})j` prints a list of such objects, and `%(a.b)j` prints that value.
  - `%(key&1|0)s` prints 1 if the key holds a value and 0 if not (see the flag branch below).
  - a playlist info is not printed as itself: yt-dlp expands it and prints each entry, as a video, with the
    playlist's id added as `playlist_id` (see `printed_infos`). So `entries` is never 1 for a playlist; a
    one-entry playlist is how `--no-playlist` still yields a playlist-derived video (#54).
  - a value that does not exist prints NA. (NA for an absent `formats` list is inferred, not observed.)
It does not enforce the helpers' output cap; each test module does that with its own error class.
"""
import json
import re


def project_template(template, info):
    selected = re.fullmatch(r"%\((.*?)\.\{([^}]*)\}\)j", template)
    if selected:
        path, fields = selected.group(1), selected.group(2).split(",")
        value = info if path in ("", ".") else info.get(path.removesuffix(".:"))
        if value is None:
            return "NA"

        def pick(item):
            return {key: item[key] for key in fields if key in item}
        return json.dumps([pick(item) for item in value] if path.endswith(".:") else pick(value))
    flag = re.fullmatch(r"%\((\w+)&1\|0\)s", template)
    if flag:
        # Observed 2026-11-22 with yt-dlp 2026.08.19 evaluate_outtmpl: `%(k&1|0)s` prints 0 for a missing key,
        # None or {}, and 1 for anything else, including [] and ''. Presence, not length.
        value = info.get(flag.group(1))
        return "0" if value is None or value == {} else "1"
    plain = re.fullmatch(r"%\((.*)\)j", template)
    value = info
    for part in plain.group(1).split("."):
        value = value.get(part) if isinstance(value, dict) else None
    return "NA" if value is None else json.dumps(value)


def printed_infos(info):
    """The infos `-O` templates are applied to: the info itself, or for a playlist its entries, one each.

    Observed 2026-11-22 (yt-dlp 2026.08.19, `--no-clean-info-json --load-info-json`, a one-entry playlist and a
    standalone video, offline): the playlist printed one block, for the child, with `entries` 0 and `playlist_id`
    set to the playlist's id; the standalone video printed `playlist_id` 0. Inferred, not observed: a playlist
    of several entries prints one block per entry, and an empty playlist prints nothing.
    """
    if info.get("_type") in ("playlist", "multi_video"):
        return [dict(entry, playlist_id=info.get("id")) for entry in info.get("entries") or []]
    return [info]


def output(command, info):
    """The bytes yt-dlp would write to stdout for `command`."""
    if "--dump-single-json" in command:
        return json.dumps(info).encode("utf-8")
    templates = [command[i + 1] for i, arg in enumerate(command) if arg == "-O"]
    lines = [project_template(template, printed) for printed in printed_infos(info) for template in templates]
    return "\n".join(lines).encode("utf-8")
