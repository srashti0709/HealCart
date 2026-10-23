const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  PaymentTransactionStore,
} = require('../../payment-service/src/transactionStore.js');
const {
  processPaymentRequest,
  getPaymentStatusRequest,
} = require('../../payment-service/src/paymentProcessing.js');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shcom-ledger-'));

const ledgerPath = (name) => path.join(tempDir, `${name}.json`);

test('a recorded transaction survives the in-memory process state being discarded', async () => {
  const file = ledgerPath('survive');

  const firstProcess = new PaymentTransactionStore({ ledgerPath: file });

  await processPaymentRequest({
    store: firstProcess,
    body: { orderId: 'order-1', amount: 3499 },
  });

  // A restart means a brand new store instance with no memory of the first.
  const secondProcess = new PaymentTransactionStore({ ledgerPath: file });

  const stored = secondProcess.get('order-1');

  assert.ok(stored, 'the transaction must still be readable after a restart');
  assert.equal(stored.paymentStatus, 'paid');
  assert.equal(stored.amount, 3499);
  assert.equal(typeof stored.transactionId, 'string');
  assert.equal(secondProcess.count(), 1);
});

test('a repeated payment request for the same identifier does not create a second transaction', async () => {
  const file = ledgerPath('repeat');
  const store = new PaymentTransactionStore({ ledgerPath: file });

  const first = await processPaymentRequest({
    store,
    body: { orderId: 'order-2', amount: 1299 },
  });

  const second = await processPaymentRequest({
    store,
    body: { orderId: 'order-2', amount: 1299 },
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.transactionId, first.body.transactionId);
  assert.equal(store.count(), 1);

  const persisted = JSON.parse(fs.readFileSync(file, 'utf8'));

  assert.equal(Object.keys(persisted).length, 1);
});

test('a repeated payment request for the same identifier with another amount is rejected', async () => {
  const store = new PaymentTransactionStore({ ledgerPath: ledgerPath('mismatch') });

  await processPaymentRequest({
    store,
    body: { orderId: 'order-3', amount: 1299 },
  });

  const conflict = await processPaymentRequest({
    store,
    body: { orderId: 'order-3', amount: 500 },
  });

  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.body.success, false);
});

test('a recorded failed transaction is reported as failed and not as paid', async () => {
  const store = new PaymentTransactionStore({ ledgerPath: ledgerPath('failed') });

  const result = await processPaymentRequest({
    store,
    body: { orderId: 'order-4', amount: 999 },
    simulateFailure: true,
  });

  assert.equal(result.statusCode, 503);
  assert.equal(result.body.paymentStatus, 'failed');

  const stored = store.get('order-4');

  assert.equal(stored.paymentStatus, 'failed');
  assert.equal(stored.success, false);
  assert.equal(stored.transactionId, undefined);

  const status = await getPaymentStatusRequest({
    store,
    orderId: 'order-4',
  });

  assert.equal(status.statusCode, 200);
  assert.equal(status.body.paymentStatus, 'failed');
});

test('a lost response after a recorded success stays discoverable', async () => {
  const file = ledgerPath('lost-response');
  const store = new PaymentTransactionStore({ ledgerPath: file });

  const result = await processPaymentRequest({
    store,
    body: { orderId: 'order-5', amount: 2499 },
    simulateTimeout: true,
  });

  // The caller never learns the outcome.
  assert.equal(result.statusCode, 504);
  assert.equal(result.body.paymentStatus, 'unknown');
  assert.equal(result.body.success, false);

  // The durable record still holds the real outcome.
  const restarted = new PaymentTransactionStore({ ledgerPath: file });
  const status = await getPaymentStatusRequest({
    store: restarted,
    orderId: 'order-5',
  });

  assert.equal(status.statusCode, 200);
  assert.equal(status.body.paymentStatus, 'paid');
  assert.equal(status.body.success, true);
  assert.equal(status.body.responseDelivered, false);
});

test('a ledger failure is never reported as a payment failure', async () => {
  const brokenStore = {
    get() {
      throw new Error('ledger unreadable');
    },
    record() {
      throw new Error('ledger unwritable');
    },
  };

  const readFailure = await processPaymentRequest({
    store: brokenStore,
    body: { orderId: 'order-6', amount: 100 },
  });

  assert.equal(readFailure.statusCode, 503);
  assert.equal(readFailure.body.paymentStatus, 'unknown');
  assert.equal(readFailure.body.success, false);
  assert.notEqual(readFailure.body.paymentStatus, 'failed');

  const writeFailure = await processPaymentRequest({
    store: brokenStore,
    body: { orderId: 'order-7', amount: 100 },
  });

  assert.equal(writeFailure.statusCode, 503);
  assert.equal(writeFailure.body.paymentStatus, 'unknown');
  assert.notEqual(writeFailure.body.paymentStatus, 'failed');
});

test('an unknown transaction is reported as not found and not as a failure', async () => {
  const store = new PaymentTransactionStore({ ledgerPath: ledgerPath('missing') });

  const status = await getPaymentStatusRequest({
    store,
    orderId: 'never-seen',
  });

  assert.equal(status.statusCode, 404);
  assert.equal(status.body.paymentStatus, 'unknown');
  assert.equal(status.body.success, false);
});

test('an invalid payment request is rejected before anything is stored', async () => {
  const store = new PaymentTransactionStore({ ledgerPath: ledgerPath('invalid') });

  const result = await processPaymentRequest({
    store,
    body: { orderId: '', amount: 0 },
  });

  assert.equal(result.statusCode, 400);
  assert.equal(store.count(), 0);
});
