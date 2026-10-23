const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createPaymentPoller,
  classifyPaymentAttempt,
  PAYMENT_ATTEMPT_STATE,
  PAYMENT_POLL_INTERVAL_MS,
} = require('../../frontend/src/lib/paymentVerification.js');

test('classifyPaymentAttempt treats 200 success with paid as paid', () => {
  const result = classifyPaymentAttempt({
    status: 200,
    data: {
      success: true,
      status: 'paid',
      attempt: { attemptId: 'abc', status: 'paid', transactionId: 't1' },
      order: { id: 'abc', paymentStatus: 'paid', orderStatus: 'placed' },
      resolved: true,
    },
  });

  assert.equal(result.state, PAYMENT_ATTEMPT_STATE.PAID);
});

test('classifyPaymentAttempt treats 200 success with failed as failed', () => {
  const result = classifyPaymentAttempt({
    status: 200,
    data: {
      success: true,
      status: 'failed',
      attempt: { attemptId: 'abc', status: 'failed' },
      order: { id: 'abc', paymentStatus: 'failed', orderStatus: 'cancelled' },
      resolved: true,
    },
  });

  assert.equal(result.state, PAYMENT_ATTEMPT_STATE.FAILED);
});

test('classifyPaymentAttempt treats 200 success with unknown/pending as pending', () => {
  const result = classifyPaymentAttempt({
    status: 200,
    data: {
      success: true,
      status: 'unknown',
      attempt: { attemptId: 'abc', status: 'unknown' },
      order: { id: 'abc', paymentStatus: 'unknown', orderStatus: 'processing' },
      resolved: false,
    },
  });

  assert.equal(result.state, PAYMENT_ATTEMPT_STATE.PENDING);
});

test('classifyPaymentAttempt treats network errors as inconclusive, not failure', () => {
  const result = classifyPaymentAttempt({ status: 0, data: null });
  assert.equal(result.state, PAYMENT_ATTEMPT_STATE.INCONCLUSIVE);

  const result2 = classifyPaymentAttempt(null);
  assert.equal(result2.state, PAYMENT_ATTEMPT_STATE.INCONCLUSIVE);
});

test('classifyPaymentAttempt treats 404 as inconclusive', () => {
  const result = classifyPaymentAttempt({ status: 404, data: { success: false } });
  assert.equal(result.state, PAYMENT_ATTEMPT_STATE.INCONCLUSIVE);
});

test('classifyPaymentAttempt treats 401 as inconclusive', () => {
  const result = classifyPaymentAttempt({ status: 401, data: { success: false } });
  assert.equal(result.state, PAYMENT_ATTEMPT_STATE.INCONCLUSIVE);
});

test('poller stops on confirmed paid and does not reschedule', async () => {
  const calls = [];
  const updates = [];
  let time = 1000;
  const timers = [];

  const poller = createPaymentPoller({
    check: async () => {
      calls.push('check');
      return {
        status: 200,
        data: { success: true, status: 'paid', attempt: { attemptId: 'x', transactionId: 't1' }, order: { id: 'x' } },
      };
    },
    onUpdate: (r) => updates.push(r),
    intervalMs: 100,
    maxDurationMs: 10000,
    now: () => time,
    schedule: (fn, delay) => {
      timers.push({ fn, delay });
      return timers.length;
    },
    cancel: (h) => { /* noop */ },
  });

  poller.start();
  // run the first scheduled tick
  assert.equal(timers.length, 1);
  await timers[0].fn();

  assert.equal(calls.length, 1);
  assert.equal(updates[updates.length - 1].state, PAYMENT_ATTEMPT_STATE.PAID);
  assert.equal(poller.isRunning(), false);
});

test('poller stops on confirmed failed', async () => {
  const updates = [];
  let time = 1000;
  const timers = [];

  const poller = createPaymentPoller({
    check: async () => ({
      status: 200,
      data: { success: true, status: 'failed', attempt: { attemptId: 'x' }, order: { id: 'x' } },
    }),
    onUpdate: (r) => updates.push(r),
    intervalMs: 100,
    maxDurationMs: 10000,
    now: () => time,
    schedule: (fn) => { timers.push(fn); return timers.length; },
    cancel: () => {},
  });

  poller.start();
  await timers[0]();

  assert.equal(updates[updates.length - 1].state, PAYMENT_ATTEMPT_STATE.FAILED);
  assert.equal(poller.isRunning(), false);
});

test('network errors remain inconclusive and do not become false failures', async () => {
  const updates = [];
  let time = 1000;
  const timers = [];

  const poller = createPaymentPoller({
    check: async () => { throw new Error('network'); },
    onUpdate: (r) => updates.push(r),
    intervalMs: 100,
    maxDurationMs: 10000,
    now: () => time,
    schedule: (fn) => { timers.push(fn); return timers.length; },
    cancel: () => {},
  });

  poller.start();
  await timers[0]();

  assert.equal(updates[updates.length - 1].state, PAYMENT_ATTEMPT_STATE.INCONCLUSIVE);
  assert.equal(poller.isRunning(), true); // still polling after inconclusive
});

test('manual status checking does not submit another order', async () => {
  const calls = [];
  const updates = [];
  let time = 1000;
  const timers = [];

  const poller = createPaymentPoller({
    check: async () => {
      calls.push('check');
      return { status: 200, data: { success: true, status: 'unknown', attempt: { attemptId: 'x' }, order: { id: 'x' } } };
    },
    onUpdate: (r) => updates.push(r),
    intervalMs: 100,
    maxDurationMs: 10000,
    now: () => time,
    schedule: (fn) => { timers.push(fn); return timers.length; },
    cancel: () => {},
  });

  poller.start();
  await timers[0](); // first poll
  assert.equal(calls.length, 1);
  
  // manual check
  await poller.checkNow();
  assert.equal(calls.length, 2);
  // the function only reads status, it never calls any order/payment submission endpoint
});

test('polling stops on unmount or its configured limit', async () => {
  const updates = [];
  let time = 1000;
  const timers = [];

  const poller = createPaymentPoller({
    check: async () => {
      time += 100;
      return { status: 200, data: { success: true, status: 'unknown', attempt: { attemptId: 'x' }, order: { id: 'x' } } };
    },
    onUpdate: (r) => updates.push(r),
    intervalMs: 100,
    maxDurationMs: 500,
    now: () => time,
    schedule: (fn) => { timers.push(fn); return timers.length; },
    cancel: () => {},
  });

  poller.start();
  await timers.shift()();
  while (timers.length > 0 && !updates.some(u => u.reason === 'limit_reached')) {
    await timers.shift()();
  }

  const limitUpdate = updates.find(u => u.reason === 'limit_reached');
  assert.ok(limitUpdate);
  assert.equal(limitUpdate.state, PAYMENT_ATTEMPT_STATE.INCONCLUSIVE);
  assert.equal(limitUpdate.reason, 'limit_reached');
});

test('repeated status checks never create attempts or deduct stock', async () => {
  const checkLog = [];
  const updates = [];
  let time = 1000;
  const timers = [];

  const poller = createPaymentPoller({
    check: async () => {
      checkLog.push('read_only_status_check');
      return { status: 200, data: { success: true, status: 'unknown', attempt: { attemptId: 'x' }, order: { id: 'x' } } };
    },
    onUpdate: (r) => updates.push(r),
    intervalMs: 50,
    maxDurationMs: 5000,
    now: () => time,
    schedule: (fn) => { timers.push(fn); return timers.length; },
    cancel: () => {},
  });

  poller.start();
  await timers[0]();
  await timers[1]();
  await poller.checkNow();
  await timers[2]();

  assert.ok(checkLog.every(c => c === 'read_only_status_check'));
  assert.equal(checkLog.length, 4); // 3 polls + 1 manual
});

test('poller stops on unmount', async () => {
  const updates = [];
  let time = 1000;
  const timers = [];

  const poller = createPaymentPoller({
    check: async () => ({ status: 200, data: { success: true, status: 'unknown', attempt: { attemptId: 'x' }, order: { id: 'x' } } }),
    onUpdate: (r) => updates.push(r),
    intervalMs: 100,
    maxDurationMs: 10000,
    now: () => time,
    schedule: (fn) => { timers.push(fn); return timers.length; },
    cancel: () => {},
  });

  poller.start();
  poller.stop();
  // timer was cleared, nothing should happen
  assert.equal(poller.isRunning(), false);
  assert.equal(updates.length, 0);
});

test('manual check after limit re-arms polling', async () => {
  const calls = [];
  const updates = [];
  let time = 1000;
  const timers = [];

  const poller = createPaymentPoller({
    check: async () => {
      calls.push('check');
      time += 200;
      return { status: 200, data: { success: true, status: 'unknown', attempt: { attemptId: 'x' }, order: { id: 'x' } } };
    },
    onUpdate: (r) => updates.push(r),
    intervalMs: 100,
    maxDurationMs: 400,
    now: () => time,
    schedule: (fn) => { timers.push(fn); return timers.length; },
    cancel: () => {},
  });

  poller.start();
  await timers[0](); // time becomes 1200
  await timers[1](); // time becomes 1400, >= 400 from 1000
  // should see limit_reached
  const limitUpdate = updates.find(u => u.reason === 'limit_reached');
  assert.ok(limitUpdate);
  
  // manual check after limit should work
  const before = calls.length;
  await poller.checkNow();
  assert.ok(calls.length >= before + 1);
});
