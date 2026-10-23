const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isOrderVerifiedPaid,
  isOrderDefinitivelyFailed,
  paymentStatusLabel,
  orderStatusLabel,
  formatOrderAmount,
  formatOrderDate,
} = require("../../frontend/src/lib/orderStatus.js");

test("isOrderVerifiedPaid returns true only for paid + placed orders", () => {
  assert.equal(
    isOrderVerifiedPaid({ paymentStatus: "paid", orderStatus: "placed" }),
    true
  );
  assert.equal(
    isOrderVerifiedPaid({ paymentStatus: "paid", orderStatus: "processing" }),
    false
  );
  assert.equal(
    isOrderVerifiedPaid({ paymentStatus: "unknown", orderStatus: "placed" }),
    false
  );
  assert.equal(
    isOrderVerifiedPaid({ paymentStatus: "failed", orderStatus: "cancelled" }),
    false
  );
  assert.equal(isOrderVerifiedPaid({}), false);
  assert.equal(isOrderVerifiedPaid(null), false);
  assert.equal(isOrderVerifiedPaid(undefined), false);
});

test("isOrderDefinitivelyFailed returns true for failed or cancelled orders", () => {
  assert.equal(
    isOrderDefinitivelyFailed({ paymentStatus: "failed", orderStatus: "placed" }),
    true
  );
  assert.equal(
    isOrderDefinitivelyFailed({ paymentStatus: "paid", orderStatus: "cancelled" }),
    true
  );
  assert.equal(
    isOrderDefinitivelyFailed({ paymentStatus: "unknown", orderStatus: "processing" }),
    false
  );
  assert.equal(isOrderDefinitivelyFailed({}), false);
});

test("paymentStatusLabel never fabricates paid status", () => {
  assert.equal(paymentStatusLabel({ paymentStatus: "paid" }), "Paid");
  assert.equal(paymentStatusLabel({ paymentStatus: "failed" }), "Failed");
  assert.equal(paymentStatusLabel({ paymentStatus: "pending" }), "Pending");
  assert.equal(paymentStatusLabel({ paymentStatus: "unknown" }), "Uncertain");
  assert.equal(paymentStatusLabel({}), "Unknown");
  assert.equal(paymentStatusLabel(null), "Unknown");
  assert.equal(paymentStatusLabel(undefined), "Unknown");
});

test("orderStatusLabel formats order status", () => {
  assert.equal(orderStatusLabel({ orderStatus: "placed" }), "Placed");
  assert.equal(orderStatusLabel({ orderStatus: "processing" }), "Processing");
  assert.equal(orderStatusLabel({ orderStatus: "completed" }), "Completed");
  assert.equal(orderStatusLabel({ orderStatus: "cancelled" }), "Cancelled");
  assert.equal(orderStatusLabel({}), "Placed");
});

test("formatOrderAmount formats amounts as Indian rupees", () => {
  assert.equal(formatOrderAmount(1299), "₹1299.00");
  assert.equal(formatOrderAmount(0), "₹0.00");
  assert.equal(formatOrderAmount(2499.5), "₹2499.50");
  assert.equal(formatOrderAmount(null), "₹0.00");
});

test("formatOrderDate handles missing dates gracefully", () => {
  assert.equal(formatOrderDate(null), "—");
  assert.equal(formatOrderDate(undefined), "—");
  assert.equal(formatOrderDate(""), "—");
  assert.equal(formatOrderDate("2026-10-22T10:00:00.000Z").length > 0, true);
});
