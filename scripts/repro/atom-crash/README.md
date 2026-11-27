# Crash harness for #90 (JavaScriptCore atom-string assertion)

Tries to trigger IINA 1.5.1's crash at `AtomStringImpl.cpp:462` ("an atom in the string table of an other thread"), or its sibling at `Heap.cpp:2407`, by pushing one IINA plugin-bridge path hard. Each run uses one arm.

| Arm | What it pushes | Needs a window |
|---|---|---|
| `control` | string work on main-thread timers only | no |
| `page` | page → plugin messages and replies (Open Stream's path) | standalone window |
| `players` | global ↔ player messages (two engines, nested on the main thread) | player window |
| `http` | `iina.http` to localhost; the work after `await` runs where IINA settles the promise, which is off the main thread | no |
| `http-cross` | `http`, plus posting each response to the player and the page from that continuation | both |
| `hook` | the `on_load` hook on repeated loads of a silent file | player window |
| `exec` | `iina.utils.exec` with no output hooks | no |
| `all` | every path at once, roughly what Streams does | both |

**Run:** with IINA closed, `python3 -I scripts/repro/atom-crash/run.py --arm page --minutes 15`. The runner:
1. refuses to start if IINA is running;
2. records every `PluginEnabled.*` switch, turns off the Streams copies, and installs and enables only this harness;
3. launches IINA and watches for a new crash report;
4. quits IINA, restores the switches exactly, and removes the harness.

The result goes to `results/<time>-<arm>.json`.

**Evidence bar (set before any run):** only the same assertion counts as reproduced: line 462 in `~StringImpl`/`AtomStringImpl::remove`, or line 2407 in `Heap::requestCollection`. Any other crash is a separate finding. A run without a crash clears nothing. Each arm runs the same fixed length, 15 min unless a result file says otherwise. The early snapshot (30 s) shows whether requests to localhost succeed, since failed requests carry few strings.
