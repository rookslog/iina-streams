# Install and roll back the isolated candidates

This procedure manages **development links** for the two built candidates. It changes only their two unique link names in the explicitly supplied IINA plugin directory. The utility does not build or extract archives, launch or quit IINA, enable a plugin, change global preferences, or modify `/Applications/IINA.app`.

## Exact identities and paths

Apollo's candidate checkout is `/Users/rookslog/development/iina-streams-candidates`. Its test runtime is `/Applications/IINA.app`, with plugins in `/Users/rookslog/Library/Application Support/com.colliderli.iina/plugins`.

| Candidate | Required identifier | Built folder | Managed development link |
| --- | --- | --- | --- |
| Unified | `local.iina.streams.candidate.unified` | `dist/candidates/streams-unified.iinaplugin` | `streams-unified.iinaplugin-dev` |
| Focus | `local.iina.streams.candidate.focus` | `dist/candidates/streams-focus.iinaplugin` | `streams-focus.iinaplugin-dev` |

The stable `local.iina.streams`, original `local.iina.streams.dev`, preview identities, and QA `local.iina.streams.qa` are outside this utility. Existing files, directories, foreign links, relative links, or links owned by another account at either candidate destination are refused. No `HOME` override or inferred home directory is used.

## Build and review the link plan

Build the current source using the candidate builder:

```bash
/opt/homebrew/bin/python3 /Users/rookslog/development/iina-streams-candidates/scripts/build-candidates.py
```

Use `scripts/build-candidates.py` for this portfolio. The inherited `scripts/package-candidate.sh` targets a different plugin and is not part of this procedure.

Review the proposed links without creating them:

```bash
/opt/homebrew/bin/python3 /Users/rookslog/development/iina-streams-candidates/scripts/manage-candidates.py install \
  --plugins-dir '/Users/rookslog/Library/Application Support/com.colliderli.iina/plugins' \
  --variant all \
  --dry-run
```

The script requires an explicit `install`, `rollback`, or `status` action and an explicit `--plugins-dir`. Its default `--source-dir` is this checkout's `dist/candidates`; an override must be an absolute existing directory. Use `--variant unified` or `--variant focus` to act on one candidate.

Before changing anything, it checks the selected `Info.json` identifiers, expected entry files, generated variant configuration with `qa:false`, absence of a QA harness, and absence of symlinks within the built candidate. It also refuses another installed plugin path carrying a selected candidate identifier. A valid manifest is an installation guard; the final build and native acceptance evidence remain separate checks.

## Install the development links

After reviewing the plan, run the same explicit action without `--dry-run`:

```bash
/opt/homebrew/bin/python3 /Users/rookslog/development/iina-streams-candidates/scripts/manage-candidates.py install \
  --plugins-dir '/Users/rookslog/Library/Application Support/com.colliderli.iina/plugins' \
  --variant all
```

The JSON result lists every link, target, identifier, and operation. An already-correct absolute link is reported as unchanged. All selected variants pass preflight before the first link is created. If a later link creation fails, the utility removes only links it created during that invocation; it never replaces an existing destination.

Inspect the installed link state:

```bash
/opt/homebrew/bin/python3 /Users/rookslog/development/iina-streams-candidates/scripts/manage-candidates.py status \
  --plugins-dir '/Users/rookslog/Library/Application Support/com.colliderli.iina/plugins' \
  --variant all
```

### Manual IINA controls

In the existing IINA test environment, open **IINA → Settings… / Preferences… → Plugins** and locate **Streams Unified Candidate** or **Streams Focus Candidate**. Enable the candidate row you intend to review. The script leaves this choice to the operator and does not alter the global plugin-enable preference. Keep the stable, original development, and preview plugin identities intact.

If IINA has not discovered a newly created link, reload or relaunch the selected app manually at a convenient point after preserving any open work. The installer never performs this step.

The candidate global menu commands are **Open Stream — Unified…** and **Open Stream — Focus…**. Use the command belonging to the candidate under review and enter a supported Twitch or YouTube source. A managed player exposes **Show Streams Unified** or **Show Streams Focus**, **Import Chat Archive…**, **Turn Chat Off**, **Chat in Sidebar**, and **Chat over Video**. Chat starts Off. Network chat authorization and **Fetch Replay** remain explicit actions; installing or enabling a candidate does not authorize chat.

## Roll back development links

Finish the candidate review and close its managed windows. Disable only the candidate rows in IINA's Plugins settings if they are enabled. Preview link removal:

```bash
/opt/homebrew/bin/python3 /Users/rookslog/development/iina-streams-candidates/scripts/manage-candidates.py rollback \
  --plugins-dir '/Users/rookslog/Library/Application Support/com.colliderli.iina/plugins' \
  --variant all \
  --dry-run
```

Remove the exact owned links:

```bash
/opt/homebrew/bin/python3 /Users/rookslog/development/iina-streams-candidates/scripts/manage-candidates.py rollback \
  --plugins-dir '/Users/rookslog/Library/Application Support/com.colliderli.iina/plugins' \
  --variant all
```

Rollback unlinks only the named, user-owned symlink whose stored absolute target exactly matches the selected candidate folder. It leaves the target folders, source checkout, release archives, candidate data, saved authorization, and every unrelated plugin alone. An absent link is a no-op. A changed or foreign link causes refusal before any selected link is removed.

If the exact owned link is dangling because its built folder has moved or disappeared, rollback may remove that link; its result explicitly reports `identityVerified:false`. If a target folder exists but its identity or configuration has changed, rollback refuses it. It never recursively removes a folder and never follows a link to delete its target. A partially completed rollback caused by an I/O failure is reported through `error.changedLinks` for inspection.

Use this rollback command for these development links. Candidate files installed from an archive are separate real directories and are intentionally not adopted or removed by this utility.

## Release archive installation is a separate verification gate

The current build produces:

- `dist/candidates/iina-streams-unified-0.5.0.iinaplgz`
- `dist/candidates/iina-streams-focus-0.5.0.iinaplgz`
- `dist/candidates/build-manifest.json`, including package SHA-256 values

A successful build, CRC check, unit test, or development-link run does **not** establish that a release archive has passed IINA's native installation path. Before describing either archive as installation-verified, the final verifier must:

1. Record the exact archive hash and inspect its `Info.json`, generated configuration, and embedded helpers. The selectable archives must have their separate candidate IDs, `qa:false`, no QA harness, and the current media, replay, acquisition, and cancellation helpers.
2. Avoid duplicate IDs by rolling back that candidate's development link before installing its archive through IINA's normal plugin installation flow. Install only the candidate being checked and confirm its displayed name, identifier, and version.
3. Exercise its normal menu and managed player, including the explicit replay workflow and cancellation behavior, then record the native result against the same archive hash.
4. Remove only that archive-installed candidate when the test ends, confirm the original plugin identities remain intact, and restore a development link only if that is the intended final state.

The final execution journal and commission audit must record which archive installation gates were actually observed. This document does not claim they have already passed.
