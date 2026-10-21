const test = require('node:test');
const assert = require('node:assert/strict');

const { recoverBackend } = require('../../recovery-monitor.js');

test('recoverBackend restarts the backend when it is not running', async () => {
  const calls = [];

  const result = await recoverBackend({
    execFn: (...args) => {
      calls.push(args);
      return 'exited';
    },
    healthProbe: async () => ({
      ok: true,
      payload: { success: true, status: 'healthy', database: 'connected' },
    }),
  });

  assert.equal(result.recovered, true);
  assert.ok(
    calls.some(
      ([command, args]) =>
        command === 'docker' && args[0] === 'start' && args[1] === 'shcom-backend'
    )
  );
});
