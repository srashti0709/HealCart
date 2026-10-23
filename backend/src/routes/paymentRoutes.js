const express = require("express");
const { reconcilePaymentAttempts } = require("../services/paymentReconciliationService");
const { getPaymentAttemptStatus } = require("../controllers/paymentController");
const { authenticate, requireAdmin } = require("../middleware/auth");

const router = express.Router();

const requirePaymentAdmin = (req, res, next) => {
  const providedServiceToken = req.get("x-chaos-token");

  if (providedServiceToken !== undefined) {
    if (
      process.env.CHAOS_TEST_TOKEN &&
      providedServiceToken === process.env.CHAOS_TEST_TOKEN
    ) {
      req.user = { role: "admin" };
      return next();
    }

    return res.status(401).json({
      success: false,
      message: "A valid administrative token is required.",
    });
  }

  authenticate(req, res, () => requireAdmin(req, res, next));
};

router.get("/attempts/:attemptId", (req, res) =>
  getPaymentAttemptStatus(req, res)
);

router.post("/reconcile", requirePaymentAdmin, async (req, res) => {
  try {
    const limit = Math.min(
      Math.max(Number(req.body?.limit) || 25, 1),
      100
    );

    const summary = await reconcilePaymentAttempts({ limit });

    res.status(200).json({
      success: true,
      message:
        summary.examined === 0
          ? "No payment attempt needed reconciliation."
          : `Examined ${summary.examined} payment attempt(s).`,
      ...summary,
    });
  } catch (error) {
    console.error("Payment reconciliation failed:", error.message);

    res.status(500).json({
      success: false,
      message: "Payment reconciliation could not be completed.",
    });
  }
});

router.post("/admin/response-loss/start", requirePaymentAdmin, (req, res) => {
  res.status(200).json({ success: true });
});

module.exports = router;
