/**
 * Payment decision logic of the simulated payment service.
 *
 * It is kept separate from the HTTP layer so the behaviour around the durable
 * transaction ledger can be exercised without a running server.
 *
 * The rules:
 *  - A transaction is stored before a success is reported.
 *  - The order id is the transaction key, so a repeated request never performs
 *    a second independent payment.
 *  - A ledger problem is reported as an unknown outcome, never as a payment
 *    failure, because it proves nothing about the payment.
 */

const processPaymentRequest = async ({
  store,
  body,
  simulateFailure = false,
  simulateTimeout = false,
  now = () => new Date(),
} = {}) => {
  const { orderId, amount } = body || {};

  if (!orderId || typeof amount !== "number" || amount <= 0) {
    return {
      statusCode: 400,
      body: {
        success: false,
        message: "Valid order ID and amount are required",
      },
    };
  }

  let existing = null;

  try {
    existing = store.get(orderId);
  } catch (error) {
    return {
      statusCode: 503,
      body: {
        success: false,
        paymentStatus: "unknown",
        orderId,
        amount,
        message:
          "The payment ledger is unavailable, so the payment was not processed.",
      },
    };
  }

  if (existing) {
    if (existing.amount !== amount) {
      return {
        statusCode: 409,
        body: {
          success: false,
          message: "Order payment amount mismatch",
        },
      };
    }

    return { statusCode: 200, body: existing };
  }

  if (simulateFailure) {
    const failed = {
      success: false,
      paymentStatus: "failed",
      orderId,
      amount,
      message: "Simulated payment failure",
      reason: "Simulated payment failure",
    };

    try {
      store.record(failed);
    } catch (error) {
      return {
        statusCode: 503,
        body: {
          success: false,
          paymentStatus: "unknown",
          orderId,
          amount,
          message:
            "The payment ledger is unavailable, so the payment failure could not be recorded.",
        },
      };
    }

    return { statusCode: 503, body: failed };
  }

  const payment = {
    success: true,
    paymentStatus: "paid",
    transactionId: `SIM-${now().getTime()}-${orderId}`,
    orderId,
    amount,
    message: "Simulated payment successful",
  };

  try {
    store.record({
      ...payment,
      responseDelivered: !simulateTimeout,
      ...(simulateTimeout
        ? { reason: "Simulated timeout after payment processing" }
        : {}),
    });
  } catch (error) {
    return {
      statusCode: 503,
      body: {
        success: false,
        paymentStatus: "unknown",
        orderId,
        amount,
        message:
          "The payment ledger is unavailable, so the payment was not processed.",
      },
    };
  }

  if (simulateTimeout) {
    return {
      statusCode: 504,
      body: {
        success: false,
        paymentStatus: "unknown",
        orderId,
        amount,
        message: "Simulated timeout after payment processing",
      },
    };
  }

  return { statusCode: 200, body: payment };
};

/**
 * Reads the durable transaction record of an order.
 */
const getPaymentStatusRequest = async ({ store, orderId } = {}) => {
  let payment = null;

  try {
    payment = store.get(orderId);
  } catch (error) {
    return {
      statusCode: 503,
      body: {
        success: false,
        paymentStatus: "unknown",
        message: "The payment ledger is unavailable.",
      },
    };
  }

  if (!payment) {
    return {
      statusCode: 404,
      body: {
        success: false,
        paymentStatus: "unknown",
        message: "Payment transaction not found",
      },
    };
  }

  return { statusCode: 200, body: payment };
};

module.exports = { processPaymentRequest, getPaymentStatusRequest };
