const Restock = require("../models/Restock");
const Product = require("../models/Product");
const { recordIncident } = require("./incidentService");

/**
 * Inventory operations that belong to a confirmed order.
 *
 * The reconciliation phase has to reserve stock exactly like the checkout
 * path does, so both use these helpers.
 */

const LOW_STOCK_THRESHOLD = 2;
const RESTOCK_QUANTITY = 10;

/**
 * Deducts the ordered quantities. The update is conditional on the stock
 * still being sufficient, so concurrent orders cannot oversell a product.
 */
const deductStockForOrder = async (order, session = null, { ProductModel = Product } = {}) => {
  for (const item of order.items) {
    const product = await ProductModel.findOneAndUpdate(
      {
        _id: item.product,
        stock: { $gte: item.quantity },
      },
      { $inc: { stock: -item.quantity } },
      { new: true, session }
    );

    if (!product) {
      throw new Error(`Insufficient stock for product ${item.product}`);
    }
  }
};

/**
 * Creates a restock request for every ordered product that fell to the low
 * stock threshold.
 */
const requestLowStockRestocks = async (orderItems, { ProductModel = Product, RestockModel = Restock } = {}) => {
  try {
    const productIds = [
      ...new Set(orderItems.map((item) => item.product.toString())),
    ];

    for (const productId of productIds) {
      const product = await ProductModel.findById(productId);

      if (!product || product.stock > LOW_STOCK_THRESHOLD) {
        continue;
      }

      const existingRequest = await RestockModel.findOne({
        product: product._id,
        status: "requested",
      });

      if (existingRequest) {
        continue;
      }

      await RestockModel.create({
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

module.exports = {
  LOW_STOCK_THRESHOLD,
  RESTOCK_QUANTITY,
  deductStockForOrder,
  requestLowStockRestocks,
};
