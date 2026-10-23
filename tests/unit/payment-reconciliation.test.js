const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RECONCILIATION_OUTCOMES,
  classifyPaymentStatus,
  reconcilePaymentAttempts,
  finalizePaidAttempt,
  finalizeFailedAttempt,
  resolveUncertaintyIncident,
} = require('../../backend/src/services/paymentReconciliationService.js');

/**
 * Minimal in-memory doubles. The reconciliation service only relies on a
 * small part of the mongoose API, so the doubles implement exactly that.
 */
const createDoubles = ({ attempts = [], order = null, incidents = [] } = {}) => {
  const state = {
    attempts: attempts.map((attempt) => ({ ...attempt })),
    order: order ? { ...order } : null,
    incidents: incidents,
    stockDeductions: 0,
    orderUpdates: 0,
    claimedAttempts: new Set(),
  };

  const PaymentAttemptModel = {
    find(filter) {
      const wanted = filter?.status?.$in || [];

      const matched = state.attempts.filter((attempt) =>
        wanted.includes(attempt.status)
      );

      return {
        sort() {
          return this;
        },
        limit() {
          return this;
        },
        async lean() {
          return matched.map((attempt) => ({ ...attempt }));
        },
      };
    },
    async findOneAndUpdate(filter, update) {
      const attempt = state.attempts.find(
        (item) => item.attemptId === filter.attemptId
      );

      if (!attempt) return null;

      const allowed = filter.status?.$in || [];

      if (!allowed.includes(attempt.status)) return null;

      // A claim only succeeds once, so a second reconciler cannot win it.
      if (state.claimedAttempts.has(attempt.attemptId)) return null;

      state.claimedAttempts.add(attempt.attemptId);

      Object.assign(attempt, update.$set);
      attempt.status = update.$set.status;

      return { ...attempt };
    },
  };

  const OrderModel = {
    findById(id) {
      const result =
        state.order && String(state.order._id) === String(id)
          ? { ...state.order }
          : null;

      // A mongoose query supports .session() and is then awaited.
      return { session: () => Promise.resolve(result) };
    },
    async findOneAndUpdate(filter, update) {
      const allowed = filter.paymentStatus?.$in || [];

      if (!state.order) return null;

      if (!allowed.includes(state.order.paymentStatus)) return null;

      state.orderUpdates += 1;
      Object.assign(state.order, update.$set);

      return { ...state.order };
    },
  };

  const ProductModel = {
    async findOneAndUpdate() {
      state.stockDeductions += 1;

      return { _id: 'product-1', stock: 5 };
    },
    async findById() {
      return null;
    },
  };

  const IncidentModel = {
    async find(filter) {
      const wanted = filter.status?.$in || [];

      return state.incidents.filter(
        (incident) =>
          incident.incidentType === filter.incidentType &&
          String(incident.order) === String(filter.order) &&
          wanted.includes(incident.status)
      );
    },
  };

  return { state, PaymentAttemptModel, OrderModel, ProductModel, IncidentModel };
};

/**
 * A transaction runner that restores the state when the callback fails, the
 * way a real database transaction rolls back.
 */
const withTransaction = (state) => async (callback) => {
  const attemptSnapshot = state.attempts.map((attempt) => ({
    attemptId: attempt.attemptId,
    status: attempt.status,
    transactionId: attempt.transactionId,
  }));
  const orderSnapshot = state.order ? { ...state.order } : null;
  const claimed = new Set(state.claimedAttempts);
  const deductions = state.stockDeductions;
  const orderUpdates = state.orderUpdates;

  try {
    return await callback('fake-session');
  } catch (error) {
    for (const snapshot of attemptSnapshot) {
      const attempt = state.attempts.find(
        (item) => item.attemptId === snapshot.attemptId
      );

      if (attempt) {
        attempt.status = snapshot.status;
        attempt.transactionId = snapshot.transactionId;
      }
    }

    state.claimedAttempts = claimed;
    state.stockDeductions = deductions;
    state.orderUpdates = orderUpdates;

    if (orderSnapshot && state.order) {
      Object.assign(state.order, orderSnapshot);
    }

    throw error;
  }
};

test('a payment service answer is only paid when the transaction says so', () => {
  const paid = classifyPaymentStatus({
    success: true,
    paymentStatus: 'paid',
    transactionId: 'SIM-1',
  });

  assert.equal(paid.outcome, RECONCILIATION_OUTCOMES.PAID);

  const httpSuccessWithoutTransaction = classifyPaymentStatus({
    success: true,
    paymentStatus: 'paid',
  });

  assert.equal(
    httpSuccessWithoutTransaction.outcome,
    RECONCILIATION_OUTCOMES.PENDING
  );

  const failed = classifyPaymentStatus({
    success: false,
    paymentStatus: 'failed',
  });

  assert.equal(failed.outcome, RECONCILIATION_OUTCOMES.FAILED);
});

test('a lost response after a recorded success is resolved by reconciliation', async () => {
  const doubles = createDoubles({
    attempts: [
      {
        attemptId: 'order-1',
        checkoutId: 'checkout-1',
        order: 'order-1',
        amount: 3499,
        status: 'unknown',
      },
    ],
    order: {
      _id: 'order-1',
      paymentStatus: 'unknown',
      orderStatus: 'processing',
      items: [{ product: 'product-1', quantity: 1 }],
    },
  });

  const summary = await reconcilePaymentAttempts({
    ...doubles,
    withTransaction: withTransaction(doubles.state),
    statusProbe: async () => ({
      outcome: RECONCILIATION_OUTCOMES.PAID,
      payment: {
        success: true,
        paymentStatus: 'paid',
        transactionId: 'SIM-42',
        orderId: 'order-1',
        amount: 3499,
      },
    }),
  });

  assert.equal(summary.resolvedPaid, 1);
  assert.equal(summary.unresolved, 0);
  assert.equal(doubles.state.attempts[0].status, 'paid');
  assert.equal(doubles.state.attempts[0].transactionId, 'SIM-42');
  assert.equal(doubles.state.order.paymentStatus, 'paid');
  assert.equal(doubles.state.order.orderStatus, 'placed');
  assert.equal(doubles.state.stockDeductions, 1);
});

test('a temporarily unavailable payment service leaves the attempt unresolved', async () => {
  for (const outcome of [
    RECONCILIATION_OUTCOMES.UNAVAILABLE,
    RECONCILIATION_OUTCOMES.TIMEOUT,
    RECONCILIATION_OUTCOMES.NOT_FOUND,
    RECONCILIATION_OUTCOMES.PENDING,
  ]) {
    const doubles = createDoubles({
      attempts: [
        {
          attemptId: 'order-2',
          checkoutId: 'checkout-2',
          order: 'order-2',
          amount: 1299,
          status: 'unknown',
        },
      ],
      order: {
        _id: 'order-2',
        paymentStatus: 'unknown',
        orderStatus: 'processing',
        items: [{ product: 'product-1', quantity: 1 }],
      },
    });

    const summary = await reconcilePaymentAttempts({
      ...doubles,
      withTransaction: withTransaction(doubles.state),
      statusProbe: async () => ({ outcome, reason: 'not conclusive' }),
    });

    assert.equal(summary.resolvedPaid, 0);
    assert.equal(summary.resolvedFailed, 0);
    assert.equal(summary.unresolved, 1);
    assert.equal(doubles.state.attempts[0].status, 'unknown');
    assert.equal(doubles.state.order.paymentStatus, 'unknown');
    assert.equal(doubles.state.stockDeductions, 0);
  }
});

test('a confirmed failed payment cancels the order without touching stock', async () => {
  const doubles = createDoubles({
    attempts: [
      {
        attemptId: 'order-3',
        checkoutId: 'checkout-3',
        order: 'order-3',
        amount: 999,
        status: 'unknown',
      },
    ],
    order: {
      _id: 'order-3',
      paymentStatus: 'unknown',
      orderStatus: 'processing',
      items: [{ product: 'product-1', quantity: 1 }],
    },
  });

  const summary = await reconcilePaymentAttempts({
    ...doubles,
    withTransaction: withTransaction(doubles.state),
    statusProbe: async () => ({
      outcome: RECONCILIATION_OUTCOMES.FAILED,
      payment: {
        success: false,
        paymentStatus: 'failed',
        orderId: 'order-3',
        amount: 999,
        message: 'Simulated payment failure',
      },
    }),
  });

  assert.equal(summary.resolvedFailed, 1);
  assert.equal(doubles.state.attempts[0].status, 'failed');
  assert.equal(doubles.state.order.paymentStatus, 'failed');
  assert.equal(doubles.state.order.orderStatus, 'cancelled');
  assert.equal(doubles.state.stockDeductions, 0);
});

test('repeated reconciliation does not duplicate orders or stock deductions', async () => {
  const doubles = createDoubles({
    attempts: [
      {
        attemptId: 'order-4',
        checkoutId: 'checkout-4',
        order: 'order-4',
        amount: 3499,
        status: 'unknown',
      },
    ],
    order: {
      _id: 'order-4',
      paymentStatus: 'unknown',
      orderStatus: 'processing',
      items: [{ product: 'product-1', quantity: 1 }],
    },
  });

  const statusProbe = async () => ({
    outcome: RECONCILIATION_OUTCOMES.PAID,
    payment: {
      success: true,
      paymentStatus: 'paid',
      transactionId: 'SIM-7',
      orderId: 'order-4',
      amount: 3499,
    },
  });

  const first = await reconcilePaymentAttempts({
    ...doubles,
    withTransaction: withTransaction(doubles.state),
    statusProbe,
  });

  const second = await reconcilePaymentAttempts({
    ...doubles,
    withTransaction: withTransaction(doubles.state),
    statusProbe,
  });

  assert.equal(first.resolvedPaid, 1);
  assert.equal(second.resolvedPaid, 0);
  // The attempt is resolved, so the second run has nothing left to examine.
  assert.equal(second.examined, 0);
  assert.equal(doubles.state.stockDeductions, 1, 'stock may only be deducted once');
  assert.equal(doubles.state.orderUpdates, 1, 'the order may only be finalized once');
});

test('the uncertainty incident is only resolved after the outcome is verified', async () => {
  const openIncident = {
    incidentType: 'payment_status_uncertain',
    order: 'order-5',
    status: 'detected',
    save: async function () {
      this.saved = true;
    },
  };

  const doubles = createDoubles({
    attempts: [
      {
        attemptId: 'order-5',
        checkoutId: 'checkout-5',
        order: 'order-5',
        amount: 3499,
        status: 'unknown',
      },
    ],
    order: {
      _id: 'order-5',
      paymentStatus: 'unknown',
      orderStatus: 'processing',
      items: [{ product: 'product-1', quantity: 1 }],
    },
    incidents: [openIncident],
  });

  const summary = await reconcilePaymentAttempts({
    ...doubles,
    withTransaction: withTransaction(doubles.state),
    statusProbe: async () => ({
      outcome: RECONCILIATION_OUTCOMES.PAID,
      payment: {
        success: true,
        paymentStatus: 'paid',
        transactionId: 'SIM-9',
        orderId: 'order-5',
        amount: 3499,
      },
    }),
  });

  assert.equal(summary.resolvedPaid, 1);
  assert.equal(openIncident.status, 'resolved');
  assert.ok(openIncident.resolvedAt instanceof Date);
  assert.equal(openIncident.saved, true);
});

test('an unresolved attempt leaves its incident open', async () => {
  const openIncident = {
    incidentType: 'payment_status_uncertain',
    order: 'order-6',
    status: 'detected',
    save: async function () {
      this.saved = true;
    },
  };

  const doubles = createDoubles({
    attempts: [
      {
        attemptId: 'order-6',
        checkoutId: 'checkout-6',
        order: 'order-6',
        amount: 3499,
        status: 'unknown',
      },
    ],
    order: {
      _id: 'order-6',
      paymentStatus: 'unknown',
      orderStatus: 'processing',
      items: [{ product: 'product-1', quantity: 1 }],
    },
    incidents: [openIncident],
  });

  await reconcilePaymentAttempts({
    ...doubles,
    withTransaction: withTransaction(doubles.state),
    statusProbe: async () => ({
      outcome: RECONCILIATION_OUTCOMES.UNAVAILABLE,
      reason: 'The payment service could not be reached.',
    }),
  });

  assert.equal(openIncident.status, 'detected');
  assert.equal(openIncident.saved, undefined);
});

test('a database error during finalization is not reported as a payment failure', async () => {
  const doubles = createDoubles({
    attempts: [
      {
        attemptId: 'order-7',
        checkoutId: 'checkout-7',
        order: 'order-7',
        amount: 3499,
        status: 'unknown',
      },
    ],
    order: {
      _id: 'order-7',
      paymentStatus: 'unknown',
      orderStatus: 'processing',
      items: [{ product: 'product-1', quantity: 1 }],
    },
  });

  const summary = await reconcilePaymentAttempts({
    ...doubles,
    withTransaction: async () => {
      throw new Error('write concern error');
    },
    recordIncidentFn: async () => {},
    statusProbe: async () => ({
      outcome: RECONCILIATION_OUTCOMES.PAID,
      payment: {
        success: true,
        paymentStatus: 'paid',
        transactionId: 'SIM-11',
        orderId: 'order-7',
        amount: 3499,
      },
    }),
  });

  assert.equal(summary.resolvedPaid, 0);
  assert.equal(summary.resolvedFailed, 0);
  assert.equal(summary.unresolved, 1);
  assert.equal(doubles.state.attempts[0].status, 'unknown');
});

test('a missing stock is reported as an explicit outcome and leaves the attempt open', async () => {
  const recordedIncidents = [];

  const doubles = createDoubles({
    attempts: [
      {
        attemptId: 'order-8',
        checkoutId: 'checkout-8',
        order: 'order-8',
        amount: 3499,
        status: 'unknown',
      },
    ],
    order: {
      _id: 'order-8',
      paymentStatus: 'unknown',
      orderStatus: 'processing',
      items: [{ product: 'product-1', quantity: 1 }],
    },
  });

  const summary = await reconcilePaymentAttempts({
    ...doubles,
    withTransaction: withTransaction(doubles.state),
    recordIncidentFn: async (incident) => {
      recordedIncidents.push(incident);
    },
    statusProbe: async () => ({
      outcome: RECONCILIATION_OUTCOMES.PAID,
      payment: {
        success: true,
        paymentStatus: 'paid',
        transactionId: 'SIM-13',
        orderId: 'order-8',
        amount: 3499,
      },
    }),
    ProductModel: {
      async findOneAndUpdate() {
        throw new Error('Insufficient stock for product product-1');
      },
    },
  });

  assert.equal(summary.unresolved, 1);
  assert.equal(summary.resolvedPaid, 0);
  assert.equal(doubles.state.attempts[0].status, 'unknown');
  assert.equal(recordedIncidents.length, 1);
  assert.equal(
    recordedIncidents[0].incidentType,
    'payment_reconciliation_stock_unavailable'
  );
  assert.equal(recordedIncidents[0].severity, 'critical');
});

test('only pending and unknown attempts are read', async () => {
  const requestedFilters = [];

  const PaymentAttemptModel = {
    find(filter) {
      requestedFilters.push(filter);

      return {
        sort() {
          return this;
        },
        limit() {
          return this;
        },
        async lean() {
          return [];
        },
      };
    },
  };

  await reconcilePaymentAttempts({
    PaymentAttemptModel,
    withTransaction: async (callback) => callback('fake-session'),
    statusProbe: async () => ({ outcome: RECONCILIATION_OUTCOMES.NOT_FOUND }),
  });

  assert.equal(requestedFilters.length, 1);
  assert.deepEqual(requestedFilters[0].status.$in, ['pending', 'unknown']);
});

test('a claimed attempt cannot be finalized twice', async () => {
  const doubles = createDoubles({
    attempts: [
      {
        attemptId: 'order-9',
        checkoutId: 'checkout-9',
        order: 'order-9',
        amount: 3499,
        status: 'pending',
      },
    ],
    order: {
      _id: 'order-9',
      paymentStatus: 'pending',
      orderStatus: 'processing',
      items: [{ product: 'product-1', quantity: 1 }],
    },
  });

  const attempt = doubles.state.attempts[0];
  const payment = {
    success: true,
    paymentStatus: 'paid',
    transactionId: 'SIM-15',
    orderId: 'order-9',
    amount: 3499,
  };

  const first = await finalizePaidAttempt(attempt, payment, {
    PaymentAttemptModel: doubles.PaymentAttemptModel,
    OrderModel: doubles.OrderModel,
    ProductModel: doubles.ProductModel,
    session: 'fake-session',
  });

  const second = await finalizePaidAttempt(attempt, payment, {
    PaymentAttemptModel: doubles.PaymentAttemptModel,
    OrderModel: doubles.OrderModel,
    ProductModel: doubles.ProductModel,
    session: 'fake-session',
  });

  assert.equal(first.finalized, true);
  assert.equal(second.finalized, false);
  assert.equal(second.reason, 'already_resolved');
  assert.equal(doubles.state.stockDeductions, 1);
});

test('a failed attempt cannot be finalized twice either', async () => {
  const doubles = createDoubles({
    attempts: [
      {
        attemptId: 'order-10',
        checkoutId: 'checkout-10',
        order: 'order-10',
        amount: 100,
        status: 'unknown',
      },
    ],
    order: {
      _id: 'order-10',
      paymentStatus: 'unknown',
      orderStatus: 'processing',
      items: [],
    },
  });

  const attempt = doubles.state.attempts[0];
  const payment = { paymentStatus: 'failed', message: 'Simulated failure' };

  const first = await finalizeFailedAttempt(attempt, payment, {
    PaymentAttemptModel: doubles.PaymentAttemptModel,
    OrderModel: doubles.OrderModel,
  });

  const second = await finalizeFailedAttempt(attempt, payment, {
    PaymentAttemptModel: doubles.PaymentAttemptModel,
    OrderModel: doubles.OrderModel,
  });

  assert.equal(first.finalized, true);
  assert.equal(second.finalized, false);
  assert.equal(doubles.state.orderUpdates, 1);
});

test('resolving an incident only touches the matching open incident', async () => {
  const matching = {
    incidentType: 'payment_status_uncertain',
    order: 'order-11',
    status: 'detected',
    save: async function () {},
  };

  const otherOrder = {
    incidentType: 'payment_status_uncertain',
    order: 'order-12',
    status: 'detected',
    save: async function () {},
  };

  const alreadyResolved = {
    incidentType: 'payment_status_uncertain',
    order: 'order-11',
    status: 'resolved',
    save: async function () {},
  };

  const IncidentModel = {
    async find(filter) {
      const wanted = filter.status?.$in || [];

      return [matching, otherOrder, alreadyResolved].filter(
        (incident) =>
          incident.incidentType === filter.incidentType &&
          String(incident.order) === String(filter.order) &&
          wanted.includes(incident.status)
      );
    },
  };

  const resolved = await resolveUncertaintyIncident('order-11', {
    IncidentModel,
    resolution: { recoveryAction: 'verified', recoveryResult: 'confirmed' },
  });

  assert.equal(resolved, 1);
  assert.equal(matching.status, 'resolved');
  assert.equal(otherOrder.status, 'detected');
  assert.equal(alreadyResolved.status, 'resolved');
});
