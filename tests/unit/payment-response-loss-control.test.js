const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MAX_DURATION_MS,
  getExperiment,
  startExperiment,
  stopExperiment,
} = require("../../payment-service/src/responseLossExperiment");
const { startPaymentReconciliation } = require("../../backend/src/services/paymentReconciliationService");

test("response loss is bounded, observable, and returns to normal on stop/expiry", () => {
  const started = startExperiment({ durationMs: MAX_DURATION_MS * 5 });
  assert.equal(started.active, true);
  assert.equal(started.durationMs, MAX_DURATION_MS);
  assert.equal(getExperiment().active, true);
  assert.equal(getExperiment(started.expiresAt).active, false);

  const restarted = startExperiment({ durationMs: 5000 });
  assert.equal(restarted.active, true);
  const stopped = stopExperiment("stopped");
  assert.equal(stopped.active, false);
  assert.equal(getExperiment().active, false);
});

test("scheduled reconciliation retries without overlapping executions", async () => {
  let tick;
  let calls = 0;
  let finish;
  const timer = { unrefCalled: false, unref() { this.unrefCalled = true; } };
  startPaymentReconciliation({
    intervalMs: 1234,
    setIntervalFn: (callback, interval) => {
      tick = callback;
      assert.equal(interval, 1234);
      return timer;
    },
    reconcile: () => {
      calls += 1;
      return new Promise((resolve) => { finish = resolve; });
    },
  });
  assert.equal(timer.unrefCalled, true);
  const first = tick();
  await tick();
  assert.equal(calls, 1);
  finish();
  await first;
  const next = tick();
  assert.equal(calls, 2);
  finish();
  await next;
});
