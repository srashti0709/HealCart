const Restock = require("../models/Restock");
const mongoose = require("mongoose");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Incident = require("../models/Incident");

const PAYMENT_SERVICE_URL =
  process.env.PAYMENT_SERVICE_URL || "http://localhost:5001";

const recordIncident = async (data) => {
  try {
    await Incident.create(data);
  } catch (error) {
    console.error("Failed to record incident:", error.message);
  }
};

const LOW_STOCK_THRESHOLD = 2;
const RESTOCK_QUANTITY = 10;

const requestLowStockRestocks = async (orderItems) => {
  try {
    const productIds = [
      ...new Set(orderItems.map((item) => item.product.toString())),
    ];

    for (const productId of productIds) {
      const product = await Product.findById(productId);

      if (!product || product.stock > LOW_STOCK_THRESHOLD) {
        continue;
      }

      const existingRequest = await Restock.findOne({
        product: product._id,
        status: "requested",
      });

      if (existingRequest) {
        continue;
      }

      await Restock.create({
        product: product._id,
        requestedQuantity: RESTOCK_QUANTITY,
      });

      await recordIncident({
        incidentType: "low_stock",
        service: "inventory-service",
        severity: "medium",
        status: "detected",
        message: `Low stock detected for ${product.name}.`,
        recoveryAction: "Created an automatic restock request",
        recoveryResult: "Awaiting delivery confirmation",
      });
    }
  } catch (error) {
    console.error("Automatic restock request failed:", error.message);
  }
};


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

          const product = await Product.findOneAndUpdate(
            {
              _id: item.productId,
              stock: { $gte: quantity },
            },
            { $inc: { stock: -quantity } },
            { new: true, session }
          );

          if (!product) {
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
    try {
      order.paymentStatus = "paid";
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
        recoveryResult: "Payment confirmed; stock reservation retained",
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
          result: "Payment confirmed; stock reservation retained",
        },
        order,
        payment: {
          transactionId: paymentResult.payment.transactionId,
          status: "paid",
        },
      });
    } catch (error) {
      await recordIncident({
        incidentType: "payment_order_update_failure",
        service: "backend",
        severity: "critical",
        status: "failed",
        message: "Payment was confirmed, but the order update failed.",
        recoveryAction: "Preserved stock reservation; order reconciliation required",
        recoveryResult: error.message,
      });

      return res.status(500).json({
        success: false,
        paymentStatus: "paid",
        message: "Payment succeeded, but order confirmation needs recovery. Do not pay again.",
        orderId: order._id,
      });
    }
  }

  if (paymentResult.outcome === "failed") {
    try {
      const session = await mongoose.startSession();

      try {
        await session.withTransaction(async () => {
          const failedOrder = await Order.findOneAndUpdate(
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

          if (failedOrder) {
            for (const item of failedOrder.items) {
              await Product.updateOne(
                { _id: item.product },
                { $inc: { stock: item.quantity } },
                { session }
              );
            }
          }
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
        recoveryAction: "Cancelled failed order and restored reserved stock",
        recoveryResult: "Payment failure confirmed; stock restoration completed",
        resolvedAt: new Date(),
      });

      return res.status(502).json({
        success: false,
        message: "Payment failed. Reserved stock has been restored.",
        order,
      });
    } catch (error) {
      await recordIncident({
        incidentType: "payment_stock_recovery_failure",
        service: "backend",
        severity: "critical",
        status: "failed",
        message: error.message,
        recoveryAction: "Retry stock reconciliation",
        recoveryResult: "Automatic restoration could not be confirmed",
      });

      return res.status(500).json({
        success: false,
        message: "Payment failed, but stock recovery needs attention.",
        orderId: order._id,
      });
    }
  }

  try {
    order.paymentStatus = "unknown";
    await order.save();
  } catch (error) {
    console.error("Failed to save uncertain payment state:", error.message);
  }

  await recordIncident({
    incidentType: "payment_status_uncertain",
    service: "payment-service",
    severity: "high",
    status: "detected",
    message: paymentError,
    recoveryAction: "Verify payment status before retrying",
    recoveryResult: "Outcome unknown; stock remains reserved",
  });

  return res.status(202).json({
    success: false,
    paymentStatus: "unknown",
    message: "Payment is being verified. Do not retry checkout or pay again yet.",
    orderId: order._id,
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
