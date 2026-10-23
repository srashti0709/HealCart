const Incident = require("../models/Incident");

/**
 * Records an incident. The incident history is the audit trail the recovery
 * phases close, so every entry keeps the detected and resolved timestamps.
 */
const recordIncident = async (data) => {
  try {
    await Incident.create(data);
  } catch (error) {
    console.error("Failed to record incident:", error.message);
  }
};

module.exports = { recordIncident };
