const mongoose = require("mongoose");

const raceConditionRunSchema = new mongoose.Schema(
  {
    runId: { type: String, required: true, unique: true, index: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    status: {
      type: String,
      enum: ["ready", "recovering", "recovered", "failed"],
      default: "ready",
    },
    initialStock: { type: Number, default: 1 },
    attemptCount: { type: Number, default: 0 },
    successfulReservations: { type: Number, default: 0 },
    rejectedAttempts: { type: Number, default: 0 },
    faultInjectedAt: { type: Date, default: Date.now },
    firstAttemptAt: { type: Date, default: null },
    lastAttemptAt: { type: Date, default: null },
    conflictDetectedAt: { type: Date, default: null },
    recoveryActionAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
    stockAfterRecovery: { type: Number, default: null },
    message: { type: String, default: "Test product prepared; waiting for two customer checkouts." },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RaceConditionRun", raceConditionRunSchema);
