const express = require("express");
const { reconcilePaymentAttempts } = require("../services/paymentReconciliationService");
const { getPaymentAttemptStatus } = require("../controllers/paymentController");

const router = express.Router();

/**
 * Administrative operations use the same local shared secret the chaos
 * endpoints already use, so a batch reconciliation cannot be triggered by
 * any client that can reach the API.
 */
const requireAdminToken = (req, res, next) => {
  const configuredToken = process.env.CHAOS_TEST_TOKEN;

  if (!configuredToken) {
    return res.status(503).json({
      success: false,
      message: "Administrative operations are not configured on this server.",
    });
  }

  const providedToken = req.get("x-chaos-token");

  if (!providedToken || providedToken !== configuredToken) {
    return res.status(401).json({
      success: false,
      message: "A valid administrative token is required.",
    });
  }

  return next();
};

/**
 * Read-only status of one payment attempt.
 *
 * The handler is wrapped so the express `next` argument is never mistaken
 * for the dependency overrides the controller accepts.
 */
router.get("/attempts/:attemptId", (req, res) =>
  getPaymentAttemptStatus(req, res)
);

router.post("/reconcile", requireAdminToken, async (req, res) => {
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

module.exports = router;
