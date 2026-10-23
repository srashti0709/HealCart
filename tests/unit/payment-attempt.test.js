const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PAYMENT_ATTEMPT_STATUSES,
  ALLOWED_PAYMENT_ATTEMPT_TRANSITIONS,
  canTransitionPaymentAttempt,
  buildPaymentAttemptId,
} = require('../../backend/src/services/paymentAttemptService.js');

const PaymentAttempt = require('../../backend/src/models/PaymentAttempt.js');
const Order = require('../../backend/src/models/Order.js');

const {
  buildCartFingerprint,
  resolveCheckoutAttempt,
} = require('../../frontend/src/lib/checkoutAttempt.js');

test('the payment attempt uses the documented state vocabulary', () => {
  assert.deepEqual(PAYMENT_ATTEMPT_STATUSES, [
    'pending',
    'paid',
    'failed',
    'unknown',
  ]);
});

test('a pending attempt can resolve to paid, failed or unknown', () => {
  assert.equal(canTransitionPaymentAttempt('pending', 'paid'), true);
  assert.equal(canTransitionPaymentAttempt('pending', 'failed'), true);
  assert.equal(canTransitionPaymentAttempt('pending', 'unknown'), true);
});

test('an unknown attempt can still be resolved later', () => {
  assert.equal(canTransitionPaymentAttempt('unknown', 'paid'), true);
  assert.equal(canTransitionPaymentAttempt('unknown', 'failed'), true);
  assert.equal(canTransitionPaymentAttempt('unknown', 'unknown'), true);
});

test('paid and failed attempts are final', () => {
  assert.equal(canTransitionPaymentAttempt('paid', 'unknown'), false);
  assert.equal(canTransitionPaymentAttempt('paid', 'failed'), false);
  assert.equal(canTransitionPaymentAttempt('failed', 'paid'), false);
  assert.equal(canTransitionPaymentAttempt('failed', 'unknown'), false);
});

test('an unknown state is never accepted', () => {
  assert.equal(canTransitionPaymentAttempt('pending', 'processing'), false);
  assert.equal(canTransitionPaymentAttempt('processing', 'paid'), false);
  assert.equal(canTransitionPaymentAttempt('settled', 'paid'), false);
});

test('the allowed transition table covers every state', () => {
  for (const status of PAYMENT_ATTEMPT_STATUSES) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(
        ALLOWED_PAYMENT_ATTEMPT_TRANSITIONS,
        status
      ),
      `${status} is missing from the transition table`
    );
  }
});

test('the attempt id is the order id, so no second identifier is generated', () => {
  const orderId = '6ad0cd9b61f4193f080c9f02';

  assert.equal(buildPaymentAttemptId(orderId), orderId);
  assert.equal(buildPaymentAttemptId(orderId), buildPaymentAttemptId(orderId));
});

test('the payment attempt schema keeps one record per attempt id', () => {
  assert.equal(PaymentAttempt.schema.path('attemptId').isRequired, true);

  const attemptIndexes = PaymentAttempt.schema.indexes();
  const attemptIdIndex = attemptIndexes.find(([fields]) =>
    Object.prototype.hasOwnProperty.call(fields, 'attemptId')
  );

  assert.ok(attemptIdIndex, 'attemptId must be indexed');
  assert.equal(attemptIdIndex[1].unique, true);

  const status = PaymentAttempt.schema.path('status');

  assert.deepEqual(status.options.enum, PAYMENT_ATTEMPT_STATUSES);
  assert.equal(status.options.default, 'pending');

  assert.equal(PaymentAttempt.schema.path('checkoutId').isRequired, true);
  assert.equal(PaymentAttempt.schema.path('order').isRequired, true);
  assert.equal(PaymentAttempt.schema.path('amount').isRequired, true);
  assert.equal(PaymentAttempt.schema.path('amount').options.min, 0);
});

test('the order keeps the same payment status vocabulary', () => {
  assert.deepEqual(Order.schema.path('paymentStatus').options.enum, [
    'pending',
    'paid',
    'failed',
    'unknown',
  ]);

  const checkoutIdIndex = Order.schema
    .indexes()
    .find(([fields]) => Object.prototype.hasOwnProperty.call(fields, 'checkoutId'));

  assert.ok(checkoutIdIndex, 'checkoutId must be indexed');
  assert.equal(checkoutIdIndex[1].unique, true);
});

test('the checkout id stays the same while the basket is unchanged', () => {
  const fingerprint = buildCartFingerprint([
    { productId: 'a', quantity: 2 },
  ]);

  const first = resolveCheckoutAttempt(null, fingerprint);
  const second = resolveCheckoutAttempt(first, fingerprint);

  assert.equal(typeof first.id, 'string');
  assert.ok(first.id.length > 0);
  assert.equal(second.id, first.id);
  assert.equal(second.fingerprint, fingerprint);
});

test('the checkout id changes when the basket changes', () => {
  const first = resolveCheckoutAttempt(
    null,
    buildCartFingerprint([{ productId: 'a', quantity: 1 }])
  );

  const second = resolveCheckoutAttempt(
    first,
    buildCartFingerprint([{ productId: 'a', quantity: 3 }])
  );

  assert.notEqual(second.id, first.id);
});

test('the cart fingerprint ignores ordering but reflects quantity', () => {
  const a = buildCartFingerprint([
    { productId: 'a', quantity: 1 },
    { productId: 'b', quantity: 2 },
  ]);

  const b = buildCartFingerprint([
    { productId: 'b', quantity: 2 },
    { productId: 'a', quantity: 1 },
  ]);

  const c = buildCartFingerprint([
    { productId: 'a', quantity: 1 },
    { productId: 'b', quantity: 5 },
  ]);

  assert.equal(a, b);
  assert.notEqual(a, c);
});
