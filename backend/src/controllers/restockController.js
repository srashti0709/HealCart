
const mongoose = require("mongoose");
const Product = require("../models/Product");
const Restock = require("../models/Restock");
const Incident = require("../models/Incident");

const LOW_STOCK_THRESHOLD = 2;
const RESTOCK_QUANTITY = 10;

const requestRestock = async (req, res) => {
  try {
    const { productId } = req.body;

    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({
        success: false,
        message: "A valid product ID is required",
      });
    }

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    if (product.stock > LOW_STOCK_THRESHOLD) {
      return res.status(400).json({
        success: false,
        message: "Product stock is not low enough for restocking",
        currentStock: product.stock,
      });
    }

    const existingRequest = await Restock.findOne({
      product: product._id,
      status: "requested",
    });

    if (existingRequest) {
      return res.status(200).json({
        success: true,
        message: "A restock request already exists",
        restock: existingRequest,
        stock: product.stock,
      });
    }

    const restock = await Restock.create({
      product: product._id,
      requestedQuantity: RESTOCK_QUANTITY,
    });

    await Incident.create({
      incidentType: "low_stock",
      service: "inventory-service",
      severity: "medium",
      status: "detected",
      message: `Low stock detected for ${product.name}.`,
      recoveryAction: "Created a simulated restock request",
      recoveryResult: "Awaiting delivery confirmation",
    });

    return res.status(201).json({
      success: true,
      message: "Restock requested. Stock has not been changed.",
      restock,
      stock: product.stock,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const confirmDelivery = async (req, res) => {
  const { restockId } = req.params;

  if (!mongoose.isValidObjectId(restockId)) {
    return res.status(400).json({
      success: false,
      message: "A valid restock ID is required",
    });
  }

  const session = await mongoose.startSession();

  try {
    let updatedProduct;
    let deliveredRestock;

    await session.withTransaction(async () => {
      const restock = await Restock.findOneAndUpdate(
        { _id: restockId, status: "requested" },
        { $set: { status: "delivered", deliveredAt: new Date() } },
        { new: true, session }
      );

      if (!restock) {
        const existing = await Restock.findById(restockId).session(session);

        if (!existing) {
          throw new Error("RESTOCK_NOT_FOUND");
        }

        if (existing.status === "delivered") {
          throw new Error("DELIVERY_ALREADY_CONFIRMED");
        }

        throw new Error("RESTOCK_NOT_REQUESTED");
      }

      updatedProduct = await Product.findByIdAndUpdate(
        restock.product,
        { $inc: { stock: restock.requestedQuantity } },
        { new: true, session, runValidators: true }
      );

      if (!updatedProduct) {
        throw new Error("PRODUCT_NOT_FOUND");
      }

      deliveredRestock = restock;
    });

    await Incident.create({
      incidentType: "automatic_restock_recovery",
      service: "inventory-service",
      severity: "low",
      status: "resolved",
      message: `Restock delivery confirmed for ${updatedProduct.name}.`,
      recoveryAction: "Added delivered quantity to product stock",
      recoveryResult: `Stock increased by ${deliveredRestock.requestedQuantity}; current stock is ${updatedProduct.stock}.`,
      resolvedAt: new Date(),
    });

    return res.status(200).json({
      success: true,
      message: "Delivery confirmed and stock updated",
      restock: deliveredRestock,
      product: updatedProduct,
    });
  } catch (error) {
    if (error.message === "RESTOCK_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Restock request not found",
      });
    }

    if (error.message === "DELIVERY_ALREADY_CONFIRMED") {
      return res.status(409).json({
        success: false,
        message: "Delivery has already been confirmed; stock was not changed again",
      });
    }

    if (error.message === "RESTOCK_NOT_REQUESTED") {
      return res.status(409).json({
        success: false,
        message: "This restock request is not awaiting delivery",
      });
    }

    if (error.message === "PRODUCT_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Product not found; no stock update was committed",
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  } finally {
    await session.endSession();
  }
};

const getRestockRequests = async (req, res) => {
  try {
    const restocks = await Restock.find()
      .populate("product", "name price stock image")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: restocks.length,
      restocks,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const cleanupOrphanedRestocks = async (req, res) => {
  try {
    const restocks = await Restock.find().select("_id product");
    const productIds = [
      ...new Set(
        restocks
          .filter((restock) => restock.product)
          .map((restock) => restock.product.toString())
      ),
    ];

    const existingProducts = await Product.find({
      _id: { $in: productIds },
    }).distinct("_id");

    const existingIds = new Set(
      existingProducts.map((id) => id.toString())
    );

    const orphanedIds = restocks
      .filter(
        (restock) =>
          !restock.product ||
          !existingIds.has(restock.product.toString())
      )
      .map((restock) => restock._id);

    const result = await Restock.deleteMany({
      _id: { $in: orphanedIds },
    });

    return res.status(200).json({
      success: true,
      deletedCount: result.deletedCount,
      message: "Orphaned restock records cleaned up",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const cancelRestockRequest = async (req, res) => {
  try {
    const restock = await Restock.findById(req.params.restockId);

    if (!restock) {
      return res.status(404).json({
        success: false,
        message: "Restock request not found",
      });
    }

    if (restock.status !== "requested") {
      return res.status(409).json({
        success: false,
        message: "Only pending restock requests can be cancelled",
      });
    }

    restock.status = "cancelled";
    await restock.save();

    return res.status(200).json({
      success: true,
      message: "Restock request cancelled successfully",
      restock,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};



module.exports = {
  requestRestock,
  confirmDelivery,
  getRestockRequests,
  cancelRestockRequest,
  cleanupOrphanedRestocks,
};
