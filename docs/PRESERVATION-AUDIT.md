# Final native-work preservation audit — Apollo

**Final native-work read-only snapshot: 2026-11-08, 20:56:37–20:59:14 UTC. The checked original repository/plugin/app-version fields still match baseline. QA's exact development link and enable preference are absent; inactive QA data is retained. Both ordinary R2 candidates are installed and enabled, with every installed file matching the corresponding archive built from `127f6b98587bbdb8a6f2c532ad2a97665b4a7611`. IINA is left at its initial window. Reporting/commit work may continue. This is not stable-deployment approval or proof of comprehensive app/preference preservation. Earlier snapshots below are retained as timestamped history.**

The narrow read-only checks match the earlier recovery baseline for the two original repository branches/commits/clean states, original development/design plugin targets and identities, their enablement, the disabled Bridge, the enabled official plugins, and IINA's reported version/build. QA installation during testing and its subsequent retirement, plus the ordinary candidate installations, are recorded separately from that original-state comparison.

**Separate preservation exception and final discrepancy:** the main task reported an accidental geometry change to a pre-existing Safari window during an optional comparison. No exact pre-incident bounds were found. The earlier saved cleanup showed window `55998` with three tabs at approximately restored bounds; the final read-only query instead shows only window `56800` with one tab. The cause of this later metadata change is unknown, and the original three-tab state is not established at the final cutoff. The repository/plugin result must not be generalized to a claim that unrelated windows/tabs are currently preserved; see the final comparison below.

## Original checkouts

Each Git query succeeded. `git status --porcelain=v1 --untracked-files=all` returned no entries for either original checkout. `GIT_OPTIONAL_LOCKS=0` was supplied for these read-only queries.

| Checkout | Branch | HEAD | Comparison |
| --- | --- | --- | --- |
| `/Users/rookslog/development/iina-streams` | `design/tnf-quiet-streams` | `8140312e6df4ff48143712c6ce8b911160a17454` | Exact earlier branch/HEAD; working tree remains clean. |
| `/Users/rookslog/development/iina-streams-design` | `design/in-app-panel-comparison` | `a7b61e1e7e33c4e9a196f59d91bd5202532c7ac1` | Exact earlier branch/HEAD; working tree remains clean. |

The active candidate checkout is separate at `/Users/rookslog/development/iina-streams-candidates`. Its expected in-progress changes are outside this preservation comparison.

## Initial installed-plugin snapshot — 18:30 UTC

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

At this 18:30 snapshot, the QA symlink pointed to `/Users/rookslog/development/iina-streams-candidates/dist/native-qa/streams-qa.iinaplugin`.

No installed manifest has identifier `local.iina.streams`. All seven enumerated plugin entries had readable manifests. A scoped read of `PluginEnabled.local.iina.streams` returned exit status 1 and no value; no stable enablement value was obtained. Neither ordinary Unified nor Focus candidate development links was present in this snapshot.

## IINA application

`/Applications/IINA.app/Contents/Info.plist` reports:

| Field | Observed value | Earlier baseline |
| --- | --- | --- |
| `CFBundleIdentifier` | `com.colliderli.iina` | Same |
| `CFBundleShortVersionString` | `1.5.1` | Same |
| `CFBundleVersion` | `183` | Same |

This verifies the reported application identity/version/build. It is not a byte-for-byte audit of the entire application bundle, a code-signature verification, or a claim that macOS/IINA made no ordinary housekeeping writes during use.

## Initial manifest fingerprints — 18:30 UTC

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

## Initial pending closure — historical state

The earlier `evidence/native/pre-test-state.json` exists in the Apollo candidate tree and records an empty saved QA preference value. At the 18:30 and 19:13 snapshots, `PluginEnabled.local.iina.streams.qa` was `1`; those observations were not completed rollback evidence. The main task subsequently retired QA, as recorded in the 20:05 repeat below.

The required post-cleanup comparison covers original repository branch/HEAD/status, symlink targets, relevant manifest identities/fingerprints, selected enable preferences, stable-ID absence, and IINA version/build. The 20:05 repeat performs these checks after QA retirement while ordinary candidate native tests continue. A final snapshot after those tests must record the ultimate disposition of the ordinary candidate installations separately.

At that interim cutoff, the README and commission audit still labeled final native acceptance/packaging evidence as pending. That preservation result closed only the observed interim boundary checks. It did not establish final archive hashes, GUI installer compatibility, native feature acceptance, authorization success, resource advantages, or permission for stable deployment. The final section below supersedes the pending snapshot status while retaining the limits of each earlier observation.

## Audit operations

Read-only preservation operations were limited to Git branch/HEAD/status, plugin directory enumeration and symlink reads, public plugin manifests, the app's Info.plist, selected plugin-enable defaults keys, and the scoped pre-test QA baseline record. No app/UI action, Git mutation, installer, preference write, system installation, or credential access was performed. Only local candidate documentation was written.

## Repeat observation — 19:13 UTC

The repeated queries succeeded. Both original repositories still have the exact branches/HEADs in the first table, with empty porcelain status including untracked entries. Both original symlink targets also match the explicit values in the pre-test snapshot, not merely the 18:30 observation.

All six original installed plugin manifests have identical SHA-256 values to the 18:30 table. Their installed paths, manifest identifiers, versions, and selected enable preferences also match that snapshot. The Bridge remains disabled and the other five original plugins remain enabled. IINA still reports `com.colliderli.iina`, version `1.5.1`, build `183`. No installed stable `local.iina.streams` manifest or readable stable enable preference was found; ordinary Unified/Focus development links were still absent.

| Deliberate test-state difference | Earlier observation | 19:13 observation |
| --- | --- | --- |
| QA link and identifier | Present, enabled `local.iina.streams.qa` at 18:30; absent from the original installed-target baseline | Same QA target, identifier and version 0.5.0; enabled `1` |
| QA manifest SHA-256 | `891a5021fdf4201777ad18edbe9fd3fb7686b696c1d86136a7b9198e15dd847e` at 18:30 | `8a71ad74556ee7b37f64197cc85657e4d154381321736b5bb8b0cabb50fea9a3`; the QA build is evolving during authorized tests |
| QA enable preference | Empty saved pre-test value | `1`; restoration still pending |

No drift was observed in the checked original fields. This is narrower than a claim that every IINA preference is unchanged. `evidence/native/pre-test-state.json` contains original installed targets and the saved QA preference; it does not supply a before-value for every global IINA setting. The selected original plugin-enable states also match the earlier recovery audit. Global playback/layout preferences, full preference-domain bytes, credential stores, and unrelated application settings were not dumped or compared.

The concurrent sampler validation described in `RESOURCE-METHODOLOGY.md` was a read-only query of an existing IINA PID and did not change this preservation disposition. At this 19:13 cutoff, QA cleanup had not been confirmed to the auditor.

## Safari window geometry incident — reported during comparison

The main task reported that, after creating a new Safari document, it queried the front window before Safari's activation settled. A subsequent bounds operation therefore targeted the pre-existing window **55998**, which contained three tabs, and set its bounds to **{140, 140, 1420, 940}**. The main task reports that none of that window's tabs was closed or navigated. The newly created comparison window was identified separately as **56467**, with observed bounds **{0, 34, 1688, 1107}**. These coordinates use Safari's bounds convention (left, top, right, bottom), not width/height.

This auditor searched saved candidate evidence/docs/QA and original operational/design evidence/docs for window 55998, Safari bounds, and window inventories. The relevant match was the newly created `evidence/resources/safari-comparison-window.json`, modified at `2026-11-08T19:31:49.635960Z`; no earlier saved geometry for 55998 was found. The pre-test plugin snapshot does not contain Safari window bounds. Synthetic chat record IDs matching the number were unrelated and excluded.

The new comparison window's frame could be an inheritance clue, but it is not independent proof of the older window's former bounds. Exact restoration cannot be certified from the available pre-incident evidence. The incident is a bounded, disclosed change to unrelated window geometry; it does not establish tab/content loss, nor may it be omitted from the final preservation account.

The auditor subsequently reread the updated saved record. Its SHA-256 is `b3e16655cdea1adc433f318f9e1ee5c72b3e261fc9b3d8517065e94fb463f00d`, modified at `2026-11-08T19:34:13.116614Z`. It records cleanup at `19:34:13.115469Z`, `closedOwnedWindow:true`, and cleanup observation `55998, 3, 0, 34, 1688, 1107`: the pre-existing window remains with three tabs and was set to the inferred replacement bounds. The main task separately reports verifying the owned window's one-tab/public-source identity before closing it. This documents approximate restoration and owned-window closure; it does not prove an exact return to the unknown pre-incident frame. This auditor performed no Safari/UI operation.

The same record says Safari JavaScript inspection was disabled and decoded quality/codec/timing could not be verified. No inspection preference was enabled, and no matched-browser benchmark or efficiency conclusion is supported. Safari comparison cleanup is distinct from the later QA retirement documented below.

## Post-QA-retirement repeat — 20:05 UTC, preliminary handoff state

The read-only snapshot at `2026-11-08T20:05:43.276056–20:05:43.429843Z` independently confirms:

- Both original checkout branches and HEADs still exactly match the first table. Both porcelain status queries, including untracked files, are empty.
- Both original development/design symlinks still have the exact baseline targets. All six original installed manifests retain the SHA-256 values in the initial fingerprint table, their identifiers/versions, and their original enablement. The Bridge remains disabled; the other five original plugins remain enabled.
- IINA still reports identifier `com.colliderli.iina`, version `1.5.1`, build `183`.
- No installed manifest has the stable identifier `local.iina.streams`. Its scoped enable-preference query returns exit status 1 and no value.
- `streams-qa.iinaplugin-dev` no longer exists, and no installed QA manifest was enumerated. `PluginEnabled.local.iina.streams.qa` returns exit status 1 and no value, matching the saved absent-value state.
- The inactive `plugins/.data/local.iina.streams.qa` directory is retained. Its `twitch-client.json` file is absent. No retained data contents or credentials were inspected.

The saved `evidence/native/qa-retirement.json` has SHA-256 `c8f6f1bcfcbb4ec2df8a7b4615d19bbb5680c070223f9784a618e926192f5ebc` and timestamp `2026-11-08T20:03:59.072084+00:00`. It records exact QA-link removal, restoration of the absent QA enable preference, removal of the known fake public client ID, and retention of inactive QA data for evidence. The filesystem/preference observations above independently corroborate the relevant resulting state. This was a scoped retirement, not deletion of every QA artifact.

The two deliberate ordinary candidate additions are now regular installed directories, not development symlinks:

| Installed directory under the plugin base | Identifier | Version | Enabled | Files observed | Manifest SHA-256 |
| --- | --- | --- | --- | --- | --- |
| `local.iina.streams.candidate.unified.iinaplugin` | `local.iina.streams.candidate.unified` | `0.5.0` | `1` | 25 | `4be9fa5639684631d0cc8923cda00360e4d93a8321292908f88f77e2c859cd78` |
| `local.iina.streams.candidate.focus.iinaplugin` | `local.iina.streams.candidate.focus` | `0.5.0` | `1` | 25 | `3d080e824eb3286ec4da99e2a01ec2e8da506f16dfff0dacd1bbc0b33914b56a` |

Both generated configurations contain `qa:false`, and neither installed directory contains `qa-harness.js`. The main task reports that their 25 files match the `b3b5f07` package builds; this preservation pass checked their installed identities, manifest hashes, file counts, QA flag, and absence of the harness, not every archive-member byte. Native installation/menu/uninstall acceptance and the final package-byte ledger remain separate evidence.

**Functional acceptance remains open.** The retirement record states that IINA was not running at cleanup and names a new crash report at `19:56:25Z` as under investigation. The separate commission audit also records the earlier unresolved second-cycle anchor closure after one passing QA cycle. This preservation snapshot neither determines those causes nor converts those tests into passes. A clean original Git tree and removed QA link establish only the checked preservation state.

No unexpected drift was found in the checked original repository/plugin/app-version fields. The deliberate ordinary candidate installations, retained inactive QA data, and disclosed Safari geometry exception remained part of that interim handoff state. The required final repeat is recorded next; this 20:05 snapshot remains historical preliminary evidence.

## Final repeat after native work — 20:56–20:59 UTC

The main task reported native work complete at `20:54:44 UTC`. This auditor then made the final read-only repository/plugin/process/diagnostic queries at `20:56:37.391658–20:56:37.673010 UTC`, native-window/Safari metadata queries at `20:57:38.627467–20:57:38.818380 UTC`, a focused initial-window/pre-existing-Python clarification at `20:58:15 UTC`, and the exact candidate-status/cycle-record read at `20:59:14.348129 UTC`. The sanitized combined record is `evidence/native/final-preservation-snapshot.json`.

### Original state and final candidate disposition

Both original repositories remain clean, including untracked-file checks, at the exact branches and HEADs in the first table. `git worktree list --porcelain` shows those two original worktrees plus the separate candidate worktree; no original branch was moved. The operational worktree is registered with `/Users/rookslog/Development/iina-streams` capitalization, while the inspected checkout path uses `/Users/rookslog/development/iina-streams`; both resolve through the same observed Git worktree inventory.

Both original development/design symlink targets, all six original plugin manifest hashes, their identifiers/versions, and their selected enable preferences still match the baseline. The Bridge remains disabled and the other five original plugins remain enabled. IINA still reports `com.colliderli.iina`, version `1.5.1`, build `183`. This app comparison is limited to reported bundle identity/version/build; no original full-bundle fingerprint exists for a byte-for-byte preservation claim.

QA's development link and installed manifest are absent. Its enable-preference query returns exit status 1 and no value. The fake public-client configuration file is absent, and the inactive QA data directory remains retained for evidence. No installed stable `local.iina.streams` manifest, canonical stable folder, or readable stable enable preference was found.

Both final R2 candidates are retained as enabled regular installed directories, version `0.5.0`, containing 25 files each, `qa:false`, no QA harness, and no internal symlinks. Every installed file matches both the corresponding `dist/candidates` directory and every archive member. The build-manifest source commit is `127f6b98587bbdb8a6f2c532ad2a97665b4a7611`; manifest SHA-256 is `77df7786602b882c5f5a8c7646d4dcd8c01309723a5a063c763a34c1939da5be`.

| Final archive | Bytes | Independently verified SHA-256 | Installed comparison |
| --- | --- | --- | --- |
| `iina-streams-unified-0.5.0.iinaplgz` | 79,458 | `1ed65ddfe68d2c82066af91e7b0aa9520926fc0b02c19ffb3864cc35d0104726` | All 25 files match. |
| `iina-streams-focus-0.5.0.iinaplgz` | 79,455 | `642b1cbace5180cc6e176b15eb82e84a1fa0371c6e20d11c6afc55ca878c0d24` | All 25 files match. |

At `20:59:14 UTC`, the candidate branch remains `feature/candidate-portfolio-20261108` at the same `127f6b9` source commit. It has **five modified tracked files and 139 untracked entries**. The modified tracked paths are `docs/COMMISSION-AUDIT.md`, `evidence/native/focus-real-youtube-replay.json`, `evidence/tests/focus-final-qa-build.json`, `evidence/tests/node-final-core.txt`, and `evidence/tests/python-final-core.txt`. The untracked entries are native/resource/test evidence and QA sources/binaries. The exact porcelain output is preserved in the final JSON. Private evidence filenames are inventory metadata only; their contents were not read or exported by this audit. This is an intentionally unfinished reporting/evidence checkout at the snapshot time, not a claim that the candidate worktree is clean or that every evidence file is suitable for distribution. Root owns final selection, synchronization, and commit.

### Final native state, bounded lifecycle evidence, and processes

IINA PID `55428` remains alive as `/Applications/IINA.app/Contents/MacOS/IINA`, launched at `2026-11-08 15:28:59` local time (`20:28:59 UTC`). Read-only AX inspection finds one untitled window at position `{576, 508}`, size `{560, 440}`, containing the recognized `IINA`, `Open…`, and `Open URL…` controls. These establish the initial-window observation; a literal `AXTitle == IINA` check alone would be insufficient because the actual window title is empty. No recent-file values were exported. The auditor did not open or activate menus. Both candidate menu routes were exercised in the prior saved normal-run records and both installed identifiers remain enabled.

The independently read saved records support these bounded outcomes:

- Focus normal lifecycle: one smoke cycle plus five batch cycles, all completed/passed, ending at `20:34:21.205` and `20:35:17.181 UTC` respectively.
- Unified normal lifecycle: five batch cycles, all completed/passed, ending at `20:42:20.282 UTC`.
- Focus's final retained native-window close at `20:40:16 UTC` records `targetAbsent:true` and `allOtherNativeWindowIdentitiesPreserved:true`. The earlier AppleScript action's successful return had not established closure; that distinction remains in the saved record.
- Unified's Off check records five passing native checks, followed by a retained exact-window close at `20:54:44 UTC` with `targetAbsent:true` and `allOtherNativeWindowIdentitiesPreserved:true`.
- The native uninstall records for the preceding ordinary candidate archives show candidate-specific confirmation, row removal, and installed-folder absence before the final R2 installations. These records are distinct from final R2 install identity and lifecycle evidence.

These later bounded passes supersede the earlier “native work ongoing” wording for this handoff. They do not erase earlier crashes, the isolated unexpected anchor closure, the later menu-tracking/restart incident, or unexercised external authorization/Keychain gates. They also do not establish long-session or mixed-source stability.

The final process query found **zero descendants of IINA PID 55428** and **zero named candidate, extractor, or native QA executables**. The only other observed Python interpreter, PID `34794`, began on **2026-11-07 at 07:58:44 local time**, before this task, has PPID 1, and has a working directory outside the IINA worktrees. It was left untouched; no arbitrary command-line arguments or environment were read. Its function remains unattributed. The read-only audit query processes completed, and this auditor left no persistent sampler/query running. PPID-1 WebKit workers are not claimed as owned or absent merely from process ancestry.

The user and system top-level `DiagnosticReports` directories contain **no newer IINA `.ips` report after `2026-11-08T19:56:25Z`**. The latest is still `IINA-2026-11-08-145625.ips`, SHA-256 `675c05a910b034ff31d56dae8a511920b8fa92214180f228a8d3465b1dce132f`. This is a report inventory at the snapshot cutoff, not proof that all failures would produce a report or that prior defects are resolved.

### Final Safari discrepancy — current original-tab preservation not established

Only existing Safari process identity and window IDs/tab counts/bounds were queried. No tab URL/title was inspected, and no window, tab, focus, geometry, or setting was changed by this auditor. The main task reports no Safari operation after the earlier owned-window cleanup.

| Observation | Exact timestamp | Window inventory |
| --- | --- | --- |
| Saved comparison cleanup | `2026-11-08T19:34:13.115469+00:00` | Window `55998`, three tabs, bounds `{0, 34, 1688, 1107}`; owned comparison window `56467` recorded closed. |
| Final read-only metadata | `2026-11-08T20:57:38.627467–20:57:38.818380+00:00` | Only window `56800`, one tab, bounds `{139, 139, 1419, 939}`; window `55998` is not present in the returned inventory. |

The final metadata **does not match the earlier cleanup observation**. The original three-tab state was observed at the earlier cutoff and is **not established now**. The cause and attribution of this later change are unknown: neither the two inventories nor the task's action report proves user, external, or task responsibility. No restoration was attempted because the later state is unexplained and exact original content/geometry is not available. The original incident's inferred geometry restoration remains an additional limitation, not a substitute for this final discrepancy.

The resulting preservation conclusion is deliberately scoped: no drift was found in the checked original repositories, plugin targets/manifests/enablement, or reported app version; candidate additions and retained inactive QA data are expected; current Safari preservation cannot be certified. Stable deployment was not performed or approved by this audit.
