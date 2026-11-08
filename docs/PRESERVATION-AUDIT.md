# Interim preservation audit — Apollo

**Observed 2026-11-08, 18:30:01.581417–18:30:01.804454 UTC. QA is currently installed and enabled; QA cleanup and the final post-cleanup preservation check remain pending. This is not a final package-readiness or stable-deployment approval.**

The narrow read-only check matches the earlier recovery baseline for the two original repository branches/commits/clean states, original development/design plugin targets and identities, their enablement, the disabled Bridge, the enabled official plugins, and IINA's reported version/build. The additional QA installation is the expected active test state.

## Original checkouts

Each Git query succeeded. `git status --porcelain=v1 --untracked-files=all` returned no entries for either original checkout. `GIT_OPTIONAL_LOCKS=0` was supplied for these read-only queries.

| Checkout | Branch | HEAD | Comparison |
| --- | --- | --- | --- |
| `/Users/rookslog/development/iina-streams` | `design/tnf-quiet-streams` | `8140312e6df4ff48143712c6ce8b911160a17454` | Exact earlier branch/HEAD; working tree remains clean. |
| `/Users/rookslog/development/iina-streams-design` | `design/in-app-panel-comparison` | `a7b61e1e7e33c4e9a196f59d91bd5202532c7ac1` | Exact earlier branch/HEAD; working tree remains clean. |

The active candidate checkout is separate at `/Users/rookslog/development/iina-streams-candidates`. Its expected in-progress changes are outside this preservation comparison.

## Installed plugins and selected enable preferences

Installation directory: `/Users/rookslog/Library/Application Support/com.colliderli.iina/plugins`.

Enablement was queried using only the relevant `PluginEnabled.<identifier>` keys in the `com.colliderli.iina` defaults domain. This key naming is confirmed by the inspected IINA 1.5.1 `JavascriptPlugin.swift` implementation. No complete preferences domain, Keychain contents, tokens, or credentials were read or printed.

| Installed entry | Manifest identifier | Observed version | Enabled value | Comparison/status |
| --- | --- | --- | --- | --- |
| `plugin-dev.iinaplugin-dev` | `local.iina.streams.dev` | `0.2.0` | `1` | Original symlink, identity, version, and enabled state match baseline. |
| `preview-plugin.iinaplugin-dev` | `local.iina.streams.design-preview` | `0.0.1` | `1` | Original symlink, identity, version, and enabled state match baseline. |
| `local.iina.streamlink-bridge.iinaplugin` | `local.iina.streamlink-bridge` | `0.1.0` | `0` | Original Bridge remains present and disabled. |
| `io.iina.ytdl.iinaplugin` | `io.iina.ytdl` | `0.9.8` | `1` | Original Online Media plugin remains present and enabled. |
| `io.iina.user-script.iinaplugin` | `io.iina.user-script` | `0.9.1` | `1` | Original User Scripts plugin remains present and enabled. |
| `io.iina.opensub.iinaplugin` | `io.iina.opensub` | `0.9.4` | `1` | Original OpenSubtitles plugin remains present and enabled. |
| `streams-qa.iinaplugin-dev` | `local.iina.streams.qa` | `0.5.0` | `1` | Additional active QA installation; cleanup pending. |

The exact original symlink targets remain:

- `plugin-dev.iinaplugin-dev` → `/Users/rookslog/development/iina-streams/plugin-dev`
- `preview-plugin.iinaplugin-dev` → `/Users/rookslog/development/iina-streams-design/preview-plugin`

The QA symlink currently points to `/Users/rookslog/development/iina-streams-candidates/dist/native-qa/streams-qa.iinaplugin`.

No installed manifest has identifier `local.iina.streams`. All seven enumerated plugin entries had readable manifests. A scoped read of `PluginEnabled.local.iina.streams` returned exit status 1 and no value; no stable enablement value was obtained. Neither ordinary Unified nor Focus candidate development links was present in this snapshot.

## IINA application

`/Applications/IINA.app/Contents/Info.plist` reports:

| Field | Observed value | Earlier baseline |
| --- | --- | --- |
| `CFBundleIdentifier` | `com.colliderli.iina` | Same |
| `CFBundleShortVersionString` | `1.5.1` | Same |
| `CFBundleVersion` | `183` | Same |

This verifies the reported application identity/version/build. It is not a byte-for-byte audit of the entire application bundle, a code-signature verification, or a claim that macOS/IINA made no ordinary housekeeping writes during use.

## Current manifest fingerprints

These SHA-256 values were collected from the installed entries' `Info.json` bytes during this snapshot. They provide exact comparison points for the final repeat; do not treat them as full plugin-directory or app-bundle fingerprints.

| Manifest identifier | SHA-256 |
| --- | --- |
| `local.iina.streams.dev` | `274458547206e328d7fd83f18b88654d18ac586fa565bf245909b1dc933aded9` |
| `local.iina.streams.design-preview` | `67147ade0603cc5de43eecacfd61c0baadc684052cd4555e936caa6ee228cc8e` |
| `local.iina.streamlink-bridge` | `37f0428e38c1751a714bdfa6e42bfde6dc1270842a2062d440f82c2acdf902f3` |
| `io.iina.ytdl` | `3acc9e087d3a9c12da0551780841bb692f1d270bfabb6f588c16af21d033fa12` |
| `io.iina.user-script` | `9113a1ce56532bf9aaccad10d22a1e522ca9d23d5aff2c6268749b3f4c3b7e76` |
| `io.iina.opensub` | `b937b6a64df4c04b969726ecb5ffddc17a9d6ae4c2e34d86a2b967044ee0f0cb` |
| `local.iina.streams.qa` | `891a5021fdf4201777ad18edbe9fd3fb7686b696c1d86136a7b9198e15dd847e` |

## Pending closure

The earlier `evidence/native/pre-test-state.json` exists in the Apollo candidate tree and records an empty saved QA preference value. Current `PluginEnabled.local.iina.streams.qa` is `1`; this difference is explicit, not a completed rollback. The main task owns QA removal and restoration of its pre-test enable-preference state.

After QA cleanup, repeat the original repository branch/HEAD/status queries, symlink targets, relevant manifest identities/fingerprints, selected enable preferences, stable-ID absence, and IINA version/build. Record the final disposition of any deliberately installed ordinary candidate links separately. Do not erase this interim snapshot or substitute it for that final check.

The current README and commission audit still label final native acceptance/packaging evidence as pending. This preservation result closes only the observed interim boundary checks. It does not establish final archive hashes, GUI installer compatibility, native feature acceptance, authorization success, resource advantages, or permission for stable deployment.

## Audit operations

Read-only operations were limited to Git branch/HEAD/status, plugin directory enumeration and symlink reads, public plugin manifests, the app's Info.plist, selected plugin-enable defaults keys, and the scoped pre-test QA baseline record. No app/UI action, Git mutation, installer, preference write, system installation, or credential access was performed. Only this report was written locally in the candidate documentation.
