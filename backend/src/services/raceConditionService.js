const Product = require("../models/Product");
const Order = require("../models/Order");
const RaceConditionRun = require("../models/RaceConditionRun");
const { recordIncident } = require("./incidentService");

const recordRaceAttempt = async ({ runId, outcome }) => {
  if (!runId || !["reserved", "rejected"].includes(outcome)) return null;

  const now = new Date();
  const run = await RaceConditionRun.findOne({ runId });
  if (!run) return null;

  if (!run.firstAttemptAt) {
    await RaceConditionRun.updateOne(
      { runId, firstAttemptAt: null },
      { $set: { firstAttemptAt: now } }
    );
  }

  await RaceConditionRun.updateOne(
    { runId },
    {
      $inc: outcome === "reserved"
        ? { attemptCount: 1, successfulReservations: 1 }
        : { attemptCount: 1, rejectedAttempts: 1 },
      $set: {
        status: "recovering",
        lastAttemptAt: now,
        ...(outcome === "rejected" ? { conflictDetectedAt: now } : {}),
        message: outcome === "reserved"
          ? "One checkout reserved the final unit; waiting to verify the competing request."
          : "The competing checkout was rejected because the final unit was already reserved.",
      },
    }
  );

  return verifyRaceRun(runId);
};

const verifyRaceRun = async (runId) => {
  const run = await RaceConditionRun.findOne({ runId });
  if (!run) return null;

  const product = await Product.findById(run.product).lean();
  if (!product) {
    await RaceConditionRun.updateOne(
      { runId },
      { $set: { status: "failed", message: "Test product no longer exists." } }
    );
    return RaceConditionRun.findOne({ runId }).lean();
  }

  const orders = await Order.find({ "items.product": product._id })
    .select("paymentStatus orderStatus inventoryReserved items")
    .lean();

  const competingRequestsObserved = run.attemptCount >= 2 &&
    run.successfulReservations === 1 &&
    run.rejectedAttempts >= 1;

  if (!competingRequestsObserved) {
    return {
      ...run.toObject(),
      productStock: product.stock,
      orderCount: orders.length,
      verified: false,
    };
  }

  let consistent = orders.length === 1 && product.stock >= 0 && product.stock <= 1;
  if (consistent) {
    const order = orders[0];
    if (order.paymentStatus === "paid" && order.orderStatus === "placed") {
      consistent = product.stock === 0 && order.inventoryReserved === false;
    } else if (order.paymentStatus === "failed" && order.orderStatus === "cancelled") {
      consistent = product.stock === 1 && order.inventoryReserved === false;
    } else if (["pending", "unknown"].includes(order.paymentStatus) && order.inventoryReserved === true) {
      consistent = product.stock === 0;
    } else {
      consistent = false;
    }
  }

  const wasRecovered = run.status === "recovered";
  const now = new Date();
  const updated = await RaceConditionRun.findOneAndUpdate(
    { runId },
    {
      $set: {
        status: consistent ? "recovered" : "failed",
        stockAfterRecovery: product.stock,
        recoveryActionAt: run.recoveryActionAt || now,
        verifiedAt: consistent ? now : null,
        message: consistent
          ? "Race condition handled: one reservation was accepted, the competing checkout was rejected, and stock/order state is consistent."
          : "Verification failed: stock or order state does not match the expected single-item outcome.",
      },
    },
    { new: true }
  );

  await Product.updateOne(
    { _id: product._id },
    { $set: { raceFaultActive: false } }
  );

  if (!wasRecovered) {
    await recordIncident({
      incidentType: "last_item_race_condition",
      service: "inventory-service",
      severity: consistent ? "medium" : "critical",
      status: consistent ? "resolved" : "failed",
      message: "Two checkout attempts competed for the same final test item.",
      recoveryAction: "Disabled the injected race window and enforced conditional atomic stock reservation before payment.",
      recoveryResult: consistent
        ? `Verified one reservation, one rejected attempt, ${product.stock} unit(s) remaining, and ${orders.length} order.`
        : `Verification failed. Stock: ${product.stock}; matching orders: ${orders.length}.`,
      resolvedAt: consistent ? now : null,
    });
  }

  return {
    ...updated.toObject(),
    productStock: product.stock,
    orderCount: orders.length,
    verified: consistent,
  };
};

module.exports = { recordRaceAttempt, verifyRaceRun };
