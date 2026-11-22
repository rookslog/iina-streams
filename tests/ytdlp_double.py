"""A yt-dlp stand-in for the helper tests: what it prints for a command, given the info it "extracted".

Modelled on a real yt-dlp 2026.08.19 run over a fabricated info file (`--load-info-json`, 2026-11-22), not on
what the helpers do with the output:
  - `--dump-single-json` prints the whole info dict as one line.
  - each `-O TEMPLATE` prints one line. `%(.{a,b})j` prints an object holding the keys that exist,
    `%(formats.:.{a,b})j` prints a list of such objects, and `%(a.b)j` prints that value.
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
    plain = re.fullmatch(r"%\((.*)\)j", template)
    value = info
    for part in plain.group(1).split("."):
        value = value.get(part) if isinstance(value, dict) else None
    return "NA" if value is None else json.dumps(value)


def output(command, info):
    """The bytes yt-dlp would write to stdout for `command`."""
    if "--dump-single-json" in command:
        return json.dumps(info).encode("utf-8")
    templates = [command[i + 1] for i, arg in enumerate(command) if arg == "-O"]
    return "\n".join(project_template(template, info) for template in templates).encode("utf-8")
