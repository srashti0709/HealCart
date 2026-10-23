const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { PaymentTransactionStore } =
  require("../../payment-service/src/transactionStore.js");
const {
  processPaymentRequest,
  getPaymentStatusRequest,
} = require("../../payment-service/src/paymentProcessing.js");
const {
  RECONCILIATION_OUTCOMES,
  classifyPaymentStatus,
  reconcilePaymentAttempts,
  finalizePaidAttempt,
} = require("../../backend/src/services/paymentReconciliationService.js");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "shcom-response-lost-"));
const ledgerPath = (name) => path.join(tempDir, `${name}.json`);

/**
 * Minimal in-memory doubles matching the existing reconciliation test pattern.
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
        sort() { return this; },
        limit() { return this; },
        async lean() { return matched.map((attempt) => ({ ...attempt })); },
      };
    },
    async findOneAndUpdate(filter, update) {
      const attempt = state.attempts.find(
        (item) => item.attemptId === filter.attemptId
      );
      if (!attempt) return null;
      const allowed = filter.status?.$in || [];
      if (!allowed.includes(attempt.status)) return null;
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
      return { _id: "product-1", stock: 5 };
    },
    async findById() { return null; },
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

test("a lost response after a recorded success stays discoverable as paid", async () => {
  const store = new PaymentTransactionStore({ ledgerPath: ledgerPath("lost-response") });

  const result = await processPaymentRequest({
    store,
    body: { orderId: "order-lost-1", amount: 2499 },
    simulateTimeout: true,
  });

  // The caller never learns the outcome.
  assert.equal(result.statusCode, 504);
  assert.equal(result.body.paymentStatus, "unknown");
  assert.equal(result.body.success, false);

  // A "restart" (new store instance, same ledger file) still finds the paid transaction.
  const restarted = new PaymentTransactionStore({ ledgerPath: ledgerPath("lost-response") });
  const status = await getPaymentStatusRequest({
    store: restarted,
    orderId: "order-lost-1",
  });

  assert.equal(status.statusCode, 200);
  assert.equal(status.body.paymentStatus, "paid");
  assert.equal(status.body.success, true);
  assert.equal(status.body.responseDelivered, false);
  assert.ok(typeof status.body.transactionId === "string" && status.body.transactionId.length > 0);
});

test("a repeated payment request does not create a second transaction", async () => {
  const store = new PaymentTransactionStore({ ledgerPath: ledgerPath("repeat-lost") });

  const first = await processPaymentRequest({
    store,
    body: { orderId: "order-repeat-1", amount: 1299 },
    simulateTimeout: true,
  });
  const second = await processPaymentRequest({
    store,
    body: { orderId: "order-repeat-1", amount: 1299 },
  });

  assert.equal(first.statusCode, 504);
  assert.equal(second.statusCode, 200);

  // Both requests resolve to the same durable transaction.
  const stored = store.get("order-repeat-1");
  assert.ok(stored, "the transaction must be recorded in the ledger");
  assert.equal(second.body.transactionId, stored.transactionId);
  assert.equal(store.count(), 1);
});

test("reconciliation resolves an uncertain attempt to paid when the ledger confirms it", async () => {
  const doubles = createDoubles({
    attempts: [
      {
        attemptId: "order-uncertain-1",
        checkoutId: "checkout-uncertain-1",
        order: "order-uncertain-1",
        amount: 3499,
        status: "unknown",
      },
    ],
    order: {
      _id: "order-uncertain-1",
      paymentStatus: "unknown",
      orderStatus: "processing",
      items: [{ product: "product-1", quantity: 1 }],
    },
    incidents: [
      {
        incidentType: "payment_status_uncertain",
        order: "order-uncertain-1",
        status: "detected",
        save: async function () { this.saved = true; },
      },
    ],
  });

  const summary = await reconcilePaymentAttempts({
    ...doubles,
    withTransaction: async (fn) => fn(doubles.state),
    statusProbe: async () => ({
      outcome: RECONCILIATION_OUTCOMES.PAID,
      payment: {
        success: true,
        paymentStatus: "paid",
        transactionId: "SIM-uncertain-1",
        orderId: "order-uncertain-1",
        amount: 3499,
      },
    }),
  });

  assert.equal(summary.resolvedPaid, 1);
  assert.equal(summary.examined, 1);
  assert.equal(doubles.state.stockDeductions, 1, "stock may only be deducted once");
  assert.equal(doubles.state.orderUpdates, 1, "the order may only be finalized once");
});

test("repeated reconciliation is idempotent and deducts stock only once", async () => {
  const doubles = createDoubles({
    attempts: [
      {
        attemptId: "order-idempotent-1",
        checkoutId: "checkout-idempotent-1",
        order: "order-idempotent-1",
        amount: 3499,
        status: "unknown",
      },
    ],
    order: {
      _id: "order-idempotent-1",
      paymentStatus: "unknown",
      orderStatus: "processing",
      items: [{ product: "product-1", quantity: 1 }],
    },
    incidents: [],
  });

  const first = await reconcilePaymentAttempts({
    ...doubles,
    withTransaction: async (fn) => fn(doubles.state),
    statusProbe: async () => ({
      outcome: RECONCILIATION_OUTCOMES.PAID,
      payment: {
        success: true,
        paymentStatus: "paid",
        transactionId: "SIM-idempotent-1",
        orderId: "order-idempotent-1",
        amount: 3499,
      },
    }),
  });

  const second = await reconcilePaymentAttempts({
    ...doubles,
    withTransaction: async (fn) => fn(doubles.state),
    statusProbe: async () => ({
      outcome: RECONCILIATION_OUTCOMES.PAID,
      payment: {
        success: true,
        paymentStatus: "paid",
        transactionId: "SIM-idempotent-1",
        orderId: "order-idempotent-1",
        amount: 3499,
      },
    }),
  });

  // First run resolves the attempt; second run has nothing left to claim.
  assert.equal(first.resolvedPaid, 1);
  assert.equal(second.resolvedPaid, 0);
  assert.equal(second.examined, 0);
  assert.equal(doubles.state.stockDeductions, 1, "stock deducted exactly once");
  assert.equal(doubles.state.orderUpdates, 1, "order finalized exactly once");
});

test("a timeout without a confirmed ledger transaction remains unresolved", async () => {
  const store = new PaymentTransactionStore({ ledgerPath: ledgerPath("unconfirmed") });

  // No transaction was ever recorded for this order.
  const status = await getPaymentStatusRequest({
    store,
    orderId: "order-never-recorded",
  });

  assert.equal(status.statusCode, 404);
  assert.equal(status.body.paymentStatus, "unknown");
  assert.equal(status.body.success, false);

  // classifyPaymentStatus should treat this as UNAVAILABLE, not PAID.
  const classification = classifyPaymentStatus(status.body);
  assert.notEqual(classification.outcome, RECONCILIATION_OUTCOMES.PAID);
});

test("a definitive payment failure is never reported as paid", async () => {
  const store = new PaymentTransactionStore({ ledgerPath: ledgerPath("definitive-fail") });

  const result = await processPaymentRequest({
    store,
    body: { orderId: "order-fail-1", amount: 999 },
    simulateFailure: true,
  });

  assert.equal(result.statusCode, 503);
  assert.equal(result.body.paymentStatus, "failed");
  assert.equal(result.body.success, false);

  const status = await getPaymentStatusRequest({
    store,
    orderId: "order-fail-1",
  });

  assert.equal(status.statusCode, 200);
  assert.equal(status.body.paymentStatus, "failed");
  assert.equal(status.body.success, false);
  assert.equal(status.body.transactionId, undefined);
});

test("classifyPaymentStatus treats a confirmed paid transaction as PAID only", () => {
  const paid = classifyPaymentStatus({
    success: true,
    paymentStatus: "paid",
    transactionId: "SIM-1",
    orderId: "order-1",
    amount: 100,
  });
  assert.equal(paid.outcome, RECONCILIATION_OUTCOMES.PAID);

  const unknown = classifyPaymentStatus({
    paymentStatus: "unknown",
    success: false,
  });
  assert.equal(unknown.outcome, RECONCILIATION_OUTCOMES.PENDING);

  const unavailable = classifyPaymentStatus({
    paymentStatus: "unknown",
    success: false,
  });
  assert.equal(unavailable.outcome, RECONCILIATION_OUTCOMES.PENDING);
});
