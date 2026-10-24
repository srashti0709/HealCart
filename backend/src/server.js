const connectDB = require("./config/db");
const express = require("express");
const cors = require("cors");
require("dotenv").config();
const dns = require("dns");
const mongoose = require("mongoose");
const Product = require("./models/Product");
const app = express();
const orderRoutes = require("./routes/orderRoutes");
const cartRoutes = require("./routes/cartRoutes");
const incidentRoutes = require("./routes/incidentRoutes");
const productRoutes = require("./routes/productRoutes");
const restockRoutes = require("./routes/restockRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const experimentRoutes = require("./routes/experimentRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const authRoutes = require("./routes/authRoutes");
const PORT = process.env.PORT || 5000;
dns.setServers(["8.8.8.8", "8.8.4.4"]);
app.use(cors());
app.use(express.json());

const trafficBuckets = new Map();
const TRAFFIC_METRICS_WINDOW_SECONDS = 60;

app.use((req, res, next) => {
  if (
    !req.path.startsWith("/api/") ||
    req.path === "/api/metrics/traffic"
  ) {
    return next();
  }

  const startedAt = Date.now();
  const bucketTime = Math.floor(startedAt / 1000) * 1000;

  let bucket = trafficBuckets.get(bucketTime);

  if (!bucket) {
    bucket = {
      requests: 0,
      successful: 0,
      failed: 0,
      latencyTotalMs: 0,
      latencySamples: 0,
    };

    trafficBuckets.set(bucketTime, bucket);
  }

  bucket.requests += 1;

  res.on("finish", () => {
    if (res.statusCode >= 400) {
      bucket.failed += 1;
    } else {
      bucket.successful += 1;
    }

    bucket.latencyTotalMs += Date.now() - startedAt;
    bucket.latencySamples += 1;
  });

  next();
});

app.get("/api/metrics/traffic", (req, res) => {
  const now = Math.floor(Date.now() / 1000) * 1000;
  const oldestAllowed = now - TRAFFIC_METRICS_WINDOW_SECONDS * 1000;

  for (const timestamp of trafficBuckets.keys()) {
    if (timestamp < oldestAllowed) {
      trafficBuckets.delete(timestamp);
    }
  }

  const points = [];

  for (
    let offset = TRAFFIC_METRICS_WINDOW_SECONDS - 1;
    offset >= 0;
    offset -= 1
  ) {
    const timestamp = now - offset * 1000;
    const bucket = trafficBuckets.get(timestamp);

    points.push({
      timestamp: new Date(timestamp).toISOString(),
      requests: bucket?.requests ?? 0,
      successful: bucket?.successful ?? 0,
      failed: bucket?.failed ?? 0,
      avgLatencyMs:
        bucket && bucket.latencySamples > 0
          ? Math.round(
              bucket.latencyTotalMs / bucket.latencySamples
            )
          : 0,
    });
  }

  res.set("Cache-Control", "no-store");

  res.json({
    success: true,
    service: "backend",
    generatedAt: new Date().toISOString(),
    points,
  });
});


app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "SHCom backend is running",
  });
});

app.get("/api/health", (req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;

  res.status(databaseConnected ? 200 : 503).json({
    success: databaseConnected,
    service: "backend",
    status: databaseConnected ? "healthy" : "degraded",
    database: databaseConnected ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/chaos/db-check", async (req, res) => {
  try {
    const productCount = await Product.countDocuments();

    res.status(200).json({
      success: true,
      database: "connected",
      status: "healthy",
      productCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      database: "disconnected",
      status: "degraded",
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Local-only chaos testing endpoint
app.post("/api/chaos/crash", (req, res) => {
  if (process.env.CHAOS_TEST_MODE !== "true") {
    return res.status(403).json({
      success: false,
      message: "Chaos testing is disabled.",
    });
  }

  const token = req.get("x-chaos-token");

  if (!process.env.CHAOS_TEST_TOKEN ||
    token !== process.env.CHAOS_TEST_TOKEN) {
    return res.status(401).json({
      success: false,
      message: "Invalid chaos test token.",
    });
  }

  res.status(202).json({
    success: true,
    message: "Controlled backend crash scheduled.",
  });

  setTimeout(() => {
    console.error("[Chaos Test] Triggering controlled backend crash.");
    process.exit(1);
  }, 500);
});

app.post("/api/chaos/db-failure", async (req, res) => {
  if (process.env.CHAOS_TEST_MODE !== "true") {
    return res.status(403).json({
      success: false,
      message: "Chaos testing is disabled.",
    });
  }

  const token = req.get("x-chaos-token");

  if (!process.env.CHAOS_TEST_TOKEN ||
    token !== process.env.CHAOS_TEST_TOKEN) {
    return res.status(401).json({
      success: false,
      message: "Invalid chaos test token.",
    });
  }

  try {
    const startedAt = new Date().toISOString();

    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }

    res.status(202).json({
      success: true,
      scenario: "database-recovery",
      message: "Database disconnect simulated without deleting or modifying data.",
      database: "disconnected",
      status: "degraded",
      startedAt,
      timestamp: startedAt,
    });

    setTimeout(async () => {
      try {
        await connectDB();
        console.log("[Chaos Test] MongoDB reconnect completed after simulated outage.");
      } catch (error) {
        console.error("[Chaos Test] Reconnect after simulated outage failed:", error.message);
      }
    }, 1500);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

app.get("/api/chaos/inventory-audit", async (req, res) => {
  try {
    const products = await Product.find({})
      .select("_id name stock price")
      .lean();

    const issues = [];

    for (const product of products) {
      if (
        typeof product.stock !== "number" ||
        !Number.isFinite(product.stock) ||
        !Number.isInteger(product.stock) ||
        product.stock < 0
      ) {
        issues.push({
          type: "invalid-stock",
          productId: String(product._id),
          productName: product.name,
          stock: product.stock ?? null,
          message: "Product stock must be a non-negative integer.",
        });
      }

      if (
        typeof product.price !== "number" ||
        !Number.isFinite(product.price) ||
        product.price < 0
      ) {
        issues.push({
          type: "invalid-price",
          productId: String(product._id),
          productName: product.name,
          price: product.price ?? null,
          message: "Product price must be a valid non-negative number.",
        });
      }
    }

    res.status(200).json({
      success: true,
      scenario: "inventory-integrity",
      status: issues.length === 0 ? "healthy" : "issues-detected",
      readOnly: true,
      productsChecked: products.length,
      issueCount: issues.length,
      issues,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      scenario: "inventory-integrity",
      status: "audit-failed",
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/incidents", incidentRoutes);
app.use("/api/restocks", restockRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/experiments", experimentRoutes);
app.use("/api/notifications", notificationRoutes);

const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`SHCom backend running on port ${PORT}`);
  });
};

startServer().catch((error) => {
  console.error("[Startup] Backend failed to start:", error.message);
  process.exit(1);
});