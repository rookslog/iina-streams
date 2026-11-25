# Development, release and rollback

How a change gets from a commit to your IINA, then to a release. The 0.2.0-era version of this file is in [archive/RELEASE-0.2.0-2026-11-07.md](archive/RELEASE-0.2.0-2026-11-07.md). Decision records: D-020 and its correction D-021 (version stamps), D-022 (linked dev identity), D-023 (branch and release model) in [DECISIONS.md](DECISIONS.md).

## Three identities

| Identity | Plugin ID | Version shown in IINA | How it reaches IINA | Use it for |
| --- | --- | --- | --- | --- |
| Stable | `local.iina.streams` | `0.5.4` | GitHub Release asset (IINA › Settings › Plugins › Install from GitHub), or a release `.iinaplgz` | Everyday watching |
| Beta | `local.iina.streams.beta` | `0.5.5-beta+g<sha>` | A packaged `.iinaplgz`: CI artifact for any pushed commit, or `npm run build:beta` | **The operator's daily copy:** the `beta` branch at tested checkpoints, including a release candidate before it ships |
| Dev | `local.iina.streams.dev` | `0.5.5-dev+g<sha>` | A symlink into a staged, tested build (`npm run dev:deploy`) | **The lead's test copy:** iteration and QA runs. Enabled only while the lead is testing in IINA |

IINA 1.5.1 keys plugin preferences, data (`plugins/.data/<id>`) and Keychain entries (service `<id> - twitch-readonly`, per `JavascriptAPIUtils.keychainRead`) by identifier. Each identity therefore keeps its own settings and **needs its own Twitch setup once**: re-enter the Twitch Client ID and approve a device-code sign-in. Enable only one Streams identity at a time. Two enabled identities give two *Open Stream…* items and two Streams sidebar tabs in ordinary players.

## Who runs which copy (2026-11-22)

- **You watch with Streams Beta.** The lead refreshes it (`npm run install-beta` from `beta`) only at a checkpoint, after a merge into `beta` passes every suite, and only while IINA is not running. A refresh never changes code under an open window. It takes effect the next time you open IINA. The previous Beta folder is kept under `~/Library/Application Support/iina-streams-dev/` for rollback.
- **The lead tests with Streams Dev.** `dev:deploy` and `qa:deploy` swap Dev's files, so never watch with Dev. A deploy under a running IINA can leave a new window running a mix of old and new files.
- **IINA is one app, and plugin switches are global.** A native test needs Dev on and Beta off, then IINA reopened. So a test happens only when you hand IINA over, and afterwards you switch back. Two enabled copies give two Open Stream items and two Streams sidebar tabs.
- **A release candidate is a `beta`-branch build, not a separate identity.** If you're going to live with it, it belongs in Beta.

## Daily loop (Dev)

One-time setup:

```sh
npm run dev:deploy   # runs every JS + Python test, builds Streams Dev, stages it
npm run dev:link     # one symlink: plugins/local.iina.streams.dev.iinaplugin-dev -> stage/current
```

Then quit and reopen IINA. In **Settings › Plugins**, enable **Streams Dev** and disable **Streams Beta**, then enter the Twitch Client ID and sign in once from a Streams Dev window.

For each change:

1. Commit. A build from uncommitted work is stamped `.dirty` and `dev:status` reports it as not matching HEAD.
2. `npm run dev:deploy`. If any test fails, the stage is left untouched.
3. Quit and reopen IINA (⌘Q), then open a Streams window. Check the version in Settings › Plugins: it names the commit you are running.

Other commands: `npm run dev:status` (link, enabled flag, staged commit vs this worktree's HEAD), `npm run dev:rollback` (swap back to the previous staged build), `npm run dev:unlink`.

To automate the Dev loop on `next`, run `npm run dev:install-hooks` once. The shared repository's post-commit and post-merge hooks start `scripts/dev.py auto` in the background from the triggering worktree. Other branches are ignored. If IINA is open, the build waits for IINA to quit; otherwise it starts immediately. Automatic builds test and stage a clean snapshot of `next`'s HEAD and always include the QA harness. Uncommitted changes only enter a manual build. Manual deploy and rollback refuse while the automatic worker holds the stage lock.

- Wait until `npm run dev:status` shows `pending: null` before reopening IINA. A pending request reports its `state` (`waiting` or `failed`) and `reason`; `stageLockActive` tells you whether a stage operation still holds the lock. Check `auto.log` in the stage directory for the latest run's bounded output.
- If a build fails, the 12-hour wait expires, or a worker stops with a request still pending, run `npm run dev:auto` on `next` to retry. This command runs in the foreground; the installed hooks run in the background.
- To turn off new automatic requests, run `npm run dev:uninstall-hooks` (or `python3 -B scripts/dev.py uninstall-hooks`). This removes only the marked hook blocks; any already-running worker is unaffected.

The stage lives at `~/Library/Application Support/iina-streams-dev/{current,previous}`. It is outside every worktree, so any worktree can deploy without relinking. `scripts/dev.py` never enables, reloads, launches or quits IINA, and it refuses to touch any link, folder or identity it did not create.

**Do not use Plugin › Reload All Plugins.** On 2026-11-22 it crashed IINA 1.5.1 (observed: crash report `IINA-2026-11-22-005118.ips`, an `EXC_BREAKPOINT` trap in IINA's `JavascriptAPISidebarView.loadFile`, called from a plugin event handler that `reloadAllPlugins` re-emitted). Which plugin made the call is unconfirmed: Streams Beta and the built-in OpenSubtitles plugin both load a sidebar on window-loaded. The likely cause is a weak, force-unwrapped reference in that function, but that is inferred from source. Relaunching IINA is the reload path. macOS's "Reopen" after a crash does not restore stream windows, which the plugin creates itself.

## QA mode (Dev only)

QA mode lets an agent drive Streams Dev without clicking: it can open a stream, click sidebar controls, read the player and chat state, and wait for a condition. It exists only in dev builds made with `--qa`. `scripts/build.py` refuses `--qa` for beta and stable, so those archives never carry `qa-harness.js` and always write `"qa":false` (tests: `tests/test_build_current.py`, `tests/test_qa_workflow.py`).

```sh
npm run qa:deploy          # same as dev:deploy --qa: runs the suites, stages a dev build with the harness
                           # quit and reopen IINA (not Reload All Plugins), Streams Dev enabled
python3 -B qa/control.py open https://www.twitch.tv/<channel>
python3 -B qa/control.py wait 'controller.phase=playing' --timeout 60
python3 -B qa/control.py click refresh                       # a sidebar element id
python3 -B qa/control.py state                               # redacted JSON
```

A later plain `npm run dev:deploy` replaces the stage with a build that has no harness; `npm run dev:status` shows `qa` for the staged build.

- **Transport.** `control.py` writes `qa-request.json` in the dev plugin's data folder, `~/Library/Application Support/com.colliderli.iina/plugins/.data/local.iina.streams.dev/`, and the harness answers in `qa-response.json`. Both belong to the dev identity; `control.py` does not touch the stable or beta data folders.
- **Redaction.** Every response carries state with credential-named fields dropped (`token`, `secret`, `userCode`, `deviceCode`, `keychain`...) and credential-shaped values replaced (`Bearer ...`, `oauth:...`, signed-URL parameters, long opaque strings). `control.py` drops credential-named fields again before printing or saving. This is a filter, not a guarantee: do not put a secret in a field name or value the filter would not recognize.
- **Commands.** `open <url>`, `click <id>`, `state`, `wait <path><op><value>` (`=`, `!=`, `>`, `>=`, `<`, `<=`; dotted path into the state, e.g. `native.height>0`). Any other harness command (`snapshot`, `pause`, `seek`, `quality`, `ui`...) is sent with `--data '<json>'`. `click` reaches the sidebar only: the overlay's QA hook reports state but has no click action.
- **One QA player at a time.** Pass `--target-source <id>` when more than one Streams window is open; without it, the first player to poll answers.
- **Not part of QA mode.** The other `qa/*.py` and `*.swift` scripts (`native-*`, `measure-resources.py`...) predate it; they now read the dev data folder but have not been re-run against it.

## Branches and CI

- **`main` = released code only.** IINA's GitHub install downloads the latest Release's `.iinaplgz` and falls back to `main`'s source zip when no Release exists. Its update check compares `main/Info.json` `ghVersion` with the installed one (`JavascriptPlugin.create(fromGitURL:)`, `checkNewVersion`). Moving `main` is therefore a release.
- **`beta` = integration** for the next version. Work happens on short branches off `beta` and merges back by PR.
- **CI** (`.github/workflows/ci.yml`) runs on every pushed branch and PR. It checks version metadata, runs both suites, and uploads a commit-stamped beta `.iinaplgz` as an artifact. A `v*` tag additionally builds the stable package and publishes the GitHub Release. `scripts/build.py` refuses stable packaging anywhere except a clean checkout at the matching tag.

## Versioning

Policy D-020 as corrected by D-021: the source version is the *next* release (now `0.5.5`), and every beta or dev build appends `-beta+g<sha>` or `-dev+g<sha>` (plus `.dirty`). Do not bump the version per experiment. `ghVersion` is an integer that IINA compares. Bump it once per release, in the release commit, and only when installed copies should be offered the update.

## Releasing vX.Y.Z

1. On `beta`: CI is green, the native acceptance pass is done (`.agents/skills/streams-native-acceptance/SKILL.md`), and the user has approved promotion.
2. Confirm `version` in `Info.json` and `package.json` is the release, `ghVersion` is one above `main`'s (bump it in the release commit), and the `CHANGELOG.md` entry is written.
3. Run `python3 scripts/build.py --sync-embedded`. CI fails if `src/embedded-helpers.js` is stale. Then get an independent review of `main...beta`, run under `docs/REVIEW.md`, with its record in `docs/reviews/`.
4. Merge `beta` into `main` locally, and tag the merge commit `vX.Y.Z`. With the tag on HEAD and a clean tree, run `npm test`, `npm run test:py` and `npm run build`: the tag's CI runs them on a tagged checkout, which an untagged `beta` never is (the v0.5.4 tag CI failed on exactly that). **Push the tag first, not `main`:** `git push origin vX.Y.Z`. The tag's CI builds the stable `.iinaplgz` and publishes the Release.
5. Wait until the Release shows the `.iinaplgz` asset. **Only then** push `main` (`git push origin main`). IINA's update check reads `main/Info.json` `ghVersion`. If `main` moves first, a 0.5.3 user can be updated from `main`'s source zip before the package exists, and then strands at the new `ghVersion`. That was the 2026-11-22 review's blocker; pushing `main` and the tag together does not prevent it, because the tag's CI takes minutes.
6. Install or update through IINA and smoke-test it.
7. On `beta`, set the next target version (for example 0.5.5) so beta and dev builds stop stamping the released number.

**State on 2026-11-22:** [v0.5.4](https://github.com/rookslog/iina-streams/releases/tag/v0.5.4) is the first published GitHub Release, with its `.iinaplgz` asset; `main` was pushed after the asset existed. At 17:02 the operator updated an installed 0.5.3 to 0.5.4 through IINA's own update. Observed: the installed `Info.json` reads `0.5.4`, `ghVersion` 3. This is the first observed run of step 6's update path. (The earlier `v0.5.3` tag CI run failed in the Python suite and never released.)

## Rollback

- **Dev:** `npm run dev:rollback` swaps in the previous staged build. `npm run dev:unlink` removes only this tool's link. Relaunch IINA afterwards.
- **Beta:** reinstall the previous archive. CI artifacts are kept per commit, and local builds stay in `dist/beta/`.
- **Stable:** IINA keeps no backup when updating. Before installing a new stable build, copy `~/Library/Application Support/com.colliderli.iina/plugins/local.iina.streams.iinaplugin` aside. Stable deployment requires the user's explicit approval each time.
