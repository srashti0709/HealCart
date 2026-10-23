const PaymentAttempt = require("../models/PaymentAttempt");
const Order = require("../models/Order");

/**
 * Read-only payment attempt status.
 *
 * The endpoint answers what a customer needs to know about their own
 * checkout. It never reconciles a payment, never creates an attempt, never
 * changes an order, never touches stock and never closes an incident.
 *
 * Ownership: the application has no accounts and no sessions, so the checkout
 * id of the attempt is used as the capability that scopes the read. The
 * checkout id is the idempotency key the browser already generated and sent
 * when the order was placed, and it is stored on both the order and the
 * payment attempt. A request without it, or with the wrong one, cannot see
 * the attempt.
 *
 * The limitation is reported with the phase: the checkout id is a bearer
 * capability, so anyone who learns another checkout id could read that
 * checkout's attempt. The application has no stronger ownership handle.
 */

const ATTEMPT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const CHECKOUT_ID_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

const FINAL_STATUSES = ["paid", "failed"];

/**
 * The recorded outcome of an attempt.
 *
 * The attempt is the authoritative record. The order mirrors it, so the two
 * never disagree, but the order is used as the fallback for an attempt that
 * was never written. A state is only ever reported as paid or failed when it
 * was actually recorded, never when it was inferred.
 */
const resolveAttemptStatus = (attemptStatus, orderPaymentStatus) => {
  if (FINAL_STATUSES.includes(attemptStatus)) {
    return attemptStatus;
  }

  if (FINAL_STATUSES.includes(orderPaymentStatus)) {
    return orderPaymentStatus;
  }

  return attemptStatus || "unknown";
};

const getPaymentAttemptStatus = async (
  req,
  res,
  { PaymentAttemptModel = PaymentAttempt, OrderModel = Order } = {}
) => {
  const attemptId = req.params?.attemptId;

  if (typeof attemptId !== "string" || !ATTEMPT_ID_PATTERN.test(attemptId)) {
    return res.status(400).json({
      success: false,
      message: "The payment attempt id is not valid.",
    });
  }

  const checkoutId = req.get("x-checkout-id") || req.query?.checkoutId;

  if (
    typeof checkoutId !== "string" ||
    !CHECKOUT_ID_PATTERN.test(checkoutId)
  ) {
    return res.status(401).json({
      success: false,
      message: "A checkout id is required to read a payment attempt.",
    });
  }

  try {
    const attempt = await PaymentAttemptModel.findOne({
      attemptId,
      checkoutId,
    }).lean();

    // A missing attempt and an attempt that belongs to another checkout are
    // reported the same way, so the endpoint cannot be used to discover
    // another checkout's order.
    if (!attempt) {
      return res.status(404).json({
        success: false,
        message: "No payment attempt was found for this checkout.",
      });
    }

    const order = await OrderModel.findById(attempt.order)
      .select("paymentStatus orderStatus totalAmount")
      .lean();

    const status = resolveAttemptStatus(
      attempt.status,
      order?.paymentStatus
    );

    const resolved = FINAL_STATUSES.includes(status);

    return res.status(200).json({
      success: true,
      // The recorded outcome of the attempt, paid or failed only when the
      // backend actually holds that record.
      status,
      resolved,
      attempt: {
        attemptId: attempt.attemptId,
        status: attempt.status,
        amount: attempt.amount,
        updatedAt: attempt.updatedAt,
        // A transaction id is only meaningful once the payment is paid.
        ...(resolved && status === "paid" && attempt.transactionId
          ? { transactionId: attempt.transactionId }
          : {}),
      },
      order: order
        ? {
            id: String(order._id),
            paymentStatus: order.paymentStatus,
            orderStatus: order.orderStatus,
            totalAmount: order.totalAmount,
          }
        : null,
    });
  } catch (error) {
    console.error("Payment attempt lookup failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "The payment status could not be read.",
    });
  }
};

module.exports = {
  getPaymentAttemptStatus,
  resolveAttemptStatus,
  ATTEMPT_ID_PATTERN,
  CHECKOUT_ID_PATTERN,
};
