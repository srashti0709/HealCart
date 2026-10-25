
const express = require("express");
const router = express.Router();

const {
  getIncidents,
  createIncident,
} = require("../controllers/incidentController");

router.get("/", getIncidents);
router.post("/", createIncident);
router.delete("/payment-timeout", clearPaymentTimeoutIncidents);

module.exports = router;
