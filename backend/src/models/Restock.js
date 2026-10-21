
const mongoose = require("mongoose");

const restockSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    requestedQuantity: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ["requested", "delivered", "cancelled"],
      default: "requested",
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Restock", restockSchema);
