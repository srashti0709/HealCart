
const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    checkoutId: {
      type: String,
      unique: true,
      sparse: true,
    },
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        name: {
          type: String,
          required: true,
        },
        price: {
          type: Number,
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
      },
    ],
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "unknown"],
      default: "pending",
    },
    orderStatus: {
      type: String,
      enum: ["placed", "processing", "completed", "cancelled"],
      default: "placed",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
