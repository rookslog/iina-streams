# A separate IINA for agent testing (scoping, 2026-11-22)

**Problem.** Agents test in the operator's own IINA. Plugin switches are global, the agent needs IINA handed over, and a test crash kills the operator's stream. This needs fixing before the 0.6.0 launch brings outside users.

**Recommendation: a second macOS user account on this Mac, driven over ssh.** It has its own IINA process, preferences, plugin switches, data folder and login Keychain, with native GPU and OpenGL. It takes a few hundred MB, sets up in minutes, and needs no licence. (Research: the test-machine-scope agent, 18:02–18:05. Sources and labels are in the session record.)

**Why not a VM (Tart or UTM).**
- **Disk:** a macOS image is a 25 GB download, and the host had 13.7 GB free (94% used).
- **Video:** IINA 1.5.1 renders through CGL OpenGL (`ViewLayer.swift`). Sources say macOS guests on Apple Silicon expose only Metal; that is unverified for macOS 27.
- **A known bug:** video does not render in macOS 26 guests (MacStadium known issues).

**Main risk.** Can the test user's IINA start and render in a GUI session without the operator's screen: a background fast-user-switching session, or a separate Screen Sharing session? The sources are 2011–2023.

**Cheap test** (about 15 min; it needs the operator for sudo and a one-time login):
1. Create the user and enable Remote Login.
2. Log the test user in once, via Screen Sharing ("log in as another user").
3. Over ssh, run `open -a /Applications/IINA.app` and `iina-cli` on a local mp4.
4. Confirm the process runs as the test user and the operator's IINA is untouched.

**Setup outline (after the test passes):**
1. The operator creates a standard account and enables Remote Login for it.
2. A one-time GUI login creates its home and Keychain.
3. Key-only ssh.
4. `dev:deploy --qa` as that user.
5. Make `qa/control.py`'s data path configurable: it hard-codes `com.colliderli.iina` under `Path.home()`.
6. The operator does the Twitch device sign-in once.
7. A smoke test while the operator watches their own IINA.
8. Record the user, the ssh command and the one-agent rule in `docs/RELEASE.md`.

**Alternative, if the user account fails:** a copy of IINA.app with a different bundle ID. It gives separate state and process, but still shares the operator's screen. `scripts/dev.py` and `qa/control.py` would need the ID made configurable. Re-signing and library validation are unchecked.
