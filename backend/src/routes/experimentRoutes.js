const express = require("express");
const { authenticate, requireAdmin } = require("../middleware/auth");

const router = express.Router();
const CHAOS_URL = process.env.CHAOS_CONTROLLER_URL || "http://host.docker.internal:5003";
const SCENARIOS = new Set(["database-recovery", "backend-crash", "inventory-integrity"]);

const forward = async (path, method = "GET", body) => {
  const token = process.env.CHAOS_TEST_TOKEN;
  if (!token) throw Object.assign(new Error("Chaos controls are not configured."), { status: 503 });
  const response = await fetch(`${CHAOS_URL}${path}`, {
    method,
    headers: { "x-chaos-token": token, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(75_000),
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
};

const sendForwarded = async (res, path, method, body) => {
  try {
    const result = await forward(path, method, body);
    return res.status(result.status).json(result.payload);
  } catch (error) {
    return res.status(error.status || 503).json({ success: false, message: error.message || "Chaos controller unavailable." });
  }
};

router.use(authenticate, requireAdmin);
router.get("/history", (req, res) => sendForwarded(res, "/api/chaos/experiments/history"));
router.get("/active", (req, res) => sendForwarded(res, "/api/chaos/experiments/active"));
router.post("/run/:scenario", (req, res) => {
  if (!SCENARIOS.has(req.params.scenario)) return res.status(400).json({ success: false, message: "Unsupported experiment scenario." });
  return sendForwarded(res, `/api/chaos/${req.params.scenario}`, "POST", req.body || {});
});
router.post("/traffic/start", (req, res) => sendForwarded(res, "/api/chaos/traffic/start", "POST", req.body || {}));
router.post("/traffic/stop", (req, res) => sendForwarded(res, "/api/chaos/traffic/stop", "POST", {}));

module.exports = router;
