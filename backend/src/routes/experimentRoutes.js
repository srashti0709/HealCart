const express = require("express");
const crypto = require("crypto");
const { authenticate, requireAdmin } = require("../middleware/auth");
const Product = require("../models/Product");
const RaceConditionRun = require("../models/RaceConditionRun");
const { verifyRaceRun } = require("../services/raceConditionService");

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

router.post("/last-item-race/prepare", async (req, res) => {
  let product;
  try {
    const runId = crypto.randomUUID();
    const faultInjectedAt = new Date();
    product = await Product.create({
      name: `Last-Item Race Test ${runId.slice(0, 6)}`,
      description: "Dedicated SHCom chaos-test item. Stock starts at exactly one. Open this product in two browser sessions and submit checkout close together.",
      price: 1,
      category: "Chaos Test",
      stock: 1,
      isRaceTestProduct: true,
      raceTestRunId: runId,
      raceFaultActive: true,
    });

    const run = await RaceConditionRun.create({
      runId,
      product: product._id,
      initialStock: 1,
      status: "ready",
      faultInjectedAt,
      message: "Controlled race window is active. Prepare two customer checkouts.",
    });

    return res.status(201).json({
      success: true,
      scenario: "last-item-race",
      message: "Race-condition fault injected. A dedicated one-stock test product is ready on the storefront.",
      run,
      product: {
        _id: product._id,
        name: product.name,
        price: product.price,
        stock: product.stock,
        category: product.category,
      },
      storefrontPath: `/user/products/${product._id}`,
    });
  } catch (error) {
    if (product?._id) await Product.findByIdAndDelete(product._id).catch(() => {});
    return res.status(500).json({
      success: false,
      scenario: "last-item-race",
      message: error.message || "Could not prepare the race-condition test.",
    });
  }
});

router.get("/last-item-race/:runId", async (req, res) => {
  try {
    const run = await verifyRaceRun(req.params.runId);
    if (!run) {
      return res.status(404).json({ success: false, message: "Race-condition run not found." });
    }

    const product = await Product.findById(run.product || run.productId).lean();
    return res.json({
      success: true,
      scenario: "last-item-race",
      run,
      product: product ? {
        _id: product._id,
        name: product.name,
        stock: product.stock,
        raceFaultActive: product.raceFaultActive,
      } : null,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      scenario: "last-item-race",
      message: error.message || "Could not read race-condition status.",
    });
  }
});

router.get("/history", (req, res) => sendForwarded(res, "/api/chaos/experiments/history"));
router.get("/active", (req, res) => sendForwarded(res, "/api/chaos/experiments/active"));
router.post("/run/:scenario", (req, res) => {
  if (!SCENARIOS.has(req.params.scenario)) return res.status(400).json({ success: false, message: "Unsupported experiment scenario." });
  return sendForwarded(res, `/api/chaos/${req.params.scenario}`, "POST", req.body || {});
});
router.post("/traffic/start", (req, res) => sendForwarded(res, "/api/chaos/traffic/start", "POST", req.body || {}));
router.post("/traffic/stop", (req, res) => sendForwarded(res, "/api/chaos/traffic/stop", "POST", {}));

module.exports = router;
