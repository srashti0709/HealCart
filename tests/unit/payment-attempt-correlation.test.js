const test = require("node:test");
const assert = require("node:assert/strict");

const {
  findLatestUncertainOrder,
  buildAttemptResult,
} = require("../../frontend/src/lib/paymentAttemptCorrelation.js");

test("findLatestUncertainOrder returns null for non-array input", () => {
  assert.equal(findLatestUncertainOrder(null), null);
  assert.equal(findLatestUncertainOrder(undefined), null);
  assert.equal(findLatestUncertainOrder("not an array"), null);
});

test("findLatestUncertainOrder returns null for empty array", () => {
  assert.equal(findLatestUncertainOrder([]), null);
});

test("findLatestUncertainOrder finds the latest unknown/paid order", () => {
  const orders = [
    { _id: "order-3", paymentStatus: "paid", createdAt: "2026-01-03" },
    { _id: "order-2", paymentStatus: "unknown", createdAt: "2026-01-02" },
    { _id: "order-1", paymentStatus: "failed", createdAt: "2026-01-01" },
  ];

  const result = findLatestUncertainOrder(orders);

  // order-3 is paid and is the latest match.
  assert.equal(result._id, "order-3");
});

test("findLatestUncertainOrder prefers unknown over later paid when unknown is last", () => {
  const orders = [
    { _id: "order-2", paymentStatus: "paid", createdAt: "2026-01-02" },
    { _id: "order-1", paymentStatus: "unknown", createdAt: "2026-01-01" },
  ];

  // orders is expected to be sorted newest first, so order-2 is first match.
  const result = findLatestUncertainOrder(orders);

  assert.equal(result._id, "order-2");
});

test("findLatestUncertainOrder finds the latest pending order", () => {
  const orders = [
    { _id: "order-3", paymentStatus: "failed", createdAt: "2026-01-03" },
    { _id: "order-2", paymentStatus: "pending", createdAt: "2026-01-02" },
  ];

  const result = findLatestUncertainOrder(orders);

  assert.equal(result._id, "order-2");
});

test("findLatestUncertainOrder skips failed/cancelled orders", () => {
  const orders = [
    { _id: "order-2", paymentStatus: "failed", createdAt: "2026-01-02" },
    { _id: "order-1", paymentStatus: "cancelled", createdAt: "2026-01-01" },
  ];

  assert.equal(findLatestUncertainOrder(orders), null);
});

test("buildAttemptResult reports paid when attempt status is paid", () => {
  const result = buildAttemptResult(
    { success: true, status: "paid", attempt: { status: "paid", transactionId: "SIM-1" } },
    { id: "order-1", paymentStatus: "paid", orderStatus: "placed" }
  );

  assert.equal(result.passed, true);
  assert.equal(result.transactionId, "SIM-1");
  assert.equal(result.attemptStatus, "paid");
  assert.equal(result.orderPaymentStatus, "paid");
  assert.ok(/Transaction ID: SIM-1/.test(result.message));
});

test("buildAttemptResult reports not passed when attempt is unknown", () => {
  const result = buildAttemptResult(
    { success: true, status: "unknown", attempt: { status: "unknown" } },
    { id: "order-1", paymentStatus: "unknown", orderStatus: "processing" }
  );

  assert.equal(result.passed, false);
  assert.equal(result.transactionId, null);
  assert.equal(result.attemptStatus, "unknown");
});

test("buildAttemptResult handles missing data gracefully", () => {
  const result = buildAttemptResult({}, {});

  assert.equal(result.passed, false);
  assert.equal(result.transactionId, null);
  assert.equal(result.attemptId, "");
  assert.equal(result.message, "Attempt status read successfully.");
});
