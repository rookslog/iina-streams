'use strict';

// v0.5.5 class L (docs/design/V055-CLASS-REPAIR-2026-11-22.md, "Enforcement"): every timer, listener and
// await in the controller (run() in src/player.js) goes through an activation-aware helper (src/authority.js).
// This scan fails on a raw form anywhere in run() outside the helpers' own definitions, so a new continuation
// cannot forget its activation check. It checks shape only; the behaviour is the explorer's
// (tests/class-l-explorer.test.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {join} = require('node:path');

const PLAYER = join(__dirname, '../src/player.js');
const PLAYBACK = join(__dirname, '../src/playback.js');

// The helpers that wrap the host's raw registration calls. Their bodies may use raw forms.
const HELPER_DEFINITIONS = [
  'onWindow', 'onActive', 'onSidebar', 'onSidebarWindow', 'onOverlay', 'registerAppListeners', 'teardown'
];

// Blanks comments and string, template and regex literals, keeping offsets and line breaks.
function codeOnly(source) {
  let out = '';
  let i = 0;
  const blank = text => text.replace(/[^\n]/g, ' ');
  while (i < source.length) {
    const c = source[i];
    if (source.startsWith('//', i)) {
      const end = source.indexOf('\n', i);
      const stop = end < 0 ? source.length : end;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (source.startsWith('/*', i)) {
      const stop = source.indexOf('*/', i) + 2;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (c === '\'' || c === '"' || c === '`') {
      let j = i + 1;
      while (j < source.length && source[j] !== c) j += source[j] === '\\' ? 2 : 1;
      out += c + blank(source.slice(i + 1, j)) + c;
      i = j + 1;
    } else if (c === '/' && /[(,=:[!&|?{};]\s*$/.test(out.slice(-40))) {
      let j = i + 1;
      let inClass = false;
      while (j < source.length) {
        if (source[j] === '\\') j += 2;
        else if (source[j] === '[') inClass = true, j++;
        else if (source[j] === ']') inClass = false, j++;
        else if (source[j] === '/' && !inClass) break;
        else j++;
      }
      out += '/' + blank(source.slice(i + 1, j)) + '/';
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

// The index just past the brace that closes the one opening at `open`.
function closingBrace(code, open) {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}' && --depth === 0) return i + 1;
  }
  throw new Error('unbalanced braces');
}

// run()'s body, with the helpers' definitions blanked.
function runBody(code, helpers = HELPER_DEFINITIONS) {
  const start = code.indexOf('function run(');
  assert.ok(start >= 0, 'precondition: run() is found');
  let body = code.slice(start, closingBrace(code, code.indexOf('{', start)));
  for (const name of helpers) {
    const at = body.search(new RegExp('\\bfunction ' + name + '\\('));
    assert.ok(at >= 0, 'precondition: the helper ' + name + ' is defined in run()');
    const end = closingBrace(body, body.indexOf('{', at));
    body = body.slice(0, at) + body.slice(at, end).replace(/[^\n]/g, ' ') + body.slice(end);
  }
  return body;
}

const ACTIVATION = '(?:act|a)';
const RAW_FORMS = [
  {name: 'a timer not created through the activation',
    pattern: new RegExp('(?:(?<![\\w.])|(?<!\\b' + ACTIVATION + ')\\.)(?:setTimeout|clearTimeout)\\(')},
  {name: 'a raw timer registry', pattern: /\b(?:timers|clockTimers|createTimers)\b/},
  {name: 'a raw host listener', pattern: /\bevent\.(?:on|off)\(/},
  {name: 'a raw page or global listener', pattern: /\.onMessage\(/},
  {name: 'a raw promise continuation', pattern: /\.(?:then|catch|finally)\(/},
  {name: 'a raw promise', pattern: /\bnew Promise\b/},
  {name: 'an await not through the activation', pattern: new RegExp('\\bawait\\s+(?!' + ACTIVATION + '\\.wait\\()')},
  {name: 'a menu action without a guard',
    pattern: /\bmenu\.item\([^,()]*,(?!\s*(?:whileActive\(|whileWindow\(|null\b|\(\)=>\{\}))/}
];

// [{name, line, text}] for every raw form in `code`'s run().
function rawForms(source, helpers) {
  const code = codeOnly(source);
  const body = runBody(code, helpers);
  const offset = code.indexOf('function run(');
  const lines = source.split('\n');
  const found = [];
  for (const form of RAW_FORMS) {
    const global = new RegExp(form.pattern.source, 'g');
    for (const match of body.matchAll(global)) {
      const line = code.slice(0, offset + match.index).split('\n').length;
      found.push({name: form.name, line, text: lines[line - 1].trim()});
    }
  }
  return found;
}

test('class L scan: run() in src/player.js has no raw timer, listener, promise or await form', () => {
  const found = rawForms(fs.readFileSync(PLAYER, 'utf8'));
  assert.deepEqual(found, [], found.map(f => `src/player.js:${f.line} ${f.name}: ${f.text}`).join('\n'));
});

test('class L scan: the scan sees each raw form (positive control)', () => {
  const sample = [
    'function run(){',
    ' function onWindow(name,fn){event.on(name,fn);}',
    ' function onActive(name,fn){event.on(name,fn);}',
    ' function onSidebar(name,fn){sidebar.onMessage(name,fn);}',
    ' function onSidebarWindow(name,fn){sidebar.onMessage(name,fn);}',
    ' function onOverlay(name,fn){overlay.onMessage(name,fn);}',
    ' function registerAppListeners(){app.onMessage("x",f);}',
    ' function teardown(){event.off("x",1);}',
    ' timers.setTimeout(f,0);',
    ' setTimeout(f,0);',
    ' act.setTimeout(f,0);',
    ' event.on("mpv.seek",f);',
    ' app.onMessage("auth-ready",f);',
    ' p.then(f);',
    ' new Promise(r=>r());',
    ' async function x(){const y=await services.resolve(s); const z=await act.wait(p);}',
    ' menu.item("Go Live",()=>goLive());',
    ' menu.item("Show",whileWindow(showSidebar));',
    ' // setTimeout(f,0) in a comment and "setTimeout(" in a string are not code.',
    ' const s="setTimeout(";',
    '}'
  ].join('\n');
  const names = rawForms(sample).map(f => f.name + ' @' + f.line);
  assert.deepEqual(names.sort(), [
    'a menu action without a guard @17',
    'a raw host listener @12',
    'a raw page or global listener @13',
    'a raw promise @15',
    'a raw promise continuation @14',
    'a raw timer registry @9',
    'a timer not created through the activation @10',
    'a timer not created through the activation @9',
    'an await not through the activation @16'
  ].sort());
});

// Guards removed state from coming back (the activation replaces it; see the design's L2).
test('class L scan: the flags the activation replaced stay removed', () => {
  const names = ['retiring', 'sourceActive', 'authBindSkipped', 'rearmSkippedAuthBinding', 'authBindTimer',
    'authBound', 'fenced', 'fencedOut', 'regainAuthority', 'loseAuthority'];
  const removed = new RegExp('\\b(?:' + names.join('|') + ')\\b', 'g');
  for (const file of [PLAYER, PLAYBACK]) {
    const code = codeOnly(fs.readFileSync(file, 'utf8'));
    const hits = [...code.matchAll(removed)].map(match => match[0]);
    assert.deepEqual(hits, [], file + ' still has ' + hits.join(', '));
  }
});

// Class A's interface (fix/class-a, ffb9e76): the Auto property tests need these four sampling sites in player.js.
test('class L scan: the Auto sampling call sites survive the restructure', () => {
  const code = codeOnly(fs.readFileSync(PLAYER, 'utf8'));
  const body = name => {
    const at = code.search(new RegExp('\\bfunction ' + name + '\\('));
    assert.ok(at >= 0, name + ' is defined');
    return code.slice(at, closingBrace(code, code.indexOf('{', at)));
  };
  assert.match(body('onPauseChanged'), /\brevealLive\(\)/, '1. a sample on every pause change');
  assert.match(body('onSeek'), /\brevealLive\(\)/, '2. a sample on every seek');
  assert.match(body('revealLive'), /\bsampleCutoff\(/, 'revealLive samples the cutoff');
  assert.match(body('stopLiveClock'), /chatTiming\.forgetMapping\(\)[\s\S]*resyncCutoff\(\)/,
    '3. forgetMapping and resyncCutoff on every clock stop');
  assert.match(body('loadForActivation'), /\bstopLiveClock\(\)/, '3. ... at on_load');
  assert.match(body('startLiveClock'), /\bstopLiveClock\(\)/, '3. ... and at file-loaded');
  assert.match(body('sampleCutoff'), /estimateId:estimator\.updates\(\)/, '4. a distinct estimateId on every call');
  assert.doesNotMatch(body('newActivation'), /createEstimator\(/, '4. one estimator per window, never restarted');
});
