const test = require('node:test');
const assert = require('node:assert/strict');

const {
  deriveReconciliationOutcome,
  RECONCILIATION_OUTCOME,
} = require('../../frontend/src/lib/reconciliationOutcome.js');

test('HTTP success alone is not treated as proof a payment was captured', () => {
  const result = deriveReconciliationOutcome({
    success: true,
    message: 'Examined 1 payment attempt(s).',
    examined: 1,
    resolvedPaid: 0,
    resolvedFailed: 0,
    unresolved: 1,
  });

  assert.equal(result.outcome, RECONCILIATION_OUTCOME.UNRESOLVED);
  assert.equal(result.unresolved, 1);
  assert.ok(/not conclusive|No conclusive transaction/.test(result.note));
});

test('a resolved paid attempt is reported as success with the transaction verified', () => {
  const result = deriveReconciliationOutcome({
    success: true,
    message: 'Examined 1 payment attempt(s).',
    examined: 1,
    resolvedPaid: 1,
    resolvedFailed: 0,
    unresolved: 0,
  });

  assert.equal(result.outcome, RECONCILIATION_OUTCOME.SUCCESS);
  assert.equal(result.resolvedPaid, 1);
  assert.ok(/verified|Durable/.test(result.note));
});

test('a resolved failed attempt is reported as success with no stock deducted', () => {
  const result = deriveReconciliationOutcome({
    success: true,
    message: 'Examined 1 payment attempt(s).',
    examined: 1,
    resolvedPaid: 0,
    resolvedFailed: 1,
    unresolved: 0,
  });

  assert.equal(result.outcome, RECONCILIATION_OUTCOME.SUCCESS);
  assert.equal(result.resolvedFailed, 1);
  assert.ok(/cancelled|no stock/.test(result.note));
});

test('no attempts to reconcile is reported as unresolved', () => {
  const result = deriveReconciliationOutcome({
    success: true,
    message: 'No payment attempt needed reconciliation.',
    examined: 0,
    resolvedPaid: 0,
    resolvedFailed: 0,
    unresolved: 0,
  });

  assert.equal(result.outcome, RECONCILIATION_OUTCOME.UNRESOLVED);
  assert.equal(result.examined, 0);
});

test('a failed reconciliation returns the error outcome', () => {
  const result = deriveReconciliationOutcome({
    success: false,
    message: 'A valid administrative token is required.',
    examined: 0,
  });

  assert.equal(result.outcome, RECONCILIATION_OUTCOME.ERROR);
  assert.equal(result.message, 'A valid administrative token is required.');
  assert.equal(result.resolvedPaid, 0);
  assert.equal(result.resolvedFailed, 0);
});

test('an empty response is treated as an error, not a captured payment', () => {
  const result = deriveReconciliationOutcome({});

  assert.equal(result.outcome, RECONCILIATION_OUTCOME.ERROR);
  assert.equal(result.resolvedPaid, 0);
});
