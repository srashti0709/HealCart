const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getPaymentAttemptStatus,
} = require('../../backend/src/controllers/paymentController.js');

const attemptId = '6ad0cd9b61f4193f080c9f02';
const checkoutId = 'a1b2c3d4-1111-2222-3333-444455556666';

const createResponse = () => {
  const response = {
    statusCode: null,
    body: null,
    ended: false,
  };

  response.status = (code) => {
    response.statusCode = code;
    return response;
  };

  response.json = (payload) => {
    response.body = payload;
    response.ended = true;
    return response;
  };

  return response;
};

const createDoubles = ({ attempt = null, order = null } = {}) => {
  const queries = [];

  const PaymentAttemptModel = {
    findOne(filter) {
      queries.push(filter);

      // A mongoose query supports .lean() and is then awaited.
      return {
        lean: async () => {
          if (!attempt) return null;
          if (filter.attemptId !== attempt.attemptId) return null;
          if (filter.checkoutId !== attempt.checkoutId) return null;

          return { ...attempt };
        },
      };
    },
  };

  const OrderModel = {
    findById(id) {
      if (!order) {
        // An attempt may not have an order in some edge cases.
        return {
          select() {
            return this;
          },
          async lean() {
            return null;
          },
        };
      }

      return {
        select() {
          return this;
        },
        async lean() {
          return String(order._id) === String(id) ? { ...order } : null;
        },
      };
    },
  };

  return { queries, PaymentAttemptModel, OrderModel };
};

const withModels = (req, res, doubles) =>
  getPaymentAttemptStatus(
    { ...req, query: req.query || {}, get: (name) => req.headers?.[name?.toLowerCase?.()] ?? req.headers?.[name] },
    res,
    doubles
  );

test('an attempt of the requesting checkout is returned with its order status', async () => {
  const doubles = createDoubles({
    attempt: {
      attemptId,
      checkoutId,
      order: attemptId,
      amount: 3499,
      status: 'unknown',
      transactionId: null,
      failureReason: 'Payment request timed out',
      updatedAt: '2026-10-22T10:00:00.000Z',
    },
    order: {
      _id: attemptId,
      paymentStatus: 'unknown',
      orderStatus: 'processing',
      totalAmount: 3499,
    },
  });

  const res = createResponse();

  await withModels(
    { params: { attemptId }, headers: { 'x-checkout-id': checkoutId } },
    res,
    doubles
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.attempt.status, 'unknown');
  assert.equal(res.body.attempt.amount, 3499);
  assert.equal(res.body.order.paymentStatus, 'unknown');
  assert.equal(res.body.order.orderStatus, 'processing');
  assert.equal(res.body.resolved, false);

  // Internal diagnostics are never exposed to the customer.
  assert.equal(res.body.attempt.failureReason, undefined);
  assert.equal(res.body.attempt.checkoutId, undefined);
});

test('a paid attempt reports the transaction id and a definitive result', async () => {
  const doubles = createDoubles({
    attempt: {
      attemptId,
      checkoutId,
      order: attemptId,
      amount: 3499,
      status: 'paid',
      transactionId: 'SIM-42-order',
      failureReason: null,
      updatedAt: '2026-10-22T10:05:00.000Z',
    },
    order: {
      _id: attemptId,
      paymentStatus: 'paid',
      orderStatus: 'placed',
      totalAmount: 3499,
    },
  });

  const res = createResponse();

  await withModels(
    { params: { attemptId }, headers: { 'x-checkout-id': checkoutId } },
    res,
    doubles
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.resolved, true);
  assert.equal(res.body.attempt.transactionId, 'SIM-42-order');
});

test('a failed attempt is reported as a definitive failure', async () => {
  const doubles = createDoubles({
    attempt: {
      attemptId,
      checkoutId,
      order: attemptId,
      amount: 3499,
      status: 'failed',
      transactionId: null,
      failureReason: 'Simulated payment failure',
      updatedAt: '2026-10-22T10:06:00.000Z',
    },
    order: {
      _id: attemptId,
      paymentStatus: 'failed',
      orderStatus: 'cancelled',
      totalAmount: 3499,
    },
  });

  const res = createResponse();

  await withModels(
    { params: { attemptId }, headers: { 'x-checkout-id': checkoutId } },
    res,
    doubles
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.resolved, true);
  assert.equal(res.body.attempt.status, 'failed');
  assert.equal(res.body.attempt.transactionId, undefined);
  assert.equal(res.body.attempt.failureReason, undefined);
});

test('an attempt that does not exist is reported as not found', async () => {
  const doubles = createDoubles({ attempt: null });
  const res = createResponse();

  await withModels(
    { params: { attemptId }, headers: { 'x-checkout-id': checkoutId } },
    res,
    doubles
  );

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.success, false);
  assert.match(res.body.message, /No payment attempt/i);
});

test('an invalid attempt id is rejected before any lookup', async () => {
  const doubles = createDoubles({
    attempt: { attemptId, checkoutId, order: attemptId, amount: 1, status: 'unknown' },
  });
  const res = createResponse();

  await withModels(
    { params: { attemptId: 'not a valid id!' }, headers: { 'x-checkout-id': checkoutId } },
    res,
    doubles
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /not valid/i);
  assert.equal(doubles.queries.length, 0, 'no lookup may be performed');
});

test('an attempt of another checkout is not exposed', async () => {
  const doubles = createDoubles({
    attempt: {
      attemptId,
      checkoutId: 'someone-elses-checkout',
      order: attemptId,
      amount: 3499,
      status: 'paid',
      transactionId: 'SIM-1',
    },
  });

  const res = createResponse();

  await withModels(
    { params: { attemptId }, headers: { 'x-checkout-id': checkoutId } },
    res,
    doubles
  );

  // The same answer as a missing attempt, so the endpoint cannot be used to
  // discover another checkout's order.
  assert.equal(res.statusCode, 404);
  assert.match(res.body.message, /No payment attempt/i);
  assert.equal(res.body.attempt, undefined);
});

test('a request without a checkout id is refused', async () => {
  const doubles = createDoubles({
    attempt: { attemptId, checkoutId, order: attemptId, amount: 1, status: 'unknown' },
  });
  const res = createResponse();

  await withModels({ params: { attemptId }, headers: {} }, res, doubles);

  assert.equal(res.statusCode, 401);
  assert.match(res.body.message, /checkout id is required/i);
  assert.equal(doubles.queries.length, 0);
});
