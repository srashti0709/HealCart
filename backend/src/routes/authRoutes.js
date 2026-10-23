
const express = require("express");
const {
  authenticate,
  requireAdmin,
  createAdminToken,
  verifyAdminCredentials,
} = require("../middleware/auth");

const router = express.Router();

router.post("/admin/login", (req, res) => {
  const { username, password } = req.body || {};

  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    !verifyAdminCredentials(username, password)
  ) {
    return res.status(401).json({
      success: false,
      message: "Invalid admin credentials.",
    });
  }

  return res.json({
    success: true,
    token: createAdminToken(),
    role: "admin",
    expiresIn: 28800,
  });
});

router.get("/admin/me", authenticate, requireAdmin, (req, res) => {
  res.json({ success: true, role: "admin" });
});

module.exports = router;
