# Development, release and rollback

How a change gets from a commit to your IINA, then to a release. The 0.2.0-era version of this file is in [archive/RELEASE-0.2.0-2026-11-07.md](archive/RELEASE-0.2.0-2026-11-07.md). Decision records: D-020 and its correction D-021 (version stamps), D-022 (linked dev identity), D-023 (branch and release model) in [DECISIONS.md](DECISIONS.md).

## Three identities

| Identity | Plugin ID | Version shown in IINA | How it reaches IINA | Use it for |
| --- | --- | --- | --- | --- |
| Stable | `local.iina.streams` | `0.5.3` | GitHub Release asset (IINA › Settings › Plugins › Install from GitHub), or a release `.iinaplgz` | Everyday watching |
| Beta | `local.iina.streams.beta` | `0.5.4-beta+g<sha>` | A packaged `.iinaplgz`: CI artifact for any pushed commit, or `npm run build:beta` | A frozen candidate you want to live with for a while |
| Dev | `local.iina.streams.dev` | `0.5.4-dev+g<sha>` | A symlink into a staged, tested build (`npm run dev:deploy`) | Day-to-day iteration without reinstalling |

IINA 1.5.1 keys plugin preferences, data (`plugins/.data/<id>`) and Keychain entries (service `<id> - twitch-readonly`, per `JavascriptAPIUtils.keychainRead`) by identifier. Each identity therefore keeps its own settings and **needs its own Twitch setup once**: re-enter the Twitch Client ID and approve a device-code sign-in. Enable only one Streams identity at a time. Two enabled identities give two *Open Stream…* items and two Streams sidebar tabs in ordinary players.

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

The stage lives at `~/Library/Application Support/iina-streams-dev/{current,previous}`. It is outside every worktree, so any worktree can deploy without relinking. `scripts/dev.py` never enables, reloads, launches or quits IINA, and it refuses to touch any link, folder or identity it did not create.

**Do not use Plugin › Reload All Plugins.** On 2026-11-22 it crashed IINA 1.5.1 (observed: crash report `IINA-2026-11-22-005118.ips`, an `EXC_BREAKPOINT` trap in IINA's `JavascriptAPISidebarView.loadFile`, called from a plugin event handler that `reloadAllPlugins` re-emitted). Which plugin made the call is unconfirmed: Streams Beta and the built-in OpenSubtitles plugin both load a sidebar on window-loaded. The likely cause is a weak, force-unwrapped reference in that function, but that is inferred from source. Relaunching IINA is the reload path. macOS's "Reopen" after a crash does not restore stream windows, which the plugin creates itself.

## Branches and CI

- **`main` = released code only.** IINA's GitHub install downloads the latest Release's `.iinaplgz` and falls back to `main`'s source zip when no Release exists. Its update check compares `main/Info.json` `ghVersion` with the installed one (`JavascriptPlugin.create(fromGitURL:)`, `checkNewVersion`). Moving `main` is therefore a release.
- **`beta` = integration** for the next version. Work happens on short branches off `beta` and merges back by PR.
- **CI** (`.github/workflows/ci.yml`) runs on every pushed branch and PR. It checks version metadata, runs both suites, and uploads a commit-stamped beta `.iinaplgz` as an artifact. A `v*` tag additionally builds the stable package and publishes the GitHub Release. `scripts/build.py` refuses stable packaging anywhere except a clean checkout at the matching tag.

## Versioning

Policy D-020 as corrected by D-021: the source version is the *next* release (now `0.5.4`), and every beta or dev build appends `-beta+g<sha>` or `-dev+g<sha>` (plus `.dirty`). Do not bump the version per experiment. `ghVersion` is an integer that IINA compares. Bump it once per release, in the release commit, and only when installed copies should be offered the update.

## Releasing vX.Y.Z

1. On `beta`: CI is green, the native acceptance pass is done (`.agents/skills/streams-native-acceptance/SKILL.md`), and the user has approved promotion.
2. Confirm `version` in `Info.json` and `package.json` is the release, `ghVersion` is one above `main`'s, and the `CHANGELOG.md` entry is written. For 0.5.4 this is already done on `beta` (0.5.4 / ghVersion 3; `main` is 0.5.3 / ghVersion 2).
3. Run `python3 scripts/build.py --sync-embedded`. CI fails if `src/embedded-helpers.js` is stale. Then get an independent review of `main...beta`, with its record in `docs/reviews/`.
4. Merge `beta` into `main` locally, and tag the merge commit `vX.Y.Z`. **Push the tag first, not `main`:** `git push origin vX.Y.Z`. The tag's CI builds the stable `.iinaplgz` and publishes the Release.
5. Wait until the Release shows the `.iinaplgz` asset. **Only then** push `main` (`git push origin main`). IINA's update check reads `main/Info.json` `ghVersion`. If `main` moves first, a 0.5.3 user can be updated from `main`'s source zip before the package exists, and then strands at the new `ghVersion`. That was the 2026-11-22 review's blocker; pushing `main` and the tag together does not prevent it, because the tag's CI takes minutes.
6. Install or update through IINA and smoke-test it.
7. On `beta`, set the next target version (for example 0.5.5) so beta and dev builds stop stamping the released number.

**State on 2026-11-22:** no GitHub Release has been published. The `v0.5.3` tag CI run failed in the Python suite, so the release job never ran, and GitHub installs currently receive `main`'s source zip.

## Rollback

- **Dev:** `npm run dev:rollback` swaps in the previous staged build. `npm run dev:unlink` removes only this tool's link. Relaunch IINA afterwards.
- **Beta:** reinstall the previous archive. CI artifacts are kept per commit, and local builds stay in `dist/beta/`.
- **Stable:** IINA keeps no backup when updating. Before installing a new stable build, copy `~/Library/Application Support/com.colliderli.iina/plugins/local.iina.streams.iinaplugin` aside. Stable deployment requires the user's explicit approval each time.
