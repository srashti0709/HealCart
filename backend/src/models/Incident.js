
const mongoose = require("mongoose");

const incidentSchema = new mongoose.Schema(
  {
    incidentType: {
      type: String,
      required: true,
      trim: true,
    },
    service: {
      type: String,
      required: true,
      trim: true,
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["detected", "recovering", "resolved", "failed"],
      default: "detected",
    },
    message: {
      type: String,
      required: true,
    },
    recoveryAction: {
      type: String,
      default: "",
    },
    recoveryResult: {
      type: String,
      default: "",
    },
    detectedAt: {
      type: Date,
      default: Date.now,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Incident", incidentSchema);
