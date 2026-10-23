const express = require("express");
const { requireServiceToken } = require("../middleware/serviceToken");
const { record } = require("../controllers/internalNotificationController");

const router = express.Router();
router.post("/", requireServiceToken, record);

module.exports = router;
