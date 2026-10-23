const test = require('node:test');
const assert = require('node:assert/strict');

const {
  derivePaymentHealthState,
  buildPaymentHealthDetail,
  PAYMENT_HEALTH_STATE,
} = require('../../frontend/src/lib/paymentHealthStatus.js');

test('derivePaymentHealthState reports recovering while a recovery run is in flight', () => {
  const result = derivePaymentHealthState({
    paymentRunning: true,
    paymentHealth: null,
    paymentHealthError: '',
  });

  assert.equal(result, PAYMENT_HEALTH_STATE.RECOVERING);
});

test('derivePaymentHealthState reports healthy when the service answers healthy', () => {
  const result = derivePaymentHealthState({
    paymentHealth: { success: true, service: 'payment-service', status: 'healthy' },
    paymentHealthError: '',
    paymentRunning: false,
  });

  assert.equal(result, PAYMENT_HEALTH_STATE.HEALTHY);
});

test('derivePaymentHealthState reports unavailable when the health check fails', () => {
  const result = derivePaymentHealthState({
    paymentHealth: null,
    paymentHealthError: 'Payment service is unavailable.',
    paymentRunning: false,
  });

  assert.equal(result, PAYMENT_HEALTH_STATE.UNAVAILABLE);
});

test('derivePaymentHealthState reports checking before the first check completes', () => {
  const result = derivePaymentHealthState({
    paymentHealth: null,
    paymentHealthError: '',
    paymentRunning: false,
  });

  assert.equal(result, PAYMENT_HEALTH_STATE.CHECKING);
});

test('derivePaymentHealthState reports unavailable for a non-healthy status without error', () => {
  const result = derivePaymentHealthState({
    paymentHealth: { success: false, status: 'degraded' },
    paymentHealthError: '',
    paymentRunning: false,
  });

  assert.equal(result, PAYMENT_HEALTH_STATE.UNAVAILABLE);
});

test('buildPaymentHealthDetail reports last successful check and latest failure', () => {
  const detail = buildPaymentHealthDetail({
    paymentHealthError: null,
    paymentLastSuccessfulCheck: '10:42:11',
    paymentLastFailure: null,
    paymentRecoveryAttempts: null,
    paymentRecoveryVerifiedAt: null,
  });

  assert.ok(detail.includes('Last successful check: 10:42:11.'));
  assert.ok(detail.includes('Recovery attempts: Not tracked by telemetry.'));
  assert.ok(detail.includes('Latest verified recovery: Not tracked by telemetry.'));
});

test('buildPaymentHealthDetail reports a failure when the last check failed', () => {
  const detail = buildPaymentHealthDetail({
    paymentHealthError: 'Payment service is unavailable.',
    paymentLastSuccessfulCheck: null,
    paymentLastFailure: 'Payment service is unavailable.',
    paymentRecoveryAttempts: null,
    paymentRecoveryVerifiedAt: null,
  });

  assert.ok(detail.includes('Last check failed: Payment service is unavailable.'));
});

test('buildPaymentHealthDetail reports observed recovery attempts and verified time', () => {
  const detail = buildPaymentHealthDetail({
    paymentHealthError: null,
    paymentLastSuccessfulCheck: '10:45:00',
    paymentLastFailure: null,
    paymentRecoveryAttempts: 2,
    paymentRecoveryVerifiedAt: '2026-10-22T10:45:00.000Z',
  });

  assert.ok(detail.includes('Recovery attempts: 2.'));
  assert.ok(detail.includes('Latest verified recovery: 2026-10-22T10:45:00.000Z.'));
});
