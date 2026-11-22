# UI text pass (#9): inventory and decisions — 2026-11-22

**Rule (user, 2026-11-22):** less text, judged case by case. Each string gets one decision:
- **remove**: it says nothing the screen doesn't already show;
- **signifier**: a non-text cue carries it (spinner, icon, state, placement);
- **on demand**: a tooltip, info affordance or popover, for people who want detail;
- **keep**: a name, value, action label, or error that needs words.

The source is a scripted extraction of `ui/sidebar.html`, `ui/sidebar.js`, `ui/overlay.html` and `ui/overlay.js` at `beta` `a845e16`. These decisions are proposals until the user has seen them in IINA.

| String | Where | Decision | Replacement |
|---|---|---|---|
| Chat will appear here. | overlay | **signifier** | Loading shimmer or spinner in the message area while chat loads; nothing once loaded |
| Indexing chat archive… / Loading archived chat… | sidebar status | **signifier** | The same message-area loading indicator; detail in a tooltip |
| Connecting to Twitch chat… / Signing into chat… / Joining channel… / Signing in… | sidebar status | **signifier** | One connection state on the chat switch: in progress or connected, with the step in a tooltip |
| Reconnecting… | sidebar status | **signifier** | The same in-progress state. Tooltip: "Reconnecting" |
| Waiting for Twitch… | sidebar status | **signifier** | The code panel with an in-progress mark is enough |
| Drag chat on the video to move or snap, drag corner to resize, and scroll to read history. | sidebar settings | **remove** | Affordances on the overlay itself: grab cursor and resize corner on hover (#18/#1 improve these) |
| Chat is displayed over the video. | sidebar | **remove** | The Sidebar / Over video choice already shows the state |
| YouTube live chat is unavailable; VOD replay loads automatically after streams end. | sidebar status | **on demand** | Disabled chat switch with this as its tooltip |
| Hide inspector | sidebar | **signifier** | Merge with the existing hide (×) control; check for duplication |
| Latest messages ↓ | sidebar | **signifier** | A compact ↓ jump button. Accessible name: "Latest messages" |
| Seconds added to video time to find the original chat | Chat offset tooltip | **keep (on demand)** | Already a tooltip |
| Setup steps: Open Twitch Developer Console, the three steps, Client ID, Continue | auth setup sheet | **keep** | The user asked for guidance here; it shows only when no Client ID exists |
| Quality, Chat, Text size, Spacing, Timestamps, Glass opacity, Snap corner, Display, Playback | labels | **keep** | Names |
| Sign in with Twitch, Sign out, Try again, Use a different Client ID, Copy code & open Twitch, Import archive…, Fetch replay, Resume replay, Reset appearance & position, First message | buttons | **keep** | Actions. Grouping and placement belong to #20 |

**Not in scope here:** layout, hierarchy, and which controls belong in the panel at all (#20).
