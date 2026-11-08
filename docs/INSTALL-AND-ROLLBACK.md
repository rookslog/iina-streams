# Install and roll back the isolated candidates

Both final `.iinaplgz` archives are installed and enabled on Apollo through IINA’s native installer; all 25 files in each installed folder match the corresponding final archive. The exact final hashes are in `dist/candidates/build-manifest.json`. The separate guarded utility manages **development links** only. Both paths use the two unique candidate identities below; neither procedure replaces the stable, original development, or preview plugin. The installation record distinguishes observed folder/identity/enable results from permission-dialog actions: Focus’s final Install click was observed; Unified’s final confirmation action was not observed, although its installed bytes, enable state and ordinary playback were verified.

## Exact identities and paths

Apollo's candidate checkout is `/Users/rookslog/development/iina-streams-candidates`. Its test runtime is `/Applications/IINA.app`, with plugins in `/Users/rookslog/Library/Application Support/com.colliderli.iina/plugins`.

| Candidate | Required identifier | Built folder | Managed development link |
| --- | --- | --- | --- |
| Unified | `local.iina.streams.candidate.unified` | `dist/candidates/streams-unified.iinaplugin` | `streams-unified.iinaplugin-dev` |
| Focus | `local.iina.streams.candidate.focus` | `dist/candidates/streams-focus.iinaplugin` | `streams-focus.iinaplugin-dev` |

The displayed plugin names are **Streams Unified Candidate** and **Streams Focus Candidate**, version **0.5.0**. The final builder assigns sidebar tabs **Streams Unified** and **Streams Focus** respectively, and writes `qa:false` into both configurations. With no conflicting installed path, native archive installation creates `local.iina.streams.candidate.unified.iinaplugin` or `local.iina.streams.candidate.focus.iinaplugin` under the plugin directory. IINA can add a numeric suffix if a path exists: record the actual installed path and verify its `Info.json` identifier instead of assuming a filename.

The stable `local.iina.streams`, original `local.iina.streams.dev`, preview identities, and QA `local.iina.streams.qa` are outside this utility. Existing files, directories, foreign links, relative links, or links owned by another account at either candidate destination are refused. No `HOME` override or inferred home directory is used.

## Build the final packages

Build the current source using the candidate builder:

```bash
/usr/bin/python3 /Users/rookslog/development/iina-streams-candidates/scripts/build-candidates.py
```

Use `scripts/build-candidates.py` for this portfolio. The inherited `scripts/package-candidate.sh` has been retired with a fail-closed message to prevent accidentally packaging the old stable identity.

The build produces `iina-streams-unified-0.5.0.iinaplgz`, `iina-streams-focus-0.5.0.iinaplgz`, and `build-manifest.json` in `dist/candidates`. Record and compare the package SHA-256 values with that manifest:

```bash
/usr/bin/shasum -a 256 \
  /Users/rookslog/development/iina-streams-candidates/dist/candidates/iina-streams-unified-0.5.0.iinaplgz \
  /Users/rookslog/development/iina-streams-candidates/dist/candidates/iina-streams-focus-0.5.0.iinaplgz
```

Inspect each archive before installation: `Info.json` and entry files must be at the archive root, the identifier and sidebar name must match the table above, configuration must have `qa:false`, and `qa-harness.js` must be absent. Confirm that `src/embedded-helpers.js` contains the current `media`, `replay`, `acquire`, and `runner` helpers and their digests. A successful build or CRC check is separate from native installation acceptance.

## Install a release archive through IINA

Use the existing plugin-enabled `/Applications/IINA.app` environment. Preserve the global plugin preference and the enabled state of unrelated plugins. If the selected candidate currently has a development link, close its managed windows, disable that candidate, and use the guarded rollback below first. Ensure IINA has unloaded the old development row before installing the archive; a manual refresh or relaunch may be needed after preserving open work.

Open **one archive at a time**. These commands request native installation; they are not unattended installers:

```bash
/usr/bin/open -a /Applications/IINA.app \
  /Users/rookslog/development/iina-streams-candidates/dist/candidates/iina-streams-unified-0.5.0.iinaplgz
```

After finishing Unified's dialog and checks, the equivalent Focus command is:

```bash
/usr/bin/open -a /Applications/IINA.app \
  /Users/rookslog/development/iina-streams-candidates/dist/candidates/iina-streams-focus-0.5.0.iinaplgz
```

The UI alternative is **IINA → Settings… → Plugins → Install Local Package…**. The legacy preferences pane calls that button **Install Package…**. Select the same archive. The installed `iina-plugin --help` lists `new`, `pack`, `link`, and `unlink`; it does **not** offer archive `install`, `uninstall`, or `enable` commands. [IINA file-open routing](https://github.com/iina/iina/blob/v1.5.1/iina/AppDelegate.swift), [new Plugins settings](https://github.com/iina/iina/blob/v1.5.1/iina/SettingsPagePlugin.swift), [legacy Plugins preferences](https://github.com/iina/iina/blob/v1.5.1/iina/PrefPluginViewController.swift), [CLI source](https://github.com/iina/iina/blob/v1.5.1/iina-plugin/main.swift).

### Expected permissions and enable behavior

IINA presents a **Warning** sheet with **Install** and **Cancel**, asking the operator to review the plugin permissions. Both archives declare these four permissions:

| English permission row | Candidate use |
| --- | --- |
| Access the file system | Read selected archives, maintain private candidate data, and execute installed extractor or bundled helper programs. |
| Show Alerts | Display source, import, and setup dialogs. |
| Network Request | Contact the manifest's listed Twitch and YouTube hosts through IINA APIs. |
| Add overlays on videos | Render the optional chat overlay. |

The network row should list the manifest domains: `twitch.tv`, `*.twitch.tv`, `*.ttvnw.net`, `*.twitchcdn.net`, `d2vi6trrdongqn.cloudfront.net`, `youtube.com`, `*.youtube.com`, `youtu.be`, `*.googlevideo.com`, `id.twitch.tv`, and `irc-ws.chat.twitch.tv`. This list is an IINA API permission declaration; it is not a sandbox for subprocess extractors or mpv's returned media transport URLs. The filesystem permission also allows program execution, which is why archive identity and helper contents are checked before installation. [Permission labels](https://github.com/iina/iina/blob/v1.5.1/iina/en.lproj/Localizable.strings), [installer permission flow](https://github.com/iina/iina/blob/v1.5.1/iina/PluginManager.swift).

Choosing **Install** completes native installation and **automatically enables that candidate**. Confirm its displayed name, identifier, version, sidebar name, and enabled switch in Plugins settings. A separate manual enable is normally needed for a development link, not a newly accepted archive. If an unexpected duplicate/reinstall prompt appears, cancel and inspect the existing candidate row first: IINA's reinstall path removes the previous plugin root. The native uninstall controls are disabled for development links to protect their source directories, but the duplicate reinstall path still needs this precaution. [Install and replacement behavior](https://github.com/iina/iina/blob/v1.5.1/iina/PluginManager.swift), [installed path and removal behavior](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptPlugin.swift).

### Native archive rollback

Turn chat Off and close only the candidate's managed windows. In **Settings… → Plugins**, locate the exact candidate row, turn off its enabled switch, use an ordinary pointer click on its **ellipsis menu → Uninstall**, and confirm **OK** only when the dialog names that candidate. In the legacy pane, select that candidate and click **Uninstall**, then confirm **OK**. IINA also disables the candidate as part of uninstall and deletes its installed plugin folder. [New uninstall action](https://github.com/iina/iina/blob/v1.5.1/iina/SettingsPagePlugin.swift), [legacy uninstall action](https://github.com/iina/iina/blob/v1.5.1/iina/PrefPluginViewController.swift), [confirmation buttons](https://github.com/iina/iina/blob/v1.5.1/iina/Dialog.swift).

Both preceding candidate archives were actually removed through this native flow, with candidate-specific confirmation, row absence and installed-folder absence recorded in `unified-native-uninstall.json` and `focus-native-uninstall.json`. The final R2 archives were subsequently installed and retained for selection; they were not uninstalled again. Direct Accessibility AXPress on this settings ellipsis had triggered a separate host trap, so the verified procedure uses an ordinary pointer click.

Verify that the candidate row and recorded installed folder are gone and that the original plugin rows and their enable states remain intact. Native uninstall does not erase candidate data directories, per-plugin preferences, Keychain grants, the source checkout, or release archives. If a real grant was deliberately created and must be revoked/cleared, use the candidate's **Forget** action before uninstalling; no real OAuth grant was used in the development tests recorded here. Do not use broad filesystem deletion or preference resets as rollback. Restore a development link only if that is the chosen final state.

## Optional development-link plan

Review the proposed links without creating them:

```bash
/usr/bin/python3 /Users/rookslog/development/iina-streams-candidates/scripts/manage-candidates.py install \
  --plugins-dir '/Users/rookslog/Library/Application Support/com.colliderli.iina/plugins' \
  --variant all \
  --dry-run
```

The script requires an explicit `install`, `rollback`, or `status` action and an explicit `--plugins-dir`. Its default `--source-dir` is this checkout's `dist/candidates`; an override must be an absolute existing directory. Use `--variant unified` or `--variant focus` to act on one candidate. It does not build or extract archives, launch or quit IINA, enable a plugin, change global preferences, or modify the app bundle.

Before changing anything, it checks the selected `Info.json` identifiers, expected entry files, generated variant configuration with `qa:false`, absence of a QA harness, and absence of symlinks within the built candidate. It also refuses another installed plugin path carrying a selected candidate identifier. A valid manifest is an installation guard; the final build and native acceptance evidence remain separate checks.

## Install the development links

After reviewing the plan, run the same explicit action without `--dry-run`:

```bash
/usr/bin/python3 /Users/rookslog/development/iina-streams-candidates/scripts/manage-candidates.py install \
  --plugins-dir '/Users/rookslog/Library/Application Support/com.colliderli.iina/plugins' \
  --variant all
```

The JSON result lists every link, target, identifier, and operation. An already-correct absolute link is reported as unchanged. All selected variants pass preflight before the first link is created. If a later link creation fails, the utility removes only links it created during that invocation; it never replaces an existing destination.

Inspect the installed link state:

```bash
/usr/bin/python3 /Users/rookslog/development/iina-streams-candidates/scripts/manage-candidates.py status \
  --plugins-dir '/Users/rookslog/Library/Application Support/com.colliderli.iina/plugins' \
  --variant all
```

### Manual IINA controls

In the existing IINA test environment, open **IINA → Settings… / Preferences… → Plugins** and locate **Streams Unified Candidate** or **Streams Focus Candidate**. Enable the candidate row you intend to review. The script leaves this choice to the operator and does not alter the global plugin-enable preference. Keep the stable, original development, and preview plugin identities intact.

If IINA has not discovered a newly created link, reload or relaunch the selected app manually at a convenient point after preserving any open work. The installer never performs this step.

The native menu is named **Plugin** (singular) on the tested IINA build. The candidate global menu commands are **Open Stream — Unified…** and **Open Stream — Focus…**. From IINA’s initial window, use the command belonging to the candidate under review and enter a supported Twitch or YouTube source. IINA builds the Plugin menu from the active player’s loaded plugins; a managed candidate player exposes its own candidate. To compare the other one, return to the initial window or close only the owned candidate player and choose the other command there. A managed player exposes **Show Streams Unified** or **Show Streams Focus**, **Import Chat Archive…**, **Turn Chat Off**, **Chat in Sidebar**, and **Chat over Video**. Chat starts Off. Network chat authorization and **Fetch Replay** remain explicit actions; installing or enabling a candidate does not authorize chat.

## Roll back development links

Finish the candidate review and close its managed windows. Disable only the candidate rows in IINA's Plugins settings if they are enabled. Preview link removal:

```bash
/usr/bin/python3 /Users/rookslog/development/iina-streams-candidates/scripts/manage-candidates.py rollback \
  --plugins-dir '/Users/rookslog/Library/Application Support/com.colliderli.iina/plugins' \
  --variant all \
  --dry-run
```

Remove the exact owned links:

```bash
/usr/bin/python3 /Users/rookslog/development/iina-streams-candidates/scripts/manage-candidates.py rollback \
  --plugins-dir '/Users/rookslog/Library/Application Support/com.colliderli.iina/plugins' \
  --variant all
```

Rollback unlinks only the named, user-owned symlink whose stored absolute target exactly matches the selected candidate folder. It leaves the target folders, source checkout, release archives, candidate data, saved authorization, and every unrelated plugin alone. An absent link is a no-op. A changed or foreign link causes refusal before any selected link is removed.

If the exact owned link is dangling because its built folder has moved or disappeared, rollback may remove that link; its result explicitly reports `identityVerified:false`. If a target folder exists but its identity or configuration has changed, rollback refuses it. It never recursively removes a folder and never follows a link to delete its target. A partially completed rollback caused by an I/O failure is reported through `error.changedLinks` for inspection.

Use this rollback command for these development links. Candidate files installed from an archive are separate real directories and are intentionally not adopted or removed by this utility.

## Packaging acceptance record

A successful build, CRC check, unit test, or development-link run does **not** establish that a release archive has passed IINA's native installation path. Before describing either archive as installation-verified, the final verifier must:

1. Record the exact archive hash and inspect its `Info.json`, generated configuration, and embedded helpers. The selectable archives must have their separate candidate IDs, `qa:false`, no QA harness, and the current media, replay, acquisition, and cancellation helpers.
2. Avoid duplicate IDs by rolling back that candidate's development link and unloading its row before the native archive flow above. Confirm the permission sheet, installed folder, displayed name, identifier, version, distinct sidebar label, and automatic enable behavior for the selected archive.
3. Exercise its normal menu and managed player, including the explicit replay workflow and cancellation behavior, then record the native result against the same archive hash.
4. If testing rollback, remove only that archive-installed candidate and confirm the original plugin identities remain intact. Retain the final normal candidate installations for the user’s selection, as done here. Restore a development link only if that is the intended final state.

Record the final archive hash, installed folder and its identifier, app version, permission/enable observations, normal menu and managed-player result, rollback result, and unchanged original-plugin state. The final execution journal and commission audit must distinguish each observed gate from source inspection. This guide's native instructions were checked against IINA v1.5.1 source and the installed CLI's help; preparing this guide did not itself install, uninstall, launch, quit, or change preferences.

## Completed final acceptance

`package-acceptance-r2.json` ties final code commit `127f6b98587bbdb8a6f2c532ad2a97665b4a7611` to both archive hashes, exact installed contents, `qa:false`, absent QA harness, enabled states and native normal-use records. Focus completed six ordinary-menu child cycles and Unified five, each with eleven native checks; both final Fetch Replay actions acquired 693 messages. Off and exact owned-window closure were observed before handoff. The QA link and its temporary enable preference were retired. Stable `local.iina.streams` was neither installed nor enabled.
