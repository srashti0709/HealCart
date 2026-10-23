/**
 * Pure helpers for classifying and formatting order information shown in the
 * Admin Orders panel. All functions are read-only and never infer payment
 * state beyond what the backend actually records.
 */

/**
 * Returns true only when the order's durable backend record confirms payment
 * as paid AND the order has been placed (stock deducted). Never true based
 * on pending/unknown/failed status alone.
 */
export const isOrderVerifiedPaid = (order) => {
  if (!order || typeof order !== "object") {
    return false;
  }

  const paymentStatus = String(order.paymentStatus || "unknown").toLowerCase();
  const orderStatus = String(order.orderStatus || "placed").toLowerCase();

  return paymentStatus === "paid" && orderStatus === "placed";
};

/**
 * Returns true when the order is definitively failed (payment failed or
 * order cancelled).
 */
export const isOrderDefinitivelyFailed = (order) => {
  if (!order || typeof order !== "object") {
    return false;
  }

  const paymentStatus = String(order.paymentStatus || "unknown").toLowerCase();
  const orderStatus = String(order.orderStatus || "placed").toLowerCase();

  return paymentStatus === "failed" || orderStatus === "cancelled";
};

/**
 * Returns a customer-safe display label for an order's payment status.
 * Never fabricates "paid" unless the backend record actually says so.
 */
export const paymentStatusLabel = (order) => {
  if (!order || typeof order !== "object") {
    return "Unknown";
  }

  const paymentStatus = order.paymentStatus
    ? String(order.paymentStatus).toLowerCase()
    : null;

  switch (paymentStatus) {
    case "paid":
      return "Paid";
    case "failed":
      return "Failed";
    case "pending":
      return "Pending";
    case "unknown":
      return "Uncertain";
    default:
      return "Unknown";
  }
};

/**
 * Returns a customer-safe display label for an order's status.
 */
export const orderStatusLabel = (order) => {
  if (!order || typeof order !== "object") {
    return "Placed";
  }

  const orderStatus = String(order.orderStatus || "placed").toLowerCase();

  switch (orderStatus) {
    case "placed":
      return "Placed";
    case "processing":
      return "Processing";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return orderStatus.charAt(0).toUpperCase() + orderStatus.slice(1);
  }
};

/**
 * Formats a total amount as an Indian rupee string.
 */
export const formatOrderAmount = (amount = 0) => {
  const value = Number(amount) || 0;

  return `₹${value.toFixed(2).toLocaleString("en-IN")}`;
};

/**
 * Formats an ISO timestamp to a human-readable string.
 */
export const formatOrderDate = (date) => {
  if (!date) return "—";

  try {
    return new Date(date).toLocaleString();
  } catch {
    return "—";
  }
};
