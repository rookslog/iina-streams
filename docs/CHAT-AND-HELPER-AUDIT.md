# Chat and helper lifecycle review

Review date: **2026-11-08**. Scope: current `candidate-plugin/src/io.js`, `src/player.js`, `src/replay.js`, and the bundled `replay.py`, `acquire.py`, and `runner.py` helpers. This is a source and focused regression review, supplemented by an actual public replay acquisition. It is not the final native acceptance ledger.

## Findings and disposition

| Finding | Evidence and consequence | Disposition |
| --- | --- | --- |
| Python callback before child exec while the cancellation watcher is active | `acquire.py` used `subprocess.Popen(preexec_fn=...)` to set `RLIMIT_FSIZE`. Python documents this callback as unsafe with threads: a child may deadlock before exec, before the parent has a process handle to time out. No such deadlock was observed in this run. | **Fixed.** A fresh isolated Python child applies the limit and `execve`s the exact extractor argv. No callback executes between fork and exec. The process retains its owned session/group. No `preexec_fn` remains in bundled helpers. |
| Import or pending file selection can supersede a newer Connect action | Two deterministic host tests failed: finishing an older import switched live mode back to replay, and a late picker selection started an import after Connect. The listener had not advanced `chatGeneration` or cancelled helper work. | **Fixed.** Connect first invokes the existing Off lifecycle, then starts the requested live state. A retained archive remains available for an explicit Resume. Three focused regressions pass; tests make no Twitch connection. |
| Cancellation at publication can orphan a finished private archive | A real helper with synthetic extractor output was interrupted immediately after atomic rename. The old wrapper returned `CANCELLED`, but the finished directory remained and the host had no successful ownership receipt. Direct replay interruption had the same cleanup gap. A second probe reproduced cancellation between helper return and JSON serialization. | **Fixed.** Acquisition checks cancellation after rename. Acquisition and import remove a published directory on an exception only if its device/inode still equals their own staging directory. Once publication commits, the main-scoped receipt guard permits its JSON ownership response to finish. Runner preserves that complete, valid success when cancellation races completion, allowing the host generation fence to discard stale state and clean its exact owned output. Deterministic regressions prove each boundary and preservation of a foreign replacement directory. |
| Stale results and control-file failures could bypass cleanup | Earlier root changes were reread: exact successful response paths establish ownership before the stale-generation return; cleanup never claims a failed or foreign result. Marker writes and deletion are best effort. Foreign-source deactivation cancels all this player's helpers. | **Verified in current source and focused host tests.** These are candidate-private operations; no stable or unrelated path is selected for deletion. |

Primary reference for the child-launch issue: [Python subprocess documentation](https://docs.python.org/3/library/subprocess.html#subprocess.Popen). The risk assessment follows that documented threading restriction; the fix additionally has actual child-launch and downloader evidence.

## Boundaries checked

- **Explicit chat intent.** Chat starts Off. Archive import is offline. The public replay fetch helper is invoked by the explicit Fetch Replay action; it is not an automatic live capture. Live authentication is a separate user action.
- **Acquisition source and access.** The helper accepts only the canonical public YouTube watch identity, validates matching metadata and the archive replay protocol, and rejects live, upcoming, processing, restricted, or absent replay. It invokes the installed yt-dlp with fixed argv, without a shell, user configuration, plugins, cache, browser cookies, supplied cookies, dependency installation, or remote component acquisition. Failures do not retry with credentials or alternative access paths.
- **Resource and process ownership.** Acquisition has a 30-second metadata ceiling within a 120-second total budget, a 64 MiB archive/work-directory ceiling, bounded pipes and JSON lines, and an owned process group. The child file limit does not change the parent or system limit. Cancellation targets the wrapper's own PID once; helper cleanup targets only groups it created. Polling is 50 ms in the wrapper and at most 100 ms in acquisition's normal wait loop; this is a scheduling interval, not a guaranteed end-to-end latency.
- **Bundled-code verification.** Runner accepts only owned, non-writable-by-others, hash-named helper files beside itself and verifies their digest. Cancellation markers must also be owned regular files in that directory. It does not follow or delete an unsafe marker. It stops its watcher, restores process state, bounds captured output, discards raw stderr, and emits structured errors.
- **Import and display.** UTF-8 JSON/JSONL and gzip are parsed incrementally; files must be regular. Input/expanded bytes, selected JSON values, depth, elapsed time, record count, SQLite size, index size, normalized output, and chunks are bounded. Generated chunk basenames cannot be archive-controlled paths. The selector retains at most two chunks and returns the last requested messages against the supplied playback position; it has no network or timer. HTML remains literal text.
- **Clock and provenance.** Twitch `content_offset_seconds` is retained directly; `video.start` is not subtracted. YouTube uses `replayChatItemAction.videoOffsetTimeMsec / 1000`, not Unix timestamps. Manual alignment is explicit. An embedded source ID is preserved and conflicting supplied identity is reported. Recognizing a file format never makes its contents authenticated: `provenance.verified` remains false.
- **Host boundary.** IINA manifest domains govern the relevant IINA APIs; they are not a subprocess network sandbox. The helpers' canonical source and metadata validation, extractor isolation flags, and media transport validation are separate controls. Do not describe the manifest as restricting every extractor or mpv network request.

Off stops replay observers, pending replay update timers, and live intent, and clears the in-memory chunk cache. The normalized archive may remain in the private data directory for deliberate Resume. Replacing the archive or closing the managed player requests cleanup of its owned cache. If native marker writing or deletion fails, state fencing still prevents stale UI adoption, but the helper's own bounded budget remains the fallback; immediate cancellation under a filesystem failure is not established.

## Verification performed for this review

Executed locally after the fixes:

```text
python3 -m unittest tests_candidate.test_acquire tests_candidate.test_runner tests_candidate.test_replay tests_candidate.test_publication
50 passed

node --test tests_candidate/player-chat-race.test.js tests_candidate/io.test.js
6 passed
```

The new regressions were observed failing before production changes. They include literal argument preservation, child-only resource limits, a sanitized missing executable, real owned descendant cleanup, actual helper staging cancellation, publication interruption, interruption between helper return and response serialization, stale successful ownership receipts, foreign directory preservation, pending import/picker supersession, and retained Resume. All extractor/chat payloads in these tests are explicitly synthetic. The independent host reviewer separately reports the complete Node suite passing 99 tests after its visibility fix; this report's directly executed scope is the focused commands above.

### Actual public archive evidence

The earlier genuine acquisition of [The Coding Train, “All Aboard (ish)”](https://www.youtube.com/watch?v=92h_kU8O58M) used the installed Apollo yt-dlp `2026.08.19` and completed without credentials. Its 1,008,784-byte archive contained 701 timed wrappers. Import produced **693 messages**: 687 text, 3 membership, and 3 paid messages, with 9 unsupported actions and no invalid records. The selector was exercised at 0, 120, 300, and 3,600 seconds and then backwards to 120, without future messages. This was helper/selector validation, not an observation of an actual mpv clock.

The child-launch fix was additionally exercised on Apollo through the real hashed cancellation runner and installed yt-dlp. It fetched the same public replay successfully in **6.622 seconds**, exited zero with empty stderr, and produced 1,008,784 bytes / 701 JSON lines. The watcher was active. This acquisition ran before the subsequent publication-cleanup patch; those later changes have the focused interruption regressions above.

| Artifact | Evidence |
| --- | --- |
| Original genuine raw archive | `evidence/raw/real-youtube-replay-92h_kU8O58M/replay.jsonl`; SHA-256 `9034a377f9f2a1874c18f2aff3f63f8077d20917fbc6a54a0623d7a9275dee44` |
| Original normalized genuine archive | `evidence/raw/real-youtube-replay-92h_kU8O58M-index/index.json`; 693 messages, one chunk |
| Actual child-launch regression archive | `evidence/raw/real-youtube-replay-launcher-92h_kU8O58M/replay.jsonl`; SHA-256 `4db3504a8ec06f11f9a474e8f7c519e7cda89df91909f4d49fb0ffa18ec803a1` |
| Helper executed for that launch regression | acquire SHA-256 `41f7c8a0c34776bbd6a44862b32a55cb258157456678e31f1a64118250f691be`; runner `92acd9f9c442a4a4135d81ce1594330fafa089083a13b2c4879da3c7c46bf931` |

These artifact paths are relative to `/Users/rookslog/development/iina-streams-candidates`. Raw data is retained under ignored evidence paths rather than included in release packages. Current fetch/import UI does not persist a source identity from yt-dlp JSONL that lacks one; identity is unknown for such imported files, not verified against the video. The original evidence import supplied the known ID explicitly from its acquisition context.

## Acceptance limits

The **100,000-message Twitch test is synthetic stress data**. It is not evidence of an acquired Twitch VOD archive. The maintained TwitchDownloader format was inspected and is implemented as a real import route, but no installed TwitchDownloaderCLI/dotnet or genuine Twitch archive acquisition was exercised in this run.

No authenticated Twitch read-only session was exercised; no real OAuth grant, live chat receipt, or real credential refresh/Forget acceptance is claimed. Offline transport/auth tests cannot close that gate. Actual IINA replay synchronization, native cancellation behavior, overlay behavior, and final rebuilt-package verification belong to the root's native evidence and final acceptance ledger. This review neither infers those outcomes from fixtures nor authorizes a stable deployment.

Final helper source digests at this review cutoff:

| File | SHA-256 |
| --- | --- |
| `candidate-plugin/helpers/acquire.py` | `197da6ff90f9a00bbaf97aee78c113f09fcac96321a1555df6bf0ef5916fe05b` |
| `candidate-plugin/helpers/replay.py` | `e6f05acdec920849d6b83e0bf600f7bc28b88dfe31264c8a0a9ce2dbea902632` |
| `candidate-plugin/helpers/runner.py` | `c1b4cda33b7c43d50e7530f2528b7e6eed13fabf24a909d6949f988c064fb3f3` |

## Native follow-up: replay and authorization callback binding

**Genuine replay gate advanced.** After the helper review, root exercised the real Focus **Fetch Replay** UI and its native playback clock. This reviewer independently read `evidence/native/focus-real-youtube-replay.json`: `fetchButtonTested` is true; it contains 16 native records and **51 passing checks** for bounded history, absence of future messages, exact rows at stationary positions, forward/backward seeks, pause, 0.5× and 2× playback clocks, explicit offset, restoration, and the genuine message count. Its provenance identifies the public ended YouTube stream `92h_kU8O58M`. Artifact SHA-256: `98c5198358111cb875335720f4d292a85360877f5e72c480ed754c141b8d949e`. These observations supersede the earlier pending **Focus genuine native replay** gate; they do not establish the other candidate, an authenticated Twitch session, or the final rebuilt packages.

**Authorization bridge issue remains a distinct gate.** Root observed that the native broker emitted `needs-client` but the child did not adopt it. Numeric target routing and callback argument order match the inspected IINA 1.5.1 implementation. Immediate, deferred, and broadcast QA replies initially failed. Root also reported an IINA crash with JavaScriptCore heap-sweep frames; timing is not proof that the message probe caused it. A later fresh-process probe succeeded with deferred child callback registration, a JavaScript-retained callback, and one deferred numeric primitive reply. That probe establishes a working narrow path, not a proven underlying host defect.

The production child now binds its four authorization callbacks from one 0 ms setup timer and retains their function table on the controller. The timer entry is explicitly cleared when it fires, as the inspected native one-shot implementation retains fired entries until cleared. Close or source deactivation cancels and guards setup. A Connect action arriving before setup queues only that explicit intent; Off, close, and source changes invalidate it. Passive setup after Off binds callbacks without authentication, secret access, or networking. All retained handlers reject closed/inactive players. Broker delivery and payload formats were deliberately preserved for native isolation.

Seven focused binding tests pass after six were observed failing first. The combined binding, import race, quality, and host lifecycle run passes **32 tests**:

```text
node --test tests_candidate/player-auth-binding.test.js tests_candidate/player-chat-race.test.js tests_candidate/player-lifecycle-review.test.js tests_candidate/player.test.js
```

The source review supports the lifecycle approach. The successful native evidence at this cutoff is still the **QA pong probe**. Native immediate object authorization-state delivery, stability after the final timer integration, and any real OAuth/IRC grant remain pending. No live authorization, credential exchange, or authenticated chat receipt is inferred from this change.

Relevant primary sources: [IINA Global API implementation](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptAPIGlobal.swift), [message hub and managed references](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptMessageHub.swift), [native timer implementation](https://github.com/iina/iina/blob/v1.5.1/iina/JavascriptPolyfill.swift), and [Apple managed-reference ownership requirements](https://developer.apple.com/documentation/javascriptcore/jsvirtualmachine/addmanagedreference(_:withowner:)).

### Subsequent authorization transport correction

Root's next native test showed that deferred, retained child binding **alone did not fix immediate object authorization replies**: the broker emitted `needs-client`, while the child stayed Off. The preceding binding-only description is therefore historical, not a successful native authorization gate.

The production broker now follows the successful narrow probe: it serializes each authorization payload to a JSON primitive string of at most 8,192 characters and dispatches it on a 0 ms timer through the owned timer wrapper. Every delivery checks that the numeric child remains managed and that its own session revision is unchanged. Connect, Off, and Forget advance that target's revision; close removes it. State and credential messages additionally require that child to remain opted in, and credential delivery requires the queued token to equal the current broker token. Stop and Forget receipts remain deliverable after deliberate audience clearing.

A shared-authentication regression was reproduced during review: a single broker-generation guard could discard the stop required by child B when child A forgot authorization and immediately reconnected. The final per-child revision guard preserves B's stop and rejects A's obsolete stop/Forget receipt. This case was RED with the broker guard and GREEN with per-child revisions. Closed targets and opted-out credential recipients are also covered.

Child callbacks retain the deferred binding and explicit function table. They accept only bounded JSON strings that decode to the expected object shapes, reject malformed/oversized input without echoing it into logs, and preserve the closed/source-inactive/Off guards. The global broker never places a credential in the diagnostic trace. No additional polling, token files, network requests, or authorization grants were introduced by this correction.

The initial transport regression run had **9 failures** before production changes. The corrected transport passed **114 tests** under `node --test tests_candidate/*.test.js`. After the two subsequent ordering regressions were added and the per-child guard finalized, the final directly executed focused command passed **36/36**:

```text
node --test tests_candidate/global.test.js tests_candidate/player-auth-binding.test.js tests_candidate/player-chat-race.test.js tests_candidate/timers.test.js
```

Final transport handoff digests: `candidate-plugin/global.js` = `7ffb99c5e0698be64c1e2b0f1a61b567ddfcfede281031180d6909cda84544e4`; `candidate-plugin/src/player.js` = `aee5f6bf2748a94463cd5204f00aaf4c92c69d3ffd442c24ab160d4c8bddadfa`. The native production transport retest remains pending at this handoff. The successful QA primitive probe does not establish a real OAuth grant or authenticated chat receipt.

## Final package/security review and native gate update

The later native evidence advances the authorization transport gate. This reviewer independently read the current `evidence/native/focus-final-native-auth.json`, SHA-256 `b2e1e8f048892899941d3bf66bfc35fbeb69a924abf6f77d991d68c9f23ca532`. All **five checks pass**: native state delivery, actionable invalid-client error, unaffected video, an editable Client ID after failure, and cleared chat after Off. The initial controller authorization phase is `needs-client`; the rejected-client phase is `error`. This establishes the production transport and those setup/error states through Focus QA. It does not establish a real OAuth grant or authenticated IRC receipt, and final archive installation remains a separate native gate.

The dummy Keychain probe did **not** establish persistence. `evidence/native/keychain-native-probe.json`, SHA-256 `7c941932d3f9b0ab0a37e69d74b14ebec306a9bfaa189832ff3893107760a6f1`, records `wrote:false`, `matched:false`, `cleared:false`, and cleanup exit code `44` (no item reported). No real grant was used. The code has no plaintext credential fallback: a failed Keychain write leaves authorization in memory for that session and supplies an explicit storage-failure message. Root's subsequent player change preserves that message when a live-status update has no error of its own.

### Normal package contents and boundaries

Fresh temporary normal builds were inspected directly. Each contains **25 root-relative entries**, its separate candidate identifier, its distinct **Streams Unified / Streams Focus** sidebar name, and `qa:false`. The four embedded helpers are exactly `media`, `replay`, `acquire`, and `runner`, with source bytes and SHA-256 digests matching the checked source files. There is no QA harness, native evidence, test directory, bytecode cache, or source symlink in these packages. Dormant `config.qa` branches remain in shared source; normal configuration disables their autostart, traces, input hooks, and 400 ms harness polling. Global loading is inert, and unrelated players return before candidate hooks or timers are installed. The one deferred callback-binding timer is limited to a deliberately managed player; live authorization, socket creation, and replay acquisition remain explicit actions.

The authorization code does not copy access or refresh tokens into player snapshots, QA auth traces, settings files, or package manifests. The public Client ID may be saved separately. Validated access credentials pass only to the opted-in child's live client; the deferred broker checks managed identity, per-child revision, current audience, and current token. The sidebar and overlay render title/chat strings through text nodes. Their network policies allow the fixed Twitch WebSocket endpoint and no overlay networking respectively. Helper process arguments contain canonical public source URLs, not OAuth credentials; extractor stderr is not exposed verbatim, and media transport URLs are excluded from the player snapshot. The broader IINA filesystem/program permission is explicitly disclosed in the install guide.

A read-only scan of **56 native JSON evidence files** found no nonempty unredacted values under the inspected credential-field names and no URL values bearing the inspected signed/token query parameters. Only paths/counts and safe boolean observations were returned by that scan; values were not printed. This is a targeted evidence check, not a claim that arbitrary future logs will be secret-free.

### Builder output safety correction

The final review reproduced one concrete issue in a temporary directory: a symlink at an archive filename caused the old builder to overwrite its foreign target. The same direct-write issue applied to the manifest, and a conflict in a later candidate was checked after the first candidate could already be replaced. No remote or source file was used as the reproduction target.

Root authorized a narrow builder correction. All selected candidate folders, archive files, and the manifest are now preflighted before replacement. Existing output files must be regular, owned by the invoking account, bounded, and recognized by archive identity/configuration or the build-manifest schema. Linked/nonregular files, foreign identities, and malformed manifests are refused. Archives and manifests are written to private temporary files, validated, and published with atomic replacement only after the previous output identity is rechecked. A failed archive writer preserves the previous archive bytes; publication never opens a foreign link target for writing. The manifest is published after both packages. This is per-file atomic publication, not a transaction spanning every build output after arbitrary I/O failures; a failed build must not be treated as a release.

Five safety assertions were observed failing before the fix. The final command passes **20/20 tests**, including normal and QA rebuilds, deterministic archives, directory/foreign-file/FIFO/link refusals, prior-output preservation, all-candidate preflight, and the guarded installer tests:

```text
python3 -B -m unittest tests_candidate.test_build tests_candidate.test_install
```

The new archive writer was also compared directly with the exact previous writer on identical current source: both Unified and Focus archives were byte-for-byte equal. The builder change therefore preserves the archive format and deterministic bytes. Builder SHA-256: `f93e3219ec054b767d1e1e65781e5b38bc2d4dde62d7bdd9b537042b54a0646b`; focused build test SHA-256: `6803d449e0030df3bad96517421fd6c0f59faedd1d9c370b4a4379c4716f767e`.

The guarded development-link manager remains unchanged and excludes stable, original development, preview, and QA identities. It never extracts archives, enables plugins, changes preferences, or launches/quits IINA. `docs/INSTALL-AND-ROLLBACK.md` correctly distinguishes that utility from native `.iinaplgz` installation: opening an archive invokes permission review and automatic candidate enable; candidate-only native Uninstall removes the installed folder while leaving data/preferences/Keychain state. No remaining concrete package/security blocker was found in this review after the builder fix. Root still owns the final archive hash, actual native installation and rollback observations, and final preservation ledger.
