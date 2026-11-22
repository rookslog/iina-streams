'use strict';
// #9: state is shown, not narrated. Guards against removed narration creeping back.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ui = name => fs.readFileSync(path.join(__dirname, '..', 'ui', name), 'utf8');

test('removed narration stays removed', () => {
  const html = ui('sidebar.html'), side = ui('sidebar.js'), over = ui('overlay.js');
  for (const gone of ['Chat will appear here', 'Drag chat on the video', 'Chat is displayed over the video', 'Read-only chat messages', 'Latest messages ↓', 'Hide inspector'])
    assert.ok(![html, side, over].some(src => src.includes(gone)), gone);
});

test('removed sidebar markup stays removed (D1c)', () => {
  const html = ui('sidebar.html'), side = ui('sidebar.js'), css = ui('sidebar.css');
  for (const gone of ['chat-status', 'hide-for-overlay', 'overlay-note', 'aria-label="Show chat"'])
    assert.ok(![html, side, css].some(src => src.includes(gone)), gone);
});

test('connection and loading steps are tooltips on a busy indicator, not status text', () => {
  const side = ui('sidebar.js');
  assert.match(ui('sidebar.html'), /<span id="chat-busy" class="busy-indicator" role="status" hidden><\/span>/);
  assert.match(side, /\$\('chat-busy'\)\.hidden=!busyStep/);
  assert.match(side, /\$\('chat-busy'\)\.title=busyStep/);
  assert.doesNotMatch(side, /status='(Connecting to Twitch chat|Joining channel|Reconnecting|Signing in|Waiting for Twitch|Loading archived chat|Indexing chat archive)/);
});

test('overlay shows a loading indicator only while chat is connecting or loading', () => {
  const over = ui('overlay.js');
  assert.match(over, /spinner\.className='loading'/);
  assert.match(over, /\['authorizing','waiting','connecting','authenticating','joining','reconnecting','fetching','importing'\]\.includes\(s\.chat\.state\)/);
  assert.match(over, /'\|st='\+\(s\.chat&&s\.chat\.state\)/, 'state changes must re-render the indicator');
});

test('the jump-to-latest control keeps an accessible name without visible text', () => {
  assert.match(ui('sidebar.html'), /<button id="follow"[^>]*aria-label="Latest messages"[^>]*>↓<\/button>/);
});
