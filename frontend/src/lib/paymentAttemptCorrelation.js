/**
 * Pure helpers for correlating a payment response-lost scenario with the
 * latest order and its payment attempt status. All functions are read-only:
 * they never create orders, never start payments, never touch stock and
 * never modify the ledger.
 */

/**
 * Finds the latest order whose payment outcome is still uncertain or has
 * been confirmed. Orders are expected to be sorted newest first.
 *
 * Returns the matching order or null when none is found.
 */
export const findLatestUncertainOrder = (orders = []) => {
  if (!Array.isArray(orders)) {
    return null;
  }

  return (
    orders.find(
      (order) =>
        order &&
        (order.paymentStatus === "unknown" ||
          order.paymentStatus === "paid" ||
          order.paymentStatus === "pending")
    ) || null
  );
};

/**
 * Builds a customer-safe attempt status result from the attempt lookup
 * response and the matching order.
 *
 * Never fabricates a transaction ID or a success outcome. A result is only
 * marked as passed when the attempt or order actually reports "paid".
 */
export const buildAttemptResult = (attemptData = {}, order = {}) => {
  const attempt = attemptData.attempt || {};
  const orderStatus = order || {};

  const details = [];

  const attemptId = attemptData.order
    ? String(attemptData.order.id || "")
    : "";

  if (attempt.status) {
    details.push(`Attempt status: ${attempt.status}.`);
  } else if (attemptData.status) {
    details.push(`Attempt status: ${attemptData.status}.`);
  }

  if (orderStatus.paymentStatus) {
    details.push(`Order payment status: ${orderStatus.paymentStatus}.`);
  }

  if (attempt.transactionId) {
    details.push(`Transaction ID: ${attempt.transactionId}.`);
  }

  const passed =
    attempt.status === "paid" ||
    attemptData.status === "paid" ||
    orderStatus.paymentStatus === "paid";

  return {
    passed,
    message:
      details.length > 0
        ? details.join(" ")
        : "Attempt status read successfully.",
    details,
    attemptId,
    transactionId: attempt.transactionId || null,
    orderPaymentStatus: orderStatus.paymentStatus || null,
    attemptStatus: attempt.status || attemptData.status || null,
  };
};
