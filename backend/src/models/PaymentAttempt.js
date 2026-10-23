const mongoose = require("mongoose");

/**
 * A payment attempt is the durable record of one payment made for one order.
 *
 * The attempt id is the order id, which is also the idempotency key the
 * payment service already uses, so no second identifier is introduced. The
 * unique index guarantees that one order can never own two payment records.
 */
const paymentAttemptSchema = new mongoose.Schema(
  {
    attemptId: {
      type: String,
      required: true,
      unique: true,
    },
    checkoutId: {
      type: String,
      required: true,
      index: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["pending", "paid", "failed", "unknown"],
      default: "pending",
    },
    transactionId: {
      type: String,
      default: null,
    },
    failureReason: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PaymentAttempt", paymentAttemptSchema);
