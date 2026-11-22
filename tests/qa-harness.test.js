'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {createIina} = require('./support/iina-shim.js');

test('QA request files forward open, report unknown commands, and return redacted state', async t => {
  const shim = createIina({identifier: 'local.iina.streams.dev', mpv: {'time-pos': 42}});
  const harness = {exports: {}};
  shim.runScript(path.join(__dirname, '../qa/qa-harness.js'), {globals: {module: harness}});

  // Synthetic canaries only. Keep their values and the raw response out of assertion output.
  const canary = 'synthetic-qa-credential'.repeat(2);
  const snapshot = {
    phase: 'playing',
    source: {kind: 'twitch-live', provider: 'twitch', id: 'fixture'},
    chat: {mode: 'live', state: 'ready'},
    messages: [],
    auth: {
      phase: 'ready',
      access_token: canary,
      refreshToken: '',
      userCode: 'QA-FIXTURE',
      detail: {header: 'Bearer ' + canary},
    },
  };
  const controller = {snapshot: () => snapshot};
  t.after(() => shim.emit('iina.window-will-close'));
  harness.exports.run(shim.iina, controller, {variant: 'unified'}, {trace() {}});

  async function request(id, command, data = {}) {
    shim.file.seed('@data/qa-request.json', JSON.stringify({id, command, data}));
    await Promise.all(shim.timers.pending().map(timer => shim.timers.fire(timer)));
    const raw = shim.file.get('@data/qa-response.json');
    assert.ok(raw, 'The harness must write a response file');
    const response = JSON.parse(raw);
    assert.ok(response.id === id, 'The response must acknowledge the current request');
    return response;
  }

  const url = 'https://www.twitch.tv/fixture';
  const opened = await request('open-1', 'open', {url});
  assert.deepEqual(shim.global.messages('qa-open'), [{name: 'qa-open', data: {url}}]);
  assert.ok(opened.result === true, 'The open request must succeed');

  const unknown = await request('unknown-1', 'not-a-qa-command');
  assert.ok(/unknown/i.test(unknown.result?.error ?? ''), 'Unknown commands must get an error response');

  const response = await request('state-1', 'state');
  const state = response.state;
  const secretField = /"(?:access[_-]?token|refresh[_-]?token|token|(?:device|user)[_-]?code|keychain)"\s*:/i;
  const serialized = JSON.stringify(state ?? {});
  const problems = [];
  if (response.result?.error) problems.push('state is rejected as an error');
  if (state?.controller?.phase !== 'playing') problems.push('player phase is missing');
  if (state?.controller?.chat?.mode !== 'live') problems.push('chat mode is missing');
  if (state?.native?.position !== 42) problems.push('native position is missing');
  if (secretField.test(serialized)) problems.push('state contains credential fields');
  if (serialized.includes(canary) || serialized.includes('QA-FIXTURE')) {
    problems.push('state contains credential values');
  }
  assert.deepEqual(problems, []);
});
