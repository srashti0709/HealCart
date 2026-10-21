
const express = require("express");
const router = express.Router();

const {
  requestRestock,
  confirmDelivery,
  getRestockRequests,
  cancelRestockRequest,
} = require("../controllers/restockController");

router.get("/", getRestockRequests);
router.post("/request", requestRestock);
router.post("/:restockId/confirm-delivery", confirmDelivery);
router.post("/:restockId/cancel", cancelRestockRequest);

module.exports = router;
