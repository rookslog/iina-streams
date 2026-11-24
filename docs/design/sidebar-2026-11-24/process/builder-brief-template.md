You are building one interactive design mock for IINA Streams, a plugin for the IINA media player on macOS. Your folder is /Users/rookslog/Development/iina-streams/docs/design/sidebar-2026-11-24/r. You can write only there and in /private/tmp.

Read, in this order:
1. /Users/rookslog/Development/iina-streams/docs/design/sidebar-2026-11-24/BRIEF.md: the sections "What it is for, and for whom", "Fixed for every direction", and "Direction R". Build exactly Direction R. The other directions are for other builders; don't borrow from them.
2. /Users/rookslog/Development/iina-streams/docs/design/sidebar-2026-11-24/shared/: frame.js, frame.css, base.css, util.js, viewer.js, index-template.html, and the first 60 lines of snapshot.js. These are shared and read-only. Use them; don't copy or edit them.
3. /Users/rookslog/Development/iina-streams/.agents/skills/streams-interaction-design/SKILL.md, especially "Text on screen".

Make: index.html (from the template, data-label="Direction R"), panel.html, panel.css, panel.js and STRINGS.md in your folder (plus overlay.html if your direction has one). panel.html loads ../shared/base.css, ../shared/snapshot.js, ../shared/viewer.js, ../shared/util.js, then panel.css and panel.js.

Quality bar: this must look and feel like a real, finished macOS sidebar at 360 and 300 px wide: precise alignment, consistent spacing on a 4 px grid, real hover, keyboard selection and focus, short transitions (150-220 ms) that respect reduced motion. It is judged in use, by people opening it in Safari. Craft matters as much as structure. Every visible string must be a name, value, action or error, and STRINGS.md lists each with its class.

Constraints: no network (images only from ../shared/img via the snapshot paths, prefixed with ../shared/), no libraries, no web fonts. Plain readable JavaScript with short functions. The hash states (#signed-out, #new, #many) must work and react to hashchange. Listen for the frame's {type:"playing"} message and update what is shown as playing.

Check before finishing: node --check on each .js file; grep your folder for "http" (none allowed outside comments); every person and broadcast the brief names is reachable by keyboard.

Do not run git. Write a report to /private/tmp/claude-501/-Users-rookslog-Development-iina-streams/4aa00c72-182b-4323-9888-04796f3ca308/scratchpad/hydrogen-dir-r-report.md: the files you made, the choices the brief did not dictate, and anything you could not do.
