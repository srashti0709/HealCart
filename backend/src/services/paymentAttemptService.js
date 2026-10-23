const PaymentAttempt = require("../models/PaymentAttempt");

/**
 * Payment attempt state rules.
 *
 * The attempt record is the authoritative record of a payment. The order
 * mirrors it, so the two never disagree.
 */

const PAYMENT_ATTEMPT_STATUSES = ["pending", "paid", "failed", "unknown"];

/**
 * "pending" is the state of a created attempt, "unknown" is a payment whose
 * outcome could not be observed. Both can still be resolved later, which is
 * what the recovery phase needs. "paid" and "failed" are final.
 */
const ALLOWED_PAYMENT_ATTEMPT_TRANSITIONS = {
  pending: ["paid", "failed", "unknown"],
  unknown: ["paid", "failed", "unknown"],
  paid: [],
  failed: [],
};

/**
 * True when the attempt may move from one status to another.
 */
const canTransitionPaymentAttempt = (from, to) => {
  if (!PAYMENT_ATTEMPT_STATUSES.includes(from)) return false;
  if (!PAYMENT_ATTEMPT_STATUSES.includes(to)) return false;
  if (from === to) return true;

  return (ALLOWED_PAYMENT_ATTEMPT_TRANSITIONS[from] || []).includes(to);
};

/**
 * The attempt id is the order id, which is already the idempotency key used
 * by the payment service, so no additional identifier is generated.
 */
const buildPaymentAttemptId = (orderId) => String(orderId);

/**
 * Creates or updates the durable payment attempt record.
 *
 * A duplicate attempt id never creates a second record: the existing attempt
 * is loaded instead. An illegal transition leaves the recorded outcome
 * untouched rather than overwriting it.
 */
const recordPaymentAttempt = async (
  { attemptId, checkoutId, order, amount, status, transactionId = null, failureReason = null },
  { session = null } = {}
) => {
  let attempt = await PaymentAttempt.findOne({ attemptId }).session(session);

  if (!attempt) {
    try {
      [attempt] = await PaymentAttempt.create(
        [
          {
            attemptId,
            checkoutId,
            order,
            amount,
            status,
            transactionId,
            failureReason,
          },
        ],
        { session }
      );

      return attempt;
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }

      attempt = await PaymentAttempt.findOne({ attemptId }).session(session);

      if (!attempt) {
        throw error;
      }
    }
  }

  if (!canTransitionPaymentAttempt(attempt.status, status)) {
    return attempt;
  }

  attempt.status = status;

  if (transactionId) {
    attempt.transactionId = transactionId;
  }

  if (failureReason) {
    attempt.failureReason = failureReason;
  }

  await attempt.save({ session });

  return attempt;
};

module.exports = {
  PAYMENT_ATTEMPT_STATUSES,
  ALLOWED_PAYMENT_ATTEMPT_TRANSITIONS,
  canTransitionPaymentAttempt,
  buildPaymentAttemptId,
  recordPaymentAttempt,
};
