# Output-style drafts (not active)

`scan-first-situated.md` is a draft Claude Code output style. Nothing loads it from this folder:
Claude Code reads styles only from `.claude/output-styles/` in a project or in `~/.claude/`, and
only when a settings file's `outputStyle` names the style. To switch it on, roll it back, or check
that it is loaded, see
[`../OUTPUT-STYLE-PROPOSAL-2026-11-22.md`](../OUTPUT-STYLE-PROPOSAL-2026-11-22.md), section 5.

If you edit it, keep `name:` identical, letter for letter, to the `outputStyle` value in settings.
The match is case-sensitive, and a mismatch silently loads no style.
