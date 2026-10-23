const mongoose = require("mongoose");
const Product = require("../models/Product");
const Order = require("../models/Order");
const { recordIncident } = require("../services/incidentService");
const {
  deductStockForOrder,
  requestLowStockRestocks,
} = require("../services/orderInventoryService");
const {
  buildPaymentAttemptId,
  recordPaymentAttempt,
} = require("../services/paymentAttemptService");

const PAYMENT_SERVICE_URL =
  process.env.PAYMENT_SERVICE_URL || "http://localhost:5001";



const verifyPayment = async (orderId, amount) => {
  try {
    const response = await fetch(
      `${PAYMENT_SERVICE_URL}/status/${encodeURIComponent(orderId)}`,
      { signal: AbortSignal.timeout(3000) }
    );

    if (!response.ok) {
      return { outcome: "unknown" };
    }

    const payment = await response.json();

    if (
      payment.paymentStatus === "paid" &&
      payment.success === true &&
      payment.orderId === orderId &&
      payment.amount === amount &&
      typeof payment.transactionId === "string"
    ) {
      return { outcome: "paid", payment };
    }

    if (
      payment.paymentStatus === "failed" &&
      payment.orderId === orderId &&
      payment.amount === amount
    ) {
      return { outcome: "failed", payment };
    }

    return { outcome: "unknown" };
  } catch {
    return { outcome: "unknown" };
  }
};

const placeOrder = async (req, res) => {
  const { items, checkoutId } = req.body;

  if (!checkoutId || typeof checkoutId !== "string") {
    return res.status(400).json({
      success: false,
      message: "A checkoutId is required",
    });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Cart is empty",
    });
  }

  let order;

  try {
    const existingOrder = await Order.findOne({ checkoutId });

    if (existingOrder) {
      return res.status(409).json({
        success: false,
        message: "This checkout has already been processed or attempted",
        order: existingOrder,
      });
    }

    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        const orderItems = [];
        let totalAmount = 0;

        for (const item of items) {
          const quantity = Number(item.quantity);

          if (
            !mongoose.isValidObjectId(item.productId) ||
            !Number.isSafeInteger(quantity) ||
            quantity < 1
          ) {
            throw new Error("Invalid product or quantity");
          }

          const product = await Product.findById(item.productId).session(session);

          if (!product) {
            throw new Error(`Product not found: ${item.productId}`);
          }

          if (product.stock < quantity) {
            throw new Error(
              `Product unavailable or insufficient stock: ${item.productId}`
            );
          }

          orderItems.push({
            product: product._id,
            name: product.name,
            price: product.price,
            quantity,
          });

          totalAmount += product.price * quantity;
        }

        [order] = await Order.create(
          [
            {
              checkoutId,
              items: orderItems,
              totalAmount,
              paymentStatus: "pending",
              orderStatus: "processing",
            },
          ],
          { session }
        );

        await recordPaymentAttempt(
          {
            attemptId: buildPaymentAttemptId(order._id),
            checkoutId,
            order: order._id,
            amount: order.totalAmount,
            status: "pending",
          },
          { session }
        );
      });
    } finally {
      await session.endSession();
    }
  } catch (error) {
    console.error("Order creation failed:", error.message);

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  let paymentResult = { outcome: "unknown" };
  let paymentError = "Payment response could not be verified";

  try {
    const response = await fetch(`${PAYMENT_SERVICE_URL}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: order._id.toString(),
        amount: order.totalAmount,
      }),
      signal: AbortSignal.timeout(5000),
    });

    const payment = await response.json().catch(() => null);

    if (
      payment?.success === true &&
      payment.paymentStatus === "paid" &&
      payment.orderId === order._id.toString() &&
      payment.amount === order.totalAmount &&
      typeof payment.transactionId === "string"
    ) {
      paymentResult = { outcome: "paid", payment };
    } else if (
      payment?.paymentStatus === "failed" &&
      payment.orderId === order._id.toString() &&
      payment.amount === order.totalAmount
    ) {
      paymentResult = { outcome: "failed", payment };
      paymentError = payment.message || "Payment failed";
    } else {
      paymentError = payment?.message || "Payment outcome is uncertain";
    }
  } catch (error) {
    paymentError = error.message || "Payment request timed out";
  }

  if (paymentResult.outcome === "unknown") {
    paymentResult = await verifyPayment(
      order._id.toString(),
      order.totalAmount
    );
  }

  if (paymentResult.outcome === "paid") {
    const attempt = await recordPaymentAttempt({
      attemptId: buildPaymentAttemptId(order._id),
      checkoutId,
      order: order._id,
      amount: order.totalAmount,
      status: "paid",
      transactionId: paymentResult.payment.transactionId,
    });

    if (attempt.status === "paid") {
      try {
        const session = await mongoose.startSession();

        try {
          await session.withTransaction(async () => {
            await deductStockForOrder(order, session);
          });
        } finally {
          await session.endSession();
        }

        order.paymentStatus = attempt.status;
        order.orderStatus = "placed";
        await order.save();
        await requestLowStockRestocks(order.items);

        await recordIncident({
          incidentType: "payment_timeout_recovery",
          service: "payment-service",
          severity: "medium",
          status: "resolved",
          message: "Payment was verified after an uncertain response.",
          recoveryAction: "Verified the existing payment transaction",
          recoveryResult: "Payment confirmed; stock was deducted after confirmation",
          resolvedAt: new Date(),
        });

        return res.status(201).json({
        success: true,
        message: "Order placed and payment verified successfully",
        recovery: {
          type: "payment_timeout_recovery",
          detected: true,
          status: "resolved",
          action: "Verified the existing payment transaction",
          result: "Payment confirmed; stock was deducted after confirmation",
        },
        order,
        payment: {
          transactionId: paymentResult.payment.transactionId,
          status: "paid",
        },
      });
      } catch (error) {
        await recordIncident({
          incidentType: "payment_stock_commit_failure",
          service: "backend",
          severity: "critical",
          status: "failed",
          message: "Payment was confirmed, but stock allocation failed.",
          recoveryAction: "Keep the order pending for manual reconciliation",
          recoveryResult: error.message,
        });

        order.paymentStatus = "unknown";
        order.orderStatus = "processing";
        await order.save().catch(() => {});

        return res.status(409).json({
          success: false,
          paymentStatus: "unknown",
          message: "Payment succeeded, but stock could not be reserved. Please check your order status before retrying.",
          orderId: order._id,
        });
      }
    }
  }

  if (paymentResult.outcome === "failed") {
    const attempt = await recordPaymentAttempt({
      attemptId: buildPaymentAttemptId(order._id),
      checkoutId,
      order: order._id,
      amount: order.totalAmount,
      status: "failed",
      failureReason: paymentError,
    });

    if (attempt.status === "failed") {
      try {
        const session = await mongoose.startSession();

        try {
          await session.withTransaction(async () => {
            await Order.findOneAndUpdate(
              {
                _id: order._id,
                paymentStatus: "pending",
              },
              {
                $set: {
                  paymentStatus: "failed",
                  orderStatus: "cancelled",
                },
              },
              { new: true, session }
            );
          });
        } finally {
          await session.endSession();
        }

        order = await Order.findById(order._id);

        await recordIncident({
          incidentType: "payment_failure_recovery",
          service: "payment-service",
          severity: "medium",
          status: "resolved",
          message: paymentError,
          recoveryAction: "Cancelled failed order without touching stock that was never confirmed",
          recoveryResult: "Payment failure confirmed; no stock was deducted",
          resolvedAt: new Date(),
        });

        return res.status(502).json({
          success: false,
          message: "Payment failed. Please check your order status before retrying.",
          order,
        });
      } catch (error) {
        await recordIncident({
          incidentType: "payment_failure_order_update_failure",
          service: "backend",
          severity: "critical",
          status: "failed",
          message: error.message,
          recoveryAction: "Review the failed payment order manually",
          recoveryResult: "Automatic cancellation could not be confirmed",
        });

        return res.status(500).json({
          success: false,
          message: "Payment failed, but order cancellation needs review.",
          orderId: order._id,
        });
      }
    }
  }

  const unknownAttempt = await recordPaymentAttempt({
    attemptId: buildPaymentAttemptId(order._id),
    checkoutId,
    order: order._id,
    amount: order.totalAmount,
    status: "unknown",
    failureReason: paymentError,
  });

  try {
    order.paymentStatus = unknownAttempt.status;
    await order.save();
  } catch (error) {
    console.error("Failed to save uncertain payment state:", error.message);
  }

  await recordIncident({
    incidentType: "payment_status_uncertain",
    service: "payment-service",
    severity: "high",
    status: "detected",
    order: order._id,
    message: paymentError,
    recoveryAction: "Verify payment status before retrying",
    recoveryResult: "Outcome unknown; no stock was deducted while pending",
  });

  return res.status(202).json({
    success: false,
    paymentStatus: "unknown",
    message: "Payment is being verified. Do not retry checkout or pay again yet.",
    orderId: order._id,
    order: { _id: order._id },
  });
};

const getOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("items.product", "name price")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, orders });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = { placeOrder, getOrders };
