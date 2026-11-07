# Product and interface review — M2 candidate

The current UX uses one global **Open Stream…** command (native IINA input prompt), creates normal IINA player, then offers contextual **Show Streams Controls** in that player. The quality sidebar loads local assets only on request; no timers, polling, chat connection, avatars, or persistent helper by default. The dynamic quality list shows only formats returned by Streamlink. An Auto choice prefers 720p, but may fall back to best if none of the listed qualities exists. Quality switches can interrupt playback, and the current IINA API may close/reopen the network player window.

**Implemented in code:** compact layout, system font, light/dark palettes, reduced-motion style, keyboard-focus rings, labeled quality selector, ARIA live status and error feedback, Refresh and Hide controls. No heavyweight JS frontend framework.

**Not verified in real IINA:** the menu's visual placement on IINA 1.4.4, sidebar load, chosen quality reflected in UI, per-player persistence through window recreation, VoiceOver speech, color appearance consistency, real keyboard behavior, PiP survival, multiple simultaneous streams, readability at narrow sidebar width, overhead of WebKit. The tests include only a mocked IINA API, not a rendered-webview test.

**User feedback at 13:05 Nov 7:** IINA unexpectedly closes while trying to test. Do not treat this as resolved. Debug auto-stop removed; real crash reports show PlayerCore.startMPV SIGTRAP before/after dev plugin. Priority: restore a reliable first stream experience before visual polish.

**M3 proposal:** Twitch read-only chat opt-in, entirely disconnected when hidden/off, credential request only after user chooses to connect, bounded DOM/message queue, Keychain; no send/chat permissions, no full Twitch website. Test CPU, memory and actual off state before UX acceptance.
