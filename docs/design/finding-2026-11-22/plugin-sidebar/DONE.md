# Done: plugin sidebar structures (2026-11-23)

## Files
- `README.md`: compares the three structures.
- `structure-a/index.html`: A, one list, like Twitch's sidebar.
- `structure-b/index.html`: B, what's playing first.
- `structure-c/index.html`: C, search and tabs, with what's playing at the bottom.
- `lowfi.css`, `lowfi.js`: the shared plain styles, and the person row and sample extras.

All three reuse `../open-stream/sample-data.js`, which is unchanged.

## `/impeccable doctor` (run first, `impeccable doctor --json`, on `beta` with this brief at `0466ca4`)
It reported two findings and no automatic repairs. Neither was acted on, because both repairs write outside this folder.
- **`config-build-path-unset` (mention).** No `buildPath` is recorded in `.impeccable/config.json`. `buildPath` chooses whether new landing-page-style surfaces start from a generated image or straight in code. Impeccable says to raise it only when image generation is available, and this session has none, so it is moot here. App screens are code-first either way.
- **`hook-not-installed` (route).** No Impeccable design hook is installed in `.claude/settings.local.json`. AGENTS.md records "no hook" as the operator's choice (WAITING W-10). `impeccable hooks off` would record that choice and silence the finding.

## Not done
- No styling, review, commit or IINA run.
- `shape`'s brief lives in `README.md`. It was not saved under `.impeccable/surfaces/`, because the write boundary is this folder.
