const mongoose = require("mongoose");
const PaymentAttempt = require("../models/PaymentAttempt");
const Order = require("../models/Order");
const Product = require("../models/Product");
const Incident = require("../models/Incident");
const { recordIncident } = require("./incidentService");
const {
  deductStockForOrder,
  requestLowStockRestocks,
} = require("./orderInventoryService");

/**
 * Reconciliation of payment attempts whose outcome could not be observed.
 *
 * A payment attempt is only resolved when the payment service can prove the
 * outcome. A missing transaction, a timeout or an unavailable service leave
 * the attempt untouched, because none of them prove that the payment failed.
 *
 * Finalization is idempotent. The attempt is claimed with a conditional
 * update, so only one worker can ever move it, and the stock deduction and
 * the order update run in the same database transaction as that claim.
 */

const PAYMENT_SERVICE_URL =
  process.env.PAYMENT_SERVICE_URL || "http://localhost:5001";

const RECONCILIATION_OUTCOMES = {
  PAID: "paid",
  FAILED: "failed",
  PENDING: "pending",
  NOT_FOUND: "not_found",
  TIMEOUT: "timeout",
  UNAVAILABLE: "unavailable",
};

const RESOLVABLE_STATUSES = ["pending", "unknown"];

const isTimeoutError = (error) =>
  error?.name === "TimeoutError" ||
  error?.code === "ETIMEDOUT" ||
  error?.code === "ECONNABORTED" ||
  error?.code === "UND_ERR_HEADERS_TIMEOUT";

/**
 * Classifies a payment service status payload. An HTTP success alone never
 * proves a paid payment: the recorded transaction has to say so.
 */
const classifyPaymentStatus = (payment) => {
  if (!payment || typeof payment !== "object") {
    return { outcome: RECONCILIATION_OUTCOMES.PENDING, reason: "unreadable" };
  }

  if (
    payment.paymentStatus === "paid" &&
    payment.success === true &&
    typeof payment.transactionId === "string"
  ) {
    return { outcome: RECONCILIATION_OUTCOMES.PAID, payment };
  }

  if (payment.paymentStatus === "failed") {
    return { outcome: RECONCILIATION_OUTCOMES.FAILED, payment };
  }

  return {
    outcome: RECONCILIATION_OUTCOMES.PENDING,
    payment,
    reason: "not_final",
  };
};

/**
 * Reads the durable transaction record of an attempt from the payment service.
 */
const fetchPaymentStatus = async (orderId, { timeoutMs = 4000 } = {}) => {
  try {
    const response = await fetch(
      `${PAYMENT_SERVICE_URL}/status/${encodeURIComponent(orderId)}`,
      { signal: AbortSignal.timeout(timeoutMs) }
    );

    if (response.status === 404) {
      return {
        outcome: RECONCILIATION_OUTCOMES.NOT_FOUND,
        reason: "The payment service has no record of this payment.",
      };
    }

    if (!response.ok) {
      return {
        outcome: RECONCILIATION_OUTCOMES.UNAVAILABLE,
        reason: `The payment service answered with HTTP ${response.status}.`,
      };
    }

    const payment = await response.json().catch(() => null);

    return classifyPaymentStatus(payment);
  } catch (error) {
    if (isTimeoutError(error)) {
      return {
        outcome: RECONCILIATION_OUTCOMES.TIMEOUT,
        reason: "The payment service did not answer in time.",
      };
    }

    return {
      outcome: RECONCILIATION_OUTCOMES.UNAVAILABLE,
      reason: "The payment service could not be reached.",
    };
  }
};

/**
 * Runs a callback inside a database transaction.
 */
const runInTransaction = async (callback) => {
  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      result = await callback(session);
    });

    return result;
  } finally {
    await session.endSession();
  }
};

/**
 * Resolves the uncertainty incident of an order, but only after the payment
 * outcome and the order finalization have been verified.
 */
const resolveUncertaintyIncident = async (
  orderId,
  { IncidentModel = Incident, resolution } = {}
) => {
  const incidents = await IncidentModel.find({
    incidentType: "payment_status_uncertain",
    order: orderId,
    status: { $in: ["detected", "recovering"] },
  });

  for (const incident of incidents) {
    incident.status = "resolved";
    incident.resolvedAt = new Date();
    incident.recoveryAction = resolution.recoveryAction;
    incident.recoveryResult = resolution.recoveryResult;

    await incident.save();
  }

  return incidents.length;
};

/**
 * Finalizes a payment attempt that the payment service proves was paid.
 *
 * The attempt claim, the stock deduction and the order update run in one
 * transaction, so a failure leaves the attempt unresolved instead of
 * producing a paid order without stock.
 */
const finalizePaidAttempt = async (
  attempt,
  payment,
  {
    PaymentAttemptModel = PaymentAttempt,
    OrderModel = Order,
    ProductModel = Product,
    session,
  } = {}
) => {
  const order = await OrderModel.findById(attempt.order).session(session);

  if (!order) {
    return { finalized: false, reason: "order_missing" };
  }

  const claimed = await PaymentAttemptModel.findOneAndUpdate(
    { attemptId: attempt.attemptId, status: { $in: RESOLVABLE_STATUSES } },
    {
      $set: {
        status: "paid",
        transactionId: payment.transactionId,
        failureReason: null,
      },
    },
    { new: true, session }
  );

  if (!claimed) {
    return { finalized: false, reason: "already_resolved" };
  }

  await deductStockForOrder(order, session, { ProductModel });

  const updatedOrder = await OrderModel.findOneAndUpdate(
    { _id: order._id, paymentStatus: { $in: RESOLVABLE_STATUSES } },
    { $set: { paymentStatus: "paid", orderStatus: "placed" } },
    { new: true, session }
  );

  if (!updatedOrder) {
    const conflict = new Error(
      "The order was already finalized while the payment was being confirmed."
    );
    conflict.code = "ORDER_ALREADY_FINALIZED";

    throw conflict;
  }

  return { finalized: true, order: updatedOrder, attempt: claimed };
};

/**
 * Resolves an attempt that the payment service proves has failed. No stock
 * was reserved for a failed payment, so nothing is restored.
 */
const finalizeFailedAttempt = async (
  attempt,
  payment,
  { PaymentAttemptModel = PaymentAttempt, OrderModel = Order } = {}
) => {
  const claimed = await PaymentAttemptModel.findOneAndUpdate(
    { attemptId: attempt.attemptId, status: { $in: RESOLVABLE_STATUSES } },
    {
      $set: {
        status: "failed",
        failureReason: payment?.message || payment?.reason || "Payment failed",
      },
    },
    { new: true }
  );

  if (!claimed) {
    return { finalized: false, reason: "already_resolved" };
  }

  const order = await OrderModel.findOneAndUpdate(
    { _id: attempt.order, paymentStatus: { $in: RESOLVABLE_STATUSES } },
    { $set: { paymentStatus: "failed", orderStatus: "cancelled" } },
    { new: true }
  );

  return { finalized: true, order };
};

/**
 * Reconciles the payment attempts whose outcome is not known yet.
 *
 * Only attempts that are pending or unknown are read, they are read in small
 * batches and the payment service is asked once per attempt. An attempt is
 * resolved only on reliable evidence.
 */
const reconcilePaymentAttempts = async (options = {}) => {
  const {
    PaymentAttemptModel = PaymentAttempt,
    OrderModel = Order,
    ProductModel = Product,
    IncidentModel = Incident,
    statusProbe = fetchPaymentStatus,
    withTransaction = runInTransaction,
    recordIncidentFn = recordIncident,
    limit = 25,
  } = options;

  const attempts = await PaymentAttemptModel.find({
    status: { $in: RESOLVABLE_STATUSES },
  })
    .sort({ updatedAt: 1 })
    .limit(limit)
    .lean();

  const summary = {
    examined: attempts.length,
    resolvedPaid: 0,
    resolvedFailed: 0,
    unresolved: 0,
    skipped: 0,
    results: [],
  };

  for (const attempt of attempts) {
    const probe = await statusProbe(attempt.attemptId);

    if (probe.outcome === RECONCILIATION_OUTCOMES.PAID) {
      let outcome = null;

      try {
        outcome = await withTransaction((session) =>
          finalizePaidAttempt(attempt, probe.payment, {
            PaymentAttemptModel,
            OrderModel,
            ProductModel,
            session,
          })
        );
      } catch (error) {
        if (error?.message?.includes("Insufficient stock")) {
          await recordIncidentFn({
            incidentType: "payment_reconciliation_stock_unavailable",
            service: "backend",
            severity: "critical",
            status: "detected",
            order: attempt.order,
            message: `The payment for order ${attempt.attemptId} was confirmed but the stock is no longer available.`,
            recoveryAction: "Resolve the stock shortfall manually before retrying",
            recoveryResult: "The order was not finalized and no stock was deducted",
          });

          summary.unresolved += 1;
          summary.results.push({
            attemptId: attempt.attemptId,
            outcome: "stock_unavailable",
          });

          continue;
        }

        summary.unresolved += 1;
        summary.results.push({
          attemptId: attempt.attemptId,
          outcome: "error",
          reason: error.message,
        });

        continue;
      }

      if (!outcome.finalized) {
        summary.skipped += 1;
        summary.results.push({
          attemptId: attempt.attemptId,
          outcome: outcome.reason,
        });

        continue;
      }

      await requestLowStockRestocks(outcome.order.items, { ProductModel });

      const resolvedIncidents = await resolveUncertaintyIncident(
        attempt.order,
        {
          IncidentModel,
          resolution: {
            recoveryAction: "Verified the durable payment transaction",
            recoveryResult:
              "Payment confirmed; stock was deducted after confirmation",
          },
        }
      );

      summary.resolvedPaid += 1;
      summary.results.push({
        attemptId: attempt.attemptId,
        outcome: RECONCILIATION_OUTCOMES.PAID,
        transactionId: outcome.attempt.transactionId,
        resolvedIncidents,
      });

      continue;
    }

    if (probe.outcome === RECONCILIATION_OUTCOMES.FAILED) {
      const outcome = await finalizeFailedAttempt(attempt, probe.payment, {
        PaymentAttemptModel,
        OrderModel,
      });

      if (!outcome.finalized) {
        summary.skipped += 1;
        summary.results.push({
          attemptId: attempt.attemptId,
          outcome: outcome.reason,
        });

        continue;
      }

      const resolvedIncidents = await resolveUncertaintyIncident(
        attempt.order,
        {
          IncidentModel,
          resolution: {
            recoveryAction: "Confirmed the failed payment transaction",
            recoveryResult:
              "Payment failure confirmed; no stock was deducted and the order was cancelled",
          },
        }
      );

      summary.resolvedFailed += 1;
      summary.results.push({
        attemptId: attempt.attemptId,
        outcome: RECONCILIATION_OUTCOMES.FAILED,
        resolvedIncidents,
      });

      continue;
    }

    // No reliable evidence: the attempt stays unresolved.
    summary.unresolved += 1;
    summary.results.push({
      attemptId: attempt.attemptId,
      outcome: probe.outcome,
      reason: probe.reason,
    });
  }

  return summary;
};

module.exports = {
  RECONCILIATION_OUTCOMES,
  RESOLVABLE_STATUSES,
  classifyPaymentStatus,
  fetchPaymentStatus,
  runInTransaction,
  reconcilePaymentAttempts,
  finalizePaidAttempt,
  finalizeFailedAttempt,
  resolveUncertaintyIncident,
};
