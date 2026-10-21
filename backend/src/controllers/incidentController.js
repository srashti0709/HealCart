
const Incident = require("../models/Incident");

const getIncidents = async (req, res) => {
  try {
    const incidents = await Incident.find().sort({ detectedAt: -1 });

    res.status(200).json({
      success: true,
      count: incidents.length,
      incidents,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch incidents",
    });
  }
};

const createIncident = async (req, res) => {
  try {
    const {
      incidentType,
      service,
      severity,
      status,
      message,
      recoveryAction,
      recoveryResult,
    } = req.body;

    if (!incidentType || !service || !message) {
      return res.status(400).json({
        success: false,
        message: "incidentType, service, and message are required",
      });
    }

    const incident = await Incident.create({
      incidentType,
      service,
      severity,
      status,
      message,
      recoveryAction,
      recoveryResult,
      resolvedAt: status === "resolved" ? new Date() : null,
    });

    res.status(201).json({
      success: true,
      incident,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = { getIncidents, createIncident };
