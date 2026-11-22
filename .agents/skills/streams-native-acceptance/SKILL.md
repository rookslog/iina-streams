---
name: streams-native-acceptance
description: Use to test or review changes inside native IINA 1.5.1, including overlays, sidebar, quality changes, auth UI, WebKit and memory.
---

# Native IINA acceptance and preservation

1. Obtain exclusive permission from the lead to operate native IINA; no other agent may issue GUI actions concurrently. Record source commit, plugin ID, installed or dev-link bytes, IINA version, macOS version, app PID, and affected player identity.
2. Capture an untouched baseline of windows and plugin enable states. Preserve every unrelated window, account state, browser tab, Keychain entry, app preference and stable plugin ID. Never use the known risky IINA Settings More-button AXPress route.
3. Perform the complete user gesture with actual mouse/key input; do not infer from unit tests or fake DOM events. For floating chat: start drag without entering a mode; move to multiple edges and OSC region; resize; send changing messages; resize window; toggle fullscreen; close/reopen controls; check click-through outside panel and reset/recovery.
4. For playback: change quality in the same player, check actual video dimensions and advancing frames, preserve pause/seek/speed where relevant. For live chat: show incoming messages after sidebar collapse, verify single connection; Off releases work. For replay: validate real archive identity and timeline under pause/seek/speed/offset; synthetic fixtures are labeled synthetic.
5. Capture timestamped screenshots, exact reproduction actions, test outputs, evidence provenance and fail states. For resources sample IINA + WebKit + helper processes, CPU, RSS, energy indicators, swap *rate*, frame drops and relevant confounders. Never publish token-bearing output.
6. Finish by checking owned windows/helpers closed and all unrelated identities retained. Report separately: native verified, source verified, not tested, blocked. A green unit suite never passes this gate by itself.

Avoid broad app restarts and system-setting changes. Stop rather than improvise when ownership or state is uncertain.
